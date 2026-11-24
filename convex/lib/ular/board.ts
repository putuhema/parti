/**
 * Ular Tangga Nusantara: the board, shared by the server and phones (no questions in here; those stay on the server).
 *
 * The board starts completely clear of snakes and ladders. Instead, Mystery Boxes (?) of three difficulties
 * (easy, medium, hard) are scattered randomly each game. Answering a box's question turns that square into a
 * permanent ladder (if right) or a permanent snake (if wrong), with the climb/drop distance scaling by difficulty.
 */
import { CATS } from "../trivia/board";

export const ULAR_MAX = 4;
export const GOAL = 100;
export const ROUND_CHOICES = [15, 25, 40] as const;
export const ROLL_MS = 20_000;
export const ASK_MS = 15_000; // time to answer
export const BOT_MS = 1_100;

export type Seat = string;
export const BOTS: Seat[] = ["bot1", "bot2"];
export const isBot = (p: Seat) => p.startsWith("bot");

// ---------- Mystery boxes & difficulty scaling ----------
export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_INFO: Record<
  Difficulty,
  {
    label: string;
    stars: number;
    upMin: number;
    upMax: number;
    downMin: number;
    downMax: number;
    minSq: number;
    maxSq: number;
    botRight: number;
    color: string;
    ink: string;
  }
> = {
  easy: {
    label: "Easy",
    stars: 1,
    upMin: 8,
    upMax: 13,
    downMin: 6,
    downMax: 10,
    minSq: 8,
    maxSq: 91,
    botRight: 0.74,
    color: "#3FA77A",
    ink: "#1E5B3F",
  },
  medium: {
    label: "Medium",
    stars: 2,
    upMin: 16,
    upMax: 23,
    downMin: 13,
    downMax: 19,
    minSq: 15,
    maxSq: 84,
    botRight: 0.58,
    color: "#F4C64E",
    ink: "#6E4B00",
  },
  hard: {
    label: "Hard",
    stars: 3,
    upMin: 27,
    upMax: 38,
    downMin: 22,
    downMax: 32,
    minSq: 24,
    maxSq: 72,
    botRight: 0.42,
    color: "#E2574C",
    ink: "#7A1F18",
  },
};

export const BOX_COUNTS: Record<Difficulty, number> = {
  hard: 6,
  medium: 9,
  easy: 10,
};

/** Scatter random mystery boxes across the board, spaced nicely so every game plays differently. */
export function generateBoxes(rng: () => number): Record<number, Difficulty> {
  const boxes: Record<number, Difficulty> = {};
  const placed = new Set<number>();

  const placeTier = (diff: Difficulty, count: number) => {
    const { minSq, maxSq } = DIFFICULTY_INFO[diff];
    const pool: number[] = [];
    for (let sq = minSq; sq <= maxSq; sq++) pool.push(sq);
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let added = 0;
    // First pass: keep at least 1 empty square between mystery boxes
    for (const sq of pool) {
      if (added >= count) break;
      if (placed.has(sq) || placed.has(sq - 1) || placed.has(sq + 1)) continue;
      boxes[sq] = diff;
      placed.add(sq);
      added++;
    }
    // Fallback if tight
    for (const sq of pool) {
      if (added >= count) break;
      if (placed.has(sq)) continue;
      boxes[sq] = diff;
      placed.add(sq);
      added++;
    }
  };

  placeTier("hard", BOX_COUNTS.hard);
  placeTier("medium", BOX_COUNTS.medium);
  placeTier("easy", BOX_COUNTS.easy);
  return boxes;
}

/** Which trivia category a square asks from (a scattered but fixed pattern). */
export const catOf = (sq: number) => (sq * 5 + Math.floor(sq / 10)) % CATS.length;

/**
 * The board is a 10 × 10 block of squares on a little island: a 14 × 14 grid with a ring of beach around the
 * squares and sea beyond. Square 1 is bottom-left and the numbers snake back and forth up to 100. Position 0 is
 * the start, a spot on the beach beside square 1.
 */
export const GRID = 14;
const OFF = 2; // the first square column/row inside the grid
export function cellOf(sq: number): { col: number; row: number } {
  if (sq <= 0) return { col: OFF - 1, row: OFF + 9 };
  const k = sq - 1;
  const r = Math.floor(k / 10); // 0 = bottom row
  const c = r % 2 === 0 ? k % 10 : 9 - (k % 10);
  return { col: OFF + c, row: OFF + 9 - r };
}
/** Land: the squares plus their beach ring. */
export const onIsland = (col: number, row: number) => col >= OFF - 1 && col <= OFF + 10 && row >= OFF - 1 && row <= OFF + 10;
