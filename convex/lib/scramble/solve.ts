/** Server only: build grids and find every word in them. Uses the big word lists. */
import { wordSet } from "../words/dict";
import { CELLS, MIN_LEN, SIZE, touching, type GridLang } from "./board";

// Rough letter frequencies, so grids are full of words.
const WEIGHTS: Record<GridLang, Record<string, number>> = {
  en: { e: 12, t: 8, a: 8, o: 7, i: 7, n: 7, s: 7, r: 6, h: 3, l: 5, d: 4, c: 3, u: 3, m: 3, f: 2, p: 3, g: 2, w: 2, y: 2, b: 2, v: 1, k: 1, x: 0.4, j: 0.3, qu: 0.4, z: 0.3 },
  id: { a: 17, i: 8, n: 9, e: 8, u: 6, k: 5, r: 5, t: 5, s: 4, m: 4, g: 3, l: 4, b: 3, d: 3, p: 3, h: 3, o: 3, j: 1, y: 2, c: 1, w: 1 },
};
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function rollGrid(lang: GridLang, rand: () => number) {
  const entries = Object.entries(WEIGHTS[lang]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  for (;;) {
    const grid: string[] = [];
    const count = new Map<string, number>();
    while (grid.length < CELLS) {
      let r = rand() * total;
      let pick = entries[0][0];
      for (const [l, w] of entries) { r -= w; if (r <= 0) { pick = l; break; } }
      if ((count.get(pick) ?? 0) >= (VOWELS.has(pick) ? 3 : 2)) continue;
      count.set(pick, (count.get(pick) ?? 0) + 1);
      grid.push(pick);
    }
    const vowels = grid.filter((l) => VOWELS.has(l)).length;
    if (vowels >= 5 && vowels <= 8) return grid;
  }
}

/** Can this word be traced on the grid? */
function traceable(grid: string[], word: string) {
  const walk = (cell: number, at: number, used: number): boolean => {
    const t = grid[cell];
    if (!word.startsWith(t, at)) return false;
    const next = at + t.length;
    if (next === word.length) return true;
    const mask = used | (1 << cell);
    for (let n = 0; n < CELLS; n++) if (!(mask & (1 << n)) && touching(cell, n) && walk(n, next, mask)) return true;
    return false;
  };
  for (let c = 0; c < CELLS; c++) if (walk(c, 0, 0)) return true;
  return false;
}

/** Words worth showing as "you missed": everyday English, or the full Indonesian list (its everyday list is tiny). */
export function solve(grid: string[], lang: GridLang) {
  const letters = new Set(grid.join(""));
  const out: string[] = [];
  for (const w of wordSet(lang, lang === "en")) {
    if (w.length < MIN_LEN || w.length > CELLS + 1) continue;
    let ok = true;
    for (const ch of w) if (!letters.has(ch)) { ok = false; break; }
    if (ok && traceable(grid, w)) out.push(w);
  }
  return out.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/** A grid with plenty to find. */
export function makeGrid(lang: GridLang, rand: () => number) {
  let best: { grid: string[]; words: string[] } | null = null;
  for (let tries = 0; tries < 12; tries++) {
    const grid = rollGrid(lang, rand);
    const words = solve(grid, lang);
    if (!best || words.length > best.words.length) best = { grid, words };
    if (words.length >= 60 && words.some((w) => w.length >= 6)) break;
  }
  return best!;
}

export { SIZE };
