// Raja Silat cards: what each one targets and what it does.
import {
  DIRS, FLY, KNIGHT, checkEnd, clone, has, react, retarget, say, sqName, damageUnit, dirTo, explode, hitOcc, isEmpty, isOrth, neighbors, occupant, offset, push, ringOut,
  unitAt, unitName, type Fight,
} from "./rules";

export type CardType = "Serang" | "Gerak" | "Tangkis" | "Jurus";
export type Mark = "hit" | "push" | "go" | "guard";

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  text: string;
  rare?: boolean;
  /** Plays on your own king (no target to pick). */
  self?: boolean;
  /** Gone for the rest of the fight once played. */
  exhaust?: boolean;
  /** The little 5×5 picture: index 12 is you. */
  pattern: Partial<Record<number, Mark>>;
  targets: (s: Fight) => number[];
  play: (s: Fight, sq: number) => void;
}

// ---------- Helpers ----------

const hero = (s: Fight) => s.hero.sq;
/** Adjacent squares with an enemy or an object on them. */
const adjacentThings = (s: Fight) => neighbors(s, hero(s)).filter((sq) => { const o = occupant(s, sq); return !!o && o.t !== "hero"; });
const adjacentUnits = (s: Fight) => neighbors(s, hero(s)).filter((sq) => !!unitAt(s, sq));
const self = (s: Fight) => [hero(s)];

/** Hit what's on `sq` (next to you) and push it away from you. `n` = FLY sends it flying. */
function kick(s: Fight, sq: number, dmg: number, n: number, crash = 0) {
  const d = dirTo(s, hero(s), sq);
  const o = occupant(s, sq);
  if (!o || o.t === "hero" || d < 0) return;
  if (o.t === "thing") {
    if (o.th.kind === "petasan") explode(s, o.th);
    else push(s, sq, d, n, crash);
    return;
  }
  damageUnit(s, o.u, dmg + s.powers.harimau);
  if (s.units.includes(o.u)) push(s, o.u.sq, d, n, crash);
}

/** Empty squares you can slide to along these directions, up to `max` squares. */
function slides(s: Fight, dirs: number[], max: number) {
  const out: number[] = [];
  for (const d of dirs) {
    let cur = hero(s);
    for (let i = 0; i < max; i++) {
      const next = offset(s, cur, DIRS[d][0], DIRS[d][1]);
      if (next === null || !isEmpty(s, next)) break;
      out.push(next);
      cur = next;
    }
  }
  return out;
}

const P = {
  kick: { 7: "hit", 2: "push" } as const,
  guard: { 6: "guard", 7: "guard", 8: "guard", 11: "guard", 13: "guard", 16: "guard", 17: "guard", 18: "guard" } as const,
};

// ---------- The cards ----------

const list: CardDef[] = [
  {
    id: "tendang", name: "Tendang", cost: 1, type: "Serang", text: "Hit 1, send it flying",
    pattern: P.kick, targets: adjacentThings, play: (s, sq) => kick(s, sq, 1, FLY),
  },
  {
    id: "lurus", name: "Tendangan Lurus", cost: 1, type: "Serang", text: "Hit 1, flies, crash +3",
    pattern: { 7: "hit", 2: "push" }, targets: adjacentThings, play: (s, sq) => kick(s, sq, 1, FLY, 3),
  },
  {
    id: "dalam", name: "Pukulan Dalam", cost: 1, type: "Serang", text: "Hit 4. No push",
    pattern: { 7: "hit" }, targets: adjacentUnits, play: (s, sq) => { const u = unitAt(s, sq); if (u) damageUnit(s, u, 4 + s.powers.harimau); },
  },
  {
    id: "sabit", name: "Tendangan Sabit", cost: 1, type: "Serang", text: "Arc of 3: hit 1, push 1",
    pattern: { 6: "hit", 7: "hit", 8: "hit", 1: "push", 2: "push", 3: "push" },
    targets: (s) => neighbors(s, hero(s)),
    play: (s, sq) => {
      const d = dirTo(s, hero(s), sq);
      const squares = [d + 7, d, d + 1].map((x) => offset(s, hero(s), DIRS[x % 8][0], DIRS[x % 8][1]));
      for (const t of squares) if (t !== null) kick(s, t, 1, 1);
    },
  },
  {
    id: "bantingan", name: "Bantingan", cost: 1, type: "Serang", text: "Throw it behind you, flying",
    pattern: { 7: "hit", 17: "push", 22: "push" }, targets: adjacentUnits,
    play: (s, sq) => {
      const u = unitAt(s, sq);
      const d = dirTo(s, hero(s), sq);
      if (!u || d < 0) return;
      const back = (d + 4) % 8;
      const land = offset(s, hero(s), DIRS[back][0], DIRS[back][1]);
      damageUnit(s, u, 1 + s.powers.harimau);
      if (!s.units.includes(u)) return;
      if (land === null) return ringOut(s, { t: "unit", u }, back);
      const other = occupant(s, land);
      if (other) {
        // Slammed straight into whatever is behind you.
        damageUnit(s, u, 2);
        hitOcc(s, other, 2);
        return;
      }
      u.sq = land;
      say(s, `You throw the ${unitName(u)} over your shoulder`, "you");
      push(s, land, back, FLY);
    },
  },
  {
    id: "tarik", name: "Tarik", cost: 1, type: "Serang", text: "Pull a piece next to you, hit 1",
    pattern: { 2: "hit", 7: "go" },
    targets: (s) => {
      const out: number[] = [];
      for (const [dx, dy] of DIRS) {
        let cur = hero(s);
        for (let i = 1; i <= 3; i++) {
          const next = offset(s, cur, dx, dy);
          if (next === null) break;
          if (!isEmpty(s, next)) { if (i >= 2) out.push(next); break; }
          cur = next;
        }
      }
      return out;
    },
    play: (s, sq) => {
      const d = dirTo(s, hero(s), sq);
      const dest = offset(s, hero(s), DIRS[d][0], DIRS[d][1]);
      const o = occupant(s, sq);
      if (dest === null || !o || o.t === "hero") return;
      if (o.t === "unit") { o.u.sq = dest; damageUnit(s, o.u, 1); }
      else o.th.sq = dest;
    },
  },
  {
    id: "tolak", name: "Tolak Angin", cost: 2, type: "Serang", text: "Send everything around you flying",
    pattern: { 6: "push", 7: "push", 8: "push", 11: "push", 13: "push", 16: "push", 17: "push", 18: "push" },
    self: true, targets: self,
    play: (s) => {
      for (const sq of adjacentThings(s)) {
        const d = dirTo(s, hero(s), sq);
        const o = occupant(s, sq);
        if (o?.t === "thing" && o.th.kind === "petasan") explode(s, o.th);
        else push(s, sq, d, FLY);
      }
    },
  },
  {
    id: "badai", name: "Badai", cost: 2, type: "Serang", rare: true, text: "Hit 4, flies, crash +3",
    pattern: { 7: "hit", 2: "push", 1: "hit", 3: "hit" }, targets: adjacentUnits,
    play: (s, sq) => kick(s, sq, 4, FLY, 3),
  },
  {
    id: "kuda", name: "Langkah Kuda", cost: 1, type: "Gerak", text: "Jump like a knight",
    pattern: { 1: "go", 3: "go", 5: "go", 9: "go", 15: "go", 19: "go", 21: "go", 23: "go" },
    targets: (s) => KNIGHT.map(([dx, dy]) => offset(s, hero(s), dx, dy)).filter((x): x is number => x !== null && isEmpty(s, x)),
    play: (s, sq) => { s.hero.sq = sq; },
  },
  {
    id: "gajah", name: "Gajah Miring", cost: 1, type: "Gerak", text: "Dash diagonally up to 3",
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go", 0: "go", 4: "go", 20: "go", 24: "go" },
    targets: (s) => slides(s, [1, 3, 5, 7], 3),
    play: (s, sq) => { s.hero.sq = sq; },
  },
  {
    id: "benteng", name: "Sapu Benteng", cost: 2, type: "Gerak", text: "Dash, kick what you hit flying",
    pattern: { 2: "go", 7: "go", 10: "go", 11: "go", 13: "go", 14: "go", 17: "go", 22: "go" },
    targets: (s) => [0, 2, 4, 6].map((d) => offset(s, hero(s), DIRS[d][0], DIRS[d][1])).filter((x): x is number => x !== null),
    play: (s, sq) => {
      const d = dirTo(s, hero(s), sq);
      if (d < 0 || !isOrth(d)) return;
      for (;;) {
        const next = offset(s, hero(s), DIRS[d][0], DIRS[d][1]);
        if (next === null) return;
        if (!isEmpty(s, next)) return kick(s, next, 2, FLY);
        s.hero.sq = next;
      }
    },
  },
  {
    id: "tangkis", name: "Tangkis", cost: 1, type: "Tangkis", text: "Block 4",
    pattern: P.guard, self: true, targets: self, play: (s) => { s.hero.block += 4; },
  },
  {
    id: "kudakuda", name: "Kuda-kuda", cost: 2, type: "Tangkis", text: "Block 8",
    pattern: P.guard, self: true, targets: self, play: (s) => { s.hero.block += 8; },
  },
  {
    id: "tangkisan", name: "Tangkisan", cost: 1, type: "Tangkis", text: "Block 3, kick back",
    pattern: { ...P.guard, 2: "push" }, self: true, targets: self,
    play: (s) => { s.hero.block += 3; s.counter = Math.max(s.counter, 1); },
  },
  {
    id: "elakan", name: "Elakan", cost: 1, type: "Tangkis", text: "Dodge the first hit",
    pattern: { 11: "go", 13: "go" },
    targets: (s) => neighbors(s, hero(s)).filter((sq) => isEmpty(s, sq)),
    play: (s, sq) => { s.hop = sq; },
  },
  {
    id: "kuncian", name: "Kuncian", cost: 1, type: "Tangkis", text: "Cancel a neighbor's attack",
    pattern: { 7: "guard" },
    targets: (s) => adjacentUnits(s).filter((sq) => { const u = unitAt(s, sq)!; return u.boss || s.intents.some((i) => i.id === u.id); }),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      if (!u) return;
      if (u.boss) return damageUnit(s, u, 4); // bosses shrug it off, but it hurts
      u.locked = 1; // no action this turn, even after enemies re-aim
      s.intents = s.intents.filter((i) => i.id !== u.id);
    },
  },
  {
    id: "harimau", name: "Gaya Harimau", cost: 1, type: "Jurus", text: "Your kicks hit +1",
    pattern: { 6: "hit", 8: "hit", 16: "hit", 18: "hit" }, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.harimau++; },
  },
  {
    id: "momentum", name: "Momentum", cost: 2, type: "Jurus", rare: true, text: "Crashes deal +2",
    pattern: { 7: "push", 2: "push", 17: "push", 22: "push" }, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.momentum += 2; },
  },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(list.map((c) => [c.id, c]));
export const ALL_CARDS = list;

export const STARTER = ["tendang", "tendang", "tendang", "dalam", "tangkis", "tangkis", "tangkis", "kuda", "tarik", "bantingan"];
/** Cards you can win after a fight. */
export const POOL = list.map((c) => c.id).filter((id) => !STARTER.includes(id));

export const isAttack = (id: string) => CARDS[id]?.type === "Serang";

export function canPlay(s: Fight, id: string) {
  const c = CARDS[id];
  return !!c && s.status === "play" && c.cost <= s.tenaga && c.targets(s).length > 0;
}

/** Play the card at `idx` in your hand on square `sq`. Returns a new fight. */
export function playCard(s: Fight, idx: number, sq: number): Fight {
  const f = clone(s);
  const id = f.hand[idx];
  const c = CARDS[id];
  if (!c || !canPlay(f, id) || !c.targets(f).includes(sq)) return s;
  f.fx = [];
  f.combo = 0;
  f.tenaga -= c.cost;
  f.hand.splice(idx, 1);
  (c.exhaust ? f.exhausted : f.discard).push(id);
  say(f, c.self ? `You play ${c.name}` : `You play ${c.name} on ${sqName(f, sq)}`, "you");
  const from = f.hero.sq;
  c.play(f, sq);
  // Moved into an enemy's reach (Peci Hitam: Langkah Kuda slips past reactions).
  if (f.hero.sq !== from && f.status === "play" && !(id === "kuda" && has(f, "peci"))) react(f);
  f.bestCombo = Math.max(f.bestCombo, f.combo);
  if (f.combo >= 3) say(f, `Combo ×${f.combo}!`, "good");
  checkEnd(f);
  retarget(f); // enemies react to what you just did
  return f;
}
