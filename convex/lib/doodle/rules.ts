import { isCloseGuess } from "../pose/prompts";

export const DOODLE_MAX = 6;
export const DOODLE_ROUNDS = [4, 6, 8] as const;
export const DOODLE_TIMERS = [30, 45, 60] as const;

export const DOODLE_WORDS: readonly string[] = [
  "Heart",
  "Pizza",
  "Rainbow",
  "Cat",
  "Rocket",
  "Umbrella",
  "Coffee Cup",
  "Butterfly",
  "Crown",
  "Guitar",
  "Sun",
  "Moon",
  "Ice Cream",
  "Flower",
  "House",
  "Airplane",
  "Star",
  "Birthday Cake",
  "Ghost",
  "Glasses",
  "Fish",
  "Tree",
  "Car",
  "Mountain",
  "Balloon",
  "Snowman",
  "Cactus",
  "Boat",
  "Camera",
  "Headphones",
  "Diamond",
  "Lightning",
  "Key",
  "Apple",
  "Mushroom",
  "Boba Tea",
  "Envelope",
  "Clock",
  "Anchor",
  "Smiley Face",
  "Cloud",
  "Campfire",
  "Bicycle",
  "Cupcake",
  "Penguin",
  "Duck",
  "Bowtie",
  "Trophy",
];

export type DoodleGame = {
  seq: number;
  rounds: number;
  turnSec: number;
  players: string[];
  out: string[];
  words: string[];
  round: number;
  drawerId: string;
  phase: "drawing" | "reveal";
  scores: Record<string, number>;
  guesses: { by: string; text: string; correct: boolean; at: number }[];
  solvedBy?: string;
  history: { round: number; word: string; drawerId: string; solvedBy?: string }[];
  deadline?: number;
  sched?: number;
  done?: { winners: string[] };
};

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function activeDoodlePlayers(g: DoodleGame): string[] {
  return g.players.filter((p) => !g.out.includes(p));
}

export function newDoodleGame(
  players: string[],
  rounds: number,
  turnSec: number,
  now: number,
  countdownMs: number,
  rng: () => number,
): DoodleGame {
  const pool = shuffle(DOODLE_WORDS, rng);
  const words = Array.from({ length: rounds }, (_, i) => pool[i % pool.length]);
  const scores: Record<string, number> = {};
  for (const p of players) scores[p] = 0;
  return {
    seq: 0,
    rounds,
    turnSec,
    players: [...players],
    out: [],
    words,
    round: 0,
    drawerId: players[0],
    phase: "drawing",
    scores,
    guesses: [],
    history: [],
    deadline: now + countdownMs + turnSec * 1000,
  };
}

export function guessDoodle(g: DoodleGame, playerId: string, rawText: string, now: number) {
  if (g.done || g.phase !== "drawing") throw new Error("Not guessing right now");
  if (g.drawerId === playerId) throw new Error("You're the artist!");
  const text = rawText.trim().slice(0, 50);
  if (!text) throw new Error("Type a guess");
  const word = g.words[g.round];
  const correct = isCloseGuess(text, word);
  g.guesses = [...g.guesses.slice(-19), { by: playerId, text, correct, at: now }];
  if (correct) {
    finishDoodleRound(g, playerId, now);
  }
}

export function acceptDoodleGuess(g: DoodleGame, drawerId: string, guesserId: string, now: number) {
  if (g.done || g.phase !== "drawing") return;
  if (g.drawerId !== drawerId) throw new Error("Only the artist can accept");
  finishDoodleRound(g, guesserId, now);
}

export function finishDoodleRound(g: DoodleGame, solvedBy: string | undefined, now: number) {
  if (g.done || g.phase !== "drawing") return;
  g.solvedBy = solvedBy;
  if (solvedBy) {
    g.scores[solvedBy] = (g.scores[solvedBy] ?? 0) + 100;
    g.scores[g.drawerId] = (g.scores[g.drawerId] ?? 0) + 85;
  } else if (activeDoodlePlayers(g).length === 1) {
    g.scores[g.drawerId] = (g.scores[g.drawerId] ?? 0) + 50;
  }
  g.history.push({ round: g.round, word: g.words[g.round], drawerId: g.drawerId, solvedBy });
  g.phase = "reveal";
  g.deadline = now + 25_000;
}

export function advanceDoodle(g: DoodleGame, now: number) {
  if (g.done || g.phase !== "reveal") return;
  const active = activeDoodlePlayers(g);
  if (!active.length || g.round + 1 >= g.rounds) {
    const pool = active.length ? active : g.players;
    const best = Math.max(...pool.map((p) => g.scores[p] ?? 0));
    g.done = { winners: pool.filter((p) => (g.scores[p] ?? 0) === best) };
    g.deadline = undefined;
    return;
  }
  g.round += 1;
  g.drawerId = active[g.round % active.length];
  g.phase = "drawing";
  g.guesses = [];
  g.solvedBy = undefined;
  g.deadline = now + g.turnSec * 1000;
}
