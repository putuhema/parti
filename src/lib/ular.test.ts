/**
 * Ular Tangga Nusantara rules: the board, questions on landing, ladders, snakes, bonus steps and whole bot games.
 * Run with `npm test`.
 */
import { describe, expect, it } from "vitest";
import { ASK_MS, GOAL, GRID, LADDERS, SNAKES, answer, catOf, cellOf, kindOf, leaveGame, newGame, onDeadline, onIsland, roll, type UlarGame } from "../../convex/lib/ular/rules";
import { QUESTIONS } from "../../convex/lib/trivia/questions";
import { mulberry32 } from "../../convex/lib/sudoku";

/** An rng that returns these values in order, then a seeded stream. */
const seq = (...vals: number[]) => {
  const rest = mulberry32(7);
  return () => (vals.length ? vals.shift()! : rest());
};
const die = (n: number) => (n - 0.5) / 6;
const game = (n = 2) => newGame(["a", "b", "c"].slice(0, n), 25, 0);
/** Put player a on a pending question at `sq`, and return the pick that's right. */
const askAt = (sq: number, from = sq - 3) => {
  const g = game();
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
    // neighbours in number are neighbours on the board
    for (let sq = 1; sq < GOAL; sq++) {
      const a = cellOf(sq), b = cellOf(sq + 1);
      expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
    }
    expect(onIsland(0, 0)).toBe(false); // sea in the corner
  });
  it("ladders go up, snakes go down, and they never share a square", () => {
    for (const [f, t] of Object.entries(LADDERS)) expect(t).toBeGreaterThan(Number(f));
    for (const [h, t] of Object.entries(SNAKES)) expect(t).toBeLessThan(Number(h));
    const ends = [...Object.keys(LADDERS), ...Object.values(LADDERS), ...Object.keys(SNAKES), ...Object.values(SNAKES)].map(Number);
    expect(new Set(ends).size).toBe(ends.length);
    expect(kindOf(4)).toBe("ladder");
    expect(kindOf(17)).toBe("snake");
    expect(kindOf(5)).toBe("plain");
  });
});

describe("a turn", () => {
  it("rolling moves you and asks a question from the square's category", () => {
    const g = game();
    roll(g, seq(die(5)), 0);
    expect(g.pos.a).toBe(5);
    expect(g.phase).toBe("ask");
    expect(g.turn).toBe("a");
    expect(QUESTIONS[g.ask!.q].cat).toBe(catOf(5));
    expect(g.deadline).toBeGreaterThanOrEqual(ASK_MS);
  });
  it("overshooting 100 bounces back", () => {
    const g = game();
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

describe("answers", () => {
  it("at the foot of a ladder, a right answer climbs it", () => {
    const { g, right } = askAt(21);
    answer(g, right, 0);
    expect(g.pos.a).toBe(LADDERS[21]);
    expect(g.log.some((e) => e.kind === "climb")).toBe(true);
    expect(g.turn).toBe("b");
  });
  it("…and a wrong one leaves you at the foot", () => {
    const { g, right } = askAt(21);
    answer(g, (right + 1) % 4, 0);
    expect(g.pos.a).toBe(21);
  });
  it("on a snake's head, a wrong answer slides you down; a right one dodges it", () => {
    const bit = askAt(54);
    answer(bit.g, (bit.right + 2) % 4, 0);
    expect(bit.g.pos.a).toBe(SNAKES[54]);
    expect(bit.g.log.some((e) => e.kind === "bite")).toBe(true);
    const safe = askAt(54);
    answer(safe.g, safe.right, 0);
    expect(safe.g.pos.a).toBe(54);
  });
  it("on a plain square, a right answer is a bonus step (and a ladder there is a free climb)", () => {
    const plain = askAt(5);
    answer(plain.g, plain.right, 0);
    expect(plain.g.pos.a).toBe(6);
    const chain = askAt(8); // bonus step lands on 9, the foot of a ladder
    answer(chain.g, chain.right, 0);
    expect(chain.g.pos.a).toBe(LADDERS[9]);
  });
  it("the reveal says which choice was right, and no answer counts as wrong", () => {
    const { g, right } = askAt(5);
    onDeadline(g, seq(0), 0);
    const e = g.log.find((x) => x.kind === "answer")!;
    expect(e).toMatchObject({ ok: false, pick: -1, right });
    expect(e.choices).toHaveLength(4);
    expect(g.pos.a).toBe(5);
  });
  it("doesn't repeat a question until its category runs dry", () => {
    const g = game();
    const asked = new Set<number>();
    for (let k = 0; k < 20; k++) {
      g.pos.a = 4; // always land on 5 (same category)
      g.phase = "roll";
      g.turn = "a";
      roll(g, seq(die(1)), 0);
      asked.add(g.ask!.q);
      answer(g, -1, 0);
    }
    expect(asked.size).toBe(20);
  });
});

describe("whole games", () => {
  it("played by bots always finish", () => {
    for (let s = 1; s <= 30; s++) {
      const rng = mulberry32(s);
      const g: UlarGame = newGame(["x", "bot1", "bot2"], 40, 0);
      let steps = 0;
      while (!g.done && steps++ < 4000) {
        if (g.phase === "ask" && !g.turn.startsWith("bot")) answer(g, Math.floor(rng() * 4), 0);
        else onDeadline(g, rng, 0);
        for (const p of g.players) expect(g.pos[p]).toBeGreaterThanOrEqual(0);
        for (const p of g.players) expect(g.pos[p]).toBeLessThanOrEqual(GOAL);
      }
      expect(g.done).toBeTruthy();
      expect(g.done!.winners.length).toBeGreaterThan(0);
    }
  });
  it("someone leaving passes the turn, and the last person standing wins", () => {
    const g = game(2);
    leaveGame(g, "a", 0);
    expect(g.done).toMatchObject({ winners: ["b"], reason: "last" });
  });
});
