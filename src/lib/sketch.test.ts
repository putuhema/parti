import { describe, expect, it } from "vitest";
import { ART, artLines } from "../../convex/lib/sketch/art";
import { BOT, allFinished, bookPicture, cleanStrokes, finishOwnPicture, givesAway, leaveGame, matchScore, newGame, nextRound, resultOf, reveal } from "../../convex/lib/sketch/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Copy lines, moved by (dx, dy) and scaled around the canvas centre. */
const copy = (lines: number[][], dx = 0, dy = 0, scale = 1) => lines.map((s) => s.map((v, i) => Math.round(500 + (v - 500) * scale + (i % 2 ? dy : dx))));

describe("picture book", () => {
  it("every picture has lines on the canvas, clues, and clues that don't give it away", () => {
    const ids = new Set<string>();
    for (const art of ART) {
      expect(ids.has(art.id)).toBe(false);
      ids.add(art.id);
      const lines = artLines(art);
      expect(lines.length).toBeGreaterThan(0);
      for (const s of lines) for (const v of s) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1000);
      }
      expect(art.clues.length).toBeGreaterThanOrEqual(3);
      const pic = { word: art.word, lines, art: art.id };
      for (const c of art.clues) expect(givesAway(pic, c), `${art.id}: ${c}`).toBeNull();
    }
  });

  it("does not repeat pictures in a game until the book runs out", () => {
    const rng = seeded(4);
    const used: string[] = [];
    for (let i = 0; i < ART.length; i++) used.push(bookPicture(rng, used).art!);
    expect(new Set(used).size).toBe(ART.length);
  });

  it("blocks clues that say the answer", () => {
    const pic = bookPicture(() => 0, []); // banana
    expect(pic.word).toBe("banana");
    expect(givesAway(pic, "It's a Banana!")).toBe("banana");
    expect(givesAway(pic, "two bananas")).toBe("banana");
    expect(givesAway(pic, "b a n a n a")).toBe("banana");
    expect(givesAway(pic, "a pisang")).toBe("pisang");
    expect(givesAway(pic, "a long yellow curve")).toBeNull();
    expect(givesAway({ word: "ice cream", lines: [] }, "I scream for ice cream")).toBe("ice cream");
  });
});

describe("sketch scoring", () => {
  const pic = artLines(ART.find((a) => a.id === "house")!);
  it("scores a careful copy near 100", () => {
    expect(matchScore(pic, pic)).toBeGreaterThanOrEqual(95);
  });
  it("mostly forgives the right drawing in the wrong size or place", () => {
    const s = matchScore(pic, copy(pic, 120, 80, 0.6));
    expect(s).toBeGreaterThan(55);
    expect(s).toBeLessThan(95);
  });
  it("gives little for a different picture, a scribble, or nothing", () => {
    expect(matchScore(pic, [])).toBe(0);
    expect(matchScore(pic, artLines(ART.find((a) => a.id === "balloon")!))).toBeLessThan(40);
    expect(matchScore(pic, [[0, 0, 1000, 0, 1000, 1000, 0, 1000, 0, 0]])).toBeLessThan(35);
  });
  it("cleans bad input", () => {
    expect(cleanStrokes([[5000, -3, 10, 20, 7], []])).toEqual([[1000, 0, 10, 20]]);
  });
});

describe("sketch rounds", () => {
  it("rotates the describer and adds up scores", () => {
    const rng = seeded(11);
    const g = newGame(["a", "b"], "book", 0, rng, 0, 0);
    expect(g.order).toEqual(["a", "b", "a", "b"]);
    expect(g.picture.word).not.toBe("");
    g.finished = ["b"];
    expect(allFinished(g)).toBe(true);
    reveal(g, { b: g.picture.lines }, 1000);
    expect(resultOf(g, 0)!.scores.b).toBeGreaterThanOrEqual(95);
    expect(g.totals.a).toBe(resultOf(g, 0)!.describerScore);
    nextRound(g, rng, 2000);
    expect(g.order[g.round]).toBe("b");
    for (let i = 0; i < 3; i++) { reveal(g, {}, 0); nextRound(g, rng, 0); }
    expect(g.done?.reason).toBe("rounds");
  });

  it("lets the describer draw their own picture", () => {
    const rng = seeded(3);
    const g = newGame(["a", "b"], "own", 0, rng, 0, 0);
    expect(g.phase).toBe("sketch");
    const mine = [[100, 100, 300, 100, 500, 100, 700, 100, 900, 100, 900, 500, 900, 900, 500, 900, 100, 900, 100, 500, 100, 100]];
    finishOwnPicture(g, mine, "  big box ", rng, 0);
    expect(g.phase).toBe("draw");
    expect(g.picture).toEqual({ word: "big box", lines: mine });
    reveal(g, { b: mine }, 0);
    expect(g.totals.b).toBeGreaterThan(95);
  });

  it("uses a book picture when the describer draws nothing", () => {
    const g = newGame(["a", "b"], "own", 0, seeded(3), 0, 0);
    finishOwnPicture(g, [], "", seeded(3), 0);
    expect(g.phase).toBe("draw");
    expect(g.picture.art).toBeDefined();
  });

  it("plays solo with the bot describing book pictures", () => {
    const g = newGame(["me"], "own", 0, seeded(5), 0, 0);
    expect(g.order.every((p) => p === BOT)).toBe(true);
    expect(g.phase).toBe("draw");
    expect(g.clues.length).toBeGreaterThanOrEqual(3);
    reveal(g, { me: g.picture.lines }, 0);
    expect(g.totals.me).toBeGreaterThan(90);
  });

  it("handles players leaving", () => {
    const g = newGame(["a", "b", "c"], "book", 0, seeded(2), 0, 0);
    expect(leaveGame(g, "a")).toBe("reveal");
    expect(leaveGame(g, "b")).toBeNull();
    expect(g.done?.reason).toBe("left");
    const h = newGame(["a", "b", "c"], "own", 0, seeded(2), 0, 0);
    expect(leaveGame(h, "a")).toBe("skip");
  });
});
