"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseDef, PoseJoints } from "../../../convex/lib/pose/poses";
import { feedback } from "@/lib/feedback";
import { landmarksToJoints, loadPoseTracker, scorePose, type LivePoseTracker } from "@/lib/poseDetector";
import { PoseFigure } from "./PoseFigure";

type Props = {
  /** Built-in target pose (Classic mode). */
  pose?: PoseDef | null;
  /** Custom target skeleton (Copycat mode). */
  targetJoints?: PoseJoints | null;
  /** Unique key per turn so state resets cleanly even in freeform modes. */
  turnKey: string;
  busy: boolean;
  /** Seconds left on the turn clock; triggers auto-snap at 0 if camera is live. */
  secsLeft: number | null;
  onCapture: (blob: Blob, aiScore?: number, joints?: PoseJoints) => void;
};

const AUTO_HOLD_THRESHOLD = 80;
const AUTO_HOLD_MS = 1100;

export function CameraStage({ pose, targetJoints, turnKey, busy, secsLeft, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const effectiveTarget = pose?.joints ?? targetJoints ?? null;
  const hasTarget = effectiveTarget !== null;

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [showGhost, setShowGhost] = useState(true);
  const [camState, setCamState] = useState<"loading" | "ready" | "error">("loading");
  const [camError, setCamError] = useState("");
  const [aiStatus, setAiStatus] = useState<"loading" | "live" | "off">("loading");
  const [matchPct, setMatchPct] = useState<number | null>(null);
  const [poseDetected, setPoseDetected] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const [shutterCount, setShutterCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  const latestAiRef = useRef<number | undefined>(undefined);
  const latestJointsRef = useRef<PoseJoints | undefined>(undefined);
  const capturedRef = useRef(false);
  const holdStartRef = useRef<number | null>(null);
  const smoothScoreRef = useRef<number | null>(null);

  useEffect(() => {
    capturedRef.current = false;
    holdStartRef.current = null;
    smoothScoreRef.current = null;
    latestAiRef.current = undefined;
    latestJointsRef.current = undefined;
    setMatchPct(null);
    setPoseDetected(false);
    setHoldPct(0);
    setShutterCount(null);
  }, [turnKey]);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    setCamState("loading");
    setCamError("");

    async function initCam() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!active) return;
        setCamState("error");
        setCamError("Camera access isn't available in this browser. You can upload a photo instead!");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 720 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setCamState("ready");
      } catch (err) {
        if (!active) return;
        setCamState("error");
        const msg = err instanceof Error ? err.message : "Camera permission denied";
        setCamError(
          msg.includes("Permission") || msg.includes("NotAllowed")
            ? "Camera permission was blocked. Allow camera access or take a photo below!"
            : msg,
        );
      }
    }

    void initCam();

    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const snapNow = useCallback(() => {
    if (capturedRef.current || busy) return;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    capturedRef.current = true;
    setShutterCount(null);
    setFlash(true);
    feedback.correct();
    setTimeout(() => setFlash(false), 260);

    const targetW = 480;
    const targetH = 640;
    const out = document.createElement("canvas");
    out.width = targetW;
    out.height = targetH;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const targetRatio = targetW / targetH;
    const srcRatio = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (srcRatio > targetRatio) {
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetRatio;
      sy = (vh - sh) / 2;
    }

    ctx.save();
    if (facing === "user") {
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
    ctx.restore();

    out.toBlob(
      (blob) => {
        if (blob) onCapture(blob, latestAiRef.current, latestJointsRef.current);
        else capturedRef.current = false;
      },
      "image/jpeg",
      0.8,
    );
  }, [busy, facing, onCapture]);

  // Real-time MediaPipe pose detection loop
  useEffect(() => {
    if (camState !== "ready") return;
    let alive = true;
    let rafId = 0;
    let tracker: LivePoseTracker | null = null;
    let lastTick = 0;

    setAiStatus("loading");
    void loadPoseTracker().then((t) => {
      if (!alive) return;
      tracker = t;
      setAiStatus(t ? "live" : "off");
    });

    const mirrored = facing === "user";

    const loop = (now: number) => {
      if (!alive) return;
      rafId = requestAnimationFrame(loop);
      if (now - lastTick < 80) return;
      lastTick = now;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !tracker) return;

      const cw = canvas.clientWidth || 320;
      const ch = canvas.clientHeight || 426;
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, cw, ch);

      const lms = tracker.detect(video, now);
      if (!lms) {
        holdStartRef.current = null;
        setHoldPct(0);
        setPoseDetected(false);
        return;
      }

      const joints = landmarksToJoints(lms, mirrored);
      if (!joints) {
        holdStartRef.current = null;
        setHoldPct(0);
        setPoseDetected(false);
        return;
      }

      latestJointsRef.current = joints;
      setPoseDetected(true);

      let color = "#FF5B8A";
      if (effectiveTarget) {
        const raw = scorePose(joints, effectiveTarget, pose?.mirrorInvariant ?? false);
        const prev = smoothScoreRef.current ?? raw;
        const smoothed = Math.round(prev * 0.55 + raw * 0.45);
        smoothScoreRef.current = smoothed;
        latestAiRef.current = smoothed;
        setMatchPct(smoothed);
        color = smoothed >= AUTO_HOLD_THRESHOLD ? "#2CC770" : smoothed >= 60 ? "#FFBE3B" : "#FF5B74";

        if (!capturedRef.current && !busy && smoothed >= AUTO_HOLD_THRESHOLD) {
          if (holdStartRef.current === null) holdStartRef.current = now;
          const held = now - holdStartRef.current;
          const pct = Math.min(100, Math.round((held / AUTO_HOLD_MS) * 100));
          setHoldPct(pct);
          if (held >= AUTO_HOLD_MS) snapNow();
        } else {
          holdStartRef.current = null;
          setHoldPct(0);
        }
      } else {
        color = "#2CC770";
      }

      const toPx = ([x, y]: readonly [number, number]) => [x * cw, y * ch] as const;
      const segs: [readonly [number, number], readonly [number, number]][] = [
        [joints.lShoulder, joints.rShoulder],
        [joints.lShoulder, joints.lElbow],
        [joints.lElbow, joints.lWrist],
        [joints.rShoulder, joints.rElbow],
        [joints.rElbow, joints.rWrist],
        [joints.lShoulder, joints.lHip],
        [joints.rShoulder, joints.rHip],
      ];

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 4;
      for (const [a, b] of segs) {
        const [ax, ay] = toPx(a);
        const [bx, by] = toPx(b);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      for (const pt of [joints.lShoulder, joints.rShoulder, joints.lElbow, joints.rElbow, joints.lWrist, joints.rWrist]) {
        const [px, py] = toPx(pt);
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, [camState, facing, pose, effectiveTarget, busy, snapNow]);

  useEffect(() => {
    if (shutterCount === null) return;
    if (shutterCount <= 0) {
      snapNow();
      return;
    }
    feedback.tap();
    const id = setTimeout(() => setShutterCount((c) => (c === null ? null : c - 1)), 900);
    return () => clearTimeout(id);
  }, [shutterCount, snapNow]);

  useEffect(() => {
    if (secsLeft === 0 && camState === "ready" && !capturedRef.current && !busy) {
      snapNow();
    }
  }, [secsLeft, camState, busy, snapNow]);

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || busy) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const targetW = 480;
      const targetH = 640;
      const out = document.createElement("canvas");
      out.width = targetW;
      out.height = targetH;
      const ctx = out.getContext("2d");
      if (ctx) {
        const targetRatio = targetW / targetH;
        const srcRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        out.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            capturedRef.current = true;
            onCapture(blob, undefined, undefined);
          }
        }, "image/jpeg", 0.8);
      } else {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  return (
    <div className="ps-cam-wrap">
      <div className="ps-viewfinder">
        {camState !== "error" ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`ps-video ${facing === "user" ? "mirror" : ""}`}
            />
            <canvas ref={canvasRef} className="ps-overlay-canvas" />
            {showGhost && hasTarget && (
              <div className="ps-ghost-layer">
                <PoseFigure pose={pose} joints={targetJoints} variant="ghost" />
              </div>
            )}
          </>
        ) : (
          <div className="ps-cam-fallback">
            {hasTarget && <PoseFigure pose={pose} joints={targetJoints} variant="card" className="ps-fallback-fig" />}
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#fff", textAlign: "center", maxWidth: 260 }}>
              {camError}
            </p>
            <button
              type="button"
              className="btn btn-green"
              style={{ maxWidth: 230 }}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              📷 Take or upload photo
            </button>
          </div>
        )}

        <div className="ps-cam-hud">
          <span
            className={`ps-ai-pill ${
              (hasTarget && matchPct !== null && matchPct >= AUTO_HOLD_THRESHOLD) || (!hasTarget && poseDetected)
                ? "hot"
                : ""
            }`}
          >
            {aiStatus === "live"
              ? hasTarget
                ? matchPct !== null
                  ? `${matchPct}% Match${matchPct >= AUTO_HOLD_THRESHOLD ? " 🔥" : ""}`
                  : "Step into frame…"
                : poseDetected
                  ? "Skeleton locked ✨"
                  : "Step into frame…"
              : aiStatus === "loading"
                ? "Loading AI pose…"
                : "Camera ready"}
          </span>

          <div style={{ display: "flex", gap: 6 }}>
            {hasTarget && (
              <button
                type="button"
                className={`ps-hud-btn ${showGhost ? "on" : ""}`}
                onClick={() => {
                  feedback.tap();
                  setShowGhost((v) => !v);
                }}
                aria-label={showGhost ? "Hide pose guide" : "Show pose guide"}
                title="Toggle pose guide overlay"
              >
                👻
              </button>
            )}
            {camState === "ready" && (
              <button
                type="button"
                className="ps-hud-btn"
                onClick={() => {
                  feedback.tap();
                  setFacing((f) => (f === "user" ? "environment" : "user"));
                }}
                aria-label="Flip camera"
                title="Flip camera"
              >
                🔄
              </button>
            )}
          </div>
        </div>

        {holdPct > 0 && (
          <div className="ps-hold-banner">
            <span>Hold it! Auto-snapping…</span>
            <div className="ps-hold-bar">
              <div className="ps-hold-fill" style={{ width: `${holdPct}%` }} />
            </div>
          </div>
        )}

        {shutterCount !== null && shutterCount > 0 && (
          <div className="ps-shutter-count" key={shutterCount}>
            {shutterCount}
          </div>
        )}

        {flash && <div className="ps-flash" />}
      </div>

      {camState === "ready" && (
        <div className="ps-cam-controls">
          <button
            type="button"
            className="ps-ctrl-btn soft"
            disabled={busy || shutterCount !== null}
            onClick={() => {
              feedback.tap();
              setShutterCount(3);
            }}
          >
            ⏱️ 3s Timer
          </button>
          <button
            type="button"
            className="ps-shutter-btn"
            disabled={busy}
            onClick={snapNow}
            aria-label="Snap pose now"
          >
            <span className="ps-shutter-inner">{busy ? "…" : "📸"}</span>
          </button>
          <button
            type="button"
            className="ps-ctrl-btn soft"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            🖼️ Upload
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: "none" }}
        onChange={onFilePicked}
      />
    </div>
  );
}
