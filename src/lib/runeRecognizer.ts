import type { SpellId } from "../../convex/lib/spell/spells";

export type Pt2 = readonly [number, number];

export type RuneMatch = {
  spell: SpellId;
  confidence: number; // 0..1
};

function dist(a: Pt2, b: Pt2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pathLength(pts: readonly Pt2[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** Resample a polyline into N evenly spaced points. */
function resample(pts: readonly Pt2[], n: number): Pt2[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]);
  const total = pathLength(pts);
  if (total < 1e-4) return Array.from({ length: n }, () => pts[0]);
  const step = total / (n - 1);
  const out: Pt2[] = [pts[0]];
  let accum = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i];
    let d = dist(prev, cur);
    while (accum + d >= step && out.length < n) {
      const t = (step - accum) / d;
      const nx = prev[0] + t * (cur[0] - prev[0]);
      const ny = prev[1] + t * (cur[1] - prev[1]);
      const np: Pt2 = [nx, ny];
      out.push(np);
      prev = np;
      d = dist(prev, cur);
      accum = 0;
    }
    accum += d;
    prev = cur;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Geometric air-rune recognizer for Spellcaster Duel:
 * - ⭕ Circle (closed loop) -> "shield"
 * - ⚡ Zigzag (2+ sharp direction reversals) -> "lightning"
 * - △ Triangle / Peak (^ shape) -> "fire"
 * - | Vertical line -> "heal"
 * - — Horizontal slash -> "frost"
 */
export function recognizeRune(rawPts: readonly Pt2[]): RuneMatch | null {
  if (rawPts.length < 5) return null;
  const totalLen = pathLength(rawPts);
  if (totalLen < 0.14) return null; // Too tiny to be a real spell

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of rawPts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(1e-4, maxX - minX);
  const h = Math.max(1e-4, maxY - minY);
  const diag = Math.hypot(w, h);
  if (diag < 0.1) return null;

  const start = rawPts[0];
  const end = rawPts[rawPts.length - 1];
  const endToEnd = dist(start, end);
  const closureRatio = endToEnd / diag; // small when start & end meet!

  const pts = resample(rawPts, 24);

  // Measure sharp corners (direction reversals) & signed turning angle
  let sharpTurns = 0;
  let totalAbsTurn = 0;
  let signedTurn = 0;
  let lastTurnIdx = -4;

  for (let i = 2; i < pts.length - 2; i++) {
    const v1x = pts[i][0] - pts[i - 2][0];
    const v1y = pts[i][1] - pts[i - 2][1];
    const v2x = pts[i + 2][0] - pts[i][0];
    const v2y = pts[i + 2][1] - pts[i][1];
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-4 || l2 < 1e-4) continue;
    const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
    const cross = v1x * v2y - v1y * v2x;
    const angle = Math.acos(dot);
    totalAbsTurn += angle;
    signedTurn += cross >= 0 ? angle : -angle;
    if (angle > 1.05 && i - lastTurnIdx >= 4) {
      sharpTurns += 1;
      lastTurnIdx = i;
    }
  }

  // 1. Straight lines first (very low curvature + high elongation)
  const straightness = endToEnd / totalLen;
  if (straightness > 0.84) {
    if (h > w * 1.45) return { spell: "heal", confidence: 0.92 };
    if (w > h * 1.45) return { spell: "frost", confidence: 0.92 };
  }

  // 2. Closed shapes: Circle (Shield) vs Triangle (Fireball)
  if (closureRatio < 0.42 && totalLen > diag * 1.9) {
    // Circles turn smoothly in one direction with few sharp corners
    if (sharpTurns <= 1 && Math.abs(signedTurn) > 3.5) {
      return { spell: "shield", confidence: 0.92 };
    }
    // Triangles have 2-3 sharp corners
    if (sharpTurns >= 2) {
      return { spell: "fire", confidence: 0.88 };
    }
    return { spell: "shield", confidence: 0.8 };
  }

  // 3. Zigzag (Lightning): 2+ sharp turns AND alternating direction (low net signed turn relative to total turn)
  if (sharpTurns >= 2 && Math.abs(signedTurn) < totalAbsTurn * 0.65) {
    return { spell: "lightning", confidence: 0.9 };
  }

  // 4. Peak / Caret ^ (Fireball): goes up to a top apex near the middle, then back down
  const mid = pts[Math.floor(pts.length / 2)];
  const midIsHigh = mid[1] < Math.min(start[1], end[1]) - h * 0.35;
  if (midIsHigh && w > 0.08 && h > 0.08) {
    return { spell: "fire", confidence: 0.88 };
  }

  // 5. Fallback by dominant shape
  if (sharpTurns >= 2) return { spell: "lightning", confidence: 0.78 };
  if (h > w * 1.35) return { spell: "heal", confidence: 0.78 };
  if (w > h * 1.35) return { spell: "frost", confidence: 0.78 };
  return { spell: "fire", confidence: 0.7 };
}
