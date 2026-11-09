// Run with: bun test src/lib/silat
import { describe, expect, test } from "bun:test";
import { CARDS, canPlay, playCard } from "./cards";
import { clone, enemyTurn, forecast, makeFight, plan, step, unitAt, type Fight, type Setup } from "./rules";
import { FLOORS, fightFor, newRun, settle, takeReward } from "./run";

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
    // Staying put would cost 5.
    expect(forecast(s).damage).toBe(5);

    s = step(s, sq(2, 1));
    expect(forecast(s).damage).toBe(0);
    s = play(s, "tendang", sq(2, 0)); // knight on the top edge: Ring Out
    expect(s.units.find((u) => u.id === knight.id)).toBeUndefined();
    expect(s.ringOuts).toBe(1);

    const after = forecast(s).after;
    expect(after.units.find((u) => u.id === pawn.id)).toBeUndefined(); // 3 HP pawn, rook hits for 3
    expect(after.units.find((u) => u.id === rook.id)?.sq).toBe(sq(4, 2));
    expect(after.hero.hp).toBe(20);
  });
});

describe("pushes", () => {
  test("a piece pushed into another: both take 2", () => {
    let s = fight({ hero: sq(2, 4), units: [{ kind: "p", sq: sq(2, 3) }, { kind: "n", sq: sq(2, 2) }, { kind: "k", sq: sq(5, 0) }] }, ["tendang"]);
    s = play(s, "tendang", sq(2, 3));
    // Pawn: 3 - 2 (kick) - 2 (collision) = gone. Knight: 5 - 2 = 3.
    expect(s.units.find((u) => u.kind === "p")).toBeUndefined();
    expect(unitAt(s, sq(2, 2))?.hp).toBe(3);
  });

  test("light pieces pushed off the board are knocked out, heavy ones take 5 and stay", () => {
    let s = fight({ hero: sq(1, 1), units: [{ kind: "b", sq: sq(1, 0) }, { kind: "r", sq: sq(0, 1), hp: 10 }, { kind: "k", sq: sq(5, 5) }] }, ["tendang", "tendang"]);
    s = play(s, "tendang", sq(1, 0));
    expect(s.units.find((u) => u.kind === "b")).toBeUndefined();
    s = play(s, "tendang", sq(0, 1));
    const rook = s.units.find((u) => u.kind === "r")!;
    expect(rook.sq).toBe(sq(0, 1));
    expect(rook.hp).toBe(10 - 2 - 5);
  });

  test("mud stops a push early", () => {
    let s = fight({ hero: sq(2, 5), units: [{ kind: "n", sq: sq(2, 4) }, { kind: "k", sq: sq(5, 0) }], mud: [sq(2, 3)] }, ["lurus"]);
    s = play(s, "lurus", sq(2, 4));
    expect(s.units.find((u) => u.kind === "n")!.sq).toBe(sq(2, 3));
  });

  test("the first fight's showcase: boulder into the firecracker crate", () => {
    const run = newRun(5);
    let s = run.fight!;
    s.hand = ["tendang"];
    s = play(s, "tendang", sq(2, 3)); // kick the boulder up into the crate
    expect(s.things.find((t) => t.kind === "petasan")).toBeUndefined();
    expect(s.fx.some((f) => f.t === "boom")).toBe(true);
    // Left pawn: 3 - 2 = 1, blown up-left to a6.
    expect(unitAt(s, sq(0, 0))?.hp).toBe(1);
    // Right pawn: blown into its own king: 3 - 2 - 2 = gone, king 16 - 2 = 14.
    expect(s.units.filter((u) => u.kind === "p")).toHaveLength(1);
    expect(s.units.find((u) => u.kind === "k")!.hp).toBe(14);
    expect(s.hero.hp).toBe(20); // you were far enough away
  });
});

describe("enemies", () => {
  test("strikers box you in: your square first, then where you would step", () => {
    const s = fight({ hero: sq(2, 3), units: [{ kind: "p", sq: sq(1, 2) }, { kind: "p", sq: sq(3, 1) }, { kind: "k", sq: sq(5, 0) }] });
    plan(s);
    const strikes = s.intents.filter((i) => i.type === "strike").map((i) => (i as { target: number }).target);
    expect(strikes).toContain(sq(2, 3));
    expect(strikes).toContain(sq(2, 2)); // the other pawn covers the square above you
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
    let s = fight({ hero: sq(2, 5), units: [{ kind: "n", sq: sq(2, 4) }, { kind: "p", sq: sq(0, 3) }, { kind: "p", sq: sq(4, 3) }, { kind: "k", sq: sq(5, 0) }], limit: 0 }, ["tendang"]);
    s = play(s, "tendang", sq(2, 4));
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
    let s = fight({ hero: sq(2, 4), units: [{ kind: "p", sq: sq(2, 3) }, { kind: "k", sq: sq(5, 0) }] }, ["lurus"]);
    const pawn = s.units[0];
    s.intents = [{ id: pawn.id, type: "strike", target: sq(1, 4) }]; // it planned to hit b2
    s = play(s, "lurus", sq(2, 3)); // kicked 3 squares up to c6, far from b2
    const after = forecast(s).after;
    expect(after.hero.hp).toBe(20);
    expect(after.units.find((u) => u.id === pawn.id)?.sq).toBe(sq(2, 0));
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

describe("villagers", () => {
  test("enemies go after villagers, and losing one costs you 3 HP that Block can't stop", () => {
    let s = fight({
      hero: sq(0, 5),
      units: [{ kind: "n", sq: sq(3, 1) }, { kind: "k", sq: sq(5, 0) }],
      things: [{ kind: "warga", sq: sq(4, 3) }],
    }, ["tangkis"]);
    plan(s);
    const knight = s.units.find((u) => u.kind === "n")!;
    expect(s.intents.find((i) => i.id === knight.id)).toEqual({ id: knight.id, type: "strike", target: sq(4, 3) });
    s = play(s, "tangkis", sq(0, 5));
    // Hit for 2: the villager survives with 1.
    let after = forecast(s).after;
    expect(after.things.find((t) => t.kind === "warga")?.hp).toBe(1);
    // Hit again: gone, and you lose 3 even though you have Block.
    after.intents = [{ id: knight.id, type: "strike", target: sq(4, 3) }];
    after.status = "enemy";
    after.hero.block = 5;
    const hp = after.hero.hp;
    after = forecast(after).after;
    expect(after.things.some((t) => t.kind === "warga")).toBe(false);
    expect(after.hero.hp).toBe(hp - 3);
    expect(after.wargaLost).toBe(1);
  });

  test("you can shove a villager out of the way: Tendang moves it without hurting it", () => {
    let s = fight({ hero: sq(2, 4), units: [{ kind: "k", sq: sq(5, 0) }], things: [{ kind: "warga", sq: sq(2, 3) }] }, ["tendang"]);
    s = play(s, "tendang", sq(2, 3));
    const w = s.things.find((t) => t.kind === "warga")!;
    expect(w.sq).toBe(sq(2, 2));
    expect(w.hp).toBe(3);
  });

  test("a charge stops at the first thing in its way: block it with a villager... or with an enemy", () => {
    const s = fight({
      hero: sq(5, 2),
      units: [{ kind: "r", sq: sq(0, 2) }, { kind: "p", sq: sq(3, 2) }, { kind: "k", sq: sq(5, 0) }],
      things: [{ kind: "warga", sq: sq(4, 4) }],
    });
    s.intents = [{ id: s.units[0].id, type: "charge", dir: 2 }];
    const after = forecast(s).after;
    expect(after.hero.hp).toBe(20);
    expect(after.units.find((u) => u.kind === "p")).toBeUndefined(); // the pawn in the way took the hit
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
  test("win a fight, pick a reward, move to the next floor", () => {
    let run = newRun(3);
    run.fight!.status = "won";
    run = settle(run);
    expect(run.status).toBe("reward");
    expect(run.reward).toHaveLength(3);
    expect(["badai", "tolak", "benteng"]).toContain(run.reward![0]);
    run = takeReward(run, run.reward![0]);
    expect(run.floor).toBe(1);
    expect(run.deck).toHaveLength(11);
    expect(run.fight?.status).toBe("play");
  });

  test("every floor can be set up, including the boss", () => {
    for (let floor = 0; floor < FLOORS; floor++) {
      for (let seed = 1; seed < 30; seed++) {
        const f = fightFor({ floor, hp: 20, max: 20, deck: newRun(seed).deck, seed });
        expect(f.units.some((u) => u.target)).toBe(true);
        expect(f.hand.length).toBe(5);
      }
    }
  });
});

describe("random play never breaks the board", () => {
  test("300 fights of random moves", () => {
    let r = 7;
    const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
    let finished = 0;
    for (let g = 0; g < 300; g++) {
      let s = fightFor({ floor: g % FLOORS, hp: 20, max: 20, deck: ["tendang", "tendang", "lurus", "sabit", "tarik", "tolak", "badai", "bantingan", "kuda", "gajah", "benteng", "elakan", "tangkisan", "kuncian", "harimau", "momentum"], seed: g + 1 });
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
        expect(clone(s).hand.length).toBeLessThanOrEqual(5);
      }
      if (s.status === "won" || s.status === "lost") finished++;
    }
    expect(finished).toBeGreaterThan(200);
  });
});
