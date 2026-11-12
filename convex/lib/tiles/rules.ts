/**
 * Tile Town: a crossword-tile game on an 11×11 board. Shared by the server and phones,
 * so the score preview on a phone is exactly what the server will award.
 */

export const SIZE = 11;
export const CELLS = SIZE * SIZE;
export const CENTER = 60; // row 5, col 5
export const RACK = 6;
export const FULL_RACK_BONUS = 25; // play all six tiles in one turn
export const MIN_WORD = 3; // our word lists start at 3 letters, so every word must too
export const TILES_MAX = 4;
export const TURN_MS = 120_000;

export type TileLang = "en" | "id";

/** "" plain, "dl" double letter, "dw" double word, "tw" triple word, "st" the start square (double word). */
export type Bonus = "" | "dl" | "dw" | "tw" | "st";

const at = (r: number, c: number) => r * SIZE + c;
/** All four 90° turns of a square, so the pattern stays symmetric. */
function turns(r: number, c: number) {
  const m = SIZE - 1;
  return [at(r, c), at(c, m - r), at(m - r, m - c), at(m - c, r)];
}

/**
 * Our own bonus pattern: triple words in the middle of each edge, double words on two
 * diagonal rings, and double letters in a diamond around the start and at the corners.
 */
export const BONUS: Bonus[] = (() => {
  const b: Bonus[] = Array(CELLS).fill("");
  const put = (kind: Bonus, cells: [number, number][]) => cells.forEach(([r, c]) => turns(r, c).forEach((i) => (b[i] = kind)));
  put("tw", [[0, 5]]);
  put("dw", [[1, 1], [3, 3], [2, 8]]);
  put("dl", [[0, 0], [1, 5], [3, 5], [4, 4], [0, 8], [2, 3]]);
  b[CENTER] = "st";
  return b;
})();

export const BONUS_LABEL: Record<Bonus, string> = { "": "", dl: "2L", dw: "2W", tw: "3W", st: "★" };

// ---------- Letters ----------
export interface LetterTable {
  value: Record<string, number>;
  count: Record<string, number>;
}

const BAG_TARGET = 84;

/**
 * Letter values and tile counts from how often each letter shows up in a word list.
 * Common letters are worth 1; every halving of frequency adds about 2 points, up to 10.
 * Counts share out about 84 tiles by frequency, at least one of each letter that's used.
 */
export function deriveLetters(words: Iterable<string>, maxLen = 8): LetterTable {
  const seen: Record<string, number> = {};
  let n = 0;
  for (const w of words) {
    if (w.length > maxLen) continue;
    for (const ch of w) {
      seen[ch] = (seen[ch] ?? 0) + 1;
      n++;
    }
  }
  const letters = Object.keys(seen).filter((l) => seen[l] / n >= 0.0005).sort();
  const top = Math.max(...letters.map((l) => seen[l]));
  const value: Record<string, number> = {};
  const count: Record<string, number> = {};
  for (const l of letters) {
    value[l] = Math.max(1, Math.min(10, Math.round(1 + 2 * Math.log2(top / seen[l]))));
    count[l] = Math.max(1, Math.round((seen[l] / n) * BAG_TARGET));
  }
  return { value, count };
}

/** deriveLetters() over our English and Indonesian word lists (checked by tests). */
export const LETTERS: Record<TileLang, LetterTable> = {
  en: {
    value: { a: 2, b: 6, c: 4, d: 4, e: 1, f: 7, g: 5, h: 5, i: 2, j: 10, k: 7, l: 3, m: 5, n: 3, o: 3, p: 5, q: 10, r: 2, s: 2, t: 3, u: 4, v: 8, w: 7, x: 10, y: 6, z: 10 },
    count: { a: 7, b: 2, c: 3, d: 3, e: 10, f: 1, g: 2, h: 2, i: 6, j: 1, k: 1, l: 5, m: 2, n: 5, o: 5, p: 3, q: 1, r: 6, s: 6, t: 5, u: 3, v: 1, w: 1, x: 1, y: 2, z: 1 },
  },
  id: {
    value: { a: 1, b: 5, c: 8, d: 6, e: 2, f: 10, g: 5, h: 7, i: 3, j: 9, k: 4, l: 4, m: 4, n: 3, o: 5, p: 5, r: 3, s: 4, t: 4, u: 4, v: 10, w: 10, y: 10, z: 10 },
    count: { a: 12, b: 3, c: 1, d: 2, e: 8, f: 1, g: 3, h: 1, i: 7, j: 1, k: 5, l: 4, m: 4, n: 6, o: 3, p: 3, r: 5, s: 4, t: 4, u: 5, v: 1, w: 1, y: 1, z: 1 },
  },
};

export const valueOf = (lang: TileLang, l: string) => LETTERS[lang].value[l] ?? 0;
export const rackSum = (lang: TileLang, rack: string[]) => rack.reduce((s, l) => s + valueOf(lang, l), 0);

/** A full bag, shuffled. */
export function newBag(lang: TileLang, rand: () => number) {
  const bag: string[] = [];
  for (const [l, n] of Object.entries(LETTERS[lang].count)) for (let i = 0; i < n; i++) bag.push(l);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// ---------- Placing tiles ----------
export interface Placed {
  i: number; // square index
  l: string; // letter
}

export interface Formed {
  word: string;
  cells: number[];
  score: number;
}

export type Judged = { ok: true; words: Formed[]; score: number; bonus: number } | { ok: false; error: string };

const rowOf = (i: number) => Math.floor(i / SIZE);
const colOf = (i: number) => i % SIZE;

/** The run of letters through square `i` along a direction, with the new tiles laid in. */
function runThrough(get: (i: number) => string, i: number, horizontal: boolean) {
  const step = horizontal ? 1 : SIZE;
  const inLine = (a: number, b: number) => (horizontal ? rowOf(a) === rowOf(b) : true);
  let start = i;
  while (start - step >= 0 && inLine(start - step, i) && get(start - step)) start -= step;
  const cells: number[] = [];
  for (let k = start; k < CELLS && inLine(k, i) && get(k); k += step) cells.push(k);
  return cells;
}

/**
 * Check a set of new tiles against the board and score it. Works out every word formed;
 * whether those words are real is checked separately (the dictionary lives on the server).
 */
export function judge(board: string[], placed: Placed[], lang: TileLang): Judged {
  if (placed.length === 0) return { ok: false, error: "Place some tiles first" };
  const mine = new Map<number, string>();
  for (const p of placed) {
    if (!Number.isInteger(p.i) || p.i < 0 || p.i >= CELLS) return { ok: false, error: "That square is off the board" };
    if (board[p.i]) return { ok: false, error: "That square is taken" };
    if (mine.has(p.i)) return { ok: false, error: "Two tiles on one square" };
    if (!/^[a-z]$/.test(p.l)) return { ok: false, error: "Unknown tile" };
    mine.set(p.i, p.l);
  }
  const get = (i: number) => mine.get(i) ?? board[i];
  const cells = [...mine.keys()].sort((a, b) => a - b);
  const sameRow = cells.every((c) => rowOf(c) === rowOf(cells[0]));
  const sameCol = cells.every((c) => colOf(c) === colOf(cells[0]));
  if (!sameRow && !sameCol) return { ok: false, error: "Keep your tiles in one line" };
  // A single tile can make its word either way; pick the longer run as the main line.
  let horizontal = sameRow;
  if (cells.length === 1) horizontal = runThrough(get, cells[0], true).length >= runThrough(get, cells[0], false).length;

  const main = runThrough(get, cells[0], horizontal);
  if (!cells.every((c) => main.includes(c))) return { ok: false, error: "No gaps between your tiles" };

  const empty = board.every((x) => !x);
  if (empty) {
    if (!mine.has(CENTER)) return { ok: false, error: "The first word must cover the ★" };
  } else {
    const touches = cells.some((c) => {
      const r = rowOf(c), k = colOf(c);
      return (k > 0 && board[c - 1]) || (k < SIZE - 1 && board[c + 1]) || (r > 0 && board[c - SIZE]) || (r < SIZE - 1 && board[c + SIZE]);
    });
    if (!touches) return { ok: false, error: "Connect to the tiles on the board" };
  }

  const runs: number[][] = [];
  if (main.length > 1) runs.push(main);
  for (const c of cells) {
    const cross = runThrough(get, c, !horizontal);
    if (cross.length > 1) runs.push(cross);
  }
  if (runs.length === 0) return { ok: false, error: `Words need ${MIN_WORD} letters or more` };

  const words: Formed[] = [];
  for (const run of runs) {
    const word = run.map(get).join("");
    if (word.length < MIN_WORD) return { ok: false, error: `${word.toUpperCase()} is too short: words need ${MIN_WORD}+ letters` };
    let sum = 0;
    let mult = 1;
    for (const c of run) {
      const v = valueOf(lang, get(c));
      const fresh = mine.has(c);
      const b = fresh ? BONUS[c] : "";
      sum += b === "dl" ? v * 2 : v;
      if (b === "dw" || b === "st") mult *= 2;
      if (b === "tw") mult *= 3;
    }
    words.push({ word, cells: run, score: sum * mult });
  }
  const bonus = placed.length === RACK ? FULL_RACK_BONUS : 0;
  return { ok: true, words, score: words.reduce((s, w) => s + w.score, 0) + bonus, bonus };
}

/** Take `letters` out of `rack`, one for one. Null if the rack doesn't hold them. */
export function takeFrom(rack: string[], letters: string[]) {
  const left = [...rack];
  for (const l of letters) {
    const k = left.indexOf(l);
    if (k < 0) return null;
    left.splice(k, 1);
  }
  return left;
}
