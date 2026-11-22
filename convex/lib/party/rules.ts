// Party Blitz: rapid-fire minigames. Every round everyone plays the same minigame at the same time
// on their own phone, built from the same seed so it's fair. The best score wins the round's points.
// The minigames themselves run on each phone; the server keeps time, checks scores are possible,
// and adds up points. Pure rules, shared by server and client.

export type MicroId = "tap" | "draw" | "odd" | "count" | "bar" | "math" | "color" | "balloons" | "memory";

export const MICROS: { id: MicroId; name: string; icon: string; howto: string; ms: number; cap: number }[] = [
  { id: "tap", name: "Tap Frenzy", icon: "👆", howto: "Tap the button as fast as you can!", ms: 5000, cap: 120 },
  { id: "draw", name: "Quick Draw", icon: "🤠", howto: "Wait for GREEN, then tap. Too early and you're out!", ms: 7000, cap: 1000 },
  { id: "odd", name: "Odd One Out", icon: "🔍", howto: "Find the one emoji that's different. As many as you can!", ms: 12000, cap: 40 },
  { id: "count", name: "Count It", icon: "🔢", howto: "Count the target emoji before they vanish.", ms: 15000, cap: 400 },
  { id: "bar", name: "Stop the Bar", icon: "🎯", howto: "Tap to stop the marker in the middle of the zone. 3 tries.", ms: 12000, cap: 300 },
  { id: "math", name: "Quick Math", icon: "➕", howto: "Solve as many sums as you can. Wrong answers cost a point.", ms: 10000, cap: 60 },
  { id: "color", name: "Color Clash", icon: "🎨", howto: "Tap the colour the word is PAINTED in, not what it says!", ms: 10000, cap: 60 },
  { id: "balloons", name: "Balloon Pop", icon: "🎈", howto: "Pop the balloons. Don't touch the bombs!", ms: 10000, cap: 60 },
  { id: "memory", name: "Memory Flash", icon: "🧠", howto: "Watch the sequence, then tap it back. It gets longer!", ms: 20000, cap: 20 },
];
export const microOf = (id: string) => MICROS.find((m) => m.id === id) ?? MICROS[0];

export const MAX_PLAYERS = 6;
export const ROUND_CHOICES = [5, 8, 12] as const;
export const COUNTDOWN_MS = 3500; // intro card and 3-2-1 before each minigame
export const GRACE_MS = 2500; // slack for slow phones and networks
export const REVEAL_MS = 6000; // how long the round results stay up
export const PLACE_POINTS = [3, 2, 1];

/** A small seeded random generator, so every phone builds the same minigame. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type RoundResult = { round: number; micro: MicroId; scores: Record<string, number>; points: Record<string, number>; records: string[] };

export type PartyGame = {
  seq: number;
  players: string[];
  order: MicroId[];
  seeds: number[];
  round: number;
  phase: "play" | "reveal";
  startAt: number;
  deadline?: number;
  sched?: number;
  scores: Record<string, number>; // this round's submissions
  totals: Record<string, number>;
  results: RoundResult[];
  done?: { reason: "end" | "left" };
};

type Rng = () => number;

/** Minigames for every round: shuffled, never the same one twice in a row. */
export function pickOrder(rounds: number, r: Rng): MicroId[] {
  const out: MicroId[] = [];
  while (out.length < rounds) {
    const bag = MICROS.map((m) => m.id).sort(() => r() - 0.5);
    for (const id of bag) if (out.length < rounds && out.at(-1) !== id) out.push(id);
  }
  return out;
}

export function newGame(players: string[], rounds: number, r: Rng, now: number): PartyGame {
  const order = pickOrder(rounds, r);
  const g: PartyGame = {
    seq: 0, players: [...players], order, seeds: order.map(() => Math.floor(r() * 2 ** 31)), round: 0, phase: "play", startAt: 0,
    scores: {}, totals: Object.fromEntries(players.map((p) => [p, 0])), results: [],
  };
  startRound(g, now);
  return g;
}

function startRound(g: PartyGame, now: number) {
  g.phase = "play";
  g.scores = {};
  g.startAt = now + COUNTDOWN_MS;
  g.deadline = g.startAt + microOf(g.order[g.round]).ms + GRACE_MS;
}

/** A player's score for this round. Impossible scores are rejected. */
export function submit(g: PartyGame, p: string, round: number, score: number, now: number): string | null {
  if (g.done || g.phase !== "play" || round !== g.round) return null; // late: ignore
  if (!g.players.includes(p)) return "You're watching";
  if (g.scores[p] !== undefined) return null;
  if (now < g.startAt - 500) return "Wait for the countdown";
  const cap = microOf(g.order[g.round]).cap;
  if (!Number.isFinite(score) || score < 0 || score > cap) return "That score isn't possible";
  g.scores[p] = Math.round(score);
  return null;
}

export const everyoneIn = (g: PartyGame) => g.players.every((p) => g.scores[p] !== undefined);

/** Rank the round: best score gets 3 points, then 2, then 1. Ties share. A zero earns nothing. */
export function placePoints(scores: Record<string, number>, players: string[]) {
  const points: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const distinct = [...new Set(players.map((p) => scores[p] ?? 0).filter((s) => s > 0))].sort((a, b) => b - a);
  for (const p of players) {
    const s = scores[p] ?? 0;
    const place = distinct.indexOf(s);
    if (s > 0 && place >= 0 && place < PLACE_POINTS.length) points[p] = players.length === 1 ? 1 : PLACE_POINTS[place];
  }
  return points;
}

/** Close the round: missing scores count as 0. `records` are players who beat their personal best. */
export function reveal(g: PartyGame, now: number, records: string[] = []) {
  if (g.done || g.phase !== "play") return;
  for (const p of g.players) if (g.scores[p] === undefined) g.scores[p] = 0;
  const points = placePoints(g.scores, g.players);
  for (const p of g.players) g.totals[p] = (g.totals[p] ?? 0) + points[p];
  g.results.push({ round: g.round, micro: g.order[g.round], scores: { ...g.scores }, points, records });
  g.phase = "reveal";
  g.deadline = now + REVEAL_MS;
}

export function nextRound(g: PartyGame, now: number) {
  if (g.done || g.phase !== "reveal") return;
  g.round += 1;
  if (g.round >= g.order.length) {
    g.done = { reason: "end" };
    g.deadline = undefined;
    return;
  }
  startRound(g, now);
}

export function leaveGame(g: PartyGame, p: string, now: number) {
  if (g.done || !g.players.includes(p)) return;
  g.players = g.players.filter((x) => x !== p);
  delete g.scores[p];
  if (g.players.length === 0) { g.done = { reason: "left" }; g.deadline = undefined; return; }
  if (g.phase === "play" && everyoneIn(g)) reveal(g, now);
}

export function winners(g: PartyGame) {
  const best = Math.max(...g.players.map((p) => g.totals[p] ?? 0));
  return g.players.filter((p) => (g.totals[p] ?? 0) === best);
}
