import { describe, expect, it } from "vitest";
import { BASE_W, FALL_MS, LIVES, W, autoAct, drop, height, isBot, newGame, placeAt, replaceWithBot, slide, top } from "../../convex/lib/stack/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("sky stack", () => {
  it("slides the block back and forth, half off each side at most", () => {
    const w = 40;
    for (let ms = 0; ms < 20_000; ms += 37) {
      const x = slide(0, 3, w, ms);
      expect(x).toBeGreaterThanOrEqual(-w / 2 - 1e-9);
      expect(x).toBeLessThanOrEqual(W - w / 2 + 1e-9);
    }
    expect(slide(0, 0, w, 0)).toBe(-w / 2); // even turns start on the left
    expect(slide(1, 0, w, 0)).toBe(W - w / 2); // odd turns on the right
  });

  it("slices off the overhang and passes the turn", () => {
    const g = newGame(["a", "b"], 0, seeded(1), 0);
    const first = g.turn;
    const t = top(g);
    expect(placeAt(g, first, t.left + 10, 0)).toBeNull();
    expect(top(g)).toMatchObject({ left: t.left + 10, width: BASE_W - 10, by: first, perfect: false });
    expect(g.turn).not.toBe(first);
    expect(placeAt(g, first, 0, 0)).toMatch(/turn/);
  });

  it("snaps a near-perfect drop and grows after three in a row", () => {
    const g = newGame(["a", "b"], 0, seeded(1), 0);
    placeAt(g, g.turn, top(g).left + 20, 0); // now narrower
    const w = top(g).width;
    for (let i = 0; i < 2; i++) { placeAt(g, g.turn, top(g).left + 1.5, 0); expect(top(g).width).toBe(w); expect(top(g).perfect).toBe(true); }
    placeAt(g, g.turn, top(g).left - 1, 0);
    expect(top(g).width).toBe(w + 6);
  });

  it("crashes on a miss: a heart lost, then a fresh tower", () => {
    const g = newGame(["a", "b"], 0, seeded(1), 0);
    const who = g.turn;
    placeAt(g, who, 99, 0);
    expect(g.phase).toBe("fall");
    expect(g.lives[who]).toBe(LIVES - 1);
    autoAct(g, seeded(2), FALL_MS);
    expect(g.phase).toBe("drop");
    expect(height(g)).toBe(0);
    expect(g.turn).not.toBe(who);
  });

  it("ends a solo game at the first crash with the height built", () => {
    const g = newGame(["a"], 0, seeded(1), 0);
    for (let i = 0; i < 5; i++) placeAt(g, "a", top(g).left, 0);
    expect(g.turn).toBe("a");
    placeAt(g, "a", 99, 0);
    autoAct(g, seeded(2), 0);
    expect(g.done).toMatchObject({ winner: null, height: 5 });
  });

  it("a human drop uses the slide position at that moment", () => {
    const g = newGame(["a"], 0, seeded(1), 0);
    const x = slide(0, 0, BASE_W, 900);
    drop(g, "a", 900, 0);
    expect(top(g).left).toBeCloseTo(Math.abs(x - g.floors[0].left) <= 2 ? g.floors[0].left : Math.max(x, g.floors[0].left), 1);
  });

  it("plays 30 whole bot games to a single winner", () => {
    for (let s = 1; s <= 30; s++) {
      const r = seeded(s);
      const g = newGame([], 2 + (s % 4), r, 0);
      let guard = 5000;
      while (!g.done && guard--) autoAct(g, r, 0);
      expect(g.done?.winner).toBeTruthy();
      expect(g.best.height).toBeGreaterThan(0);
    }
  });

  it("hands a leaving player's seat to a bot", () => {
    const g = newGame(["a", "b"], 0, seeded(3), 0);
    replaceWithBot(g, "a");
    expect(g.players.filter(isBot)).toHaveLength(1);
    expect(g.players).not.toContain("a");
  });
});
