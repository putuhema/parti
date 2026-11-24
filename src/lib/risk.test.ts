import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { CONTINENT_LIST, TERRITORIES, TERRITORY_IDS, isAdjacent, type TerritoryId } from "../../convex/lib/risk/map";
import {
  BLITZ_GOAL,
  attack,
  botStep,
  continentBonusOf,
  deploy,
  endTurn,
  findValidSet,
  fortify,
  isValidCardSet,
  leaveGame,
  newGame,
  nextTradeBonus,
  occupy,
  onDeadline,
  reachableOwned,
  territoriesOf,
  toFortify,
  tradeCards,
  turnReinforcements,
  type Seat,
} from "../../convex/lib/risk/rules";

const P1 = "p1" as Id<"players">;
const P2 = "p2" as Id<"players">;
const P3 = "p3" as Id<"players">;

function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("risk world map", () => {
  it("has 24 territories across 6 continents with symmetric borders and full connectivity", () => {
    expect(TERRITORY_IDS).toHaveLength(24);
    expect(CONTINENT_LIST).toHaveLength(6);

    // Every territory appears in exactly one continent
    const seen = new Set<TerritoryId>();
    for (const c of CONTINENT_LIST) {
      for (const t of c.territories) {
        expect(seen.has(t)).toBe(false);
        expect(TERRITORIES[t].continent).toBe(c.id);
        seen.add(t);
      }
    }
    expect(seen.size).toBe(TERRITORY_IDS.length);

    // Symmetric borders
    for (const id of TERRITORY_IDS) {
      for (const nb of TERRITORIES[id].neighbors) {
        expect(nb).not.toBe(id);
        expect(isAdjacent(nb, id)).toBe(true);
      }
    }

    // Connected graph from Alaska
    const visited = new Set<TerritoryId>(["alaska"]);
    const q: TerritoryId[] = ["alaska"];
    while (q.length) {
      const cur = q.shift()!;
      for (const nb of TERRITORIES[cur].neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          q.push(nb);
        }
      }
    }
    expect(visited.size).toBe(TERRITORY_IDS.length);
  });
});

describe("risk rules engine", () => {
  it("deals territories evenly, calculates continent bonuses, and deploys into attack phase", () => {
    const g = newGame([P1, P2, P3], "domination", 1000, 0, seeded(7));
    expect(territoriesOf(g, P1)).toHaveLength(8);
    expect(territoriesOf(g, P2)).toHaveLength(8);
    expect(territoriesOf(g, P3)).toHaveLength(8);
    expect(g.phase).toBe("deploy");
    expect(g.reinforce).toBe(turnReinforcements(g, P1));

    // Give P1 full South America and verify +2 bonus
    for (const t of ["colombia", "brazil", "argentina"] as TerritoryId[]) g.owners[t] = P1;
    expect(continentBonusOf(g, P1)).toBeGreaterThanOrEqual(2);

    const target = territoriesOf(g, P1)[0];
    const before = g.troops[target];
    const pool = g.reinforce;
    deploy(g, target, pool, 1500);
    expect(g.troops[target]).toBe(before + pool);
    expect(g.reinforce).toBe(0);
    expect(g.phase).toBe("attack");
  });

  it("resolves combat dice (ties to defender), captures territory, enters occupy, and awards a Risk card", () => {
    const g = newGame([P1, P2], "domination", 1000, 0, seeded(12));
    // Set up deterministic border battle: alaska (P1, 8 troops) -> canada (P2, 1 troop)
    g.owners.alaska = P1;
    g.troops.alaska = 8;
    g.owners.canada = P2;
    g.troops.canada = 1;
    g.reinforce = 0;
    g.phase = "attack";

    // Force high attacker roll (6s) and low defender roll (1)
    let call = 0;
    const biased = () => (call++ < 3 ? 0.99 : 0.01);
    attack(g, "alaska", "canada", false, biased, 2000);

    expect(g.owners.canada).toBe(P1);
    expect(g.lastBattle?.captured).toBe(true);
    expect(g.phase).toBe("occupy");
    expect(g.pendingOccupy).toEqual({ from: "alaska", to: "canada", min: 3, max: 7 });

    occupy(g, 5, 2500);
    expect(g.troops.alaska).toBe(3);
    expect(g.troops.canada).toBe(5);
    expect(g.phase).toBe("attack");
    expect(g.conqueredThisTurn).toBe(true);

    // Ending turn awards 1 Risk card because P1 conquered this turn
    endTurn(g, seeded(3), 3000);
    expect(g.cards[P1]).toHaveLength(1);
    expect(g.turn).toBe(P2);
  });

  it("fortifies across connected owned territories and blocks disconnected paths", () => {
    const g = newGame([P1, P2], "domination", 1000, 0, seeded(99));
    for (const id of TERRITORY_IDS) {
      g.owners[id] = P2;
      g.troops[id] = 2;
    }
    g.owners.alaska = P1;
    g.troops.alaska = 5;
    g.owners.canada = P1;
    g.troops.canada = 1;
    g.owners.usa = P1;
    g.troops.usa = 1;
    g.owners.australia = P1; // disconnected island
    g.troops.australia = 1;

    g.reinforce = 0;
    g.phase = "attack";
    toFortify(g, 2000);

    expect(reachableOwned(g, P1, "alaska")).toContain("usa");
    expect(reachableOwned(g, P1, "alaska")).not.toContain("australia");

    expect(() => fortify(g, "alaska", "australia", 2, seeded(1), 2500)).toThrow();
    fortify(g, "alaska", "usa", 3, seeded(1), 2500);
    expect(g.troops.alaska).toBe(2);
    expect(g.troops.usa).toBe(4);
    expect(g.turn).toBe(P2);
  });

  it("validates and trades Risk card sets with escalating troop bonuses", () => {
    const g = newGame([P1, P2], "domination", 1000, 0, seeded(5));
    g.cards[P1] = [
      { id: 1, kind: "infantry", territory: territoriesOf(g, P1)[0] },
      { id: 2, kind: "cavalry" },
      { id: 3, kind: "artillery" },
    ];
    expect(isValidCardSet(g.cards[P1])).toBe(true);
    expect(findValidSet(g.cards[P1])).toEqual([1, 2, 3]);
    expect(nextTradeBonus(0)).toBe(4);
    expect(nextTradeBonus(1)).toBe(6);

    const beforeReinforce = g.reinforce;
    const ownedTerr = territoriesOf(g, P1)[0];
    const beforeTerrTroops = g.troops[ownedTerr];

    tradeCards(g, [1, 2, 3], 2000);
    expect(g.cards[P1]).toHaveLength(0);
    expect(g.reinforce).toBe(beforeReinforce + 4);
    expect(g.troops[ownedTerr]).toBe(beforeTerrTroops + 2); // +2 territory match bonus
    expect(g.tradesDone).toBe(1);
  });

  it("triggers Blitz victory as soon as a player holds 15 territories", () => {
    const g = newGame([P1, P2], "blitz", 1000, 0, seeded(11));
    for (const id of TERRITORY_IDS) {
      g.owners[id] = P2;
      g.troops[id] = 1;
    }
    const first14 = TERRITORY_IDS.slice(0, BLITZ_GOAL - 1);
    for (const id of first14) g.owners[id] = P1;
    g.owners.alaska = P1;
    g.troops.alaska = 12;
    const enemy = TERRITORIES.alaska.neighbors.find((n) => g.owners[n] === P2) ?? "japan";
    g.owners[enemy] = P2;
    g.troops[enemy] = 1;
    g.reinforce = 0;
    g.phase = "attack";

    let rollIdx = 0;
    const winRoll = () => (rollIdx++ % 4 < 3 ? 0.99 : 0.01);
    attack(g, "alaska", enemy, true, winRoll, 2000);
    expect(g.done?.reason).toBe("blitz");
    expect(g.done?.winners).toEqual([P1]);
  });

  it("AI bots play complete Blitz games cleanly to a winner", () => {
    const bots: Seat[] = ["bot:0", "bot:1", "bot:2"];
    const rand = seeded(12345);
    const g = newGame(bots, "blitz", 1000, 0, rand);
    let steps = 0;
    while (!g.done && steps < 600) {
      botStep(g, rand, 1000 + steps * 500);
      steps++;
    }
    expect(g.done).toBeDefined();
    expect(g.done!.winners.length).toBeGreaterThanOrEqual(1);
  });

  it("handles human timeout and leavers gracefully without stalling", () => {
    const rand = seeded(77);
    const g = newGame([P1, P2, "bot:0"], "blitz", 1000, 0, rand);
    onDeadline(g, rand, 100_000);
    expect(g.turn).toBe(P2);

    leaveGame(g, P2, rand, 101_000);
    expect(g.out).toContain(P2);
    expect(g.done).toBeUndefined();

    // If last human leaves, game finishes cleanly
    leaveGame(g, P1, rand, 102_000);
    expect(g.done).toBeDefined();
  });
});
