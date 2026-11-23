"use client";

import { useEffect, useRef, useState } from "react";
import { MASH_MS, holdLevel } from "../../../convex/lib/boom/rules";

// The other two quick time events, beside TimingBar:
//  • MashMeter: lobbying out of Diperiksa. Tap as many times as you can before the time runs out.
//  • HoldMeter: haggling rent. Hold, and let go while the meter is inside the deal zone.
// Each has a live mode (the player doing it) and a replay mode (everyone else, after the server has judged it).

/** Live: `start` is when mashing began and `taps` the count so far. Replay: counts up to `taps`, then stamps. */
export function MashMeter({ target, taps, live, start, success }: { target: number; taps: number; live: boolean; start?: number; success?: boolean }) {
  const timer = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(live ? taps : 0);
  const [stamp, setStamp] = useState<boolean | null>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      if (live) {
        const left = Math.max(0, 1 - (now - (start ?? t0)) / MASH_MS);
        if (timer.current) timer.current.style.width = `${left * 100}%`;
        if (left > 0) raf = requestAnimationFrame(loop);
      } else {
        // Count up over about a second, then stamp the verdict.
        const k = Math.min(1, (now - t0) / 1000);
        setShown(Math.round(taps * k));
        if (timer.current) timer.current.style.width = `${(1 - k) * 100}%`;
        if (k < 1) raf = requestAnimationFrame(loop);
        else setStamp(!!success);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, start, taps, success]);
  const n = live ? taps : shown;
  return (
    <div className={`jn-mash${stamp === true ? " hit" : stamp === false ? " miss" : ""}`} aria-live="polite">
      <span className="jn-mashcount"><b key={n}>{n}</b>/{target}</span>
      <span className="jn-mashbar"><i style={{ width: `${Math.min(100, (n / target) * 100)}%` }} /></span>
      <span className="jn-mashtime"><i ref={timer} /></span>
      {stamp !== null && <b className="jn-qtestamp">{stamp ? "LOLOS!" : "GAGAL!"}</b>}
    </div>
  );
}

const VERDICT = { deal: "DEAL −30%!", full: "BAYAR PENUH", over: "TERSINGGUNG +20%!" } as const;

/**
 * Live: fills from `holdStart` while held; `stopMs` freezes it where the player let go.
 * Replay: fills to `level` and stamps the result.
 */
export function HoldMeter({ lo, hi, live, holdStart, stopMs, level, result }: {
  lo: number; hi: number; live: boolean; holdStart?: number | null; stopMs?: number | null; level?: number; result?: "deal" | "full" | "over";
}) {
  const fill = useRef<HTMLSpanElement>(null);
  const [stamp, setStamp] = useState<null | "deal" | "full" | "over">(null);
  const MAX = 1.25; // the bar runs a little past "full" so overshooting is visible
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      let l: number;
      if (live) l = stopMs != null ? holdLevel(stopMs) : holdStart != null ? holdLevel(now - holdStart) : 0;
      else {
        l = Math.min(level ?? 0, ((now - t0) / 900) * (level ?? 0));
        if (l >= (level ?? 0)) setStamp(result ?? "full");
      }
      if (fill.current) fill.current.style.width = `${(Math.min(MAX, l) / MAX) * 100}%`;
      const running = live ? holdStart != null && stopMs == null : l < (level ?? 0);
      if (running) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, holdStart, stopMs, level, result]);
  return (
    <div className={`jn-hold${stamp ? ` ${stamp}` : ""}`}>
      <span className="jn-holdzone" style={{ left: `${(lo / MAX) * 100}%`, width: `${((hi - lo) / MAX) * 100}%` }} />
      <span className="jn-holdfull" style={{ left: `${(1 / MAX) * 100}%` }} />
      <span ref={fill} className="jn-holdfill" />
      {stamp && <b className="jn-qtestamp">{VERDICT[stamp]}</b>}
    </div>
  );
}
