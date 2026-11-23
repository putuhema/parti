"use client";

import { useEffect, useRef, useState } from "react";
import { QTE_MS, qtePos, type Qte } from "../../../convex/lib/boom/rules";

// The timing QTE bar: a needle sweeps along the bar and you tap while it's inside the zone.
// Live: the needle runs from `start` (a performance.now() time) until the player taps (`stopAt`, in ms).
// Replay: everyone else sees the needle sweep to where the player tapped, then a hit or miss stamp.
// The needle moves through a ref, so the bar never re-renders the page while it runs.

export type BarMode = { kind: "live"; start: number; stopAt: number | null } | { kind: "replay"; ms: number; success: boolean };

export function TimingBar({ q, mode }: { q: Qte; mode: BarMode }) {
  const needle = useRef<HTMLSpanElement>(null);
  const [stamp, setStamp] = useState<null | boolean>(null);
  const replayMs = mode.kind === "replay" ? mode.ms : 0;
  const replayHit = mode.kind === "replay" ? mode.success : false;
  const start = mode.kind === "live" ? mode.start : 0;
  const stopAt = mode.kind === "live" ? mode.stopAt : null;
  const live = mode.kind === "live";

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    // A replay plays the real sweep, sped up so even a late tap shows within about a second.
    const speed = Math.max(1, Math.min(QTE_MS, replayMs) / 1100);
    const loop = (now: number) => {
      let ms: number;
      if (live) ms = stopAt ?? Math.min(QTE_MS, now - start);
      else {
        ms = Math.min(replayMs, (now - t0) * speed);
        if (ms >= Math.min(replayMs, QTE_MS)) { setStamp(replayHit); ms = Math.min(replayMs, QTE_MS); }
      }
      if (needle.current) needle.current.style.left = `${qtePos(q, ms) * 100}%`;
      if (live ? stopAt === null : ms < Math.min(replayMs, QTE_MS)) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [q, live, start, stopAt, replayMs, replayHit]);

  const hit = live && stopAt !== null ? Math.abs(qtePos(q, stopAt) - q.c) <= q.w / 2 : null;
  const shown = live ? hit : stamp;
  return (
    <div className={`jn-qte${shown === true ? " hit" : shown === false ? " miss" : ""}`} aria-hidden="true">
      <span className="jn-qtezone" style={{ left: `${(q.c - q.w / 2) * 100}%`, width: `${q.w * 100}%` }} />
      <span ref={needle} className="jn-qteneedle" style={{ left: `${qtePos(q, 0) * 100}%` }} />
      {shown !== null && <b className="jn-qtestamp">{shown ? "BERHASIL!" : "MELESET!"}</b>}
    </div>
  );
}
