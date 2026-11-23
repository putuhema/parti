// A small stick-figure rig for Juragan Nusantara, drawn on canvas.
// Technique after goofyfish (nilbuild/goofyfish, MIT): keyframe poses of a few joints, elbows and knees
// solved with two-bone IK so they only bend the way real ones do, eased blends between queued poses,
// and a little breathing so a figure is never frozen. This is an original implementation of those ideas.

export type V = [number, number];
/** Joints in figure space: facing right, y down, feet near y = 0. Elbows and knees are solved, not posed. */
export type Pose = { head: V; chest: V; hip: V; hF: V; hB: V; fF: V; fB: V };
const KEYS = ["head", "chest", "hip", "hF", "hB", "fF", "fB"] as const;

export const THIGH = 15, SHIN = 15, UARM = 11, FARM = 11;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpV = (a: V, b: V, k: number): V => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

export const EASE = {
  soft: (k: number) => 0.5 - Math.cos(Math.PI * k) / 2,
  out: (k: number) => 1 - (1 - k) * (1 - k),
  in: (k: number) => k * k,
  back: (k: number) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2),
};
export type Ease = keyof typeof EASE;

const BASE: Pose = { head: [1, -60], chest: [0, -48], hip: [0, -27], hF: [5, -26], hB: [-4, -27], fF: [5, 0], fB: [-5, 0] };
/** Make a pose by moving a few joints of the standing pose. */
const mk = (o: Partial<Pose>): Pose => ({ ...BASE, ...o });

export const P = {
  stand: BASE,
  crouch: mk({ head: [3, -50], chest: [2, -38], hip: [-2, -19], hF: [10, -24], hB: [-6, -22] }),
  leap: mk({ head: [2, -64], chest: [1, -52], hip: [0, -31], hF: [12, -58], hB: [-10, -54], fF: [7, -6], fB: [-6, -4] }),
  land: mk({ head: [3, -52], chest: [2, -40], hip: [-1, -21], hF: [13, -34], hB: [-9, -32] }),
  cheer: mk({ head: [0, -62], chest: [0, -50], hip: [0, -28], hF: [9, -76], hB: [-9, -76] }),
  slump: mk({ head: [7, -50], chest: [4, -42], hip: [0, -25], hF: [7, -18], hB: [1, -18], fF: [4, 0], fB: [-4, 0] }),
  point: mk({ hF: [24, -50], hB: [-3, -28] }),
  proud: mk({ head: [-1, -61], chest: [-1, -49], hF: [8, -36], hB: [6, -36] }), // hands on hips, chin up
  windup: mk({ head: [-3, -57], chest: [-3, -46], hF: [-14, -52], hB: [8, -40] }),
  throw: mk({ head: [5, -58], chest: [4, -46], hF: [22, -58], hB: [-8, -34] }),
  give: mk({ head: [3, -59], chest: [2, -47], hF: [20, -40], hB: [-3, -28] }),
  handsUp: mk({ head: [0, -59], hF: [7, -74], hB: [-6, -74] }),
  grip: mk({ head: [4, -58], chest: [2, -46], hF: [13, -52], hB: [11, -48] }), // hands on the bars of a cell
  shrug: mk({ head: [0, -58], hF: [13, -46], hB: [-12, -46] }),
  scratch: mk({ head: [2, -59], hF: [7, -64], hB: [-4, -27] }),
  sit: mk({ head: [2, -44], chest: [0, -33], hip: [-3, -13], hF: [12, -24], hB: [8, -23], fF: [14, 0], fB: [10, 0] }),
  sleep: mk({ head: [11, -32], chest: [4, -31], hip: [-3, -13], hF: [16, -25], hB: [12, -24], fF: [14, 0], fB: [10, 0] }),
  walkA: mk({ hF: [9, -29], hB: [-8, -28], fF: [9, 0], fB: [-9, -2] }),
  walkB: mk({ hF: [-6, -28], hB: [8, -29], fF: [-8, -2], fB: [9, 0] }),
  carry: mk({ hF: [6, -25], hB: [-3, -28] }),
  danceA: mk({ head: [-3, -60], chest: [-2, -48], hip: [1, -26], hF: [14, -66], hB: [-12, -38], fF: [8, 0], fB: [-6, -5] }),
  danceB: mk({ head: [3, -60], chest: [2, -48], hip: [-1, -26], hF: [12, -38], hB: [-10, -66], fF: [7, -5], fB: [-8, 0] }),
  snip: mk({ hF: [21, -44], hB: [14, -42] }),
  fall: mk({ head: [-22, -18], chest: [-14, -16], hip: [0, -9], hF: [-18, -30], hB: [-6, -26], fF: [14, -10], fB: [10, -2] }),
} satisfies Record<string, Pose>;
export type PoseName = keyof typeof P;

export function blend(a: Pose, b: Pose, k: number): Pose {
  const o = {} as Pose;
  for (const key of KEYS) o[key] = lerpV(a[key], b[key], k);
  return o;
}

/** A small rise and fall of the upper body, so idle figures look alive. */
export function breathe(p: Pose, amt: number): Pose {
  if (!amt) return p;
  const up = (v: V, k: number): V => [v[0], v[1] - amt * k];
  return { ...p, head: up(p.head, 1), chest: up(p.chest, 0.8), hF: up(p.hF, 0.5), hB: up(p.hB, 0.5) };
}

/**
 * Two-bone IK: the middle joint for a limb from `a` to `b`. `bend` picks which side it folds to, in the
 * figure's facing-right space: for a limb pointing down, -1 pushes the joint forward (knees) and +1 back (elbows).
 */
export function ik(a: V, b: V, l1: number, l2: number, bend: number): V {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  if (d < 0.01) return [a[0], a[1] + l1];
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const ux = dx / d, uy = dy / d;
  // Perpendicular to the limb; pick the side by the bend sign.
  return [a[0] + ux * along - uy * h * bend, a[1] + uy * along + ux * h * bend];
}

type Step = { pose: Pose; d: number; ez: Ease };
/** Plays queued poses with eased blends. push(...) to queue; loop(...) repeats a cycle until the queue is cleared. */
export class Actor {
  pose: Pose;
  private from: Pose;
  private q: Step[] = [];
  private step: Step | null = null;
  private t = 0;
  private cycle: Step[] | null = null;
  constructor(pose: Pose = P.stand) {
    this.pose = pose;
    this.from = pose;
  }
  push(...steps: { pose: PoseName | Pose; d: number; ez?: Ease }[]) {
    for (const s of steps) this.q.push({ pose: typeof s.pose === "string" ? P[s.pose] : s.pose, d: Math.max(0.001, s.d), ez: s.ez ?? "soft" });
  }
  /** Replace whatever was queued: go straight into these steps from where the figure is now. */
  set(...steps: { pose: PoseName | Pose; d: number; ez?: Ease }[]) {
    this.q = [];
    this.cycle = null;
    if (this.step) { this.from = this.pose; this.step = null; }
    this.push(...steps);
  }
  loop(...steps: { pose: PoseName | Pose; d: number; ez?: Ease }[]) {
    this.set(...steps);
    this.cycle = [...this.q];
  }
  get idle() { return !this.step && !this.q.length; }
  update(dt: number) {
    for (let guard = 0; guard < 8; guard++) {
      if (!this.step) {
        if (!this.q.length && this.cycle) this.q = [...this.cycle];
        const next = this.q.shift();
        if (!next) return;
        this.step = next;
        this.from = this.pose;
        this.t = 0;
      }
      this.t += dt;
      const k = Math.min(1, this.t / this.step.d);
      this.pose = blend(this.from, this.step.pose, EASE[this.step.ez](k));
      if (k < 1) return;
      dt = this.t - this.step.d;
      this.pose = this.step.pose;
      this.step = null;
    }
  }
}

export type Look = { shirt: string; ink?: string; far?: string; peci?: boolean; flip?: boolean; scale?: number; alpha?: number; rot?: number; sx?: number; sy?: number };

/**
 * Draw a figure with its feet at (x, y). Back limbs are grey for depth; the torso is a shirt in the player's
 * colour; a solid head wears a black peci. sx/sy squash and stretch the whole figure around its feet.
 */
export function drawFigure(ctx: CanvasRenderingContext2D, pose: Pose, x: number, y: number, look: Look) {
  const ink = look.ink ?? "#231B1A";
  const far = look.far ?? "#9A9087";
  const s = look.scale ?? 1;
  ctx.save();
  ctx.translate(x, y);
  if (look.rot) ctx.rotate(look.rot);
  ctx.scale((look.flip ? -1 : 1) * s * (look.sx ?? 1), s * (look.sy ?? 1));
  ctx.globalAlpha *= look.alpha ?? 1;
  // Small figures get relatively thicker lines so they still read as figures.
  const th = Math.max(1, 0.85 / s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const p = pose;
  const kF = ik(p.hip, p.fF, THIGH, SHIN, -1), kB = ik(p.hip, p.fB, THIGH, SHIN, -1);
  const sh: V = [p.chest[0], p.chest[1] + 2];
  const eF = ik(sh, p.hF, UARM, FARM, 1), eB = ik(sh, p.hB, UARM, FARM, 1);
  const line = (pts: V[], w: number, col: string) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  // back limbs
  line([p.hip, kB, p.fB], 3.4 * th, far);
  line([sh, eB, p.hB], 2.8 * th, far);
  // torso: an ink outline with the shirt colour inside
  line([p.chest, p.hip], 9 * th, ink);
  line([p.chest, p.hip], 6 * th, look.shirt);
  // front limbs
  line([p.hip, kF, p.fF], 3.4 * th, ink);
  line([sh, eF, p.hF], 2.8 * th, ink);
  // head and peci
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(p.head[0], p.head[1], 5.6, 0, Math.PI * 2);
  ctx.fill();
  if (look.peci !== false) {
    const [hx, hy] = p.head;
    ctx.beginPath();
    ctx.moveTo(hx - 5.4, hy - 2.4);
    ctx.lineTo(hx - 4.6, hy - 8.2);
    ctx.lineTo(hx + 4.6, hy - 8.2);
    ctx.lineTo(hx + 5.4, hy - 2.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = look.shirt;
    ctx.fillRect(hx - 4.8, hy - 4.2, 9.6, 1.4);
  }
  ctx.restore();
}
