export const HEADS_MAX = 6;
export const HEADS_DECKS = ["mix", "couple", "actions", "movies", "animals"] as const;
export type HeadsDeck = (typeof HEADS_DECKS)[number];
export const HEADS_ROUNDS = [2, 4, 6] as const;
export const HEADS_TIMERS = [45, 60, 90] as const;

export const HEADS_DECK_META: Record<HeadsDeck, { label: string; emoji: string }> = {
  mix: { label: "Mix All", emoji: "✨" },
  couple: { label: "Couple & LDR", emoji: "💞" },
  actions: { label: "Act It Out", emoji: "🏃" },
  movies: { label: "Pop & Movies", emoji: "🎬" },
  animals: { label: "Animals", emoji: "🦁" },
};

const CARDS: Record<Exclude<HeadsDeck, "mix">, readonly string[]> = {
  couple: [
    "Airport Reunion",
    "Good Morning Text",
    "Stealing Your Hoodie",
    "Video Call Freezing",
    "Date Night",
    "Falling Asleep on Call",
    "Time Zone Math",
    "Matching Outfits",
    "Anniversary",
    "Holding Hands",
    "Care Package",
    "Screen Sharing a Movie",
    "First Kiss",
    "Inside Joke",
    "Counting Down Days",
    "Late Night Snacks",
    "Spotify Blend",
    "Sending Memes",
    "Road Trip",
    "Stargazing",
    "Cooking Together",
    "Photo Booth",
    "Love Letter",
    "Forehead Kiss",
  ],
  actions: [
    "Brushing Teeth",
    "Walking a Dog",
    "Riding a Rollercoaster",
    "Juggling",
    "Swimming",
    "Taking a Selfie",
    "Baking a Cake",
    "Playing Guitar",
    "Sneezing",
    "Fishing",
    "Skateboarding",
    "Blowing Bubbles",
    "Texting While Walking",
    "Opening a Pickle Jar",
    "Hailing a Taxi",
    "Surfing",
    "Yoga",
    "Bowling",
    "Eating Spicy Food",
    "Climbing a Ladder",
    "Mowing the Lawn",
    "Ice Skating",
    "Playing Piano",
    "Catching a Fly",
  ],
  movies: [
    "Titanic",
    "Spider-Man",
    "Harry Potter",
    "Star Wars",
    "Frozen",
    "The Lion King",
    "Jurassic Park",
    "Toy Story",
    "Taylor Swift",
    "Karaoke",
    "Netflix & Chill",
    "Barbie",
    "Shrek",
    "Batman",
    "Pikachu",
    "Mario Kart",
    "Minecraft",
    "SpongeBob",
    "Avatar",
    "The Avengers",
    "Spirited Away",
    "Squid Game",
    "Beyoncé",
    "Oscar Speech",
  ],
  animals: [
    "Penguin",
    "T-Rex",
    "Flamingo",
    "Octopus",
    "Sloth",
    "Kangaroo",
    "Elephant",
    "Giraffe",
    "Dolphin",
    "Capybara",
    "Red Panda",
    "Chameleon",
    "Peacock",
    "Hedgehog",
    "Koala",
    "Crab",
    "Owl",
    "Frog",
    "Cheetah",
    "Gorilla",
    "Jellyfish",
    "Hamster",
    "Otter",
    "Squirrel",
  ],
};

export type HeadsCardLog = { word: string; outcome: "got" | "pass" };

export type HeadsGame = {
  seq: number;
  deck: HeadsDeck;
  rounds: number;
  roundSec: number;
  players: string[];
  round: number;
  guesserId: string;
  phase: "ready" | "active" | "summary";
  cards: string[];
  cardIdx: number;
  roundLog: HeadsCardLog[];
  scores: Record<string, number>;
  history: { round: number; guesserId: string; got: number; passed: number; log: HeadsCardLog[] }[];
  deadline?: number;
  sched?: number;
  done?: { winners: string[]; totalGot: number };
};

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newHeadsGame(
  players: string[],
  deck: HeadsDeck,
  rounds: number,
  roundSec: number,
  rng: () => number,
): HeadsGame {
  const pool =
    deck === "mix"
      ? [...CARDS.couple, ...CARDS.actions, ...CARDS.movies, ...CARDS.animals]
      : [...CARDS[deck]];
  const scores: Record<string, number> = {};
  for (const p of players) scores[p] = 0;
  return {
    seq: 0,
    deck,
    rounds,
    roundSec,
    players: [...players],
    round: 0,
    guesserId: players[0],
    phase: "ready",
    cards: shuffle(pool, rng),
    cardIdx: 0,
    roundLog: [],
    scores,
    history: [],
  };
}

export function startHeadsRound(g: HeadsGame, now: number) {
  if (g.done || g.phase !== "ready") return;
  g.phase = "active";
  g.roundLog = [];
  g.deadline = now + g.roundSec * 1000;
}

export function markHeadsCard(g: HeadsGame, outcome: "got" | "pass", now: number) {
  if (g.done || g.phase !== "active") return;
  const word = g.cards[g.cardIdx % g.cards.length];
  g.roundLog.push({ word, outcome });
  if (outcome === "got") {
    g.scores[g.guesserId] = (g.scores[g.guesserId] ?? 0) + 1;
  }
  g.cardIdx += 1;
  if (g.deadline && now >= g.deadline) {
    endHeadsRound(g);
  }
}

export function endHeadsRound(g: HeadsGame) {
  if (g.done || g.phase !== "active") return;
  const got = g.roundLog.filter((c) => c.outcome === "got").length;
  const passed = g.roundLog.length - got;
  g.history.push({ round: g.round, guesserId: g.guesserId, got, passed, log: [...g.roundLog] });
  g.phase = "summary";
  g.deadline = undefined;
}

export function nextHeadsRound(g: HeadsGame) {
  if (g.done || g.phase !== "summary") return;
  if (g.round + 1 >= g.rounds) {
    const best = Math.max(...g.players.map((p) => g.scores[p] ?? 0));
    const totalGot = g.history.reduce((s, h) => s + h.got, 0);
    g.done = { winners: g.players.filter((p) => (g.scores[p] ?? 0) === best), totalGot };
    return;
  }
  g.round += 1;
  g.guesserId = g.players[g.round % g.players.length];
  g.phase = "ready";
  g.roundLog = [];
}
