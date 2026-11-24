/**
 * Ular Tangga Nusantara: the board, shared by the server and phones (no questions in here; those stay on the server).
 */
import { CATS } from "../trivia/board";

export const ULAR_MAX = 4;
export const GOAL = 100;
export const ROUND_CHOICES = [15, 25, 40] as const;
export const ROLL_MS = 20_000;
export const ASK_MS = 15_000; // time to answer
export const BOT_MS = 1_100;
export const BOT_RIGHT = 0.62; // how often a bot knows the answer
export const BONUS_STEPS = 1;

export type Seat = string;
export const BOTS: Seat[] = ["bot1", "bot2"];
export const isBot = (p: Seat) => p.startsWith("bot");

// ---------- The board ----------
/** Ladders: foot → top. */
export const LADDERS: Record<number, number> = { 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 99 };
/** Snakes: head → tail. */
export const SNAKES: Record<number, number> = { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79 };
/** Which trivia category a square asks from (a scattered but fixed pattern). */
export const catOf = (sq: number) => (sq * 5 + Math.floor(sq / 10)) % CATS.length;
export type SquareKind = "ladder" | "snake" | "plain";
export const kindOf = (sq: number): SquareKind => (LADDERS[sq] ? "ladder" : SNAKES[sq] ? "snake" : "plain");

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

