"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { feedback } from "@/lib/feedback";

const BASE = "M10 30.5 h20 a3 3 0 0 1 3 3 v1.5 a2 2 0 0 1 -2 2 h-22 a2 2 0 0 1 -2 -2 v-1.5 a3 3 0 0 1 3 -3z";
const BODY: Record<string, { body: string; det: string }> = {
  p: { body: "M20 6a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11z M14.5 31 L17 18.5 H23 L25.5 31z", det: "" },
  r: { body: "M11 7 h4.5 v3.5 h2.5 v-3.5 h4 v3.5 h2.5 v-3.5 h4.5 v9 h-18z M13.5 16 h13 l1.5 15 h-16z", det: "M13.5 16 h13" },
  n: { body: "M13 31 C13 26 15.5 23.5 18.5 21.5 C14.5 21.5 10.5 20.5 10.5 17 C10.5 14 14 10.5 17 8.5 L17.5 4 L21 7.2 C26.5 8.2 30 13.5 29 21.5 L28 31z", det: "M19.5 12.5 l.01 0" },
  b: { body: "M20 3.5a2.3 2.3 0 1 1 0 4.6a2.3 2.3 0 1 1 0-4.6z M20 8.5 C27 13.5 27 19.5 23.5 23 H16.5 C13 19.5 13 13.5 20 8.5z M15.5 31 L17.5 23 H22.5 L24.5 31z", det: "M22.5 13 l-4.5 4.5" },
  q: { body: "M10 12 L15 23 L17 9.5 L20 21 L23 9.5 L25 23 L30 12 L27.5 31 H12.5z M10 9.6a2.4 2.4 0 1 1 0 4.8a2.4 2.4 0 1 1 0-4.8z M17 7.1a2.4 2.4 0 1 1 0 4.8a2.4 2.4 0 1 1 0-4.8z M23 7.1a2.4 2.4 0 1 1 0 4.8a2.4 2.4 0 1 1 0-4.8z M30 9.6a2.4 2.4 0 1 1 0 4.8a2.4 2.4 0 1 1 0-4.8z", det: "M13.5 26 h13" },
  k: { body: "M18.5 2.5 h3 v3 h3 v3 h-3 v4 h-3 v-4 h-3 v-3 h3z M13 13.5 h14 a3 3 0 0 1 2.7 4.3 L27 31 H13 L10.3 17.8 A3 3 0 0 1 13 13.5z", det: "M12.5 21 h15" },
};
export const PIECE_NAMES: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/** A piece by its board letter: uppercase = white, lowercase = black, "*" = duck. */
export function Piece({ code, size, className, style, flat }: { code: string; size?: number; className?: string; style?: CSSProperties; flat?: string }) {
  if (code === "*") return <Duck size={size} className={className} style={style} />;
  const t = code.toLowerCase();
  const P = BODY[t];
  if (!P) return null;
  const white = code !== t;
  const fill = flat ?? (white ? "#fff" : "#4B4B4B");
  const ink = flat ?? (white ? "#3C3C3C" : "#262626");
  const base = flat ?? (white ? "#D7D7D7" : "#262626");
  const det = flat ? "rgba(0,0,0,.25)" : white ? "#3C3C3C" : "#fff";
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d={P.body} fill={fill} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      {P.det && <path d={P.det} fill="none" stroke={det} strokeWidth="2.4" strokeLinecap="round" />}
      <path d={BASE} fill={base} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function Duck({ size, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <ellipse cx="20" cy="29" rx="14" ry="7" fill="#E5A800" />
      <path d="M7 25 C7 19 12 17 17 18 C16 15 16 9 22 8 C27 7.5 30 11 29 15 L35 15.5 L30 19 C32 21 33 23 33 25 C33 31 27 33 20 33 C12 33 7 30 7 25z" fill="#FFC800" stroke="#E5A800" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="24.5" cy="12.5" r="1.8" fill="#3C3C3C" />
      <path d="M29 15 L35 15.5 L30 18.5z" fill="#FF9600" />
    </svg>
  );
}

export type Mark = { t: "hi" | "ring" | "danger"; sq: number };
export type Arrow = { from: number; to: number; color?: string; dash?: boolean };

export interface BoardProps {
  cells: string;
  size?: number;
  flipped?: boolean;
  selected?: number | null;
  targets?: number[];
  last?: [number, number] | null;
  check?: number;
  arrows?: Arrow[];
  marks?: Mark[];
  stars?: number[];
  frozen?: number[];
  shields?: number[];
  glow?: number[]; // pieces you may use (team mode, card targets)
  pending?: number | null; // coach: first tap of an arrow
  moved?: number | null;
  shake?: number | null;
  onTap?: (sq: number) => void;
  disabled?: boolean;
  label?: string;
  coords?: boolean;
}

const FILES = "abcdefgh";

type Anim = { id: number; slide: Map<number, { dx: number; dy: number }>; gone: Map<number, string>; land: Set<number> };
const NO_ANIM: Anim = { id: 0, slide: new Map(), gone: new Map(), land: new Set() };
const isPiece = (ch: string | undefined) => !!ch && ch !== "." && ch !== "?";
const isWhite = (ch: string) => ch !== ch.toLowerCase();

/** Work out which pieces moved between two positions, so they can slide instead of teleport. */
function diffMoves(prev: string, next: string) {
  if (prev.length !== next.length) return null;
  const from: number[] = [], to: number[] = [];
  for (let i = 0; i < next.length; i++) {
    if (prev[i] === next[i] || prev[i] === "?" || next[i] === "?") continue;
    if (isPiece(prev[i])) from.push(i);
    if (isPiece(next[i])) to.push(i);
  }
  if (!to.length || to.length > 3 || from.length > 4) return null; // new game, reset, etc.
  const pairs: [number, number][] = [];
  const left = new Set(from);
  for (const t of to) {
    let f = [...left].find((x) => prev[x] === next[t]);
    // Promotion: pawn leaves, queen arrives.
    if (f === undefined) f = [...left].find((x) => prev[x] !== "*" && next[t] !== "*" && isWhite(prev[x]) === isWhite(next[t]) && !isPiece(next[x]));
    if (f === undefined) continue;
    left.delete(f);
    pairs.push([f, t]);
  }
  const gone = new Map<number, string>();
  for (const [, t] of pairs) if (isPiece(prev[t])) gone.set(t, prev[t]); // captured on the landing square
  for (const f of left) if (!isPiece(next[f])) gone.set(f, prev[f]); // en passant
  return { pairs, gone };
}

export function Board(p: BoardProps) {
  const n = p.size ?? 8;
  const total = n * n;
  const order = Array.from({ length: total }, (_, k) => (p.flipped ? total - 1 - k : k));
  const disp = (sq: number) => {
    const d = p.flipped ? total - 1 - sq : sq;
    return { x: (d % n) + 0.5, y: Math.floor(d / n) + 0.5 };
  };

  // ---------- Move animations (slide, capture, snap back) ----------
  // A move you just dragged into place: it lands instead of sliding again.
  const [drop, setDrop] = useState<{ to: number; before: string } | null>(null);
  const [snap, setSnap] = useState<{ cells: string; anim: Anim }>({ cells: p.cells, anim: NO_ANIM });
  let anim = snap.anim;
  if (snap.cells !== p.cells) {
    const d = diffMoves(snap.cells, p.cells);
    anim = { id: snap.anim.id + 1, slide: new Map(), gone: d?.gone ?? new Map(), land: new Set() };
    for (const [f, t] of d?.pairs ?? []) {
      if (drop && drop.to === t && drop.before === snap.cells) { anim.land.add(t); continue; }
      const A = disp(f), B = disp(t);
      anim.slide.set(t, { dx: A.x - B.x, dy: A.y - B.y });
    }
    if (drop) setDrop(null);
    setSnap({ cells: p.cells, anim });
  }
  useEffect(() => {
    if (!snap.anim.id) return;
    const id = snap.anim.id;
    const t = setTimeout(() => setSnap((s) => (s.anim.id === id ? { ...s, anim: { ...NO_ANIM, id } } : s)), 450);
    return () => clearTimeout(t);
  }, [snap.anim.id]);

  // ---------- Drag and drop ----------
  const gridRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: number; sq: number; x: number; y: number; touch: boolean; dragging: boolean } | null>(null);
  const skipClick = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const live = !!p.onTap && !p.disabled;
  const targets_ = p.targets ?? [];

  function sqAt(x: number, y: number) {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return null;
    const c = Math.floor(((x - r.left) / r.width) * n), row = Math.floor(((y - r.top) / r.height) * n);
    if (c < 0 || c >= n || row < 0 || row >= n) return null;
    return order[row * n + c];
  }
  function placeFloat(x: number, y: number, touch: boolean) {
    const r = gridRef.current?.getBoundingClientRect(), el = floatRef.current;
    if (!r || !el) return;
    const s = r.width / n;
    // Lift above the finger on touch so you can see the piece.
    el.style.transform = `translate(${x - r.left - s / 2}px, ${y - r.top - s / 2 - (touch ? s * 0.55 : 0)}px)`;
  }
  function onDown(e: RPointerEvent) {
    skipClick.current = false;
    if (!live || e.button !== 0) return;
    const sq = sqAt(e.clientX, e.clientY);
    if (sq == null || !isPiece(p.cells[sq]) || targets_.includes(sq)) return;
    press.current = { id: e.pointerId, sq, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse", dragging: false };
    // Pick the piece up on press, not on release: it feels instant.
    if (p.selected !== sq) {
      skipClick.current = true;
      p.onTap!(sq);
    }
  }
  function onMove(e: RPointerEvent) {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    if (!pr.dragging) {
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 6) return;
      pr.dragging = true;
      skipClick.current = true;
      try { gridRef.current?.setPointerCapture(e.pointerId); } catch {}
      setDrag(pr.sq);
    }
    placeFloat(e.clientX, e.clientY, pr.touch);
    const sq = sqAt(e.clientX, e.clientY);
    if (sq !== hover) {
      setHover(sq);
      if (sq != null && sq !== pr.sq && targets_.includes(sq)) feedback.detent();
    }
  }
  function onUp(e: RPointerEvent) {
    const pr = press.current;
    if (!pr || pr.id !== e.pointerId) return;
    press.current = null;
    setDrag(null);
    setHover(null);
    if (!pr.dragging) return;
    const sq = sqAt(e.clientX, e.clientY);
    const holding = p.selected === pr.sq;
    if (sq != null && sq !== pr.sq && (!holding || targets_.includes(sq))) {
      if (holding) setDrop({ to: sq, before: p.cells });
      p.onTap?.(sq);
      return;
    }
    if (!holding) return;
    // Dropped somewhere it can't go: snap back home.
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = r.width / n, home = disp(pr.sq);
    const fx = (e.clientX - r.left) / s, fy = (e.clientY - r.top) / s - (pr.touch ? 0.55 : 0);
    setSnap((st) => ({ ...st, anim: { id: st.anim.id + 1, slide: new Map([[pr.sq, { dx: fx - home.x, dy: fy - home.y }]]), gone: new Map(), land: new Set() } }));
  }
  function onCancel() {
    press.current = null;
    setDrag(null);
    setHover(null);
  }
  const set = (list?: number[]) => new Set(list ?? []);
  const targets = set(p.targets), stars = set(p.stars), frozen = set(p.frozen), shields = set(p.shields), glow = set(p.glow);
  const markAt = new Map<number, Mark["t"][]>();
  for (const m of p.marks ?? []) markAt.set(m.sq, [...(markAt.get(m.sq) ?? []), m.t]);

  return (
    <div className="cboard-wrap" style={{ ["--n" as string]: n }}>
      <div
        ref={gridRef}
        className={`cboard${live ? " live" : ""}${drag != null ? " dragging" : ""}`}
        role="grid"
        aria-label={p.label ?? "Chess board"}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onLostPointerCapture={(e) => { if (press.current?.dragging && press.current.id === e.pointerId) onCancel(); }}
      >
        {order.map((sq, k) => {
          const r = Math.floor(sq / n), c = sq % n;
          const light = (r + c) % 2 === 0;
          const ch = p.cells[sq] ?? ".";
          const fog = ch === "?";
          const has = ch !== "." && !fog;
          const isT = targets.has(sq);
          const cls = ["csq", light ? "light" : "dark"];
          if (p.last && (p.last[0] === sq || p.last[1] === sq)) cls.push("last");
          if (p.selected === sq) cls.push("sel");
          if (p.check === sq) cls.push("check");
          if (fog) cls.push("fog");
          if (glow.has(sq)) cls.push("glow");
          if (p.shake === sq) cls.push("shake");
          if (hover === sq && drag != null && isT) cls.push("hov");
          const sl = anim.slide.get(sq);
          if (sl || anim.land.has(sq) || anim.gone.has(sq)) cls.push("mv");
          const pcCls = ["pc"];
          if (drag === sq && p.selected === sq) pcCls.push("ghost");
          else if (sl) pcCls.push("slide", ...(p.selected === sq ? ["lift"] : []));
          else if (p.selected === sq) pcCls.push("lift");
          else if (anim.land.has(sq)) pcCls.push("land");
          const dr = k % n === 0, db = Math.floor(k / n) === n - 1;
          const label = `${n === 8 ? FILES[c] + (8 - r) : `row ${r + 1} column ${c + 1}`}${fog ? ", hidden" : has ? ", " + (ch === "*" ? "duck" : (ch === ch.toUpperCase() ? "white " : "black ") + PIECE_NAMES[ch.toLowerCase()]) : ""}${stars.has(sq) ? ", star" : ""}${isT ? (has ? ", capture" : ", move here") : ""}`;
          return (
            <button
              key={sq}
              type="button"
              className={cls.join(" ")}
              onClick={live ? () => { if (skipClick.current) { skipClick.current = false; return; } p.onTap!(sq); } : undefined}
              aria-label={label}
              disabled={!p.onTap || p.disabled}
            >
              {p.coords !== false && n === 8 && dr && <span className="coord rank">{8 - r}</span>}
              {p.coords !== false && n === 8 && db && <span className="coord file">{FILES[c]}</span>}
              {isT && !has && <span className="dot" />}
              {isT && has && <span className="ring" />}
              {stars.has(sq) && (
                <svg className="star twinkle" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 l3 6.5 7 .8 -5.2 4.8 1.4 7 -6.2 -3.6 -6.2 3.6 1.4 -7 L2 9.3 l7 -.8z" fill="#FFC800" stroke="#E5A800" strokeWidth="1.6" strokeLinejoin="round" /></svg>
              )}
              {anim.gone.has(sq) && <Piece key={`g${anim.id}`} code={anim.gone.get(sq)!} className="pc gone" />}
              {has && (
                <Piece
                  key={`p${sl || anim.land.has(sq) ? anim.id : ""}`}
                  code={ch}
                  className={pcCls.join(" ")}
                  style={sl ? ({ ["--dx" as string]: sl.dx, ["--dy" as string]: sl.dy } as CSSProperties) : undefined}
                />
              )}
              {frozen.has(sq) && (
                <>
                  <span className="ice" />
                  <span className="badge-ice"><svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 v20 M3.3 7 l17.4 10 M3.3 17 L20.7 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg></span>
                </>
              )}
              {shields.has(sq) && (
                <span className="badge-shield"><svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6z" fill="#fff" /></svg></span>
              )}
            </button>
          );
        })}
      </div>
      {drag != null && p.selected === drag && isPiece(p.cells[drag]) && (
        <div ref={floatRef} className="cfloat" style={{ width: `${100 / n}%` }} aria-hidden="true">
          <Piece code={p.cells[drag]} className="pc" />
        </div>
      )}
      {(p.arrows?.length || markAt.size || p.pending != null) && (
        <svg className="cboard-marks" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
          {[...markAt.entries()].map(([sq, types]) => {
            const { x, y } = disp(sq);
            return types.map((t) =>
              t === "hi" ? (
                <rect key={sq + t} x={x - 0.5} y={y - 0.5} width="1" height="1" fill="rgba(255,150,0,.38)" />
              ) : t === "danger" ? (
                <rect key={sq + t} x={x - 0.42} y={y - 0.42} width=".84" height=".84" rx=".14" fill="rgba(255,75,75,.14)" stroke="#FF4B4B" strokeWidth=".07" strokeDasharray=".16 .1" />
              ) : (
                <circle key={sq + t} className="mark-pulse" cx={x} cy={y} r=".43" fill="none" stroke="#FF9600" strokeWidth=".09" />
              ),
            );
          })}
          {p.arrows?.map((a, i) => {
            const A = disp(a.from), B = disp(a.to);
            const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
            const tip = { x: B.x - ux * 0.15, y: B.y - uy * 0.15 };
            const base = { x: tip.x - ux * 0.45, y: tip.y - uy * 0.45 };
            const px = -uy * 0.28, py = ux * 0.28;
            const color = a.color ?? "#FF9600";
            return (
              <g key={i} opacity=".9">
                <path d={`M${A.x + ux * 0.2} ${A.y + uy * 0.2} L${base.x} ${base.y}`} stroke={color} strokeWidth=".2" strokeLinecap="round" strokeDasharray={a.dash ? ".25 .18" : undefined} fill="none" />
                <path d={`M${tip.x} ${tip.y} L${base.x + px} ${base.y + py} L${base.x - px} ${base.y - py}z`} fill={color} />
              </g>
            );
          })}
          {p.pending != null && (() => {
            const { x, y } = disp(p.pending);
            return <rect x={x - 0.46} y={y - 0.46} width=".92" height=".92" rx=".12" fill="none" stroke="#FF9600" strokeWidth=".08" />;
          })()}
        </svg>
      )}
    </div>
  );
}
