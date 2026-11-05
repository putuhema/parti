// Endless puzzles for Puzzle Rush, made on the fly from fast bot games.
import { CLASSIC, applyMove, botMove, colorOf, fromFen, inCheck, legalMoves, startState, toFen, typeOf, type Move, type State } from "../../convex/lib/chess";
import { MATES } from "../../convex/lib/chessPuzzles";

export type PuzzleKind = "mate" | "win";
export interface Puzzle { fen: string; kind: PuzzleKind; answers: Move[]; gain: number }

const PV: Record<string, number> = { p: 100, n: 310, b: 320, r: 500, q: 900, k: 0 };

function material(s: State) {
  let v = 0;
  for (const ch of s.cells) { const c = colorOf(ch); if (c) v += c === s.turn ? PV[typeOf(ch)] : -PV[typeOf(ch)]; }
  return v;
}

const after = (s: State, m: Move) => applyMove(s, m, CLASSIC, true).state;

export function isMate(s: State) {
  return inCheck(s) && legalMoves(s).length === 0;
}

export function mates(s: State) {
  return legalMoves(s).filter((m) => isMate(after(s, m)));
}

// Captures-only search so we don't stop in the middle of a trade.
function quiet(s: State, alpha: number, beta: number, depth: number): number {
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -50000 : 0;
  const stand = material(s);
  if (depth === 0) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of moves) {
    if (s.cells[m.to] === "." && !m.promo) continue;
    const v = -quiet(after(s, m), -beta, -alpha, depth - 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(s: State, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return quiet(s, alpha, beta, 4);
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -50000 - depth : 0;
  let best = -Infinity;
  for (const m of moves) {
    const v = -search(after(s, m), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** Score every move 2 plies deep (+ trades). */
function scored(s: State) {
  return legalMoves(s).map((m) => ({ m, v: -search(after(s, m), 1, -Infinity, Infinity) })).sort((a, b) => b.v - a.v);
}

/** Look at a position: is there exactly one clear idea? */
export function puzzleFrom(s: State, allowWin = true): Puzzle | null {
  const legal = legalMoves(s);
  if (legal.length < 2) return null;
  const mm = mates(s);
  if (mm.length === 1 || (mm.length === 2 && mm[0].to === mm[1].to)) return { fen: toFen(s), kind: "mate", answers: mm, gain: 0 };
  if (mm.length || !allowWin) return null;
  if (inCheck(s)) return null;
  const base = material(s);
  if (Math.abs(base) > 400) return null; // already lopsided: boring
  const sc = scored(s);
  const best = sc[0], gain = best.v - base;
  if (gain < 280 || best.v > 20000) return null;
  const good = sc.filter((x) => x.v >= best.v - 60);
  const next = sc.find((x) => x.v < best.v - 60);
  if (good.length > 2 || (next && next.v > base + 120)) return null;
  // The quiet "best" move is rarely obvious enough; keep tactics that start with a capture or check.
  const first = best.m;
  if (s.cells[first.to] === "." && !inCheck(after(s, first)) && !first.promo) return null;
  return { fen: toFen(s), kind: "win", answers: good.map((x) => x.m), gain };
}

/** Plays one quick bot game and returns the puzzles it found along the way. */
export function minePuzzles(rand: () => number = Math.random, max = 3): Puzzle[] {
  let s = startState("classic", rand);
  const out: Puzzle[] = [];
  for (let ply = 0; ply < 160 && out.length < max; ply++) {
    if (ply >= 12 && rand() < 0.6) {
      const p = puzzleFrom(s);
      if (p) { out.push(p); ply += 6; }
    }
    const m = rand() < 0.15 ? legalMoves(s)[Math.floor(rand() * legalMoves(s).length)] : botMove(s, 1 + Math.floor(rand() * 2), rand);
    if (!m) break;
    s = after(s, m);
  }
  return out;
}


/** Mirror left-right and/or swap colours, so each hand-checked puzzle gives up to four. */
export function variant(fen: string, mirror: boolean, swap: boolean): string {
  const s = fromFen(fen);
  let cells = s.cells.split("");
  if (mirror) cells = cells.map((_, i) => s.cells[(i & ~7) | (7 - (i & 7))]);
  let turn = s.turn;
  if (swap) {
    const flip = cells.slice();
    cells = flip.map((_, i) => { const ch = flip[(7 - (i >> 3)) * 8 + (i & 7)]; return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase(); });
    turn = turn === "w" ? "b" : "w";
  }
  return toFen({ ...s, cells: cells.join(""), turn, castle: "", ep: -1 });
}

export function seedVariants(): Puzzle[] {
  const out: Puzzle[] = [];
  for (const fen of MATES)
    for (const [m, sw] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const f = variant(fen, m, sw);
      const mm = mates(fromFen(f));
      if (mm.length === 1) out.push({ fen: f, kind: "mate", answers: mm, gain: 0 });
    }
  return out;
}
