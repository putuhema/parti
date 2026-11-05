// Player ratings kept on this device. The bot and puzzles adapt to them.

export interface Skill { rating: number; games: number; peak: number }

const KEYS = { chess: "parti:skill-chess", puzzle: "parti:skill-puzzle" } as const;
export type SkillKind = keyof typeof KEYS;

const START: Record<SkillKind, number> = { chess: 700, puzzle: 800 };

export function loadSkill(kind: SkillKind): Skill {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS[kind]) ?? "null");
    if (v && typeof v.rating === "number") return { rating: v.rating, games: v.games ?? 0, peak: v.peak ?? v.rating };
  } catch {}
  return { rating: START[kind], games: 0, peak: START[kind] };
}

export function saveSkill(kind: SkillKind, s: Skill) {
  try { localStorage.setItem(KEYS[kind], JSON.stringify(s)); } catch {}
}

/** Elo update. Moves fast for new players so the bot finds their level quickly. */
export function rate(s: Skill, opponent: number, score: 0 | 0.5 | 1, weight = 1): Skill {
  const expected = 1 / (1 + 10 ** ((opponent - s.rating) / 400));
  const k = (s.games < 8 ? 64 : s.games < 25 ? 40 : 24) * weight;
  const rating = Math.round(Math.max(200, Math.min(2600, s.rating + k * (score - expected))));
  return { rating, games: s.games + 1, peak: Math.max(s.peak, rating) };
}

/** A friendly name for a rating band. */
export function rank(rating: number) {
  if (rating < 600) return "Rookie";
  if (rating < 850) return "Scout";
  if (rating < 1100) return "Knight";
  if (rating < 1350) return "Captain";
  if (rating < 1600) return "Champion";
  if (rating < 1900) return "Master";
  return "Grandmaster";
}
