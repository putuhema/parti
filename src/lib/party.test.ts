import { describe, expect, it } from "vitest";
import { COUNTDOWN_MS, MICROS, leaveGame, microOf, newGame, nextRound, pickOrder, placePoints, reveal, rng, submit, winners } from "../../convex/lib/party/rules";

describe("party blitz", () => {
  it("seeded randomness is the same on every phone", () => {
    const a = rng(42), b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(rng(1)()).not.toBe(rng(2)());
  });

  it("never plays the same minigame twice in a row, and uses them all", () => {
    const order = pickOrder(30, rng(7));
    expect(order).toHaveLength(30);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
    expect(new Set(order).size).toBe(MICROS.length);
  });

  it("gives 3-2-1 points by place, with ties sharing and zeros earning nothing", () => {
    expect(placePoints({ a: 10, b: 7, c: 7, d: 3 }, ["a", "b", "c", "d"])).toEqual({ a: 3, b: 2, c: 2, d: 1 });
    expect(placePoints({ a: 0, b: 5 }, ["a", "b"])).toEqual({ a: 0, b: 3 });
    expect(placePoints({ a: 5 }, ["a"])).toEqual({ a: 1 });
  });

  it("plays rounds: submit, reveal, next, finish", () => {
    const g = newGame(["ana", "ben"], 2, rng(3), 0);
    const micro = microOf(g.order[0]);
    expect(submit(g, "ana", 0, 5, 0)).toBe("Wait for the countdown");
    expect(submit(g, "ana", 0, micro.cap + 1, COUNTDOWN_MS)).toBe("That score isn't possible");
    expect(submit(g, "ana", 0, 9, COUNTDOWN_MS + 100)).toBeNull();
    expect(submit(g, "ana", 0, 99, COUNTDOWN_MS + 200)).toBeNull(); // only the first counts
    expect(g.scores.ana).toBe(9);
    reveal(g, 10_000, ["ana"]); // ben never submitted: 0
    expect(g.results[0]).toMatchObject({ scores: { ana: 9, ben: 0 }, points: { ana: 3, ben: 0 }, records: ["ana"] });
    nextRound(g, 20_000);
    expect(g.round).toBe(1);
    expect(g.phase).toBe("play");
    submit(g, "ana", 1, 1, 30_000);
    submit(g, "ben", 1, 2, 30_000);
    reveal(g, 31_000);
    nextRound(g, 40_000);
    expect(g.done?.reason).toBe("end");
    expect(winners(g)).toEqual(["ana"]);
  });

  it("carries on when someone leaves", () => {
    const g = newGame(["ana", "ben"], 3, rng(4), 0);
    submit(g, "ana", 0, 3, COUNTDOWN_MS);
    leaveGame(g, "ben", COUNTDOWN_MS);
    expect(g.phase).toBe("reveal");
    expect(g.players).toEqual(["ana"]);
  });
});
