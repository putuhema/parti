"use client";

import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { CANVAS, MAX_POINTS, MAX_STROKES, PALETTE } from "../../../convex/lib/chain/rules";
import { feedback } from "@/lib/feedback";

/** Strokes are [colour, x0, y0, x1, y1, …]. */
function Lines({ strokes }: { strokes: number[][] }) {
  return (
    <>
      {strokes.map((s, i) => {
        const c = PALETTE[s[0]] ?? PALETTE[0];
        if (s.length <= 3) return <circle key={i} cx={s[1]} cy={s[2]} r={8} fill={c} />;
        let pts = "";
        for (let k = 1; k + 1 < s.length; k += 2) pts += `${s[k]},${s[k + 1]} `;
        return <polyline key={i} points={pts} stroke={c} />;
      })}
    </>
  );
}

/** A finished drawing. */
export function Art({ strokes, label, className = "" }: { strokes: number[][]; label: string; className?: string }) {
  return (
    <svg className={`sc-art ${className}`} viewBox={`0 0 ${CANVAS} ${CANVAS}`} role="img" aria-label={label}>
      <Lines strokes={strokes} />
      {!strokes.length && <text x={CANVAS / 2} y={CANVAS / 2} textAnchor="middle" dominantBaseline="middle" className="sc-blank">(nothing drawn 🙈)</text>}
    </svg>
  );
}

/** Freehand pad with colours, undo and clear. */
export function Pad({ strokes, onChange, disabled }: { strokes: number[][]; onChange: (s: number[][]) => void; disabled?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [color, setColor] = useState(0);
  const [live, setLive] = useState<number[] | null>(null);
  const cur = useRef<number[] | null>(null);
  const total = strokes.reduce((n, s) => n + (s.length - 1) / 2, 0);
  const full = strokes.length >= MAX_STROKES || total >= MAX_POINTS;

  function at(e: RPointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * CANVAS), Math.round(((e.clientY - r.top) / r.height) * CANVAS)].map((n) => Math.max(0, Math.min(CANVAS, n)));
  }
  function down(e: RPointerEvent) {
    if (disabled || full) return;
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    cur.current = [color, ...at(e)];
    setLive(cur.current);
  }
  function move(e: RPointerEvent) {
    const s = cur.current;
    if (!s) return;
    const [x, y] = at(e);
    // Skip tiny moves to keep drawings small.
    if (Math.hypot(x - s[s.length - 2], y - s[s.length - 1]) < 8 || total + s.length / 2 >= MAX_POINTS) return;
    cur.current = [...s, x, y];
    setLive(cur.current);
  }
  function up() {
    const s = cur.current;
    cur.current = null;
    setLive(null);
    if (s) onChange([...strokes, s]);
  }

  return (
    <div className="sc-padwrap">
      <svg ref={ref} className={`sc-art sc-pad${disabled ? " off" : ""}`} viewBox={`0 0 ${CANVAS} ${CANVAS}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="img" aria-label="Your drawing. Draw with your finger.">
        <Lines strokes={live ? [...strokes, live] : strokes} />
      </svg>
      <div className="sc-tools">
        {PALETTE.map((c, i) => (
          <button key={c} type="button" className="sc-swatch" aria-label={`Colour ${i + 1}`} aria-pressed={color === i} style={{ background: c }} onClick={() => { feedback.tap(); setColor(i); }} />
        ))}
        <span className="grow" />
        <button type="button" className="sc-tool" aria-label="Undo" disabled={disabled || !strokes.length} onClick={() => { feedback.tap(); onChange(strokes.slice(0, -1)); }}>↩️</button>
        <button type="button" className="sc-tool" aria-label="Clear" disabled={disabled || !strokes.length} onClick={() => { feedback.tap(); onChange([]); }}>🗑️</button>
      </div>
    </div>
  );
}
