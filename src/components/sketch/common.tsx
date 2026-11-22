"use client";

import type { FunctionReturnType } from "convex/server";
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { api } from "../../../convex/_generated/api";
import { CANVAS, MAX_POINTS, MAX_STROKES, isBot } from "../../../convex/lib/sketch/rules";

export type SketchView = NonNullable<FunctionReturnType<typeof api.sketch.view>>;
export type SketchGameView = NonNullable<SketchView["game"]>;

export const GAME_NAME = "Sketch Match";
export const RULE = "One player sees a secret picture, like a banana or a dinosaur, and describes it without saying what it is. Everyone else draws from the words alone. Then the picture is revealed and each drawing gets a match score. The describer scores the average of their drawers, so clear clues pay off for everyone.";
export const BOT_NAME = "Robo";

export function useNameOf(room: SketchView) {
  return (id?: string | null) => {
    if (!id) return "Someone";
    if (id === room.meId) return "You";
    if (isBot(id)) return BOT_NAME;
    return room.game?.names[id] ?? room.members.find((m) => m.id === id)?.name ?? "Friend";
  };
}

/** Turn a flat [x0, y0, x1, y1, …] stroke into SVG points. */
const toPoints = (s: number[]) => {
  let out = "";
  for (let i = 0; i + 1 < s.length; i += 2) out += `${s[i]},${s[i + 1]} `;
  return out;
};

export function StrokeLines({ strokes, color, className = "sk-ink" }: { strokes: number[][]; color?: string; className?: string }) {
  return (
    <g className={className} style={color ? { stroke: color } : undefined}>
      {strokes.map((s, i) => (s.length === 2 ? <circle key={i} cx={s[0]} cy={s[1]} r={7} style={color ? { fill: color } : undefined} /> : <polyline key={i} points={toPoints(s)} />))}
    </g>
  );
}

/** A square card holding a picture and/or a drawing. */
export function Board({ picture, strokes, ghost, color, label, className = "", children }: { picture?: number[][] | null; strokes?: number[][]; ghost?: boolean; color?: string; label: string; className?: string; children?: React.ReactNode }) {
  return (
    <svg className={`sk-board ${className}`} viewBox={`0 0 ${CANVAS} ${CANVAS}`} role="img" aria-label={label}>
      {picture && <StrokeLines strokes={picture} className={ghost ? "sk-ghost" : "sk-pic"} />}
      {strokes && <StrokeLines strokes={strokes} color={color} />}
      {children}
    </svg>
  );
}

/** Freehand drawing pad. Calls `onChange` with every stroke you finish. */
export function DrawPad({ strokes, onChange, disabled, label = "Your drawing. Draw with your finger." }: { strokes: number[][]; onChange: (s: number[][]) => void; disabled?: boolean; label?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<number[] | null>(null);
  const cur = useRef<number[] | null>(null);
  const total = strokes.reduce((n, s) => n + s.length / 2, 0);

  function at(e: RPointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * CANVAS), Math.round(((e.clientY - r.top) / r.height) * CANVAS)].map((n) => Math.max(0, Math.min(CANVAS, n)));
  }
  function down(e: RPointerEvent) {
    if (disabled || strokes.length >= MAX_STROKES || total >= MAX_POINTS) return;
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    cur.current = at(e);
    setLive(cur.current);
  }
  function move(e: RPointerEvent) {
    const s = cur.current;
    if (!s) return;
    const [x, y] = at(e);
    const lx = s[s.length - 2], ly = s[s.length - 1];
    // Skip tiny moves to keep drawings small.
    if (Math.hypot(x - lx, y - ly) < 9 || total + s.length / 2 >= MAX_POINTS) return;
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
    <svg ref={ref} className={`sk-board sk-pad${disabled ? " off" : ""}`} viewBox={`0 0 ${CANVAS} ${CANVAS}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="img" aria-label={label}>
      <StrokeLines strokes={live ? [...strokes, live] : strokes} />
    </svg>
  );
}

/** A coloured score, 0–100. */
export function Score({ n, big }: { n: number; big?: boolean }) {
  const tone = n >= 75 ? "good" : n >= 45 ? "ok" : "low";
  return <span className={`sk-score ${tone}${big ? " big" : ""}`}>{n}%</span>;
}

/** "a banana" / "an apple" */
export const withArticle = (w: string) => `${/^[aeiou]/i.test(w) ? "an" : "a"} ${w}`;
