// Truth or Tale: two truths and a lie, for two. Each round has a theme. You both write three
// things about yourself, two true and one made up, then guess which of your partner's is the lie
// and bet 1–3 points on it. After the reveal, ask your partner for the story behind one of their
// truths. Every revealed truth is kept in the pair's Vault. Pure rules, shared by server and client.

export type ThemeId = "childhood" | "food" | "travel" | "oops" | "skills" | "secrets" | "love" | "school" | "random";
export const THEMES: { id: ThemeId; icon: string; name: string; prompt: string; example: string }[] = [
  { id: "childhood", icon: "🧸", name: "Childhood", prompt: "When you were little…", example: "I once got stuck in a tree for an hour" },
  { id: "food", icon: "🍜", name: "Food", prompt: "Things you've eaten, cooked or refuse to eat", example: "I've never tried durian" },
  { id: "travel", icon: "✈️", name: "Places & trips", prompt: "Places you've been, trips gone right or wrong", example: "I missed a flight because I fell asleep at the gate" },
  { id: "oops", icon: "🙈", name: "Embarrassing", prompt: "Moments you'd rather forget", example: "I waved back at someone who was waving at the person behind me" },
  { id: "skills", icon: "🎯", name: "Hidden talents", prompt: "Things you can (or can't) do", example: "I can whistle with my fingers" },
  { id: "secrets", icon: "🤫", name: "Little secrets", prompt: "Small things nobody knows about you", example: "I still sleep with a stuffed animal" },
  { id: "love", icon: "💘", name: "Love & crushes", prompt: "Crushes, dates and romantic moments", example: "My first crush was a cartoon character" },
  { id: "school", icon: "🏫", name: "School & work", prompt: "Classrooms, teachers, jobs and bosses", example: "I was the class president for one week" },
  { id: "random", icon: "🎲", name: "Anything goes", prompt: "Anything at all about you", example: "I've never seen snow" },
];
export const themeOf = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[THEMES.length - 1];

export const ROUND_CHOICES = [3, 5, 7] as const;
export const ITEM_MIN = 4;
export const ITEM_MAX = 120;
export const BETS = [1, 2, 3] as const;

export type Entry = { items: string[]; lie: number; order: number[] };
export type Guess = { pick: number; bet: number }; // pick is an index into the partner's items
export type Result = {
  round: number;
  theme: ThemeId;
  entries: Record<string, Entry>;
  guesses: Record<string, Guess>;
  points: Record<string, number>; // what each player won this round
};

export type TruthGame = {
  seq: number;
  players: [string, string];
  themes: ThemeId[];
  round: number;
  phase: "write" | "guess" | "reveal";
  entries: Record<string, Entry>;
  guesses: Record<string, Guess>;
  asks: Record<string, number>; // which of the partner's truths you want the story behind
  ready: string[];
  scores: Record<string, number>;
  results: Result[];
  done?: { reason: "end" | "left" };
};

type Rng = () => number;
const shuffle = <T,>(xs: T[], rng: Rng) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const partnerOf = (g: { players: string[] }, p: string) => g.players.find((x) => x !== p)!;

/** Themes for each round: the chosen ones, shuffled, cycling if there are more rounds than themes. */
export function newGame(players: [string, string], themes: ThemeId[], rounds: number, rng: Rng): TruthGame {
  const pool = themes.length ? themes : THEMES.map((t) => t.id);
  const order: ThemeId[] = [];
  while (order.length < rounds) order.push(...shuffle(pool, rng));
  return {
    seq: 0, players, themes: order.slice(0, rounds), round: 0, phase: "write", entries: {}, guesses: {}, asks: {}, ready: [],
    scores: Object.fromEntries(players.map((p) => [p, 0])), results: [],
  };
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Write your three statements and say which one is the lie. */
export function write(g: TruthGame, p: string, items: string[], lie: number, rng: Rng): string | null {
  if (g.done || g.phase !== "write") return "Not now";
  if (!g.players.includes(p)) return "You're not playing";
  if (g.entries[p]) return "Already locked in";
  const list = items.map(clean);
  if (list.length !== 3) return "Write three things";
  if (list.some((s) => s.length < ITEM_MIN)) return "Each one needs a few more words";
  if (list.some((s) => s.length > ITEM_MAX)) return "Keep each one shorter";
  if (new Set(list.map((s) => s.toLowerCase())).size !== 3) return "Make all three different";
  if (![0, 1, 2].includes(lie)) return "Mark which one is the lie";
  g.entries[p] = { items: list, lie, order: shuffle([0, 1, 2], rng) };
  if (g.players.every((x) => g.entries[x])) g.phase = "guess";
  return null;
}

/** Guess which of your partner's three is the lie, and bet on it. */
export function guess(g: TruthGame, p: string, pick: number, bet: number): string | null {
  if (g.done || g.phase !== "guess") return "Not now";
  if (!g.players.includes(p)) return "You're not playing";
  if (g.guesses[p]) return "Already guessed";
  if (![0, 1, 2].includes(pick)) return "Pick one";
  if (!(BETS as readonly number[]).includes(bet)) return "Bet 1, 2 or 3";
  g.guesses[p] = { pick, bet };
  if (g.players.every((x) => g.guesses[x])) reveal(g);
  return null;
}

function reveal(g: TruthGame) {
  const points: Record<string, number> = Object.fromEntries(g.players.map((p) => [p, 0]));
  for (const p of g.players) {
    const q = partnerOf(g, p);
    const gs = g.guesses[p];
    // Spot the lie and you win your bet; get fooled and your partner wins it.
    if (gs.pick === g.entries[q].lie) points[p] += gs.bet;
    else points[q] += gs.bet;
  }
  for (const p of g.players) g.scores[p] += points[p];
  g.results.push({ round: g.round, theme: g.themes[g.round], entries: { ...g.entries }, guesses: { ...g.guesses }, points });
  g.phase = "reveal";
  g.ready = [];
  g.asks = {};
}

/** Ask for the story behind one of your partner's truths. */
export function ask(g: TruthGame, p: string, item: number): string | null {
  if (g.done || g.phase !== "reveal") return "Not now";
  const q = partnerOf(g, p);
  if (![0, 1, 2].includes(item) || item === g.entries[q].lie) return "Pick one of their truths";
  g.asks[p] = item;
  return null;
}

export function next(g: TruthGame, p: string) {
  if (g.done || g.phase !== "reveal" || g.ready.includes(p)) return;
  g.ready.push(p);
  if (!g.players.every((x) => g.ready.includes(x))) return;
  g.round += 1;
  g.entries = {};
  g.guesses = {};
  g.asks = {};
  g.ready = [];
  if (g.round >= g.themes.length) g.done = { reason: "end" };
  else g.phase = "write";
}

/** The truths revealed this round, for the Vault. */
export function truthsOf(r: Result) {
  return Object.entries(r.entries).flatMap(([owner, e]) => e.items.filter((_, i) => i !== e.lie).map((text) => ({ owner, text, theme: r.theme })));
}

/** Who fooled whom best, for the end screen. */
export function stats(g: TruthGame) {
  const out = Object.fromEntries(g.players.map((p) => [p, { spotted: 0, fooled: 0 }]));
  for (const r of g.results) for (const p of g.players) {
    const q = partnerOf(g, p);
    if (r.guesses[p].pick === r.entries[q].lie) out[p].spotted += 1;
    else out[q].fooled += 1;
  }
  return out;
}
