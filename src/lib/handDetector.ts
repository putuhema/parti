export type HandTip = {
  /** Normalized viewer-space x (0..1), y (0..1) of index fingertip. */
  x: number;
  y: number;
  /** Normalized viewer-space thumb tip for visual pinch feedback. */
  thumbX: number;
  thumbY: number;
  /** True when user is pointing (index extended, NOT pinched with thumb) -> pen DOWN! */
  drawing: boolean;
};

export type LiveHandTracker = {
  detect: (video: HTMLVideoElement, nowMs: number, mirrored: boolean) => HandTip | null;
  close: () => void;
};

let handPromise: Promise<LiveHandTracker | null> | null = null;

/**
 * Lazily initializes MediaPipe HandLandmarker in the browser for Air Doodle.
 * Tracks index fingertip (landmark 8) vs thumb tip (landmark 4) for pinch-to-lift pen control.
 */
export async function loadHandTracker(): Promise<LiveHandTracker | null> {
  if (typeof window === "undefined") return null;
  if (handPromise) return handPromise;

  handPromise = (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm",
      );
      const modelUrl =
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
      let landmarker;
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 1,
        });
      } catch {
        landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 1,
        });
      }

      let lastTs = -1;
      return {
        detect(video: HTMLVideoElement, nowMs: number, mirrored: boolean) {
          if (video.readyState < 2 || video.videoWidth === 0) return null;
          const ts = Math.max(lastTs + 1, Math.floor(nowMs));
          lastTs = ts;
          try {
            const res = landmarker.detectForVideo(video, ts);
            const lm = res.landmarks?.[0];
            if (!lm || lm.length < 21) return null;
            const wrist = lm[0];
            const thumb = lm[4];
            const indexPip = lm[6];
            const indexTip = lm[8];
            const pinchDist = Math.hypot(thumb.x - indexTip.x, thumb.y - indexTip.y);
            // Index extended in any direction (tip further from wrist than middle joint) & not pinched
            const tipFromWrist = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
            const pipFromWrist = Math.hypot(indexPip.x - wrist.x, indexPip.y - wrist.y);
            const indexExtended = tipFromWrist > pipFromWrist * 1.1;
            const drawing = indexExtended && pinchDist > 0.065;
            return {
              x: mirrored ? 1 - indexTip.x : indexTip.x,
              y: indexTip.y,
              thumbX: mirrored ? 1 - thumb.x : thumb.x,
              thumbY: thumb.y,
              drawing,
            };
          } catch {
            return null;
          }
        },
        close() {
          try {
            landmarker.close();
          } catch {}
          handPromise = null;
        },
      };
    } catch {
      handPromise = null;
      return null;
    }
  })();

  return handPromise;
}
