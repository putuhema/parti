/**
 * Juragan Nusantara rules: the board, rent, buying, bankruptcy and whole games played by bots.
 * Run with `npm test`.
 */
import { describe, expect, it } from "vitest";
import { COLS, GROUPS, JAIL, LAP_BONUS, N, ROWS, SPACES, START_CASH, active, botWants, cellOf, choose, leaveGame, newGame, onDeadline, priceOf, rentOf, roll, worthOf, type BoomGame } from "../../convex/lib/boom/rules";
import { mulberry32 } from "../../convex/lib/sudoku";

/** An rng that makes the next roll come up as these dice, then falls back to a seeded stream. */
const dice = (a: number, b: number, seed = 1) => {
  const rest = mulberry32(seed);
  const q = [(a - 0.5) / 6, (b - 0.5) / 6];
  return () => (q.length ? q.shift()! : rest());
};
const game = (n = 2) => newGame(["a", "b", "c", "d"].slice(0, n), 20, 0);

describe("the board", () => {
  it("is a ring around a 7×12 grid with corners where the layout puts them", () => {
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const { col, row } = cellOf(i);
      expect(col === 0 || col === COLS - 1 || row === 0 || row === ROWS - 1).toBe(true);
      seen.add(`${col},${row}`);
    }
    expect(seen.size).toBe(N);
    expect(N).toBe(2 * COLS + 2 * ROWS - 4);
    expect(cellOf(0)).toEqual({ col: 6, row: 0 });
    expect(SPACES[cellOfIndex(6, 11)].kind).toBe("jail");
    expect(SPACES[cellOfIndex(0, 11)].kind).toBe("jackpot");
    expect(SPACES[cellOfIndex(0, 0)].kind).toBe("wheel");
  });
  it("has 2 or 3 lots in every colour and a transport hub on each side", () => {
    GROUPS.forEach((_, k) => {
      const n = SPACES.filter((s) => s.kind === "lot" && s.group === k).length;
      expect(n === 2 || n === 3).toBe(true);
    });
    expect(SPACES.filter((s) => s.kind === "hub").length).toBe(4);
  });
});
const cellOfIndex = (col: number, row: number) => Array.from({ length: N }, (_, i) => i).find((i) => cellOf(i).col === col && cellOf(i).row === row)!;

describe("a turn", () => {
  it("offers an empty lot, and buying it passes the dice", () => {
    const g = game();
    roll(g, dice(1, 2), 0); // Jayapura
    expect(g.pos.a).toBe(3);
    expect(g.phase).toBe("buy");
    expect(g.turn).toBe("a");
    choose(g, true, 0);
    expect(g.owner[3]).toBe("a");
    expect(g.cash.a).toBe(START_CASH - 60);
    expect(g.turn).toBe("b");
    expect(g.phase).toBe("roll");
  });
  it("charges rent, doubled once the colour is complete", () => {
    const g = game();
    g.owner[3] = "a";
    expect(rentOf(g, 3)).toBe(10);
    g.owner[1] = "a";
    expect(rentOf(g, 3)).toBe(20);
    g.turn = "b";
    roll(g, dice(1, 2), 0);
    expect(g.cash.b).toBe(START_CASH - 20);
    expect(g.cash.a).toBe(START_CASH + 20);
  });
  it("gives another roll on doubles, even after buying", () => {
    const g = game();
    roll(g, dice(4, 4), 0); // Labuan Bajo
    expect(g.phase).toBe("buy");
    choose(g, true, 0);
    expect(g.turn).toBe("a");
    expect(g.phase).toBe("roll");
  });
  it("pays the lap bonus when you pass Start", () => {
    const g = game();
    g.pos.a = 31;
    g.owner[2] = null;
    roll(g, dice(2, 3), 0); // lands on the gift at 2
    expect(g.pos.a).toBe(2);
    expect(g.cash.a).toBeGreaterThanOrEqual(START_CASH + LAP_BONUS + 50);
  });
  it("sends three doubles in a row to jail, and jail costs a turn", () => {
    const g = game(3);
    g.streak = 2;
    roll(g, dice(5, 5), 0);
    expect(g.pos.a).toBe(JAIL);
    expect(g.turn).toBe("b");
    g.phase = "roll";
    roll(g, dice(1, 3, 3), 0); // Pelabuhan: an offer
    choose(g, false, 0);
    expect(g.turn).toBe("c");
    roll(g, dice(1, 3, 4), 0); // same port
    choose(g, false, 0);
    expect(g.turn).toBe("b"); // a sat that round out
    expect(g.log.some((e) => e.kind === "skip" && e.by === "a")).toBe(true);
  });
  it("sells your spaces when you can't pay, then bankrupts you", () => {
    const g = game(3);
    g.owner[32] = "b";
    g.owner[33] = "b";
    g.level[33] = 3;
    g.owner[1] = "a";
    g.cash.a = 100;
    g.pos.a = 26;
    roll(g, dice(3, 4), 0); // Menteng with a full set and a hotel
    expect(g.out).toEqual(["a"]);
    expect(g.owner[1]).toBe(null);
    expect(g.cash.a).toBe(0);
    expect(g.cash.b).toBe(START_CASH + 100 + 36);
    expect(g.turn).toBe("b");
  });
  it("ends when one player is left", () => {
    const g = game(2);
    leaveGame(g, "b", 0);
    expect(g.done?.winners).toEqual(["a"]);
  });
});

describe("whole games", () => {
  it("played by bots always finish with money accounted for", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed);
      const g: BoomGame = newGame(["x", "bot1", "bot2", "y"].slice(0, 2 + (seed % 3)), 30, 0);
      let steps = 0;
      while (!g.done && steps++ < 5000) {
        if (g.phase === "roll") roll(g, rng, 0);
        else choose(g, botWants(g), 0);
        for (const p of g.players) expect(g.cash[p]).toBeGreaterThanOrEqual(0);
        for (const p of g.out) expect(g.owner.includes(p)).toBe(false);
        if (!g.done) expect(active(g)).toContain(g.turn);
      }
      expect(g.done).toBeTruthy();
      expect(g.done!.winners.length).toBeGreaterThan(0);
      for (const p of active(g)) expect(g.done!.worth[p]).toBe(worthOf(g, p));
    }
  });
  it("move on when the clock runs out", () => {
    const g = game();
    onDeadline(g, dice(1, 2), 0);
    expect(g.phase).toBe("buy");
    onDeadline(g, dice(1, 2), 0);
    expect(g.owner[3]).toBe(null); // a person who doesn't answer passes on the offer
    expect(g.turn).toBe("b");
    expect(priceOf(3)).toBe(60);
  });
});
