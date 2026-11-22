import { describe, expect, it } from "vitest";
import { FUSE_MAX, FUSE_MIN, MIN_HOLD_MS, alive, explode, leaveGame, newGame, nextBomb, pass } from "../../convex/lib/potato/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("hot potato", () => {
  it("lights a bomb with a fuse in range on a random player", () => {
    const g = newGame(["a", "b", "c"], 2, seeded(1), 1000);
    expect(g.players).toContain(g.holder);
    expect(g.explodeAt - 1000).toBeGreaterThanOrEqual(FUSE_MIN);
    expect(g.explodeAt - 1000).toBeLessThan(FUSE_MAX);
    expect(g.deadline).toBe(g.explodeAt);
  });

  it("only the holder can pass, not too fast, not to themselves", () => {
    const g = newGame(["a", "b"], 1, seeded(2), 0);
    const h = g.holder, other = h === "a" ? "b" : "a";
    expect(pass(g, other, h, seeded(3), 2000)).toMatch(/not holding/);
    expect(pass(g, h, other, seeded(3), MIN_HOLD_MS - 1)).toBe("Not so fast!");
    expect(pass(g, h, h, seeded(3), 2000)).toMatch(/someone else/);
    expect(pass(g, h, other, seeded(3), 2000)).toBeNull();
    expect(g.holder).toBe(other);
    expect(g.passes).toBe(1);
    expect(pass(g, other, h, seeded(3), g.explodeAt)).toMatch(/Too late/);
  });

  it("explodes, takes a life, restarts with the loser, and ends with one left", () => {
    const g = newGame(["a", "b", "c"], 1, seeded(4), 0);
    const first = g.holder;
    explode(g, g.explodeAt);
    expect(g.lives[first]).toBe(0);
    expect(g.phase).toBe("boom");
    expect(g.out).toEqual([first]);
    nextBomb(g, seeded(5), 50_000);
    expect(alive(g)).not.toContain(first);
    expect(g.holder).not.toBe(first);
    const second = g.holder;
    explode(g, g.explodeAt);
    expect(g.done?.winner).toBe(alive(g)[0]);
    expect(g.out).toEqual([first, second]);
  });

  it("a player with lives left starts the next bomb", () => {
    const g = newGame(["a", "b"], 2, seeded(6), 0);
    const h = g.holder;
    explode(g, g.explodeAt);
    nextBomb(g, seeded(7), 60_000);
    expect(g.holder).toBe(h);
    expect(g.bomb).toBe(2);
  });

  it("passes the bomb on if the holder leaves", () => {
    const g = newGame(["a", "b", "c"], 2, seeded(8), 0);
    const h = g.holder;
    leaveGame(g, h, seeded(9), 1000);
    expect(g.holder).not.toBe(h);
    expect(alive(g)).toHaveLength(2);
  });
});
