// A stronger chess bot for solo modes: iterative deepening alpha-beta with
// quiescence, a transposition table and piece-square tables.
// Strength is set by a rating, so the bot can match the player.
import { CLASSIC, applyMove, colorOf, inCheck, kingSquare, pseudoMoves, typeOf, type Color, type Move, type Rules, type State } from "../../convex/lib/chess";

// ---------- Goals (special win conditions) ----------
export type Goal =
  | { kind: "none" }
  | { kind: "hill" } // a king on d4/e4/d5/e5 wins
  | { kind: "threecheck" }
  | { kind: "queenhunt" } // white wins by taking every black queen
  | { kind: "survive"; ply: number } // white wins on reaching this ply
  | { kind: "kingcapture" }; // fog: take the king

const HILL = [27, 28, 35, 36];

/** Winner by the battle's special goal, or null. Checkmate/stalemate is handled by the search. */
export function goalWinner(s: State, g: Goal): Color | null {
  switch (g.kind) {
    case "hill":
      if (HILL.includes(kingSquare(s.cells, "w"))) return "w";
      if (HILL.includes(kingSquare(s.cells, "b"))) return "b";
      return null;
    case "threecheck":
      if (s.checks.w >= 3) return "w";
      if (s.checks.b >= 3) return "b";
      return null;
    case "queenhunt":
      return s.cells.includes("q") ? null : "w";
    case "survive":
      return s.ply >= g.ply ? "w" : null;
    case "kingcapture":
      if (kingSquare(s.cells, "w") < 0) return "b";
      if (kingSquare(s.cells, "b") < 0) return "w";
      return null;
    default:
      return null;
  }
}

// ---------- Evaluation ----------
const PV: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Tables are written from white's side, a8 first (same order as the board). Black mirrors with i ^ 56.
const PST: Record<string, number[]> = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  e: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
};

const dist = (a: number, b: number) => Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7)));
const centerDist = (sq: number) => Math.max(3 - Math.min(sq >> 3, 7 - (sq >> 3)), 3 - Math.min(sq & 7, 7 - (sq & 7)));

/** Score from the side to move's point of view, in centipawns. */
export function evaluate(s: State, goal: Goal = { kind: "none" }): number {
  const c = s.cells;
  const mat = { w: 0, b: 0 }, heavy = { w: 0, b: 0 }, bishops = { w: 0, b: 0 };
  let pos = 0; // from white's view
  const pawnFiles = { w: [0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0] };
  for (let i = 0; i < 64; i++) {
    const ch = c[i], col = colorOf(ch);
    if (!col) continue;
    const t = typeOf(ch);
    mat[col] += PV[t];
    if (t !== "p" && t !== "k") heavy[col] += PV[t];
    if (t === "b") bishops[col]++;
    if (t === "p") pawnFiles[col][i & 7]++;
  }
  const endgame = heavy.w + heavy.b <= 2600 || (!c.includes("q") && !c.includes("Q") && heavy.w + heavy.b <= 3200);
  for (let i = 0; i < 64; i++) {
    const ch = c[i], col = colorOf(ch);
    if (!col) continue;
    let t = typeOf(ch);
    if (t === "k" && endgame) t = "e";
    const v = PST[t][col === "w" ? i : i ^ 56];
    pos += col === "w" ? v : -v;
    if (typeOf(ch) === "p") {
      // Passed pawn: no enemy pawn ahead on this or neighbouring files.
      const f = i & 7, r = i >> 3;
      let passed = true;
      for (let rr = col === "w" ? r - 1 : r + 1; rr >= 0 && rr <= 7 && passed; rr += col === "w" ? -1 : 1)
        for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++)
          if (c[rr * 8 + ff] === (col === "w" ? "p" : "P")) { passed = false; break; }
      if (passed) {
        const adv = col === "w" ? 6 - r : r - 1;
        const bonus = [0, 5, 10, 20, 35, 60, 100][adv] * (endgame ? 1.6 : 1);
        pos += col === "w" ? bonus : -bonus;
      }
    }
  }
  for (const col of ["w", "b"] as const) {
    let pen = 0;
    const files = pawnFiles[col];
    for (let f = 0; f < 8; f++) {
      if (files[f] > 1) pen += 12 * (files[f] - 1);
      if (files[f] && !(files[f - 1] ?? 0) && !(files[f + 1] ?? 0)) pen += 10;
    }
    if (bishops[col] >= 2) pen -= 30;
    pos += col === "w" ? -pen : pen;
  }
  let score = mat.w - mat.b + pos;

  // Mop-up: when clearly ahead late in the game, chase the lone king to the edge.
  if (endgame && Math.abs(mat.w - mat.b) >= 300) {
    const strong: Color = mat.w > mat.b ? "w" : "b";
    const ks = kingSquare(c, strong), kw = kingSquare(c, strong === "w" ? "b" : "w");
    if (ks >= 0 && kw >= 0) {
      const bonus = centerDist(kw) * 12 + (14 - dist(ks, kw) * 2) * 4;
      score += strong === "w" ? bonus : -bonus;
    }
  }

  // Special goals.
  if (goal.kind === "hill") {
    for (const col of ["w", "b"] as const) {
      const k = kingSquare(c, col);
      if (k < 0) continue;
      const near = Math.min(...HILL.map((h) => dist(k, h)));
      const bonus = (4 - Math.min(4, near)) * 45;
      score += col === "w" ? bonus : -bonus;
    }
  } else if (goal.kind === "threecheck") {
    score += (s.checks.w - s.checks.b) * 180;
  } else if (goal.kind === "queenhunt") {
    for (let i = 0; i < 64; i++) if (c[i] === "q") score -= 500; // black guards its queen hard
  }
  return s.turn === "w" ? score : -score;
}

// ---------- Search ----------
const MATE = 100000;
const INF = 1e9;

class Timeout extends Error {}

interface Entry { depth: number; score: number; flag: 0 | 1 | 2; best?: Move } // 0 exact, 1 lower, 2 upper

export interface ThinkOptions {
  rating: number;
  goal?: Goal;
  rules?: Rules;
  rand?: () => number;
  maxMs?: number;
}

export interface SkillParams { depth: number; ms: number; temp: number; quiesce: boolean }

/** How a rating plays: search depth, thinking time, and how loosely it picks among good moves. */
export function skillParams(rating: number): SkillParams {
  const r = Math.max(300, Math.min(2400, rating));
  const depth = r < 550 ? 1 : r < 800 ? 2 : r < 1050 ? 3 : r < 1350 ? 4 : r < 1700 ? 5 : 6;
  const ms = Math.round(Math.min(1800, 250 + r * 0.7));
  const temp = Math.max(0, (1650 - r) / 8);
  return { depth, ms, temp, quiesce: r >= 700 };
}

function sameMove(a?: Move, b?: Move) {
  return !!a && !!b && a.from === b.from && a.to === b.to && (a.promo ?? "") === (b.promo ?? "");
}

export interface Thought { move: Move | null; score: number; depth: number; nodes: number }

export function think(root: State, opts: ThinkOptions): Thought {
  const goal = opts.goal ?? { kind: "none" };
  const rules = opts.rules ?? CLASSIC;
  const kc = rules.kingCapture;
  const params = skillParams(opts.rating);
  const rand = opts.rand ?? Math.random;
  const deadline = Date.now() + (opts.maxMs ?? params.ms);
  const tt = new Map<string, Entry>();
  const killers: Move[][] = [];
  let nodes = 0;

  const keyOf = (s: State) => {
    let k = s.cells + s.turn + s.castle + s.ep;
    if (goal.kind === "threecheck") k += s.checks.w + "" + s.checks.b;
    if (goal.kind === "survive") k += "|" + s.ply;
    if (s.power && (s.power.frozen.length || s.power.shields.length)) k += JSON.stringify([s.power.frozen, s.power.shields, s.ply]);
    return k;
  };

  const order = (s: State, moves: Move[], ttMove: Move | undefined, ply: number) => {
    const k = killers[ply] ?? [];
    return moves
      .map((m) => {
        let v = 0;
        if (sameMove(m, ttMove)) v = 1e6;
        else {
          const cap = s.cells[m.to];
          if (cap !== "." && cap !== "*") v = 10000 + PV[typeOf(cap)] * 10 - PV[typeOf(s.cells[m.from])];
          if (m.promo) v += 9000;
          if (sameMove(m, k[0]) || sameMove(m, k[1])) v += 5000;
        }
        return { m, v };
      })
      .sort((a, b) => b.v - a.v)
      .map((x) => x.m);
  };

  /** Make a move; null if it leaves our own king in check (illegal). */
  const play = (s: State, m: Move): State | null => {
    const next = applyMove(s, m, rules, true).state;
    if (!kc && inCheck(next, s.turn)) return null;
    return next;
  };

  const terminal = (s: State, ply: number): number | null => {
    const w = goalWinner(s, goal);
    if (!w) return null;
    return w === s.turn ? MATE - ply : -(MATE - ply);
  };

  function quiesce(s: State, alpha: number, beta: number, ply: number, qd: number): number {
    nodes++;
    if ((nodes & 1023) === 0 && Date.now() > deadline) throw new Timeout();
    const t = terminal(s, ply);
    if (t !== null) return t;
    const stand = evaluate(s, goal);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd <= 0) return stand;
    const caps = pseudoMoves(s, rules).filter((m) => (s.cells[m.to] !== "." && s.cells[m.to] !== "*") || m.promo);
    for (const m of order(s, caps, undefined, ply)) {
      if (kc && typeOf(s.cells[m.to]) === "k") return MATE - ply;
      const next = play(s, m);
      if (!next) continue;
      const v = -quiesce(next, -beta, -alpha, ply + 1, qd - 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function search(s: State, depth: number, alpha: number, beta: number, ply: number): number {
    nodes++;
    if ((nodes & 1023) === 0 && Date.now() > deadline) throw new Timeout();
    const t = terminal(s, ply);
    if (t !== null) return t;
    if (s.half >= 100) return 0;
    const checked = !kc && inCheck(s);
    if (depth <= 0 && !checked) return params.quiesce ? quiesce(s, alpha, beta, ply, 6) : evaluate(s, goal);
    if (depth < 0) depth = 0;

    const key = keyOf(s);
    const e = tt.get(key);
    if (e && e.depth >= depth && ply > 0) {
      if (e.flag === 0) return e.score;
      if (e.flag === 1 && e.score >= beta) return e.score;
      if (e.flag === 2 && e.score <= alpha) return e.score;
    }
    const a0 = alpha;
    let best = -INF, bestMove: Move | undefined, legal = 0;
    for (const m of order(s, pseudoMoves(s, rules), e?.best, ply)) {
      if (kc && typeOf(s.cells[m.to]) === "k") return MATE - ply;
      const next = play(s, m);
      if (!next) continue;
      legal++;
      const v = -search(next, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (s.cells[m.to] === ".") {
          const k = killers[ply] ?? (killers[ply] = []);
          if (!sameMove(k[0], m)) { k[1] = k[0]; k[0] = m; }
        }
        break;
      }
    }
    if (!legal) return checked ? -(MATE - ply) : 0;
    tt.set(key, { depth, score: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0, best: bestMove });
    return best;
  }

  // Root: score every legal move so weaker bots can pick among "good enough" ones.
  const rootMoves: { m: Move; next: State; v: number }[] = [];
  for (const m of pseudoMoves(root, rules)) {
    if (kc && typeOf(root.cells[m.to]) === "k") return { move: m, score: MATE, depth: 1, nodes: 1 };
    const next = play(root, m);
    if (next) rootMoves.push({ m, next, v: 0 });
  }
  if (!rootMoves.length) return { move: null, score: 0, depth: 0, nodes: 0 };
  if (rootMoves.length === 1) return { move: rootMoves[0].m, score: 0, depth: 0, nodes: 0 };

  const margin = params.temp > 0 ? Math.max(25, params.temp * 2.5) : 0;
  let done: { m: Move; v: number }[] = [];
  let doneDepth = 0;
  for (let d = 1; d <= params.depth; d++) {
    try {
      let best = -INF;
      const scored: { m: Move; next: State; v: number }[] = [];
      const list = done.length ? [...rootMoves].sort((a, b) => (done.find((x) => sameMove(x.m, b.m))?.v ?? -INF) - (done.find((x) => sameMove(x.m, a.m))?.v ?? -INF)) : order(root, rootMoves.map((r) => r.m), undefined, 0).map((m) => rootMoves.find((r) => sameMove(r.m, m))!);
      for (const r of list) {
        const alpha = best === -INF ? -INF : best - margin;
        const v = -search(r.next, d - 1, -INF, -alpha, 1);
        scored.push({ ...r, v });
        if (v > best) best = v;
        if (best >= MATE - 50) break; // found a mate, no need to look further
      }
      done = scored;
      doneDepth = d;
      if (best >= MATE - 50 || best <= -(MATE - 50)) break;
    } catch (err) {
      if (!(err instanceof Timeout)) throw err;
      break;
    }
    if (Date.now() > deadline - 30) break;
  }
  if (!done.length) done = rootMoves.map((r) => ({ m: r.m, v: 0 }));

  done.sort((a, b) => b.v - a.v);
  const top = done[0];
  if (params.temp <= 0 || top.v >= MATE - 50) return { move: top.m, score: top.v, depth: doneDepth, nodes };
  // Softmax among moves near the best: lower ratings wander further from perfect play.
  // Strictly above the cut: moves that failed low only have an upper bound and may be blunders.
  const pool = done.filter((x) => x === top || x.v > top.v - margin);
  const w = pool.map((x) => Math.exp((x.v - top.v) / params.temp));
  let roll = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= w[i];
    if (roll <= 0) return { move: pool[i].m, score: pool[i].v, depth: doneDepth, nodes };
  }
  return { move: top.m, score: top.v, depth: doneDepth, nodes };
}

/** Is `color` still able to move? (for detecting mate/stalemate under special rules) */
export function hasMove(s: State, rules: Rules = CLASSIC) {
  for (const m of pseudoMoves(s, rules)) {
    const next = applyMove(s, m, rules, true).state;
    if (rules.kingCapture || !inCheck(next, s.turn)) return true;
  }
  return false;
}
