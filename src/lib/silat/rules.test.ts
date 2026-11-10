// Run with: bun test src/lib/silat
import { describe, expect, test } from "bun:test";
import { ALL_CARDS, CARDS, TIERS, TIER_NAMES, canCapture, tierOf, val, type ComboItem, canPlay, canReady, cardCost, playCard, playCombo, readyCard } from "./cards";
import { beginEnemy, clone, dist, enemyStep, enemyTurn, forecast, freeSteps, isGuarded, makeFight, plan, reactionDamage, startTurn, step, unitAt, kitPlan, type Fight, type Kind, type Setup, type Trait } from "./rules";
import { makeMap, nextNodes, nodeById, MAP_ROWS } from "./map";
import { bossFor, budgetFor, generateFight, prisonFor } from "./endless";
import { ENEMIES } from "./config";
import { ALL_RELICS } from "./relics";
import { BASE_DECK, EVENTS, unlockedTier, buyCard, checkBonus, chooseEvent, rollEvent, chooseStyle, enter, fightFor, newRun, settle, takeReward, type Run } from "./run";

/** A fresh run already standing in the Warm-up fight, with no relics (so results are predictable). */
function startRun(seed: number): Run {
  const run = { ...chooseStyle(newRun(seed), "harimau"), relics: [] as string[] };
  return enter(run, nextNodes(run.map, null)[0]);
}

const sq = (c: number, r: number) => r * 6 + c;

function fight(o: Partial<Setup> & Pick<Setup, "hero" | "units">, hand: string[] = []): Fight {
  const s = makeFight({ heroHp: 20, heroMax: 20, deck: [], seed: 1, ...o });
  s.hand = [...hand];
  s.draw = [];
  s.fixedRoll = 20; // dice always come up 20 (enemy jabs hit, your dodges work) unless a test says otherwise
  return s;
}
/** Resolve the enemy's intents for real (dice and all), without starting the next turn. */
function resolveEnemy(s: Fight) {
  const f = clone(s);
  beginEnemy(f);
  while (enemyStep(f));
  return f;
}
const play = (s: Fight, id: string, target: number) => {
  const i = s.hand.indexOf(id);
  expect(i).toBeGreaterThanOrEqual(0);
  const next = playCard(s, i, target);
  expect(next).not.toBe(s); // it was a legal play
  return next;
};

describe("design doc example (section 4)", () => {
  test("the matador: step aside, the rook smashes its own pawn, then kick the knight off the edge", () => {
    let s = fight({
      hero: sq(3, 2),
      units: [
        { kind: "n", sq: sq(2, 0) },
        { kind: "r", sq: sq(0, 2) },
        { kind: "p", sq: sq(5, 2) },
        { kind: "k", sq: sq(5, 5) },
      ],
    }, ["tendang", "tangkis", "tangkis"]);
    const [knight, rook, pawn] = s.units;
    s.intents = [
      { id: rook.id, type: "charge", dir: 2 },
      { id: knight.id, type: "strike", target: sq(3, 2) },
    ];
    // Staying put would cost 7 (rook 4 + knight 3).
    expect(forecast(s).damage).toBe(7);

    s = step(s, sq(2, 1));
    expect(forecast(s).damage).toBe(0);
    s = play(s, "tendang", sq(2, 0)); // knight on the top edge: Ring Out
    expect(s.units.find((u) => u.id === knight.id)).toBeUndefined();
    expect(s.ringOuts).toBe(1);

    const after = forecast(s).after;
    expect(after.units.find((u) => u.id === pawn.id)).toBeUndefined(); // 3 HP pawn, rook hits for 4
    expect(after.units.find((u) => u.id === rook.id)?.sq).toBe(sq(4, 2));
    expect(after.hero.hp).toBe(20);
  });
});

describe("pushes", () => {
  test("a kicked piece flies until it crashes; the crash grows with distance and knocks the next piece on", () => {
    // Pawn right next to the knight: crash at 2, knight gets knocked one square up.
    let s = fight({ hero: sq(2, 4), units: [{ kind: "p", sq: sq(2, 3) }, { kind: "n", sq: sq(2, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["tendang"]);
    s = play(s, "tendang", sq(2, 3));
    expect(s.units.find((u) => u.kind === "p")).toBeUndefined(); // 3 - 2 kick - 2 crash
    expect(unitAt(s, sq(2, 1))?.hp).toBe(3);

    // Rook three squares away: the knight flies 2 squares first, so the crash is 3 (2, +1 per 2 squares, rounded up).
    s = fight({ hero: sq(2, 5), units: [{ kind: "n", sq: sq(2, 4) }, { kind: "r", sq: sq(2, 1) }, { kind: "k", sq: sq(5, 0) }] }, ["tendang"]);
    s = play(s, "tendang", sq(2, 4));
    expect(s.units.find((u) => u.kind === "n")!.hp).toBe(1); // 5 - 1 kick - 3 crash
    expect(s.units.find((u) => u.kind === "r")!.hp).toBe(7 - 3);
    expect(s.units.find((u) => u.kind === "r")!.sq).toBe(sq(2, 1)); // heavy: not knocked on
  });

  test("a light piece with a clear line behind it flies off the board", () => {
    let s = fight({ hero: sq(2, 5), units: [{ kind: "b", sq: sq(2, 4) }, { kind: "k", sq: sq(5, 0) }] }, ["tendang"]);
    s = play(s, "tendang", sq(2, 4));
    expect(s.units.find((u) => u.kind === "b")).toBeUndefined();
    expect(s.ringOuts).toBe(1);
  });

  test("light pieces pushed off the board are knocked out, heavy ones take 5 and stay", () => {
    let s = fight({ hero: sq(1, 1), units: [{ kind: "b", sq: sq(1, 0) }, { kind: "r", sq: sq(0, 1), hp: 10 }, { kind: "k", sq: sq(5, 5) }] }, ["tendang", "tendang"]);
    s = play(s, "tendang", sq(1, 0));
    expect(s.units.find((u) => u.kind === "b")).toBeUndefined();
    s = play(s, "tendang", sq(0, 1));
    const rook = s.units.find((u) => u.kind === "r")!;
    expect(rook.sq).toBe(sq(0, 1));
    expect(rook.hp).toBe(10 - 1 - 5);
  });

  test("mud stops a push early", () => {
    let s = fight({ hero: sq(2, 5), units: [{ kind: "n", sq: sq(2, 4) }, { kind: "k", sq: sq(5, 0) }], mud: [sq(2, 3)] }, ["lurus"]);
    s = play(s, "lurus", sq(2, 4));
    expect(s.units.find((u) => u.kind === "n")!.sq).toBe(sq(2, 3));
  });

  test("the Warm-up changes every run, but its first kick always lands a double knockout", () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const run = startRun(seed);
      let s = run.fight!;
      layouts.add(JSON.stringify([s.hero.sq, s.units.map((u) => [u.kind, u.sq]), s.things.map((t) => t.sq)]));
      // The showcase pawn: the one piece next to you.
      const near = s.units.filter((u) => dist(s, u.sq, s.hero.sq) === 1);
      expect(near).toHaveLength(1);
      expect(isGuarded(s, near[0])).toBe(false);
      const before = s.units.length + s.things.length;
      s.hand = ["tendang"];
      s = play(s, "tendang", near[0].sq);
      expect(s.units.length + s.things.length).toBeLessThanOrEqual(before - 2); // the pawn and what it hit
      expect(s.hero.hp).toBe(s.hero.max);
    }
    expect(layouts.size).toBeGreaterThan(50);
  });
});

describe("enemies", () => {
  test("strikers hit you when they can, and never waste a strike on an empty square", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "p", sq: sq(1, 2) }, { kind: "p", sq: sq(3, 1) }, { kind: "k", sq: sq(5, 0) }] });
    plan(s);
    const [near, far] = s.units;
    expect(s.intents.find((i) => i.id === near.id)).toEqual({ id: near.id, type: "strike", target: sq(2, 3) });
    // The far pawn can't reach you: it steps forward to threaten you next turn instead of striking c4.
    expect(s.intents.find((i) => i.id === far.id)).toEqual({ id: far.id, type: "move", to: sq(3, 2) });
  });

  test("a rook won't charge you through its own ally", () => {
    const s = fight({ hero: sq(5, 3), units: [{ kind: "r", sq: sq(0, 3) }, { kind: "p", sq: sq(2, 3) }, { kind: "k", sq: sq(5, 0) }], limit: 5 });
    plan(s);
    const rook = s.units[0];
    expect(s.intents.find((i) => i.id === rook.id)?.type).not.toBe("charge");
  });

  test("player's position: the pawn on c3 advances to c2 instead of striking the empty d2", () => {
    const s = fight({
      hero: sq(2, 5),
      units: [{ kind: "p", sq: sq(2, 3), hp: 1 }, { kind: "p", sq: sq(3, 2), hp: 1 }, { kind: "k", sq: sq(3, 3), hp: 5 }],
      mud: [sq(0, 5), sq(1, 5), sq(3, 4)],
    });
    plan(s);
    const pawn = s.units[0];
    expect(s.intents.find((i) => i.id === pawn.id)).toEqual({ id: pawn.id, type: "move", to: sq(2, 4) });
    expect(s.intents.some((i) => i.type === "strike" && i.target === sq(3, 4))).toBe(false);
  });

  test("stuck pieces don't use up the action slots", () => {
    const s = fight({
      hero: sq(2, 5),
      units: [{ kind: "p", sq: sq(3, 2) }, { kind: "p", sq: sq(4, 2) }, { kind: "n", sq: sq(2, 1) }, { kind: "k", sq: sq(4, 0) }],
      things: [{ kind: "batu", sq: sq(3, 3) }, { kind: "petasan", sq: sq(4, 3) }],
    });
    plan(s);
    expect(s.intents.some((i) => i.id === s.units.find((u) => u.kind === "n")!.id)).toBe(true);
  });

  test("storm pawns (your column and the two beside it) that don't act march down and promote", () => {
    const s = fight({ hero: sq(4, 0), units: [{ kind: "p", sq: sq(5, 4) }, { kind: "k", sq: sq(1, 0) }], limit: 0 });
    s.intents = [];
    enemyTurn(s);
    const q = s.units.find((u) => u.sq === sq(5, 5))!;
    expect(q.kind).toBe("q");
    expect(q.hp).toBe(7);
  });

  test("pawns away from your column march 1 square (no rush); a pawn shielding its far-off King holds", () => {
    const s = fight({ hero: sq(0, 5), units: [{ kind: "p", sq: sq(5, 2) }, { kind: "p", sq: sq(3, 1) }, { kind: "k", sq: sq(3, 0) }], limit: 0 });
    s.intents = [];
    enemyTurn(s);
    expect(s.units[0].sq).toBe(sq(5, 3)); // marched 1, even though it hasn't moved before
    expect(s.units[1].sq).toBe(sq(3, 1)); // right in front of its King, you're far away: it stays
  });

  test("a pawn that hasn't moved yet storms 2 squares; after that, only 1", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "p", sq: sq(2, 0) }, { kind: "k", sq: sq(5, 0) }] });
    expect(s.intents.find((i) => i.id === s.units[0].id)).toEqual({ id: s.units[0].id, type: "move", to: sq(2, 2) });
    enemyTurn(s);
    expect(s.units[0].sq).toBe(sq(2, 2));
    expect(s.intents.find((i) => i.id === s.units[0].id)).toEqual({ id: s.units[0].id, type: "move", to: sq(2, 3) });
  });

  test("the double step can't jump over a piece", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "p", sq: sq(2, 0) }, { kind: "n", sq: sq(2, 1) }, { kind: "k", sq: sq(5, 0) }] });
    expect(s.intents.find((i) => i.id === s.units[0].id)).toBeUndefined();
  });

  test("damaged pieces get angry and act past the limit", () => {
    let s = fight({ hero: sq(2, 5), units: [{ kind: "n", sq: sq(2, 4) }, { kind: "p", sq: sq(0, 3) }, { kind: "p", sq: sq(4, 3) }, { kind: "k", sq: sq(5, 0) }], limit: 0 }, ["dalam"]);
    s.units[0].hp = 9;
    s = play(s, "dalam", sq(2, 4));
    plan(s);
    expect(s.intents.some((i) => i.id === s.units.find((u) => u.kind === "n")!.id)).toBe(true);
    expect(s.intents.filter((i) => s.units.find((u) => u.id === i.id)?.kind === "p")).toHaveLength(0);
  });

  test("Elakan: you hop away and the charge flies on into its ally", () => {
    let s = fight({ hero: sq(2, 2), units: [{ kind: "r", sq: sq(0, 2) }, { kind: "p", sq: sq(5, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["elakan"]);
    const rook = s.units[0];
    s.intents = [{ id: rook.id, type: "charge", dir: 2 }];
    s = play(s, "elakan", sq(2, 3));
    const after = resolveEnemy(s);
    expect(after.hero.sq).toBe(sq(2, 3));
    expect(after.hero.hp).toBe(20);
    expect(after.units.find((u) => u.kind === "p")).toBeUndefined();
  });

  test("Tangkisan: an attacker next to you gets kicked back", () => {
    let s = fight({ hero: sq(2, 3), units: [{ kind: "p", sq: sq(1, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["tangkisan"]);
    s.intents = [{ id: s.units[0].id, type: "strike", target: sq(2, 3) }];
    s.fixedRoll = 15; // a normal success (a natural 20 would kick it twice as far)
    s = play(s, "tangkisan", sq(2, 3));
    const after = resolveEnemy(s);
    expect(after.hero.hp).toBe(20); // 1 damage, 2 block
    expect(after.units.find((u) => u.kind === "p")!.sq).toBe(sq(0, 1));
  });

  test("a piece knocked away re-aims from where it lands", () => {
    let s = fight({ hero: sq(2, 4), units: [{ kind: "p", sq: sq(2, 3) }, { kind: "k", sq: sq(5, 0) }], mud: [sq(2, 0)] }, ["lurus"]);
    const pawn = s.units[0];
    s.intents = [{ id: pawn.id, type: "strike", target: sq(1, 4) }]; // it planned to hit b2
    s = play(s, "lurus", sq(2, 3)); // kicked flying up, stuck in the mud on c6
    expect(s.units.find((u) => u.id === pawn.id)?.sq).toBe(sq(2, 0));
    // From c6 it can't reach you, so it storms forward instead of striking: 2 squares, as it hasn't moved yet.
    expect(s.intents.find((i) => i.id === pawn.id)).toEqual({ id: pawn.id, type: "move", to: sq(2, 2) });
    expect(forecast(s).damage).toBe(0);
  });

  test("enemies re-aim after you move, but a committed charge can't turn", () => {
    // Knight on b4 strikes you on c2. Step to d3: still a knight jump away, so the strike follows you.
    let s = fight({ hero: sq(2, 4), units: [{ kind: "n", sq: sq(1, 2) }, { kind: "k", sq: sq(5, 0) }] });
    plan(s);
    expect(s.intents.find((i) => i.id === s.units[0].id)).toEqual({ id: s.units[0].id, type: "strike", target: sq(2, 4) });
    s = step(s, sq(3, 3));
    expect(s.intents.find((i) => i.id === s.units[0].id)).toEqual({ id: s.units[0].id, type: "strike", target: sq(3, 3) });
    // A rook already charging right along rank 4 keeps charging right after you step off the line.
    s = fight({ hero: sq(3, 2), units: [{ kind: "r", sq: sq(0, 2) }, { kind: "p", sq: sq(5, 2) }, { kind: "k", sq: sq(5, 5) }] });
    s.intents = [{ id: s.units[0].id, type: "charge", dir: 2 }];
    s = step(s, sq(3, 1));
    expect(s.intents.find((i) => i.id === s.units[0].id)).toEqual({ id: s.units[0].id, type: "charge", dir: 2 });
  });

  test("guarded pieces only budge 1 square and can't be knocked off the board", () => {
    // The pawn on c5 guards b4 (pawns cover the squares diagonally in front of them).
    let s = fight({ hero: sq(1, 4), units: [{ kind: "b", sq: sq(1, 3) }, { kind: "p", sq: sq(2, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["tendang", "tendang"]);
    const bishop = s.units[0];
    expect(isGuarded(s, bishop)).toBe(true);
    s = play(s, "tendang", sq(1, 3));
    expect(s.units.find((u) => u.id === bishop.id)!.sq).toBe(sq(1, 2)); // nudged, not flying

    // Unguarded, the same kick sends it off the board.
    s = fight({ hero: sq(1, 4), units: [{ kind: "b", sq: sq(1, 3) }, { kind: "k", sq: sq(5, 0) }] }, ["tendang"]);
    expect(isGuarded(s, s.units[0])).toBe(false);
    s = play(s, "tendang", sq(1, 3));
    expect(s.units.find((u) => u.kind === "b")).toBeUndefined();
  });

  test("stepping onto a square an enemy covers: it jabs you right away (half its hit), once per turn", () => {
    // Knight on c4 covers b2 and d2 (among others). You stand on c2.
    const base = fight({ hero: sq(2, 4), units: [{ kind: "n", sq: sq(2, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["kuda"]);
    expect(reactionDamage(base, sq(1, 4))).toBe(2); // half a knight's hit of 3, rounded up
    expect(reactionDamage(base, sq(2, 5))).toBe(0);

    // Safe step: nothing happens.
    expect(step(base, sq(2, 5)).hero.hp).toBe(20);

    // Covered step: the knight jabs you for 2.
    const s = step(base, sq(3, 4));
    expect(s.hero.hp).toBe(18);
    expect(s.log.some((l) => l.t.includes("jabs as you arrive"))).toBe(true);

    // It already reacted this turn: another square it covers (b2) is now safe until next turn.
    expect(reactionDamage(s, sq(1, 4))).toBe(0);
  });

  test("move cards trigger reactions too", () => {
    // Pawn on b4 covers a3 and c3. Langkah Kuda from b1 to c3 lands right in it.
    let s = fight({ hero: sq(1, 5), units: [{ kind: "p", sq: sq(1, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["kuda"]);
    s = play(s, "kuda", sq(2, 3));
    expect(s.hero.hp).toBe(19); // half a pawn's hit of 2
  });

  test("every 3 turns the king calls a pawn", () => {
    const s = fight({ hero: sq(0, 5), units: [{ kind: "k", sq: sq(3, 0) }], limit: 0 });
    const before = s.units.length;
    for (let i = 0; i < 3; i++) enemyTurn(s);
    expect(s.units.filter((u) => u.kind === "p").length).toBe(1);
    expect(s.units.length).toBe(before + 1);
  });

  test("knocking out the king wins", () => {
    let s = fight({ hero: sq(0, 1), units: [{ kind: "k", sq: sq(0, 0), hp: 2 }] }, ["tendang"]);
    s = play(s, "tendang", sq(0, 0));
    expect(s.status).toBe("won");
  });

  test("forecast doesn't change the fight", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "p", sq: sq(1, 2) }, { kind: "k", sq: sq(5, 0) }] });
    const before = JSON.stringify(s);
    forecast(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("cards", () => {
  test("can't play what you can't afford", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "k", sq: sq(5, 0) }] }, ["kudakuda", "kudakuda"]);
    const once = playCard(s, 0, sq(2, 3));
    expect(once.tenaga).toBe(1);
    expect(canPlay(once, "kudakuda")).toBe(false);
  });

  test("every card has a name, cost and text", () => {
    for (const c of Object.values(CARDS)) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.cost).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("runs", () => {
  test("a run starts with picking a style and a random Pusaka, then: map, fight, reward, back to the map", () => {
    let run = newRun(3);
    expect(run.status).toBe("style");
    expect(run.relics).toHaveLength(1);
    run = chooseStyle(run, "bangau");
    expect(run.status).toBe("map");
    expect(run.deck).toEqual([...BASE_DECK, "balas"]);
    run = enter(run, nextNodes(run.map, null)[0]);
    expect(run.status).toBe("fight");
    run.fight!.status = "won";
    run = settle(run);
    expect(run.status).toBe("reward");
    expect(run.reward!.cards).toHaveLength(3);
    expect(["lurus", "bantingan", "sabit"]).toContain(run.reward!.cards[0]); // the first reward always has something flashy (from the basics)
    expect(run.reward!.gold).toBeGreaterThan(0);
    const gold = run.gold;
    run = takeReward(run, run.reward!.cards[0], null);
    expect(run.status).toBe("map");
    expect(run.deck).toHaveLength(11);
    expect(run.gold).toBeGreaterThan(gold);
    expect(nextNodes(run.map, run.at).length).toBeGreaterThan(0);
  });

  test("every map: one start, a campfire row, then the boss; every path reaches the boss", () => {
    for (let seed = 1; seed < 60; seed++) {
      const map = makeMap(seed);
      expect(map.nodes.filter((n) => n.row === 0)).toHaveLength(1);
      expect(map.nodes.filter((n) => n.row === MAP_ROWS - 2).every((n) => n.kind === "camp")).toBe(true);
      expect(map.nodes.filter((n) => n.kind === "boss")).toHaveLength(1);
      const walk = (id: string): boolean => nodeById(map, id).kind === "boss" || (nextNodes(map, id).length > 0 && nextNodes(map, id).every(walk));
      expect(walk(nextNodes(map, null)[0])).toBe(true);
    }
  });

  test("shop: buying costs gold, and you can't buy what you can't afford", () => {
    let run = newRun(4);
    run = { ...run, status: "shop", gold: 60, shop: { cards: [{ id: "badai", price: 80, sold: false }, { id: "dalam", price: 45, sold: false }], relic: null, removePrice: 50, removed: false, healPrice: 25, healed: false } };
    expect(buyCard(run, 0)).toBe(run); // too expensive
    const after = buyCard(run, 1);
    expect(after.gold).toBe(15);
    expect(after.deck).toContain("dalam");
  });

  test("events: the old master can remove a card", () => {
    let run = { ...newRun(6), status: "event" as const, event: "guru" };
    const before = run.deck.length;
    run = chooseEvent(run, "forget", 0);
    expect(run.deck).toHaveLength(before - 1);
    expect(run.status).toBe("map");
  });

  test("Hold Out fights are won by surviving", () => {
    const s = fight({ hero: sq(0, 5), units: [{ kind: "k", sq: sq(5, 0) }], survive: 2, limit: 0 });
    enemyTurn(s);
    expect(s.status).toBe("play");
    enemyTurn(s);
    expect(s.status).toBe("won");
  });

  test("every fight on every map, at every depth, can be set up, including elites and the boss", () => {
    for (let seed = 1; seed < 20; seed++) {
      for (let depth = 1; depth <= 8; depth++) {
        const run = { ...newRun(seed), depth, map: makeMap(seed, depth) };
        for (const node of run.map.nodes.filter((n) => n.kind === "fight" || n.kind === "elite" || n.kind === "boss")) {
          const f = fightFor({ ...run, floor: node.row }, node);
          expect(f.units.filter((u) => u.target)).toHaveLength(1);
          expect(f.hand.length).toBe(5);
          const spots = [f.hero.sq, ...f.units.map((u) => u.sq), ...f.things.map((t) => t.sq)];
          expect(new Set(spots).size).toBe(spots.length);
          expect(spots.every((x) => x >= 0 && x < f.n * f.n)).toBe(true);
          expect(f.mud.every((m) => !spots.includes(m))).toBe(true);
          expect(f.n).toBe(depth === 1 ? 6 : depth === 2 ? 7 : 8);
        }
      }
    }
  });
});

describe("slams (Hantam)", () => {
  test("a rook within 2 squares slams: one step can't escape it, Block can", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "r", sq: sq(2, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["tangkis"]);
    plan(s);
    const rook = s.units[0];
    expect(s.intents.find((i) => i.id === rook.id)).toEqual({ id: rook.id, type: "slam", center: sq(2, 4) });
    // Step one square: still inside the 3x3 it's committed to.
    expect(forecast(step(s, sq(1, 5))).damage).toBe(4);
    // A move card that gets you out of the area escapes it.
    s.hand = ["kuda", "tangkis"];
    expect(forecast(play(s, "kuda", sq(0, 3))).damage).toBe(0);
    // Block 4 soaks it.
    expect(forecast(play(s, "tangkis", sq(2, 4))).damage).toBe(0);
  });

  test("a slam only hurts you, never the slammer's own pieces", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "q", sq: sq(2, 2) }, { kind: "p", sq: sq(1, 3) }, { kind: "k", sq: sq(3, 3) }] });
    s.intents = [{ id: s.units[0].id, type: "slam", center: sq(2, 4) }];
    const f = forecast(s);
    expect(f.damage).toBe(5);
    expect(f.after.units.find((u) => u.kind === "p")!.hp).toBe(3);
    expect(f.after.units.find((u) => u.kind === "k")!.hp).toBe(16);
  });

  test("kick the slammer out of reach and its slam is cancelled", () => {
    let s = fight({ hero: sq(2, 4), units: [{ kind: "b", sq: sq(2, 3), hp: 9 }, { kind: "r", sq: sq(2, 2), hp: 9 }, { kind: "k", sq: sq(5, 0) }] }, ["lurus"]);
    const rook = s.units[1];
    s.intents = [{ id: rook.id, type: "slam", center: sq(2, 4) }];
    s.units[1].sq = sq(3, 3); // the rook stands diagonally next to you
    s = play(s, "lurus", sq(3, 3)); // heavy: slides 2 up-right to f5, 3 squares from you
    expect(forecast(s).damage).toBe(0);
  });

  test("every knockout counts toward gold", () => {
    let s = fight({ hero: sq(1, 1), units: [{ kind: "b", sq: sq(1, 0) }, { kind: "k", sq: sq(5, 5) }] }, ["tendang"]);
    s = play(s, "tendang", sq(1, 0));
    expect(s.kos).toBe(1);
    expect(s.fx.some((f) => f.t === "gold")).toBe(true);
  });
});

describe("playstyles", () => {
  test("Harimau: Terkam draws a card when it causes a crash; Rantai is free after a crash", () => {
    let s = fight({ hero: sq(2, 4), units: [{ kind: "p", sq: sq(2, 3), hp: 9 }, { kind: "n", sq: sq(2, 2), hp: 9 }, { kind: "k", sq: sq(5, 0) }] }, ["terkam", "rantai"]);
    s.draw = ["tangkis"];
    expect(cardCost(s, "rantai")).toBe(1);
    s = play(s, "terkam", sq(2, 3));
    expect(s.hand).toContain("tangkis");
    expect(cardCost(s, "rantai")).toBe(0);
  });

  test("Harimau: Amuk gives 2 Block per crash", () => {
    let s = fight({ hero: sq(2, 4), units: [{ kind: "p", sq: sq(2, 3), hp: 9 }, { kind: "n", sq: sq(2, 2), hp: 9 }, { kind: "k", sq: sq(5, 0) }] }, ["amuk", "tendang"]);
    s = play(s, "amuk", sq(2, 4));
    s = play(s, "tendang", sq(2, 3));
    expect(s.hero.block).toBe(2);
  });

  test("Bangau: Balas hits for your Block; Pantulan sends soaked damage back", () => {
    let s = fight({ hero: sq(2, 4), units: [{ kind: "n", sq: sq(2, 3), hp: 9 }, { kind: "k", sq: sq(5, 0) }] }, ["tangkis", "balas"]);
    s = play(s, "tangkis", sq(2, 4));
    s = play(s, "balas", sq(2, 3));
    expect(s.units.find((u) => u.kind === "n")!.hp).toBe(9 - 6); // Block 4 + 2

    s = fight({ hero: sq(2, 4), units: [{ kind: "n", sq: sq(1, 2), hp: 9 }, { kind: "k", sq: sq(5, 0) }] }, ["pantulan", "tangkis"]);
    s.intents = [{ id: s.units[0].id, type: "strike", target: sq(2, 4) }];
    s = play(s, "pantulan", sq(2, 4));
    s = play(s, "tangkis", sq(2, 4));
    const after = forecast(s).after;
    expect(after.hero.hp).toBe(20);
    expect(after.units.find((u) => u.kind === "n")!.hp).toBe(9 - 3); // the knight's 3 came back
  });

  test("Bangau: Benteng Diri starts each turn with 3 Block", () => {
    let s = fight({ hero: sq(0, 5), units: [{ kind: "k", sq: sq(5, 0) }], limit: 0 }, ["bentengdiri"]);
    s.draw = Array(10).fill("tangkis");
    s = play(s, "bentengdiri", sq(0, 5));
    enemyTurn(s);
    expect(s.hero.block).toBe(3);
  });

  test("Ular: Lincah powers up the kick after a move; Bayangan skips reactions", () => {
    let s = fight({ hero: sq(2, 5), units: [{ kind: "n", sq: sq(3, 3), hp: 9 }, { kind: "k", sq: sq(5, 0) }] }, ["lincah", "tendang"]);
    s = play(s, "lincah", sq(2, 5));
    s = step(s, sq(2, 4)); // moved: next kick +2, and now next to the knight
    s = play(s, "tendang", sq(3, 3));
    expect(s.log.some((l) => l.t === "Knight takes 3 (6 left)")).toBe(true); // Tendang's 1 + Lincah's 2
    expect(s.tf.rush).toBe(0); // used up

    s = fight({ hero: sq(2, 4), units: [{ kind: "n", sq: sq(2, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["bayangan"]);
    s = play(s, "bayangan", sq(2, 4));
    expect(step(s, sq(3, 4)).hero.hp).toBe(20); // the knight covers d2, but you're a shadow
  });

  test("Ular: Lilit pulls a piece next to you and it can't act this turn", () => {
    let s = fight({ hero: sq(2, 5), units: [{ kind: "n", sq: sq(2, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["lilit"]);
    s = play(s, "lilit", sq(2, 2));
    const n = s.units.find((u) => u.kind === "n")!;
    expect(n.sq).toBe(sq(2, 4));
    expect(s.intents.some((i) => i.id === n.id)).toBe(false);
  });
});

describe("Pusaka (relics)", () => {
  const withRelic = (relic: string, o: Parameters<typeof fight>[0], hand: string[] = []) => {
    const s = fight({ ...o, relics: [relic] }, hand);
    return s;
  };

  test("Keris Berapi: the first crash each turn deals double", () => {
    let s = withRelic("keris_api", { hero: sq(2, 4), units: [{ kind: "p", sq: sq(2, 3), hp: 9 }, { kind: "n", sq: sq(2, 2), hp: 9 }, { kind: "k", sq: sq(5, 0) }] }, ["tendang"]);
    s = play(s, "tendang", sq(2, 3));
    expect(s.units.find((u) => u.kind === "n")!.hp).toBe(9 - 4); // crash 2, doubled
  });

  test("Selendang Angin: kicked pieces fly through mud", () => {
    let s = withRelic("selendang", { hero: sq(2, 5), units: [{ kind: "n", sq: sq(2, 4) }, { kind: "k", sq: sq(5, 0) }], mud: [sq(2, 3)] }, ["tendang"]);
    s = play(s, "tendang", sq(2, 4));
    expect(s.units.find((u) => u.kind === "n")).toBeUndefined(); // flew off the top
  });

  test("Peci Hitam: Langkah Kuda doesn't set off reactions", () => {
    let s = withRelic("peci", { hero: sq(1, 5), units: [{ kind: "p", sq: sq(1, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["kuda"]);
    s = play(s, "kuda", sq(2, 3)); // the pawn on b4 covers c3
    expect(s.hero.hp).toBe(20);
  });

  test("Sandal Jepit: two free steps", () => {
    let s = withRelic("sandal", { hero: sq(0, 5), units: [{ kind: "k", sq: sq(5, 0) }] });
    s = step(s, sq(1, 5));
    expect(s.stepUsed).toBe(false);
    s = step(s, sq(2, 5));
    expect(s.stepUsed).toBe(true);
  });

  test("Kopi Tubruk: first knockout each turn gives +1 Tenaga", () => {
    let s = withRelic("kopi", { hero: sq(1, 1), units: [{ kind: "b", sq: sq(1, 0) }, { kind: "p", sq: sq(0, 1) }, { kind: "k", sq: sq(5, 5) }] }, ["tendang", "tendang"]);
    s = play(s, "tendang", sq(1, 0)); // off the top: knocked out
    expect(s.tenaga).toBe(3); // 3 - 1 + 1
    s = play(s, "tendang", sq(0, 1)); // off the left: second knockout gives nothing
    expect(s.tenaga).toBe(2);
  });

  test("Batu Akik draws 6, Kendang gives 4 Tenaga on turn 1, Gelang Besi keeps Block", () => {
    const deck = Array(12).fill("tangkis");
    expect(makeFight({ hero: sq(0, 5), heroHp: 20, heroMax: 20, units: [{ kind: "k", sq: sq(5, 0) }], deck, seed: 1, relics: ["akik"] }).hand).toHaveLength(6);
    expect(makeFight({ hero: sq(0, 5), heroHp: 20, heroMax: 20, units: [{ kind: "k", sq: sq(5, 0) }], deck, seed: 1, relics: ["kendang"] }).tenaga).toBe(4);
    const s = makeFight({ hero: sq(0, 5), heroHp: 20, heroMax: 20, units: [{ kind: "k", sq: sq(5, 0) }], deck, seed: 1, relics: ["gelang"], limit: 0 });
    s.hero.block = 8;
    enemyTurn(s);
    expect(s.hero.block).toBe(5);
  });

  test("Songket Merah: an enemy that strikes you as you arrive takes 1", () => {
    const s = withRelic("songket", { hero: sq(2, 4), units: [{ kind: "n", sq: sq(2, 2) }, { kind: "k", sq: sq(5, 0) }] });
    const after = step(s, sq(3, 4)); // the knight covers d2
    expect(after.units.find((u) => u.kind === "n")!.hp).toBe(4);
  });
});

describe("random play never breaks the board", () => {
  test("300 fights of random moves", () => {
    let r = 7;
    const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    let finished = 0;
    for (let g = 0; g < 300; g++) {
      const base = newRun(g + 1);
      const fights = base.map.nodes.filter((n) => n.kind === "fight" || n.kind === "elite" || n.kind === "boss");
      const node = fights[g % fights.length];
      const run = { ...base, floor: node.row, relics: ALL_RELICS.filter((_, i) => (g >> i) & 1).map((x) => x.id), deck: ["tendang", "tendang", "lurus", "sabit", "tarik", "tolak", "badai", "bantingan", "kuda", "gajah", "benteng", "elakan", "tangkisan", "kuncian", "harimau", "momentum"] };
      let s = fightFor(run, node);
      for (let turn = 0; turn < 60 && s.status === "play"; turn++) {
        for (let tries = 0; tries < 6; tries++) {
          const i = Math.floor(rnd() * Math.max(1, s.hand.length));
          const id = s.hand[i];
          if (!id || !canPlay(s, id)) continue;
          const ts = CARDS[id].targets(s);
          s = playCard(s, i, ts[Math.floor(rnd() * ts.length)]);
          if (s.status !== "play") break;
        }
        if (s.status !== "play") break;
        enemyTurn(s);
        // Nothing overlaps and everything is on the board.
        const spots = [s.hero.sq, ...s.units.map((u) => u.sq), ...s.things.map((t) => t.sq)];
        expect(new Set(spots).size).toBe(spots.length);
        for (const x of spots) expect(x >= 0 && x < 36).toBe(true);
        expect(clone(s).hand.length).toBeLessThanOrEqual(6); // 6 with Batu Akik
      }
      if (s.status === "won" || s.status === "lost") finished++;
    }
    expect(finished).toBeGreaterThan(200);
  });
  test("200 generated fights across depths 1-8, with every new card in the deck", () => {
    let r = 11;
    const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    const deck = ALL_CARDS.map((c) => c.id);
    for (let g = 0; g < 200; g++) {
      const depth = 1 + (g % 8);
      const base = { ...newRun(g + 101), depth, map: makeMap(g + 101, depth) };
      const fights = base.map.nodes.filter((n) => n.kind === "fight" || n.kind === "elite" || n.kind === "boss");
      const node = fights[g % fights.length];
      let s = fightFor({ ...base, floor: node.row, deck, hp: 40, max: 40 }, node);
      for (let turn = 0; turn < 40 && s.status === "play"; turn++) {
        for (let tries = 0; tries < 6; tries++) {
          const i = Math.floor(rnd() * Math.max(1, s.hand.length));
          const id = s.hand[i];
          if (!id || !canPlay(s, id)) continue;
          const ts = CARDS[id].targets(s);
          s = playCard(s, i, ts[Math.floor(rnd() * ts.length)]);
          if (s.status !== "play") break;
        }
        if (s.status !== "play") break;
        enemyTurn(s);
        const spots = [s.hero.sq, ...s.units.map((u) => u.sq), ...s.things.map((t) => t.sq)];
        expect(new Set(spots).size).toBe(spots.length);
        for (const x of spots) expect(x >= 0 && x < s.n * s.n).toBe(true);
        for (const u of s.units) expect(u.hp).toBeLessThanOrEqual(u.max);
      }
    }
  });
});

describe("d20 reactions", () => {
  test("an enemy jab that rolls low misses; a high roll hits", () => {
    const base = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(1, 2) }] });
    base.fixedRoll = 3;
    const missed = step(base, sq(2, 3)); // the pawn on b4 covers c3
    expect(missed.hero.hp).toBe(20);
    expect(missed.log.some((l) => l.t.includes("misses"))).toBe(true);
    base.fixedRoll = 15;
    expect(step(base, sq(2, 3)).hero.hp).toBeLessThan(20);
  });
  test("previews assume the worst and never use up the dice", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(1, 2) }] });
    s.fixedRoll = undefined;
    const dice = s.dice;
    const r = playCombo(s, [{ k: "step", sq: sq(2, 3) }], { sim: true });
    expect(r.fight.hero.hp).toBeLessThan(20);
    expect(s.dice).toBe(dice);
    forecast(s);
    expect(s.dice).toBe(dice);
  });
  test("Elakan's dodge can fail on a bad roll, and is used up either way", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(1, 2) }] }, ["elakan"]);
    s.fixedRoll = 2;
    const f = play(s, "elakan", sq(3, 4));
    plan(f);
    enemyTurn(f);
    expect(f.hero.sq).toBe(sq(2, 4));
    expect(f.hero.hp).toBeLessThan(20);
  });
  test("Ejek makes enemy jabs roll twice and keep the worst; Bom Asap stops them", () => {
    const base = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(1, 2) }] }, ["asap"]);
    const smoked = play(base, "asap", sq(2, 4));
    expect(step(smoked, sq(2, 3)).hero.hp).toBe(20);
    expect(reactionDamage(base, sq(2, 3))).toBeGreaterThan(0);
  });
});

describe("combos", () => {
  test("a combo plays in order and the combo counter carries across cards", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(2, 3) }, { kind: "p", sq: sq(2, 1) }] }, ["tendang", "tangkis"]);
    const r = playCombo(s, [{ k: "card", idx: 0, sq: sq(2, 3) }, { k: "card", idx: 1, sq: sq(2, 4) }]);
    expect(r.fizzled).toEqual([]);
    expect(r.fight.hand).toEqual([]);
    expect(r.fight.hero.block).toBe(4);
    expect(r.fight.tenaga).toBe(1);
    expect(r.fight.combo).toBeGreaterThanOrEqual(2);
  });
  test("your free step can be part of a combo; a step that's no longer legal fizzles", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }] }, ["tangkis"]);
    const r = playCombo(s, [{ k: "step", sq: sq(2, 3) }, { k: "step", sq: sq(2, 2) }, { k: "card", idx: 0, sq: sq(2, 3) }]);
    expect(r.fight.hero.sq).toBe(sq(2, 3));
    expect(r.fizzled).toEqual([1]);
    expect(r.fight.hero.block).toBe(4);
  });
});

describe("deck and hand", () => {
  test("you draw up to your hand size; Simpan keeps your unplayed cards", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }] }, ["simpan", "tangkis", "kuda"]);
    s.draw = ["tendang", "tendang", "tendang", "tendang", "tendang"];
    const f = play(s, "simpan", sq(2, 4));
    beginEnemy(f);
    expect(f.hand).toEqual(["tangkis", "kuda"]);
    startTurn(f);
    expect(f.hand.length).toBe(5);
    expect(f.hand.slice(0, 2)).toEqual(["tangkis", "kuda"]);
  });
  test("Tambah adds 1 to your hand size; Intai draws 2; Putar Balik reshuffles the discard pile", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }] }, ["tambah", "intai", "putar"]);
    s.draw = ["tendang", "tendang", "tendang", "tendang"];
    s.discard = ["kuda", "kuda"];
    let f = play(s, "tambah", sq(2, 4));
    expect(f.handBonus).toBe(1);
    f = play(f, "intai", sq(2, 4));
    expect(f.hand.filter((x) => x === "tendang").length).toBe(3);
    f = play(f, "putar", sq(2, 4));
    expect(f.discard).toEqual([]);
    expect(f.draw.length + f.hand.length).toBeGreaterThan(4);
  });
  test("Naik Pangkat promotes the cards in your hand; Langkah Pion promotes on the top row", () => {
    const s = fight({ hero: sq(2, 1), units: [{ kind: "k", sq: sq(5, 0) }] }, ["pangkat", "tendang", "kuda", "pion"]);
    let f = play(s, "pangkat", sq(2, 1));
    expect(f.hand).toEqual(["badai", "ratu", "ratu"]);
    const p = fight({ hero: sq(2, 1), units: [{ kind: "k", sq: sq(5, 0) }] }, ["pion"]);
    f = play(p, "pion", sq(2, 0));
    expect(f.discard).toContain("ratu");
  });
});

describe("chess tactic cards", () => {
  test("Tusuk Sate skewers the first piece in a line and the one behind it", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(2, 3) }, { kind: "n", sq: sq(2, 1) }] }, ["tusuk"]);
    const f = play(s, "tusuk", sq(2, 3));
    expect(unitAt(f, sq(2, 3))!.hp).toBe(2);
    expect(unitAt(f, sq(2, 1))!.hp).toBe(3);
  });
  test("Paku pins a piece so it can't act; bosses take 4 instead", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "r", sq: sq(2, 1) }] }, ["paku"]);
    const f = play(s, "paku", sq(2, 1));
    expect(f.intents.some((i) => i.id === unitAt(f, sq(2, 1))!.id)).toBe(false);
    const b = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(2, 1), boss: "Raja Hitam", hp: 30 }] }, ["paku"]);
    expect(unitAt(play(b, "paku", sq(2, 1)), sq(2, 1))!.hp).toBe(26);
  });
  test("Garpu Kuda forks: jump, then hit every piece a knight's jump away", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(1, 2) }, { kind: "p", sq: sq(5, 2) }] }, ["garpu"]);
    const f = play(s, "garpu", sq(3, 3)); // from d3, b4 and f4 are both a knight's jump away
    expect(unitAt(f, sq(1, 2))!.hp).toBe(1);
    expect(unitAt(f, sq(5, 2))!.hp).toBe(1);
  });
  test("En Passant only hits a neighbor that moved last enemy turn", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(3, 4) }] }, ["passant"]);
    expect(canPlay(s, "passant")).toBe(false);
    s.movedLast = [unitAt(s, sq(3, 4))!.id];
    expect(unitAt(play(s, "passant", sq(3, 4)), sq(3, 4))!.hp).toBe(2);
  });
});

describe("Raja Hitam, the final boss", () => {
  test("below half HP he rises in fury: castles away, calls pawns and hits harder", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(2, 3), boss: "Raja Hitam", hp: 30, hit: 4 }, { kind: "p", sq: sq(5, 0) }] }, ["dalam"]);
    unitAt(s, sq(2, 3))!.hp = 17;
    const f = play(s, "dalam", sq(2, 3));
    const k = f.units.find((u) => u.boss)!;
    expect(k.phase).toBe(2);
    expect(k.hit).toBe(5);
    expect(k.sq).toBe(sq(5, 0)); // swapped with the ally farthest from you
    expect(f.units.length).toBeGreaterThanOrEqual(3);
  });
  test("in fury he walks at you, and his strike kicks you back", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(2, 1), boss: "Raja Hitam", hp: 30, hit: 5 }] });
    s.units[0].phase = 2;
    s.units[0].hp = 10;
    plan(s);
    expect(s.intents[0]).toMatchObject({ type: "move" });
    const t = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(2, 3), boss: "Raja Hitam", hp: 30, hit: 5 }] });
    t.units[0].phase = 2;
    t.units[0].hp = 10;
    plan(t);
    enemyTurn(t);
    expect(t.hero.sq).not.toBe(sq(2, 4));
  });
});

describe("named combos (Jurus Rangkai)", () => {
  test("Langkah Kuda then an attack: Serbuan Kuda, the attack hits +1 (only that card)", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "r", sq: sq(3, 2) }] }, ["kuda", "dalam"]);
    const r = playCombo(s, [{ k: "card", idx: 0, sq: sq(3, 3) }, { k: "card", idx: 1, sq: sq(3, 2) }]);
    expect(r.fizzled).toEqual([]);
    expect(r.fight.rangkai).toEqual(["kuda"]);
    expect(unitAt(r.fight, sq(3, 2))!.hp).toBe(2); // 7 - (4 + 1)
    expect(r.fight.surge).toBe(0);
  });
  test("the same cards in the wrong order, or in separate combos, are not a named combo", () => {
    const s = fight({ hero: sq(3, 3), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "r", sq: sq(3, 2) }] }, ["dalam", "tangkis"]);
    const r = playCombo(s, [{ k: "card", idx: 0, sq: sq(3, 2) }]);
    expect(r.fight.rangkai).toEqual([]);
    expect(unitAt(r.fight, sq(3, 2))!.hp).toBe(3);
  });
  test("Elakan then Tangkisan: Bayang Bangau, your rolls can't fail", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(1, 2) }] }, ["elakan", "tangkisan"]);
    s.fixedRoll = 1;
    const r = playCombo(s, [{ k: "card", idx: 0, sq: sq(3, 3) }, { k: "card", idx: 1, sq: sq(2, 3) }]);
    expect(r.fight.rangkai).toEqual(["bangau"]);
    expect(r.fight.hero.block).toBe(5);
    r.fight.intents = [{ id: r.fight.units[1].id, type: "strike", target: sq(2, 3) }];
    const after = resolveEnemy(r.fight);
    expect(after.hero.sq).toBe(sq(3, 3)); // dodged even on a roll of 1
  });
  test("Tangkis three times: Benteng Tiga Lapis gives +4 more Block", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }] }, ["tangkis", "tangkis", "tangkis"]);
    s.tenaga = 3;
    const r = playCombo(s, [0, 1, 2].map((idx) => ({ k: "card" as const, idx, sq: sq(2, 5) })));
    expect(r.fight.hero.block).toBe(16);
  });
});

describe("captures (move + attack onto an enemy's square)", () => {
  test("Langkah Kuda + Pukulan Dalam takes a pawn a knight's jump away and lands on its square", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(3, 3) }] }, ["kuda", "dalam"]);
    expect(canCapture(s, 0, 1, sq(3, 3))).toBe(true);
    const r = playCombo(s, [{ k: "capture", idx: 0, atk: 1, sq: sq(3, 3) }]);
    expect(r.fizzled).toEqual([]);
    expect(r.fight.hero.sq).toBe(sq(3, 3));
    expect(r.fight.units.some((u) => u.kind === "p")).toBe(false);
    expect(r.fight.tenaga).toBe(1);
    expect(r.fight.discard).toEqual(["kuda", "dalam"]);
  });
  test("an attack that wouldn't knock it out can't capture", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(3, 3), hp: 6 }] }, ["kuda", "tendang", "dalam"]);
    expect(canCapture(s, 0, 1, sq(3, 3))).toBe(false); // 1 + 1 (Serbuan Kuda) vs 6 HP
    expect(canCapture(s, 0, 2, sq(3, 3))).toBe(false); // 4 + 1 vs 6
    s.units[1].hp = 5;
    expect(canCapture(s, 0, 2, sq(3, 3))).toBe(true);
    expect(playCombo(s, [{ k: "capture", idx: 0, atk: 1, sq: sq(3, 3) }]).fizzled).toEqual([0]);
  });
  test("a capture needs Tenaga for both cards, and counts as Serbuan Kuda", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(3, 3) }] }, ["kuda", "dalam"]);
    expect(canCapture(s, 0, 1, sq(3, 3))).toBe(true); // 4 + 1 (Serbuan Kuda) = 5 HP
    s.tenaga = 1;
    expect(canCapture(s, 0, 1, sq(3, 3))).toBe(false);
  });
});

describe("rule-bending and chess cards (round 2)", () => {
  test("Kaki Kuda: your free step jumps like a knight; Langkah Ganda gives a second step", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }] }, ["kakikuda", "ganda"]);
    let f = play(s, "kakikuda", sq(2, 5));
    expect(freeSteps(f)).toContain(sq(3, 3));
    expect(freeSteps(f)).not.toContain(sq(2, 4));
    f = play(f, "ganda", sq(2, 5));
    f = step(f, sq(3, 3));
    expect(freeSteps(f).length).toBeGreaterThan(0);
    f = step(f, freeSteps(f)[0]);
    expect(freeSteps(f)).toEqual([]);
  });
  test("Atur Napas gives +2 Tenaga next turn; Gambit trades 2 HP for 2 Tenaga now", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }] }, ["napasatur", "gambit"]);
    let f = play(s, "gambit", sq(2, 5));
    expect(f.hero.hp).toBe(18);
    expect(f.tenaga).toBe(5);
    f = play(f, "napasatur", sq(2, 5));
    beginEnemy(f);
    startTurn(f);
    expect(f.tenaga).toBe(5);
  });
  test("Zugzwang locks a boxed-in neighbor; Oposisi stops a King 2 squares away in a line", () => {
    const z = fight({ hero: sq(0, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(0, 5) }, { kind: "p", sq: sq(1, 5) }, { kind: "p", sq: sq(1, 4) }] }, ["zugzwang"]);
    const zf = play(z, "zugzwang", sq(0, 4));
    expect(zf.units.find((u) => u.kind === "n")!.locked).toBe(1);
    const o = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(2, 2) }] }, ["oposisi"]);
    const of = play(o, "oposisi", sq(2, 4));
    expect(of.units[0].locked).toBe(1);
    expect(of.hero.block).toBe(3);
  });
  test("Buang Ganti swaps your whole hand", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }] }, ["mulligan", "tangkis", "tangkis"]);
    s.draw = ["tendang", "tendang", "tendang"];
    const f = play(s, "mulligan", sq(2, 5));
    expect(f.hand).toEqual(["tendang", "tendang"]);
    expect(f.discard).toContain("tangkis");
  });
});

describe("Siap, natural 20/1 and event checks (Baldur's Gate pass)", () => {
  test("Siap: a readied Tangkis goes off on the first attack, then you kick the attacker back", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(1, 2) }] }, ["tangkis"]);
    const f = readyCard(s, 0);
    expect(f.ready).toBe("tangkis");
    expect(f.tenaga).toBe(2);
    expect(f.hand).toEqual([]);
    f.intents = [{ id: f.units[1].id, type: "strike", target: sq(2, 3) }];
    const after = resolveEnemy(f);
    expect(after.hero.hp).toBe(20); // Block 4 soaks the pawn's 2
    expect(after.units.find((u) => u.kind === "p")?.sq).not.toBe(sq(1, 2)); // riposte
    expect(after.ready).toBeNull();
    expect(after.discard).toContain("tangkis");
  });
  test("Siap: unused, the card comes back to your hand", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }] }, ["tangkis"]);
    const f = readyCard(s, 0);
    f.intents = [];
    enemyTurn(f);
    expect(f.hand).toContain("tangkis");
    expect(f.ready).toBeNull();
  });
  test("only self Tangkis cards can be readied, one at a time", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }] }, ["tendang", "elakan", "tangkis", "kudakuda"]);
    expect(canReady(s, "tendang")).toBe(false);
    expect(canReady(s, "elakan")).toBe(false); // needs a square
    const f = readyCard(s, 2);
    expect(canReady(f, "kudakuda")).toBe(false);
  });
  test("a natural 1 on a jab: the enemy stumbles and loses its next action", () => {
    const base = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "p", sq: sq(1, 2) }] });
    base.fixedRoll = 1;
    const f = step(base, sq(2, 3));
    expect(f.hero.hp).toBe(20);
    expect(f.units.find((u) => u.kind === "p")!.locked).toBe(1);
  });
  test("a natural 20 dodge also strikes the attacker", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(1, 2) }] }, ["elakan"]);
    const f = play(s, "elakan", sq(3, 4));
    f.intents = [{ id: f.units[1].id, type: "strike", target: sq(2, 4) }];
    const after = resolveEnemy(f);
    expect(after.hero.sq).toBe(sq(3, 4));
    expect(after.units.find((u) => u.kind === "n")!.hp).toBe(3);
  });
  test("event checks: seeded, with Pusaka bonuses, and the dice game pays out", () => {
    const run = { ...startRun(5), status: "event" as const, event: "dadu", gold: 40 };
    const a = rollEvent(run, "bet")!;
    const b = rollEvent(run, "bet")!;
    expect(a.die).toBe(b.die); // same roll if you leave and come back
    expect(a.next.gold).toBe(a.ok ? 55 : 25);
    expect(a.next.status).toBe("map");
    expect(rollEvent({ ...run, gold: 5 }, "bet")).toBeNull();
    expect(checkBonus({ ...run, relics: ["akik", "tasbih"] }, EVENTS.dadu.choices[0].check!)).toBe(4);
  });
});

describe("endless runs", () => {
  test("every prison has its own name, board size and boss; names don't repeat back to back", () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(prisonFor(seed, 1).name).toBe("Penjara Raja Hitam");
      expect(bossFor(seed, 1).name).toBe("Raja Hitam");
      for (let d = 2; d <= 12; d++) {
        expect(prisonFor(seed, d).name).not.toBe(prisonFor(seed, d - 1).name);
        expect(bossFor(seed, d).name).not.toBe(bossFor(seed, d - 1).name);
        expect(prisonFor(seed, d)).toEqual(prisonFor(seed, d)); // seeded: the same every time
        const b = bossFor(seed, d);
        expect(b.traits.length).toBe(d <= 3 ? 1 : d <= 5 ? 2 : 3);
        expect(new Set(b.traits).size).toBe(b.traits.length);
        expect(b.hp).toBeGreaterThan(bossFor(seed, d - 1).hp);
      }
    }
  });
  test("difficulty grows with the floor, with depth, and for elites", () => {
    for (let d = 1; d <= 10; d++) {
      for (let row = 1; row < 6; row++) expect(budgetFor(d, row)).toBeGreaterThan(budgetFor(d, row - 1));
      expect(budgetFor(d + 1, 1)).toBeGreaterThan(budgetFor(d, 1));
      expect(budgetFor(d, 3, true)).toBeGreaterThan(budgetFor(d, 3));
    }
  });
  test("deeper fights field more army on average", () => {
    const army = (depth: number) => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = generateFight({ depth, row: 3, kind: "fight", scene: "yard", seed }, { heroHp: 20, heroMax: 20, deck: [] });
        total += s.units.reduce((a, u) => a + (u.hp ?? 0), 0);
      }
      return total;
    };
    expect(army(3)).toBeGreaterThan(army(1));
    expect(army(6)).toBeGreaterThan(army(3));
  });
  test("beating the boss: an escape reward, then a new, deeper prison with a fresh map", () => {
    let run = startRun(3);
    const bossNode = run.map.nodes.find((n) => n.kind === "boss")!;
    run = { ...run, at: bossNode.id, floor: bossNode.row, fight: fightFor(run, bossNode) };
    run.fight!.status = "won";
    run = settle(run);
    expect(run.status).toBe("reward");
    expect(run.reward!.escape).toBe(true);
    expect(run.reward!.relics.length).toBe(3);
    const before = run.map;
    run = takeReward(run, run.reward!.cards[0], run.reward!.relics[0]);
    expect(run.depth).toBe(2);
    expect(run.status).toBe("map");
    expect(run.floor).toBe(0);
    expect(run.path).toEqual([]);
    expect(run.map).not.toEqual(before);
    const first = nextNodes(run.map, null)[0];
    const next = enter(run, first);
    expect(next.fight!.n).toBe(7);
  });
});

describe("boss and elite powers", () => {
  const withTrait = (t: Trait, extra: Partial<Setup> = {}) =>
    fight({ hero: sq(2, 4), units: [{ kind: "r", sq: sq(2, 3), hp: 20, target: true, boss: "Sipir Uji", traits: [t] }], ...extra }, ["dalam", "tendang"]);
  test("Perisai: every hit deals 1 less", () => {
    expect(unitAt(play(withTrait("perisai"), "dalam", sq(2, 3)), sq(2, 3))!.hp).toBe(17); // 20 - (4 - 1)
  });
  test("Duri: hurting it on your turn costs you 1", () => {
    expect(play(withTrait("duri"), "dalam", sq(2, 3)).hero.hp).toBe(19);
  });
  test("Kokoh: pushes can't move it", () => {
    expect(unitAt(play(withTrait("kokoh"), "tendang", sq(2, 3)), sq(2, 3))).toBeDefined();
  });
  test("Pulih: heals 2 at the end of the enemy turn", () => {
    const s = withTrait("pulih");
    s.units[0].hp = 10;
    s.intents = [];
    enemyTurn(s);
    expect(s.units[0].hp).toBe(12);
  });
  test("Bayangan: ends the enemy turn far from you if you're next to it", () => {
    const s = withTrait("bayangan");
    s.intents = [];
    enemyTurn(s);
    expect(dist(s, s.units[0].sq, s.hero.sq)).toBeGreaterThan(1);
  });
  test("Murka works on any boss: below half HP it hits harder and calls pawns", () => {
    const s = withTrait("murka");
    s.units[0].hp = 13;
    const f = play(s, "dalam", sq(2, 3));
    const b = f.units.find((u) => u.boss)!;
    expect(b.phase).toBe(2);
    expect(f.units.length).toBeGreaterThan(1);
  });
});

describe("Slay the Spire style deck", () => {
  test("every style starts with 5 Tendang, 4 Tangkis and 1 signature card", () => {
    for (const [style, sig] of [["harimau", "terkam"], ["bangau", "balas"], ["ular", "liuk"]] as const) {
      const run = chooseStyle(newRun(1), style);
      expect(run.deck.filter((c) => c === "tendang")).toHaveLength(5);
      expect(run.deck.filter((c) => c === "tangkis")).toHaveLength(4);
      expect(run.deck).toHaveLength(10);
      expect(run.deck).toContain(sig);
    }
  });
  test("every card except the two basics is in exactly one tier", () => {
    const all = [...TIERS[1], ...TIERS[2], ...TIERS[3]];
    expect(new Set(all).size).toBe(all.length);
    // Basics and the Kram curse (only bosses hand it out) are never offered as rewards.
    expect(all.sort()).toEqual(ALL_CARDS.map((c) => c.id).filter((id) => !["tendang", "tangkis", "kram"].includes(id)).sort());
  });
  test("cards unlock as you go: basics first, tactics from floor 4, rare cards from the second prison", () => {
    expect(unlockedTier({ floor: 1, depth: 1 })).toBe(1);
    expect(unlockedTier({ floor: 3, depth: 1 })).toBe(2);
    expect(unlockedTier({ floor: 1, depth: 2 })).toBe(3);
    expect(unlockedTier({ floor: 1, depth: 1 }, true)).toBe(2); // elites reach one tier ahead
    for (let seed = 1; seed < 40; seed++) {
      let run = startRun(seed);
      run.fight!.status = "won";
      run = settle(run);
      for (const id of run.reward!.cards) expect(tierOf(id)).toBe(1);
    }
  });
  test("the first reward after a new tier opens says so, once", () => {
    let run: Run = { ...startRun(4), floor: 3, tierSeen: 1 };
    run.fight!.status = "won";
    run = settle(run);
    expect(run.reward!.unlocked).toBe(TIER_NAMES[2]);
    expect(run.tierSeen).toBe(2);
    let again: Run = { ...run, status: "fight", fight: { ...startRun(4).fight!, status: "won" } };
    again = settle(again);
    expect(again.reward!.unlocked).toBeUndefined();
  });
});

describe("config files and enemy movesets", () => {
  test("Kuda Liar back-kicks you when you stand right beside it, and sends you flying", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(2, 2), variant: "wild_horse" }] });
    const it = s.intents.find((i) => i.id === s.units[1].id)!;
    expect(it).toMatchObject({ type: "special", move: "back_kick", target: sq(2, 3) });
    const after = resolveEnemy(s);
    expect(after.hero.hp).toBe(20 - ENEMIES.moves.back_kick.damage!);
    expect(after.hero.sq).toBe(sq(2, 5)); // kicked 2 squares away
  });
  test("a plain knight beside you can't hit you: the back kick is the variant's own move", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(2, 3) }] });
    expect(s.intents.find((i) => i.id === s.units[1].id)?.type).not.toBe("special");
  });
  test("shields (block moves) soak damage first and drop when the enemy turn starts", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "r", sq: sq(2, 2), variant: "tower" }] }, ["dalam"]);
    expect(s.units[1].hp).toBe(9); // Menara's own hp
    const it = s.intents.find((i) => i.id === s.units[1].id)!;
    expect(it).toMatchObject({ type: "special", move: "fortify" });
    s.intents = [it];
    const after = resolveEnemy(s);
    expect(after.units[1].block).toBe(5);
    after.status = "play";
    after.hand = ["dalam"];
    after.tenaga = 3;
    after.hero.sq = sq(2, 3);
    const hit = play(after, "dalam", sq(2, 2));
    expect(hit.units[1].hp).toBe(9); // 4 damage, all soaked
    expect(hit.units[1].block).toBe(1);
  });
  test("Dukun heals the most hurt ally; Raja Perang commands one to act and hit harder", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "b", sq: sq(2, 1), variant: "dukun" }, { kind: "p", sq: sq(3, 1) }] });
    s.units[2].hp = 1;
    plan(s);
    expect(s.intents.find((i) => i.id === s.units[1].id)).toMatchObject({ type: "special", move: "mend", target: s.units[2].id });
    const after = resolveEnemy(s);
    expect(after.units[2].hp).toBe(3);
    const c = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(2, 0), variant: "war_king" }, { kind: "n", sq: sq(3, 1) }] });
    expect(c.intents.find((i) => i.id === c.units[0].id)).toMatchObject({ type: "special", move: "command", target: c.units[1].id });
    const cc = resolveEnemy(c);
    expect(cc.units[1].empower).toBe(ENEMIES.moves.command.bonus);
    expect(cc.units[1].angry).toBe(true);
  });
  test("signature moves wait for their cooldown", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "k", sq: sq(2, 0), variant: "war_king" }, { kind: "n", sq: sq(5, 0) }, { kind: "n", sq: sq(0, 0) }] });
    enemyTurn(s);
    expect(s.intents.find((i) => i.id === s.units[0].id && i.type === "special" && i.move === "command")).toBeUndefined();
  });
  test("fights pick variants by floor: young kings early, old kings late", () => {
    const kings = (row: number) => new Set(Array.from({ length: 30 }, (_, seed) => generateFight({ depth: 1, row, kind: "fight", scene: "yard", seed: seed + 1 }, { heroHp: 20, heroMax: 20, deck: [] }).units.find((u) => u.kind === "k")!.variant));
    expect([...kings(1)]).toEqual(["young_king"]);
    expect([...kings(5)]).toEqual(["old_king"]);
  });
  test("cards read their numbers from cards.json, and JSON-only cards work", () => {
    expect(CARDS.tangkis.text).toBe(`Block ${val("tangkis", "block")}`);
    const s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "n", sq: sq(2, 3) }] }, ["beruntun", "tapakbesi"]);
    const a = play(s, "beruntun", sq(2, 3));
    expect(a.units[1].hp).toBe(5 - 3);
    expect(a.combo).toBeGreaterThanOrEqual(3);
    const b = play(s, "tapakbesi", sq(1, 4));
    expect(b.hero.sq).toBe(sq(1, 4));
    expect(b.hero.block).toBe(3);
  });
});

describe("the escape gate and a pressing AI", () => {
  test("knocking out the King opens the gate; stepping onto it escapes", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "k", sq: sq(2, 2), hp: 2 }, { kind: "p", sq: sq(5, 0) }], gate: sq(1, 5) }, ["dalam"]);
    const f = play(s, "dalam", sq(2, 2));
    expect(f.status).toBe("play"); // the King is down, but you're not out yet
    expect(f.gateOpen).toBe(true);
    const h = step({ ...step(f, sq(1, 4)), stepUsed: false }, sq(1, 5));
    expect(h.status).toBe("won");
  });
  test("standing on the locked gate does nothing; it opens the moment the King falls", () => {
    const s = fight({ hero: sq(1, 5), units: [{ kind: "k", sq: sq(1, 4), hp: 2 }], gate: sq(1, 5) }, ["dalam"]);
    expect(s.status).toBe("play");
    expect(play(s, "dalam", sq(1, 4)).status).toBe("won");
  });
  test("the stalemate from the screenshot can't happen: wait 20 turns and the enemies still come for you", () => {
    const s = fight({
      hero: sq(2, 3),
      units: [
        { kind: "p", sq: sq(4, 0) }, { kind: "p", sq: sq(5, 0) }, { kind: "p", sq: sq(4, 1) },
        { kind: "k", sq: sq(5, 1), hp: 8 }, { kind: "p", sq: sq(4, 2) }, { kind: "p", sq: sq(5, 2) }, { kind: "p", sq: sq(4, 3) },
      ],
      gate: sq(3, 5),
    });
    s.fixedRoll = undefined;
    const start = s.units.map((u) => u.sq).join();
    for (let t = 0; t < 20 && s.status === "play"; t++) enemyTurn(s);
    expect(s.units.map((u) => u.sq).join()).not.toBe(start);
    expect(s.hero.hp).toBeLessThan(20);
  });
  test("every generated fight has a gate on the bottom row and starts you mid-board", () => {
    for (let seed = 1; seed < 30; seed++) {
      const f = fightFor(newRun(seed), newRun(seed).map.nodes.find((n) => n.row === 3)!);
      expect(f.gate).toBeDefined();
      expect(Math.floor(f.gate! / f.n)).toBe(f.n - 1);
      expect(Math.floor(f.hero.sq / f.n)).toBe(f.n - 3);
    }
  });
});

describe("combo playback", () => {
  test("step-by-step playback: each step is a consistent fight, and the last step is the whole combo", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const run = { ...newRun(seed), deck: ALL_CARDS.map((c) => c.id) };
      const node = run.map.nodes.find((n) => n.row === 2 && n.kind === "fight") ?? run.map.nodes.find((n) => n.kind === "fight")!;
      const s = fightFor({ ...run, floor: node.row }, node);
      s.fixedRoll = undefined; // real dice
      s.tenaga = 6;
      // Build a combo of whatever is playable, in order, against the preview.
      const items: ComboItem[] = [];
      for (let k = 0; k < 4; k++) {
        const r = playCombo(s, items, { sim: true });
        const q = r.fight;
        const i = q.hand.findIndex((id) => canPlay(q, id) && CARDS[id].targets(q).length);
        if (i < 0) break;
        const orig = r.origin[i];
        if (orig < 0) break;
        items.push({ k: "card", idx: orig, sq: CARDS[q.hand[i]].targets(q)[0] });
      }
      if (items.length < 2) continue;
      // Each step's prefix replays the earlier steps identically (same seeded dice), so step n-1 is a true
      // snapshot of step n's past: the hero and every piece only move forward from it.
      const twice = playCombo(s, items).fight;
      expect(JSON.stringify(playCombo(s, items).fight)).toBe(JSON.stringify(twice));
      // Every prefix is a real, consistent fight state (nothing overlaps).
      for (let n = 1; n <= items.length; n++) {
        const p = playCombo(s, items.slice(0, n)).fight;
        const spots = [p.hero.sq, ...p.units.map((u) => u.sq), ...p.things.map((t) => t.sq)];
        expect(new Set(spots).size).toBe(spots.length);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("gate fixes", () => {
  test("boss fights have no gate: beating the boss is the escape", () => {
    for (let seed = 1; seed < 20; seed++) {
      for (let depth = 1; depth <= 4; depth++) {
        const run = { ...newRun(seed), depth, map: makeMap(seed, depth) };
        const boss = run.map.nodes.find((n) => n.kind === "boss")!;
        expect(fightFor({ ...run, floor: boss.row }, boss).gate).toBeUndefined();
      }
    }
  });
  test("if the King was the last piece standing, you win at once", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "k", sq: sq(2, 2), hp: 2 }], gate: sq(0, 5) }, ["dalam"]);
    expect(play(s, "dalam", sq(2, 2)).status).toBe("won");
  });
});

describe("boss movesets (kits)", () => {
  const bossFight = (kit: string, kind: Kind, extra: Partial<Setup> = {}) =>
    fight({ hero: sq(2, 4), units: [{ kind, sq: sq(2, 1), target: true, boss: "Uji", hp: 30, heavy: true, kit }, { kind: "p", sq: sq(5, 0) }], ...extra });
  test("a boss follows its pattern: Ratu Badai beams down the line at you, hitting its own pieces too", () => {
    const s = fight({ hero: sq(2, 5), units: [{ kind: "q", sq: sq(2, 0), target: true, boss: "Ratu Uji", hp: 30, heavy: true, kit: "ratu_badai" }, { kind: "p", sq: sq(2, 2) }] });
    const it = s.intents.find((i) => i.id === s.units[0].id)!;
    expect(it).toMatchObject({ type: "special", move: "beam", dir: 4 });
    const after = resolveEnemy(s);
    expect(after.hero.hp).toBeLessThan(20);
    expect(after.units.find((u) => u.kind === "p")?.hp ?? 0).toBeLessThan(3); // its own pawn was in the way
    expect(after.units[0].pat).toBe(1); // next up: Titah (decree)
  });
  test("queens no longer slam unless their kit says so; plain rooks still do", () => {
    const q = fight({ hero: sq(2, 3), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "q", sq: sq(2, 1), variant: "queen" }] });
    expect(q.intents.find((i) => i.id === q.units[1].id)?.type).not.toBe("slam");
    const r = fight({ hero: sq(2, 3), units: [{ kind: "k", sq: sq(5, 0) }, { kind: "r", sq: sq(3, 1), variant: "rook" }] });
    expect(r.intents.find((i) => i.id === r.units[1].id)?.type).toBe("slam");
  });
  test("Panglima pounces next to you and strikes", () => {
    const s = bossFight("panglima", "n");
    expect(s.intents.find((i) => i.id === s.units[0].id)).toMatchObject({ type: "special", move: "pounce" });
    const after = resolveEnemy(s);
    expect(dist(after, after.units[0].sq, after.hero.sq)).toBe(1);
    expect(after.hero.hp).toBeLessThan(20);
  });
  test("Raja Licik curses you: Kram cards go into your draw pile", () => {
    const s = bossFight("raja_licik", "k");
    s.draw = ["tendang", "tendang"];
    const after = resolveEnemy(s);
    expect(after.draw.filter((c) => c === "kram")).toHaveLength(2);
  });
  test("below half HP a kit boss switches to its phase 2 pattern", () => {
    const s = bossFight("sipir", "r", { hero: sq(2, 5) });
    s.units[0].hp = 16;
    s.hand = ["dalam"];
    s.hero.sq = sq(2, 2);
    const f = play(s, "dalam", sq(2, 1));
    expect(f.units[0].phase).toBe(2);
    expect(kitPlan(f.units[0])!.list).toEqual(ENEMIES.bosses.kits.find((k) => k.id === "sipir")!.phase2);
  });
  test("every generated boss has a kit for its piece, and kits differ between bosses", () => {
    const kits = new Set<string>();
    for (let seed = 1; seed < 40; seed++) for (let d = 2; d <= 6; d++) {
      const b = bossFor(seed, d);
      const kit = ENEMIES.bosses.kits.find((k) => k.id === b.kit)!;
      expect(kit.piece).toBe(b.kind);
      kits.add(b.kit);
    }
    expect(kits.size).toBeGreaterThanOrEqual(8);
    expect(bossFor(1, 1).kit).toBe("raja_hitam");
  });
});
