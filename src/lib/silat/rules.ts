// Raja Silat: the rules of a fight. Pure data and functions, no React.
// Squares are numbered r * n + c, with row 0 at the top (the enemy's side)
// and the last row at the bottom (your side). See docs/raja-silat-design.md.

export type Kind = "p" | "n" | "b" | "r" | "q" | "k";

export const PIECE: Record<Kind, { name: string; hp: number; hit: number; heavy: boolean }> = {
  p: { name: "Pawn", hp: 3, hit: 1, heavy: false },
  n: { name: "Knight", hp: 5, hit: 2, heavy: false },
  b: { name: "Bishop", hp: 5, hit: 2, heavy: false },
  r: { name: "Rook", hp: 7, hit: 3, heavy: true },
  q: { name: "Queen", hp: 7, hit: 3, heavy: true },
  k: { name: "King", hp: 16, hit: 3, heavy: true },
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
  | { t: "ko"; sq: number }
  | { t: "ringout"; sq: number }
  | { t: "boom"; sq: number }
  | { t: "miss"; sq: number }
  | { t: "dodge"; sq: number }
  | { t: "promote"; sq: number }
  | { t: "castle"; sq: number }
  | { t: "lost"; sq: number };

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

// ---------- Damage ----------

export function damageUnit(s: Fight, u: Unit, n: number) {
  if (!s.units.includes(u) || n <= 0) return;
  u.hp -= n;
  s.fx.push({ t: "dmg", sq: u.sq, n });
  s.combo++;
  if (u.hp <= 0) {
    s.units = s.units.filter((x) => x !== u);
    s.fx.push({ t: "ko", sq: u.sq });
  } else {
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
}

export function damageHero(s: Fight, n: number) {
  const blocked = Math.min(s.hero.block, n);
  s.hero.block -= blocked;
  if (blocked) s.fx.push({ t: "block", sq: s.hero.sq, n: blocked });
  const rest = n - blocked;
  if (rest > 0) {
    s.hero.hp = Math.max(0, s.hero.hp - rest);
    s.fx.push({ t: "dmg", sq: s.hero.sq, n: rest, hero: true });
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
}

function killWarga(s: Fight, th: Thing) {
  s.things = s.things.filter((t) => t !== th);
  s.wargaLost++;
  s.fx.push({ t: "lost", sq: th.sq });
  s.hero.hp = Math.max(0, s.hero.hp - WARGA_LOSS);
  s.fx.push({ t: "dmg", sq: s.hero.sq, n: WARGA_LOSS, hero: true });
  checkEnd(s);
}

export const wargaSquares = (s: Fight) => s.things.filter((t) => t.kind === "warga").map((t) => t.sq);

export function checkEnd(s: Fight) {
  if (s.status === "won" || s.status === "lost") return;
  if (s.hero.hp <= 0) s.status = "lost";
  else if (!s.units.some((u) => u.target)) s.status = "won";
}

// ---------- Pushes, collisions, explosions ----------

/** Push whatever is on `sq` up to `n` squares in direction `dir`. */
export function push(s: Fight, sq: number, dir: number, n: number) {
  const mover = occupant(s, sq);
  if (!mover || n <= 0) return;
  const [dx, dy] = DIRS[dir];
  let cur = sq;
  for (let i = 0; i < n + s.powers.momentum; i++) {
    const next = offset(s, cur, dx, dy);
    if (next === null) return ringOut(s, mover);
    const other = occupant(s, next);
    if (other) return collide(s, mover, other);
    moveOcc(s, mover, next);
    cur = next;
    if (s.mud.includes(next)) return;
  }
}

function collide(s: Fight, a: Occ, b: Occ) {
  const n = BUMP + s.powers.harimau;
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
}

export function ringOut(s: Fight, o: Occ) {
  if (o.t === "thing") {
    if (o.th.kind === "warga") return killWarga(s, o.th);
    s.things = s.things.filter((t) => t !== o.th);
    s.fx.push({ t: "ringout", sq: o.th.sq });
    return;
  }
  if (o.t === "hero") return damageHero(s, HEAVY_RING_OUT);
  if (isHeavy(o.u)) return damageUnit(s, o.u, HEAVY_RING_OUT);
  s.fx.push({ t: "ringout", sq: o.u.sq });
  s.units = s.units.filter((x) => x !== o.u);
  s.ringOuts++;
  s.combo++;
  checkEnd(s);
}

/** A firecracker crate goes off: 2 damage to all 8 squares around it, and they get pushed 1 outward. */
export function explode(s: Fight, th: Thing) {
  if (!s.things.includes(th)) return;
  s.things = s.things.filter((t) => t !== th);
  s.fx.push({ t: "boom", sq: th.sq });
  for (let d = 0; d < 8; d++) {
    const sq = offset(s, th.sq, DIRS[d][0], DIRS[d][1]);
    if (sq === null) continue;
    const o = occupant(s, sq);
    if (!o) continue;
    if (o.t === "thing") {
      if (o.th.kind === "petasan") explode(s, o.th); // boulders are too heavy to be blown away
      else if (o.th.kind === "warga") damageWarga(s, o.th, BUMP);
      continue;
    }
    hitOcc(s, o, BUMP);
    if (o.t === "unit" && s.units.includes(o.u)) push(s, o.u.sq, d, 1);
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

function chooseIntent(s: Fight, u: Unit, covered: Set<number>): Intent | null {
  const hero = s.hero.sq;
  const warga = wargaSquares(s);
  const prey = [hero, ...warga];
  if (SLIDES[u.kind]) {
    // Charge at you first, else at a villager in line.
    for (const p of prey) {
      const d = lineDir(s, u, p);
      if (d >= 0) return { id: u.id, type: "charge", dir: d };
    }
    const opts = slideSquares(s, u);
    if (!opts.length) return null;
    const lines = (sq: number) => (prey.some((p) => (SLIDES[u.kind] ?? []).includes(dirTo(s, sq, p))) ? 0 : 100);
    const near = (sq: number) => Math.min(...prey.map((p) => dist(s, sq, p)));
    const best = [...opts].sort((a, b) => lines(a) + near(a) * 2 - (lines(b) + near(b) * 2) || a - b)[0];
    return { id: u.id, type: "move", to: best };
  }
  // Strikers: your square, then a villager, then the squares you'd step to (boxing you in).
  const reach = new Set(strikeSquares(s, u));
  if (reach.has(hero) && !covered.has(hero)) return { id: u.id, type: "strike", target: hero };
  const victim = warga.find((sq) => reach.has(sq) && !covered.has(sq));
  if (victim !== undefined) return { id: u.id, type: "strike", target: victim };
  const escapes = neighbors(s, hero).filter((sq) => isEmpty(s, sq) && !covered.has(sq) && reach.has(sq));
  if (escapes.length) return { id: u.id, type: "strike", target: escapes[0] };
  if (reach.has(hero)) return { id: u.id, type: "strike", target: hero };
  // Walk closer.
  let moves: number[] = [];
  if (u.kind === "p") {
    const f = offset(s, u.sq, 0, 1);
    moves = f !== null && isEmpty(s, f) ? [f] : [];
  } else if (u.kind === "n") {
    moves = KNIGHT.map(([dx, dy]) => offset(s, u.sq, dx, dy)).filter((x): x is number => x !== null && isEmpty(s, x));
  }
  if (!moves.length) return null;
  // Prefer squares that threaten you, a villager, or where you'd step next turn; then just get closer.
  const zone = new Set([hero, ...neighbors(s, hero), ...warga]);
  const threat = (sq: number) => strikeSquares(s, { ...u, sq }).filter((x) => zone.has(x)).length;
  const near = (sq: number) => Math.min(...prey.map((p) => dist(s, sq, p)));
  const best = [...moves].sort((a, b) => threat(b) - threat(a) || near(a) - near(b) || a - b)[0];
  return { id: u.id, type: "move", to: best };
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

function charge(s: Fight, u: Unit, dir: number) {
  const [dx, dy] = DIRS[dir];
  for (let guard = 0; guard < s.n * 2; guard++) {
    const next = offset(s, u.sq, dx, dy);
    if (next === null) { s.fx.push({ t: "miss", sq: u.sq }); return; }
    const o = occupant(s, next);
    if (o) {
      if (o.t === "hero") {
        if (attackHero(s, u, unitHit(u))) return;
        continue; // you hopped away: it keeps flying
      }
      if (o.t === "thing" && o.th.kind === "batu") return damageUnit(s, u, BUMP);
      return hitOcc(s, o, unitHit(u));
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
  if (!intentValid(s, it)) { s.fx.push({ t: "miss", sq: u.sq }); return; }
  if (it.type === "move") {
    if (isEmpty(s, it.to)) { u.sq = it.to; promote(s, u); }
    return;
  }
  if (it.type === "charge") return charge(s, u, it.dir);
  const o = occupant(s, it.target);
  if (!o || (o.t === "thing" && o.th.kind === "batu")) { s.fx.push({ t: "miss", sq: it.target }); return; }
  if (o.t === "hero") { attackHero(s, u, unitHit(u)); return; }
  hitOcc(s, o, unitHit(u));
}

/** Pawns that didn't act march one square toward you, and promote on your back row. */
export function march(s: Fight) {
  const acted = new Set(s.intents.map((i) => i.id));
  for (const u of [...s.units].sort((a, b) => b.sq - a.sq)) {
    if (u.kind !== "p" || acted.has(u.id) || u.locked > 0) continue;
    const f = offset(s, u.sq, 0, 1);
    if (f !== null && isEmpty(s, f)) { u.sq = f; promote(s, u); }
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
  s.hero.block = 0;
  s.tenaga = TENAGA;
  s.stepUsed = false;
  s.hop = null;
  s.counter = 0;
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

export function finishEnemy(s: Fight, guarantee?: (id: string) => boolean) {
  if (s.status === "won" || s.status === "lost") return;
  march(s);
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
  };
  s.draw = shuffle(s, [...o.deck]);
  plan(s);
  startTurn(s, guarantee);
  return s;
}
