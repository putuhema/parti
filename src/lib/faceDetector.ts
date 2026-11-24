import type { Blendshapes } from "../../convex/lib/face/expressions";

export type LiveFaceTracker = {
  detect: (video: HTMLVideoElement, nowMs: number) => Blendshapes | null;
  close: () => void;
};

let facePromise: Promise<LiveFaceTracker | null> | null = null;

/**
 * Lazily initializes MediaPipe FaceLandmarker (52 ARKit blendshapes) in the browser.
 * Falls back cleanly to null if offline/WebGL fails so Emoji Face Match still works camera-only.
 */
export async function loadFaceTracker(): Promise<LiveFaceTracker | null> {
  if (typeof window === "undefined") return null;
  if (facePromise) return facePromise;

  facePromise = (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm",
      );
      const modelUrl =
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
      let landmarker;
      try {
        landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
          numFaces: 1,
        });
      } catch {
        landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
          numFaces: 1,
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
            const cats = res.faceBlendshapes?.[0]?.categories;
            if (!cats || cats.length === 0) return null;
            const map: Blendshapes = {};
            for (const c of cats) map[c.categoryName] = c.score;
            return map;
          } catch {
            return null;
          }
        },
        close() {
          try {
            landmarker.close();
          } catch {}
          facePromise = null;
        },
      };
    } catch {
      facePromise = null;
      return null;
    }
  })();

  return facePromise;
}
