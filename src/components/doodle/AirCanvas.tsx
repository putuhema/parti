"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { feedback } from "@/lib/feedback";
import { loadHandTracker, type HandTip, type LiveHandTracker } from "@/lib/handDetector";

export const DOODLE_COLORS = ["#FF5B8A", "#FFDE66", "#35D0FF", "#3AD67D", "#FFFFFF"] as const;

export function drawStrokesOnCtx(ctx: CanvasRenderingContext2D, strokes: readonly (readonly number[])[], w: number, h: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    if (s.length < 5) continue;
    const color = DOODLE_COLORS[s[0] % DOODLE_COLORS.length] ?? "#FFFFFF";
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo((s[1] / 1000) * w, (s[2] / 1000) * h);
    for (let i = 3; i + 1 < s.length; i += 2) {
      ctx.lineTo((s[i] / 1000) * w, (s[i + 1] / 1000) * h);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

/** Read-only glowing neon doodle board for guessers and reveal screen. */
export function DoodleBoard({ strokes }: { strokes: readonly (readonly number[])[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawStrokesOnCtx(ctx, strokes, c.width, c.height);
  }, [strokes]);

  return (
    <div className="ad-board">
      <canvas ref={ref} width={640} height={480} className="ad-canvas" />
      {strokes.length === 0 && (
        <div className="ad-empty">Waiting for neon strokes in the air… ✨</div>
      )}
    </div>
  );
}

/** Live camera + MediaPipe HandLandmarker air-drawing stage (with touch/mouse fallback). */
export function AirCanvas({
  roundKey,
  onSync,
}: {
  roundKey: string;
  onSync: (strokes: number[][]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<number[][]>([]);
  const activeStrokeRef = useRef<number[] | null>(null);
  const dirtyRef = useRef(false);
  const colorIdxRef = useRef(0);
  const pointerDownRef = useRef(false);
  const smoothPtRef = useRef<{ x: number; y: number } | null>(null);

  const [colorIdx, setColorIdx] = useState(0);
  const [camReady, setCamReady] = useState(false);
  const [handState, setHandState] = useState<"loading" | "drawing" | "pinched" | "none" | "off">("loading");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    colorIdxRef.current = colorIdx;
  }, [colorIdx]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      activeStrokeRef.current = null;
      smoothPtRef.current = null;
    }
  }, [paused]);

  useEffect(() => {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    smoothPtRef.current = null;
    dirtyRef.current = true;
  }, [roundKey]);

  // Camera stream — <video> is always mounted so videoRef.current is always ready!
  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    async function init() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (alive) setCamReady(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setCamReady(true);
      } catch {
        if (alive) setCamReady(false);
      }
    }
    void init();
    return () => {
      alive = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const pushPoint = useCallback((nx: number, ny: number) => {
    const qx = Math.max(0, Math.min(1000, Math.round(nx * 1000)));
    const qy = Math.max(0, Math.min(1000, Math.round(ny * 1000)));
    let cur = activeStrokeRef.current;
    if (!cur) {
      cur = [colorIdxRef.current, qx, qy];
      activeStrokeRef.current = cur;
      strokesRef.current = [...strokesRef.current.slice(-59), cur];
      dirtyRef.current = true;
      return;
    }
    const lx = cur[cur.length - 2];
    const ly = cur[cur.length - 1];
    if (Math.hypot(qx - lx, qy - ly) >= 10 && cur.length < 81) {
      cur.push(qx, qy);
      dirtyRef.current = true;
    } else if (cur.length >= 81) {
      const next = [colorIdxRef.current, lx, ly, qx, qy];
      activeStrokeRef.current = next;
      strokesRef.current = [...strokesRef.current.slice(-59), next];
      dirtyRef.current = true;
    }
  }, []);

  // Live MediaPipe HandLandmarker + canvas render loop
  useEffect(() => {
    let alive = true;
    let raf = 0;
    let tracker: LiveHandTracker | null = null;
    let lastDetect = 0;
    let cursor: HandTip | null = null;

    if (camReady) {
      setHandState("loading");
      void loadHandTracker().then((t) => {
        if (!alive) return;
        tracker = t;
        setHandState(t ? "none" : "off");
      });
    } else {
      setHandState("off");
    }

    const loop = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);

      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      if (camReady && tracker && videoRef.current && now - lastDetect >= 40) {
        lastDetect = now;
        const tip = tracker.detect(videoRef.current, now, true);
        if (tip) {
          // Smooth fingertip coordinates to reduce webcam jitter
          const prev = smoothPtRef.current;
          const sx = prev ? prev.x * 0.45 + tip.x * 0.55 : tip.x;
          const sy = prev ? prev.y * 0.45 + tip.y * 0.55 : tip.y;
          smoothPtRef.current = { x: sx, y: sy };
          cursor = { ...tip, x: sx, y: sy };

          if (!pausedRef.current && !pointerDownRef.current) {
            if (tip.drawing) {
              setHandState("drawing");
              pushPoint(sx, sy);
            } else {
              setHandState("pinched");
              activeStrokeRef.current = null;
            }
          }
        } else {
          cursor = null;
          smoothPtRef.current = null;
          if (!pointerDownRef.current) {
            activeStrokeRef.current = null;
            setHandState("none");
          }
        }
      }

      ctx.clearRect(0, 0, c.width, c.height);
      drawStrokesOnCtx(ctx, strokesRef.current, c.width, c.height);

      // Draw fingertip + thumb pinch guide so it's unmistakable how the air pen works
      if (cursor) {
        const px = cursor.x * c.width;
        const py = cursor.y * c.height;
        const tx = cursor.thumbX * c.width;
        const ty = cursor.thumbY * c.height;
        const penDown = cursor.drawing && !pausedRef.current;

        // Subtle pinch guide line
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.setLineDash([]);

        // Thumb dot
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fill();

        // Index fingertip pen cursor
        ctx.beginPath();
        ctx.arc(px, py, penDown ? 11 : 9, 0, Math.PI * 2);
        if (penDown) {
          ctx.fillStyle = DOODLE_COLORS[colorIdxRef.current];
          ctx.shadowColor = DOODLE_COLORS[colorIdxRef.current];
          ctx.shadowBlur = 14;
          ctx.fill();
        } else {
          ctx.fillStyle = "rgba(25,18,32,0.45)";
          ctx.fill();
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [camReady, pushPoint]);

  // Throttled Convex stroke sync
  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        onSync(strokesRef.current.map((s) => [...s]));
      }
    }, 260);
    return () => clearInterval(t);
  }, [onSync]);

  function getPointerNorm(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  return (
    <div className="ps-cam-wrap">
      <div className="ad-stage">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="ps-video mirror"
          style={{ opacity: camReady ? 0.65 : 0 }}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="ad-canvas interactive"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pointerDownRef.current = true;
            activeStrokeRef.current = null;
            const { x, y } = getPointerNorm(e);
            pushPoint(x, y);
          }}
          onPointerMove={(e) => {
            if (!pointerDownRef.current) return;
            const { x, y } = getPointerNorm(e);
            pushPoint(x, y);
          }}
          onPointerUp={() => {
            pointerDownRef.current = false;
            activeStrokeRef.current = null;
          }}
        />

        <div className="ps-cam-hud">
          <span className={`ps-ai-pill ${handState === "drawing" && !paused ? "hot" : ""}`}>
            {paused
              ? "⏸️ Air pen paused (tap ▶️)"
              : handState === "drawing"
                ? "☝️ Drawing in air!"
                : handState === "pinched"
                  ? "🤏 Pen lifted (unpinch to draw)"
                  : handState === "none"
                    ? "✋ Hold your hand up to camera"
                    : handState === "loading"
                      ? "Loading hand tracking…"
                      : "✍️ Draw with touch or mouse"}
          </span>
          <button
            type="button"
            className={`ps-hud-btn ${paused ? "on" : ""}`}
            onClick={() => {
              feedback.tap();
              setPaused((p) => !p);
            }}
            title={paused ? "Resume air pen" : "Pause air pen"}
          >
            {paused ? "▶️" : "⏸️"}
          </button>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: "var(--muted)", textAlign: "center" }}>
        ☝️ Point 1 finger to draw · 🤏 Pinch thumb + index to lift pen · or drag directly on canvas
      </p>

      <div className="ad-toolbar">
        <div style={{ display: "flex", gap: 6 }}>
          {DOODLE_COLORS.map((c, idx) => (
            <button
              key={c}
              type="button"
              className={`ad-swatch ${colorIdx === idx ? "on" : ""}`}
              style={{ background: c }}
              aria-label={`Color ${idx + 1}`}
              onClick={() => {
                feedback.tap();
                setColorIdx(idx);
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="ps-skip-btn"
            onClick={() => {
              feedback.tap();
              strokesRef.current = strokesRef.current.slice(0, -1);
              activeStrokeRef.current = null;
              dirtyRef.current = true;
            }}
          >
            ↩ Undo
          </button>
          <button
            type="button"
            className="ps-skip-btn"
            onClick={() => {
              feedback.tap();
              strokesRef.current = [];
              activeStrokeRef.current = null;
              dirtyRef.current = true;
            }}
          >
            🗑️ Clear
          </button>
        </div>
      </div>
    </div>
  );
}
