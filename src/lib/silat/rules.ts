// Raja Silat: the rules of a fight. Pure data and functions, no React.
// Squares are numbered r * n + c, with row 0 at the top (the enemy's side)
// and the last row at the bottom (your side). See docs/raja-silat-design.md.

export type Kind = "p" | "n" | "b" | "r" | "q" | "k";

/** Where a fight happens. You start locked in a cell and fight your way out to the gate. */
export type Scene = "cell" | "corridor" | "yard" | "wall" | "gate";

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
  /** Raja Hitam (the final boss) below half HP: phase 2. */
  phase?: 2;
}

export interface Thing {
  id: number;
  kind: "petasan" | "batu";
  sq: number;
}

export type Intent =
  | { id: number; type: "strike"; target: number }
  | { id: number; type: "charge"; dir: number }
  | { id: number; type: "move"; to: number }
  /** Hantam: a heavy piece slams the ground, hitting the centre square and all 8 around it. */
  | { id: number; type: "slam"; center: number };

/** Heavy pieces (rook, queen, king, bosses) slam when you're this close. */
export const SLAM_REACH = 2;

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
  | { t: "summon"; sq: number }
  | { t: "react"; sq: number }
  | { t: "slam"; sq: number }
  | { t: "gold"; sq: number; n: number }
  | { t: "lunge"; sq: number; dir: number }
  /** A d20 was rolled here: `n` is the die, `ok` whether it worked for whoever rolled. */
  | { t: "roll"; sq: number; n: number; ok: boolean; hero?: boolean }
  | { t: "fury"; sq: number }
  /** You took a piece's square by knocking it out (a chess capture). */
  | { t: "capture"; sq: number }
  /** Siap: your readied card went off. */
  | { t: "parry"; sq: number }
  /** A natural 20 on your roll. */
  | { t: "crit"; sq: number }
  /** A natural 1 on an enemy's jab: it stumbles. */
  | { t: "stumble"; sq: number };

/** Dice modifiers that last until your next turn starts (so they cover the enemy turn too). */
export interface Luck {
  /** Mata Elang: your rolls are rolled twice, keep the best. */
  adv: boolean;
  /** Tenang: added to your rolls. */
  bonus: number;
  /** Ejek: enemy reactions roll twice, keep the worst. */
  taunt: boolean;
  /** Bom Asap: enemies can't react to your moves. */
  smoke: boolean;
  /** Bayang Bangau (a named combo): your rolls can't fail. */
  sure?: boolean;
}
export const freshLuck = (): Luck => ({ adv: false, bonus: 0, taunt: false, smoke: false });

export type LogKind = "turn" | "you" | "enemy" | "good" | "bad";
export interface LogLine { t: string; k?: LogKind }

/** Jurus (power) cards: how many of each you've played this fight. */
export interface Powers {
  harimau: number; // kicks +1
  momentum: number; // crashes +2
  amuk?: number; // each crash you cause: +2 Block
  benteng?: number; // start each turn with +3 Block
  pantulan?: number; // Block you soak is dealt back to the attacker
  lincah?: number; // each time you move, your next kick hits +2
  bayangan?: number; // your moves never set off reactions
}

/** Things counted per turn. */
export interface TurnFlags {
  crashed: boolean; // Keris Berapi used
  ko: boolean; // Kopi Tubruk used
  crashes?: number; // crashes you caused this turn
  rush?: number; // Lincah: bonus on your next kick
}
const freshTurn = (): TurnFlags => ({ crashed: false, ko: false, crashes: 0, rush: 0 });

export interface Fight {
  n: number;
  turn: number;
  rng: number;
  hero: { sq: number; hp: number; max: number; block: number };
  tenaga: number;
  stepUsed: boolean;
  /** Extra free steps left this turn (Sandal Jepit). */
  extraSteps: number;
  /** Pusaka (relics) you carry: ids from relics.ts. */
  relics: string[];
  /** Things that happen once per turn (relic triggers). */
  tf: TurnFlags;
  /** Elakan: the square you hop to when the first hit comes. */
  hop: number | null;
  /** Tangkisan: attackers that hit you get pushed back this far. */
  counter: number;
  /** Jurus (power) cards in play this fight. */
  powers: Powers;
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
  /** Enemies knocked out this fight (each one drops gold). */
  kos: number;
  /** What happened, oldest first. */
  log: LogLine[];
  /** Enemies that already struck back at you this turn. */
  reacted: number[];
  /** The formation's name, shown at the top. */
  name?: string;
  /** Win by surviving this many turns (knocking out the leader still wins too). */
  survive?: number;
  /** Dice: their own random stream, so rolling never changes your card draws. */
  dice?: number;
  /** Siap: a Tangkis card readied for the enemy turn. It goes off on the first attack against you;
   *  if nothing attacks, it comes back to your hand. */
  ready?: string | null;
  /** Kaki Kuda: your free step moves like a knight this turn. */
  knightStep?: boolean;
  /** Atur Napas: extra Tenaga at the start of your next turn. */
  nextTenaga?: number;
  /** Where in the prison this fight is (only changes the look of the board). */
  scene?: Scene;
  /** Dice modifiers until your next turn. */
  luck?: Luck;
  /** A preview copy: rolls assume the worst for you and never touch the dice. */
  sim?: boolean;
  /** Tests: every d20 lands on this. */
  fixedRoll?: number;
  /** Extra hand size for this fight (Tambah). */
  handBonus?: number;
  /** Simpan: keep your unplayed cards at the end of this turn. */
  keepHand?: boolean;
  /** Enemies that moved during the last enemy turn (En Passant). */
  movedLast?: number[];
  /** A named combo powered up the card being played: its first hit deals this much more. */
  surge?: number;
  /** Named combos (Jurus Rangkai) set off by the combo being played, in order. */
  rangkai?: string[];
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

// ---------- Relics ----------

export const has = (s: Fight, relic: string) => (s.relics ?? []).includes(relic);

/** Your turn, not the enemy's: relics only trigger on what you do. */
const yours = (s: Fight) => s.status === "play";

/** A piece was knocked out on your turn (Kopi Tubruk: first one each turn gives +1 Tenaga). */
export const KO_GOLD = 2;

function onKnockout(s: Fight, sq: number) {
  s.kos = (s.kos ?? 0) + 1;
  s.fx.push({ t: "gold", sq, n: KO_GOLD });
  if (!yours(s) || !has(s, "kopi") || s.tf?.ko) return;
  s.tf = { ...freshTurn(), ...s.tf, ko: true };
  s.tenaga++;
  say(s, "Kopi Tubruk: +1 Tenaga", "good");
}

// ---------- Battle log ----------

const DIR_NAMES = ["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"];
export const sqName = (s: { n: number }, sq: number) => "abcdefgh"[col(s, sq)] + (s.n - row(s, sq));
export const unitName = (u: Unit) => u.boss ?? PIECE[u.kind].name;
export function occName(o: Occ) {
  if (o.t === "hero") return "You";
  if (o.t === "unit") return unitName(o.u);
  return o.th.kind === "petasan" ? "Firecracker crate" : "Boulder";
}
export function say(s: Fight, t: string, k?: LogKind) {
  (s.log ??= []).push({ t, k });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

// ---------- Dice (d20 reactions) ----------

/** What a d20 has to reach. Enemy reactions (jabs as you arrive), your dodge (Elakan), your kick-back (Tangkisan). */
export const DC = { react: 10, dodge: 8, counter: 8 } as const;

function d20(s: Fight): number {
  if (s.fixedRoll) return s.fixedRoll;
  let t = (s.dice = ((s.dice ?? s.rng ^ 0x5bd1e995) + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return 1 + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 20);
}

/** You roll (dodging, kicking back). A 20 always works, a 1 always fails.
 *  Returns 0 (failed), 1 (worked) or 2 (a natural 20: Sempurna!, a bigger effect).
 *  Previews assume you fail, so they never give a roll away. */
export function heroRoll(s: Fight, what: string, dc: number): 0 | 1 | 2 {
  const luck = s.luck ?? freshLuck();
  if (luck.sure) { say(s, `${what}: no roll needed, it works!`, "good"); return 1; }
  if (s.sim) return 0;
  const a = d20(s);
  const b = luck.adv ? d20(s) : 0;
  const die = Math.max(a, b);
  const total = die + luck.bonus;
  const ok = die === 20 || (die !== 1 && total >= dc);
  s.fx.push({ t: "roll", sq: s.hero.sq, n: die, ok, hero: true });
  const extra = [b ? `best of ${a} and ${b}` : "", luck.bonus ? `+${luck.bonus}` : ""].filter(Boolean).join(", ");
  say(s, `d20 ${what}: ${die}${extra ? ` (${extra})` : ""} vs ${dc}, ${ok ? "it works!" : "it fails"}`, ok ? "good" : "bad");
  if (die === 20) { s.fx.push({ t: "crit", sq: s.hero.sq }); say(s, "Natural 20: Sempurna!", "good"); return 2; }
  return ok ? 1 : 0;
}

/** The chance an enemy's jab hits you right now (taunted enemies roll twice and keep the worst). */
export function jabChance(s: Fight): number {
  const p = (21 - DC.react) / 20;
  return s.luck?.taunt ? p * p : p;
}

/** An enemy rolls to hit you with a reaction. Previews assume it hits. */
export function enemyRoll(s: Fight, u: Unit, dc: number): boolean {
  if (s.sim) return true;
  const luck = s.luck ?? freshLuck();
  const a = d20(s);
  const b = luck.taunt ? d20(s) : 0;
  const die = b ? Math.min(a, b) : a;
  const ok = die === 20 || (die !== 1 && die >= dc);
  s.fx.push({ t: "roll", sq: u.sq, n: die, ok });
  say(s, `d20 ${unitName(u)} jabs: ${die}${b ? ` (worst of ${a} and ${b}, taunted)` : ""} vs ${dc}, ${ok ? "hits" : "misses"}`, ok ? "bad" : "good");
  if (die === 1) {
    // A natural 1: it overreaches and stumbles. Bosses keep their feet.
    s.fx.push({ t: "stumble", sq: u.sq });
    if (u.boss) say(s, `Natural 1: ${unitName(u)} stumbles but keeps its feet`, "good");
    else {
      say(s, `Natural 1: the ${unitName(u)} stumbles and loses its next action!`, "good");
      u.locked = Math.max(u.locked, 1);
      s.intents = s.intents.filter((i) => i.id !== u.id);
    }
  }
  return ok;
}

// ---------- Damage ----------

export function damageUnit(s: Fight, u: Unit, n: number) {
  if (!s.units.includes(u) || n <= 0) return;
  if (s.surge && yours(s)) { n += s.surge; s.surge = 0; }
  u.hp -= n;
  s.fx.push({ t: "dmg", sq: u.sq, n });
  s.combo++;
  if (u.hp <= 0) {
    s.units = s.units.filter((x) => x !== u);
    s.fx.push({ t: "ko", sq: u.sq, id: u.id });
    say(s, `${unitName(u)} takes ${n} and is knocked out`, "good");
    onKnockout(s, u.sq);
  } else {
    say(s, `${unitName(u)} takes ${n} (${u.hp} left)`);
    u.angry = true;
    fury(s, u);
    castle(s, u);
  }
  checkEnd(s);
}

export const isRaja = (u: Unit) => u.kind === "k" && !!u.boss;

/** Raja Hitam below half HP: phase 2. He hits harder, walks at you, kicks you back and calls two pawns. */
function fury(s: Fight, k: Unit) {
  if (!isRaja(k) || k.phase || k.hp > k.max / 2) return;
  k.phase = 2;
  k.hit = (k.hit ?? PIECE.k.hit) + 1;
  s.fx.push({ t: "fury", sq: k.sq });
  say(s, `${unitName(k)} rises in fury! He hits harder and comes for you`, "bad");
  castle(s, k);
  summon(s);
  summon(s);
}

/** Once per fight, a hurt king swaps places with the ally farthest from you (castling). */
function castle(s: Fight, k: Unit) {
  if (k.kind !== "k" || !k.target || k.escaped || k.hp > k.max / 2) return;
  const allies = s.units.filter((x) => x !== k).sort((a, b) => dist(s, b.sq, s.hero.sq) - dist(s, a.sq, s.hero.sq) || a.id - b.id);
  if (!allies.length) return;
  k.escaped = true;
  const ally = allies[0];
  [k.sq, ally.sq] = [ally.sq, k.sq];
  s.fx.push({ t: "castle", sq: k.sq });
  say(s, `${unitName(k)} castles away to ${sqName(s, k.sq)}!`, "bad");
}

/** A piece loses its next action (Kuncian, Paku, Sogok, Skak!). Bosses shrug it off but take 4 instead. */
export function lockUnit(s: Fight, u: Unit) {
  if (u.boss) {
    say(s, `${unitName(u)} won't be held down, but it hurts`, "good");
    return damageUnit(s, u, 4);
  }
  u.locked = 1; // no action this turn, even after enemies re-aim
  s.intents = s.intents.filter((i) => i.id !== u.id);
  say(s, `${unitName(u)} can't act this turn`, "good");
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
}

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
/** Crashes are capped so one kick can't wipe a whole row. */
const CRASH_MAX = 5;

/** Push whatever is on `sq` in direction `dir`, up to `n` squares (FLY = until it hits something).
 *  A crash deals 2, +1 for every 2 squares it flew, rounded up (max 5), and knocks what it hit one square on. */
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
      let dmg = Math.min(CRASH_MAX, BUMP + Math.ceil(flew / 2) + crash + s.powers.momentum);
      if (yours(s)) {
        s.tf = { ...freshTurn(), ...s.tf, crashes: (s.tf?.crashes ?? 0) + 1 };
        const amuk = s.powers.amuk ?? 0;
        if (amuk) {
          s.hero.block += 2 * amuk;
          say(s, `Amuk: +${2 * amuk} Block`, "good");
        }
      }
      if (yours(s) && has(s, "keris_api") && !s.tf?.crashed) {
        s.tf = { ...freshTurn(), ...s.tf, crashed: true };
        dmg *= 2;
        say(s, "Keris Berapi: double crash!", "good");
      }
      say(s, `${occName(mover)} crashes into ${occName(other) === "You" ? "you" : occName(other)}${flew > 1 ? ` at speed (${dmg})` : ""}`);
      return collide(s, mover, other, dir, dmg);
    }
    moveOcc(s, mover, next);
    cur = next;
    flew++;
    if (s.mud.includes(next) && !(yours(s) && has(s, "selendang"))) { moved(); say(s, `${occName(mover)} sticks in the mud`); return; }
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
  onKnockout(s, o.u.sq);
  if (yours(s) && has(s, "tasbih") && s.hero.hp < s.hero.max) {
    s.hero.hp++;
    say(s, "Tasbih: +1 HP", "good");
  }
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

/** The first occupied square from `from` in direction `dir` (null if the line is empty to the edge). */
function firstInLine(s: Fight, from: number, dir: number): number | null {
  for (let cur = offset(s, from, DIRS[dir][0], DIRS[dir][1]); cur !== null; cur = offset(s, cur, DIRS[dir][0], DIRS[dir][1])) {
    if (!isEmpty(s, cur)) return cur;
    if (s.mud.includes(cur)) return null;
  }
  return null;
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

/** How much a piece on `sq` would threaten you. */
function threat(s: Fight, u: Unit, sq: number): number {
  const hero = s.hero.sq;
  if (SLIDES[u.kind]) {
    const slam = isHeavy(u) && dist(s, sq, hero) <= SLAM_REACH ? 5 : 0;
    return Math.max(slam, (SLIDES[u.kind] ?? []).includes(dirTo(s, sq, hero)) ? 5 : 0);
  }
  const reach = new Set(strikeSquares(s, { ...u, sq }));
  let t = reach.has(hero) ? 5 : 0;
  for (const n of neighbors(s, hero)) if (reach.has(n) && isEmpty(s, n)) t += 1;
  return t;
}

function placeScore(s: Fight, u: Unit, sq: number) {
  const near = dist(s, sq, s.hero.sq);
  // Pieces like to stand where an ally guards them.
  const guarded = s.units.some((v) => v !== u && coverSquares(s, v).includes(sq)) ? 3 : 0;
  // Bodyguard: when you get close to the leader, pieces close ranks around it.
  const leader = s.units.find((v) => v.target && v !== u);
  let guard = 0;
  if (leader && dist(s, s.hero.sq, leader.sq) <= 2) {
    if (dist(s, sq, leader.sq) === 1) guard += 3;
    // Standing between you and the leader blocks your way in.
    if (dist(s, sq, s.hero.sq) + dist(s, sq, leader.sq) <= dist(s, s.hero.sq, leader.sq) + 1) guard += 2;
  }
  return threat(s, u, sq) * 2 - exposure(s, u, sq) + guarded + guard - near;
}

function chooseIntent(s: Fight, u: Unit, allowSlam = true): Intent | null {
  if (isRaja(u)) return rajaIntent(s, u, allowSlam);
  const hero = s.hero.sq;
  let moves: number[];
  if (SLIDES[u.kind]) {
    // Heavy pieces close to you slam: you can't just step out of it.
    if (allowSlam && isHeavy(u) && dist(s, u.sq, hero) <= SLAM_REACH) return { id: u.id, type: "slam", center: hero };
    // Charge only down a clear line at you. Never into its own ally.
    const d = lineDir(s, u, hero);
    if (d >= 0 && firstInLine(s, u.sq, d) === hero) return { id: u.id, type: "charge", dir: d };
    moves = slideSquares(s, u);
  } else {
    // Strikers: hit you, else move to set up a hit for next turn, else advance.
    // (No more striking empty squares "in case you step there": any square a piece can strike, it
    // already covers, so stepping there gets you struck by its reaction anyway. That strike was wasted.)
    if (strikeSquares(s, u).includes(hero)) return { id: u.id, type: "strike", target: hero };
    if (u.kind === "p") {
      const f = offset(s, u.sq, 0, 1);
      moves = f !== null && isEmpty(s, f) ? [f] : [];
    } else {
      moves = u.kind === "n" ? KNIGHT.map(([dx, dy]) => offset(s, u.sq, dx, dy)).filter((x): x is number => x !== null && isEmpty(s, x)) : [];
    }
    // A square from which it can hit you next turn beats everything else.
    const setsUp = moves.filter((sq) => strikeSquares(s, { ...u, sq }).includes(hero));
    if (setsUp.length) {
      const best = [...setsUp].sort((a, b) => placeScore(s, u, b) - placeScore(s, u, a) || a - b)[0];
      return { id: u.id, type: "move", to: best };
    }
    // Pawns always push forward toward your side (and promotion).
    if (u.kind === "p") return moves.length ? { id: u.id, type: "move", to: moves[0] } : null;
  }
  if (!moves.length) return null;
  // Move somewhere that threatens you, without standing where you can kick it off the board.
  const scored = moves.map((sq) => ({ sq, v: placeScore(s, u, sq) })).sort((a, b) => b.v - a.v || a.sq - b.sq);
  // Stay put only if already close to you, safe, and no square is better. Far away pieces keep coming.
  if (scored[0].v <= placeScore(s, u, u.sq) && exposure(s, u, u.sq) === 0 && dist(s, u.sq, hero) <= 2) return null;
  return { id: u.id, type: "move", to: scored[0].sq };
}

/** The king holds its throne behind its army and strikes if you come close.
 *  (Running away every turn made fights a long chase.) */
function kingIntent(s: Fight, k: Unit, allowSlam = true): Intent | null {
  if (allowSlam && dist(s, k.sq, s.hero.sq) <= SLAM_REACH) return { id: k.id, type: "slam", center: s.hero.sq };
  if (strikeSquares(s, k).includes(s.hero.sq)) return { id: k.id, type: "strike", target: s.hero.sq };
  // You're two squares away: step back into the formation if there's a safer spot (more allies around,
  // further from you, not on the edge). Otherwise hold the throne.
  if (dist(s, k.sq, s.hero.sq) !== 2) return null;
  const allies = (sq: number) => s.units.filter((v) => v !== k && dist(s, v.sq, sq) === 1).length;
  const edge = (sq: number) => (col(s, sq) === 0 || col(s, sq) === s.n - 1 || row(s, sq) === 0 ? 1 : 0);
  const score = (sq: number) => allies(sq) * 2 + dist(s, sq, s.hero.sq) * 2 - edge(sq);
  const best = neighbors(s, k.sq)
    .filter((sq) => isEmpty(s, sq) && dist(s, sq, s.hero.sq) > 2)
    .sort((a, b) => score(b) - score(a) || a - b)[0];
  return best !== undefined && score(best) > score(k.sq) ? { id: k.id, type: "move", to: best } : null;
}

/** Raja Hitam, the final boss. Phase 1: holds his throne like any king. Phase 2: walks straight at you. */
function rajaIntent(s: Fight, k: Unit, allowSlam: boolean): Intent | null {
  if (!k.phase) return kingIntent(s, k, allowSlam);
  const hero = s.hero.sq;
  if (strikeSquares(s, k).includes(hero)) return { id: k.id, type: "strike", target: hero };
  if (allowSlam && dist(s, k.sq, hero) <= SLAM_REACH) return { id: k.id, type: "slam", center: hero };
  const best = neighbors(s, k.sq).filter((sq) => isEmpty(s, sq)).sort((a, b) => dist(s, a, hero) - dist(s, b, hero) || a - b)[0];
  return best !== undefined && dist(s, best, hero) < dist(s, k.sq, hero) ? { id: k.id, type: "move", to: best } : null;
}

/** Work out what every enemy will do, given the board right now. No side effects.
 *  `keep`: intents that stay as they are (committed charges). */
function buildIntents(s: Fight, keep: Intent[] = [], allowSlam = true): Intent[] {
  const out: Intent[] = [...keep];
  const kept = new Set(keep.map((i) => i.id));
  // Closest to you acts first.
  const near = (u: Unit) => dist(s, u.sq, s.hero.sq);
  const byDist = (a: Unit, b: Unit) => near(a) - near(b) || a.id - b.id;
  const ready = s.units.filter((u) => u.locked === 0);
  const king = ready.find((u) => u.kind === "k" && u.target && !u.boss);
  const rest = ready.filter((u) => u !== king).sort(byDist);
  // Closest first. Angry pieces and bosses always act; the rest fill the limit,
  // skipping pieces that are stuck so the slots go to someone who can do something.
  let regular = keep.filter((i) => { const u = s.units.find((x) => x.id === i.id); return u && !u.angry && !u.boss; }).length;
  for (const u of rest) {
    if (kept.has(u.id)) continue;
    const always = u.angry || !!u.boss;
    if (!always && regular >= s.limit) continue;
    const it = chooseIntent(s, u, allowSlam);
    if (!it) continue;
    out.push(it);
    if (!always) regular++;
  }
  if (king && !kept.has(king.id)) {
    const it = kingIntent(s, king, allowSlam);
    if (it) out.push(it);
  }
  return out;
}

/** Enemies lock in what they'll do next turn (at the end of the enemy turn). */
export function plan(s: Fight) {
  for (const u of s.units) if (u.locked > 0) u.locked--;
  s.intents = buildIntents(s);
  for (const u of s.units) u.angry = false;
}

/** After each of your actions, quick attacks (strikes) and moves re-aim at where you are now.
 *  Big attacks are committed once wound up: a charge can't turn (so you can sidestep it into its own
 *  pieces) and a slam lands on the area it was aimed at (so you can get out of it, or Block). */
export function retarget(s: Fight) {
  if (s.status !== "play") return;
  const committed = s.intents.filter((i) => (i.type === "charge" || i.type === "slam") && intentValid(s, i));
  // Slams only wind up when enemies plan (end of their turn), never in the middle of yours.
  s.intents = buildIntents(s, committed, false);
}

/** An attack reaches the hero: Elakan hops away, Tangkisan kicks back. Returns true if it landed. */
/** Plays a readied card's effect (set by cards.ts, which knows the cards). */
let readyHook: ((s: Fight, id: string) => string) | null = null;
export function setReadyHook(fn: (s: Fight, id: string) => string) { readyHook = fn; }

function attackHero(s: Fight, u: Unit, n: number): boolean {
  // Siap: your readied card goes off before the hit lands, then you riposte.
  const parried = s.ready && s.status === "enemy" && readyHook ? s.ready : null;
  if (parried) {
    s.ready = null;
    s.fx.push({ t: "parry", sq: s.hero.sq });
    say(s, `Siap! Your ${readyHook!(s, parried)} goes off as the ${unitName(u)} attacks`, "good");
    s.discard.push(parried);
  }
  if (s.hop !== null && isEmpty(s, s.hop)) {
    // Elakan: one dodge attempt. Roll for it; win or lose, it's used up.
    const hop = s.hop;
    s.hop = null;
    const r = heroRoll(s, "dodge", DC.dodge);
    if (r) {
      s.fx.push({ t: "dodge", sq: s.hero.sq });
      say(s, `You dodge to ${sqName(s, hop)}!`, "good");
      if (r === 2 && s.units.includes(u)) { say(s, `Sempurna: you strike the ${unitName(u)} as you slip past`, "good"); damageUnit(s, u, 2); }
      s.hero.sq = hop;
      return false;
    }
  }
  const soaked = Math.min(s.hero.block, n);
  damageHero(s, n);
  // Pantulan: what your Block soaked goes straight back at the attacker.
  const pantulan = s.powers.pantulan ?? 0;
  if (pantulan && soaked > 0 && s.units.includes(u)) {
    say(s, `Pantulan: the ${unitName(u)} takes ${soaked * pantulan} back`, "good");
    damageUnit(s, u, soaked * pantulan);
  }
  if (s.counter > 0 && s.units.includes(u)) {
    const d = dirTo(s, s.hero.sq, u.sq);
    // Only attackers right next to you can be kicked back, and only if your roll lands.
    const r = d >= 0 && dist(s, s.hero.sq, u.sq) === 1 ? heroRoll(s, "kick-back", DC.counter) : 0;
    if (r === 2) { damageUnit(s, u, 1); if (s.units.includes(u)) push(s, u.sq, d, s.counter * 2); }
    else if (r) push(s, u.sq, d, s.counter);
  }
  // Riposte: after a Siap parry, an attacker next to you is kicked back 1 for 1.
  if (parried && s.units.includes(u) && dist(s, s.hero.sq, u.sq) === 1) {
    const d = dirTo(s, s.hero.sq, u.sq);
    say(s, `Riposte! The ${unitName(u)} is kicked back`, "good");
    damageUnit(s, u, 1);
    if (d >= 0 && s.units.includes(u)) push(s, u.sq, d, 1);
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

/** You moved (step or a move card): Lincah builds up a bonus for your next kick. */
export function heroMoved(s: Fight) {
  const lincah = s.powers.lincah ?? 0;
  if (!lincah) return;
  s.tf = { ...freshTurn(), ...s.tf, rush: (s.tf?.rush ?? 0) + 2 * lincah };
  say(s, `Lincah: your next kick hits +${s.tf.rush}`, "good");
}

/** You just moved: every enemy covering your new square strikes you, once per turn each. */
export function react(s: Fight) {
  if (s.powers.bayangan) return; // Bayangan: you move like a shadow
  if (s.luck?.smoke) return; // Bom Asap: they can't see you
  for (const u of reactors(s, s.hero.sq)) {
    if (s.status === "won" || s.status === "lost") return;
    (s.reacted ??= []).push(u.id);
    say(s, `${unitName(u)} covers ${sqName(s, s.hero.sq)} and jabs as you arrive`, "bad");
    if (!enemyRoll(s, u, DC.react)) { s.fx.push({ t: "miss", sq: s.hero.sq }); continue; }
    s.fx.push({ t: "react", sq: u.sq });
    attackHero(s, u, reactionHit(u));
    if (has(s, "songket") && s.units.includes(u)) {
      say(s, `Songket Merah: the ${unitName(u)} takes 1`, "good");
      damageUnit(s, u, 1);
    }
  }
}

/** The squares a slam covers (it only hurts you, never the slammer's allies). */
export const slamArea = (s: Fight, center: number) => [center, ...neighbors(s, center)];

function slam(s: Fight, u: Unit, center: number) {
  const area = new Set(slamArea(s, center));
  const hit = unitHit(u);
  s.fx.push({ t: "slam", sq: center });
  say(s, `${unitName(u)} slams the ground around ${sqName(s, center)}!`, "enemy");
  // You: Elakan only saves you if it hops you out of the area. Block soaks it.
  if (area.has(s.hero.sq)) {
    const hop = s.hop;
    if (hop !== null && area.has(hop)) s.hop = null;
    attackHero(s, u, hit);
    if (s.hop === null && hop !== null && area.has(hop)) s.hop = hop;
  }
  // Slams only hurt you: the enemy's own pieces in the area are spared.
}

function charge(s: Fight, u: Unit, dir: number) {
  const [dx, dy] = DIRS[dir];
  (s.movedLast ??= []).push(u.id);
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
  if (it.type === "slam") return dist(s, u.sq, it.center) <= SLAM_REACH;
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
    if (isEmpty(s, it.to)) { u.sq = it.to; (s.movedLast ??= []).push(u.id); say(s, `${unitName(u)} moves to ${sqName(s, it.to)}`, "enemy"); promote(s, u); }
    else say(s, `${unitName(u)} is blocked and stays put`, "enemy");
    return;
  }
  if (it.type === "charge") { say(s, `${unitName(u)} charges ${DIR_NAMES[it.dir]}`, "enemy"); return charge(s, u, it.dir); }
  if (it.type === "slam") return slam(s, u, it.center);
  const o = occupant(s, it.target);
  if (!o || (o.t === "thing" && o.th.kind === "batu")) {
    s.fx.push({ t: "miss", sq: it.target });
    say(s, `${unitName(u)} strikes ${sqName(s, it.target)} and misses`, "enemy");
    return;
  }
  say(s, `${unitName(u)} strikes ${o.t === "hero" ? "you" : occName(o)} on ${sqName(s, it.target)}`, "enemy");
  if (o.t === "hero") {
    const landed = attackHero(s, u, unitHit(u));
    // Raja Hitam in fury kicks you back 2 squares: into pieces (crash) or off the edge (5).
    if (landed && isRaja(u) && u.phase && s.status === "enemy") {
      const d = dirTo(s, u.sq, s.hero.sq);
      if (d >= 0) { say(s, `${unitName(u)} kicks you back!`, "bad"); push(s, s.hero.sq, d, 2); }
    }
    return;
  }
  hitOcc(s, o, unitHit(u));
}

/** Pawns that didn't act march one square toward you, and promote on your back row. */
export function march(s: Fight) {
  const acted = new Set(s.intents.map((i) => i.id));
  for (const u of [...s.units].sort((a, b) => b.sq - a.sq)) {
    if (u.kind !== "p" || acted.has(u.id) || u.locked > 0) continue;
    const f = offset(s, u.sq, 0, 1);
    if (f !== null && isEmpty(s, f)) { u.sq = f; (s.movedLast ??= []).push(u.id); say(s, `Pawn marches to ${sqName(s, f)}`, "enemy"); promote(s, u); }
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

export function shuffle(s: Fight, list: string[]) {
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
/** How many cards you draw up to each turn. */
export const handSize = (s: Fight) => HAND + (has(s, "akik") ? 1 : 0) + (s.handBonus ?? 0);

export function startTurn(s: Fight, guarantee?: (id: string) => boolean) {
  s.turn++;
  say(s, `Turn ${s.turn}`, "turn");
  s.hero.block = (has(s, "gelang") ? Math.min(s.hero.block, 5) : 0) + 3 * (s.powers.benteng ?? 0);
  s.tenaga = TENAGA + (s.turn === 1 && has(s, "kendang") ? 1 : 0) + (s.nextTenaga ?? 0);
  s.nextTenaga = 0;
  s.knightStep = false;
  if (s.ready) {
    // Nothing attacked you: the readied card comes back, ready to use again.
    say(s, "Siap: nobody attacked, your readied card returns to your hand", "good");
    s.hand.push(s.ready);
    s.ready = null;
  }
  s.stepUsed = false;
  s.extraSteps = has(s, "sandal") ? 1 : 0;
  s.tf = freshTurn();
  s.hop = null;
  s.counter = 0;
  s.reacted = [];
  s.combo = 0;
  s.luck = freshLuck();
  s.status = "play";
  // Draw up to your hand size (Simpan can leave cards in your hand from last turn).
  drawCards(s, Math.max(0, handSize(s) - s.hand.length));
  // The first hand always has something to hit with.
  if (s.turn === 1 && guarantee && !s.hand.some(guarantee)) {
    const i = s.draw.findIndex(guarantee);
    if (i >= 0) [s.hand[0], s.draw[i]] = [s.draw[i], s.hand[0]];
  }
}

export const clone = (s: Fight): Fight => structuredClone(s);

/** End your turn: discard the hand. Then resolve intents one by one, then `finishEnemy`. */
export function beginEnemy(s: Fight) {
  if (s.keepHand) say(s, `Simpan: you keep ${s.hand.length} ${s.hand.length === 1 ? "card" : "cards"}`, "good");
  else {
    s.discard.push(...s.hand);
    s.hand = [];
  }
  s.keepHand = false;
  s.movedLast = [];
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
  if (s.survive && s.turn >= s.survive) {
    s.status = "won";
    say(s, `You held out for ${s.survive} turns. The enemy retreats!`, "good");
    return;
  }
  march(s);
  const raging = s.units.some((u) => isRaja(u) && u.phase);
  if (s.turn % (raging ? 2 : SUMMON_EVERY) === 0) summon(s);
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
  f.fx = [];
  f.sim = true;
  f.status = "enemy";
  for (const it of [...f.intents]) resolveIntent(f, it);
  return {
    damage: hp - f.hero.hp,
    dies: f.hero.hp <= 0,
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
  if ((s.stepUsed && !(s.extraSteps > 0)) || s.status !== "play") return [];
  const around = s.knightStep
    ? KNIGHT.map(([dx, dy]) => offset(s, s.hero.sq, dx, dy)).filter((x): x is number => x !== null)
    : neighbors(s, s.hero.sq);
  return around.filter((sq) => isEmpty(s, sq));
}

export function step(s: Fight, sq: number) {
  const f = clone(s);
  f.fx = [];
  doStep(f, sq);
  return f;
}

/** Take your free step (changes `f`). */
export function doStep(f: Fight, sq: number) {
  f.hero.sq = sq;
  if (f.extraSteps > 0) f.extraSteps--;
  else f.stepUsed = true;
  say(f, `You step to ${sqName(f, sq)}`, "you");
  heroMoved(f);
  react(f);
  retarget(f);
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
  name?: string;
  survive?: number;
  relics?: string[];
  scene?: Scene;
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
    extraSteps: 0,
    relics: o.relics ?? [],
    tf: freshTurn(),
    hop: null,
    counter: 0,
    powers: { harimau: (o.relics ?? []).includes("keris") ? 1 : 0, momentum: 0 },
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
    things: (o.things ?? []).map((t) => ({ id: id++, ...t })),
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
    kos: 0,
    log: [],
    reacted: [],
    name: o.name,
    survive: o.survive,
    dice: (o.seed * 2654435761) >>> 0,
    scene: o.scene,
    luck: freshLuck(),
    movedLast: [],
  };
  s.draw = shuffle(s, [...o.deck]);
  say(s, "Blue shield = guarded by an ally: kicks only budge it 1 square. Break the guard first.");
  plan(s);
  startTurn(s, guarantee);
  return s;
}
