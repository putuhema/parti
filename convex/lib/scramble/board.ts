/** Scramble: a 4×4 letter grid. Shared by the server and phones. */

export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const ROUND_MS = 120_000;
export const MIN_LEN = 3;
export const SCRAMBLE_MAX = 6;

export type GridLang = "en" | "id";

/** Can you step from cell a to cell b (any of the 8 neighbours)? */
export function touching(a: number, b: number) {
  if (a === b) return false;
  const dr = Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE));
  const dc = Math.abs((a % SIZE) - (b % SIZE));
  return dr <= 1 && dc <= 1;
}

/** The word a path spells, or null if the path isn't a legal trace. */
export function spell(grid: string[], path: number[]) {
  if (path.length < 2) return null;
  const seen = new Set<number>();
  let word = "";
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    if (!Number.isInteger(c) || c < 0 || c >= CELLS || seen.has(c)) return null;
    if (i > 0 && !touching(path[i - 1], c)) return null;
    seen.add(c);
    word += grid[c];
  }
  return word;
}

/** Points for a word: longer words are worth a lot more. */
export function points(word: string) {
  const n = word.length;
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
}
