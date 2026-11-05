// Sudoku engine shared by the Convex backend and the client (solo mode).
// Boards are 81-char strings, "0" = empty.

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

// How many givens we aim to leave on the board.
const TARGET_GIVENS: Record<Difficulty, number> = {
  easy: 40,
  medium: 32,
  hard: 27,
  expert: 23,
};

/** Small seeded RNG so the daily puzzle is the same for everyone. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canPlace(g: number[], i: number, d: number) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const br = r - (r % 3);
  const bc = c - (c % 3);
  for (let k = 0; k < 9; k++) {
    if (g[r * 9 + k] === d) return false;
    if (g[k * 9 + c] === d) return false;
    if (g[(br + Math.floor(k / 3)) * 9 + bc + (k % 3)] === d) return false;
  }
  return true;
}

function fill(g: number[], rand: () => number): boolean {
  const i = g.indexOf(0);
  if (i === -1) return true;
  for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand)) {
    if (canPlace(g, i, d)) {
      g[i] = d;
      if (fill(g, rand)) return true;
      g[i] = 0;
    }
  }
  return false;
}

/** Counts solutions, stopping at `limit`. Picks the most constrained cell first. */
function countSolutions(g: number[], limit: number): number {
  let best = -1;
  let bestOpts: number[] = [];
  for (let i = 0; i < 81; i++) {
    if (g[i] !== 0) continue;
    const opts: number[] = [];
    for (let d = 1; d <= 9; d++) if (canPlace(g, i, d)) opts.push(d);
    if (opts.length === 0) return 0;
    if (best === -1 || opts.length < bestOpts.length) {
      best = i;
      bestOpts = opts;
      if (opts.length === 1) break;
    }
  }
  if (best === -1) return 1;
  let total = 0;
  for (const d of bestOpts) {
    g[best] = d;
    total += countSolutions(g, limit - total);
    g[best] = 0;
    if (total >= limit) break;
  }
  return total;
}

export function generatePuzzle(difficulty: Difficulty, rand: () => number = Math.random) {
  const solution = new Array<number>(81).fill(0);
  fill(solution, rand);
  const puzzle = solution.slice();
  const order = shuffle([...Array(81).keys()], rand);
  let givens = 81;
  const target = TARGET_GIVENS[difficulty];
  for (const i of order) {
    if (givens <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice(), 2) !== 1) {
      puzzle[i] = keep;
    } else {
      givens--;
    }
  }
  return { puzzle: puzzle.join(""), solution: solution.join("") };
}

export function peersOf(i: number) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const br = r - (r % 3);
  const bc = c - (c % 3);
  const row: number[] = [];
  const col: number[] = [];
  const box: number[] = [];
  for (let k = 0; k < 9; k++) {
    row.push(r * 9 + k);
    col.push(k * 9 + c);
    box.push((br + Math.floor(k / 3)) * 9 + bc + (k % 3));
  }
  return { row, col, box };
}

/** Which groups did placing at `i` just complete? `values` must already contain the move. */
export function completedGroups(values: string, solution: string, i: number) {
  const p = peersOf(i);
  const done = (list: number[]) => list.every((j) => values[j] === solution[j]);
  return { row: done(p.row), col: done(p.col), box: done(p.box) };
}

export function countEmpty(puzzle: string) {
  let n = 0;
  for (const ch of puzzle) if (ch === "0") n++;
  return n;
}

export function setAt(s: string, i: number, ch: string) {
  return s.slice(0, i) + ch + s.slice(i + 1);
}
