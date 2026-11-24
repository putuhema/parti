export const SPLIT_MAX = 2;
export const SPLIT_ROUNDS = [4, 6, 8] as const;

export type SplitPrompt = {
  id: string;
  emoji: string;
  title: string;
  leftCue: string;
  rightCue: string;
};

export const SPLIT_PROMPTS: readonly SplitPrompt[] = [
  {
    id: "half-heart",
    emoji: "🫶",
    title: "Complete the Heart",
    leftCue: "Curve your arm up to the RIGHT edge to form the left half of a heart!",
    rightCue: "Curve your arm up to the LEFT edge to meet their hand & complete the heart!",
  },
  {
    id: "high-five",
    emoji: "✋",
    title: "High-Five Across Miles",
    leftCue: "Press your palm right up against the RIGHT edge of the frame!",
    rightCue: "Line your palm up with theirs on the LEFT edge for a crisp high-five!",
  },
  {
    id: "cheers",
    emoji: "🥂",
    title: "Virtual Cheers!",
    leftCue: "Hold a mug, cup, or pretend glass right to the RIGHT edge!",
    rightCue: "Clink your cup right against theirs on the LEFT edge!",
  },
  {
    id: "nose-boop",
    emoji: "👉",
    title: "Nose Boop",
    leftCue: "Point your finger right toward the middle of the RIGHT edge!",
    rightCue: "Lean your nose right up to their finger on the LEFT edge!",
  },
  {
    id: "pass-flower",
    emoji: "🌸",
    title: "Pass a Gift",
    leftCue: "Reach your hand to the RIGHT edge like you're handing them something sweet!",
    rightCue: "Cup your hands at the LEFT edge to catch what they're passing!",
  },
  {
    id: "fist-bump",
    emoji: "🤜",
    title: "Power Fist Bump",
    leftCue: "Hold your fist steady right against the RIGHT seam!",
    rightCue: "Meet their fist right on the LEFT seam — boom!",
  },
  {
    id: "cheek-kiss",
    emoji: "😘",
    title: "Cheek Kiss",
    leftCue: "Lean toward the RIGHT edge and blow/plant a sweet kiss!",
    rightCue: "Turn your cheek toward the LEFT edge and blush!",
  },
  {
    id: "spies",
    emoji: "🕶️",
    title: "Back-to-Back Spies",
    leftCue: "Lean your shoulder against the RIGHT edge looking cool & mysterious!",
    rightCue: "Lean your shoulder against theirs on the LEFT edge — double agents!",
  },
  {
    id: "hug-reach",
    emoji: "🤗",
    title: "Reach for a Hug",
    leftCue: "Open your arms wide toward the RIGHT edge!",
    rightCue: "Open your arms right back toward the LEFT edge!",
  },
  {
    id: "finger-guns",
    emoji: "👉",
    title: "Cool Duo",
    leftCue: "Shoot dramatic finger guns straight toward the RIGHT edge!",
    rightCue: "Shoot finger guns right back toward the LEFT edge!",
  },
  {
    id: "peek-seam",
    emoji: "🙈",
    title: "Peek Around the Seam",
    leftCue: "Peek your face out from the RIGHT edge like you're behind a doorframe!",
    rightCue: "Peek right back from the LEFT edge!",
  },
  {
    id: "movie-night",
    emoji: "🍿",
    title: "Shared Popcorn",
    leftCue: "Reach down-right like you're grabbing popcorn from a shared bowl!",
    rightCue: "Reach down-left to steal popcorn from the same bowl!",
  },
  {
    id: "twin-peace",
    emoji: "✌️",
    title: "Bestie Photobooth",
    leftCue: "Lean your head toward the RIGHT edge and flash a peace sign!",
    rightCue: "Lean your head against theirs on the LEFT edge with a peace sign!",
  },
  {
    id: "crown-pass",
    emoji: "👑",
    title: "Crown Your Partner",
    leftCue: "Hold an imaginary crown up at the RIGHT edge!",
    rightCue: "Tuck your head right underneath their hands on the LEFT edge!",
  },
];

export const SPLIT_BY_ID: Record<string, SplitPrompt> = Object.fromEntries(SPLIT_PROMPTS.map((p) => [p.id, p]));

export type SplitGame = {
  seq: number;
  rounds: number;
  players: string[]; // 1 or 2 players
  promptIds: string[];
  round: number;
  phase: "left" | "right" | "reveal";
  leftPlayerId: string;
  rightPlayerId: string;
  reactions: { by: string; emoji: string; at: number }[];
  history: { round: number; promptId: string; leftPlayerId: string; rightPlayerId: string }[];
  done?: { totalPhotos: number };
};

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newSplitGame(players: string[], rounds: number, rng: () => number): SplitGame {
  const pool = shuffle(SPLIT_PROMPTS, rng);
  const promptIds = Array.from({ length: rounds }, (_, i) => pool[i % pool.length].id);
  const p0 = players[0];
  const p1 = players[1] ?? players[0];
  return {
    seq: 0,
    rounds,
    players: [...players],
    promptIds,
    round: 0,
    phase: "left",
    leftPlayerId: p0,
    rightPlayerId: p1,
    reactions: [],
    history: [],
  };
}

export function snapSplitSide(g: SplitGame, playerId: string) {
  if (g.done) throw new Error("Photobooth finished");
  if (g.phase === "left") {
    if (g.leftPlayerId !== playerId) throw new Error("Waiting for the left half");
    g.phase = "right";
    return "left" as const;
  }
  if (g.phase === "right") {
    if (g.rightPlayerId !== playerId) throw new Error("Waiting for the right half");
    g.phase = "reveal";
    g.history.push({
      round: g.round,
      promptId: g.promptIds[g.round],
      leftPlayerId: g.leftPlayerId,
      rightPlayerId: g.rightPlayerId,
    });
    return "right" as const;
  }
  throw new Error("Already revealed");
}

export function advanceSplit(g: SplitGame) {
  if (g.done || g.phase !== "reveal") return;
  if (g.round + 1 >= g.rounds) {
    g.done = { totalPhotos: g.history.length };
    return;
  }
  g.round += 1;
  // Swap left & right seats every round!
  const prevLeft = g.leftPlayerId;
  g.leftPlayerId = g.rightPlayerId;
  g.rightPlayerId = prevLeft;
  g.phase = "left";
  g.reactions = [];
}
