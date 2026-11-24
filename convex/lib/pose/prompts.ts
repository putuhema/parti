/**
 * 48 expressive, camera-friendly prompts for Secret Prompt (charades) and Pose Telephone.
 */
export const PROMPTS: readonly string[] = [
  "Statue of Liberty",
  "Dodging a bee",
  "Titanic bow scene",
  "Caught stealing midnight snacks",
  "Holding a giant fish",
  "Walking into a spiderweb",
  "DJ dropping the beat",
  "Winning an Oscar",
  "Trying to sneeze",
  "Spotting your crush",
  "Surfing a giant wave",
  "Opening a stuck pickle jar",
  "Rockstar guitar solo",
  "Sneaking past your parents",
  "Lifting a heavy barbell",
  "T-Rex trying to clap",
  "Reading tiny fine print",
  "Casting a magic spell",
  "Scoring the winning goal",
  "Taking a dramatic selfie",
  "Spilling hot coffee",
  "Directing an orchestra",
  "Hailing a taxi in the rain",
  "Balancing a tray of drinks",
  "Finding a spider on your desk",
  "Trying to catch a falling phone",
  "Boxing champion belt",
  "Shooting a basketball",
  "Rowing a boat",
  "Peeking around a corner",
  "Blowing out birthday candles",
  "Vampire blocking the sun",
  "Yoga guru levitating",
  "Cowboy quick draw",
  "Opera singer hitting a high note",
  "Cheerleader pom-poms",
  "Spy talking into wrist watch",
  "Chef sprinkling salt",
  "Karate kid crane kick",
  "Ghost saying boo",
  "Bouncer checking IDs",
  "Mummy waking up",
  "Cat knocking over a cup",
  "Archery bullseye",
  "Supermodel on a runway",
  "Referee calling timeout",
  "Pirate looking through telescope",
  "Sending a giant air kiss",
];

/** Normalize a guess or prompt for forgiving matching. */
export function normalizeGuess(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(a|an|the|to|of|in|on|at|with|your|my)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a guess closely matches the secret prompt. */
export function isCloseGuess(guess: string, prompt: string): boolean {
  const g = normalizeGuess(guess);
  const p = normalizeGuess(prompt);
  if (!g || !p) return false;
  if (g === p) return true;
  if (g.length >= 4 && (p.includes(g) || g.includes(p))) return true;
  const gWords = g.split(" ").filter((w) => w.length >= 3);
  const pWords = p.split(" ").filter((w) => w.length >= 3);
  if (pWords.length === 0 || gWords.length === 0) return false;
  const hits = pWords.filter((pw) => gWords.some((gw) => gw === pw || (gw.length >= 4 && pw.startsWith(gw))));
  return hits.length >= Math.max(1, Math.ceil(pWords.length * 0.6));
}
