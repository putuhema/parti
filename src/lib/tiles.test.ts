/**
 * Tile Town rules: placement checks, scoring, letter tables, and the bot.
 * Run with `npm test`.
 */
import { describe, expect, it } from "vitest";
import { parseDefs, plain, rootOf } from "../../convex/defs";
import { botMoves } from "../../convex/lib/tiles/bot";
import { BONUS, CELLS, CENTER, FULL_RACK_BONUS, LETTERS, SIZE, deriveLetters, judge, newBag, takeFrom, valueOf } from "../../convex/lib/tiles/rules";
import { mulberry32 } from "../../convex/lib/sudoku";
import { isWord } from "../../convex/lib/words/dict";
import { EN_WORDS } from "../../convex/lib/words/en";
import { ID_WORDS } from "../../convex/lib/words/id";

const at = (r: number, c: number) => r * SIZE + c;
const blank = () => Array<string>(CELLS).fill("");
const lay = (board: string[], r: number, c: number, word: string, down = false) => {
  [...word].forEach((l, k) => (board[down ? at(r + k, c) : at(r, c + k)] = l));
  return board;
};
const tiles = (r: number, c: number, word: string, down = false) => [...word].map((l, k) => ({ i: down ? at(r + k, c) : at(r, c + k), l }));

describe("letter tables", () => {
  it("match the frequencies in our word lists", () => {
    expect(deriveLetters(EN_WORDS.split(" "))).toEqual(LETTERS.en);
    expect(deriveLetters(ID_WORDS.split(" "))).toEqual(LETTERS.id);
  });
  it("make a bag of about 85 tiles", () => {
    expect(newBag("en", mulberry32(1)).length).toBe(85);
    expect(newBag("id", mulberry32(1)).length).toBe(86);
  });
});

describe("bonus squares", () => {
  it("are symmetric under quarter turns", () => {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) expect(BONUS[at(c, SIZE - 1 - r)]).toBe(BONUS[at(r, c)]);
  });
  it("put the start square in the middle", () => {
    expect(BONUS[CENTER]).toBe("st");
    expect(BONUS.filter((b) => b === "tw").length).toBe(4);
  });
});

describe("judge", () => {
  it("needs the first word to cover the start square", () => {
    expect(judge(blank(), tiles(0, 0, "cat"), "en")).toEqual({ ok: false, error: "The first word must cover the ★" });
    const j = judge(blank(), tiles(5, 4, "cat"), "en");
    expect(j.ok && j.words.map((w) => w.word)).toEqual(["cat"]);
    // c4 + a2 + t3 = 9, doubled by the start square
    expect(j.ok && j.score).toBe((valueOf("en", "c") + valueOf("en", "a") + valueOf("en", "t")) * 2);
  });

  it("rejects tiles out of line or with gaps", () => {
    expect(judge(blank(), [{ i: at(5, 5), l: "a" }, { i: at(6, 6), l: "b" }], "en").ok).toBe(false);
    const j = judge(blank(), [{ i: at(5, 4), l: "a" }, { i: at(5, 6), l: "b" }], "en");
    expect(j).toEqual({ ok: false, error: "No gaps between your tiles" });
  });

  it("lets a gap be filled by a tile already on the board", () => {
    const board = lay(blank(), 3, 5, "cat", true); // C(3,5) A(4,5) T(5,5)
    const j = judge(board, [{ i: at(4, 4), l: "b" }, { i: at(4, 6), l: "t" }], "en");
    expect(j.ok && j.words.map((w) => w.word)).toEqual(["bat"]);
  });

  it("needs later words to connect", () => {
    const board = lay(blank(), 5, 4, "cat");
    expect(judge(board, tiles(0, 0, "dog"), "en")).toEqual({ ok: false, error: "Connect to the tiles on the board" });
  });

  it("finds cross words and refuses two-letter runs", () => {
    const board = lay(blank(), 5, 4, "cat");
    // S under the T makes "ts"? No: T(5,6) + S(6,6) down is a 2-letter run.
    expect(judge(board, [{ i: at(6, 6), l: "s" }], "en").ok).toBe(false);
    // CATS across.
    const j = judge(board, [{ i: at(5, 7), l: "s" }], "en");
    expect(j.ok && j.words.map((w) => w.word)).toEqual(["cats"]);
  });

  it("only counts bonus squares under new tiles", () => {
    const board = lay(blank(), 5, 4, "cat"); // covers the start square
    const j = judge(board, [{ i: at(5, 7), l: "s" }], "en");
    const plain = ["c", "a", "t", "s"].reduce((s, l) => s + valueOf("en", l), 0);
    // S lands on a double letter; the start square under the old C no longer counts.
    expect(BONUS[at(5, 7)]).toBe("dl");
    expect(j.ok && j.score).toBe(plain + valueOf("en", "s"));
  });

  it("pays a bonus for using all six tiles", () => {
    const j = judge(blank(), tiles(5, 3, "planet"), "en");
    expect(j.ok && j.bonus).toBe(FULL_RACK_BONUS);
  });
});

describe("takeFrom", () => {
  it("removes one for one", () => {
    expect(takeFrom(["a", "b", "a"], ["a", "a"])).toEqual(["b"]);
    expect(takeFrom(["a"], ["a", "a"])).toBeNull();
  });
});

describe("bot", () => {
  it("opens with real words over the start square", () => {
    const moves = botMoves(blank(), ["s", "t", "a", "r", "e", "n"], "en", mulberry32(7));
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.tiles.some((t) => t.i === CENTER)).toBe(true);
      expect(m.words.every((w) => isWord(w, "en"))).toBe(true);
    }
  });

  it("builds off the board in Indonesian", () => {
    const board = lay(blank(), 5, 3, "rumah");
    const moves = botMoves(board, ["a", "k", "n", "i", "s", "u"], "id", mulberry32(3));
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      const j = judge(board, m.tiles, "id");
      expect(j.ok).toBe(true);
      expect(m.words.every((w) => isWord(w, "id"))).toBe(true);
    }
  });
});

describe("word meanings", () => {
  it("strip Wiktionary HTML to plain text", () => {
    expect(plain('The sharp, quick <a href="/wiki/sound">sound</a> of a string')).toBe("The sharp, quick sound of a string");
    expect(plain('<a href="/wiki/house">house</a>:\n<ol><li>abode</li><li>building</li></ol>')).toBe("house: abode; building");
  });
  it("keep only the game's language", () => {
    const body = {
      ms: [{ partOfSpeech: "Noun", definitions: [{ definition: "Malay house" }] }],
      id: [{ partOfSpeech: "Noun", definitions: [{ definition: "<b>house</b>" }, { definition: "" }] }],
    };
    expect(parseDefs(body, "id")).toEqual([{ pos: "noun", text: "house" }]);
    expect(parseDefs(body, "en")).toEqual([]);
    expect(parseDefs(null, "en")).toEqual([]);
  });
});

describe("word roots", () => {
  it("spots form-of meanings", () => {
    expect(rootOf([{ pos: "verb", text: "active of makan" }], "memakan")).toBe("makan");
    expect(rootOf([{ pos: "noun", text: "plural of crib" }], "cribs")).toBe("crib");
    expect(rootOf([{ pos: "noun", text: "A small bed with high sides, for a baby" }], "crib")).toBeNull();
  });
});
