"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { feedback } from "@/lib/feedback";

type Props = {
  side: "left" | "right";
  leftPhotoUrl?: string | null;
  busy: boolean;
  onCapture: (blob: Blob) => void;
};

export function SplitCamera({ side, leftPhotoUrl, busy, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [timerMode, setTimerMode] = useState(true);
  const [camState, setCamState] = useState<"loading" | "ready" | "error">("loading");
  const [shutterCount, setShutterCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    setCamState("loading");
    async function init() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (active) setCamState("error");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 960 } },
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
        setCamState("ready");
      } catch {
        if (active) setCamState("error");
      }
    }
    void init();
    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  const snapNow = useCallback(() => {
    if (busy) return;
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    setShutterCount(null);
    setFlash(true);
    feedback.correct();
    setTimeout(() => setFlash(false), 260);

    // Each half is 360x540 (2:3), so stitched together they form a crisp 720x540 (4:3) couple photo!
    const w = 360;
    const h = 540;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const targetRatio = w / h;
    const srcRatio = v.videoWidth / v.videoHeight;
    let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
    if (srcRatio > targetRatio) {
      sw = v.videoHeight * targetRatio;
      sx = (v.videoWidth - sw) / 2;
    } else {
      sh = v.videoWidth / targetRatio;
      sy = (v.videoHeight - sh) / 2;
    }
    ctx.save();
    if (facing === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();
    out.toBlob((blob) => {
      if (blob) onCapture(blob);
    }, "image/jpeg", 0.84);
  }, [busy, facing, onCapture]);

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

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || busy) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const w = 360, h = 540;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d");
      if (ctx) {
        const targetRatio = w / h;
        const srcRatio = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        out.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) onCapture(blob);
        }, "image/jpeg", 0.84);
      } else URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <div className="ps-cam-wrap">
      <div className="sp-booth">
        {/* Left half */}
        <div className={`sp-half ${side === "left" ? "live" : "done"}`}>
          {side === "left" ? (
            camState !== "error" ? (
              <video ref={videoRef} playsInline muted autoPlay className={`ps-video ${facing === "user" ? "mirror" : ""}`} />
            ) : (
              <div className="sp-placeholder">
                <span>📷</span>
                <button type="button" className="btn btn-green btn-sm" onClick={() => fileRef.current?.click()}>Upload left</button>
              </div>
            )
          ) : leftPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={leftPhotoUrl} alt="Partner's left half" className="sp-img" />
          ) : (
            <div className="sp-placeholder"><span>💞</span></div>
          )}
          {side === "left" && <span className="sp-edge-label right">Seam →</span>}
        </div>

        {/* Center seam line */}
        <div className="sp-seam" aria-hidden="true" />

        {/* Right half */}
        <div className={`sp-half ${side === "right" ? "live" : "waiting"}`}>
          {side === "right" ? (
            camState !== "error" ? (
              <video ref={videoRef} playsInline muted autoPlay className={`ps-video ${facing === "user" ? "mirror" : ""}`} />
            ) : (
              <div className="sp-placeholder">
                <span>📷</span>
                <button type="button" className="btn btn-green btn-sm" onClick={() => fileRef.current?.click()}>Upload right</button>
              </div>
            )
          ) : (
            <div className="sp-placeholder">
              <span style={{ fontSize: 32 }}>💞</span>
              <small>Partner&apos;s half goes here!</small>
            </div>
          )}
          {side === "right" && <span className="sp-edge-label left">← Align here</span>}
        </div>

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
            aria-label={shutterCount !== null ? "Cancel countdown" : timerMode ? "Start 3-second countdown" : "Snap half"}
          >
            <span className="ps-shutter-inner">{busy ? "…" : shutterCount !== null ? "✕" : "📸"}</span>
          </button>
          <button
            type="button"
            className="ps-ctrl-btn soft"
            disabled={busy}
            onClick={() => {
              feedback.tap();
              setFacing((f) => (f === "user" ? "environment" : "user"));
            }}
          >
            🔄 Flip
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="user" style={{ display: "none" }} onChange={onFile} />
    </div>
  );
}
