// Raja Silat: the rules of a fight. Pure data and functions, no React.
// Squares are numbered r * n + c, with row 0 at the top (the enemy's side)
// and the last row at the bottom (your side). See docs/raja-silat-design.md.

export type Kind = "p" | "n" | "b" | "r" | "q" | "k";

export const PIECE: Record<Kind, { name: string; hp: number; hit: number; heavy: boolean }> = {
  p: { name: "Pawn", hp: 3, hit: 2, heavy: false },
  n: { name: "Knight", hp: 5, hit: 3, heavy: false },
  b: { name: "Bishop", hp: 5, hit: 3, heavy: false },
  r: { name: "Rook", hp: 7, hit: 4, heavy: true },
  q: { name: "Queen", hp: 7, hit: 5, heavy: true },
  k: { name: "King", hp: 16, hit: 4, heavy: true },
};

/** Collisions and blasts deal this much to each side. */
export const BUMP = 2;
/** Heavy pieces pushed off the board take this instead of being knocked out. */
export const HEAVY_RING_OUT = 5;

export interface Unit {
  id: number;
  kind: Kind;
  hp: number;
  max: number;
  sq: number;
  /** Damaged since it last planned: it acts next turn even past the limit. */
  angry: boolean;
  /** Turns left with no action (Kuncian). */
  locked: number;
  /** Knock this out to win (the king, or a boss). */
  target?: boolean;
  boss?: string;
  heavy?: boolean;
  hit?: number;
  /** The king's once-per-fight castling escape has been used. */
  escaped?: boolean;
}

export interface Thing {
  id: number;
  kind: "petasan" | "batu" | "warga";
  sq: number;
  /** Villagers only. */
  hp?: number;
}

/** Villagers (Warga) you protect. Each one lost costs you this much HP, and Block can't stop it. */
export const WARGA_HP = 3;
export const WARGA_LOSS = 3;

export type Intent =
  | { id: number; type: "strike"; target: number }
  | { id: number; type: "charge"; dir: number }
  | { id: number; type: "move"; to: number };

export type Fx =
  | { t: "dmg"; sq: number; n: number; hero?: boolean }
  | { t: "block"; sq: number; n: number }
  | { t: "ko"; sq: number; id?: number }
  | { t: "ringout"; sq: number; dir?: number; id?: number }
  | { t: "boom"; sq: number }
  | { t: "miss"; sq: number }
  | { t: "dodge"; sq: number }
  | { t: "promote"; sq: number }
  | { t: "castle"; sq: number }
  | { t: "lost"; sq: number }
  | { t: "summon"; sq: number }
  | { t: "react"; sq: number };

export type LogKind = "turn" | "you" | "enemy" | "good" | "bad";
export interface LogLine { t: string; k?: LogKind }

export interface Fight {
  n: number;
  turn: number;
  rng: number;
  hero: { sq: number; hp: number; max: number; block: number };
  tenaga: number;
  stepUsed: boolean;
  /** Elakan: the square you hop to when the first hit comes. */
  hop: number | null;
  /** Tangkisan: attackers that hit you get pushed back this far. */
  counter: number;
  powers: { harimau: number; momentum: number };
  units: Unit[];
  things: Thing[];
  mud: number[];
  draw: string[];
  hand: string[];
  discard: string[];
  exhausted: string[];
  intents: Intent[];
  /** During the enemy turn: the next intent to resolve (so a turn can resume after a reload). */
  enemyStep: number;
  /** How many enemies plan each turn (angry ones and bosses come on top). */
  limit: number;
  nextId: number;
  status: "play" | "enemy" | "won" | "lost";
  fx: Fx[];
  combo: number;
  bestCombo: number;
  ringOuts: number;
  wargaLost: number;
  /** What happened, oldest first. */
  log: LogLine[];
  /** Enemies that already struck back at you this turn. */
  reacted: number[];
}

// ---------- Geometry ----------

/** Eight directions, clockwise from straight up. [dx, dy] */
export const DIRS: [number, number][] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];
export const KNIGHT: [number, number][] = [
  [1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2],
];

export const col = (s: { n: number }, sq: number) => sq % s.n;
export const row = (s: { n: number }, sq: number) => Math.floor(sq / s.n);
export function offset(s: { n: number }, sq: number, dx: number, dy: number): number | null {
  const c = col(s, sq) + dx, r = row(s, sq) + dy;
  if (c < 0 || r < 0 || c >= s.n || r >= s.n) return null;
  return r * s.n + c;
}
export function dist(s: { n: number }, a: number, b: number) {
  return Math.max(Math.abs(col(s, a) - col(s, b)), Math.abs(row(s, a) - row(s, b)));
}
/** The direction index from a to b if they share a line (straight or diagonal), else -1. */
export function dirTo(s: { n: number }, a: number, b: number): number {
  const dx = col(s, b) - col(s, a), dy = row(s, b) - row(s, a);
  if (dx === 0 && dy === 0) return -1;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return -1;
  return DIRS.findIndex(([x, y]) => x === Math.sign(dx) && y === Math.sign(dy));
}
export const neighbors = (s: { n: number }, sq: number) =>
  DIRS.map(([dx, dy]) => offset(s, sq, dx, dy)).filter((x): x is number => x !== null);

export const isOrth = (dir: number) => dir % 2 === 0;
export const unitHit = (u: Unit) => u.hit ?? PIECE[u.kind].hit;
export const isHeavy = (u: Unit) => u.heavy ?? PIECE[u.kind].heavy;

// ---------- Who is where ----------

export type Occ = { t: "hero" } | { t: "unit"; u: Unit } | { t: "thing"; th: Thing };

export function occupant(s: Fight, sq: number): Occ | null {
  if (s.hero.sq === sq) return { t: "hero" };
  const u = s.units.find((x) => x.sq === sq);
  if (u) return { t: "unit", u };
  const th = s.things.find((x) => x.sq === sq);
  if (th) return { t: "thing", th };
  return null;
}
export const isEmpty = (s: Fight, sq: number) => occupant(s, sq) === null;
export const unitAt = (s: Fight, sq: number) => s.units.find((u) => u.sq === sq);

function moveOcc(s: Fight, o: Occ, sq: number) {
  if (o.t === "hero") s.hero.sq = sq;
  else if (o.t === "unit") o.u.sq = sq;
  else o.th.sq = sq;
}

// ---------- Battle log ----------

const DIR_NAMES = ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"];
export const sqName = (s: { n: number }, sq: number) => "abcdefgh"[col(s, sq)] + (s.n - row(s, sq));
export const unitName = (u: Unit) => u.boss ?? PIECE[u.kind].name;
export function occName(o: Occ) {
  if (o.t === "hero") return "You";
  if (o.t === "unit") return unitName(o.u);
  return o.th.kind === "warga" ? "Villager" : o.th.kind === "petasan" ? "Firecracker crate" : "Boulder";
}
export function say(s: Fight, t: string, k?: LogKind) {
  (s.log ??= []).push({ t, k });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

// ---------- Damage ----------

export function damageUnit(s: Fight, u: Unit, n: number) {
  if (!s.units.includes(u) || n <= 0) return;
  u.hp -= n;
  s.fx.push({ t: "dmg", sq: u.sq, n });
  s.combo++;
  if (u.hp <= 0) {
    s.units = s.units.filter((x) => x !== u);
    s.fx.push({ t: "ko", sq: u.sq, id: u.id });
    say(s, `${unitName(u)} takes ${n} and is knocked out`, "good");
  } else {
    say(s, `${unitName(u)} takes ${n} (${u.hp} left)`);
    u.angry = true;
    castle(s, u);
  }
  checkEnd(s);
}

/** Once per fight, a hurt king swaps places with the ally farthest from you (castling). */
function castle(s: Fight, k: Unit) {
  if (k.kind !== "k" || !k.target || k.boss || k.escaped || k.hp > k.max / 2) return;
  const allies = s.units.filter((x) => x !== k).sort((a, b) => dist(s, b.sq, s.hero.sq) - dist(s, a.sq, s.hero.sq) || a.id - b.id);
  if (!allies.length) return;
  k.escaped = true;
  const ally = allies[0];
  [k.sq, ally.sq] = [ally.sq, k.sq];
  s.fx.push({ t: "castle", sq: k.sq });
  say(s, `The King castles away to ${sqName(s, k.sq)}!`, "bad");
}

export function damageHero(s: Fight, n: number) {
  const blocked = Math.min(s.hero.block, n);
  s.hero.block -= blocked;
  if (blocked) { s.fx.push({ t: "block", sq: s.hero.sq, n: blocked }); say(s, `Your Block stops ${blocked}`, "good"); }
  const rest = n - blocked;
  if (rest > 0) {
    s.hero.hp = Math.max(0, s.hero.hp - rest);
    s.fx.push({ t: "dmg", sq: s.hero.sq, n: rest, hero: true });
    say(s, `You take ${rest} damage`, "bad");
  }
  checkEnd(s);
}

/** Hit whatever is on a square: the hero, a unit, or an object. */
export function hitOcc(s: Fight, o: Occ, n: number) {
  if (o.t === "hero") damageHero(s, n);
  else if (o.t === "unit") damageUnit(s, o.u, n);
  else if (o.th.kind === "petasan") explode(s, o.th);
  else if (o.th.kind === "warga") damageWarga(s, o.th, n);
}

export function damageWarga(s: Fight, th: Thing, n: number) {
  if (!s.things.includes(th) || n <= 0) return;
  th.hp = (th.hp ?? WARGA_HP) - n;
  s.fx.push({ t: "dmg", sq: th.sq, n });
  if (th.hp <= 0) killWarga(s, th);
  else say(s, `Villager takes ${n} (${th.hp} left)`, "bad");
}

function killWarga(s: Fight, th: Thing) {
  s.things = s.things.filter((t) => t !== th);
  s.wargaLost++;
  s.fx.push({ t: "lost", sq: th.sq });
  say(s, `A villager is lost! You lose ${WARGA_LOSS} HP`, "bad");
  s.hero.hp = Math.max(0, s.hero.hp - WARGA_LOSS);
  s.fx.push({ t: "dmg", sq: s.hero.sq, n: WARGA_LOSS, hero: true });
  checkEnd(s);
}

export const wargaSquares = (s: Fight) => s.things.filter((t) => t.kind === "warga").map((t) => t.sq);

export function checkEnd(s: Fight) {
  if (s.status === "won" || s.status === "lost") return;
  if (s.hero.hp <= 0) { s.status = "lost"; say(s, "You are knocked down.", "bad"); }
  else if (!s.units.some((u) => u.target)) { s.status = "won"; say(s, "The enemy kneels. You win!", "good"); }
}

// ---------- Pushes, collisions, explosions ----------

/** Sent flying: travels until it hits something. */
export const FLY = 99;
/** Heavy pieces (rook, queen, king) only slide this far. */
export const HEAVY_SLIDE = 2;
const CRASH_MAX = 7;

/** Push whatever is on `sq` in direction `dir`, up to `n` squares (FLY = until it hits something).
 *  A crash deals 2, +1 for every square it flew, and knocks what it hit one square on. */
export function push(s: Fight, sq: number, dir: number, n: number, crash = 0) {
  const mover = occupant(s, sq);
  if (!mover || n <= 0) return;
  if (mover.t === "unit") {
    if (isHeavy(mover.u)) n = Math.min(n, HEAVY_SLIDE);
    else if (n > 1 && isGuarded(s, mover.u)) {
      n = 1;
      say(s, `${unitName(mover.u)} is guarded and only budges 1 square`);
    }
  }
  const [dx, dy] = DIRS[dir];
  let cur = sq;
  let flew = 0;
  const moved = () => { if (cur !== sq) say(s, `${occName(mover)} ${flew > 1 ? "flies" : "is pushed"} to ${sqName(s, cur)}`); };
  for (let i = 0; i < n; i++) {
    const next = offset(s, cur, dx, dy);
    if (next === null) { moved(); return ringOut(s, mover, dir); }
    const other = occupant(s, next);
    if (other) {
      moved();
      const dmg = Math.min(CRASH_MAX, BUMP + flew + crash + s.powers.momentum);
      say(s, `${occName(mover)} crashes into ${occName(other) === "You" ? "you" : occName(other)}${flew > 1 ? ` at speed (${dmg})` : ""}`);
      return collide(s, mover, other, dir, dmg);
    }
    moveOcc(s, mover, next);
    cur = next;
    flew++;
    if (s.mud.includes(next)) { moved(); say(s, `${occName(mover)} sticks in the mud`); return; }
  }
  moved();
}

function collide(s: Fight, a: Occ, b: Occ, dir: number, n: number) {
  // Hit the one standing still first, then the one that was moving.
  for (const o of [b, a]) {
    if (o.t === "thing" && o.th.kind === "batu") continue;
    if (o.t === "thing") {
      if (!s.things.includes(o.th)) continue;
      if (o.th.kind === "petasan") explode(s, o.th);
      else damageWarga(s, o.th, n);
    } else {
      hitOcc(s, o, n);
    }
  }
  bumpOn(s, b, dir);
}

/** Newton's cradle: whatever got hit is knocked one square on (it can hit the next thing, and so on). */
function bumpOn(s: Fight, o: Occ, dir: number) {
  if (o.t === "unit" && s.units.includes(o.u) && !isHeavy(o.u)) push(s, o.u.sq, dir, 1);
  else if (o.t === "thing" && s.things.includes(o.th) && o.th.kind !== "petasan") push(s, o.th.sq, dir, 1);
}

export function ringOut(s: Fight, o: Occ, dir?: number) {
  if (o.t === "thing") {
    if (o.th.kind === "warga") return killWarga(s, o.th);
    s.things = s.things.filter((t) => t !== o.th);
    s.fx.push({ t: "ringout", sq: o.th.sq, dir });
    return;
  }
  if (o.t === "hero") return damageHero(s, HEAVY_RING_OUT);
  if (isHeavy(o.u)) { say(s, `${unitName(o.u)} is too heavy to fall and slams the edge`); return damageUnit(s, o.u, HEAVY_RING_OUT); }
  if (isGuarded(s, o.u)) { say(s, `${unitName(o.u)} is held by its guard and slams the edge`); return damageUnit(s, o.u, HEAVY_RING_OUT); }
  s.fx.push({ t: "ringout", sq: o.u.sq, dir, id: o.u.id });
  say(s, `${unitName(o.u)} flies off the board!`, "good");
  s.units = s.units.filter((x) => x !== o.u);
  s.ringOuts++;
  s.combo++;
  checkEnd(s);
}

/** A firecracker crate goes off: 2 damage to all 8 squares around it, and enemies there go flying outward. */
export function explode(s: Fight, th: Thing) {
  if (!s.things.includes(th)) return;
  s.things = s.things.filter((t) => t !== th);
  s.fx.push({ t: "boom", sq: th.sq });
  say(s, `The firecracker crate on ${sqName(s, th.sq)} explodes!`, "good");
  for (let d = 0; d < 8; d++) {
    const sq = offset(s, th.sq, DIRS[d][0], DIRS[d][1]);
    if (sq === null) continue;
    const o = occupant(s, sq);
    if (!o) continue;
    if (o.t === "thing") {
      if (o.th.kind === "petasan") explode(s, o.th); // boulders are too heavy to be blown away
      else if (o.th.kind === "warga") { damageWarga(s, o.th, BUMP); if (s.things.includes(o.th)) push(s, sq, d, 1); }
      continue;
    }
    hitOcc(s, o, BUMP);
    if (o.t === "unit" && s.units.includes(o.u)) push(s, o.u.sq, d, FLY);
  }
}

// ---------- Enemy turn ----------

/** Squares a piece can strike (capture) on. Sliders charge instead. */
export function strikeSquares(s: Fight, u: Unit): number[] {
  const out: number[] = [];
  const add = (dx: number, dy: number) => {
    const sq = offset(s, u.sq, dx, dy);
    if (sq !== null) out.push(sq);
  };
  if (u.kind === "p") { add(-1, 1); add(1, 1); }
  else if (u.kind === "n") KNIGHT.forEach(([dx, dy]) => add(dx, dy));
  else if (u.kind === "k") DIRS.forEach(([dx, dy]) => add(dx, dy));
  return out;
}

const SLIDES: Partial<Record<Kind, number[]>> = { r: [0, 2, 4, 6], b: [1, 3, 5, 7], q: [0, 1, 2, 3, 4, 5, 6, 7] };

// ---------- Guards (chess-style defence) ----------

/** Bishops, rooks and queens guard this many squares along their lines. */
export const GUARD_REACH = 2;

/** Squares a piece covers, like a defended square in chess. */
export function coverSquares(s: Fight, u: Unit, from = u.sq): number[] {
  const lines = SLIDES[u.kind];
  if (!lines) return strikeSquares(s, { ...u, sq: from });
  const out: number[] = [];
  for (const d of lines) {
    let cur = from;
    for (let i = 0; i < GUARD_REACH; i++) {
      const next = offset(s, cur, DIRS[d][0], DIRS[d][1]);
      if (next === null) break;
      out.push(next);
      if (next !== u.sq && !isEmpty(s, next)) break;
      cur = next;
    }
  }
  return out;
}

/** The enemy pieces protecting `u`. */
export const guardians = (s: Fight, u: Unit) => s.units.filter((v) => v !== u && coverSquares(s, v).includes(u.sq));
/** A guarded piece can't be sent flying (only nudged 1 square) and can't be knocked off the board. */
export const isGuarded = (s: Fight, u: Unit) => !isHeavy(u) && guardians(s, u).length > 0;

/** Empty squares a slider can reach this turn. */
function slideSquares(s: Fight, u: Unit): number[] {
  const out: number[] = [];
  for (const d of SLIDES[u.kind] ?? []) {
    let cur = u.sq;
    for (;;) {
      const next = offset(s, cur, DIRS[d][0], DIRS[d][1]);
      if (next === null || !isEmpty(s, next)) break;
      out.push(next);
      cur = next;
    }
  }
  return out;
}

function lineDir(s: Fight, u: Unit, sq: number) {
  const d = dirTo(s, u.sq, sq);
  return d >= 0 && (SLIDES[u.kind] ?? []).includes(d) ? d : -1;
}

/** How exposed a piece would be on `sq`: could you kick it off the board or into its friends? */
function exposure(s: Fight, u: Unit, sq: number): number {
  if (isHeavy(u) || s.units.some((v) => v !== u && coverSquares(s, v).includes(sq))) return 0;
  let risk = 0;
  for (let d = 0; d < 8; d++) {
    const [dx, dy] = DIRS[d];
    const from = offset(s, sq, -dx, -dy); // where you'd stand to kick it this way
    if (from === null || dist(s, from, s.hero.sq) > 1) continue; // only where you can reach right now
    if (from !== s.hero.sq && !isEmpty(s, from) && from !== u.sq) continue;
    let cur = sq;
    for (;;) {
      const next = offset(s, cur, dx, dy);
      if (next === null) { risk += 3; break; } // straight off the board
      if (next !== u.sq && !isEmpty(s, next)) {
        const o = occupant(s, next);
        if (o?.t === "unit") risk += 1; // into a friend
        if (o?.t === "thing" && o.th.kind === "petasan") risk += 2;
        break;
      }
      if (s.mud.includes(next)) break;
      cur = next;
    }
  }
  return risk;
}

/** How much a piece on `sq` would threaten you and your villagers. */
function threat(s: Fight, u: Unit, sq: number): number {
  const hero = s.hero.sq;
  const warga = wargaSquares(s);
  if (SLIDES[u.kind]) {
    let t = 0;
    const lines = SLIDES[u.kind] ?? [];
    if (lines.includes(dirTo(s, sq, hero))) t += 5;
    for (const w of warga) if (lines.includes(dirTo(s, sq, w))) t += 3;
    return t;
  }
  const reach = new Set(strikeSquares(s, { ...u, sq }));
  let t = reach.has(hero) ? 5 : 0;
  for (const w of warga) if (reach.has(w)) t += 4;
  for (const n of neighbors(s, hero)) if (reach.has(n) && isEmpty(s, n)) t += 1;
  return t;
}

function placeScore(s: Fight, u: Unit, sq: number) {
  const prey = [s.hero.sq, ...wargaSquares(s)];
  const near = Math.min(...prey.map((p) => dist(s, sq, p)));
  // Pieces like to stand where an ally guards them.
  const guarded = s.units.some((v) => v !== u && coverSquares(s, v).includes(sq)) ? 3 : 0;
  return threat(s, u, sq) * 2 - exposure(s, u, sq) + guarded - near;
}

function chooseIntent(s: Fight, u: Unit, covered: Set<number>): Intent | null {
  const hero = s.hero.sq;
  const warga = wargaSquares(s);
  const prey = [hero, ...warga];
  let moves: number[];
  if (SLIDES[u.kind]) {
    // Charge at you first, else at a villager in line.
    for (const p of prey) {
      const d = lineDir(s, u, p);
      if (d >= 0) return { id: u.id, type: "charge", dir: d };
    }
    moves = slideSquares(s, u);
  } else {
    // Strikers: your square, then a villager, then the squares you'd step to (boxing you in).
    const reach = new Set(strikeSquares(s, u));
    if (reach.has(hero) && !covered.has(hero)) return { id: u.id, type: "strike", target: hero };
    const victim = warga.find((sq) => reach.has(sq) && !covered.has(sq));
    if (victim !== undefined) return { id: u.id, type: "strike", target: victim };
    const escapes = neighbors(s, hero).filter((sq) => isEmpty(s, sq) && !covered.has(sq) && reach.has(sq));
    if (escapes.length) return { id: u.id, type: "strike", target: escapes[0] };
    if (reach.has(hero)) return { id: u.id, type: "strike", target: hero };
    if (u.kind === "p") {
      const f = offset(s, u.sq, 0, 1);
      return f !== null && isEmpty(s, f) ? { id: u.id, type: "move", to: f } : null;
    }
    moves = u.kind === "n" ? KNIGHT.map(([dx, dy]) => offset(s, u.sq, dx, dy)).filter((x): x is number => x !== null && isEmpty(s, x)) : [];
  }
  if (!moves.length) return null;
  // Move somewhere that threatens you or a villager, without standing where you can kick it off the board.
  const scored = moves.map((sq) => ({ sq, v: placeScore(s, u, sq) })).sort((a, b) => b.v - a.v || a.sq - b.sq);
  if (scored[0].v <= placeScore(s, u, u.sq) && exposure(s, u, u.sq) === 0) return null; // already in a good spot
  return { id: u.id, type: "move", to: scored[0].sq };
}

/** The king holds its throne behind its army and strikes if you come close.
 *  (Running away every turn made fights a long chase.) */
function kingIntent(s: Fight, k: Unit): Intent | null {
  if (strikeSquares(s, k).includes(s.hero.sq)) return { id: k.id, type: "strike", target: s.hero.sq };
  return null;
}

/** Enemies lock in what they'll do next turn. */
export function plan(s: Fight) {
  s.intents = [];
  const covered = new Set<number>();
  // Closest to its prey (you or a villager) acts first.
  const prey = [s.hero.sq, ...wargaSquares(s)];
  const near = (u: Unit) => Math.min(...prey.map((p) => dist(s, u.sq, p)));
  const byDist = (a: Unit, b: Unit) => near(a) - near(b) || a.id - b.id;
  const ready = s.units.filter((u) => {
    if (u.locked > 0) { u.locked--; return false; }
    return true;
  });
  const king = ready.find((u) => u.kind === "k" && u.target && !u.boss);
  const rest = ready.filter((u) => u !== king).sort(byDist);
  // Closest first. Angry pieces and bosses always act; the rest fill the limit,
  // skipping pieces that are stuck so the slots go to someone who can do something.
  let regular = 0;
  for (const u of rest) {
    const always = u.angry || !!u.boss;
    if (!always && regular >= s.limit) continue;
    const it = chooseIntent(s, u, covered);
    if (!it) continue;
    s.intents.push(it);
    if (!always) regular++;
    if (it.type === "strike") covered.add(it.target);
  }
  if (king) {
    const it = kingIntent(s, king);
    if (it) s.intents.push(it);
  }
  for (const u of s.units) u.angry = false;
}

/** An attack reaches the hero: Elakan hops away, Tangkisan kicks back. Returns true if it landed. */
function attackHero(s: Fight, u: Unit, n: number): boolean {
  if (s.hop !== null && isEmpty(s, s.hop)) {
    s.fx.push({ t: "dodge", sq: s.hero.sq });
    say(s, `You dodge to ${sqName(s, s.hop)}!`, "good");
    s.hero.sq = s.hop;
    s.hop = null;
    return false;
  }
  damageHero(s, n);
  if (s.counter > 0 && s.units.includes(u)) {
    const d = dirTo(s, s.hero.sq, u.sq);
    // Only attackers right next to you can be kicked back.
    if (d >= 0 && dist(s, s.hero.sq, u.sq) === 1) push(s, u.sq, d, s.counter);
  }
  return true;
}

// ---------- Reactions ----------

/** Enemies that would strike you if you ended a move on `sq`: any piece covering that square
 *  (the same squares it guards its allies on) that hasn't reacted yet this turn. */
export function reactors(s: Fight, sq: number): Unit[] {
  const done = s.reacted ?? [];
  return s.units.filter((u) => u.locked === 0 && !done.includes(u.id) && coverSquares(s, u).includes(sq));
}

/** Total damage you'd take from reactions by moving to `sq`. */
/** Reactions are quick jabs: half the piece's normal hit, rounded up. */
export const reactionHit = (u: Unit) => Math.ceil(unitHit(u) / 2);
export const reactionDamage = (s: Fight, sq: number) => reactors(s, sq).reduce((a, u) => a + reactionHit(u), 0);

/** You just moved: every enemy covering your new square strikes you, once per turn each. */
export function react(s: Fight) {
  for (const u of reactors(s, s.hero.sq)) {
    if (s.status === "won" || s.status === "lost") return;
    (s.reacted ??= []).push(u.id);
    s.fx.push({ t: "react", sq: u.sq });
    say(s, `${unitName(u)} covers ${sqName(s, s.hero.sq)} and strikes you as you arrive`, "bad");
    attackHero(s, u, reactionHit(u));
  }
}

function charge(s: Fight, u: Unit, dir: number) {
  const [dx, dy] = DIRS[dir];
  for (let guard = 0; guard < s.n * 2; guard++) {
    const next = offset(s, u.sq, dx, dy);
    if (next === null) { s.fx.push({ t: "miss", sq: u.sq }); say(s, `${unitName(u)} hits nothing and stops at ${sqName(s, u.sq)}`); return; }
    const o = occupant(s, next);
    if (o) {
      if (o.t === "hero") {
        if (attackHero(s, u, unitHit(u))) return;
        continue; // you hopped away: it keeps flying
      }
      if (o.t === "thing" && o.th.kind === "batu") return damageUnit(s, u, BUMP);
      hitOcc(s, o, unitHit(u));
      return bumpOn(s, o, dir);
    }
    u.sq = next;
    if (s.mud.includes(next)) return;
  }
}

function promote(s: Fight, u: Unit) {
  if (u.kind === "p" && row(s, u.sq) === s.n - 1) {
    u.kind = "q";
    u.max = PIECE.q.hp;
    u.hp = PIECE.q.hp;
    s.fx.push({ t: "promote", sq: u.sq });
    say(s, `A Pawn reaches your side and becomes a Queen!`, "bad");
  }
}

/** Can this piece still do what it planned from where it stands now? (A push can spoil a plan.) */
export function intentValid(s: Fight, it: Intent): boolean {
  const u = s.units.find((x) => x.id === it.id);
  if (!u) return false;
  if (it.type === "charge") return true;
  if (it.type === "strike") return strikeSquares(s, u).includes(it.target);
  if (u.kind === "p") return offset(s, u.sq, 0, 1) === it.to;
  if (u.kind === "n") return KNIGHT.some(([dx, dy]) => offset(s, u.sq, dx, dy) === it.to);
  if (u.kind === "k") return dist(s, u.sq, it.to) === 1;
  const d = lineDir(s, u, it.to);
  if (d < 0) return false;
  for (let cur = offset(s, u.sq, DIRS[d][0], DIRS[d][1]); cur !== null; cur = offset(s, cur, DIRS[d][0], DIRS[d][1])) {
    if (cur === it.to) return true;
    if (!isEmpty(s, cur)) return false;
  }
  return false;
}

/** Carry out one locked-in intent. */
export function resolveIntent(s: Fight, it: Intent) {
  if (s.status === "won" || s.status === "lost") return;
  const u = s.units.find((x) => x.id === it.id);
  if (!u) return;
  if (!intentValid(s, it)) { s.fx.push({ t: "miss", sq: u.sq }); say(s, `${unitName(u)} was knocked out of position and can't act`); return; }
  if (it.type === "move") {
    if (isEmpty(s, it.to)) { u.sq = it.to; say(s, `${unitName(u)} moves to ${sqName(s, it.to)}`, "enemy"); promote(s, u); }
    else say(s, `${unitName(u)} is blocked and stays put`, "enemy");
    return;
  }
  if (it.type === "charge") { say(s, `${unitName(u)} charges ${DIR_NAMES[it.dir]}`, "enemy"); return charge(s, u, it.dir); }
  say(s, `${unitName(u)} strikes ${sqName(s, it.target)}`, "enemy");
  const o = occupant(s, it.target);
  if (!o || (o.t === "thing" && o.th.kind === "batu")) { s.fx.push({ t: "miss", sq: it.target }); say(s, "…and misses"); return; }
  if (o.t === "hero") { attackHero(s, u, unitHit(u)); return; }
  hitOcc(s, o, unitHit(u));
}

/** Pawns that didn't act march one square toward you, and promote on your back row. */
export function march(s: Fight) {
  const acted = new Set(s.intents.map((i) => i.id));
  for (const u of [...s.units].sort((a, b) => b.sq - a.sq)) {
    if (u.kind !== "p" || acted.has(u.id) || u.locked > 0) continue;
    const f = offset(s, u.sq, 0, 1);
    if (f !== null && isEmpty(s, f)) { u.sq = f; say(s, `Pawn marches to ${sqName(s, f)}`, "enemy"); promote(s, u); }
  }
}

// ---------- Turns ----------

export function rand(s: Fight) {
  // mulberry32
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(s: Fight, list: string[]) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function drawCards(s: Fight, n: number) {
  for (let i = 0; i < n; i++) {
    if (!s.draw.length) {
      if (!s.discard.length) return;
      s.draw = shuffle(s, s.discard);
      s.discard = [];
    }
    s.hand.push(s.draw.pop()!);
  }
}

export const HAND = 5;
export const TENAGA = 3;

export function startTurn(s: Fight, guarantee?: (id: string) => boolean) {
  s.turn++;
  say(s, `Turn ${s.turn}`, "turn");
  s.hero.block = 0;
  s.tenaga = TENAGA;
  s.stepUsed = false;
  s.hop = null;
  s.counter = 0;
  s.reacted = [];
  s.combo = 0;
  s.status = "play";
  drawCards(s, HAND);
  // The first hand always has something to hit with.
  if (s.turn === 1 && guarantee && !s.hand.some(guarantee)) {
    const i = s.draw.findIndex(guarantee);
    if (i >= 0) [s.hand[0], s.draw[i]] = [s.draw[i], s.hand[0]];
  }
}

export const clone = (s: Fight): Fight => structuredClone(s);

/** End your turn: discard the hand. Then resolve intents one by one, then `finishEnemy`. */
export function beginEnemy(s: Fight) {
  s.discard.push(...s.hand);
  s.hand = [];
  s.fx = [];
  s.status = "enemy";
  s.enemyStep = 0;
}

/** Resolve the next intent of the enemy turn. Returns false when there are none left. */
export function enemyStep(s: Fight): boolean {
  s.enemyStep ??= 0;
  if (s.status !== "enemy" || s.enemyStep >= s.intents.length) return false;
  const it = s.intents[s.enemyStep++];
  resolveIntent(s, it);
  return true;
}

/** Every 3 turns the king (or boss) calls a pawn to its side. */
export const SUMMON_EVERY = 3;
function summon(s: Fight) {
  const leader = s.units.find((u) => u.target);
  if (!leader || s.units.length >= 9) return;
  const spots = neighbors(s, leader.sq)
    .filter((sq) => isEmpty(s, sq) && row(s, sq) < s.n - 2)
    .sort((a, b) => dist(s, a, s.hero.sq) - dist(s, b, s.hero.sq) || a - b);
  if (!spots.length) return;
  const sq = spots[0];
  s.units.push({ id: s.nextId++, kind: "p", hp: PIECE.p.hp, max: PIECE.p.hp, sq, angry: false, locked: 0 });
  s.fx.push({ t: "summon", sq });
  say(s, `${unitName(leader)} calls a Pawn to ${sqName(s, sq)}`, "bad");
}

export function finishEnemy(s: Fight, guarantee?: (id: string) => boolean) {
  if (s.status === "won" || s.status === "lost") return;
  march(s);
  if (s.turn % SUMMON_EVERY === 0) summon(s);
  plan(s);
  startTurn(s, guarantee);
}

/** The whole enemy turn at once (tests and forecasts). */
export function enemyTurn(s: Fight) {
  beginEnemy(s);
  while (enemyStep(s));
  finishEnemy(s);
}

/** What the enemy turn would do to you right now, without changing anything. */
export function forecast(s: Fight) {
  const f = clone(s);
  const hp = f.hero.hp;
  const wargaHp = (x: Fight) => x.things.reduce((a, t) => a + (t.kind === "warga" ? t.hp ?? WARGA_HP : 0), 0);
  const before = { warga: wargaHp(f), lost: f.wargaLost };
  f.fx = [];
  f.status = "enemy";
  for (const it of [...f.intents]) resolveIntent(f, it);
  return {
    damage: hp - f.hero.hp,
    dies: f.hero.hp <= 0,
    /** HP your villagers lose (not counting ones that die). */
    wargaHurt: Math.max(0, before.warga - wargaHp(f) - (f.wargaLost - before.lost) * WARGA_HP),
    wargaDead: f.wargaLost - before.lost,
    after: f,
  };
}

/** Where a charge would end up right now (for drawing its arrow). */
export function chargeEnd(s: Fight, it: Extract<Intent, { type: "charge" }>) {
  const u = s.units.find((x) => x.id === it.id);
  if (!u) return null;
  const [dx, dy] = DIRS[it.dir];
  let cur = u.sq;
  for (;;) {
    const next = offset(s, cur, dx, dy);
    if (next === null || occupant(s, next) || s.mud.includes(next)) return next ?? cur;
    cur = next;
  }
}

export function freeSteps(s: Fight) {
  if (s.stepUsed || s.status !== "play") return [];
  return neighbors(s, s.hero.sq).filter((sq) => isEmpty(s, sq));
}

export function step(s: Fight, sq: number) {
  const f = clone(s);
  f.fx = [];
  f.hero.sq = sq;
  f.stepUsed = true;
  say(f, `You step to ${sqName(f, sq)}`, "you");
  react(f);
  return f;
}

// ---------- Setting up ----------

export interface Setup {
  n?: number;
  hero: number;
  heroHp: number;
  heroMax: number;
  units: { kind: Kind; sq: number; target?: boolean; boss?: string; hp?: number; heavy?: boolean; hit?: number }[];
  things?: { kind: Thing["kind"]; sq: number }[];
  mud?: number[];
  deck: string[];
  limit?: number;
  seed: number;
}

export function makeFight(o: Setup, guarantee?: (id: string) => boolean): Fight {
  let id = 1;
  const s: Fight = {
    n: o.n ?? 6,
    turn: 0,
    rng: o.seed >>> 0,
    hero: { sq: o.hero, hp: o.heroHp, max: o.heroMax, block: 0 },
    tenaga: TENAGA,
    stepUsed: false,
    hop: null,
    counter: 0,
    powers: { harimau: 0, momentum: 0 },
    units: o.units.map((u) => ({
      id: id++,
      kind: u.kind,
      hp: u.hp ?? PIECE[u.kind].hp,
      max: u.hp ?? PIECE[u.kind].hp,
      sq: u.sq,
      angry: false,
      locked: 0,
      target: u.target ?? u.kind === "k",
      boss: u.boss,
      heavy: u.heavy,
      hit: u.hit,
    })),
    things: (o.things ?? []).map((t) => ({ id: id++, ...t, ...(t.kind === "warga" ? { hp: WARGA_HP } : {}) })),
    mud: o.mud ?? [],
    draw: [],
    hand: [],
    discard: [],
    exhausted: [],
    intents: [],
    enemyStep: 0,
    limit: o.limit ?? 2,
    nextId: id,
    status: "play",
    fx: [],
    combo: 0,
    bestCombo: 0,
    ringOuts: 0,
    wargaLost: 0,
    log: [],
    reacted: [],
  };
  s.draw = shuffle(s, [...o.deck]);
  say(s, "Blue shield = guarded by an ally: kicks only budge it 1 square. Break the guard first.");
  plan(s);
  startTurn(s, guarantee);
  return s;
}
