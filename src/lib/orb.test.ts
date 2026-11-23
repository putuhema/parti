import { describe, expect, it } from "vitest";
import { HAND, ORBS_TO_WIN, POOL, autoAct, cast, draw, ends, fits, fullSet, isBot, newGame, replaceWithBot, type OrbGame } from "../../convex/lib/orb/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** A tiny hand-built table: chain 3|5, a to play. */
function table(hands: Record<string, [number, number][]>, bog: [number, number][] = [[0, 0], [1, 2]]): OrbGame {
  const players = Object.keys(hands);
  return { seq: 0, players, hands, bog, chain: [{ a: 3, b: 5, by: "" }], orbs: Object.fromEntries(players.map((p) => [p, 0])), pool: POOL, turn: players[0], turnNo: 0, passes: 0, log: [] };
}

describe("orbwick", () => {
  it("deals a full double-six set with no tile lost", () => {
    expect(fullSet()).toHaveLength(28);
    const g = newGame(["a", "b"], 1, seeded(1), 0);
    expect(g.players).toHaveLength(3);
    for (const p of g.players) expect(g.hands[p]).toHaveLength(HAND);
    const all = [...g.players.flatMap((p) => g.hands[p]), ...g.bog, [g.chain[0].a, g.chain[0].b]];
    expect(new Set(all.map(([x, y]) => `${Math.min(x, y)}${Math.max(x, y)}`)).size).toBe(28);
    expect(g.chain[0].a).not.toBe(g.chain[0].b);
  });

  it("casts onto either end, flipping the tile to match", () => {
    const g = table({ a: [[1, 3], [5, 6]], b: [[2, 2]] });
    expect(fits(g, [1, 3])).toEqual(["L"]);
    expect(cast(g, "a", 0, "L", 0)).toBeNull();
    expect(ends(g)).toEqual({ L: 1, R: 5 });
    expect(g.turn).toBe("b");
    expect(cast(g, "a", 0, "R", 0)).toMatch(/turn/);
  });

  it("rejects a tile on an end it doesn't match", () => {
    const g = table({ a: [[1, 3]], b: [] });
    expect(cast(g, "a", 0, "R", 0)).toMatch(/match/);
  });

  it("a double claims an orb; three orbs win", () => {
    const g = table({ a: [[5, 5], [0, 4]], b: [[6, 6]] });
    cast(g, "a", 0, "R", 0);
    expect(g.orbs.a).toBe(1);
    expect(g.pool).toBe(POOL - 1);
    g.orbs.a = ORBS_TO_WIN - 1;
    g.turn = "a";
    g.hands.a = [[5, 5], [0, 4]];
    cast(g, "a", 0, "R", 0);
    expect(g.done).toEqual({ winner: "a", reason: "orbs" });
  });

  it("a lucky seven hexes the next wizard with a bog tile", () => {
    const g = table({ a: [[5, 2], [0, 0]], b: [[6, 6]] });
    cast(g, "a", 0, "R", 0);
    expect(g.hands.b).toHaveLength(2);
    expect(g.log.at(-1)).toMatchObject({ who: "a", hex: "b" });
  });

  it("casting your last tile wins", () => {
    const g = table({ a: [[5, 1]], b: [[6, 6]] });
    cast(g, "a", 0, "R", 0);
    expect(g.done).toEqual({ winner: "a", reason: "empty" });
  });

  it("drawing ends the turn; with an empty bog it's a pass, and all passing ends the duel", () => {
    const g = table({ a: [[0, 0]], b: [[6, 6], [1, 1]] }, [[2, 4]]);
    expect(draw(g, "a", 0)).toBeNull();
    expect(g.hands.a).toHaveLength(2);
    expect(g.turn).toBe("b");
    draw(g, "b", 0);
    expect(g.log.at(-1)?.kind).toBe("pass");
    draw(g, "a", 0);
    expect(g.done?.reason).toBe("blocked");
    expect(g.done?.winner).toBe("a"); // fewer pips left
  });

  it("won't let you pass on an empty bog while holding a fit", () => {
    const g = table({ a: [[5, 0]], b: [[6, 6]] }, []);
    expect(draw(g, "a", 0)).toMatch(/fits/);
  });

  it("plays 50 whole bot duels to an end", () => {
    for (let s = 1; s <= 50; s++) {
      const g = newGame([], 2 + (s % 2), seeded(s), 0);
      let guard = 500;
      while (!g.done && guard--) autoAct(g, 0);
      expect(g.done).toBeTruthy();
      expect(g.done?.winner).toBeTruthy();
    }
  });

  it("hands a leaving wizard's seat to a bot", () => {
    const g = newGame(["a", "b"], 0, seeded(3), 0);
    const hand = g.hands.a;
    replaceWithBot(g, "a");
    expect(g.players).not.toContain("a");
    const bot = g.players.find(isBot)!;
    expect(g.hands[bot]).toEqual(hand);
  });
});
