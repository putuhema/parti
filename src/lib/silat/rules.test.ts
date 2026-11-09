// Run with: bun test src/lib/silat
import { describe, expect, test } from "bun:test";
import { CARDS, canPlay, playCard } from "./cards";
import { clone, enemyTurn, forecast, isGuarded, makeFight, plan, reactionDamage, step, unitAt, type Fight, type Setup } from "./rules";
import { makeMap, nextNodes, nodeById, MAP_ROWS } from "./map";
import { ALL_RELICS } from "./relics";
import { buyCard, chooseEvent, enter, fightFor, newRun, settle, takeReward, type Run } from "./run";

/** A fresh run already standing in the Warm-up fight, with no relics (so results are predictable). */
function startRun(seed: number): Run {
  const run = { ...newRun(seed), relics: [] as string[] };
  return enter(run, nextNodes(run.map, null)[0]);
}

const sq = (c: number, r: number) => r * 6 + c;

function fight(o: Partial<Setup> & Pick<Setup, "hero" | "units">, hand: string[] = []): Fight {
  const s = makeFight({ heroHp: 20, heroMax: 20, deck: [], seed: 1, ...o });
  s.hand = [...hand];
  s.draw = [];
  return s;
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

    // Rook three squares away: the knight flies 2 squares first, so the crash is 4.
    s = fight({ hero: sq(2, 5), units: [{ kind: "n", sq: sq(2, 4) }, { kind: "r", sq: sq(2, 1) }, { kind: "k", sq: sq(5, 0) }] }, ["tendang"]);
    s = play(s, "tendang", sq(2, 4));
    expect(s.units.find((u) => u.kind === "n")).toBeUndefined(); // 5 - 2 - 4
    expect(s.units.find((u) => u.kind === "r")!.hp).toBe(7 - 4);
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
    const after = forecast(s).after;
    expect(after.hero.sq).toBe(sq(2, 3));
    expect(after.hero.hp).toBe(20);
    expect(after.units.find((u) => u.kind === "p")).toBeUndefined();
  });

  test("Tangkisan: an attacker next to you gets kicked back", () => {
    let s = fight({ hero: sq(2, 3), units: [{ kind: "p", sq: sq(1, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["tangkisan"]);
    s.intents = [{ id: s.units[0].id, type: "strike", target: sq(2, 3) }];
    s = play(s, "tangkisan", sq(2, 3));
    const after = forecast(s).after;
    expect(after.hero.hp).toBe(20); // 1 damage, 2 block
    expect(after.units.find((u) => u.kind === "p")!.sq).toBe(sq(0, 1));
  });

  test("a piece pushed out of place loses the move or strike it planned", () => {
    let s = fight({ hero: sq(2, 4), units: [{ kind: "p", sq: sq(2, 3) }, { kind: "k", sq: sq(5, 0) }], mud: [sq(2, 0)] }, ["lurus"]);
    const pawn = s.units[0];
    s.intents = [{ id: pawn.id, type: "strike", target: sq(1, 4) }]; // it planned to hit b2
    s = play(s, "lurus", sq(2, 3)); // kicked flying up, stuck in the mud on c6, far from b2
    const after = forecast(s).after;
    expect(after.hero.hp).toBe(20);
    expect(after.units.find((u) => u.id === pawn.id)?.sq).toBe(sq(2, 0));
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
    expect(s.log.some((l) => l.t.includes("strikes you as you arrive"))).toBe(true);

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
  test("a run starts on the map with a random Pusaka, then: fight, reward, back to the map", () => {
    let run = newRun(3);
    expect(run.status).toBe("map");
    expect(run.relics).toHaveLength(1);
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
    // Step one square: still inside the 3x3.
    expect(forecast(step(s, sq(1, 5))).damage).toBe(4);
    // Block 4 soaks it.
    expect(forecast(play(s, "tangkis", sq(2, 4))).damage).toBe(0);
  });

  test("a slam hits the slammer's own allies around you too", () => {
    const s = fight({ hero: sq(2, 4), units: [{ kind: "q", sq: sq(2, 2) }, { kind: "p", sq: sq(1, 3) }, { kind: "k", sq: sq(5, 0) }] });
    s.intents = [{ id: s.units[0].id, type: "slam", center: sq(2, 4) }];
    const after = forecast(s).after;
    expect(after.units.find((u) => u.kind === "p")).toBeUndefined(); // 3 HP pawn, queen hits for 5
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
