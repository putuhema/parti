import { describe, expect, it } from "vitest";
import { STARTERS, TWISTS, WORDS } from "../../convex/lib/story/content";
import { carryOn, isSecret, newGame, pieces, readerOf, spot, uses, words, writeLine, writerOf } from "../../convex/lib/story/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("story content", () => {
  it("words are unique single words; starters and twists exist", () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const w of WORDS) expect(words(w)).toEqual([w]);
    expect(STARTERS.length).toBeGreaterThan(10);
    expect(TWISTS.length).toBeGreaterThan(10);
  });
});

describe("story words", () => {
  it("splits a line into tappable words and keeps the punctuation", () => {
    const text = "The grumpy penguin's umbrella flew—away!";
    expect(words(text)).toEqual(["The", "grumpy", "penguin's", "umbrella", "flew", "away"]);
    expect(pieces(text).map((p) => p.text).join("")).toBe(text);
    expect(pieces(text).filter((p) => p.word !== null)).toHaveLength(6);
  });
  it("counts plurals and possessives as the secret", () => {
    expect(isSecret("Penguins", "penguin")).toBe(true);
    expect(isSecret("penguin's", "penguin")).toBe(true);
    expect(isSecret("jellies", "jelly")).toBe(true);
    expect(isSecret("pen", "penguin")).toBe(false);
    expect(uses("Two LLAMAS walked in.", "llama")).toBe(true);
  });
});

describe("story game", () => {
  it("takes turns writing and spotting, scores, and ends", () => {
    const g = newGame(["ana", "ben"], 6, 0, seeded(1));
    expect(g.offers).toHaveLength(3);
    expect(Object.keys(g.twists)).toHaveLength(1);
    expect(writerOf(g)).toBe("ana");
    const secret = g.offers[0];
    expect(writeLine(g, "ben", `a ${secret} here`, secret)).toBe("It's not your turn to write");
    expect(writeLine(g, "ana", "no secret in here at all", secret)).toMatch(/needs the word/);
    expect(writeLine(g, "ana", `Then a ${secret} appeared.`, secret)).toBeNull();
    expect(g.phase).toBe("spot");
    expect(spot(g, "ana", 0)).toBe("It's your own line!");
    expect(spot(g, "ben", 2)).toBeNull(); // "Then a <secret>": word 2 is the secret
    expect(g.scores.ben.spots).toBe(1);
    carryOn(g, "ana", seeded(2));
    carryOn(g, "ben", seeded(2));
    expect(writerOf(g)).toBe("ben");
    expect(readerOf(g)).toBe("ana");
    expect(g.offers).not.toContain(secret);
    for (let i = 1; i < 6; i++) {
      const w = writerOf(g), s = g.offers[1];
      expect(writeLine(g, w, `Meanwhile the ${s} was very quiet.`, s)).toBeNull();
      spot(g, readerOf(g), 0); // guesses "Meanwhile": missed
      carryOn(g, "ana", seeded(i));
      carryOn(g, "ben", seeded(i));
    }
    expect(g.done?.reason).toBe("end");
    expect(g.lines).toHaveLength(6);
    expect(g.scores.ana.sneaks + g.scores.ben.sneaks).toBe(5);
    expect(g.lines.some((l) => l.twist)).toBe(true);
  });
});
