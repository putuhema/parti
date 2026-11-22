import { describe, expect, it } from "vitest";
import { PALETTE, PROMPTS } from "../../convex/lib/emoji/content";
import { GAP, ROUND_MS, choose, editClue, finishRound, giverOf, guesserOf, isEmoji, judge, letterHint, makeGuess, newGame, nextRound, pointsFor } from "../../convex/lib/emoji/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("emoji content", () => {
  it("prompts are unique and every palette emoji is allowed", () => {
    const all = Object.values(PROMPTS).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const tab of PALETTE) for (const e of tab.emojis) expect(isEmoji(e), e).toBe(true);
  });
});

describe("judging guesses", () => {
  it("accepts small typos, case and a missing 'the'", () => {
    expect(judge("lion king", "The Lion King")).toBe("right");
    expect(judge("NASI GORENG!", "Nasi goreng")).toBe("right");
    expect(judge("nasi gorng", "Nasi goreng")).toBe("right");
    expect(judge("raining cats and dog", "Raining cats and dogs")).toBe("right");
  });
  it("says when you're close, and when you're not", () => {
    expect(judge("raining dogs", "Raining cats and dogs")).toBe("close");
    expect(judge("nasi", "Nasi goreng")).toBe("close");
    expect(judge("soto", "Nasi goreng")).toBe("wrong");
    expect(judge("pizza", "Sushi")).toBe("wrong");
  });
  it("hints letters, and only lets emoji into the clue", () => {
    expect(letterHint("Nasi goreng")).toBe("N _ _ _   G _ _ _ _ _");
    expect(letterHint("Spider-Man")).toBe("S _ _ _ _ _ - _ _ _");
    expect(isEmoji("A")).toBe(false);
    expect(isEmoji("🍕🍕")).toBe(false);
    expect(isEmoji("1️⃣")).toBe(true);
    expect(isEmoji("👨‍👩‍👧")).toBe(true);
  });
});

describe("emoji game", () => {
  it("plays rounds, swaps roles, and scores faster guesses higher", () => {
    const g = newGame(["ana", "ben"], ["food"], 2, seeded(1));
    expect(g.choices).toHaveLength(3);
    expect(giverOf(g)).toBe("ana");
    expect(choose(g, "ben", 0, 0)).toMatch(/partner/);
    expect(choose(g, "ana", 0, 1000)).toBeNull();
    const answer = g.answer!.text;
    expect(editClue(g, "ana", { add: "🍕" })).toBeNull();
    expect(editClue(g, "ana", { add: GAP })).toBeNull();
    expect(editClue(g, "ana", { add: GAP })).toBeNull(); // a second gap in a row is ignored
    expect(editClue(g, "ana", { add: "x" })).toMatch(/emoji/);
    expect(g.clue).toEqual(["🍕", GAP]);
    expect(editClue(g, "ben", { back: true })).toMatch(/clue-giver/);
    expect(makeGuess(g, "ben", "something else entirely", 5000)).toBe("wrong");
    expect(makeGuess(g, "ben", answer, 1000 + 9000)).toBe("right");
    expect(g.phase).toBe("reveal");
    expect(g.score).toBe(pointsFor(9000));
    expect(pointsFor(0)).toBe(100);
    expect(pointsFor(ROUND_MS)).toBe(50);
    nextRound(g, "ana", seeded(2));
    nextRound(g, "ben", seeded(2));
    expect(giverOf(g)).toBe("ben");
    expect(guesserOf(g)).toBe("ana");
    expect(g.choices.map((c) => c.text)).not.toContain(answer);
    choose(g, "ben", 0, 0);
    finishRound(g, false, ROUND_MS);
    expect(g.results[1]).toMatchObject({ solved: false, points: 0 });
    nextRound(g, "ana", seeded(3));
    nextRound(g, "ben", seeded(3));
    expect(g.done?.reason).toBe("end");
  });
});
