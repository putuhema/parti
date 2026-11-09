// Raja Silat cards: what each one targets and what it does.
import {
  DIRS, FLY, KNIGHT, checkEnd, clone, dist, setReadyHook, doStep, shuffle, drawCards, freeSteps, has, heroMoved, lockUnit, react, retarget, say, sqName, damageUnit, dirTo, explode, hitOcc, isEmpty, isOrth, neighbors, occupant, offset, push, ringOut,
  unitAt, unitName, type Fight,
} from "./rules";
import { announce, rangkaiFor } from "./rangkai";

/** Siasat = tactics: cards that bend the rules (your deck, your hand, the dice). */
export type CardType = "Serang" | "Gerak" | "Tangkis" | "Jurus" | "Siasat";
/** Playstyles. Cards without one are neutral. */
export type Style = "harimau" | "bangau" | "ular";
export const STYLES: Record<Style, { name: string; animal: string; text: string; color: string; edge: string }> = {
  harimau: { name: "Harimau", animal: "Tiger", text: "Crash and chain. Big chain reactions that feed each other.", color: "#FF9600", edge: "#C46A00" },
  bangau: { name: "Bangau", animal: "Crane", text: "Defend and punish. Your Block becomes your weapon.", color: "#58CC02", edge: "#3A8700" },
  ular: { name: "Ular", animal: "Snake", text: "Move and strike. Reposition, then hit hard.", color: "#CE82FF", edge: "#8A4FB5" },
};
export type Mark = "hit" | "push" | "go" | "guard";

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  type: CardType;
  text: string;
  rare?: boolean;
  style?: Style;
  /** Cost that changes during a fight (otherwise `cost`). */
  costFor?: (s: Fight) => number;
  /** Plays on your own king (no target to pick). */
  self?: boolean;
  /** Gone for the rest of the fight once played. */
  exhaust?: boolean;
  /** Move cards: enemy squares this move could land on by capturing (needs an attack that knocks it out). */
  reach?: (s: Fight) => number[];
  /** Attack cards: the damage it deals to one piece, used when it's paired with a move to capture. */
  strike?: (s: Fight) => number;
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
  s.fx.push({ t: "lunge", sq: hero(s), dir: d });
  if (o.t === "thing") {
    if (o.th.kind === "petasan") explode(s, o.th);
    else push(s, sq, d, n, crash);
    return;
  }
  // Lincah: moving earlier this turn powers up this kick.
  const rush = s.tf?.rush ?? 0;
  if (rush) s.tf = { ...s.tf, rush: 0 };
  damageUnit(s, o.u, dmg + s.powers.harimau + rush);
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

/** Squares in a clear line from you (straight and diagonal): the first occupied one in each direction. */
function firstInLines(s: Fight, dirs = [0, 1, 2, 3, 4, 5, 6, 7]) {
  const out: { sq: number; dir: number }[] = [];
  for (const d of dirs) {
    for (let cur = offset(s, hero(s), DIRS[d][0], DIRS[d][1]); cur !== null; cur = offset(s, cur, DIRS[d][0], DIRS[d][1])) {
      if (!isEmpty(s, cur)) { out.push({ sq: cur, dir: d }); break; }
    }
  }
  return out;
}
/** The next occupied square after `sq` going in `dir`. */
function behind(s: Fight, sq: number, dir: number): number | null {
  for (let cur = offset(s, sq, DIRS[dir][0], DIRS[dir][1]); cur !== null; cur = offset(s, cur, DIRS[dir][0], DIRS[dir][1])) {
    if (!isEmpty(s, cur)) return cur;
  }
  return null;
}
/** Pieces next to you with nowhere to go (every square around them is taken or off the board). */
const zugzwanged = (s: Fight) =>
  adjacentUnits(s).map((sq) => unitAt(s, sq)!).filter((u) => neighbors(s, u.sq).every((x) => !isEmpty(s, x)) || neighbors(s, u.sq).length === 0);
const lineUnits = (s: Fight) => firstInLines(s).filter((x) => !!unitAt(s, x.sq)).map((x) => x.sq);

/** Naik Pangkat turns these cards into stronger ones for the rest of the fight. */
export const PROMOTE: Record<string, string> = {
  tendang: "badai", kuda: "ratu", pion: "ratu", tangkis: "kudakuda", tarik: "lilit", sabit: "tolak", dalam: "kerambit",
};

const P = {
  kick: { 7: "hit", 2: "push" } as const,
  guard: { 6: "guard", 7: "guard", 8: "guard", 11: "guard", 13: "guard", 16: "guard", 17: "guard", 18: "guard" } as const,
};

// ---------- The cards ----------

const list: CardDef[] = [
  {
    id: "tendang", strike: () => 1, name: "Tendang", cost: 1, type: "Serang", text: "Hit 1, send it flying",
    pattern: P.kick, targets: adjacentThings, play: (s, sq) => kick(s, sq, 1, FLY),
  },
  {
    id: "lurus", strike: () => 1, style: "harimau", name: "Tendangan Lurus", cost: 1, type: "Serang", text: "Hit 1, flies, crash +2",
    pattern: { 7: "hit", 2: "push" }, targets: adjacentThings, play: (s, sq) => kick(s, sq, 1, FLY, 2),
  },
  {
    id: "dalam", strike: () => 4, name: "Pukulan Dalam", cost: 1, type: "Serang", text: "Hit 4. No push",
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
    id: "bantingan", strike: () => 1, name: "Bantingan", cost: 1, type: "Serang", text: "Throw it behind you, flying",
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
    id: "tarik", strike: () => 1, name: "Tarik", cost: 1, type: "Serang", text: "Pull a piece next to you, hit 1",
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
    id: "tolak", style: "harimau", name: "Tolak Angin", cost: 2, type: "Serang", text: "Send everything around you flying",
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
    id: "badai", strike: () => 3, style: "harimau", name: "Badai", cost: 2, type: "Serang", rare: true, text: "Hit 3, flies, crash +2",
    pattern: { 7: "hit", 2: "push", 1: "hit", 3: "hit" }, targets: adjacentUnits,
    play: (s, sq) => kick(s, sq, 3, FLY, 2),
  },
  {
    id: "kuda", reach: (s) => KNIGHT.map(([dx, dy]) => offset(s, hero(s), dx, dy)).filter((x): x is number => x !== null && !!unitAt(s, x)), name: "Langkah Kuda", cost: 1, type: "Gerak", text: "Jump like a knight",
    pattern: { 1: "go", 3: "go", 5: "go", 9: "go", 15: "go", 19: "go", 21: "go", 23: "go" },
    targets: (s) => KNIGHT.map(([dx, dy]) => offset(s, hero(s), dx, dy)).filter((x): x is number => x !== null && isEmpty(s, x)),
    play: (s, sq) => { s.hero.sq = sq; },
  },
  {
    id: "gajah", reach: (s) => firstInLines(s, [1, 3, 5, 7]).filter((x) => !!unitAt(s, x.sq) && dist(s, hero(s), x.sq) <= 3).map((x) => x.sq), style: "ular", name: "Gajah Miring", cost: 1, type: "Gerak", text: "Dash diagonally up to 3",
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go", 0: "go", 4: "go", 20: "go", 24: "go" },
    targets: (s) => slides(s, [1, 3, 5, 7], 3),
    play: (s, sq) => { s.hero.sq = sq; },
  },
  {
    id: "benteng", style: "ular", name: "Sapu Benteng", cost: 2, type: "Gerak", text: "Dash, kick what you hit flying",
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
    id: "kudakuda", style: "bangau", name: "Kuda-kuda", cost: 2, type: "Tangkis", text: "Block 8",
    pattern: P.guard, self: true, targets: self, play: (s) => { s.hero.block += 8; },
  },
  {
    id: "tangkisan", style: "bangau", name: "Tangkisan", cost: 1, type: "Tangkis", text: "Block 3. Attackers next to you: d20 8+ kicks them back",
    pattern: { ...P.guard, 2: "push" }, self: true, targets: self,
    play: (s) => { s.hero.block += 3; s.counter = Math.max(s.counter, 1); },
  },
  {
    id: "elakan", style: "ular", name: "Elakan", cost: 1, type: "Tangkis", text: "Dodge the first hit (d20 8+)",
    pattern: { 11: "go", 13: "go" },
    targets: (s) => neighbors(s, hero(s)).filter((sq) => isEmpty(s, sq)),
    play: (s, sq) => { s.hop = sq; },
  },
  {
    id: "kuncian", style: "bangau", name: "Kuncian", cost: 1, type: "Tangkis", text: "Cancel a neighbor's attack",
    pattern: { 7: "guard" },
    targets: (s) => adjacentUnits(s).filter((sq) => { const u = unitAt(s, sq)!; return u.boss || s.intents.some((i) => i.id === u.id); }),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      if (!u) return;
      lockUnit(s, u);
    },
  },
  {
    id: "harimau", style: "harimau", name: "Gaya Harimau", cost: 1, type: "Jurus", text: "Your kicks hit +1",
    pattern: { 6: "hit", 8: "hit", 16: "hit", 18: "hit" }, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.harimau++; },
  },
  {
    id: "momentum", style: "harimau", name: "Momentum", cost: 2, type: "Jurus", rare: true, text: "Crashes deal +2",
    pattern: { 7: "push", 2: "push", 17: "push", 22: "push" }, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.momentum += 2; },
  },
  // ---------- Harimau (tiger): crash and chain ----------
  {
    id: "terkam", strike: () => 1, style: "harimau", name: "Terkam", cost: 1, type: "Serang", text: "Hit 1, flies. If it crashes, draw 1",
    pattern: { 7: "hit", 2: "push" }, targets: adjacentThings,
    play: (s, sq) => {
      const before = s.tf?.crashes ?? 0;
      kick(s, sq, 1, FLY);
      if ((s.tf?.crashes ?? 0) > before) { drawCards(s, 1); say(s, "Terkam: draw 1", "good"); }
    },
  },
  {
    id: "rantai", strike: () => 1, style: "harimau", name: "Rantai", cost: 1, type: "Serang", text: "Hit 1, flies. Free after a crash this turn",
    pattern: { 7: "hit", 2: "push", 1: "push" }, targets: adjacentThings,
    costFor: (s) => ((s.tf?.crashes ?? 0) > 0 ? 0 : 1),
    play: (s, sq) => kick(s, sq, 1, FLY),
  },
  {
    id: "amuk", style: "harimau", name: "Amuk", cost: 1, type: "Jurus", text: "This fight: each crash you cause gives 2 Block",
    pattern: { 6: "hit", 8: "hit", 16: "guard", 18: "guard" }, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.amuk = (s.powers.amuk ?? 0) + 1; },
  },
  // ---------- Bangau (crane): defend and punish ----------
  {
    id: "balas", strike: (s) => s.hero.block + 2, style: "bangau", name: "Balas", cost: 0, type: "Serang", text: "Hit a neighbor for your Block +2",
    pattern: { 7: "hit", 12: "guard" }, targets: adjacentUnits,
    play: (s, sq) => { const u = unitAt(s, sq); if (u) damageUnit(s, u, s.hero.block + 2 + s.powers.harimau); },
  },
  {
    id: "napas", style: "bangau", name: "Napas Panjang", cost: 1, type: "Tangkis", text: "Block 4, draw 1",
    pattern: P.guard, self: true, targets: self,
    play: (s) => { s.hero.block += 4; drawCards(s, 1); },
  },
  {
    id: "bentengdiri", style: "bangau", name: "Benteng Diri", cost: 1, type: "Jurus", text: "This fight: start each turn with 3 Block",
    pattern: P.guard, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.benteng = (s.powers.benteng ?? 0) + 1; },
  },
  {
    id: "pantulan", style: "bangau", name: "Pantulan", cost: 2, type: "Jurus", rare: true, text: "This fight: Block you soak hits back",
    pattern: { ...P.guard, 2: "hit" }, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.pantulan = (s.powers.pantulan ?? 0) + 1; },
  },
  // ---------- Ular (snake): move and strike ----------
  {
    id: "liuk", reach: adjacentUnits, style: "ular", name: "Liuk", cost: 0, type: "Gerak", text: "Step 1 square, draw 1",
    pattern: { 11: "go", 13: "go", 7: "go", 17: "go" },
    targets: (s) => neighbors(s, hero(s)).filter((sq) => isEmpty(s, sq)),
    play: (s, sq) => { s.hero.sq = sq; drawCards(s, 1); },
  },
  {
    id: "lilit", style: "ular", name: "Lilit", cost: 2, type: "Serang", text: "Pull a piece next to you and lock it",
    pattern: { 2: "hit", 7: "guard" },
    targets: (s) => CARDS.tarik.targets(s).filter((sq) => !!unitAt(s, sq)),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      const d = dirTo(s, hero(s), sq);
      const dest = offset(s, hero(s), DIRS[d][0], DIRS[d][1]);
      if (!u || dest === null) return;
      u.sq = dest;
      say(s, `You wrap up the ${unitName(u)}`, "you");
      lockUnit(s, u);
    },
  },
  {
    id: "sabetan", style: "ular", name: "Sabetan", cost: 1, type: "Serang", text: "Hit every piece around you for 1",
    pattern: { 6: "hit", 7: "hit", 8: "hit", 11: "hit", 13: "hit", 16: "hit", 17: "hit", 18: "hit" }, self: true,
    targets: (s) => (adjacentUnits(s).length ? self(s) : []),
    play: (s) => { for (const sq of adjacentUnits(s)) { const u = unitAt(s, sq); if (u) damageUnit(s, u, 1 + s.powers.harimau); } },
  },
  {
    id: "lincah", style: "ular", name: "Lincah", cost: 1, type: "Jurus", text: "This fight: each move makes your next kick +2",
    pattern: { 11: "go", 13: "go", 7: "hit" }, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.lincah = (s.powers.lincah ?? 0) + 1; },
  },
  {
    id: "bayangan", style: "ular", name: "Bayangan", cost: 2, type: "Jurus", rare: true, text: "This fight: moving never sets off reactions",
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go" }, self: true, exhaust: true, targets: self,
    play: (s) => { s.powers.bayangan = (s.powers.bayangan ?? 0) + 1; },
  },
  // ---------- Chess pieces you move like ----------
  {
    id: "pion", name: "Langkah Pion", cost: 0, type: "Gerak", text: "Step up 1, or hit diagonally up for 2. Top row: promote",
    pattern: { 7: "go", 6: "hit", 8: "hit" },
    targets: (s) => {
      const up = offset(s, hero(s), 0, -1);
      const diag = [offset(s, hero(s), -1, -1), offset(s, hero(s), 1, -1)].filter((x): x is number => x !== null && !!unitAt(s, x));
      return [...(up !== null && isEmpty(s, up) ? [up] : []), ...diag];
    },
    play: (s, sq) => {
      const u = unitAt(s, sq);
      if (u) { damageUnit(s, u, 2 + s.powers.harimau); return; }
      s.hero.sq = sq;
      if (Math.floor(sq / s.n) === 0) {
        // The card that was just played (now on top of the discard pile) becomes a queen's move.
        const i = s.discard.lastIndexOf("pion");
        if (i >= 0) s.discard[i] = "ratu";
        s.fx.push({ t: "promote", sq });
        say(s, "Your pawn reaches the top: Langkah Pion becomes Langkah Ratu for this fight!", "good");
      }
    },
  },
  {
    id: "ratu", reach: lineUnits, name: "Langkah Ratu", cost: 2, type: "Gerak", rare: true, text: "Move like a queen, any distance",
    pattern: { 0: "go", 2: "go", 4: "go", 6: "go", 7: "go", 8: "go", 10: "go", 11: "go", 13: "go", 14: "go", 16: "go", 17: "go", 18: "go", 20: "go", 22: "go", 24: "go" },
    targets: (s) => slides(s, [0, 1, 2, 3, 4, 5, 6, 7], 99),
    play: (s, sq) => { s.hero.sq = sq; },
  },
  {
    id: "rokade", name: "Rokade", cost: 1, type: "Gerak", text: "Swap places with a piece or object in a straight line",
    pattern: { 2: "go", 10: "go", 14: "go", 22: "go" },
    targets: (s) => firstInLines(s, [0, 2, 4, 6]).map((x) => x.sq),
    play: (s, sq) => {
      const o = occupant(s, sq);
      if (!o || o.t === "hero") return;
      const from = hero(s);
      s.hero.sq = sq;
      if (o.t === "unit") o.u.sq = from;
      else o.th.sq = from;
      s.fx.push({ t: "castle", sq });
      say(s, `Rokade: you swap places with the ${o.t === "unit" ? unitName(o.u) : "object"}`, "you");
    },
  },
  // ---------- Chess tactics ----------
  {
    id: "garpu", name: "Garpu Kuda", cost: 2, type: "Serang", text: "Jump like a knight, then hit 2 on every piece a knight's jump away",
    pattern: { 1: "go", 3: "go", 5: "hit", 9: "hit", 15: "hit", 19: "hit", 21: "go", 23: "go" },
    targets: (s) => CARDS.kuda.targets(s),
    play: (s, sq) => {
      s.hero.sq = sq;
      const forked = KNIGHT.map(([dx, dy]) => offset(s, sq, dx, dy)).map((x) => (x === null ? undefined : unitAt(s, x))).filter((u): u is NonNullable<typeof u> => !!u);
      if (forked.length >= 2) say(s, `Fork! ${forked.length} pieces at once`, "good");
      for (const u of forked) damageUnit(s, u, 2 + s.powers.harimau);
    },
  },
  {
    id: "paku", name: "Paku", cost: 1, type: "Tangkis", text: "Pin the first piece in a line: it can't act. Hit 2 if a piece is behind it",
    pattern: { 2: "guard", 7: "guard" },
    targets: lineUnits,
    play: (s, sq) => {
      const u = unitAt(s, sq);
      const d = dirTo(s, hero(s), sq);
      if (!u || d < 0) return;
      const back = behind(s, sq, d);
      say(s, `You pin the ${unitName(u)}`, "you");
      if (back !== null && unitAt(s, back)) { say(s, "It's pinned to the piece behind it!", "good"); damageUnit(s, u, 2); }
      if (s.units.includes(u)) lockUnit(s, u);
    },
  },
  {
    id: "tusuk", name: "Tusuk Sate", cost: 2, type: "Serang", text: "Skewer: hit 3 on the first piece in a line and 2 on the one behind it",
    pattern: { 7: "hit", 2: "hit" },
    targets: lineUnits,
    play: (s, sq) => {
      const d = dirTo(s, hero(s), sq);
      const first = unitAt(s, sq);
      if (!first || d < 0) return;
      const back = behind(s, sq, d);
      const second = back !== null ? unitAt(s, back) : undefined;
      damageUnit(s, first, 3 + s.powers.harimau);
      if (second) damageUnit(s, second, 2 + s.powers.harimau);
    },
  },
  {
    id: "terbuka", name: "Serangan Terbuka", cost: 1, type: "Gerak", text: "Step 1. Every piece in a clear line from where you stood takes 1",
    pattern: { 11: "go", 13: "go", 2: "hit", 22: "hit" },
    targets: (s) => neighbors(s, hero(s)).filter((sq) => isEmpty(s, sq)),
    play: (s, sq) => {
      const from = hero(s);
      s.hero.sq = sq;
      // Discovered attack: the lines through your old square open up.
      const hits: number[] = [];
      for (let d = 0; d < 8; d++) {
        const t = behind(s, from, d);
        if (t !== null && unitAt(s, t)) hits.push(t);
      }
      if (hits.length) say(s, `Discovered attack on ${hits.length} ${hits.length === 1 ? "piece" : "pieces"}!`, "good");
      for (const t of hits) { const u = unitAt(s, t); if (u) damageUnit(s, u, 1); }
    },
  },
  {
    id: "passant", name: "En Passant", cost: 0, type: "Serang", text: "Hit 3 on a neighbor that moved last enemy turn",
    pattern: { 11: "hit", 13: "hit" },
    targets: (s) => adjacentUnits(s).filter((sq) => (s.movedLast ?? []).includes(unitAt(s, sq)!.id)),
    play: (s, sq) => { const u = unitAt(s, sq); if (u) damageUnit(s, u, 3 + s.powers.harimau); },
  },
  {
    id: "skak", name: "Skak!", cost: 2, type: "Serang", text: "The King in a clear line: hit 3 and it loses its action",
    pattern: { 2: "hit", 7: "go" },
    targets: (s) => firstInLines(s).filter((x) => unitAt(s, x.sq)?.target).map((x) => x.sq),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      if (!u) return;
      s.fx.push({ t: "castle", sq });
      say(s, "Skak!", "good");
      damageUnit(s, u, 3);
      if (s.units.includes(u)) lockUnit(s, u);
    },
  },
  // ---------- Street fighting ----------
  {
    id: "kerambit", strike: () => 3, name: "Kerambit", cost: 0, type: "Serang", exhaust: true, text: "Hit a neighbor for 3. Once per fight",
    pattern: { 7: "hit" }, targets: adjacentUnits,
    play: (s, sq) => { const u = unitAt(s, sq); if (u) damageUnit(s, u, 3 + s.powers.harimau); },
  },
  {
    id: "cambuk", strike: () => 2, name: "Cambuk", cost: 1, type: "Serang", text: "Lash the first piece in a straight line: hit 2, pull it next to you",
    pattern: { 2: "hit", 7: "go" },
    targets: (s) => firstInLines(s, [0, 2, 4, 6]).filter((x) => !!unitAt(s, x.sq)).map((x) => x.sq),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      const d = dirTo(s, hero(s), sq);
      if (!u || d < 0) return;
      const dest = offset(s, hero(s), DIRS[d][0], DIRS[d][1]);
      if (dest !== null && dest !== sq) u.sq = dest;
      damageUnit(s, u, 2 + s.powers.harimau);
    },
  },
  {
    id: "sogok", name: "Sogok", cost: 1, type: "Siasat", exhaust: true, text: "Bribe any piece: it skips its next action. Once per fight",
    pattern: { 7: "guard", 2: "guard" },
    targets: (s) => s.units.map((u) => u.sq),
    play: (s, sq) => { const u = unitAt(s, sq); if (u) { say(s, `You slip the ${unitName(u)} a few coins`, "you"); lockUnit(s, u); } },
  },
  {
    id: "asap", name: "Bom Asap", cost: 1, type: "Siasat", text: "Smoke: enemies can't react to your moves this turn. Block 2",
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go", 12: "guard" }, self: true, targets: self,
    play: (s) => { s.luck = { ...s.luck!, smoke: true }; s.hero.block += 2; },
  },
  // ---------- Deck and hand ----------
  {
    id: "intai", name: "Intai", cost: 1, type: "Siasat", text: "Scout: draw 2",
    pattern: { 7: "go", 17: "go" }, self: true, targets: self,
    play: (s) => drawCards(s, 2),
  },
  {
    id: "putar", name: "Putar Balik", cost: 0, type: "Siasat", exhaust: true, text: "Shuffle your discard pile into your draw pile, draw 1",
    pattern: { 11: "go", 13: "go" }, self: true, targets: self,
    play: (s) => {
      s.draw = shuffle(s, [...s.draw, ...s.discard]);
      s.discard = [];
      say(s, "You reshuffle your discard pile", "you");
      drawCards(s, 1);
    },
  },
  {
    id: "simpan", name: "Simpan", cost: 0, type: "Siasat", text: "Keep your unplayed cards for next turn",
    pattern: { 12: "guard" }, self: true, targets: self,
    play: (s) => { s.keepHand = true; },
  },
  {
    id: "pangkat", name: "Naik Pangkat", cost: 1, type: "Siasat", exhaust: true, text: "Promote every card in your hand for this fight",
    pattern: { 2: "go", 7: "go" }, self: true,
    targets: (s) => (s.hand.some((id) => PROMOTE[id]) ? self(s) : []),
    play: (s) => {
      const before = s.hand.filter((id) => PROMOTE[id]).length;
      s.hand = s.hand.map((id) => PROMOTE[id] ?? id);
      s.fx.push({ t: "promote", sq: hero(s) });
      say(s, `Promotion! ${before} ${before === 1 ? "card is" : "cards are"} stronger for this fight`, "good");
    },
  },
  {
    id: "tambah", name: "Tambah", cost: 1, type: "Jurus", exhaust: true, text: "This fight: hold 1 more card each turn",
    pattern: { 11: "go", 13: "go", 12: "guard" }, self: true, targets: self,
    play: (s) => { s.handBonus = (s.handBonus ?? 0) + 1; drawCards(s, 1); },
  },
  // ---------- Dice ----------
  {
    id: "elang", name: "Mata Elang", cost: 0, type: "Siasat", text: "Until your next turn, roll your d20s twice, keep the best. Draw 1",
    pattern: { 7: "go", 12: "guard" }, self: true, targets: self,
    play: (s) => { s.luck = { ...s.luck!, adv: true }; drawCards(s, 1); },
  },
  {
    id: "tenang", name: "Tenang", cost: 0, type: "Siasat", text: "Until your next turn, +4 on your d20s. Block 2",
    pattern: P.guard, self: true, targets: self,
    play: (s) => { s.luck = { ...s.luck!, bonus: (s.luck?.bonus ?? 0) + 4 }; s.hero.block += 2; },
  },
  {
    id: "ejek", name: "Ejek", cost: 1, type: "Siasat", text: "Taunt: enemy jabs roll twice and keep the worst this turn. Block 3",
    pattern: { 6: "hit", 8: "hit", 12: "guard" }, self: true, targets: self,
    play: (s) => { s.luck = { ...s.luck!, taunt: true }; s.hero.block += 3; },
  },
  // ---------- Rules you can bend: your step, your turn, your hand ----------
  {
    id: "kakikuda", name: "Kaki Kuda", cost: 0, type: "Siasat", text: "This turn your free step jumps like a knight",
    pattern: { 1: "go", 3: "go", 9: "go", 13: "go", 15: "go", 19: "go", 21: "go", 23: "go" }, self: true, targets: self,
    play: (s) => { s.knightStep = true; },
  },
  {
    id: "ganda", name: "Langkah Ganda", cost: 0, type: "Siasat", text: "+1 free step this turn",
    pattern: { 11: "go", 13: "go", 7: "go" }, self: true, targets: self,
    play: (s) => { s.extraSteps += 1; },
  },
  {
    id: "napasatur", name: "Atur Napas", cost: 1, type: "Siasat", text: "Next turn you start with +2 Tenaga. Block 2",
    pattern: P.guard, self: true, targets: self,
    play: (s) => { s.nextTenaga = (s.nextTenaga ?? 0) + 2; s.hero.block += 2; },
  },
  {
    id: "gambit", name: "Gambit", cost: 0, type: "Siasat", text: "Sacrifice 2 HP for +2 Tenaga now",
    pattern: { 12: "hit", 7: "go" }, self: true,
    targets: (s) => (s.hero.hp > 2 ? self(s) : []),
    play: (s) => { s.hero.hp -= 2; s.tenaga += 2; s.fx.push({ t: "dmg", sq: hero(s), n: 2, hero: true }); say(s, "Gambit: you give up 2 HP for tempo", "you"); },
  },
  {
    id: "mulligan", name: "Buang Ganti", cost: 0, type: "Siasat", exhaust: true, text: "Discard your hand, draw that many. Once per fight",
    pattern: { 11: "go", 13: "go", 7: "go", 17: "go" }, self: true, targets: self,
    play: (s) => { const n = s.hand.length; s.discard.push(...s.hand); s.hand = []; drawCards(s, n); say(s, `You swap out ${n} ${n === 1 ? "card" : "cards"}`, "you"); },
  },
  // ---------- More chess ----------
  {
    id: "zugzwang", name: "Zugzwang", cost: 1, type: "Siasat", text: "Neighbors with no empty square to move to lose their action",
    pattern: { 6: "guard", 7: "guard", 8: "guard", 11: "guard", 13: "guard" }, self: true,
    targets: (s) => (zugzwanged(s).length ? self(s) : []),
    play: (s) => { for (const u of zugzwanged(s)) lockUnit(s, u); },
  },
  {
    id: "oposisi", name: "Oposisi", cost: 1, type: "Tangkis", text: "Block 3. A King exactly 2 squares away in a line loses its action",
    pattern: { 2: "guard", 12: "guard" }, self: true, targets: self,
    play: (s) => {
      s.hero.block += 3;
      for (const u of s.units) {
        if (u.kind !== "k" || dist(s, u.sq, hero(s)) !== 2 || dirTo(s, hero(s), u.sq) < 0) continue;
        say(s, "Opposition! The King has to give way", "good");
        lockUnit(s, u);
      }
    },
  },
  {
    id: "fianchetto", name: "Fianchetto", cost: 1, type: "Gerak", text: "Dash diagonally up to 2. Block 3",
    reach: (s) => firstInLines(s, [1, 3, 5, 7]).filter((x) => !!unitAt(s, x.sq) && dist(s, hero(s), x.sq) <= 2).map((x) => x.sq),
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go", 0: "go", 4: "go", 12: "guard" },
    targets: (s) => slides(s, [1, 3, 5, 7], 2),
    play: (s, sq) => { s.hero.sq = sq; s.hero.block += 3; },
  },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(list.map((c) => [c.id, c]));

// ---------- Siap: ready a Tangkis card for the enemy turn ----------

/** Cards you can ready: Tangkis cards that play on yourself (Block, counters). */
export const canReady = (s: Fight, id: string) => {
  const c = CARDS[id];
  return !!c && s.status === "play" && !s.ready && c.type === "Tangkis" && !!c.self && cardCost(s, id) <= s.tenaga;
};

/** Pay for a Tangkis card now and set it aside. It goes off on the first attack this enemy turn,
 *  then you riposte. If nothing attacks, it returns to your hand. Returns a new fight. */
export function readyCard(s: Fight, idx: number): Fight {
  const id = s.hand[idx];
  if (!canReady(s, id)) return s;
  const f = clone(s);
  f.fx = [];
  f.tenaga -= cardCost(f, id);
  f.hand.splice(idx, 1);
  f.ready = id;
  say(f, `Siap: you ready ${CARDS[id].name} for their turn`, "you");
  return f;
}

setReadyHook((s, id) => {
  const c = CARDS[id];
  c?.play(s, s.hero.sq);
  return c?.name ?? id;
});
export const ALL_CARDS = list;

export const STARTER = ["tendang", "tendang", "tendang", "dalam", "tangkis", "tangkis", "tangkis", "kuda", "tarik", "bantingan"];
/** Cards you can win after a fight. */
/** Cards you can win or buy: everything except the plain basics. */
export const POOL = list.map((c) => c.id).filter((id) => !["tendang", "tangkis", "kuda", "dalam"].includes(id));

export const isAttack = (id: string) => CARDS[id]?.type === "Serang";
export const typeOf = (id: string) => CARDS[id]?.type;

/** What a card costs right now. */
export const cardCost = (s: Fight, id: string) => CARDS[id]?.costFor?.(s) ?? CARDS[id]?.cost ?? 0;

export function canPlay(s: Fight, id: string) {
  const c = CARDS[id];
  return !!c && s.status === "play" && cardCost(s, id) <= s.tenaga && c.targets(s).length > 0;
}

/** One action in a combo: a card from your hand (by its index when the combo was started), your free step,
 *  or a capture: a move card plus an attack card, landing on an enemy's square by knocking it out. */
export type ComboItem =
  | { k: "card"; idx: number; sq: number }
  | { k: "step"; sq: number }
  | { k: "capture"; idx: number; atk: number; sq: number };

/** What `atkId` would deal when used to capture after `moveId` (named combo bonuses included). */
export function captureDamage(f: Fight, moveId: string, atkId: string, chain: string[] = []): number {
  const a = CARDS[atkId];
  if (!a?.strike) return 0;
  const named = rangkaiFor([...chain, moveId], atkId, typeOf);
  const g = clone(f);
  g.surge = 0;
  named?.before?.(g);
  return a.strike(f) + f.powers.harimau + (f.tf?.rush ?? 0) + (g.surge ?? 0);
}

/** Chess-style capture: can the move card at `mi` land on `sq` by knocking its piece out with the attack at `ai`? */
export function canCapture(f: Fight, mi: number, ai: number, sq: number, chain: string[] = []): boolean {
  const moveId = f.hand[mi], atkId = f.hand[ai];
  const m = CARDS[moveId], a = CARDS[atkId];
  if (f.status !== "play" || mi === ai || !m?.reach || !a?.strike) return false;
  const u = unitAt(f, sq);
  if (!u || !m.reach(f).includes(sq)) return false;
  if (cardCost(f, moveId) + cardCost(f, atkId) > f.tenaga) return false;
  return captureDamage(f, moveId, atkId, chain) >= u.hp;
}

/** Play a capture (changes `f`). */
function applyCapture(f: Fight, mi: number, ai: number, sq: number, chain: string[]): boolean {
  if (!canCapture(f, mi, ai, sq, chain)) return false;
  const moveId = f.hand[mi], atkId = f.hand[ai];
  const m = CARDS[moveId], a = CARDS[atkId];
  const u = unitAt(f, sq)!;
  f.tenaga -= cardCost(f, moveId) + cardCost(f, atkId);
  for (const i of [mi, ai].sort((x, y) => y - x)) f.hand.splice(i, 1);
  for (const c of [m, a]) (c.exhaust ? f.exhausted : f.discard).push(c.id);
  say(f, `You leap with ${m.name} and take the ${unitName(u)} with ${a.name}!`, "you");
  const named = rangkaiFor([...chain, moveId], atkId, typeOf);
  if (named) { announce(f, named); named.before?.(f); }
  const rush = f.tf?.rush ?? 0;
  if (rush) f.tf = { ...f.tf, rush: 0 };
  damageUnit(f, u, a.strike!(f) + f.powers.harimau + rush);
  f.surge = 0;
  if (!f.units.includes(u) && f.status === "play") {
    f.hero.sq = sq;
    f.fx.push({ t: "capture", sq });
    heroMoved(f);
    if (!(moveId === "kuda" && has(f, "peci"))) react(f);
  }
  if (named) named.after?.(f);
  checkEnd(f);
  retarget(f);
  return true;
}

/** Play one card (changes `f`). Returns false if it can't be played there. */
function applyCard(f: Fight, idx: number, sq: number, chain: string[] = []): boolean {
  const id = f.hand[idx];
  const c = CARDS[id];
  if (!c || !canPlay(f, id) || !c.targets(f).includes(sq)) return false;
  const named = rangkaiFor(chain, id, typeOf);
  f.tenaga -= cardCost(f, id);
  f.hand.splice(idx, 1);
  (c.exhaust ? f.exhausted : f.discard).push(id);
  say(f, c.self ? `You play ${c.name}` : `You play ${c.name} on ${sqName(f, sq)}`, "you");
  const from = f.hero.sq;
  if (named) { announce(f, named); named.before?.(f); }
  c.play(f, sq);
  f.surge = 0; // a combo bonus only powers up this one card
  if (named) named.after?.(f);
  if (f.hero.sq !== from && f.status === "play") {
    heroMoved(f);
    // Moved into an enemy's reach (Peci Hitam: Langkah Kuda slips past reactions).
    if (!(id === "kuda" && has(f, "peci"))) react(f);
  }
  checkEnd(f);
  retarget(f); // enemies react to what you just did
  return true;
}

export interface ComboResult {
  fight: Fight;
  /** For each card still in hand: its index in the hand the combo started with (-1 = drawn during the combo). */
  origin: number[];
  /** Items that couldn't be played when their turn came (a roll went differently, a piece moved). */
  fizzled: number[];
}

/** Play a whole combo in order. The combo counter carries across every card in it.
 *  `sim`: a preview. Dice assume the worst for you and nothing is final. */
export function playCombo(s: Fight, items: ComboItem[], opts: { sim?: boolean } = {}): ComboResult {
  const f = clone(s);
  if (opts.sim) f.sim = true;
  f.fx = [];
  f.combo = 0;
  f.rangkai = [];
  const chain: string[] = []; // what's been played so far in this combo, for named combos
  const origin = f.hand.map((_, i) => i);
  const fizzled: number[] = [];
  items.forEach((it, n) => {
    if (f.status !== "play") { fizzled.push(n); return; }
    if (it.k === "capture") {
      const mi = origin.indexOf(it.idx), ai = origin.indexOf(it.atk);
      const ids = [f.hand[mi], f.hand[ai]];
      if (mi < 0 || ai < 0 || !applyCapture(f, mi, ai, it.sq, chain)) { fizzled.push(n); return; }
      for (const i of [mi, ai].sort((x, y) => y - x)) origin.splice(i, 1);
      while (origin.length < f.hand.length) origin.push(-1);
      chain.push(...ids);
      return;
    }
    if (it.k === "step") {
      if (!freeSteps(f).includes(it.sq)) { fizzled.push(n); return; }
      doStep(f, it.sq);
      chain.push("step");
      return;
    }
    const at = origin.indexOf(it.idx);
    const id = f.hand[at];
    if (at < 0 || !applyCard(f, at, it.sq, chain)) { fizzled.push(n); return; }
    chain.push(id);
    origin.splice(at, 1);
    while (origin.length < f.hand.length) origin.push(-1); // cards drawn during the combo
  });
  for (const n of fizzled) if (!opts.sim) say(f, `Combo step ${n + 1} fizzles: it can't be played anymore`, "bad");
  f.bestCombo = Math.max(f.bestCombo, f.combo);
  if (f.combo >= 3) say(f, `Combo ×${f.combo}!`, "good");
  return { fight: f, origin, fizzled };
}

/** Play the card at `idx` in your hand on square `sq`. Returns a new fight (the same one if it can't be played). */
export function playCard(s: Fight, idx: number, sq: number): Fight {
  const r = playCombo(s, [{ k: "card", idx, sq }]);
  return r.fizzled.length ? s : r.fight;
}
