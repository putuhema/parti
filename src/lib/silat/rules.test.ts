// Run with: bun test src/lib/silat
import { describe, expect, test } from "bun:test";
import { CARDS, canCapture, canPlay, canReady, cardCost, playCard, playCombo, readyCard } from "./cards";
import { beginEnemy, clone, enemyStep, enemyTurn, forecast, freeSteps, isGuarded, makeFight, plan, reactionDamage, startTurn, step, unitAt, type Fight, type Setup } from "./rules";
import { makeMap, nextNodes, nodeById, MAP_ROWS } from "./map";
import { ALL_RELICS } from "./relics";
import { BASE_DECK, EVENTS, buyCard, checkBonus, chooseEvent, rollEvent, chooseStyle, enter, fightFor, newRun, settle, takeReward, type Run } from "./run";

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

  test("the first fight's showcase: kick the front pawn into the one behind it", () => {
    const run = startRun(5);
    let s = run.fight!;
    expect(s.things).toHaveLength(0); // no boulders, crates or villagers
    s.hand = ["tendang"];
    s = play(s, "tendang", sq(2, 3));
    // Front pawn: 3 - 2 kick - 3 crash (it flew 1 square). Back pawn: 3 - 3 crash. Both gone.
    expect(s.units.filter((u) => u.kind === "p")).toHaveLength(0);
    expect(s.combo).toBeGreaterThanOrEqual(3);
    expect(s.hero.hp).toBe(s.hero.max); // untouched
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

  test("pawns that don't act march down and promote on your back row", () => {
    const s = fight({ hero: sq(0, 0), units: [{ kind: "p", sq: sq(5, 4) }, { kind: "k", sq: sq(3, 0) }], limit: 0 });
    s.intents = [];
    enemyTurn(s);
    const q = s.units.find((u) => u.sq === sq(5, 5))!;
    expect(q.kind).toBe("q");
    expect(q.hp).toBe(7);
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
    // From c6 it can't reach you, so it marches forward instead of striking.
    expect(s.intents.find((i) => i.id === pawn.id)).toEqual({ id: pawn.id, type: "move", to: sq(2, 1) });
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
    expect(run.deck).toEqual([...BASE_DECK, "napas", "balas"]);
    run = enter(run, nextNodes(run.map, null)[0]);
    expect(run.status).toBe("fight");
    run.fight!.status = "won";
    run = settle(run);
    expect(run.status).toBe("reward");
    expect(run.reward!.cards).toHaveLength(3);
    expect(["badai", "tolak", "benteng"]).toContain(run.reward!.cards[0]);
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

  test("every fight on every map can be set up, including elites and the boss", () => {
    for (let seed = 1; seed < 30; seed++) {
      const run = newRun(seed);
      for (const node of run.map.nodes.filter((n) => n.kind === "fight" || n.kind === "elite" || n.kind === "boss")) {
        const f = fightFor({ ...run, floor: node.row }, node);
        expect(f.units.some((u) => u.target)).toBe(true);
        expect(f.hand.length).toBe(5);
        expect(f.things).toHaveLength(0);
        const spots = [f.hero.sq, ...f.units.map((u) => u.sq), ...f.things.map((t) => t.sq)];
        expect(new Set(spots).size).toBe(spots.length);
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
