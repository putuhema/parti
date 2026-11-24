"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExpressionDef } from "../../../convex/lib/face/expressions";
import { feedback } from "@/lib/feedback";
import { loadFaceTracker, type LiveFaceTracker } from "@/lib/faceDetector";

type Props = {
  expr: ExpressionDef;
  turnKey: string;
  busy: boolean;
  secsLeft: number | null;
  onCapture: (blob: Blob, aiScore?: number) => void;
};

const AUTO_HOLD_THRESHOLD = 82;
const AUTO_HOLD_MS = 2000;
const WARMUP_MS = 3500;

export function FaceCamera({ expr, turnKey, busy, secsLeft, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [autoSnap, setAutoSnap] = useState(false);
  const [timerMode, setTimerMode] = useState(true);
  const [camState, setCamState] = useState<"loading" | "ready" | "error">("loading");
  const [camError, setCamError] = useState("");
  const [aiStatus, setAiStatus] = useState<"loading" | "live" | "off">("loading");
  const [matchPct, setMatchPct] = useState<number | null>(null);
  const [holdPct, setHoldPct] = useState(0);
  const [shutterCount, setShutterCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  const latestAiRef = useRef<number | undefined>(undefined);
  const capturedRef = useRef(false);
  const holdStartRef = useRef<number | null>(null);
  const smoothRef = useRef<number | null>(null);
  const readyAtRef = useRef<number>(0);
  const autoSnapRef = useRef(autoSnap);

  useEffect(() => {
    autoSnapRef.current = autoSnap;
    if (!autoSnap) {
      holdStartRef.current = null;
      setHoldPct(0);
    }
  }, [autoSnap]);

  useEffect(() => {
    capturedRef.current = false;
    holdStartRef.current = null;
    smoothRef.current = null;
    latestAiRef.current = undefined;
    readyAtRef.current = performance.now();
    setMatchPct(null);
    setHoldPct(0);
    setShutterCount(null);
  }, [turnKey]);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    setCamState("loading");
    setCamError("");
    async function init() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!active) return;
        setCamState("error");
        setCamError("Camera not available — upload a selfie below!");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        readyAtRef.current = performance.now();
        setCamState("ready");
      } catch {
        if (!active) return;
        setCamState("error");
        setCamError("Camera permission blocked — allow camera or upload a selfie!");
      }
    }
    void init();
    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const snapNow = useCallback(() => {
    if (capturedRef.current || busy) return;
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    capturedRef.current = true;
    setShutterCount(null);
    setFlash(true);
    feedback.correct();
    setTimeout(() => setFlash(false), 260);

    const size = 480;
    const out = document.createElement("canvas");
    out.width = size;
    out.height = size;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const minSide = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - minSide) / 2;
    const sy = (v.videoHeight - minSide) / 2;
    ctx.save();
    if (facing === "user") {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, sx, sy, minSide, minSide, 0, 0, size, size);
    ctx.restore();
    out.toBlob((blob) => {
      if (blob) onCapture(blob, latestAiRef.current);
      else capturedRef.current = false;
    }, "image/jpeg", 0.82);
  }, [busy, facing, onCapture]);

  useEffect(() => {
    if (camState !== "ready") return;
    let alive = true;
    let raf = 0;
    let tracker: LiveFaceTracker | null = null;
    let last = 0;
    setAiStatus("loading");
    void loadFaceTracker().then((t) => {
      if (!alive) return;
      tracker = t;
      setAiStatus(t ? "live" : "off");
    });

    const loop = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 80) return;
      last = now;
      const v = videoRef.current;
      if (!v || !tracker) return;
      const bs = tracker.detect(v, now);
      if (!bs) {
        holdStartRef.current = null;
        setHoldPct(0);
        return;
      }
      const raw = expr.score(bs);
      const prev = smoothRef.current ?? raw;
      const smoothed = Math.round(prev * 0.45 + raw * 0.55);
      smoothRef.current = smoothed;
      latestAiRef.current = smoothed;
      setMatchPct(smoothed);

      const warmedUp = now - readyAtRef.current >= WARMUP_MS;
      if (autoSnapRef.current && warmedUp && !capturedRef.current && !busy && smoothed >= AUTO_HOLD_THRESHOLD) {
        if (holdStartRef.current === null) holdStartRef.current = now;
        const held = now - holdStartRef.current;
        setHoldPct(Math.min(100, Math.round((held / AUTO_HOLD_MS) * 100)));
        if (held >= AUTO_HOLD_MS) snapNow();
      } else {
        holdStartRef.current = null;
        setHoldPct(0);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [camState, expr, busy, snapNow]);

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
    const warmedUp = performance.now() - readyAtRef.current >= 3000;
    if (secsLeft === 0 && camState === "ready" && warmedUp && !capturedRef.current && !busy) snapNow();
  }, [secsLeft, camState, busy, snapNow]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || busy) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 480;
      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const ctx = out.getContext("2d");
      if (ctx) {
        const m = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
        out.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            capturedRef.current = true;
            onCapture(blob, undefined);
          }
        }, "image/jpeg", 0.82);
      } else URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <div className="ps-cam-wrap">
      <div className="ps-viewfinder" style={{ aspectRatio: "1 / 1", maxHeight: "52vh" }}>
        {camState !== "error" ? (
          <video ref={videoRef} playsInline muted autoPlay className={`ps-video ${facing === "user" ? "mirror" : ""}`} />
        ) : (
          <div className="ps-cam-fallback">
            <span style={{ fontSize: 64 }}>{expr.emoji}</span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#fff", textAlign: "center" }}>{camError}</p>
            <button type="button" className="btn btn-green" style={{ maxWidth: 220 }} onClick={() => fileRef.current?.click()}>
              📷 Take or upload selfie
            </button>
          </div>
        )}

        <div className="ps-cam-hud">
          <span className={`ps-ai-pill ${matchPct !== null && matchPct >= AUTO_HOLD_THRESHOLD ? "hot" : ""}`}>
            {aiStatus === "live"
              ? matchPct !== null
                ? `${matchPct}% Match${matchPct >= AUTO_HOLD_THRESHOLD ? " 🔥" : ""}`
                : "Show your face…"
              : aiStatus === "loading"
                ? "Loading face AI…"
                : "Camera ready"}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className={`ps-hud-btn ${autoSnap ? "on" : ""}`}
              onClick={() => {
                feedback.tap();
                setAutoSnap((v) => !v);
              }}
              aria-label={autoSnap ? "Disable auto-snap" : "Enable auto-snap"}
              title={autoSnap ? "Auto-snap ON" : "Auto-snap OFF (tap to enable)"}
            >
              ⚡
            </button>
            {camState === "ready" && (
              <button
                type="button"
                className="ps-hud-btn"
                onClick={() => {
                  feedback.tap();
                  setFacing((f) => (f === "user" ? "environment" : "user"));
                }}
                aria-label="Flip camera"
              >
                🔄
              </button>
            )}
          </div>
        </div>

        {/* Floating target emoji badge */}
        <div className="ef-emoji-float" aria-hidden="true">{expr.emoji}</div>

        {holdPct > 0 && (
          <div className="ps-hold-banner">
            <span>Hold that face! Auto-snapping…</span>
            <div className="ps-hold-bar"><div className="ps-hold-fill" style={{ width: `${holdPct}%` }} /></div>
          </div>
        )}

        {shutterCount !== null && shutterCount > 0 && <div className="ps-shutter-count">{shutterCount}</div>}
        {flash && <div className="ps-flash" />}
      </div>

      {camState === "ready" && (
        <div className="ps-cam-controls">
          <button
            type="button"
            className="ps-ctrl-btn soft"
            disabled={busy}
            onClick={() => {
              feedback.tap();
              setTimerMode((t) => !t);
            }}
          >
            {timerMode ? "⏱️ 3s Timer" : "⚡ Instant"}
          </button>
          <button
            type="button"
            className="ps-shutter-btn"
            disabled={busy}
            onClick={() => {
              feedback.tap();
              if (shutterCount !== null) setShutterCount(null);
              else if (timerMode) setShutterCount(3);
              else snapNow();
            }}
            aria-label={shutterCount !== null ? "Cancel countdown" : timerMode ? "Start 3-second countdown" : "Snap face"}
          >
            <span className="ps-shutter-inner">{busy ? "…" : shutterCount !== null ? "✕" : "📸"}</span>
          </button>
          <button type="button" className="ps-ctrl-btn soft" disabled={busy} onClick={() => fileRef.current?.click()}>
            🖼️ Upload
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={onFile} />
    </div>
  );
}
