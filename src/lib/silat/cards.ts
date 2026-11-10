// Raja Silat cards: what each one targets and what it does.
import {
  DIRS, FLY, KNIGHT, checkEnd, clone, dist, hasTrait, setReadyHook, doStep, shuffle, drawCards, freeSteps, has, heroMoved, lockUnit, react, retarget, say, sqName, damageUnit, dirTo, explode, hitOcc, isEmpty, isOrth, neighbors, occupant, offset, push, ringOut,
  unitAt, unitName, type Fight,
} from "./rules";
import { announce, rangkaiFor } from "./rangkai";
import cardsJson from "./config/cards.json";
import { fillText } from "./config";

// ---------- Card data (config/cards.json) ----------

/** What JSON-only cards can target. */
type TargetKind = "self" | "adjacent" | "adjacentUnit" | "emptyAdjacent" | "knight" | "anyUnit" | "lineUnit";
/** One step of a JSON-only card. Numbers can be literal or the name of one of the card's values. */
interface Effect {
  do: "kick" | "hit" | "block" | "draw" | "move" | "lock" | "heal" | "tenaga" | "push";
  dmg?: number | string;
  push?: number | string | "fly";
  crash?: number | string;
  amount?: number | string;
  n?: number | string;
}
interface CardData {
  name: string;
  cost: number;
  type: CardType;
  text: string;
  style?: Style;
  tier?: 1 | 2 | 3;
  rare?: boolean;
  exhaust?: boolean;
  values?: Record<string, number>;
  target?: TargetKind;
  pattern?: Record<string, Mark>;
  effects?: Effect[];
}
const CARD_TYPES: CardType[] = ["Serang", "Gerak", "Tangkis", "Jurus", "Siasat"];
const TARGETS: TargetKind[] = ["self", "adjacent", "adjacentUnit", "emptyAdjacent", "knight", "anyUnit", "lineUnit"];
const EFFECTS: Effect["do"][] = ["kick", "hit", "block", "draw", "move", "lock", "heal", "tenaga", "push"];
const cardFail = (msg: string): never => { throw new Error(`Raja Silat config (cards.json): ${msg}`); };

const DATA = cardsJson as unknown as { starterDeck: string[]; styleCards: Record<string, string[]>; cards: Record<string, CardData> };
for (const [id, c] of Object.entries(DATA.cards)) {
  if (typeof c.name !== "string" || !c.name) cardFail(`${id}.name is missing`);
  if (typeof c.cost !== "number") cardFail(`${id}.cost must be a number`);
  if (!CARD_TYPES.includes(c.type)) cardFail(`${id}.type must be one of ${CARD_TYPES.join(", ")}`);
  if (c.tier !== undefined && ![1, 2, 3].includes(c.tier)) cardFail(`${id}.tier must be 1, 2 or 3`);
  for (const [k, v] of Object.entries(c.values ?? {})) if (typeof v !== "number") cardFail(`${id}.values.${k} must be a number`);
  if (c.effects) {
    if (!c.target || !TARGETS.includes(c.target)) cardFail(`${id}.target must be one of ${TARGETS.join(", ")} for a card with effects`);
    for (const e of c.effects) if (!EFFECTS.includes(e.do)) cardFail(`${id}: effect "${e.do}" isn't one of ${EFFECTS.join(", ")}`);
  }
}

/** A number from a card's "values" in cards.json. */
export function val(id: string, key: string): number {
  const v = DATA.cards[id]?.values?.[key];
  if (typeof v !== "number") cardFail(`card "${id}" needs a number values.${key}`);
  return v as number;
}

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

/** A card as the game uses it: its data from config/cards.json plus its behaviour (from code, or built
 *  from the JSON "effects" list). */
export interface CardDef extends CardCode {
  name: string;
  cost: number;
  type: CardType;
  text: string;
  rare?: boolean;
  style?: Style;
  /** Gone for the rest of the fight once played. */
  exhaust?: boolean;
  /** When it starts showing up in rewards (1-3). Basics have none. */
  tier?: 1 | 2 | 3;
  /** The numbers from config/cards.json ("values"). */
  values: Record<string, number>;
}

/** Card behaviour written in code. Everything tunable lives in config/cards.json. */
export interface CardCode {
  id: string;
  /** Cost that changes during a fight (otherwise `cost`). */
  costFor?: (s: Fight) => number;
  /** Plays on your own king (no target to pick). */
  self?: boolean;
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

/** Card behaviour. Names, costs, types, texts, tiers and numbers are in config/cards.json. */
const code: CardCode[] = [
  {
    id: "tendang", strike: () => val("tendang", "dmg"),
    pattern: P.kick, targets: adjacentThings, play: (s, sq) => kick(s, sq, val("tendang", "dmg"), FLY),
  },
  {
    id: "lurus", strike: () => val("lurus", "dmg"),
    pattern: { 7: "hit", 2: "push" }, targets: adjacentThings, play: (s, sq) => kick(s, sq, val("lurus", "dmg"), FLY, val("lurus", "crash")),
  },
  {
    id: "dalam", strike: () => val("dalam", "dmg"),
    pattern: { 7: "hit" }, targets: adjacentUnits, play: (s, sq) => { const u = unitAt(s, sq); if (u) damageUnit(s, u, val("dalam", "dmg") + s.powers.harimau); },
  },
  {
    id: "sabit",
    pattern: { 6: "hit", 7: "hit", 8: "hit", 1: "push", 2: "push", 3: "push" },
    targets: (s) => neighbors(s, hero(s)),
    play: (s, sq) => {
      const d = dirTo(s, hero(s), sq);
      const squares = [d + 7, d, d + 1].map((x) => offset(s, hero(s), DIRS[x % 8][0], DIRS[x % 8][1]));
      for (const t of squares) if (t !== null) kick(s, t, val("sabit", "dmg"), val("sabit", "push"));
    },
  },
  {
    id: "bantingan", strike: () => val("bantingan", "dmg"),
    pattern: { 7: "hit", 17: "push", 22: "push" }, targets: adjacentUnits,
    play: (s, sq) => {
      const u = unitAt(s, sq);
      const d = dirTo(s, hero(s), sq);
      if (!u || d < 0) return;
      const back = (d + 4) % 8;
      const land = offset(s, hero(s), DIRS[back][0], DIRS[back][1]);
      damageUnit(s, u, val("bantingan", "dmg") + s.powers.harimau);
      if (!s.units.includes(u) || hasTrait(u, "kokoh")) return;
      if (land === null) return ringOut(s, { t: "unit", u }, back);
      const other = occupant(s, land);
      if (other) {
        // Slammed straight into whatever is behind you.
        damageUnit(s, u, val("bantingan", "slam"));
        hitOcc(s, other, val("bantingan", "slam"));
        return;
      }
      u.sq = land;
      say(s, `You throw the ${unitName(u)} over your shoulder`, "you");
      push(s, land, back, FLY);
    },
  },
  {
    id: "tarik", strike: () => val("tarik", "dmg"),
    pattern: { 2: "hit", 7: "go" },
    targets: (s) => {
      const out: number[] = [];
      for (const [dx, dy] of DIRS) {
        let cur = hero(s);
        for (let i = 1; i <= val("tarik", "range"); i++) {
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
      if (o.t === "unit") { if (!hasTrait(o.u, "kokoh")) o.u.sq = dest; damageUnit(s, o.u, val("tarik", "dmg")); }
      else o.th.sq = dest;
    },
  },
  {
    id: "tolak",
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
    id: "badai", strike: () => val("badai", "dmg"),
    pattern: { 7: "hit", 2: "push", 1: "hit", 3: "hit" }, targets: adjacentUnits,
    play: (s, sq) => kick(s, sq, val("badai", "dmg"), FLY, val("badai", "crash")),
  },
  {
    id: "kuda", reach: (s) => KNIGHT.map(([dx, dy]) => offset(s, hero(s), dx, dy)).filter((x): x is number => x !== null && !!unitAt(s, x)),
    pattern: { 1: "go", 3: "go", 5: "go", 9: "go", 15: "go", 19: "go", 21: "go", 23: "go" },
    targets: (s) => KNIGHT.map(([dx, dy]) => offset(s, hero(s), dx, dy)).filter((x): x is number => x !== null && isEmpty(s, x)),
    play: (s, sq) => { s.hero.sq = sq; },
  },
  {
    id: "gajah", reach: (s) => firstInLines(s, [1, 3, 5, 7]).filter((x) => !!unitAt(s, x.sq) && dist(s, hero(s), x.sq) <= val("gajah", "range")).map((x) => x.sq),
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go", 0: "go", 4: "go", 20: "go", 24: "go" },
    targets: (s) => slides(s, [1, 3, 5, 7], val("gajah", "range")),
    play: (s, sq) => { s.hero.sq = sq; },
  },
  {
    id: "benteng",
    pattern: { 2: "go", 7: "go", 10: "go", 11: "go", 13: "go", 14: "go", 17: "go", 22: "go" },
    targets: (s) => [0, 2, 4, 6].map((d) => offset(s, hero(s), DIRS[d][0], DIRS[d][1])).filter((x): x is number => x !== null),
    play: (s, sq) => {
      const d = dirTo(s, hero(s), sq);
      if (d < 0 || !isOrth(d)) return;
      for (;;) {
        const next = offset(s, hero(s), DIRS[d][0], DIRS[d][1]);
        if (next === null) return;
        if (!isEmpty(s, next)) return kick(s, next, val("benteng", "dmg"), FLY);
        s.hero.sq = next;
      }
    },
  },
  {
    id: "tangkis",
    pattern: P.guard, self: true, targets: self, play: (s) => { s.hero.block += val("tangkis", "block"); },
  },
  {
    id: "kudakuda",
    pattern: P.guard, self: true, targets: self, play: (s) => { s.hero.block += val("kudakuda", "block"); },
  },
  {
    id: "tangkisan",
    pattern: { ...P.guard, 2: "push" }, self: true, targets: self,
    play: (s) => { s.hero.block += val("tangkisan", "block"); s.counter = Math.max(s.counter, val("tangkisan", "kickback")); },
  },
  {
    id: "elakan",
    pattern: { 11: "go", 13: "go" },
    targets: (s) => neighbors(s, hero(s)).filter((sq) => isEmpty(s, sq)),
    play: (s, sq) => { s.hop = sq; },
  },
  {
    id: "kuncian",
    pattern: { 7: "guard" },
    targets: (s) => adjacentUnits(s).filter((sq) => { const u = unitAt(s, sq)!; return u.boss || s.intents.some((i) => i.id === u.id); }),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      if (!u) return;
      lockUnit(s, u);
    },
  },
  {
    id: "harimau",
    pattern: { 6: "hit", 8: "hit", 16: "hit", 18: "hit" }, self: true, targets: self,
    play: (s) => { s.powers.harimau += val("harimau", "bonus"); },
  },
  {
    id: "momentum",
    pattern: { 7: "push", 2: "push", 17: "push", 22: "push" }, self: true, targets: self,
    play: (s) => { s.powers.momentum += val("momentum", "bonus"); },
  },
  // ---------- Harimau (tiger): crash and chain ----------
  {
    id: "terkam", strike: () => val("terkam", "dmg"),
    pattern: { 7: "hit", 2: "push" }, targets: adjacentThings,
    play: (s, sq) => {
      const before = s.tf?.crashes ?? 0;
      kick(s, sq, val("terkam", "dmg"), FLY);
      if ((s.tf?.crashes ?? 0) > before) { drawCards(s, val("terkam", "draw")); say(s, `Terkam: draw ${val("terkam", "draw")}`, "good"); }
    },
  },
  {
    id: "rantai", strike: () => val("rantai", "dmg"),
    pattern: { 7: "hit", 2: "push", 1: "push" }, targets: adjacentThings,
    costFor: (s) => ((s.tf?.crashes ?? 0) > 0 ? 0 : 1),
    play: (s, sq) => kick(s, sq, val("rantai", "dmg"), FLY),
  },
  {
    id: "amuk",
    pattern: { 6: "hit", 8: "hit", 16: "guard", 18: "guard" }, self: true, targets: self,
    play: (s) => { s.powers.amuk = (s.powers.amuk ?? 0) + 1; },
  },
  // ---------- Bangau (crane): defend and punish ----------
  {
    id: "balas", strike: (s) => s.hero.block + val("balas", "bonus"),
    pattern: { 7: "hit", 12: "guard" }, targets: adjacentUnits,
    play: (s, sq) => { const u = unitAt(s, sq); if (u) damageUnit(s, u, s.hero.block + val("balas", "bonus") + s.powers.harimau); },
  },
  {
    id: "napas",
    pattern: P.guard, self: true, targets: self,
    play: (s) => { s.hero.block += val("napas", "block"); drawCards(s, val("napas", "draw")); },
  },
  {
    id: "bentengdiri",
    pattern: P.guard, self: true, targets: self,
    play: (s) => { s.powers.benteng = (s.powers.benteng ?? 0) + 1; },
  },
  {
    id: "pantulan",
    pattern: { ...P.guard, 2: "hit" }, self: true, targets: self,
    play: (s) => { s.powers.pantulan = (s.powers.pantulan ?? 0) + 1; },
  },
  // ---------- Ular (snake): move and strike ----------
  {
    id: "liuk", reach: adjacentUnits,
    pattern: { 11: "go", 13: "go", 7: "go", 17: "go" },
    targets: (s) => neighbors(s, hero(s)).filter((sq) => isEmpty(s, sq)),
    play: (s, sq) => { s.hero.sq = sq; drawCards(s, val("liuk", "draw")); },
  },
  {
    id: "lilit",
    pattern: { 2: "hit", 7: "guard" },
    targets: (s) => CARDS.tarik.targets(s).filter((sq) => !!unitAt(s, sq)),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      const d = dirTo(s, hero(s), sq);
      const dest = offset(s, hero(s), DIRS[d][0], DIRS[d][1]);
      if (!u || dest === null) return;
      if (!hasTrait(u, "kokoh")) u.sq = dest;
      say(s, `You wrap up the ${unitName(u)}`, "you");
      lockUnit(s, u);
    },
  },
  {
    id: "sabetan",
    pattern: { 6: "hit", 7: "hit", 8: "hit", 11: "hit", 13: "hit", 16: "hit", 17: "hit", 18: "hit" }, self: true,
    targets: (s) => (adjacentUnits(s).length ? self(s) : []),
    play: (s) => { for (const sq of adjacentUnits(s)) { const u = unitAt(s, sq); if (u) damageUnit(s, u, val("sabetan", "dmg") + s.powers.harimau); } },
  },
  {
    id: "lincah",
    pattern: { 11: "go", 13: "go", 7: "hit" }, self: true, targets: self,
    play: (s) => { s.powers.lincah = (s.powers.lincah ?? 0) + 1; },
  },
  {
    id: "bayangan",
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go" }, self: true, targets: self,
    play: (s) => { s.powers.bayangan = (s.powers.bayangan ?? 0) + 1; },
  },
  // ---------- Chess pieces you move like ----------
  {
    id: "pion",
    pattern: { 7: "go", 6: "hit", 8: "hit" },
    targets: (s) => {
      const up = offset(s, hero(s), 0, -1);
      const diag = [offset(s, hero(s), -1, -1), offset(s, hero(s), 1, -1)].filter((x): x is number => x !== null && !!unitAt(s, x));
      return [...(up !== null && isEmpty(s, up) ? [up] : []), ...diag];
    },
    play: (s, sq) => {
      const u = unitAt(s, sq);
      if (u) { damageUnit(s, u, val("pion", "dmg") + s.powers.harimau); return; }
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
    id: "ratu", reach: lineUnits,
    pattern: { 0: "go", 2: "go", 4: "go", 6: "go", 7: "go", 8: "go", 10: "go", 11: "go", 13: "go", 14: "go", 16: "go", 17: "go", 18: "go", 20: "go", 22: "go", 24: "go" },
    targets: (s) => slides(s, [0, 1, 2, 3, 4, 5, 6, 7], 99),
    play: (s, sq) => { s.hero.sq = sq; },
  },
  {
    id: "rokade",
    pattern: { 2: "go", 10: "go", 14: "go", 22: "go" },
    targets: (s) => firstInLines(s, [0, 2, 4, 6]).map((x) => x.sq).filter((sq) => { const u = unitAt(s, sq); return !u || !hasTrait(u, "kokoh"); }),
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
    id: "garpu",
    pattern: { 1: "go", 3: "go", 5: "hit", 9: "hit", 15: "hit", 19: "hit", 21: "go", 23: "go" },
    targets: (s) => CARDS.kuda.targets(s),
    play: (s, sq) => {
      s.hero.sq = sq;
      const forked = KNIGHT.map(([dx, dy]) => offset(s, sq, dx, dy)).map((x) => (x === null ? undefined : unitAt(s, x))).filter((u): u is NonNullable<typeof u> => !!u);
      if (forked.length >= 2) say(s, `Fork! ${forked.length} pieces at once`, "good");
      for (const u of forked) damageUnit(s, u, val("garpu", "dmg") + s.powers.harimau);
    },
  },
  {
    id: "paku",
    pattern: { 2: "guard", 7: "guard" },
    targets: lineUnits,
    play: (s, sq) => {
      const u = unitAt(s, sq);
      const d = dirTo(s, hero(s), sq);
      if (!u || d < 0) return;
      const back = behind(s, sq, d);
      say(s, `You pin the ${unitName(u)}`, "you");
      if (back !== null && unitAt(s, back)) { say(s, "It's pinned to the piece behind it!", "good"); damageUnit(s, u, val("paku", "dmg")); }
      if (s.units.includes(u)) lockUnit(s, u);
    },
  },
  {
    id: "tusuk",
    pattern: { 7: "hit", 2: "hit" },
    targets: lineUnits,
    play: (s, sq) => {
      const d = dirTo(s, hero(s), sq);
      const first = unitAt(s, sq);
      if (!first || d < 0) return;
      const back = behind(s, sq, d);
      const second = back !== null ? unitAt(s, back) : undefined;
      damageUnit(s, first, val("tusuk", "dmg") + s.powers.harimau);
      if (second) damageUnit(s, second, val("tusuk", "dmg2") + s.powers.harimau);
    },
  },
  {
    id: "terbuka",
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
      for (const t of hits) { const u = unitAt(s, t); if (u) damageUnit(s, u, val("terbuka", "dmg")); }
    },
  },
  {
    id: "passant",
    pattern: { 11: "hit", 13: "hit" },
    targets: (s) => adjacentUnits(s).filter((sq) => (s.movedLast ?? []).includes(unitAt(s, sq)!.id)),
    play: (s, sq) => { const u = unitAt(s, sq); if (u) damageUnit(s, u, val("passant", "dmg") + s.powers.harimau); },
  },
  {
    id: "skak",
    pattern: { 2: "hit", 7: "go" },
    targets: (s) => firstInLines(s).filter((x) => unitAt(s, x.sq)?.target).map((x) => x.sq),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      if (!u) return;
      s.fx.push({ t: "castle", sq });
      say(s, "Skak!", "good");
      damageUnit(s, u, val("skak", "dmg"));
      if (s.units.includes(u)) lockUnit(s, u);
    },
  },
  // ---------- Street fighting ----------
  {
    id: "kerambit", strike: () => val("kerambit", "dmg"),
    pattern: { 7: "hit" }, targets: adjacentUnits,
    play: (s, sq) => { const u = unitAt(s, sq); if (u) damageUnit(s, u, val("kerambit", "dmg") + s.powers.harimau); },
  },
  {
    id: "cambuk", strike: () => val("cambuk", "dmg"),
    pattern: { 2: "hit", 7: "go" },
    targets: (s) => firstInLines(s, [0, 2, 4, 6]).filter((x) => !!unitAt(s, x.sq)).map((x) => x.sq),
    play: (s, sq) => {
      const u = unitAt(s, sq);
      const d = dirTo(s, hero(s), sq);
      if (!u || d < 0) return;
      const dest = offset(s, hero(s), DIRS[d][0], DIRS[d][1]);
      if (dest !== null && dest !== sq && !hasTrait(u, "kokoh")) u.sq = dest;
      damageUnit(s, u, val("cambuk", "dmg") + s.powers.harimau);
    },
  },
  {
    id: "sogok",
    pattern: { 7: "guard", 2: "guard" },
    targets: (s) => s.units.map((u) => u.sq),
    play: (s, sq) => { const u = unitAt(s, sq); if (u) { say(s, `You slip the ${unitName(u)} a few coins`, "you"); lockUnit(s, u); } },
  },
  {
    id: "asap",
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go", 12: "guard" }, self: true, targets: self,
    play: (s) => { s.luck = { ...s.luck!, smoke: true }; s.hero.block += val("asap", "block"); },
  },
  // ---------- Deck and hand ----------
  {
    id: "intai",
    pattern: { 7: "go", 17: "go" }, self: true, targets: self,
    play: (s) => drawCards(s, val("intai", "draw")),
  },
  {
    id: "putar",
    pattern: { 11: "go", 13: "go" }, self: true, targets: self,
    play: (s) => {
      s.draw = shuffle(s, [...s.draw, ...s.discard]);
      s.discard = [];
      say(s, "You reshuffle your discard pile", "you");
      drawCards(s, val("putar", "draw"));
    },
  },
  {
    id: "simpan",
    pattern: { 12: "guard" }, self: true, targets: self,
    play: (s) => { s.keepHand = true; },
  },
  {
    id: "pangkat",
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
    id: "tambah",
    pattern: { 11: "go", 13: "go", 12: "guard" }, self: true, targets: self,
    play: (s) => { s.handBonus = (s.handBonus ?? 0) + val("tambah", "hand"); drawCards(s, val("tambah", "draw")); },
  },
  // ---------- Dice ----------
  {
    id: "elang",
    pattern: { 7: "go", 12: "guard" }, self: true, targets: self,
    play: (s) => { s.luck = { ...s.luck!, adv: true }; drawCards(s, val("elang", "draw")); },
  },
  {
    id: "tenang",
    pattern: P.guard, self: true, targets: self,
    play: (s) => { s.luck = { ...s.luck!, bonus: (s.luck?.bonus ?? 0) + val("tenang", "bonus") }; s.hero.block += val("tenang", "block"); },
  },
  {
    id: "ejek",
    pattern: { 6: "hit", 8: "hit", 12: "guard" }, self: true, targets: self,
    play: (s) => { s.luck = { ...s.luck!, taunt: true }; s.hero.block += val("ejek", "block"); },
  },
  // ---------- Rules you can bend: your step, your turn, your hand ----------
  {
    id: "kakikuda",
    pattern: { 1: "go", 3: "go", 9: "go", 13: "go", 15: "go", 19: "go", 21: "go", 23: "go" }, self: true, targets: self,
    play: (s) => { s.knightStep = true; },
  },
  {
    id: "ganda",
    pattern: { 11: "go", 13: "go", 7: "go" }, self: true, targets: self,
    play: (s) => { s.extraSteps += val("ganda", "steps"); },
  },
  {
    id: "napasatur",
    pattern: P.guard, self: true, targets: self,
    play: (s) => { s.nextTenaga = (s.nextTenaga ?? 0) + val("napasatur", "tenaga"); s.hero.block += val("napasatur", "block"); },
  },
  {
    id: "gambit",
    pattern: { 12: "hit", 7: "go" }, self: true,
    targets: (s) => (s.hero.hp > val("gambit", "hp") ? self(s) : []),
    play: (s) => { s.hero.hp -= val("gambit", "hp"); s.tenaga += val("gambit", "tenaga"); s.fx.push({ t: "dmg", sq: hero(s), n: val("gambit", "hp"), hero: true }); say(s, `Gambit: you give up ${val("gambit", "hp")} HP for tempo`, "you"); },
  },
  {
    id: "mulligan",
    pattern: { 11: "go", 13: "go", 7: "go", 17: "go" }, self: true, targets: self,
    play: (s) => { const n = s.hand.length; s.discard.push(...s.hand); s.hand = []; drawCards(s, n); say(s, `You swap out ${n} ${n === 1 ? "card" : "cards"}`, "you"); },
  },
  // ---------- More chess ----------
  {
    id: "zugzwang",
    pattern: { 6: "guard", 7: "guard", 8: "guard", 11: "guard", 13: "guard" }, self: true,
    targets: (s) => (zugzwanged(s).length ? self(s) : []),
    play: (s) => { for (const u of zugzwanged(s)) lockUnit(s, u); },
  },
  {
    id: "oposisi",
    pattern: { 2: "guard", 12: "guard" }, self: true, targets: self,
    play: (s) => {
      s.hero.block += val("oposisi", "block");
      for (const u of s.units) {
        if (u.kind !== "k" || dist(s, u.sq, hero(s)) !== 2 || dirTo(s, hero(s), u.sq) < 0) continue;
        say(s, "Opposition! The King has to give way", "good");
        lockUnit(s, u);
      }
    },
  },
  {
    id: "fianchetto",
    reach: (s) => firstInLines(s, [1, 3, 5, 7]).filter((x) => !!unitAt(s, x.sq) && dist(s, hero(s), x.sq) <= val("fianchetto", "range")).map((x) => x.sq),
    pattern: { 6: "go", 8: "go", 16: "go", 18: "go", 0: "go", 4: "go", 12: "guard" },
    targets: (s) => slides(s, [1, 3, 5, 7], val("fianchetto", "range")),
    play: (s, sq) => { s.hero.sq = sq; s.hero.block += val("fianchetto", "block"); },
  },
];

// ---------- JSON-only cards: built from "target" and "effects" ----------

const TARGET_FN: Record<TargetKind, (s: Fight) => number[]> = {
  self,
  adjacent: adjacentThings,
  adjacentUnit: adjacentUnits,
  emptyAdjacent: (s) => neighbors(s, hero(s)).filter((sq) => isEmpty(s, sq)),
  knight: (s) => KNIGHT.map(([dx, dy]) => offset(s, hero(s), dx, dy)).filter((x): x is number => x !== null && isEmpty(s, x)),
  anyUnit: (s) => s.units.map((u) => u.sq),
  lineUnit: lineUnits,
};
const DEFAULT_PATTERN: Record<TargetKind, Partial<Record<number, Mark>>> = {
  self: P.guard, adjacent: P.kick, adjacentUnit: { 7: "hit" }, emptyAdjacent: { 7: "go", 11: "go", 13: "go" },
  knight: { 1: "go", 3: "go", 9: "go", 13: "go" }, anyUnit: { 2: "hit" }, lineUnit: { 2: "hit", 7: "hit" },
};

function buildFromEffects(id: string, d: CardData): CardCode {
  const num = (x: number | string | undefined, fallback = 0) => (typeof x === "string" ? val(id, x) : x ?? fallback);
  return {
    id,
    self: d.target === "self",
    pattern: d.pattern ? Object.fromEntries(Object.entries(d.pattern).map(([k, v]) => [Number(k), v])) : DEFAULT_PATTERN[d.target!],
    targets: TARGET_FN[d.target!],
    strike: d.effects!.length && d.effects!.every((e) => e.do === "hit") ? () => d.effects!.reduce((a, e) => a + num(e.dmg), 0) : undefined,
    play: (s, sq) => {
      for (const e of d.effects!) {
        const u = unitAt(s, sq);
        switch (e.do) {
          case "kick": kick(s, sq, num(e.dmg), e.push === "fly" ? FLY : num(e.push, 1), num(e.crash)); break;
          case "hit": if (u) damageUnit(s, u, num(e.dmg) + s.powers.harimau); break;
          case "push": { const dd = dirTo(s, hero(s), sq); if (dd >= 0 && occupant(s, sq)) push(s, sq, dd, e.push === "fly" ? FLY : num(e.push, 1)); break; }
          case "block": s.hero.block += num(e.amount); break;
          case "draw": drawCards(s, num(e.n, 1)); break;
          case "move": if (isEmpty(s, sq)) s.hero.sq = sq; break;
          case "lock": if (u) lockUnit(s, u); break;
          case "heal": s.hero.hp = Math.min(s.hero.max, s.hero.hp + num(e.amount)); break;
          case "tenaga": s.tenaga += num(e.n, 1); break;
        }
        if (s.status !== "play") return;
      }
    },
  };
}

const codeById = new Map(code.map((c) => [c.id, c]));
for (const id of codeById.keys()) if (!DATA.cards[id]) cardFail(`card "${id}" exists in code but not in cards.json`);
for (const [id, d] of Object.entries(DATA.cards)) if (!codeById.has(id) && !d.effects) cardFail(`card "${id}" has no code behind it: give it a "target" and "effects"`);

const list: CardDef[] = Object.entries(DATA.cards).map(([id, d]) => {
  const behaviour = codeById.get(id) ?? buildFromEffects(id, d);
  const values = d.values ?? {};
  return {
    ...behaviour,
    name: d.name,
    cost: d.cost,
    type: d.type,
    text: fillText(d.text, values),
    style: d.style,
    rare: d.rare,
    exhaust: d.exhaust,
    tier: d.tier,
    values,
  };
});
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

/** The starting deck, Slay the Spire style (config/cards.json "starterDeck"). Your style adds its signature card. */
export const STARTER: string[] = DATA.starterDeck;
/** Each style's signature card(s) (config/cards.json "styleCards"). */
export const STYLE_CARDS = DATA.styleCards as Record<Style, string[]>;
for (const id of [...STARTER, ...Object.values(STYLE_CARDS).flat()]) if (!DATA.cards[id]) cardFail(`starter card "${id}" isn't in "cards"`);

/** When a card can start showing up in rewards and shops (each card's "tier" in cards.json).
 *  1: from the start. 2: from floor 4 of the first prison. 3: from the second prison on. */
export const TIERS: Record<1 | 2 | 3, string[]> = {
  1: list.filter((c) => c.tier === 1).map((c) => c.id),
  2: list.filter((c) => c.tier === 2).map((c) => c.id),
  3: list.filter((c) => c.tier === 3).map((c) => c.id),
};
export const tierOf = (id: string): 1 | 2 | 3 => CARDS[id]?.tier ?? 3;
export const TIER_NAMES: Record<1 | 2 | 3, string> = { 1: "Basics", 2: "Chess tactics and stances", 3: "Rare and rule-bending cards" };
/** Cards you can win after a fight. */
/** Cards you can win or buy: everything except the plain basics. */
export const POOL = list.filter((c) => c.tier !== undefined).map((c) => c.id);

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
