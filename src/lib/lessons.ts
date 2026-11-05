import { CHECKS, ESCAPES, MATES } from "../../convex/lib/chessPuzzles";

// A "stars" board: one active piece (uppercase), "o" = your own pawn (a blocker),
// lowercase = enemy pieces to capture, "*" = star to collect, "." = empty.
export type StarStep = { kind: "stars"; rows: string[]; tip: string; title: string };
// A real position (FEN). Goal decides what counts as right.
export type FenStep = { kind: "fen"; fen: string; goal: "mate" | "check" | "escape" | "castle" | "best-capture"; tip: string; title: string };
export type TapStep = { kind: "tap"; square: string; tip: string; title: string };
export type Step = StarStep | FenStep | TapStep;

export type Lesson = { id: string; unit: number; name: string; sub: string; icon: string; steps: Step[] };

export const UNITS = [
  { n: 1, name: "Meet the pieces", sub: "How each piece moves and what it's worth" },
  { n: 2, name: "Win the game", sub: "Check, checkmate and staying safe" },
];

const pick = (list: string[], from: number, count: number) => list.slice(from, from + count);

export const LESSONS: Lesson[] = [
  {
    id: "board", unit: 1, name: "The board", sub: "Files, ranks and squares", icon: "board",
    steps: [
      { kind: "tap", square: "e4", title: "Find e4", tip: "Columns are letters (a to h), rows are numbers (1 to 8). Find column e, row 4." },
      { kind: "tap", square: "a1", title: "Find a1", tip: "a1 is the bottom-left corner on your side." },
      { kind: "tap", square: "h8", title: "Find h8", tip: "h8 is the far corner, on your opponent's side." },
      { kind: "tap", square: "d5", title: "Find d5", tip: "Column d, row 5. Squares in the middle are the most important!" },
    ],
  },
  {
    id: "rook", unit: 1, name: "The rook", sub: "Straight lines", icon: "r",
    steps: [
      { kind: "stars", title: "Collect the stars", tip: "Rooks slide in straight lines: up, down, left or right, as far as they like.", rows: ["*.....", "......", "..o..*", "......", "......", "R....."] },
      { kind: "stars", title: "Capture the pieces", tip: "Land on an enemy piece to capture it. Rooks can't jump over your own pawns.", rows: ["..p...", "......", "o....n", "......", "..R...", "......"] },
    ],
  },
  {
    id: "bishop", unit: 1, name: "The bishop", sub: "Diagonals only", icon: "b",
    steps: [
      { kind: "stars", title: "Collect the stars", tip: "Bishops slide diagonally. Each bishop stays on its own square color forever!", rows: [".*....", "......", "...*..", "....*.", "......", "B....."] },
      { kind: "stars", title: "Capture the pieces", tip: "Plan your diagonals. Your pawns block the way.", rows: ["...n..", "......", ".r....", "..o...", "...B..", "......"] },
    ],
  },
  {
    id: "queen", unit: 1, name: "The queen", sub: "The strongest piece", icon: "q",
    steps: [
      { kind: "stars", title: "Collect the stars", tip: "The queen moves like a rook and a bishop together. Any straight line or diagonal!", rows: ["*....*", "......", "..o...", "......", "...*..", "Q....."] },
      { kind: "stars", title: "Capture the pieces", tip: "Queens are worth 9 points. Use her power wisely.", rows: ["....r.", ".b....", "......", "...o.n", "......", ".Q...."] },
    ],
  },
  {
    id: "knight", unit: 1, name: "The knight", sub: "Jumps in an L", icon: "n",
    steps: [
      { kind: "stars", title: "Collect the stars", tip: "Knights jump in an L: two squares one way, then one to the side. They hop over pieces!", rows: ["......", "..*...", "....*.", ".*....", "oo....", "N....."] },
      { kind: "stars", title: "Capture the pieces", tip: "Knights are tricky. Count the L carefully.", rows: ["......", "...p..", "......", "....b.", "..o...", ".N...."] },
    ],
  },
  {
    id: "king", unit: 1, name: "The king", sub: "One step at a time", icon: "k",
    steps: [
      { kind: "stars", title: "Collect the stars", tip: "The king moves one square in any direction. Slow, but he's the most important piece.", rows: ["..*..", ".....", "*....", "....*", "..K.."] },
    ],
  },
  {
    id: "pawn", unit: 1, name: "The pawn", sub: "Forward, capture sideways", icon: "p",
    steps: [
      { kind: "stars", title: "Reach the end", tip: "Pawns move forward one square, or two on their very first move. Reach the far side and it becomes a queen!", rows: ["..*...", "......", "......", "......", "..P...", "......"] },
      { kind: "stars", title: "Capture diagonally", tip: "Pawns capture one square diagonally forward. They can't capture straight ahead.", rows: ["......", "......", "...n..", "..p...", ".P....", "......"] },
    ],
  },
  {
    id: "values", unit: 2, name: "Piece values", sub: "Take the biggest prize", icon: "trophy",
    steps: [
      { kind: "fen", goal: "best-capture", title: "Take the best piece", tip: "Pawn 1, knight and bishop 3, rook 5, queen 9. Your queen can take three pieces. Which is worth the most?", fen: "k7/8/8/3r4/8/1n3p2/8/3Q3K w - - 0 1" },
      { kind: "fen", goal: "best-capture", title: "Take the best piece", tip: "Your knight can capture two pieces. Grab the bigger one!", fen: "4k3/8/2q5/4N3/8/5b2/8/K7 w - - 0 1" },
    ],
  },
  {
    id: "check", unit: 2, name: "Check", sub: "Attack the king", icon: "check",
    steps: pick(CHECKS, 0, 3).map((fen) => ({ kind: "fen", goal: "check", title: "Give check", tip: "Check means attacking the king. Find a move that attacks the enemy king.", fen }) as FenStep),
  },
  {
    id: "escape", unit: 2, name: "Escape check", sub: "Keep your king safe", icon: "shield",
    steps: pick(ESCAPES, 0, 3).map((fen) => ({ kind: "fen", goal: "escape", title: "Get out of check", tip: "Your king is under attack! Move it, block the attack, or capture the attacker. Only safe moves show dots.", fen }) as FenStep),
  },
  {
    id: "mate", unit: 2, name: "Checkmate", sub: "Win the game", icon: "crown",
    steps: pick(MATES, 0, 3).map((fen) => ({ kind: "fen", goal: "mate", title: "Checkmate in one", tip: "Checkmate is check with no way out. That wins the game! Find the one move that does it.", fen }) as FenStep),
  },
  {
    id: "castle", unit: 2, name: "Castling", sub: "Tuck your king away", icon: "castle",
    steps: [
      { kind: "fen", goal: "castle", title: "Castle your king", tip: "Castling: tap your king and move it two squares toward a rook. The rook hops over to protect it.", fen: "4k3/8/8/8/8/8/PPPPPPPP/R3K2R w KQ - 0 1" },
      { kind: "fen", goal: "castle", title: "Castle again", tip: "You can't castle if pieces are in the way, or out of check. Find the side that works.", fen: "r3k2r/ppp2ppp/2n5/8/8/2N5/PPP2PPP/R1B1K2R w KQkq - 0 1" },
    ],
  },
];

// ---------- Star boards ----------
export type StarBoard = { n: number; piece: string; start: number; blockers: number[]; enemies: number[]; stars: number[] };

export function parseStars(rows: string[]): StarBoard {
  const n = rows.length;
  const b: StarBoard = { n, piece: "", start: -1, blockers: [], enemies: [], stars: [] };
  rows.join("").split("").forEach((ch, i) => {
    if (ch === "*") b.stars.push(i);
    else if (ch === "o") b.blockers.push(i);
    else if (/[a-z]/.test(ch)) b.enemies.push(i);
    else if (/[A-Z]/.test(ch)) { b.piece = ch; b.start = i; }
  });
  return b;
}

/** Where the lesson piece can go from `at`. `enemies` = enemy squares still on the board. */
export function starTargets(b: StarBoard, piece: string, at: number, enemies: Set<number>): number[] {
  const n = b.n, r = Math.floor(at / n), c = at % n, out: number[] = [];
  const blocked = (j: number) => b.blockers.includes(j);
  const on = (rr: number, cc: number) => rr >= 0 && rr < n && cc >= 0 && cc < n;
  const t = piece.toLowerCase();
  const steps = (dirs: number[][], slide: boolean) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (on(rr, cc)) {
        const j = rr * n + cc;
        if (blocked(j)) break;
        out.push(j);
        if (enemies.has(j) || !slide) break;
        rr += dr; cc += dc;
      }
    }
  };
  const O = [[1, 0], [-1, 0], [0, 1], [0, -1]], D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  if (t === "r") steps(O, true);
  else if (t === "b") steps(D, true);
  else if (t === "q") steps([...O, ...D], true);
  else if (t === "k") steps([...O, ...D], false);
  else if (t === "n") steps([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]], false);
  else if (t === "p") {
    const one = (r - 1) * n + c, two = (r - 2) * n + c;
    const free = (j: number) => !blocked(j) && !enemies.has(j);
    if (r - 1 >= 0 && free(one)) {
      out.push(one);
      if (r === n - 2 && r - 2 >= 0 && free(two)) out.push(two);
    }
    for (const dc of [-1, 1]) if (on(r - 1, c + dc) && enemies.has((r - 1) * n + c + dc)) out.push((r - 1) * n + c + dc);
  }
  return out;
}

/** Fewest moves to collect every star and capture every enemy (breadth-first search). */
export function bestMoves(b: StarBoard): number {
  const goals = [...b.stars, ...b.enemies];
  const full = (1 << goals.length) - 1;
  const key = (at: number, mask: number, piece: string) => `${at}:${mask}:${piece}`;
  let frontier = [{ at: b.start, mask: 0, piece: b.piece }];
  const seen = new Set([key(b.start, 0, b.piece)]);
  for (let d = 1; d <= 30 && frontier.length; d++) {
    const next: typeof frontier = [];
    for (const s of frontier) {
      const enemies = new Set(b.enemies.filter((e) => !(s.mask & (1 << goals.indexOf(e)))));
      for (const to of starTargets(b, s.piece, s.at, enemies)) {
        const gi = goals.indexOf(to);
        const mask = gi >= 0 ? s.mask | (1 << gi) : s.mask;
        const piece = s.piece === "P" && Math.floor(to / b.n) === 0 ? "Q" : s.piece;
        if (mask === full) return d;
        const k = key(to, mask, piece);
        if (!seen.has(k)) { seen.add(k); next.push({ at: to, mask, piece }); }
      }
    }
    frontier = next;
  }
  return 99;
}
