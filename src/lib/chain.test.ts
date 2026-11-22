import { describe, expect, it } from "vitest";
import { PROMPTS, advance, allIn, awards, chainOf, cleanStrokes, dealt, isDraw, matches, newGame, nextInAlbum, ownerOf, steps, toggleLike } from "../../convex/lib/chain/rules";

describe("scribble chain", () => {
  it("gives every player a different chain at every step", () => {
    for (const n of [2, 3, 5, 8]) {
      const g = newGame(Array.from({ length: n }, (_, i) => `p${i}`), 4, 1, 0);
      for (let s = 0; s < steps(g); s++) {
        const owners = Array.from({ length: n }, (_, c) => ownerOf(g, c, s));
        expect(new Set(owners).size).toBe(n);
        for (const p of g.players) expect(ownerOf(g, chainOf(g, p, s), s)).toBe(p);
      }
    }
  });

  it("never lets a guesser see the phrase in a two-player game", () => {
    const g = newGame(["a", "b"], 4, 1, 0);
    for (let c = 0; c < 2; c++) {
      const starter = ownerOf(g, c, 0);
      for (let s = 1; s < steps(g); s++) if (!isDraw(s)) expect(ownerOf(g, c, s)).not.toBe(starter);
    }
  });

  it("deals three different phrases to every seat", () => {
    const all = Array.from({ length: 8 }, (_, s) => dealt(42, s)).flat();
    expect(all).toHaveLength(24);
    expect(new Set(all).size).toBe(24);
    for (const p of all) expect(PROMPTS).toContain(p);
    expect(dealt(42, 3)).toEqual(dealt(42, 3));
  });

  it("plays through every step, then replays each chain and ends", () => {
    const g = newGame(["a", "b", "c"], 2, 1, 0);
    for (let s = 0; s < 4; s++) {
      expect(g.phase).toBe("play");
      g.submitted = [...g.players];
      expect(allIn(g)).toBe(true);
      advance(g, 1000);
    }
    expect(g.phase).toBe("album");
    expect(nextInAlbum(g, { chain: 0, shown: 2 })).toBe(false); // stale tap
    let taps = 0;
    while (g.phase === "album") { nextInAlbum(g, { ...g.album }); taps++; }
    expect(taps).toBe(3 * 4);
    expect(g.done?.reason).toBe("end");
  });

  it("matches guesses on key words, forgiving plurals and filler words", () => {
    expect(matches("cat doing yoga", "a cat doing yoga")).toBe(true);
    expect(matches("yoga cats", "a cat doing yoga")).toBe(true);
    expect(matches("the dog", "a cat doing yoga")).toBe(false);
    expect(matches("🤷", "a cat doing yoga")).toBe(false);
    expect(matches("bunnies", "a bunny")).toBe(true);
  });

  it("counts loves for the artist and guesser awards, never your own", () => {
    const g = newGame(["a", "b"], 2, 1, 0);
    g.phase = "album";
    g.album = { chain: 1, shown: 4 };
    const artist = ownerOf(g, 0, 0);
    const fan = g.players.find((p) => p !== artist)!;
    expect(toggleLike(g, artist, 0, 0)).toMatch(/own/);
    expect(toggleLike(g, fan, 0, 0)).toBeNull();
    g.nailed["0:1"] = true;
    const a = awards(g);
    expect(a.find((x) => x.kind === "artist")).toEqual({ kind: "artist", who: [artist], n: 1 });
    expect(a.find((x) => x.kind === "team")?.n).toBe(1);
    expect(toggleLike(g, fan, 0, 0)).toBeNull(); // unlove
    expect(g.likes["0:0"]).toEqual([]);
  });

  it("cleans strokes: clamps points and colours, drops junk", () => {
    expect(cleanStrokes([[99, -5, 2000, 10.4, 20.6], [1], [2, 5]])).toEqual([[7, 0, 1000, 10, 21]]);
  });
});
