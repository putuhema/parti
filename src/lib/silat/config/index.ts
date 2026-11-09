// Raja Silat config: the JSON files in this folder, typed and checked.
// Edit the JSON, not this file. A mistake in the JSON throws a clear error naming the field.
import balanceJson from "./balance.json";
import enemiesJson from "./enemies.json";

export type PieceKind = "p" | "n" | "b" | "r" | "q" | "k";
export type MoveKind = "kick" | "block" | "heal" | "summon" | "command";

export interface Balance {
  hero: { startHp: number; startGold: number; tenaga: number; handSize: number; healAfterFight: number; restHeal: number; shopHeal: number };
  push: { bump: number; crashPerSquares: number; crashMax: number; heavyRingOut: number; heavySlide: number; guardReach: number; slamReach: number };
  dice: { react: number; dodge: number; counter: number };
  enemies: { summonEvery: number; koGold: number };
  difficulty: {
    budgetBase: number; budgetPerFloor: number; budgetPerDepth: number; eliteMultiplier: number; eliteHpBonus: number;
    bossEscortMultiplier: number; hpPerDepth: number; hitEveryDepths: number; actorsBase: number; maxActors: number;
  };
  bosses: { hpBase: number; hpPerDepth: number; hitBase: number; hitEveryDepths: number; powersByDepth: [number, number][] };
}

export interface PieceStats { name: string; hp: number; hit: number; heavy: boolean; cost: number }
export interface MoveDef {
  name: string;
  kind: MoveKind;
  text: string;
  cooldown?: number;
  damage?: number;
  push?: number;
  amount?: number;
  range?: number;
  bonus?: number;
  piece?: PieceKind;
}
export interface Variant {
  id: string;
  piece: PieceKind;
  name?: string;
  hp?: number;
  hit?: number;
  moves?: string[];
  traits?: string[];
  weight?: number;
  minRow?: number;
  maxRow?: number;
  minDepth?: number;
}
export interface Enemies {
  pieces: Record<PieceKind, PieceStats>;
  moves: Record<string, MoveDef>;
  variants: Variant[];
  traits: Record<string, { name: string; text: string }>;
  eliteTraits: string[];
  bosses: {
    first: { name: string; piece: PieceKind; hp: number; hit: number; traits: string[] };
    pieces: PieceKind[];
    titles: Partial<Record<PieceKind, string[]>>;
    epithets: string[];
    powers: string[];
  };
}

const KINDS: PieceKind[] = ["p", "n", "b", "r", "q", "k"];
const MOVE_KINDS: MoveKind[] = ["kick", "block", "heal", "summon", "command"];

function fail(file: string, msg: string): never {
  throw new Error(`Raja Silat config (${file}): ${msg}`);
}
/** Drop "_about"-style comment keys and comment-only array entries. */
function strip<T>(v: T): T {
  if (Array.isArray(v)) return v.filter((x) => !(x && typeof x === "object" && Object.keys(x).every((k) => k.startsWith("_")))).map(strip) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("_")).map(([k, x]) => [k, strip(x)])) as T;
  return v;
}
const num = (file: string, path: string, v: unknown) => {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(file, `${path} must be a number (got ${JSON.stringify(v)})`);
  return v;
};

export const BALANCE: Balance = (() => {
  const b = strip(balanceJson) as unknown as Balance;
  for (const [group, values] of Object.entries(b)) {
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) if (k !== "powersByDepth") num("balance.json", `${group}.${k}`, v);
  }
  return b;
})();

export const ENEMIES: Enemies = (() => {
  const e = strip(enemiesJson) as unknown as Enemies;
  const F = "enemies.json";
  for (const k of KINDS) {
    const p = e.pieces[k];
    if (!p) fail(F, `pieces.${k} is missing`);
    for (const f of ["hp", "hit", "cost"] as const) num(F, `pieces.${k}.${f}`, p[f]);
  }
  for (const [id, m] of Object.entries(e.moves)) {
    if (!MOVE_KINDS.includes(m.kind)) fail(F, `moves.${id}.kind must be one of ${MOVE_KINDS.join(", ")} (got ${JSON.stringify(m.kind)})`);
    if (m.kind === "kick") { num(F, `moves.${id}.damage`, m.damage); num(F, `moves.${id}.push`, m.push); }
    if (m.kind === "block" || m.kind === "heal") num(F, `moves.${id}.amount`, m.amount);
    if (m.kind === "summon" && !KINDS.includes(m.piece!)) fail(F, `moves.${id}.piece must be a piece letter (p n b r q k)`);
  }
  const seen = new Set<string>();
  for (const v of e.variants) {
    if (!v.id) fail(F, "every variant needs an id");
    if (seen.has(v.id)) fail(F, `variant id "${v.id}" is used twice`);
    seen.add(v.id);
    if (!KINDS.includes(v.piece)) fail(F, `variants.${v.id}.piece must be one of p n b r q k`);
    for (const m of v.moves ?? []) if (!e.moves[m]) fail(F, `variants.${v.id} uses move "${m}", which isn't in "moves"`);
    for (const t of v.traits ?? []) if (!e.traits[t]) fail(F, `variants.${v.id} uses trait "${t}", which isn't in "traits"`);
  }
  for (const k of KINDS) if (!e.variants.some((v) => v.piece === k)) fail(F, `no variant for piece "${k}": add at least one`);
  for (const t of [...e.eliteTraits, ...e.bosses.powers, ...e.bosses.first.traits]) if (!e.traits[t]) fail(F, `trait "${t}" isn't in "traits"`);
  return e;
})();

/** Fill {placeholders} in a text from the given values. */
export const fillText = (text: string, values: Record<string, unknown>) => text.replace(/\{(\w+)\}/g, (all, k: string) => (values[k] !== undefined ? String(values[k]) : all));
