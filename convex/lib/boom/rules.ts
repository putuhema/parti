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
export const DILEMMA_MS = 18_000; // time to pick a side on a Kejutan dilemma, plus the QTE
export const QTE_MS = 3_000; // how long the timing bar runs before it counts as a miss
export const LOBBY_FEE = 50; // what it costs to try to lobby your way out of Diperiksa
export const MASH_MS = 2_000; // how long you get to mash
export const MASH_CAP = 16; // taps per second a thumb can plausibly manage; more than that is counted as this
export const HOLD_FILL_MS = 1_100; // how long the haggling meter takes to fill
export const NEGO_DEAL = 0.7; // haggle well: pay this share of the rent
export const NEGO_OVER = 1.2; // push too hard: the owner takes offence and charges this much
/** Taps needed to lobby out of Diperiksa: it gets a little harder as the game goes on. */
export const mashTarget = (round: number) => 10 + Math.min(4, Math.floor(round / 5));
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
const bonus: Space = { kind: "bonus", name: "Serangan Fajar" };

/**
 * Clockwise from START in the top-right corner: down the right side, along the bottom, up the left, across the top.
 * The trip hops island to island and ends in Jakarta. The joke spaces are gentle political satire (generic tropes,
 * never real people): "jail" is Diperiksa (called in for questioning), the jackpot is the Dana Aspirasi pot,
 * tax is Pungli, the bonus is a Serangan Fajar envelope, and the wheel is a Kampanye rally.
 */
export const SPACES: Space[] = [
  { kind: "start", name: "Start" },
  lot("Merauke", 0, 60), bonus, lot("Jayapura", 0, 60), hub("Pelabuhan", "⛴️"), lot("Ambon", 1, 100),
  surprise, lot("Kupang", 1, 100), lot("Labuan Bajo", 1, 120), lot("Manado", 2, 140), lot("Makassar", 2, 160),
  { kind: "jail", name: "Diperiksa" },
  lot("Banjarmasin", 3, 180), lot("Pontianak", 3, 180), hub("Bandara", "✈️"), lot("Balikpapan", 3, 200), { kind: "tax", name: "Pungli" },
  { kind: "jackpot", name: "Dana Aspirasi" },
  lot("Padang", 4, 220), surprise, lot("Palembang", 4, 220), lot("Medan", 4, 240), hub("Stasiun", "🚆"),
  lot("Lombok", 5, 260), bonus, lot("Bali", 5, 280), lot("Yogyakarta", 6, 300), lot("Bandung", 6, 300),
  { kind: "wheel", name: "Kampanye" },
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
  kind: "roll" | "buy" | "build" | "rent" | "tax" | "bonus" | "card" | "jackpot" | "wheel" | "jail" | "skip" | "lobby" | "sold" | "bankrupt" | "left" | "lap";
  by: Seat;
  dice?: [number, number];
  from?: number;
  to?: number;
  tile?: number;
  amount?: number;
  other?: Seat;
  text?: string;
  art?: Art; // which acted-out scene goes with a card or wheel result
  // A Kejutan dilemma: the option picked, and for the risky one how the QTE went (so phones can replay it).
  choice?: string;
  risky?: boolean;
  success?: boolean;
  note?: string;
  qte?: Qte;
  ms?: number;
  // Lobbying out of Diperiksa: taps landed against the target.
  taps?: number;
  target?: number;
  // A rent haggle: how it went and where the meter stopped.
  nego?: { result: "deal" | "full" | "over"; level: number; lo: number; hi: number; rent: number };
};

/**
 * The timing QTE on a risky choice: a needle sweeps back and forth along a bar, and you tap while it's in
 * the zone. The phone sends only how many ms after the bar appeared you tapped; the server works out where
 * the needle was, so a modified phone can't just claim a hit and network lag doesn't matter.
 */
export type Qte = { card: number; c: number; w: number; period: number; phase: number };
/** A pending rent haggle: release the meter between lo and hi (shares of full) for the deal. */
export type Nego = { tile: number; owner: Seat; rent: number; lo: number; hi: number };
/** Where the haggling meter is after holding for `ms`. */
export const holdLevel = (ms: number) => Math.max(0, ms) / HOLD_FILL_MS;
export const negoResult = (n: Nego, holdMs: number): "deal" | "full" | "over" => {
  const l = holdLevel(holdMs);
  return l > n.hi ? "over" : l >= n.lo ? "deal" : "full";
};
export function qtePos(q: Qte, ms: number) {
  const u = (((ms / q.period + q.phase) % 1) + 1) % 1;
  return u < 0.5 ? u * 2 : 2 - u * 2;
}
export const qteHit = (q: Qte, ms: number) => ms >= 0 && ms <= QTE_MS && Math.abs(qtePos(q, ms) - q.c) <= q.w / 2;
/** A fresh bar: the zone lands somewhere in the middle and narrows as the game goes on. */
function newQte(card: number, round: number, rng: Rng): Qte {
  return { card, c: 0.25 + rng() * 0.5, w: Math.max(0.12, 0.26 - 0.006 * (round - 1)), period: 1300 + Math.floor(rng() * 300), phase: rng() };
}

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
  phase: "roll" | "buy" | "build" | "dilemma" | "jailed" | "rent";
  streak: number; // doubles in a row
  again: boolean; // rolled doubles: same player rolls again
  round: number;
  maxRounds: number;
  log: BoomEvent[];
  qte?: Qte; // the Kejutan dilemma waiting on the player whose turn it is
  nego?: Nego; // the rent waiting on the player whose turn it is (pay, or haggle)
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
  if (e.kind === "card" && e.risky) return 2700; // time to replay the needle and stamp the result
  if (e.kind === "rent" && e.nego) return 2500; // replay the haggling meter
  if (e.kind === "lobby") return 2300; // replay the mash count
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

/**
 * The scenes the phone can act out with stick figures. Kejutan cards and Kampanye results are gentle
 * Indonesian political satire in Bahasa Indonesia: generic tropes only, never real, named people.
 */
export type Art =
  | "baliho" | "pita" | "orangdalam" | "tidur" | "studibanding" | "amplop" | "sembako" | "mangkrak"
  | "mobildinas" | "ott" | "meme" | "blusukan" | "joget" | "sponsor" | "kaos" | "audit";

/** What an option does: money (positive to you, negative into the pot) and maybe a trip to Diperiksa. */
export type Outcome = { amount: number; jail?: boolean; note?: string };
export type Dilemma = { safe: { label: string; out: Outcome }; risky: { label: string; win: Outcome; lose: Outcome } };
type Card = { text: string; art: Art; run?: (g: BoomGame, p: Seat) => number; dilemma?: Dilemma };
const others = (g: BoomGame, p: Seat) => active(g).filter((x) => x !== p);
const toPot = (g: BoomGame, p: Seat, n: number) => {
  const paid = charge(g, p, n);
  g.pot += paid;
  return -paid;
};
const dilemma = (safe: [string, Outcome], risky: string, win: Outcome, lose: Outcome): Dilemma => ({ safe: { label: safe[0], out: safe[1] }, risky: { label: risky, win, lose } });

/**
 * Most Kejutan cards are dilemmas: a safe choice, or a risky one that pays off only if you nail a timing QTE.
 * A few still just happen to you, for variety.
 */
export const CARDS: Card[] = [
  { art: "baliho", text: "Musim kampanye! Mau pasang baliho di mana?", dilemma: dilemma(["Satu di depan rumah", { amount: 50 }], "Di semua tiang listrik", { amount: 150, note: "Wajahmu ada di mana-mana!" }, { amount: -100, note: "Satpol PP menurunkan semuanya." }) },
  { art: "pita", text: "Jembatan baru 80% jadi, tapi wartawan sudah datang.", dilemma: dilemma(["Tunda peresmian", { amount: 0 }], "Gunting pita sekarang", { amount: 120, note: "Fotonya masuk koran!" }, { amount: -80, note: "Jembatannya goyang pas difoto." }) },
  { art: "orangdalam", text: "Tender jalan tol dibuka.", dilemma: dilemma(["Ikut lelang jujur", { amount: 60 }], "Telepon orang dalam", { amount: 200, note: "Proyek jatuh ke keponakanmu!" }, { amount: -50, jail: true, note: "Ketahuan! Kamu diperiksa." }) },
  { art: "meme", text: "Fotomu jadi meme nasional.", dilemma: dilemma(["Diamkan saja", { amount: 30 }], "Jual kaosnya", { amount: 120, note: "Kaosnya laris manis!" }, { amount: -60, note: "Stok kaos tak laku." }) },
  { art: "tidur", text: "Rapat paripurna membosankan sekali.", dilemma: dilemma(["Tahan kantuk", { amount: 0 }], "Tidur sebentar", { amount: 40, note: "Tak ada yang lihat." }, { amount: -120, note: "Viral, kena denda!" }) },
  { art: "studibanding", text: "Ada undangan studi banding ke luar negeri.", dilemma: dilemma(["Tolak dengan sopan", { amount: 0 }], "Berangkat!", { amount: 100, note: "Uang sakunya lumayan." }, { amount: -120, note: "Ketahuan cuma belanja." }) },
  { art: "blusukan", text: "Tim medsos minta konten blusukan.", dilemma: dilemma(["Tidak usah", { amount: 0 }], "Masuk gang becek", { amount: 100, note: "Masuk FYP!" }, { amount: -60, note: "Sepatu mahalmu masuk got." }) },
  { art: "ott", text: "Ada tamu dari KPK di depan pintu!", dilemma: dilemma(["Kooperatif", { amount: 0, jail: true }], "Kabur lewat jendela", { amount: 0, note: "Lolos! Kali ini…" }, { amount: -100, jail: true, note: "Tertangkap di pagar." }) },
  {
    art: "amplop",
    text: "Syukuran menang pemilu! Semua pemain datang bawa amplop.",
    run: (g, p) => {
      let got = 0;
      for (const o of others(g, p)) got += charge(g, o, 40);
      g.cash[p] += got;
      return got;
    },
  },
  {
    art: "sembako",
    text: "Jelang pemilu, kamu bagi-bagi sembako ke semua pemain.",
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
  { art: "mangkrak", text: "Proyekmu mangkrak! Bayar perbaikan untuk setiap bangunanmu.", run: (g, p) => toPot(g, p, 30 * holdings(g, p).reduce((a, i) => a + g.level[i], 0)) },
  {
    art: "mobildinas",
    text: "Pulang ke Start naik mobil dinas, bensin ditanggung negara.",
    run: (g, p) => {
      g.pos[p] = 0;
      g.cash[p] += LAP_BONUS;
      return LAP_BONUS;
    },
  },
];

export const WHEEL: { text: string; amount: number; art: Art; jail?: boolean }[] = [
  { art: "sponsor", text: "Kampanyemu ramai, sponsor berdatangan!", amount: 300 },
  { art: "joget", text: "Kamu joget di panggung kampanye, penonton suka.", amount: 150 },
  { art: "amplop", text: "Nemu sisa dana kampanye di laci.", amount: 50 },
  { art: "kaos", text: "Kebanyakan cetak kaos kampanye.", amount: -50 },
  { art: "baliho", text: "Artis kampanye minta bayaran dobel.", amount: -120 },
  { art: "audit", text: "Dana kampanye diaudit. Kamu diperiksa!", amount: 0, jail: true },
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
      // Pay in full, or try to haggle it down.
      const w = Math.max(0.1, 0.2 - 0.004 * (g.round - 1));
      const lo = 0.6 + rng() * 0.15;
      g.nego = { tile: i, owner: o, rent: rentOf(g, i), lo, hi: lo + w };
      g.phase = "rent";
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
    note(g, { kind: "wheel", by: p, text: w.text, art: w.art, amount });
    if (w.jail) sendToJail(g, p);
  } else if (s.kind === "surprise") {
    const k = Math.floor(rng() * CARDS.length);
    const card = CARDS[k];
    if (card.dilemma) {
      // Wait for the player to pick a side (and play the QTE if they go risky).
      g.qte = newQte(k, g.round, rng);
      g.phase = "dilemma";
      return;
    }
    // The card shows first, then whatever it caused (sales, jail).
    const e = note(g, { kind: "card", by: p, text: card.text, art: card.art });
    e.amount = card.run!(g, p);
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
      // Someone in Diperiksa chooses: wait it out, or lobby their way out.
      if (g.jail[g.turn] > 0) g.phase = "jailed";
      break;
    }
  }
  if (g.phase === "roll") g.again = false;
  const wait = isBot(g.turn) ? BOT_MS : g.phase === "roll" ? ROLL_MS : g.phase === "dilemma" ? DILEMMA_MS : CHOICE_MS;
  g.deadline = now + g.busy + wait;
}

/** A jailed player waits (misses this turn) or pays the fee and mashes; enough taps and they roll now. */
export function resolveJail(g: BoomGame, lobby: boolean, taps: number | null, now: number) {
  if (g.done || g.phase !== "jailed") return;
  g.busy = 0;
  const p = g.turn;
  if (lobby) {
    const target = mashTarget(g.round);
    const landed = Math.min(Math.max(0, Math.round(taps ?? 0)), Math.floor((MASH_CAP * MASH_MS) / 1000));
    const success = landed >= target;
    const paid = toPot(g, p, LOBBY_FEE);
    note(g, { kind: "lobby", by: p, taps: landed, target, success, amount: paid });
    if (success && !g.out.includes(p)) {
      g.jail[p] = 0;
      g.phase = "roll";
      g.again = false;
      g.deadline = now + g.busy + (isBot(p) ? BOT_MS : ROLL_MS);
      return;
    }
  }
  g.jail[p] = Math.max(0, g.jail[p] - 1);
  note(g, { kind: "skip", by: p });
  g.phase = "roll";
  g.again = false;
  settle(g, now);
}

/** Pay the rent in full, or haggle: `holdMs` is how long the meter was held before release. */
export function resolveRent(g: BoomGame, haggle: boolean, holdMs: number | null, now: number) {
  if (g.done || g.phase !== "rent" || !g.nego) return;
  g.busy = 0;
  const p = g.turn;
  const n = g.nego;
  let due = n.rent;
  let info: BoomEvent["nego"];
  if (haggle) {
    const ms = holdMs ?? HOLD_FILL_MS * 2; // never let go: the meter tops out
    const result = negoResult(n, ms);
    due = Math.round((n.rent * (result === "deal" ? NEGO_DEAL : result === "over" ? NEGO_OVER : 1)) / 5) * 5;
    info = { result, level: Math.min(1.25, holdLevel(ms)), lo: n.lo, hi: n.hi, rent: n.rent };
  }
  g.nego = undefined;
  g.phase = "roll";
  const paid = charge(g, p, due);
  if (!g.out.includes(n.owner)) g.cash[n.owner] += paid;
  note(g, { kind: "rent", by: p, other: n.owner, tile: n.tile, amount: paid, nego: info });
  settle(g, now);
}

/** Bots: lobby when they can spare it, haggle about half the time, and get it right more often than not. */
export function botJail(g: BoomGame, rng: Rng) {
  const lobby = g.cash[g.turn] > 300 && rng() < 0.55;
  const target = mashTarget(g.round);
  return { lobby, taps: lobby ? (rng() < 0.7 ? target + Math.floor(rng() * 5) : target - 1 - Math.floor(rng() * 4)) : null };
}
export function botRent(g: BoomGame, rng: Rng) {
  const n = g.nego!;
  if (rng() < 0.5) return { haggle: false, holdMs: null };
  const r = rng();
  const level = r < 0.55 ? n.lo + (n.hi - n.lo) * (0.2 + rng() * 0.6) : r < 0.8 ? n.lo * (0.5 + rng() * 0.4) : n.hi + 0.05 + rng() * 0.2;
  return { haggle: true, holdMs: Math.round(level * HOLD_FILL_MS) };
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
  if (g.done || (g.phase !== "buy" && g.phase !== "build")) return;
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

function apply(g: BoomGame, p: Seat, out: Outcome) {
  let amount = 0;
  if (out.amount > 0) { g.cash[p] += out.amount; amount = out.amount; }
  else if (out.amount < 0) amount = toPot(g, p, -out.amount);
  if (out.jail) sendToJail(g, p);
  return amount;
}

/**
 * Settle a Kejutan dilemma. `ms` is when the player tapped, counted from the moment the bar appeared on
 * their phone; no tap (or a late one) is a miss.
 */
export function resolveDilemma(g: BoomGame, risky: boolean, ms: number | null, now: number) {
  if (g.done || g.phase !== "dilemma" || !g.qte) return;
  g.busy = 0;
  const p = g.turn;
  const q = g.qte;
  const card = CARDS[q.card];
  const d = card.dilemma!;
  const from = g.pos[p];
  let out: Outcome, success: boolean | undefined, tapped: number | undefined;
  if (risky) {
    tapped = ms === null ? QTE_MS + 1 : Math.max(0, Math.round(ms));
    success = qteHit(q, tapped);
    out = success ? d.risky.win : d.risky.lose;
  } else out = d.safe.out;
  const e = note(g, { kind: "card", by: p, text: card.text, art: card.art, choice: risky ? d.risky.label : d.safe.label, risky, success, note: out.note, qte: risky ? q : undefined, ms: tapped });
  g.qte = undefined;
  g.phase = "roll";
  e.amount = apply(g, p, out);
  if (g.pos[p] !== from) e.to = g.pos[p];
  settle(g, now);
}

/** Bots go risky when they can afford to lose, and hit the zone about two times in three. */
export function botDilemma(g: BoomGame, rng: Rng) {
  const q = g.qte!;
  const d = CARDS[q.card].dilemma!;
  const risky = g.cash[g.turn] + Math.min(0, d.risky.lose.amount) >= 200 && rng() < 0.6;
  if (!risky) return { risky, ms: null };
  const hit = rng() < 0.65;
  const target = hit ? q.c + (rng() - 0.5) * q.w * 0.8 : Math.min(1, Math.max(0, q.c + (rng() < 0.5 ? -1 : 1) * (q.w / 2 + 0.06 + rng() * 0.2)));
  // Find when the needle passes `target` on its way up.
  const u = target / 2;
  const ms = Math.round((((u - q.phase) % 1) + 1) % 1 * q.period);
  return { risky, ms };
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
  if (g.phase === "dilemma") {
    // A bot decides; a person who let the clock run out takes the safe option.
    const b = isBot(g.turn) ? botDilemma(g, rng) : { risky: false, ms: null };
    return resolveDilemma(g, b.risky, b.ms, now);
  }
  if (g.phase === "jailed") {
    // A person who doesn't answer waits it out.
    const b = isBot(g.turn) ? botJail(g, rng) : { lobby: false, taps: null };
    return resolveJail(g, b.lobby, b.taps, now);
  }
  if (g.phase === "rent") {
    // A person who doesn't answer pays in full.
    const b = isBot(g.turn) ? botRent(g, rng) : { haggle: false, holdMs: null };
    return resolveRent(g, b.haggle, b.holdMs, now);
  }
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
  g.qte = undefined;
  g.nego = undefined;
  g.again = false;
  settle(g, now);
}
