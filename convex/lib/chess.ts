// Chess rules shared by the server (Convex) and the phone.
// Board: 64 chars, index 0 = a8 ... 63 = h1.
// "." empty, "PNBRQK" white, "pnbrqk" black, "*" the duck.

export type Color = "w" | "b";
export type ChessMode =
  | "classic"
  | "team"
  | "coach"
  | "puzzles"
  | "powerups"
  | "fog"
  | "duck"
  | "shuffle"
  | "threecheck";

export type Card = "shield" | "freeze" | "swap" | "rocket";
export const CARD_COST: Record<Card, number> = { shield: 2, freeze: 3, swap: 2, rocket: 1 };
export const MAX_ENERGY = 5;

export interface Power {
  energy: { w: number; b: number };
  shields: { sq: number; until: number }[];
  frozen: { sq: number; until: number }[];
  cardPly: number; // ply when a card was last played (one card per turn)
}

export interface State {
  cells: string;
  turn: Color;
  castle: string; // subset of "KQkq"
  ep: number; // en passant target square, -1 if none
  half: number; // plies since last capture or pawn move
  ply: number;
  checks: { w: number; b: number }; // checks given by each side
  duckPending?: boolean;
  power?: Power;
}

export interface Move {
  from: number;
  to: number;
  promo?: string; // "q" | "r" | "b" | "n"
}

export interface Rules {
  kingCapture: boolean; // no check rules; win by taking the king (fog, duck)
  duck: boolean;
  castling: boolean;
  threeCheck: boolean;
  powerups: boolean;
}

export function rulesFor(mode: ChessMode): Rules {
  return {
    kingCapture: mode === "fog" || mode === "duck",
    duck: mode === "duck",
    castling: mode !== "shuffle",
    threeCheck: mode === "threecheck",
    powerups: mode === "powerups",
  };
}

export const CLASSIC: Rules = rulesFor("classic");
export const FILES = "abcdefgh";
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

export const row = (sq: number) => sq >> 3;
export const col = (sq: number) => sq & 7;
export const sqName = (sq: number) => FILES[col(sq)] + (8 - row(sq));
export const other = (c: Color): Color => (c === "w" ? "b" : "w");
export function colorOf(ch: string): Color | null {
  if (ch === "." || ch === "*" || ch === "?") return null;
  return ch === ch.toUpperCase() ? "w" : "b";
}
export const typeOf = (ch: string) => ch.toLowerCase();
const pieceOf = (c: Color, t: string) => (c === "w" ? t.toUpperCase() : t);

// ---------- FEN ----------
export function fromFen(fen: string): State {
  const [placement, turn = "w", castle = "-", ep = "-", half = "0", full = "1"] = fen.trim().split(/\s+/);
  let cells = "";
  for (const ch of placement) {
    if (ch === "/") continue;
    if (/[1-8]/.test(ch)) cells += ".".repeat(Number(ch));
    else cells += ch;
  }
  if (cells.length !== 64) throw new Error("Bad FEN");
  const epSq = ep === "-" ? -1 : (8 - Number(ep[1])) * 8 + FILES.indexOf(ep[0]);
  const t = turn === "b" ? "b" : "w";
  return {
    cells,
    turn: t,
    castle: castle === "-" ? "" : castle,
    ep: epSq,
    half: Number(half) || 0,
    ply: (Number(full) - 1) * 2 + (t === "b" ? 1 : 0),
    checks: { w: 0, b: 0 },
  };
}

export function toFen(s: State) {
  let out = "";
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const ch = s.cells[r * 8 + c];
      if (ch === "." || ch === "*") empty++;
      else {
        if (empty) out += empty;
        empty = 0;
        out += ch;
      }
    }
    if (empty) out += empty;
    if (r < 7) out += "/";
  }
  return `${out} ${s.turn} ${s.castle || "-"} ${s.ep < 0 ? "-" : sqName(s.ep)} ${s.half} ${Math.floor(s.ply / 2) + 1}`;
}

// ---------- Start positions ----------
/** Chess960-style back row, the same for both sides. */
export function shuffledStart(rand: () => number = Math.random): State {
  const back: string[] = Array(8).fill("");
  const free = () => back.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  const pick = (list: number[]) => list[Math.floor(rand() * list.length)];
  back[pick([0, 2, 4, 6])] = "b";
  back[pick([1, 3, 5, 7])] = "b";
  back[pick(free())] = "q";
  back[pick(free())] = "n";
  back[pick(free())] = "n";
  const [a, k, b] = free();
  back[a] = "r";
  back[k] = "k";
  back[b] = "r";
  const black = back.join("");
  const s = fromFen(`${black}/pppppppp/8/8/8/8/PPPPPPPP/${black.toUpperCase()} w - - 0 1`);
  return s;
}

export function startState(mode: ChessMode, rand: () => number = Math.random): State {
  const s = mode === "shuffle" ? shuffledStart(rand) : fromFen(START_FEN);
  if (mode === "powerups") s.power = { energy: { w: 1, b: 1 }, shields: [], frozen: [], cardPly: -1 };
  return s;
}

// ---------- Attacks ----------
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function frozenSet(s: State): Set<number> {
  const out = new Set<number>();
  if (s.power) for (const f of s.power.frozen) if (f.until > s.ply) out.add(f.sq);
  return out;
}
function shieldSet(s: State): Set<number> {
  const out = new Set<number>();
  if (s.power) for (const f of s.power.shields) if (f.until > s.ply) out.add(f.sq);
  return out;
}

/** Is `sq` attacked by side `by`? Frozen pieces don't attack. */
export function attacked(cells: string, sq: number, by: Color, frozen: Set<number> = new Set()) {
  const r = row(sq), c = col(sq);
  const is = (rr: number, cc: number, types: string) => {
    if (rr < 0 || rr > 7 || cc < 0 || cc > 7) return false;
    const j = rr * 8 + cc, ch = cells[j];
    return colorOf(ch) === by && types.includes(typeOf(ch)) && !frozen.has(j);
  };
  for (const [dr, dc] of KNIGHT) if (is(r + dr, c + dc, "n")) return true;
  for (const [dr, dc] of KING) if (is(r + dr, c + dc, "k")) return true;
  const pr = by === "w" ? r + 1 : r - 1; // white pawns attack upward
  if (is(pr, c - 1, "p") || is(pr, c + 1, "p")) return true;
  const ray = (dirs: number[][], types: string) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr <= 7 && cc >= 0 && cc <= 7) {
        const j = rr * 8 + cc, ch = cells[j];
        if (ch !== ".") {
          if (colorOf(ch) === by && types.includes(typeOf(ch)) && !frozen.has(j)) return true;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
    return false;
  };
  return ray(ORTHO, "rq") || ray(DIAG, "bq");
}

export function kingSquare(cells: string, c: Color) {
  return cells.indexOf(c === "w" ? "K" : "k");
}

export function inCheck(s: State, c: Color = s.turn) {
  const k = kingSquare(s.cells, c);
  return k >= 0 && attacked(s.cells, k, other(c), frozenSet(s));
}

// ---------- Move generation ----------
function pseudo(s: State, rules: Rules, me: Color = s.turn): Move[] {
  const out: Move[] = [];
  const cells = s.cells;
  const frozen = frozenSet(s);
  const shields = shieldSet(s);
  const lastRank = me === "w" ? 0 : 7;
  for (let i = 0; i < 64; i++) {
    const ch = cells[i];
    if (colorOf(ch) !== me || frozen.has(i)) continue;
    const t = typeOf(ch), r = row(i), c = col(i);
    const push = (j: number) => out.push(t === "p" && row(j) === lastRank ? { from: i, to: j, promo: "q" } : { from: i, to: j });
    const target = (rr: number, cc: number): "empty" | "capture" | "stop" | "off" => {
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) return "off";
      const j = rr * 8 + cc, q = cells[j];
      if (q === ".") return "empty";
      if (q === "*" || colorOf(q) === me) return "stop";
      return shields.has(j) ? "stop" : "capture";
    };
    if (t === "p") {
      const dir = me === "w" ? -1 : 1;
      const start = me === "w" ? 6 : 1;
      if (target(r + dir, c) === "empty") {
        push((r + dir) * 8 + c);
        if (r === start && target(r + 2 * dir, c) === "empty") push((r + 2 * dir) * 8 + c);
      }
      for (const dc of [-1, 1]) {
        const tt = target(r + dir, c + dc);
        const j = (r + dir) * 8 + c + dc;
        if (tt === "capture" || (tt === "empty" && j === s.ep)) push(j);
      }
    } else if (t === "n" || t === "k") {
      for (const [dr, dc] of t === "n" ? KNIGHT : KING) {
        const tt = target(r + dr, c + dc);
        if (tt === "empty" || tt === "capture") push((r + dr) * 8 + c + dc);
      }
    } else {
      const dirs = t === "r" ? ORTHO : t === "b" ? DIAG : [...ORTHO, ...DIAG];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        for (;;) {
          const tt = target(rr, cc);
          if (tt === "off" || tt === "stop") break;
          push(rr * 8 + cc);
          if (tt === "capture") break;
          rr += dr;
          cc += dc;
        }
      }
    }
  }
  // Castling (standard start squares only).
  if (rules.castling && s.castle) {
    const home = me === "w" ? 60 : 4;
    const rights = me === "w" ? ["K", "Q"] : ["k", "q"];
    const king = me === "w" ? "K" : "k", rook = me === "w" ? "R" : "r";
    if (cells[home] === king && !frozen.has(home)) {
      const opp = other(me);
      const safe = (sq: number) => rules.kingCapture || !attacked(cells, sq, opp, frozen);
      if (s.castle.includes(rights[0]) && cells[home + 3] === rook && cells[home + 1] === "." && cells[home + 2] === "." && safe(home) && safe(home + 1) && safe(home + 2))
        out.push({ from: home, to: home + 2 });
      if (s.castle.includes(rights[1]) && cells[home - 4] === rook && cells[home - 1] === "." && cells[home - 2] === "." && cells[home - 3] === "." && safe(home) && safe(home - 1) && safe(home - 2))
        out.push({ from: home, to: home - 2 });
    }
  }
  return out;
}

/** Board change only (no bookkeeping) – used for legality checks. */
function rawApply(s: State, m: Move): string {
  const a = s.cells.split("");
  const piece = a[m.from];
  const t = typeOf(piece);
  if (t === "p" && m.to === s.ep && a[m.to] === ".") a[m.to + (colorOf(piece) === "w" ? 8 : -8)] = ".";
  if (t === "k" && Math.abs(m.to - m.from) === 2) {
    if (m.to > m.from) { a[m.from + 1] = a[m.from + 3]; a[m.from + 3] = "."; }
    else { a[m.from - 1] = a[m.from - 4]; a[m.from - 4] = "."; }
  }
  a[m.to] = m.promo ? pieceOf(colorOf(piece)!, m.promo) : piece;
  a[m.from] = ".";
  return a.join("");
}

/** Moves that may leave your own king in check (the search engine filters lazily). */
export function pseudoMoves(s: State, rules: Rules = CLASSIC): Move[] {
  return s.duckPending ? [] : pseudo(s, rules);
}

export function legalMoves(s: State, rules: Rules = CLASSIC): Move[] {
  if (s.duckPending) return [];
  const moves = pseudo(s, rules);
  if (rules.kingCapture) return moves;
  const me = s.turn, frozen = frozenSet(s);
  return moves.filter((m) => {
    const cells = rawApply(s, m);
    const k = kingSquare(cells, me);
    return k < 0 || !attacked(cells, k, other(me), frozen);
  });
}

export function movesFrom(s: State, from: number, rules: Rules = CLASSIC) {
  return legalMoves(s, rules).filter((m) => m.from === from);
}

export function findMove(s: State, from: number, to: number, rules: Rules = CLASSIC, promo?: string): Move | null {
  const m = legalMoves(s, rules).find((x) => x.from === from && x.to === to);
  if (!m) return null;
  return m.promo ? { ...m, promo: promo && "qrbn".includes(promo) ? promo : "q" } : m;
}

// ---------- Making moves ----------
export interface Applied {
  state: State;
  captured: string; // "" if none
  san: string;
  check: boolean;
}

function san(s: State, m: Move, rules: Rules): string {
  const piece = s.cells[m.from], t = typeOf(piece);
  if (t === "k" && Math.abs(m.to - m.from) === 2) return m.to > m.from ? "O-O" : "O-O-O";
  const capture = s.cells[m.to] !== "." || (t === "p" && m.to === s.ep);
  let out = "";
  if (t === "p") out = capture ? FILES[col(m.from)] : "";
  else {
    out = t.toUpperCase();
    const rivals = legalMoves(s, rules).filter((x) => x.to === m.to && x.from !== m.from && s.cells[x.from] === piece);
    if (rivals.length) {
      const sameFile = rivals.some((x) => col(x.from) === col(m.from));
      const sameRow = rivals.some((x) => row(x.from) === row(m.from));
      if (!sameFile) out += FILES[col(m.from)];
      else if (!sameRow) out += String(8 - row(m.from));
      else out += sqName(m.from);
    }
  }
  return out + (capture ? "x" : "") + sqName(m.to) + (m.promo ? "=" + m.promo.toUpperCase() : "");
}

function bumpPower(p: Power, ply: number): Power {
  return {
    ...p,
    shields: p.shields.filter((x) => x.until > ply),
    frozen: p.frozen.filter((x) => x.until > ply),
  };
}

export function applyMove(s: State, m: Move, rules: Rules = CLASSIC, fast = false): Applied {
  const piece = s.cells[m.from];
  const me = colorOf(piece)!;
  const t = typeOf(piece);
  let captured = s.cells[m.to] === "." ? "" : s.cells[m.to];
  if (t === "p" && m.to === s.ep && s.cells[m.to] === ".") captured = me === "w" ? "p" : "P";
  const notation = fast ? "" : san(s, m, rules);
  const cells = rawApply(s, m);

  let castle = s.castle;
  const drop = (ch: string) => { castle = castle.replace(ch, ""); };
  if (t === "k") { if (me === "w") { drop("K"); drop("Q"); } else { drop("k"); drop("q"); } }
  for (const [sq, ch] of [[63, "K"], [56, "Q"], [7, "k"], [0, "q"]] as const) if (m.from === sq || m.to === sq) drop(ch);

  const ply = s.ply + 1;
  let power = s.power;
  if (power) {
    power = bumpPower(power, ply);
    power.shields = power.shields.map((x) => (x.sq === m.from ? { ...x, sq: m.to } : x));
    power.frozen = power.frozen.filter((x) => x.sq !== m.to);
    if (captured) power.energy = { ...power.energy, [me]: Math.min(MAX_ENERGY, power.energy[me] + 1) };
  }

  const next: State = {
    cells,
    turn: rules.duck ? s.turn : other(me),
    castle,
    ep: t === "p" && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1,
    half: t === "p" || captured ? 0 : s.half + 1,
    ply,
    checks: { ...s.checks },
    duckPending: rules.duck ? true : undefined,
    power,
  };
  const check = !rules.kingCapture && inCheck({ ...next, turn: other(me) }, other(me));
  if (check) {
    next.checks[me] += 1;
    if (next.power) next.power.energy = { ...next.power.energy, [me]: Math.min(MAX_ENERGY, next.power.energy[me] + 1) };
  }
  let suffix = "";
  if (check && !fast) suffix = legalMoves(next, rules).length === 0 ? "#" : "+";
  return { state: next, captured, san: notation + suffix, check };
}

/** Duck chess: after moving, put the duck on an empty square (it must move). */
export function placeDuck(s: State, sq: number): State | null {
  if (!s.duckPending || sq < 0 || sq > 63 || s.cells[sq] !== ".") return null;
  const cells = s.cells.replace("*", ".").split("");
  cells[sq] = "*";
  return { ...s, cells: cells.join(""), duckPending: false, turn: other(s.turn) };
}

// ---------- Power-up cards ----------
export interface CardArgs { a: number; b?: number }

/** Squares you can tap for a card. For swap, pass `first` to get the second square. */
export function cardTargets(s: State, card: Card, rules: Rules, first?: number): number[] {
  if (!s.power) return [];
  const out: number[] = [];
  for (let i = 0; i < 64; i++) {
    const args = card === "swap" ? (first === undefined ? null : { a: first, b: i }) : { a: i };
    if (args) {
      if (playCard(s, card, args, rules)) out.push(i);
    } else {
      const ch = s.cells[i];
      if (colorOf(ch) === s.turn && typeOf(ch) !== "k") out.push(i);
    }
  }
  return out;
}

function rocketTo(s: State, sq: number): number | null {
  const ch = s.cells[sq];
  if (typeOf(ch) !== "p") return null;
  const dir = colorOf(ch) === "w" ? -8 : 8;
  const one = sq + dir, two = sq + 2 * dir;
  if (two < 0 || two > 63) return null;
  if (s.cells[one] !== "." || s.cells[two] !== ".") return null;
  return two;
}

/** Returns the new state, or null when the card can't be played like that. */
export function playCard(s: State, card: Card, args: CardArgs, rules: Rules): { state: State; endsTurn: boolean; label: string } | null {
  if (!s.power || s.duckPending) return null;
  const me = s.turn;
  const p = s.power;
  if (p.cardPly === s.ply) return null;
  if (p.energy[me] < CARD_COST[card]) return null;
  const a = args.a, ch = s.cells[a];
  if (a < 0 || a > 63 || !colorOf(ch) || typeOf(ch) === "k") return null;
  const spend: Power = { ...p, energy: { ...p.energy, [me]: p.energy[me] - CARD_COST[card] }, cardPly: s.ply };
  const keepsKingSafe = (cells: string) => rules.kingCapture || !attacked(cells, kingSquare(cells, me), other(me), frozenSet(s));

  if (card === "shield") {
    if (colorOf(ch) !== me) return null;
    spend.shields = [...p.shields.filter((x) => x.sq !== a), { sq: a, until: s.ply + 2 }];
    return { state: { ...s, power: spend }, endsTurn: false, label: `Shield on ${sqName(a)}` };
  }
  if (card === "freeze") {
    if (colorOf(ch) === me) return null;
    spend.frozen = [...p.frozen.filter((x) => x.sq !== a), { sq: a, until: s.ply + 4 }];
    const next = { ...s, power: spend };
    if (!rules.kingCapture && legalMoves({ ...next, turn: other(me), ply: s.ply + 1 }, rules).length === 0) return null; // no freeze-mates
    return { state: next, endsTurn: false, label: `Freeze ${sqName(a)}` };
  }
  let cells: string;
  let label: string;
  if (card === "swap") {
    const b = args.b ?? -1;
    const chb = s.cells[b];
    if (b < 0 || b > 63 || b === a || colorOf(ch) !== me || colorOf(chb) !== me || typeOf(chb) === "k") return null;
    const backRank = (sq: number) => row(sq) === 0 || row(sq) === 7;
    if ((typeOf(ch) === "p" && backRank(b)) || (typeOf(chb) === "p" && backRank(a))) return null;
    const arr = s.cells.split("");
    arr[a] = chb;
    arr[b] = ch;
    cells = arr.join("");
    label = `Swap ${sqName(a)}↔${sqName(b)}`;
    spend.shields = spend.shields.map((x) => (x.sq === a ? { ...x, sq: b } : x.sq === b ? { ...x, sq: a } : x));
  } else {
    if (colorOf(ch) !== me) return null;
    const to = rocketTo(s, a);
    if (to === null) return null;
    const arr = s.cells.split("");
    const lastRank = me === "w" ? 0 : 7;
    arr[to] = row(to) === lastRank ? pieceOf(me, "q") : ch;
    arr[a] = ".";
    cells = arr.join("");
    label = `Rocket ${sqName(a)}-${sqName(to)}`;
    spend.shields = spend.shields.map((x) => (x.sq === a ? { ...x, sq: to } : x));
  }
  if (!keepsKingSafe(cells)) return null;
  const ply = s.ply + 1;
  const next: State = { ...s, cells, turn: other(me), ep: -1, half: s.half + 1, ply, power: bumpPower(spend, ply) };
  if (inCheck(next, other(me))) next.checks = { ...s.checks, [me]: s.checks[me] + 1 };
  return { state: next, endsTurn: true, label };
}

// ---------- Game over ----------
export type Outcome = { winner: Color | "draw"; reason: string } | null;

export function outcome(s: State, rules: Rules = CLASSIC): Outcome {
  if (rules.kingCapture) {
    if (kingSquare(s.cells, "w") < 0) return { winner: "b", reason: "king" };
    if (kingSquare(s.cells, "b") < 0) return { winner: "w", reason: "king" };
  }
  if (rules.threeCheck) {
    if (s.checks.w >= 3) return { winner: "w", reason: "checks" };
    if (s.checks.b >= 3) return { winner: "b", reason: "checks" };
  }
  if (s.duckPending) return null;
  if (legalMoves(s, rules).length === 0) {
    if (rules.duck) return { winner: s.turn, reason: "stalemate" }; // duck chess: stalemated side wins
    if (!rules.kingCapture && inCheck(s)) return { winner: other(s.turn), reason: "checkmate" };
    return { winner: "draw", reason: "stalemate" };
  }
  if (s.half >= 100) return { winner: "draw", reason: "50 moves" };
  const left = s.cells.replace(/[.*kK]/g, "");
  if (left === "" || /^[nNbB]$/.test(left)) return { winner: "draw", reason: "not enough pieces" };
  return null;
}

// ---------- Fog of war ----------
/** Squares side `c` can see: its own pieces, everywhere they can move, and pawn pushes. */
export function visibleFor(s: State, c: Color, rules: Rules): Set<number> {
  const seen = new Set<number>();
  const view = { ...s, turn: c, duckPending: false };
  for (let i = 0; i < 64; i++) if (colorOf(s.cells[i]) === c) seen.add(i);
  for (const m of pseudo(view, { ...rules, castling: false }, c)) seen.add(m.to);
  for (let i = 0; i < 64; i++) {
    const ch = s.cells[i];
    if (colorOf(ch) !== c || typeOf(ch) !== "p") continue;
    const dir = c === "w" ? -8 : 8;
    if (i + dir >= 0 && i + dir < 64) seen.add(i + dir);
    if (s.cells[i + dir] === "." && i + 2 * dir >= 0 && i + 2 * dir < 64 && row(i) === (c === "w" ? 6 : 1)) seen.add(i + 2 * dir);
    for (const dc of [-1, 1]) {
      const j = i + dir + dc;
      if (j >= 0 && j < 64 && Math.abs(col(j) - col(i)) === 1) seen.add(j);
    }
  }
  const home = c === "w" ? 56 : 0;
  for (let k = 0; k < 8; k++) seen.add(home + k); // castling path
  return seen;
}

export function fogCells(s: State, c: Color, rules: Rules) {
  const seen = visibleFor(s, c, rules);
  return s.cells
    .split("")
    .map((ch, i) => (seen.has(i) ? ch : "?"))
    .join("");
}

// ---------- Bot ----------
const PV: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTER = [0, 1, 2, 3, 3, 2, 1, 0];

function evaluate(s: State): number {
  // From the point of view of the side to move.
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const ch = s.cells[i], c = colorOf(ch);
    if (!c) continue;
    const t = typeOf(ch), r = row(i), cc = col(i);
    let v = PV[t];
    if (t === "n" || t === "b") v += (CENTER[r] + CENTER[cc]) * 6;
    if (t === "p") v += (c === "w" ? 6 - r : r - 1) * 8 + (cc >= 2 && cc <= 5 ? 6 : 0);
    if (t === "q") v += (CENTER[r] + CENTER[cc]) * 2;
    if (t === "k") v += (c === "w" ? (r === 7 ? 12 : -10) : r === 0 ? 12 : -10);
    score += c === s.turn ? v : -v;
  }
  return score;
}

function ordered(s: State, moves: Move[]) {
  return moves
    .map((m) => {
      const cap = s.cells[m.to];
      const gain = cap === "." ? 0 : PV[typeOf(cap)] * 10 - PV[typeOf(s.cells[m.from])];
      return { m, k: gain + (m.promo ? 800 : 0) };
    })
    .sort((a, b) => b.k - a.k)
    .map((x) => x.m);
}

function search(s: State, depth: number, alpha: number, beta: number, rules: Rules, budget: { n: number }): number {
  budget.n--;
  const moves = legalMoves(s, rules);
  if (moves.length === 0) return inCheck(s) ? -100000 - depth : 0;
  if (depth === 0 || budget.n <= 0) return evaluate(s);
  let best = -Infinity;
  for (const m of ordered(s, moves)) {
    const v = -search(applyMove(s, m, rules, true).state, depth - 1, -beta, -alpha, rules, budget);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** Level 1 = gentle (blunders), 2 = casual, 3 = tricky. Classic rules only. */
export function botMove(s: State, level: number, rand: () => number = Math.random): Move | null {
  const moves = legalMoves(s, CLASSIC);
  if (!moves.length) return null;
  const depth = level >= 3 ? 3 : level === 2 ? 2 : 1;
  const noise = level >= 3 ? 10 : level === 2 ? 40 : 160;
  const budget = { n: level >= 3 ? 40000 : 8000 };
  let best = moves[0], bestScore = -Infinity;
  for (const m of ordered(s, moves)) {
    const next = applyMove(s, m, CLASSIC, true).state;
    const score = -search(next, depth - 1, -Infinity, Infinity, CLASSIC, budget) + rand() * noise;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** Strongest move we can find quickly (for the coach's "best move" peek). */
export function bestMove(s: State): Move | null {
  return botMove(s, 3, () => 0);
}
