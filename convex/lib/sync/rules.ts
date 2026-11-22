// In Sync: a game for two. Both answer the same question in secret, and guess what the
// other answered. The reveal shows how well you know each other, and a prompt gets you talking.
// Twice a game, one of you writes your own question for the other.
// Pure rules, shared by server and client.

import { QUESTIONS, questionById, type DeckId, type Question } from "./deck";

export const LENGTHS = [8, 12, 16] as const;
export const OPEN_LEN = 140;
export const ASK_Q_LEN = 80;
export const ASK_OPT_LEN = 28;
export const REACTIONS = ["❤️", "😂", "😮", "🙈", "🥺", "🔥"] as const;
export const MAX_REACTIONS = 30;

/** pick: option index · scale: 0–10 · rank: item indexes, favourite first · who: a player id · open: text */
export type Value = number | number[] | string;
export type Entry = { me?: Value; guess?: Value };
export type Custom = { q: string; options: string[] };
/** A throwback re-asks a question you answered in an earlier game. */
export type Throwback = { at: number; answers: Record<string, Value> };
export type Card = { qid?: string; ask?: string; custom?: Custom; throwback?: Throwback };
export type Result = { card: Card; entries: Record<string, Entry>; scores: Record<string, number | null>; sync: number | null };
export type Memory = { qid: string; at: number; answers: Record<string, Value> };

export type SyncGame = {
  seq: number;
  players: [string, string];
  decks: DeckId[];
  cards: Card[];
  i: number;
  phase: "write" | "answer" | "reveal";
  entries: Record<string, Entry>;
  ready: string[];
  reactions: { by: string; e: string; n: number }[];
  results: Result[];
  done?: { reason: "end" | "left" };
};

type Rng = () => number;

// ---------- Questions ----------
const ASK_TALK = "Why that question? 😏";

/** The question a card shows. Your-own-question cards become a "pick" question. */
export function questionOf(card: Card): Question | null {
  if (card.qid) return questionById(card.qid) ?? null;
  if (card.custom) return { id: "ask", deck: "light", type: "pick", q: card.custom.q, options: card.custom.options, talk: ASK_TALK };
  return null;
}

export const guessable = (q: Question) => q.type === "pick" || q.type === "scale" || q.type === "rank";

/** What a player has to fill in for this card. */
export function needs(card: Card, q: Question | null, player: string): { me: boolean; guess: boolean } {
  if (card.ask) return { me: card.ask !== player, guess: card.ask === player };
  if (!q) return { me: false, guess: false };
  return { me: true, guess: guessable(q) };
}

function shuffle<T>(xs: T[], rng: Rng) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The cards for a game: questions you haven't seen as a pair come first, open questions
 * are limited, the same kind of question rarely comes twice in a row, one throwback when
 * there's a past answer to revisit, and (if `own`) two "ask your own question" cards.
 */
export function buildCards(rng: Rng, decks: DeckId[], length: number, seen: string[], memories: Memory[], own: boolean, players: [string, string]): Card[] {
  const pool = QUESTIONS.filter((q) => decks.includes(q.deck));
  const fresh = shuffle(pool.filter((q) => !seen.includes(q.id)), rng);
  const old = shuffle(pool.filter((q) => seen.includes(q.id)), rng);
  const asks = own && length >= 8 ? 2 : 0;
  const pastOnes = memories.filter((m) => { const q = questionById(m.qid); return !!q && (guessable(q) || q.type === "who"); });
  const throwback = length >= 8 && pastOnes.length ? pastOnes[Math.floor(rng() * pastOnes.length)] : null;
  const want = length - asks - (throwback ? 1 : 0);
  const maxOpen = Math.floor(length / 4);
  const chosen: Question[] = [];
  let opens = 0;
  for (const q of [...fresh, ...old]) {
    if (chosen.length >= want) break;
    if (throwback && q.id === throwback.qid) continue;
    if (q.type === "open") { if (opens >= maxOpen) continue; opens++; }
    chosen.push(q);
  }
  // Spread kinds out: always take the next question that isn't the same kind as the last one.
  const ordered: Question[] = [];
  const left = [...chosen];
  while (left.length) {
    const k = left.findIndex((q) => q.type !== ordered.at(-1)?.type);
    ordered.push(...left.splice(k < 0 ? 0 : k, 1));
  }
  const cards: Card[] = ordered.map((q) => ({ qid: q.id }));
  if (throwback) cards.splice(Math.min(cards.length, 2 + Math.floor(rng() * Math.max(1, cards.length - 3))), 0, { qid: throwback.qid, throwback: { at: throwback.at, answers: throwback.answers } });
  if (asks) {
    cards.splice(Math.round(length / 3), 0, { ask: players[0] });
    cards.splice(Math.round((2 * length) / 3), 0, { ask: players[1] });
  }
  return cards.slice(0, length);
}

// ---------- Answers ----------
export function validValue(q: Question, v: unknown, players: string[]): v is Value {
  switch (q.type) {
    case "pick": return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < q.options.length;
    case "scale": return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10;
    case "rank": return Array.isArray(v) && v.length === q.items.length && new Set(v).size === v.length && v.every((x) => Number.isInteger(x) && x >= 0 && x < q.items.length);
    case "who": return typeof v === "string" && players.includes(v);
    case "open": return typeof v === "string" && v.trim().length > 0 && v.length <= OPEN_LEN;
  }
}

/** 0–1: how close a guess is to the real answer. */
export function guessScore(q: Question, guess: Value | undefined, actual: Value | undefined): number {
  if (guess === undefined || actual === undefined) return 0;
  if (q.type === "pick") return guess === actual ? 1 : 0;
  if (q.type === "scale") return Math.max(0, 1 - Math.abs((guess as number) - (actual as number)) / 4);
  if (q.type === "rank") {
    const g = guess as number[], a = actual as number[];
    const off = a.reduce((sum, item, pos) => sum + Math.abs(g.indexOf(item) - pos), 0);
    const worst = Math.floor((a.length * a.length) / 2);
    return Math.max(0, 1 - off / worst);
  }
  return 0;
}

export const partnerOf = (g: { players: string[] }, p: string) => g.players.find((x) => x !== p)!;

/** Everything both players needed to fill in is in. */
function complete(g: SyncGame, q: Question) {
  const card = g.cards[g.i];
  return g.players.every((p) => {
    const n = needs(card, q, p), e = g.entries[p];
    return (!n.me || e?.me !== undefined) && (!n.guess || e?.guess !== undefined);
  });
}

/** A player locks in their answer (and guess). Shows the reveal when both are in. */
export function submit(g: SyncGame, player: string, entry: Entry): string | null {
  if (g.done || g.phase !== "answer") return "Not now";
  const card = g.cards[g.i];
  const q = questionOf(card);
  if (!q) return "No question";
  const n = needs(card, q, player);
  if (n.me && !validValue(q, entry.me, g.players)) return "Pick an answer first";
  if (n.guess && !validValue(q, entry.guess, g.players)) return "Make a guess first";
  if (g.entries[player]) return "Already locked in";
  const clean: Entry = {};
  if (n.me) clean.me = typeof entry.me === "string" && q.type === "open" ? entry.me.trim() : entry.me;
  if (n.guess) clean.guess = entry.guess;
  g.entries[player] = clean;
  if (complete(g, q)) reveal(g, q);
  return null;
}

function reveal(g: SyncGame, q: Question) {
  const card = g.cards[g.i];
  const [a, b] = g.players;
  const scores: Record<string, number | null> = { [a]: null, [b]: null };
  let sync: number | null = null;
  if (card.ask) {
    const answerer = partnerOf(g, card.ask);
    scores[card.ask] = guessScore(q, g.entries[card.ask]?.guess, g.entries[answerer]?.me);
    sync = scores[card.ask];
  } else if (q.type === "who") {
    // In sync when you both name the same person.
    sync = g.entries[a]?.me === g.entries[b]?.me ? 1 : 0;
  } else if (guessable(q)) {
    scores[a] = guessScore(q, g.entries[a]?.guess, g.entries[b]?.me);
    scores[b] = guessScore(q, g.entries[b]?.guess, g.entries[a]?.me);
    sync = (scores[a]! + scores[b]!) / 2;
  }
  g.results.push({ card: { ...card }, entries: { ...g.entries }, scores, sync });
  g.phase = "reveal";
  g.ready = [];
  g.reactions = [];
}

/** The asker writes their own question for the other. */
export function writeQuestion(g: SyncGame, player: string, custom: Custom): string | null {
  const card = g.cards[g.i];
  if (g.done || g.phase !== "write" || card.ask !== player) return "Not your turn to ask";
  const q = custom.q.replace(/\s+/g, " ").trim().slice(0, ASK_Q_LEN);
  const options = custom.options.map((o) => o.replace(/\s+/g, " ").trim().slice(0, ASK_OPT_LEN)).filter(Boolean);
  if (!q) return "Write a question";
  if (options.length < 2 || options.length > 4) return "Give 2 to 4 answers";
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return "Answers must be different";
  card.custom = { q, options };
  g.phase = "answer";
  return null;
}

/** A player is ready for the next card. When both are, move on. */
export function ready(g: SyncGame, player: string) {
  if (g.done || g.phase !== "reveal" || g.ready.includes(player)) return;
  g.ready.push(player);
  if (g.players.every((p) => g.ready.includes(p))) advance(g);
}

function advance(g: SyncGame) {
  g.i += 1;
  g.entries = {};
  g.ready = [];
  g.reactions = [];
  if (g.i >= g.cards.length) {
    g.done = { reason: "end" };
    return;
  }
  g.phase = g.cards[g.i].ask ? "write" : "answer";
}

export function react(g: SyncGame, player: string, e: string) {
  if (!(REACTIONS as readonly string[]).includes(e)) return;
  const n = (g.reactions.at(-1)?.n ?? 0) + 1;
  g.reactions = [...g.reactions, { by: player, e, n }].slice(-MAX_REACTIONS);
}

export function newGame(players: [string, string], decks: DeckId[], length: number, own: boolean, seen: string[], memories: Memory[], rng: Rng): SyncGame {
  const cards = buildCards(rng, decks, length, seen, memories, own, players);
  return { seq: 0, players, decks, cards, i: 0, phase: cards[0]?.ask ? "write" : "answer", entries: {}, ready: [], reactions: [], results: [] };
}

// ---------- Results ----------
/** 0–100: how in sync you were across the game. */
export function syncPercent(results: Result[]) {
  const s = results.map((r) => r.sync).filter((x): x is number => x !== null);
  return s.length ? Math.round((100 * s.reduce((a, b) => a + b, 0)) / s.length) : 0;
}

/** 0–100: how well `p` guessed the other's answers. */
export function knowsPercent(results: Result[], p: string) {
  const s = results.map((r) => r.scores[p]).filter((x): x is number => x !== null && x !== undefined);
  return s.length ? Math.round((100 * s.reduce((a, b) => a + b, 0)) / s.length) : 0;
}

/** Answers worth remembering for a throwback next time. */
export function memoriesFrom(results: Result[], at: number): Memory[] {
  return results
    .filter((r) => r.card.qid && !r.card.ask)
    .map((r) => ({ qid: r.card.qid!, at, answers: Object.fromEntries(Object.entries(r.entries).filter(([, e]) => e.me !== undefined).map(([p, e]) => [p, e.me!])) }))
    .filter((m) => { const q = questionById(m.qid); return !!q && q.type !== "open" && Object.keys(m.answers).length === 2; });
}

export function verdict(sync: number | null) {
  if (sync === null) return null;
  if (sync >= 0.99) return "Totally in sync! 🎯";
  if (sync >= 0.7) return "So close! 💞";
  if (sync >= 0.4) return "Half right 🤏";
  return "Plot twist! 😳";
}
