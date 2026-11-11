// Raja Silat: a run climbs the tower (tower.ts): 100 floors in ten tiers. Each tier is a map of
// branching rooms (fights, elites, campfires, shops, mystery events, treasure) with a guardian on top. You collect cards, gold and Pusaka (relics).
// Saved on the device.
import { CARDS, POOL, STARTER, STYLE_CARDS, TIER_NAMES, isAttack, tierOf, type Style } from "./cards";
import { MAP_ROWS, makeMap, nextNodes, nodeById, type MapNode, type RunMap } from "./map";
import { ALL_RELICS, RELICS } from "./relics";
import { BALANCE } from "./config";
import { bossFor, generateBossFight, generateFight, generateWarmup, prisonFor } from "./endless";
import { KO_GOLD, makeFight, type Fight, type Scene, type Setup } from "./rules";
import { TOWER_TIERS, tierFor, towerFloor } from "./tower";

export const FLOORS = MAP_ROWS; // the last row is the boss
export const HEAL_AFTER_FIGHT = BALANCE.hero.healAfterFight;
export const START_HP = BALANCE.hero.startHp;
const KEY = "pums:silat-run";
const BEST_KEY = "pums:silat-best";

export type RunStatus = "style" | "map" | "fight" | "reward" | "camp" | "shop" | "event" | "treasure" | "won" | "lost";

export interface Reward {
  gold: number;
  cards: string[];
  relics: string[];
  /** You beat the tier's guardian: taking it moves you up to the next tier. */
  escape?: boolean;
  /** A new tier of cards just started showing up (its name, for the notice). */
  unlocked?: string;
}
export interface ShopItem { id: string; price: number; sold: boolean }
export interface Shop { cards: ShopItem[]; relic: ShopItem | null; removePrice: number; removed: boolean; healPrice: number; healed: boolean }

export interface Run {
  v: 3;
  seed: number;
  /** The row of the map you're on (0 = Warm-up, last = boss). */
  floor: number;
  hp: number;
  max: number;
  gold: number;
  deck: string[];
  relics: string[];
  /** Your playstyle, picked at the start. Card rewards lean toward it. */
  style?: Style;
  map: RunMap;
  at: string | null;
  path: string[];
  status: RunStatus;
  fight: Fight | null;
  reward: Reward | null;
  shop: Shop | null;
  event: string | null;
  treasure: string[] | null;
  ringOuts: number;
  bestCombo: number;
  /** Which tier of the tower you're in (1 = the bottom, 10 = the top). */
  depth?: number;
  /** The highest card tier you've been told about (for the "new cards unlocked" notice). */
  tierSeen?: number;
}

export interface Best { floor: number; wins: number; runs: number; /** Highest tier reached. */ depth?: number }

export const depthOf = (run: Pick<Run, "depth">) => run.depth ?? 1;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickOne = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length)];

/** The kind of room a floor is (it decides which objects turn up: see endless.ts). */
export function sceneFor(floor: number): Scene {
  if (floor >= FLOORS - 1) return "gate";
  if (floor <= 0) return "cell";
  if (floor <= 3) return "corridor";
  if (floor <= 6) return "yard";
  return "wall";
}
/** The floor of the tower the run is on: 1 to 100. */
export const floorOf = (run: Pick<Run, "depth" | "floor">) => towerFloor(depthOf(run), run.floor);
/** "Floor 34", or "Floor 40 · Raja Hitam" on a tier's top floor. Pass the run for the right tier. */
export function floorName(floor: number, run?: Pick<Run, "seed" | "depth">) {
  const n = `Floor ${towerFloor(run ? depthOf(run) : 1, floor)}`;
  return floor >= FLOORS - 1 && run ? `${n} · ${bossFor(run.seed, depthOf(run)).name}` : n;
}
/** The tier of the tower the run is in: "Green Meadow", "Hill Village"... */
export const tierName = (run: Pick<Run, "depth">) => tierFor(depthOf(run)).name;

/** Every fight is generated from the run's seed (src/lib/silat/endless.ts), the Warm-up included. */
function fightSetup(run: Run, node: MapNode): Setup {
  const depth = depthOf(run);
  const hero = { heroHp: run.hp, heroMax: run.max, deck: run.deck };
  const base: Setup =
    node.kind === "boss"
      ? generateBossFight(run.seed, depth, hero)
      : node.row === 0 && depth === 1
        ? generateWarmup(run.seed, hero)
        // Fights were tuned for six floors a tier: the ten floors are spread over the same range.
        : generateFight({ depth, row: Math.round((node.row * 5) / (FLOORS - 2)), kind: node.kind === "elite" ? "elite" : "fight", scene: sceneFor(node.row), seed: node.seed }, hero);
  return {
    ...base, relics: run.relics, scene: base.scene ?? sceneFor(node.kind === "boss" ? FLOORS - 1 : node.row), tint: prisonFor(run.seed, depth).tint ?? undefined,
    env: { biome: tierFor(depth).biome, arena: node.kind === "boss" || node.kind === "elite", floor: towerFloor(depth, node.row) },
  };
}

export function fightFor(run: Run, node: MapNode): Fight {
  return makeFight(fightSetup(run, node), isAttack);
}

/** Everyone starts with these, plus two cards of their style. */
export const BASE_DECK = STARTER;
/** Each style's one signature card (like Slay the Spire's Bash). */
export const STYLE_STARTER: Record<Style, string[]> = STYLE_CARDS;

/** Pick your playstyle: sets your starting deck, then you're on the map. */
export function chooseStyle(run: Run, style: Style): Run {
  if (run.status !== "style") return run;
  return { ...run, style, deck: [...BASE_DECK, ...STYLE_STARTER[style]], status: "map" };
}

export function newRun(seed = Math.floor(Math.random() * 2 ** 31)): Run {
  const r = rng(seed * 13 + 5);
  // Every run starts with a random common Pusaka, so runs differ from the first fight.
  const starter = pickOne(r, ALL_RELICS.filter((x) => !x.rare)).id;
  return {
    v: 3, seed, floor: 0, hp: START_HP, max: START_HP, gold: BALANCE.hero.startGold, deck: [...STARTER], relics: [starter],
    map: makeMap(seed, 1), at: null, path: [], status: "style", depth: 1,
    fight: null, reward: null, shop: null, event: null, treasure: null, ringOuts: 0, bestCombo: 0,
  };
}

// ---------- Moving on the map ----------

export const canEnter = (run: Run, id: string) => run.status === "map" && nextNodes(run.map, run.at).includes(id);

export function enter(run: Run, id: string): Run {
  if (!canEnter(run, id)) return run;
  const node = nodeById(run.map, id);
  const r = rng(node.seed);
  const moved: Run = { ...run, at: id, path: [...run.path, id], floor: node.row };
  switch (node.kind) {
    case "fight":
    case "elite":
    case "boss":
      return { ...moved, status: "fight", fight: fightFor(moved, node) };
    case "camp":
      return { ...moved, status: "camp" };
    case "shop":
      return { ...moved, status: "shop", shop: stockShop(moved, r) };
    case "event":
      return { ...moved, status: "event", event: pickOne(r, Object.keys(EVENTS)) };
    case "treasure":
      return { ...moved, status: "treasure", treasure: relicChoices(moved, r, 2) };
  }
}

const backToMap = (run: Run): Run => ({ ...run, status: "map", fight: null, reward: null, shop: null, event: null, treasure: null });

// ---------- Rewards ----------

/** Which tiers of cards you can be offered: more open up the deeper you go. Elites reach one tier ahead. */
export function unlockedTier(run: Pick<Run, "floor" | "depth">, elite = false): 1 | 2 | 3 {
  const base = depthOf(run) >= 2 ? 3 : run.floor >= 3 ? 2 : 1;
  return Math.min(3, base + (elite ? 1 : 0)) as 1 | 2 | 3;
}

function cardChoices(run: Run, r: () => number, n = 3, elite = false): string[] {
  const out: string[] = [];
  // The first reward always has something flashy.
  if (run.floor === 0 && depthOf(run) === 1) out.push(pickOne(r, ["lurus", "bantingan", "sabit"]));
  const tier = unlockedTier(run, elite);
  const pool = POOL.filter((id) => !out.includes(id) && tierOf(id) <= tier);
  // Your style's cards show up far more often; other styles' cards less.
  const weight = (id: string) => {
    const c = CARDS[id];
    const base = c.rare ? 1 : 3;
    if (!run.style || !c.style) return base * 2;
    return c.style === run.style ? base * 4 : base;
  };
  while (out.length < n && pool.length) {
    const weighted = pool.flatMap((id) => Array(weight(id)).fill(id) as string[]);
    const id = pickOne(r, weighted);
    out.push(id);
    pool.splice(pool.indexOf(id), 1);
  }
  return out;
}

function relicChoices(run: Run, r: () => number, n: number): string[] {
  const pool = ALL_RELICS.map((x) => x.id).filter((id) => !run.relics.includes(id));
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

/** Call after the fight changes: moves the run on when a fight is won or lost. */
export function settle(run: Run): Run {
  const f = run.fight;
  if (!f || run.status !== "fight") return run;
  if (f.status !== "won" && f.status !== "lost") return run;
  const stats = { ringOuts: run.ringOuts + f.ringOuts, bestCombo: Math.max(run.bestCombo, f.bestCombo) };
  if (f.status === "lost") return { ...run, ...stats, hp: 0, status: "lost" };
  const node = run.at ? nodeById(run.map, run.at) : null;
  const heal = HEAL_AFTER_FIGHT + (run.relics.includes("jamu") ? 4 : 0);
  const done: Run = { ...run, ...stats, hp: Math.min(run.max, f.hero.hp + heal) };
  const r = rng((node?.seed ?? run.seed) + 99);
  if (node?.kind === "boss") {
    // The top of the tower: the run is won.
    if (depthOf(done) >= TOWER_TIERS) return { ...done, status: "won", fight: null };
    // The guardian is down: a big reward, then up to the next tier.
    const gold = 40 + (f.kos ?? 0) * KO_GOLD;
    const opened = (run.tierSeen ?? 1) < 3 ? TIER_NAMES[3] : undefined;
    return { ...done, tierSeen: 3, status: "reward", fight: null, reward: { gold, cards: cardChoices({ ...done, depth: depthOf(done) + 1, floor: 0 }, r), relics: relicChoices(done, r, 3), escape: true, unlocked: opened } };
  }
  const elite = node?.kind === "elite";
  // Base gold, plus what every knockout dropped during the fight.
  const gold = (elite ? 25 + Math.floor(r() * 11) : 10 + Math.floor(r() * 7)) + (f.kos ?? 0) * KO_GOLD;
  // Tell the player the first time a new tier of cards shows up.
  const tier = unlockedTier(done, elite);
  const opened = tier > (run.tierSeen ?? 1) ? TIER_NAMES[tier] : undefined;
  return { ...done, tierSeen: Math.max(run.tierSeen ?? 1, tier), status: "reward", fight: null, reward: { gold, cards: cardChoices(done, r, 3, elite), relics: elite ? relicChoices(done, r, 2) : [], unlocked: opened } };
}

export function takeReward(run: Run, card: string | null, relic: string | null): Run {
  if (!run.reward) return run;
  if (run.reward.escape) {
    return nextTier({
      ...run,
      gold: run.gold + run.reward.gold,
      deck: card ? [...run.deck, card] : run.deck,
      relics: relic ? [...run.relics, relic] : run.relics,
    });
  }
  return backToMap({
    ...run,
    gold: run.gold + run.reward.gold,
    deck: card ? [...run.deck, card] : run.deck,
    relics: relic ? [...run.relics, relic] : run.relics,
  });
}

/** Up to the next tier of the tower: a new map, new fights, a new guardian.
 *  You heal half of what you're missing on the way. */
export function nextTier(run: Run): Run {
  const depth = depthOf(run) + 1;
  return backToMap({
    ...run,
    depth,
    map: makeMap(run.seed, depth),
    floor: 0,
    at: null,
    path: [],
    hp: Math.min(run.max, run.hp + Math.ceil((run.max - run.hp) / 2)),
  });
}

// ---------- Campfire ----------

export const REST_HEAL = BALANCE.hero.restHeal;
export const rest = (run: Run): Run => backToMap({ ...run, hp: Math.min(run.max, run.hp + REST_HEAL) });
/** Train: remove a card from your deck for good. */
export const train = (run: Run, index: number): Run => backToMap({ ...run, deck: run.deck.filter((_, i) => i !== index) });

// ---------- Shop (Warung) ----------

function stockShop(run: Run, r: () => number): Shop {
  const cards = cardChoices({ ...run, floor: Math.max(1, run.floor) }, r, 3).map((id) => ({ id, price: CARDS[id].rare ? 55 + Math.floor(r() * 11) : 30 + Math.floor(r() * 11), sold: false }));
  const relicId = relicChoices(run, r, 1)[0];
  const relic = relicId ? { id: relicId, price: RELICS[relicId].rare ? 90 : 65, sold: false } : null;
  return { cards, relic, removePrice: 40, removed: false, healPrice: 20, healed: false };
}

export const SHOP_HEAL = BALANCE.hero.shopHeal;

export function buyCard(run: Run, i: number): Run {
  const item = run.shop?.cards[i];
  if (!run.shop || !item || item.sold || run.gold < item.price) return run;
  const cards = run.shop.cards.map((c, j) => (j === i ? { ...c, sold: true } : c));
  return { ...run, gold: run.gold - item.price, deck: [...run.deck, item.id], shop: { ...run.shop, cards } };
}
export function buyRelic(run: Run): Run {
  const item = run.shop?.relic;
  if (!run.shop || !item || item.sold || run.gold < item.price) return run;
  return { ...run, gold: run.gold - item.price, relics: [...run.relics, item.id], shop: { ...run.shop, relic: { ...item, sold: true } } };
}
export function buyRemove(run: Run, index: number): Run {
  if (!run.shop || run.shop.removed || run.gold < run.shop.removePrice || run.deck.length <= 5) return run;
  return { ...run, gold: run.gold - run.shop.removePrice, deck: run.deck.filter((_, i) => i !== index), shop: { ...run.shop, removed: true } };
}
export function buyHeal(run: Run): Run {
  if (!run.shop || run.shop.healed || run.gold < run.shop.healPrice || run.hp >= run.max) return run;
  return { ...run, gold: run.gold - run.shop.healPrice, hp: Math.min(run.max, run.hp + SHOP_HEAL), shop: { ...run.shop, healed: true } };
}
export const leave = (run: Run): Run => backToMap(run);

// ---------- Mystery events ----------

/** A d20 check (Baldur's Gate style): roll, add bonuses from your Pusaka, meet the number. */
export interface Check { dc: number; bonus?: Record<string, number>; win: string; lose: string }
export interface EventChoice { id: string; label: string; detail: string; needsCard?: boolean; cost?: number; check?: Check }
export interface GameEvent { title: string; text: string; choices: EventChoice[] }

export const EVENTS: Record<string, GameEvent> = {
  dukun: {
    title: "The Dukun",
    text: "An old dukun offers you a powerful jurus, written on a palm leaf. \"Everything has a price,\" he says.",
    choices: [
      { id: "take", label: "Learn it", detail: "Gain a random rare card. Lose 4 HP." },
      { id: "leave", label: "Walk away", detail: "Nothing happens." },
    ],
  },
  warung: {
    title: "Warung Kopi",
    text: "A little coffee stall by the rice fields. The owner waves you over.",
    choices: [
      { id: "coffee", label: "Kopi tubruk", detail: "Pay 15 gold. Heal 7 HP.", cost: 15 },
      { id: "leave", label: "Keep walking", detail: "Nothing happens." },
    ],
  },
  guru: {
    title: "The Old Master",
    text: "A silat master watches you train. \"Your stance is weak. Let me help.\"",
    choices: [
      { id: "forget", label: "Unlearn a bad habit", detail: "Remove a card from your deck.", needsCard: true },
      { id: "toughen", label: "Toughen up", detail: "+3 max HP." },
    ],
  },
  guard: {
    title: "The Sleeping Guard",
    text: "A guard dozes on a stool by the cell block door. A ring of keys hangs from his belt.",
    choices: [
      { id: "keys", label: "Lift the keys", detail: "d20 12+. Win: a random Pusaka. Lose: he wakes, lose 5 HP.",
        check: { dc: 12, bonus: { sandal: 3, peci: 2 }, win: "The keys slide off without a sound. Behind the door: a Pusaka.", lose: "He snorts awake and swings his baton. You take 5." } },
      { id: "leave", label: "Sneak past", detail: "Nothing happens." },
    ],
  },
  brawl: {
    title: "Yard Brawl",
    text: "Two gangs square off in the courtyard. Whoever wins takes the other side's stash.",
    choices: [
      { id: "fight", label: "Jump in", detail: "d20 10+. Win: a rare card and 20 gold. Lose: 7 HP.",
        check: { dc: 10, bonus: { keris: 3, gelang: 2, keris_api: 2 }, win: "You drop three of them before the guards arrive. The stash is yours.", lose: "Someone hits you with a tray. Then everyone does. You take 7." } },
      { id: "leave", label: "Stay out of it", detail: "Nothing happens." },
    ],
  },
  dadu: {
    title: "Stairwell Dice",
    text: "On a landing of the stairs, climbers are throwing dice for gold. \"One game?\"",
    choices: [
      { id: "bet", label: "Bet 15 gold", detail: "d20 11+. Win: +30 gold. Lose: the 15 is gone.", cost: 15,
        check: { dc: 11, bonus: { akik: 2, tasbih: 2 }, win: "The dice love you tonight. +30 gold.", lose: "Snake eyes, more or less. Your 15 gold is gone." } },
      { id: "leave", label: "Walk on", detail: "Nothing happens." },
    ],
  },
  shrine: {
    title: "Mossy Shrine",
    text: "Something glints between the offerings at an old shrine.",
    choices: [
      { id: "take", label: "Take it", detail: "Gain a random Pusaka. Lose 6 HP." },
      { id: "pray", label: "Pray", detail: "Heal 4 HP." },
    ],
  },
};

/** Your bonus on a check: the Pusaka you carry that help. */
export const checkBonus = (run: Run, c: Check) => Object.entries(c.bonus ?? {}).reduce((a, [id, n]) => a + (run.relics.includes(id) ? n : 0), 0);

export interface RollResult { die: number; bonus: number; dc: number; ok: boolean; text: string; next: Run }

/** Roll a check. Seeded by the run, so leaving and coming back rolls the same number. */
export function rollEvent(run: Run, choice: string): RollResult | null {
  const c = run.event ? EVENTS[run.event]?.choices.find((x) => x.id === choice) : undefined;
  if (!c?.check || (c.cost !== undefined && run.gold < c.cost)) return null;
  const r = rng(run.seed * 13 + run.path.length * 101 + 7);
  const die = 1 + Math.floor(r() * 20);
  const bonus = checkBonus(run, c.check);
  const ok = die === 20 || (die !== 1 && die + bonus >= c.check.dc);
  let next: Run = run;
  if (run.event === "guard") {
    const relic = relicChoices(run, r, 1)[0];
    next = ok ? { ...run, relics: relic ? [...run.relics, relic] : run.relics } : { ...run, hp: Math.max(1, run.hp - 5) };
  } else if (run.event === "brawl") {
    const rares = POOL.filter((id) => CARDS[id].rare);
    next = ok ? { ...run, deck: [...run.deck, pickOne(r, rares)], gold: run.gold + 20 } : { ...run, hp: Math.max(1, run.hp - 7) };
  } else if (run.event === "dadu") {
    next = { ...run, gold: run.gold - 15 + (ok ? 30 : 0) };
  }
  return { die, bonus, dc: c.check.dc, ok, text: ok ? c.check.win : c.check.lose, next: backToMap(next) };
}

export function chooseEvent(run: Run, choice: string, cardIndex?: number): Run {
  const checked = rollEvent(run, choice);
  if (checked) return checked.next;
  const ev = run.event;
  const r = rng(run.seed + run.path.length * 17);
  let next = run;
  if (ev === "dukun" && choice === "take") {
    const rares = POOL.filter((id) => CARDS[id].rare);
    next = { ...run, deck: [...run.deck, pickOne(r, rares)], hp: Math.max(1, run.hp - 4) };
  } else if (ev === "warung" && choice === "coffee") {
    if (run.gold < 15) return run;
    next = { ...run, gold: run.gold - 15, hp: Math.min(run.max, run.hp + 7) };
  } else if (ev === "guru" && choice === "forget") {
    if (cardIndex === undefined) return run;
    next = { ...run, deck: run.deck.filter((_, i) => i !== cardIndex) };
  } else if (ev === "guru" && choice === "toughen") {
    next = { ...run, max: run.max + 3, hp: run.hp + 3 };
  } else if (ev === "shrine" && choice === "take") {
    const relic = relicChoices(run, r, 1)[0];
    next = { ...run, relics: relic ? [...run.relics, relic] : run.relics, hp: Math.max(1, run.hp - 6) };
  } else if (ev === "shrine" && choice === "pray") {
    next = { ...run, hp: Math.min(run.max, run.hp + 4) };
  }
  return backToMap(next);
}

// ---------- Treasure ----------

export function takeTreasure(run: Run, relic: string | null): Run {
  return backToMap({ ...run, relics: relic ? [...run.relics, relic] : run.relics });
}

// ---------- Saving ----------

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Run;
    return r?.v === 3 ? r : null; // older runs (prison maps) are dropped
  } catch {
    return null;
  }
}

export function saveRun(run: Run | null) {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {}
}

export function loadBest(): Best {
  try {
    return { floor: 0, wins: 0, runs: 0, depth: 1, ...JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") };
  } catch {
    return { floor: 0, wins: 0, runs: 0, depth: 1 };
  }
}

export function recordEnd(run: Run) {
  const b = loadBest();
  // Highest tier first, then the furthest floor in it. `wins` counts tiers cleared.
  const deeper = depthOf(run) > (b.depth ?? 1);
  const same = depthOf(run) === (b.depth ?? 1);
  const next: Best = {
    depth: Math.max(b.depth ?? 1, depthOf(run)),
    floor: deeper ? run.floor + 1 : same ? Math.max(b.floor, run.floor + 1) : b.floor,
    wins: b.wins + (depthOf(run) - 1) + (run.status === "won" ? 1 : 0),
    runs: b.runs + 1,
  };
  try { localStorage.setItem(BEST_KEY, JSON.stringify(next)); } catch {}
  return next;
}
