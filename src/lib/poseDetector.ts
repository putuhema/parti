import type { PoseJoints, Pt } from "../../convex/lib/pose/poses";

export type RawLandmark = { x: number; y: number; visibility?: number };

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function unitVec(from: Pt, to: Pt): Pt {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-5) return [0, 0];
  return [dx / len, dy / len];
}

function cosineSim(a: Pt, b: Pt): number {
  const dot = a[0] * b[0] + a[1] * b[1];
  return Math.max(-1, Math.min(1, dot));
}

export function mirrorJoints(j: PoseJoints): PoseJoints {
  const flip = ([x, y]: Pt): Pt => [1 - x, y];
  return {
    head: flip(j.head),
    neck: flip(j.neck),
    lShoulder: flip(j.rShoulder),
    rShoulder: flip(j.lShoulder),
    lElbow: flip(j.rElbow),
    rElbow: flip(j.lElbow),
    lWrist: flip(j.rWrist),
    rWrist: flip(j.lWrist),
    lHip: flip(j.rHip),
    rHip: flip(j.lHip),
  };
}

/**
 * Convert MediaPipe 33-point landmarks into viewer-space PoseJoints.
 * When `mirrored` is true (selfie front camera), x is flipped (`1 - x`) so
 * viewer-left matches anatomical left (indices 11/13/15/23).
 */
export function landmarksToJoints(lms: readonly RawLandmark[], mirrored: boolean): PoseJoints | null {
  if (lms.length < 25) return null;
  const pt = (idx: number): Pt => {
    const l = lms[idx];
    return [mirrored ? 1 - l.x : l.x, l.y];
  };
  const lS = mirrored ? pt(11) : pt(12);
  const rS = mirrored ? pt(12) : pt(11);
  const lE = mirrored ? pt(13) : pt(14);
  const rE = mirrored ? pt(14) : pt(13);
  const lW = mirrored ? pt(15) : pt(16);
  const rW = mirrored ? pt(16) : pt(15);
  const lH = mirrored ? pt(23) : pt(24);
  const rH = mirrored ? pt(24) : pt(23);
  const head = pt(0);
  const neck: Pt = [(lS[0] + rS[0]) / 2, (lS[1] + rS[1]) / 2];

  // Ensure shoulders are at least minimally visible
  const minVis = Math.min(lms[11].visibility ?? 1, lms[12].visibility ?? 1);
  if (minVis < 0.25) return null;

  return {
    head,
    neck,
    lShoulder: lS,
    rShoulder: rS,
    lElbow: lE,
    rElbow: rE,
    lWrist: lW,
    rWrist: rW,
    lHip: lH,
    rHip: rH,
  };
}

function scoreOnce(detected: PoseJoints, target: PoseJoints): number {
  // 1. Limb angle cosine similarity (4 arm segments)
  const pairs: [keyof PoseJoints, keyof PoseJoints][] = [
    ["lShoulder", "lElbow"],
    ["lElbow", "lWrist"],
    ["rShoulder", "rElbow"],
    ["rElbow", "rWrist"],
  ];
  let limbSum = 0;
  for (const [a, b] of pairs) {
    const c = cosineSim(unitVec(detected[a], detected[b]), unitVec(target[a], target[b]));
    limbSum += Math.pow((c + 1) / 2, 1.3);
  }
  const limbScore = limbSum / pairs.length;

  // 2. Shoulder-width-normalized wrist & elbow placement relative to neck
  const dScale = Math.max(0.08, dist(detected.lShoulder, detected.rShoulder));
  const tScale = Math.max(0.08, dist(target.lShoulder, target.rShoulder));
  const norm = (p: Pt, origin: Pt, scale: number): Pt => [(p[0] - origin[0]) / scale, (p[1] - origin[1]) / scale];

  const keyPts: (keyof PoseJoints)[] = ["lElbow", "rElbow", "lWrist", "rWrist"];
  let posSum = 0;
  for (const k of keyPts) {
    const dp = norm(detected[k], detected.neck, dScale);
    const tp = norm(target[k], target.neck, tScale);
    const d = dist(dp, tp);
    posSum += Math.exp(-d * 0.72);
  }
  const posScore = posSum / keyPts.length;

  const combined = (limbScore * 0.58 + posScore * 0.42) * 100;
  return Math.max(0, Math.min(100, Math.round(combined)));
}

/**
 * Computes a 0..100 match score between detected viewer-space joints and a target pose.
 * When `mirrorInvariant` is true, allows doing asymmetric poses with either left or right arm.
 */
export function scorePose(detected: PoseJoints, target: PoseJoints, mirrorInvariant = false): number {
  const direct = scoreOnce(detected, target);
  if (!mirrorInvariant) return direct;
  return Math.max(direct, scoreOnce(detected, mirrorJoints(target)));
}

export type LivePoseTracker = {
  detect: (video: HTMLVideoElement, nowMs: number) => RawLandmark[] | null;
  close: () => void;
};

let trackerPromise: Promise<LivePoseTracker | null> | null = null;

/**
 * Lazily initializes MediaPipe PoseLandmarker in the browser (WASM + lite model).
 * Returns null gracefully if offline, blocked, or WebGL/WASM fails so the game falls back to camera-only mode.
 */
export async function loadPoseTracker(): Promise<LivePoseTracker | null> {
  if (typeof window === "undefined") return null;
  if (trackerPromise) return trackerPromise;

  trackerPromise = (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm",
      );
      const modelUrl =
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
      let landmarker;
      try {
        landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }

      let lastTs = -1;
      return {
        detect(video: HTMLVideoElement, nowMs: number) {
          if (video.readyState < 2 || video.videoWidth === 0) return null;
          const ts = Math.max(lastTs + 1, Math.floor(nowMs));
          lastTs = ts;
          try {
            const res = landmarker.detectForVideo(video, ts);
            const first = res.landmarks?.[0];
            return first && first.length >= 25 ? (first as RawLandmark[]) : null;
          } catch {
            return null;
          }
        },
        close() {
          try {
            landmarker.close();
          } catch {}
          trackerPromise = null;
        },
      };
    } catch {
      trackerPromise = null;
      return null;
    }
  })();

  return trackerPromise;
}
