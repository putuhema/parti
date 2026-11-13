/**
 * Juragan Nusantara: a property-trading board game on a tall ring of 34 spaces, island-hopping across Indonesia.
 * Pure rules, no database: the server runs them, the tests replay them, and the phone reads the tables.
 */

export const BOOM_MAX = 4;
export const START_CASH = 1500;
export const LAP_BONUS = 200;
export const POT_SEED = 100;
export const TAX = 150;
export const MAX_LEVEL = 3;
export const ROLL_MS = 20_000; // time to tap the dice
export const CHOICE_MS = 15_000; // time to buy or build
export const BOT_MS = 900; // a bot's pause before it acts
export const ROUND_CHOICES = [12, 20, 30] as const;

export type Seat = string; // a player id, or "bot1" / "bot2"
export const BOTS: Seat[] = ["bot1", "bot2"];
export const isBot = (p: Seat) => p.startsWith("bot");

// ---------- The board ----------
export const GROUPS = [
  { name: "Papua", color: "#B0764A" },
  { name: "Maluku & Nusa Tenggara", color: "#3DB6F2" },
  { name: "Sulawesi", color: "#F06CB4" },
  { name: "Kalimantan", color: "#FF9A1F" },
  { name: "Sumatra", color: "#EE4B4B" },
  { name: "Bali & Lombok", color: "#F2C200" },
  { name: "Jawa", color: "#3DAE4A" },
  { name: "Jakarta", color: "#8B5BD6" },
] as const;

export type Space =
  | { kind: "start" | "jail" | "jackpot" | "wheel" | "surprise" | "bonus" | "tax"; name: string }
  | { kind: "lot"; name: string; group: number; price: number }
  | { kind: "hub"; name: string; price: number; icon: string };

const lot = (name: string, group: number, price: number): Space => ({ kind: "lot", name, group, price });
const hub = (name: string, icon: string): Space => ({ kind: "hub", name, price: 200, icon });
const surprise: Space = { kind: "surprise", name: "Kejutan" };
const bonus: Space = { kind: "bonus", name: "THR" };

/**
 * Clockwise from START in the top-right corner: down the right side, along the bottom, up the left, across the top.
 * The trip hops island to island and ends in Jakarta. "Jail" is a macet (traffic jam), the jackpot is the arisan pot,
 * and the wheel is the pasar malam.
 */
export const SPACES: Space[] = [
  { kind: "start", name: "Start" },
  lot("Merauke", 0, 60), bonus, lot("Jayapura", 0, 60), hub("Pelabuhan", "⛴️"), lot("Ambon", 1, 100),
  surprise, lot("Kupang", 1, 100), lot("Labuan Bajo", 1, 120), lot("Manado", 2, 140), lot("Makassar", 2, 160),
  { kind: "jail", name: "Macet" },
  lot("Banjarmasin", 3, 180), lot("Pontianak", 3, 180), hub("Bandara", "✈️"), lot("Balikpapan", 3, 200), { kind: "tax", name: "Pajak" },
  { kind: "jackpot", name: "Arisan" },
  lot("Padang", 4, 220), surprise, lot("Palembang", 4, 220), lot("Medan", 4, 240), hub("Stasiun", "🚆"),
  lot("Lombok", 5, 260), bonus, lot("Bali", 5, 280), lot("Yogyakarta", 6, 300), lot("Bandung", 6, 300),
  { kind: "wheel", name: "Pasar Malam" },
  lot("Surabaya", 6, 320), surprise, hub("Terminal", "🚌"), lot("Kota Tua", 7, 350), lot("Menteng", 7, 400),
];
export const N = SPACES.length; // 34
export const JAIL = SPACES.findIndex((s) => s.kind === "jail");
export const COLS = 7;
export const ROWS = 12;

/** Where space `i` sits on the 7×12 grid. */
export function cellOf(i: number): { col: number; row: number } {
  if (i <= 11) return { col: 6, row: i };
  if (i <= 17) return { col: 17 - i, row: 11 };
  if (i <= 28) return { col: 0, row: 28 - i };
  return { col: i - 28, row: 0 };
}

export const HUB_RENT = [0, 40, 80, 140, 220]; // by how many transport hubs the owner has
const LOT_RENT = [0.15, 0.45, 0.9, 1.6]; // share of the price, by level
/** Rent on a lot at a building level, before the full-colour double. */
export const baseRent = (i: number, level: number) => Math.round((priceOf(i) * LOT_RENT[level]) / 5) * 5;

export const priceOf = (i: number) => {
  const s = SPACES[i];
  return s.kind === "lot" || s.kind === "hub" ? s.price : 0;
};
export const buildCost = (i: number) => Math.round(priceOf(i) / 2);
const groupOf = (i: number) => {
  const s = SPACES[i];
  return s.kind === "lot" ? s.group : -1;
};
const sameGroup = (i: number) => SPACES.map((_, k) => k).filter((k) => groupOf(i) >= 0 && groupOf(k) === groupOf(i));

// ---------- The game ----------
export type BoomEvent = {
  n: number;
  kind: "roll" | "buy" | "build" | "rent" | "tax" | "bonus" | "card" | "jackpot" | "wheel" | "jail" | "skip" | "sold" | "bankrupt" | "left" | "lap";
  by: Seat;
  dice?: [number, number];
  from?: number;
  to?: number;
  tile?: number;
  amount?: number;
  other?: Seat;
  text?: string;
};

export interface BoomGame {
  seq: number;
  evn: number;
  players: Seat[];
  out: Seat[]; // bankrupt or left; their turns are skipped
  cash: Record<string, number>;
  pos: Record<string, number>;
  jail: Record<string, number>; // turns still to miss
  owner: (Seat | null)[];
  level: number[];
  pot: number;
  turn: Seat;
  phase: "roll" | "buy" | "build";
  streak: number; // doubles in a row
  again: boolean; // rolled doubles: same player rolls again
  round: number;
  maxRounds: number;
  log: BoomEvent[];
  busy: number; // ms of animation the latest move needs before anyone can act
  deadline?: number;
  sched?: number;
  done?: { winners: Seat[]; reason: "rounds" | "last" | "left"; worth: Record<string, number> };
}

export type Rng = () => number;

/** How long the phone spends showing one event. The server waits this long before the next deadline starts. */
export function eventMs(e: BoomEvent): number {
  if (e.kind === "roll") return 900 + ((e.to! - e.from! + N) % N) * 190;
  if (e.kind === "lap") return 0;
  if (e.kind === "sold") return 500;
  return 1100;
}

export function newGame(players: Seat[], maxRounds: number, now: number, lead = 0): BoomGame {
  const g: BoomGame = {
    seq: 0,
    evn: 0,
    players,
    out: [],
    cash: Object.fromEntries(players.map((p) => [p, START_CASH])),
    pos: Object.fromEntries(players.map((p) => [p, 0])),
    jail: Object.fromEntries(players.map((p) => [p, 0])),
    owner: Array(N).fill(null),
    level: Array(N).fill(0),
    pot: POT_SEED,
    turn: players[0],
    phase: "roll",
    streak: 0,
    again: false,
    round: 1,
    maxRounds,
    log: [],
    busy: 0,
  };
  g.deadline = now + lead + (isBot(g.turn) ? BOT_MS : ROLL_MS);
  return g;
}

export const active = (g: BoomGame) => g.players.filter((p) => !g.out.includes(p));

function note(g: BoomGame, e: Omit<BoomEvent, "n">) {
  const full: BoomEvent = { ...e, n: ++g.evn };
  g.busy += eventMs(full);
  g.log = [...g.log, full].slice(-40);
  return full;
}

export function ownsGroup(g: BoomGame, i: number) {
  const o = g.owner[i];
  return !!o && groupOf(i) >= 0 && sameGroup(i).every((k) => g.owner[k] === o);
}

export function rentOf(g: BoomGame, i: number): number {
  const s = SPACES[i];
  const o = g.owner[i];
  if (!o) return 0;
  if (s.kind === "hub") return HUB_RENT[SPACES.filter((x, k) => x.kind === "hub" && g.owner[k] === o).length];
  if (s.kind !== "lot") return 0;
  const base = baseRent(i, g.level[i]);
  return ownsGroup(g, i) ? base * 2 : base;
}

/** What a space is worth to its owner: what they paid for the land and everything built on it. */
const invested = (g: BoomGame, i: number) => priceOf(i) + g.level[i] * buildCost(i);
const saleValue = (g: BoomGame, i: number) => Math.round(invested(g, i) * 0.6);
const holdings = (g: BoomGame, p: Seat) => g.owner.map((o, i) => (o === p ? i : -1)).filter((i) => i >= 0);
export const worthOf = (g: BoomGame, p: Seat) => g.cash[p] + holdings(g, p).reduce((a, i) => a + invested(g, i), 0);

/**
 * Take `amount` from a player. If they're short, their cheapest spaces are sold back to the bank;
 * if that still isn't enough they pay what they have and go bankrupt. Returns what was actually paid.
 */
function charge(g: BoomGame, p: Seat, amount: number): number {
  if (g.out.includes(p)) return 0;
  while (g.cash[p] < amount) {
    const mine = holdings(g, p).sort((a, b) => saleValue(g, a) - saleValue(g, b));
    if (!mine.length) break;
    const i = mine[0];
    const got = saleValue(g, i);
    g.cash[p] += got;
    g.owner[i] = null;
    g.level[i] = 0;
    note(g, { kind: "sold", by: p, tile: i, amount: got });
  }
  const paid = Math.min(amount, g.cash[p]);
  g.cash[p] -= paid;
  if (paid < amount) {
    g.out = [...g.out, p];
    note(g, { kind: "bankrupt", by: p });
  }
  return paid;
}

function sendToJail(g: BoomGame, p: Seat) {
  g.pos[p] = JAIL;
  g.jail[p] = 1;
  g.again = false;
  g.streak = 0;
  note(g, { kind: "jail", by: p, to: JAIL });
}

type Card = { text: string; run: (g: BoomGame, p: Seat) => number };
const others = (g: BoomGame, p: Seat) => active(g).filter((x) => x !== p);
const toPot = (g: BoomGame, p: Seat, n: number) => {
  const paid = charge(g, p, n);
  g.pot += paid;
  return -paid;
};
export const CARDS: Card[] = [
  { text: "Your nasi goreng stall went viral.", run: (g, p) => ((g.cash[p] += 100), 100) },
  { text: "You won the panjat pinang on 17 Agustus.", run: (g, p) => ((g.cash[p] += 60), 60) },
  { text: "A bumper durian harvest.", run: (g, p) => ((g.cash[p] += 150), 150) },
  { text: "Ticketed for riding without a helmet.", run: (g, p) => toPot(g, p, 80) },
  { text: "Your motor needs a servis.", run: (g, p) => toPot(g, p, 60) },
  {
    text: "It's your kondangan! Everyone brings an envelope.",
    run: (g, p) => {
      let got = 0;
      for (const o of others(g, p)) got += charge(g, o, 40);
      g.cash[p] += got;
      return got;
    },
  },
  {
    text: "Your birthday, so you traktir everyone bakso.",
    run: (g, p) => {
      let paid = 0;
      for (const o of others(g, p)) {
        const x = charge(g, p, 25);
        g.cash[o] += x;
        paid += x;
      }
      return -paid;
    },
  },
  { text: "Rainy season! Fix the roof on every building you own.", run: (g, p) => toPot(g, p, 30 * holdings(g, p).reduce((a, i) => a + g.level[i], 0)) },
  {
    text: "Mudik! A free ride home to Start.",
    run: (g, p) => {
      g.pos[p] = 0;
      g.cash[p] += LAP_BONUS;
      return LAP_BONUS;
    },
  },
  { text: "Banjir on the toll road. You're stuck in macet!", run: (g, p) => (sendToJail(g, p), 0) },
];

export const WHEEL: { text: string; amount: number; jail?: boolean }[] = [
  { text: "Your martabak sold out!", amount: 300 },
  { text: "You won the ring toss.", amount: 150 },
  { text: "Found some change.", amount: 50 },
  { text: "Too many snacks.", amount: -50 },
  { text: "Lost at the game stalls.", amount: -120 },
  { text: "Parking chaos. Stuck in macet!", amount: 0, jail: true },
];

const pick = <T,>(xs: T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];

/** What happens on the space you stopped on. May leave the game waiting for a buy or build choice. */
function land(g: BoomGame, p: Seat, rng: Rng) {
  const i = g.pos[p];
  const s = SPACES[i];
  if (s.kind === "lot" || s.kind === "hub") {
    const o = g.owner[i];
    if (!o) {
      if (g.cash[p] >= s.price) g.phase = "buy";
    } else if (o === p) {
      if (s.kind === "lot" && g.level[i] < MAX_LEVEL && g.cash[p] >= buildCost(i)) g.phase = "build";
    } else {
      const paid = charge(g, p, rentOf(g, i));
      g.cash[o] += paid;
      note(g, { kind: "rent", by: p, other: o, tile: i, amount: paid });
    }
  } else if (s.kind === "tax") {
    const paid = charge(g, p, TAX);
    g.pot += paid;
    note(g, { kind: "tax", by: p, amount: paid });
  } else if (s.kind === "bonus") {
    const amount = 50 + Math.floor(rng() * 4) * 50;
    g.cash[p] += amount;
    note(g, { kind: "bonus", by: p, amount });
  } else if (s.kind === "jackpot") {
    const amount = g.pot;
    g.cash[p] += amount;
    g.pot = POT_SEED;
    note(g, { kind: "jackpot", by: p, amount });
  } else if (s.kind === "wheel") {
    const w = pick(WHEEL, rng);
    const amount = w.amount < 0 ? toPot(g, p, -w.amount) : w.amount;
    if (w.amount > 0) g.cash[p] += w.amount;
    note(g, { kind: "wheel", by: p, text: w.text, amount });
    if (w.jail) sendToJail(g, p);
  } else if (s.kind === "surprise") {
    const card = pick(CARDS, rng);
    // The card shows first, then whatever it caused (sales, jail).
    const e = note(g, { kind: "card", by: p, text: card.text });
    e.amount = card.run(g, p);
    if (g.pos[p] !== i) e.to = g.pos[p];
  }
}

function finish(g: BoomGame, reason: "rounds" | "last" | "left") {
  const left = active(g);
  const worth = Object.fromEntries(g.players.map((p) => [p, g.out.includes(p) ? 0 : worthOf(g, p)]));
  const top = Math.max(...left.map((p) => worth[p]));
  g.deadline = undefined;
  g.done = { winners: left.filter((p) => worth[p] === top), reason, worth };
}

/** The game ends when one player is left standing, or only bots are. */
function checkEnd(g: BoomGame) {
  const left = active(g);
  if (left.length < 2) finish(g, "last");
  else if (!left.some((p) => !isBot(p))) finish(g, "left");
  return !!g.done;
}

/** Close out the current move: end the game, wait for a choice, roll again, or pass the dice. */
function settle(g: BoomGame, now: number) {
  if (checkEnd(g)) return;
  const stillIn = !g.out.includes(g.turn);
  if (!stillIn) g.phase = "roll";
  if (g.phase === "roll" && !(stillIn && g.again)) {
    g.streak = 0;
    // Pass the dice; anyone in jail misses this turn.
    for (let guard = 0; guard < g.players.length * 2; guard++) {
      let k = g.players.indexOf(g.turn);
      do {
        k = (k + 1) % g.players.length;
        if (k === 0) g.round += 1;
      } while (g.out.includes(g.players[k]));
      g.turn = g.players[k];
      if (g.round > g.maxRounds) return finish(g, "rounds");
      if (g.jail[g.turn] > 0) {
        g.jail[g.turn] -= 1;
        note(g, { kind: "skip", by: g.turn });
        continue;
      }
      break;
    }
  }
  if (g.phase === "roll") g.again = false;
  const wait = isBot(g.turn) ? BOT_MS : g.phase === "roll" ? ROLL_MS : CHOICE_MS;
  g.deadline = now + g.busy + wait;
}

export function roll(g: BoomGame, rng: Rng, now: number) {
  if (g.done || g.phase !== "roll") return;
  g.busy = 0;
  const p = g.turn;
  const dice: [number, number] = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
  const double = dice[0] === dice[1];
  g.streak = double ? g.streak + 1 : 0;
  if (g.streak >= 3) {
    // Three doubles in a row: no move, straight to jail.
    note(g, { kind: "roll", by: p, dice, from: g.pos[p], to: g.pos[p] });
    sendToJail(g, p);
    return settle(g, now);
  }
  const from = g.pos[p];
  const to = (from + dice[0] + dice[1]) % N;
  g.pos[p] = to;
  g.again = double;
  note(g, { kind: "roll", by: p, dice, from, to });
  if (to < from) {
    g.cash[p] += LAP_BONUS;
    note(g, { kind: "lap", by: p, amount: LAP_BONUS });
  }
  land(g, p, rng);
  settle(g, now);
}

/** Answer the buy or build offer for the space you're standing on. */
export function choose(g: BoomGame, yes: boolean, now: number) {
  if (g.done || g.phase === "roll") return;
  g.busy = 0;
  const p = g.turn;
  const i = g.pos[p];
  if (yes && g.phase === "buy" && g.cash[p] >= priceOf(i)) {
    g.cash[p] -= priceOf(i);
    g.owner[i] = p;
    note(g, { kind: "buy", by: p, tile: i, amount: priceOf(i) });
  } else if (yes && g.phase === "build" && g.cash[p] >= buildCost(i)) {
    g.cash[p] -= buildCost(i);
    g.level[i] += 1;
    note(g, { kind: "build", by: p, tile: i, amount: buildCost(i) });
  }
  g.phase = "roll";
  settle(g, now);
}

/** Bots keep a cushion: they buy with $150 to spare and build with $250 to spare. */
export function botWants(g: BoomGame): boolean {
  const i = g.pos[g.turn];
  if (g.phase === "buy") return g.cash[g.turn] - priceOf(i) >= 150;
  return g.cash[g.turn] - buildCost(i) >= 250;
}

/** The turn clock ran out (or it's a bot's turn): roll for them, and turn down any offer a person ignored. */
export function onDeadline(g: BoomGame, rng: Rng, now: number) {
  if (g.phase === "roll") return roll(g, rng, now);
  choose(g, isBot(g.turn) ? botWants(g) : false, now);
}

/** A player walks away: the bank takes back everything they own. */
export function leaveGame(g: BoomGame, p: Seat, now: number) {
  if (g.done || !g.players.includes(p) || g.out.includes(p)) return;
  g.busy = 0;
  for (const i of holdings(g, p)) {
    g.owner[i] = null;
    g.level[i] = 0;
  }
  g.out = [...g.out, p];
  note(g, { kind: "left", by: p });
  // Someone else's turn carries on with the clock it had.
  if (g.turn !== p) return void checkEnd(g);
  g.phase = "roll";
  g.again = false;
  settle(g, now);
}
