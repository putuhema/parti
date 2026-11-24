/**
 * Ular Tangga Nusantara rules: clean starting board, random Mystery Boxes (?) by difficulty,
 * dynamic permanent ladders on right answers and permanent snakes on failed answers, scaled by hardness.
 * Run with `npm test`.
 */
import { describe, expect, it } from "vitest";
import {
  ASK_MS,
  BOX_COUNTS,
  DIFFICULTY_INFO,
  GOAL,
  GRID,
  answer,
  cellOf,
  leaveGame,
  newGame,
  onDeadline,
  onIsland,
  roll,
  type Difficulty,
  type UlarGame,
} from "../../convex/lib/ular/rules";
import { difficultyOf } from "../../convex/lib/ular/difficulty";
import { mulberry32 } from "../../convex/lib/sudoku";

/** An rng that returns these values in order, then a seeded stream. */
const seq = (...vals: number[]) => {
  const rest = mulberry32(7);
  return () => (vals.length ? vals.shift()! : rest());
};
const die = (n: number) => (n - 0.5) / 6;
const game = (n = 2, seed = 42) => newGame(["a", "b", "c"].slice(0, n), 25, 0, 0, mulberry32(seed));

/** Put player a on a Mystery Box of `diff` at square `sq`, and return the game + right choice index. */
const askAtBox = (sq: number, diff: Difficulty, from = sq - 3) => {
  const g = game();
  g.boxes = { [sq]: diff };
  g.ladders = {};
  g.snakes = {};
  g.pos.a = from;
  roll(g, seq(die(sq - from)), 0);
  expect(g.phase).toBe("ask");
  return { g, right: g.ask!.order.indexOf(0) };
};

describe("the board", () => {
  it("numbers 100 squares back and forth on an island, with the start on the beach", () => {
    const seen = new Set<string>();
    for (let sq = 0; sq <= GOAL; sq++) {
      const { col, row } = cellOf(sq);
      expect(onIsland(col, row)).toBe(true);
      expect(col >= 0 && row >= 0 && col < GRID && row < GRID).toBe(true);
      seen.add(`${col},${row}`);
    }
    expect(seen.size).toBe(GOAL + 1);
    for (let sq = 1; sq < GOAL; sq++) {
      const a = cellOf(sq), b = cellOf(sq + 1);
      expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
    }
    expect(onIsland(0, 0)).toBe(false);
  });

  it("starts with zero snakes and zero ladders, and scatters random Mystery Boxes across all 3 difficulties", () => {
    const g = game(2, 11);
    expect(Object.keys(g.ladders)).toHaveLength(0);
    expect(Object.keys(g.snakes)).toHaveLength(0);
    const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const [k, d] of Object.entries(g.boxes)) {
      const sq = Number(k);
      expect(sq).toBeGreaterThan(1);
      expect(sq).toBeLessThan(GOAL);
      counts[d]++;
    }
    expect(counts).toEqual(BOX_COUNTS);
  });
});

describe("a turn", () => {
  it("landing on a plain square moves you cleanly with no question and passes the turn", () => {
    const g = game();
    g.boxes = {}; // clear boxes so square 5 is guaranteed plain
    roll(g, seq(die(5)), 0);
    expect(g.pos.a).toBe(5);
    expect(g.phase).toBe("roll");
    expect(g.turn).toBe("b");
    expect(g.ask).toBeUndefined();
  });

  it("landing on a Mystery Box opens a question matching that box's difficulty", () => {
    const { g } = askAtBox(40, "hard");
    expect(g.pos.a).toBe(40);
    expect(g.phase).toBe("ask");
    expect(g.turn).toBe("a");
    expect(g.ask!.diff).toBe("hard");
    expect(difficultyOf(g.ask!.q)).toBe("hard");
    expect(g.deadline).toBeGreaterThanOrEqual(ASK_MS);
  });

  it("overshooting 100 bounces back", () => {
    const g = game();
    g.boxes = {};
    g.pos.a = 97;
    roll(g, seq(die(6)), 0);
    expect(g.pos.a).toBe(97); // 98, 99, 100, 99, 98, 97
    expect(g.log.find((e) => e.kind === "roll")?.bounced).toBe(true);
  });

  it("landing exactly on 100 wins", () => {
    const g = game();
    g.pos.a = 96;
    roll(g, seq(die(4)), 0);
    expect(g.done).toMatchObject({ winners: ["a"], reason: "finish" });
  });
});

describe("mystery boxes spawn permanent ladders & snakes", () => {
  it("answering correctly consumes the box, permanently spawns a ladder, and climbs it", () => {
    const { g, right } = askAtBox(30, "medium");
    const expectedTop = g.ask!.upTo;
    answer(g, right, 0);

    expect(g.boxes[30]).toBeUndefined();
    expect(g.ladders[30]).toBe(expectedTop);
    expect(g.snakes[30]).toBeUndefined();
    expect(g.pos.a).toBe(expectedTop);
    expect(g.log.some((e) => e.kind === "climb" && e.spawned === true)).toBe(true);
    expect(g.turn).toBe("b");

    // Player B later landing on square 30 climbs the permanent ladder automatically!
    g.pos.b = 27;
    roll(g, seq(die(3)), 0);
    expect(g.pos.b).toBe(expectedTop);
    expect(g.log.some((e) => e.kind === "climb" && e.by === "b" && e.spawned === false)).toBe(true);
  });

  it("answering wrong (or timing out) consumes the box, permanently spawns a snake, and slides down", () => {
    const { g, right } = askAtBox(50, "medium");
    const expectedTail = g.ask!.downTo;
    answer(g, (right + 1) % 4, 0);

    expect(g.boxes[50]).toBeUndefined();
    expect(g.snakes[50]).toBe(expectedTail);
    expect(g.ladders[50]).toBeUndefined();
    expect(g.pos.a).toBe(expectedTail);
    expect(g.log.some((e) => e.kind === "bite" && e.spawned === true)).toBe(true);
    expect(g.turn).toBe("b");

    // Player B later landing on square 50 gets bitten by the spawned snake immediately!
    g.pos.b = 46;
    roll(g, seq(die(4)), 0);
    expect(g.pos.b).toBe(expectedTail);
    expect(g.log.some((e) => e.kind === "bite" && e.by === "b" && e.spawned === false)).toBe(true);
  });

  it("scales climb and drop distance by question difficulty (hard > medium > easy)", () => {
    const easy = askAtBox(45, "easy");
    const med = askAtBox(45, "medium");
    const hard = askAtBox(45, "hard");

    const easyUp = easy.g.ask!.upTo - 45;
    const medUp = med.g.ask!.upTo - 45;
    const hardUp = hard.g.ask!.upTo - 45;

    const easyDown = 45 - easy.g.ask!.downTo;
    const medDown = 45 - med.g.ask!.downTo;
    const hardDown = 45 - hard.g.ask!.downTo;

    expect(easyUp).toBeGreaterThanOrEqual(DIFFICULTY_INFO.easy.upMin);
    expect(easyUp).toBeLessThanOrEqual(DIFFICULTY_INFO.easy.upMax);
    expect(medUp).toBeGreaterThan(easyUp);
    expect(hardUp).toBeGreaterThan(medUp);

    expect(easyDown).toBeGreaterThanOrEqual(DIFFICULTY_INFO.easy.downMin);
    expect(medDown).toBeGreaterThan(easyDown);
    expect(hardDown).toBeGreaterThan(medDown);
  });

  it("timeout on a Mystery Box counts as wrong and unleashes a snake", () => {
    const { g, right } = askAtBox(40, "easy");
    const expectedTail = g.ask!.downTo;
    onDeadline(g, seq(0), 0);
    const e = g.log.find((x) => x.kind === "answer")!;
    expect(e).toMatchObject({ ok: false, pick: -1, right });
    expect(g.snakes[40]).toBe(expectedTail);
    expect(g.pos.a).toBe(expectedTail);
  });
});

describe("whole games", () => {
  it("played by bots always finish and dynamically spawn ladders and snakes", () => {
    let totalLadders = 0;
    let totalSnakes = 0;
    for (let s = 1; s <= 30; s++) {
      const rng = mulberry32(s);
      const g: UlarGame = newGame(["x", "bot1", "bot2"], 40, 0, 0, rng);
      let steps = 0;
      while (!g.done && steps++ < 4000) {
        if (g.phase === "ask" && !g.turn.startsWith("bot")) answer(g, Math.floor(rng() * 4), 0);
        else onDeadline(g, rng, 0);
        for (const p of g.players) expect(g.pos[p]).toBeGreaterThanOrEqual(0);
        for (const p of g.players) expect(g.pos[p]).toBeLessThanOrEqual(GOAL);
      }
      expect(g.done).toBeTruthy();
      expect(g.done!.winners.length).toBeGreaterThan(0);
      totalLadders += Object.keys(g.ladders).length;
      totalSnakes += Object.keys(g.snakes).length;
    }
    expect(totalLadders).toBeGreaterThan(10);
    expect(totalSnakes).toBeGreaterThan(10);
  });

  it("someone leaving passes the turn, and the last person standing wins", () => {
    const g = game(2);
    leaveGame(g, "a", 0);
    expect(g.done).toMatchObject({ winners: ["b"], reason: "last" });
  });
});
