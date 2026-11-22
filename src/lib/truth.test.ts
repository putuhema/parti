import { describe, expect, it } from "vitest";
import { THEMES, ask, guess, newGame, next, stats, truthsOf, write } from "../../convex/lib/truth/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const A = ["I have a pet frog", "I can juggle", "I was born in Bali"];
const B = ["I've never seen snow", "I hate rice", "I sang on TV once"];

describe("truth or tale", () => {
  it("cycles themes for more rounds than chosen", () => {
    const g = newGame(["ana", "ben"], ["food", "love"], 5, seeded(1));
    expect(g.themes).toHaveLength(5);
    expect(new Set(g.themes)).toEqual(new Set(["food", "love"]));
    expect(newGame(["ana", "ben"], [], 3, seeded(1)).themes.every((t) => THEMES.some((x) => x.id === t))).toBe(true);
  });

  it("checks what you write", () => {
    const g = newGame(["ana", "ben"], ["food"], 3, seeded(2));
    expect(write(g, "ana", ["a", "bb", "ccc"], 0, seeded(1))).toMatch(/few more words/);
    expect(write(g, "ana", ["same one", "Same one", "other one"], 0, seeded(1))).toMatch(/different/);
    expect(write(g, "ana", A, 3, seeded(1))).toMatch(/lie/);
    expect(write(g, "ana", A, 1, seeded(1))).toBeNull();
    expect(write(g, "ana", A, 1, seeded(1))).toBe("Already locked in");
    expect(g.phase).toBe("write");
  });

  it("plays a round: bets go to whoever was right, stories can be asked for, and truths go to the vault", () => {
    const g = newGame(["ana", "ben"], ["food"], 1, seeded(3));
    write(g, "ana", A, 1, seeded(1)); // the lie: "I can juggle"
    write(g, "ben", B, 2, seeded(2)); // the lie: "I sang on TV once"
    expect(g.phase).toBe("guess");
    expect(guess(g, "ana", 2, 3)).toBeNull(); // spots Ben's lie: +3 Ana
    expect(guess(g, "ben", 0, 2)).toBeNull(); // fooled: +2 Ana
    expect(g.phase).toBe("reveal");
    expect(g.scores).toEqual({ ana: 5, ben: 0 });
    expect(ask(g, "ben", 1)).toBe("Pick one of their truths");
    expect(ask(g, "ben", 2)).toBeNull();
    const truths = truthsOf(g.results[0]);
    expect(truths.map((t) => t.text).sort()).toEqual(["I have a pet frog", "I hate rice", "I was born in Bali", "I've never seen snow"].sort());
    expect(stats(g)).toEqual({ ana: { spotted: 1, fooled: 1 }, ben: { spotted: 0, fooled: 0 } });
    next(g, "ana");
    next(g, "ben");
    expect(g.done?.reason).toBe("end");
  });
});
