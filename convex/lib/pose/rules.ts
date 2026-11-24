import { POSES, posesForPack, type PoseJoints, type PosePack } from "./poses";
import { PROMPTS, isCloseGuess } from "./prompts";

export const POSE_MAX = 6;
export const MODE_CHOICES = ["classic", "copycat", "secret", "telephone"] as const;
export type PoseMode = (typeof MODE_CHOICES)[number];

export const MODE_META: Record<PoseMode, { label: string; emoji: string; sub: string; minPlayers: number }> = {
  classic: { label: "Classic Match", emoji: "📸", sub: "Match preset poses & rate snaps", minPlayers: 1 },
  copycat: { label: "Copycat", emoji: "🪞", sub: "Invent a pose, partner mirrors it", minPlayers: 2 },
  secret: { label: "Secret Prompt", emoji: "🕵️", sub: "Act a secret word in 1 photo", minPlayers: 2 },
  telephone: { label: "Pose Telephone", emoji: "🎭", sub: "Pose → skeleton → guess chain", minPlayers: 2 },
};

export const PACK_CHOICES: readonly PosePack[] = ["mix", "cute", "silly", "active"];
export const ROUND_CHOICES = [3, 5, 7] as const;
export const TIMER_CHOICES = [10, 15, 20] as const;

export type RatingKind = "nailed" | "close" | "chaotic";

export const RATING_SCORE: Record<RatingKind, { score: number; label: string; emoji: string }> = {
  nailed: { score: 100, label: "Nailed it!", emoji: "💯" },
  close: { score: 75, label: "So close!", emoji: "😄" },
  chaotic: { score: 50, label: "Pure chaos", emoji: "😂" },
};

export const HYPE_EMOJIS = ["🔥", "😍", "😂", "👏", "🫶", "💀"] as const;

export type PosePhase = "posing" | "guessing" | "reveal" | "roundSummary" | "chainReveal";

export type TurnReaction = {
  by: string;
  emoji: string;
  at: number;
};

export type TurnRating = {
  kind: RatingKind;
  score: number;
};

export type GuessEntry = {
  by: string;
  text: string;
  correct: boolean;
  at: number;
};

export type ChainEntry = {
  step: number;
  kind: "pose" | "guess";
  playerId: string;
  prompt?: string;
  guess?: string;
  snapKey?: string;
  joints?: PoseJoints;
  skipped?: boolean;
};

export type ActiveTurn = {
  playerId: string;
  poseId: string; // preset pose id, or "custom" / "secret" / "telephone"
  role?: "lead" | "copy" | "act" | "chain";
  snapped: boolean;
  skipped: boolean;
  aiScore?: number;
  ratings: Record<string, TurnRating>;
  reactions: TurnReaction[];
};

export type TurnResult = {
  playerId: string;
  aiScore?: number;
  partnerScore?: number;
  totalScore: number;
  skipped: boolean;
  role?: "lead" | "copy" | "act";
};

export type RoundHistory = {
  round: number;
  poseId: string;
  prompt?: string;
  leaderId?: string;
  results: TurnResult[];
  chain?: ChainEntry[];
};

export type PoseGame = {
  seq: number;
  mode: PoseMode;
  pack: PosePack;
  rounds: number;
  turnSec: number;
  players: string[];
  out: string[];
  poseIds: string[]; // classic pose ids
  prompts: string[]; // secret & telephone prompts per round
  round: number; // 0-indexed
  turnIndex: number; // index into roundOrder()
  phase: PosePhase;
  scores: Record<string, number>;
  currentTurn: ActiveTurn;
  // Mode-specific round state:
  leaderId?: string; // copycat
  leaderJoints?: PoseJoints; // copycat leader's extracted skeleton
  secretPrompt?: string; // secret prompt mode
  guesses: GuessEntry[]; // secret prompt guesses
  solvedBy?: string; // secret prompt solver
  chain: ChainEntry[]; // telephone mode steps for current round
  chainStep: number; // 0..CHAIN_LEN-1
  roundResults: TurnResult[];
  history: RoundHistory[];
  hype: TurnReaction[];
  deadline?: number;
  sched?: number;
  done?: {
    winners: string[];
    coupleSync: number;
    totalPoses: number;
  };
};

const SNAP_GRACE_MS = 4500;
const GUESS_MS = 40_000;
const REVEAL_MAX_MS = 45_000;
const SUMMARY_MAX_MS = 60_000;
export const TELEPHONE_STEPS = 4; // Pose -> Guess -> Pose -> Guess

export function activePlayers(g: PoseGame): string[] {
  return g.players.filter((p) => !g.out.includes(p));
}

/** Order of players for the current round (rotates starter each round). */
export function roundOrder(g: PoseGame): string[] {
  const active = activePlayers(g);
  if (active.length === 0) return [];
  const shift = g.round % active.length;
  return [...active.slice(shift), ...active.slice(0, shift)];
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPoses(pack: PosePack, rounds: number, rng: () => number): string[] {
  const pool = shuffle(posesForPack(pack), rng);
  const chosen: string[] = [];
  for (let i = 0; i < rounds; i++) {
    if (i < pool.length) chosen.push(pool[i].id);
    else {
      const extra = shuffle(POSES, rng).find((p) => !chosen.includes(p.id)) ?? POSES[i % POSES.length];
      chosen.push(extra.id);
    }
  }
  return chosen;
}

function pickPrompts(rounds: number, rng: () => number): string[] {
  const pool = shuffle(PROMPTS, rng);
  return Array.from({ length: rounds }, (_, i) => pool[i % pool.length]);
}

function initRound(g: PoseGame, now: number, extraDelayMs = 0) {
  const order = roundOrder(g);
  const starter = order[0];
  g.turnIndex = 0;
  g.roundResults = [];
  g.hype = [];
  g.guesses = [];
  g.solvedBy = undefined;
  g.leaderJoints = undefined;
  g.chain = [];
  g.chainStep = 0;

  if (g.mode === "classic") {
    g.leaderId = undefined;
    g.secretPrompt = undefined;
    g.phase = "posing";
    g.currentTurn = {
      playerId: starter,
      poseId: g.poseIds[g.round],
      snapped: false,
      skipped: false,
      ratings: {},
      reactions: [],
    };
    g.deadline = now + extraDelayMs + g.turnSec * 1000 + SNAP_GRACE_MS;
    return;
  }

  if (g.mode === "copycat") {
    g.leaderId = starter;
    g.secretPrompt = undefined;
    g.phase = "posing";
    g.currentTurn = {
      playerId: starter,
      poseId: "custom",
      role: "lead",
      snapped: false,
      skipped: false,
      ratings: {},
      reactions: [],
    };
    g.deadline = now + extraDelayMs + g.turnSec * 1000 + SNAP_GRACE_MS;
    return;
  }

  if (g.mode === "secret") {
    g.leaderId = starter;
    g.secretPrompt = g.prompts[g.round];
    g.phase = "posing";
    g.currentTurn = {
      playerId: starter,
      poseId: "secret",
      role: "act",
      snapped: false,
      skipped: false,
      ratings: {},
      reactions: [],
    };
    g.deadline = now + extraDelayMs + g.turnSec * 1000 + SNAP_GRACE_MS;
    return;
  }

  // telephone
  g.leaderId = starter;
  g.secretPrompt = g.prompts[g.round];
  g.phase = "posing";
  g.currentTurn = {
    playerId: starter,
    poseId: "telephone",
    role: "chain",
    snapped: false,
    skipped: false,
    ratings: {},
    reactions: [],
  };
  g.deadline = now + extraDelayMs + g.turnSec * 1000 + SNAP_GRACE_MS;
}

export function newGame(
  players: string[],
  pack: PosePack,
  rounds: number,
  turnSec: number,
  now: number,
  countdownMs: number,
  rng: () => number,
  mode: PoseMode = "classic",
): PoseGame {
  const minP = MODE_META[mode].minPlayers;
  if (players.length < minP) throw new Error(`Need at least ${minP} players for ${MODE_META[mode].label}`);
  const poseIds = pickPoses(pack, rounds, rng);
  const prompts = pickPrompts(rounds, rng);
  const scores: Record<string, number> = {};
  for (const p of players) scores[p] = 0;

  const g: PoseGame = {
    seq: 0,
    mode,
    pack,
    rounds,
    turnSec,
    players: [...players],
    out: [],
    poseIds,
    prompts,
    round: 0,
    turnIndex: 0,
    phase: "posing",
    scores,
    currentTurn: {
      playerId: players[0],
      poseId: poseIds[0],
      snapped: false,
      skipped: false,
      ratings: {},
      reactions: [],
    },
    guesses: [],
    chain: [],
    chainStep: 0,
    roundResults: [],
    history: [],
    hype: [],
  };
  initRound(g, now, countdownMs);
  return g;
}

export function computeTurnScore(turn: ActiveTurn): { partnerScore?: number; totalScore: number } {
  if (turn.skipped) return { totalScore: 0 };
  const ratingValues = Object.values(turn.ratings).map((r) => r.score);
  const partnerScore = ratingValues.length
    ? Math.round(ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length)
    : undefined;
  const ai = turn.aiScore;

  if (ai !== undefined && partnerScore !== undefined) {
    return { partnerScore, totalScore: Math.round(ai * 0.55 + partnerScore * 0.45) };
  }
  if (partnerScore !== undefined) return { partnerScore, totalScore: partnerScore };
  if (ai !== undefined) return { totalScore: ai };
  return { totalScore: 75 };
}

export function submitSnap(
  g: PoseGame,
  playerId: string,
  aiScore: number | undefined,
  now: number,
  joints?: PoseJoints,
) {
  if (g.done) throw new Error("The game is over");
  if (g.phase !== "posing") throw new Error("Not accepting a snap right now");
  if (g.currentTurn.playerId !== playerId) throw new Error("It's not your turn to pose");

  const clampedAi =
    aiScore !== undefined && Number.isFinite(aiScore) ? Math.max(0, Math.min(100, Math.round(aiScore))) : undefined;
  g.currentTurn.snapped = true;
  g.currentTurn.skipped = false;
  g.currentTurn.aiScore = clampedAi;

  if (g.mode === "copycat" && g.currentTurn.role === "lead") {
    g.leaderJoints = joints;
    // Leader gets +80 creative points and we move straight to Copycat #1!
    g.scores[playerId] = (g.scores[playerId] ?? 0) + 80;
    g.roundResults.push({ playerId, totalScore: 80, skipped: false, role: "lead" });
    const order = roundOrder(g);
    if (order.length >= 2) {
      g.turnIndex = 1;
      startCopyTurn(g, order[1], now);
    } else {
      g.phase = "reveal";
      g.deadline = now + REVEAL_MAX_MS;
    }
    return;
  }

  if (g.mode === "secret") {
    g.phase = "guessing";
    g.deadline = now + GUESS_MS;
    return;
  }

  if (g.mode === "telephone") {
    const promptForStep =
      g.chainStep === 0 ? g.secretPrompt : g.chain[g.chain.length - 1]?.guess ?? g.secretPrompt;
    g.chain.push({
      step: g.chainStep,
      kind: "pose",
      playerId,
      prompt: promptForStep,
      snapKey: `${g.round}:${playerId}:s${g.chainStep}`,
      joints,
    });
    advanceTelephoneStep(g, now);
    return;
  }

  // Classic or Copycat copyer -> reveal & rate
  g.phase = "reveal";
  g.deadline = now + REVEAL_MAX_MS;
}

function startCopyTurn(g: PoseGame, playerId: string, now: number) {
  g.phase = "posing";
  g.hype = [];
  g.currentTurn = {
    playerId,
    poseId: "custom",
    role: "copy",
    snapped: false,
    skipped: false,
    ratings: {},
    reactions: [],
  };
  g.deadline = now + g.turnSec * 1000 + SNAP_GRACE_MS;
}

function advanceTelephoneStep(g: PoseGame, now: number) {
  const order = roundOrder(g);
  g.chainStep += 1;
  if (g.chainStep >= TELEPHONE_STEPS || order.length < 2) {
    // Finish the telephone round and reveal the whole chain!
    const orig = g.secretPrompt ?? "";
    const finalGuess = [...g.chain].reverse().find((c) => c.kind === "guess")?.guess ?? "";
    const matched = isCloseGuess(finalGuess, orig);
    const pts = matched ? 100 : 80;
    const results: TurnResult[] = order.map((pid) => {
      g.scores[pid] = (g.scores[pid] ?? 0) + pts;
      return { playerId: pid, totalScore: pts, skipped: false };
    });
    g.history.push({
      round: g.round,
      poseId: "telephone",
      prompt: orig,
      results,
      chain: [...g.chain],
    });
    g.phase = "chainReveal";
    g.deadline = now + SUMMARY_MAX_MS;
    return;
  }

  const nextPlayer = order[g.chainStep % order.length];
  const nextIsGuess = g.chainStep % 2 === 1;
  g.hype = [];
  g.currentTurn = {
    playerId: nextPlayer,
    poseId: "telephone",
    role: "chain",
    snapped: false,
    skipped: false,
    ratings: {},
    reactions: [],
  };
  g.phase = nextIsGuess ? "guessing" : "posing";
  g.deadline = now + (nextIsGuess ? GUESS_MS : g.turnSec * 1000 + SNAP_GRACE_MS);
}

export function submitGuess(g: PoseGame, playerId: string, rawText: string, now: number) {
  if (g.done) throw new Error("The game is over");
  if (g.phase !== "guessing") throw new Error("Not guessing right now");
  const text = rawText.trim().slice(0, 60);
  if (!text) throw new Error("Type a guess first");

  if (g.mode === "telephone") {
    if (g.currentTurn.playerId !== playerId) throw new Error("It's not your turn to guess");
    g.chain.push({
      step: g.chainStep,
      kind: "guess",
      playerId,
      guess: text,
    });
    advanceTelephoneStep(g, now);
    return;
  }

  if (g.mode === "secret") {
    if (g.currentTurn.playerId === playerId) throw new Error("You're the actor!");
    if (!g.players.includes(playerId) || g.out.includes(playerId)) throw new Error("You're watching this game");
    const correct = isCloseGuess(text, g.secretPrompt ?? "");
    g.guesses = [...g.guesses.slice(-19), { by: playerId, text, correct, at: now }];
    if (correct) {
      finishSecretGuessing(g, playerId, now);
    }
    return;
  }

  throw new Error("Guessing isn't used in this mode");
}

export function acceptSecretGuess(g: PoseGame, actorId: string, guesserId: string, now: number) {
  if (g.done) throw new Error("The game is over");
  if (g.mode !== "secret" || g.phase !== "guessing") throw new Error("Not guessing right now");
  if (g.currentTurn.playerId !== actorId) throw new Error("Only the actor can accept a guess");
  finishSecretGuessing(g, guesserId, now);
}

export function revealSecret(g: PoseGame, now: number) {
  if (g.done || g.mode !== "secret" || g.phase !== "guessing") return;
  finishSecretGuessing(g, undefined, now);
}

function finishSecretGuessing(g: PoseGame, solverId: string | undefined, now: number) {
  g.solvedBy = solverId;
  const actorId = g.currentTurn.playerId;
  const order = roundOrder(g);
  const results: TurnResult[] = [];

  if (solverId) {
    g.scores[actorId] = (g.scores[actorId] ?? 0) + 95;
    g.scores[solverId] = (g.scores[solverId] ?? 0) + 100;
    results.push({ playerId: actorId, totalScore: 95, skipped: false, role: "act" });
    results.push({ playerId: solverId, totalScore: 100, skipped: false });
  } else {
    g.scores[actorId] = (g.scores[actorId] ?? 0) + 45;
    results.push({ playerId: actorId, totalScore: 45, skipped: false, role: "act" });
  }
  for (const pid of order) {
    if (!results.some((r) => r.playerId === pid)) {
      results.push({ playerId: pid, totalScore: 0, skipped: false });
    }
  }
  g.history.push({
    round: g.round,
    poseId: "secret",
    prompt: g.secretPrompt,
    leaderId: actorId,
    results,
  });
  g.phase = "reveal";
  g.deadline = now + REVEAL_MAX_MS;
}

export function skipTurn(g: PoseGame, playerId: string, now: number) {
  if (g.done) throw new Error("The game is over");
  if (g.phase !== "posing") throw new Error("Not posing right now");
  if (g.currentTurn.playerId !== playerId) throw new Error("It's not your turn");

  if (g.mode === "telephone") {
    g.chain.push({
      step: g.chainStep,
      kind: "pose",
      playerId,
      prompt: g.chainStep === 0 ? g.secretPrompt : g.chain[g.chain.length - 1]?.guess,
      skipped: true,
    });
    advanceTelephoneStep(g, now);
    return;
  }

  if (g.mode === "secret") {
    g.currentTurn.skipped = true;
    finishSecretGuessing(g, undefined, now);
    return;
  }

  if (g.mode === "copycat" && g.currentTurn.role === "lead") {
    // If leader skips, skip the whole round cleanly
    g.currentTurn.skipped = true;
    g.history.push({ round: g.round, poseId: "custom", leaderId: playerId, results: [] });
    if (g.round + 1 >= g.rounds) finishGame(g);
    else {
      g.round += 1;
      initRound(g, now);
    }
    return;
  }

  g.currentTurn.snapped = false;
  g.currentTurn.skipped = true;
  g.phase = "reveal";
  g.deadline = now + 15_000;
}

export function rateSnap(g: PoseGame, raterId: string, kind: RatingKind, now: number) {
  if (g.done) throw new Error("The game is over");
  if (g.phase !== "reveal") throw new Error("Nothing to rate right now");
  if (g.mode === "secret") throw new Error("Secret Prompt uses guesses, not ratings");
  if (g.currentTurn.skipped) throw new Error("This turn was skipped");
  if (g.currentTurn.playerId === raterId) throw new Error("You can't rate your own pose");
  if (!g.players.includes(raterId) || g.out.includes(raterId)) throw new Error("You're watching this game");

  g.currentTurn.ratings[raterId] = { kind, score: RATING_SCORE[kind].score };
  const others = activePlayers(g).filter((p) => p !== g.currentTurn.playerId);
  const allRated = others.every((p) => !!g.currentTurn.ratings[p]);
  if (allRated) {
    g.deadline = Math.min(g.deadline ?? now + 12_000, now + 12_000);
  }
}

export function addReaction(g: PoseGame, playerId: string, emoji: string, now: number) {
  if (g.done) return;
  if (!(HYPE_EMOJIS as readonly string[]).includes(emoji)) throw new Error("Unknown reaction");
  if (g.phase === "posing") {
    g.hype = [...g.hype.slice(-7), { by: playerId, emoji, at: now }];
  } else if (g.phase === "reveal" || g.phase === "guessing") {
    g.currentTurn.reactions = [...g.currentTurn.reactions.slice(-11), { by: playerId, emoji, at: now }];
  }
}

function finalizeCurrentTurn(g: PoseGame) {
  const { partnerScore, totalScore } = computeTurnScore(g.currentTurn);
  const p = g.currentTurn.playerId;
  g.scores[p] = (g.scores[p] ?? 0) + totalScore;
  g.roundResults.push({
    playerId: p,
    aiScore: g.currentTurn.aiScore,
    partnerScore,
    totalScore,
    skipped: g.currentTurn.skipped,
    role: g.currentTurn.role === "copy" ? "copy" : undefined,
  });
}

function finishGame(g: PoseGame) {
  const active = activePlayers(g);
  const pool = active.length ? active : g.players;
  const best = Math.max(...pool.map((p) => g.scores[p] ?? 0));
  const winners = pool.filter((p) => (g.scores[p] ?? 0) === best);

  const allScores = g.history.flatMap((h) => h.results.map((r) => r.totalScore));
  const coupleSync = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;

  g.done = {
    winners,
    coupleSync,
    totalPoses: g.history.length,
  };
  g.deadline = undefined;
}

export function advance(g: PoseGame, now: number) {
  if (g.done) return;
  const order = roundOrder(g);
  if (order.length === 0) {
    finishGame(g);
    return;
  }

  if (g.phase === "reveal") {
    if (g.mode === "secret") {
      // Secret prompt already logged history in finishSecretGuessing
      if (g.round + 1 >= g.rounds) finishGame(g);
      else {
        g.round += 1;
        initRound(g, now);
      }
      return;
    }

    finalizeCurrentTurn(g);
    const nextIdx = g.turnIndex + 1;
    if (nextIdx < order.length) {
      g.turnIndex = nextIdx;
      if (g.mode === "copycat") startCopyTurn(g, order[nextIdx], now);
      else {
        g.phase = "posing";
        g.hype = [];
        g.currentTurn = {
          playerId: order[nextIdx],
          poseId: g.poseIds[g.round],
          snapped: false,
          skipped: false,
          ratings: {},
          reactions: [],
        };
        g.deadline = now + g.turnSec * 1000 + SNAP_GRACE_MS;
      }
      return;
    }

    g.history.push({
      round: g.round,
      poseId: g.mode === "copycat" ? "custom" : g.poseIds[g.round],
      leaderId: g.leaderId,
      results: [...g.roundResults],
    });
    g.roundResults = [];

    if (order.length >= 2) {
      g.phase = "roundSummary";
      g.deadline = now + SUMMARY_MAX_MS;
      return;
    }

    if (g.round + 1 >= g.rounds) finishGame(g);
    else {
      g.round += 1;
      initRound(g, now);
    }
    return;
  }

  if (g.phase === "roundSummary" || g.phase === "chainReveal") {
    if (g.round + 1 >= g.rounds) finishGame(g);
    else {
      g.round += 1;
      initRound(g, now);
    }
  }
}

export function onDeadline(g: PoseGame, now: number) {
  if (g.done) return;
  if (g.phase === "posing") {
    skipTurn(g, g.currentTurn.playerId, now);
    return;
  }
  if (g.phase === "guessing") {
    if (g.mode === "secret") {
      revealSecret(g, now);
      return;
    }
    if (g.mode === "telephone") {
      g.chain.push({
        step: g.chainStep,
        kind: "guess",
        playerId: g.currentTurn.playerId,
        guess: "???",
        skipped: true,
      });
      advanceTelephoneStep(g, now);
      return;
    }
  }
  advance(g, now);
}

export function leaveGame(g: PoseGame, playerId: string, now: number) {
  if (g.done || g.out.includes(playerId)) return;
  g.out.push(playerId);
  const active = activePlayers(g);
  if (active.length === 0) {
    finishGame(g);
    return;
  }
  if (g.phase === "posing" && g.currentTurn.playerId === playerId) {
    skipTurn(g, playerId, now);
    if ((g.phase as PosePhase) === "reveal") advance(g, now);
  } else if (g.phase === "guessing" && g.mode === "telephone" && g.currentTurn.playerId === playerId) {
    g.chain.push({ step: g.chainStep, kind: "guess", playerId, guess: "???", skipped: true });
    advanceTelephoneStep(g, now);
  }
}
