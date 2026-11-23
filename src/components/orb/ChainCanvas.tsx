"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import type { Placed, Side } from "../../../convex/lib/orb/rules";
import type { Ink } from "./Play";

// The chain is painted on one fixed-size canvas, so a growing chain never moves the page around.
// Tiles snake back and forth in rows and shrink until the whole chain, both open ends included, fits.
// Where a row runs out, a dashed U-turn arrow shows the chain carrying on along the next row.

export type EndRects = Record<Side, { x: number; y: number; w: number; h: number } | null>;
export type Fresh = { n: number; key: string; orb: boolean } | null;

const C = { bone: "#F3EDE0", ink: "#231B1A", muted: "#5A4A44", coral: "#E2574C", coralSoft: "#FBE3DF", moss: "#3FA77A", magenta: "#D23A8C", mustard: "#F4C64E" };
const FACE: Record<Ink, string> = { plum: "#5E4A8C", lagoon: "#69BFD6", moss: "#3FA77A", magenta: "#D23A8C", bone: "#F3EDE0" };
// The board's height comes from CSS (fixed per screen size), so the chain never pushes the page around.
const LAND_MS = 520;
const FX_MS = 1500;

type Item =
  | { kind: "end"; side: Side; value: number }
  | { kind: "tile"; key: string; left: number; right: number; ink: Ink; double: boolean };
type Box = { item: Item; x: number; y: number; w: number; h: number };
type Turn = { side: "right" | "left"; from: Box; to: Box };

const keyOf = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/** Lay the items out in rows that snake left→right, then right→left, at tile unit `u`.
 *  A margin is kept on both sides for the U-turn arrows between rows. */
function layout(items: Item[], width: number, u: number) {
  const gap = Math.max(3, Math.round(u * 0.22));
  const rowH = u * 2;
  const rowGap = Math.max(8, Math.round(u * 0.55));
  const margin = Math.round(u * 0.9);
  const inner = width - margin * 2;
  const size = (it: Item) => (it.kind === "end" ? { w: u * 1.4, h: u * 1.4 } : it.double ? { w: u, h: u * 2 } : { w: u * 2, h: u });
  const rows: Item[][] = [[]];
  let used = 0;
  for (const it of items) {
    const w = size(it).w;
    if (rows[rows.length - 1].length && used + gap + w > inner) { rows.push([]); used = 0; }
    used += (rows[rows.length - 1].length ? gap : 0) + w;
    rows[rows.length - 1].push(it);
  }
  const boxes: Box[] = [];
  const rowBoxes: Box[][] = [];
  rows.forEach((row, r) => {
    const rtl = r % 2 === 1;
    const y0 = r * (rowH + rowGap);
    let x = rtl ? margin + inner : margin;
    const mine: Box[] = [];
    for (const raw of row) {
      // On a right-to-left row a tile is mirrored so its touching halves still meet.
      const item: Item = raw.kind === "tile" && rtl ? { ...raw, left: raw.right, right: raw.left } : raw;
      const { w, h } = size(item);
      const bx = rtl ? x - w : x;
      const b = { item, x: bx, y: y0 + (rowH - h) / 2, w, h };
      boxes.push(b);
      mine.push(b);
      x = rtl ? bx - gap : bx + w + gap;
    }
    rowBoxes.push(mine);
  });
  const turns: Turn[] = [];
  for (let r = 0; r + 1 < rowBoxes.length; r++) {
    turns.push({ side: r % 2 === 0 ? "right" : "left", from: rowBoxes[r][rowBoxes[r].length - 1], to: rowBoxes[r + 1][0] });
  }
  return { boxes, turns, margin, rowH, height: rows.length * rowH + (rows.length - 1) * rowGap };
}

function fit(items: Item[], width: number, height: number) {
  const top = Math.max(16, Math.min(46, Math.floor(height / 4.2)));
  for (let u = top; u >= 9; u -= 1) {
    const l = layout(items, width, u);
    if (l.height <= height) return { ...l, u };
  }
  return { ...layout(items, width, 9), u: 9 };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const easeOutBack = (p: number) => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function ChainCanvas({ chain, ends, inkOf, hot, over, fresh, onEnd, endsRef, label }: {
  chain: Placed[];
  ends: { L: number; R: number };
  inkOf: (id: string) => Ink;
  hot: Side[];
  over: { side: Side; ok: boolean } | null;
  fresh: Fresh;
  onEnd: (side: Side) => void;
  endsRef: MutableRefObject<EndRects>;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const boxesRef = useRef<Box[]>([]);
  const born = useRef<{ n: number; at: number }>({ n: -1, at: 0 });
  const kickRef = useRef<() => void>(() => {});
  // Everything the painter needs, kept in a ref so the animation loop always sees the latest props.
  const props = useRef({ chain, ends, inkOf, hot, over, fresh });
  useEffect(() => {
    props.current = { chain, ends, inkOf, hot, over, fresh };
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let width = el.clientWidth;
    let HEIGHT = el.clientHeight || 196;
    let font = "sans-serif";
    const readFont = () => { font = getComputedStyle(el).getPropertyValue("--font-allo").trim() || "sans-serif"; };
    readFont();

    const paint = (now: number) => {
      const p = props.current;
      const dpr = window.devicePixelRatio || 1;
      if (el.width !== Math.round(width * dpr) || el.height !== Math.round(HEIGHT * dpr)) {
        el.width = Math.round(width * dpr);
        el.height = Math.round(HEIGHT * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, HEIGHT);

      const items: Item[] = [
        { kind: "end", side: "L", value: p.ends.L },
        ...p.chain.map((c): Item => ({ kind: "tile", key: keyOf(c.a, c.b), left: c.a, right: c.b, ink: p.inkOf(c.by), double: c.a === c.b })),
        { kind: "end", side: "R", value: p.ends.R },
      ];
      const pad = 8;
      const { boxes, turns, height, u } = fit(items, width - pad * 2, HEIGHT - pad * 2);
      const oy = pad + (HEIGHT - pad * 2 - height) / 2;
      const shift = (b: Box) => ({ ...b, x: b.x + pad, y: b.y + oy });
      const placed = boxes.map(shift);
      boxesRef.current = placed;

      // U-turn arrows where the chain drops to the next row, so it reads as one snaking line.
      for (const t of turns) {
        const a = shift(t.from), z = shift(t.to);
        const right = t.side === "right";
        const ax = right ? a.x + a.w : a.x, zx = right ? z.x + z.w : z.x;
        const ay = a.y + a.h / 2, zy = z.y + z.h / 2;
        const edge = right ? Math.max(ax, zx) + u * 0.25 : Math.min(ax, zx) - u * 0.25;
        const bulge = right ? edge + u * 0.55 : edge - u * 0.55;
        ctx.save();
        ctx.strokeStyle = C.muted;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = Math.max(2, u * 0.09);
        ctx.lineCap = "round";
        ctx.setLineDash([Math.max(3, u * 0.16), Math.max(3, u * 0.14)]);
        ctx.beginPath();
        ctx.moveTo(ax + (right ? 3 : -3), ay);
        ctx.lineTo(edge, ay);
        ctx.bezierCurveTo(bulge, ay, bulge, zy, edge, zy);
        ctx.lineTo(zx + (right ? 5 : -5), zy);
        ctx.stroke();
        ctx.setLineDash([]);
        // Arrowhead pointing back into the next row.
        const tip = zx + (right ? 3 : -3), dir = right ? 1 : -1, hs = Math.max(5, u * 0.26);
        ctx.fillStyle = C.muted;
        ctx.beginPath();
        ctx.moveTo(tip, zy);
        ctx.lineTo(tip + dir * hs, zy - hs * 0.7);
        ctx.lineTo(tip + dir * hs, zy + hs * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Where the ends are on screen, for dragging from the hand.
      const rect = el.getBoundingClientRect();
      const er: EndRects = { L: null, R: null };
      for (const b of placed) if (b.item.kind === "end") er[b.item.side] = { x: rect.left + b.x, y: rect.top + b.y, w: b.w, h: b.h };
      endsRef.current = er;

      const f = p.fresh;
      if (f && f.n !== born.current.n) born.current = { n: f.n, at: now };
      const age = f && f.n === born.current.n && !still ? now - born.current.at : Infinity;
      let busy = age < FX_MS || p.hot.length > 0 || !!p.over;

      const shadow = Math.max(1.5, u * 0.1);
      const fontPx = (s: number) => `800 ${Math.round(s)}px ${font}`;

      for (const b of placed) {
        const it = b.item;
        if (it.kind === "end") {
          const isHot = p.hot.includes(it.side);
          const isOver = p.over?.side === it.side;
          const pulse = isHot && !still ? (Math.sin(now / 190) + 1) / 2 : 0;
          const grow = isOver && p.over!.ok ? 1.25 : isHot ? 1.06 + pulse * 0.04 : 1;
          const shake = isOver && !p.over!.ok && !still ? Math.sin(now / 30) * 3 : 0;
          const cx = b.x + b.w / 2 + shake, cy = b.y + b.h / 2;
          const w = b.w * grow, h = b.h * grow;
          ctx.save();
          if (isHot && !isOver) {
            ctx.fillStyle = `rgba(226,87,76,${0.12 + pulse * 0.16})`;
            rr(ctx, cx - w / 2 - 5, cy - h / 2 - 5, w + 10, h + 10, u * 0.4);
            ctx.fill();
          }
          rr(ctx, cx - w / 2, cy - h / 2, w, h, u * 0.3);
          ctx.fillStyle = isOver ? (p.over!.ok ? C.moss : C.coralSoft) : isHot ? C.coralSoft : "rgba(0,0,0,0)";
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.setLineDash(isOver && p.over!.ok ? [] : [5, 4]);
          ctx.strokeStyle = isOver ? (p.over!.ok ? C.ink : C.coral) : isHot ? C.coral : C.muted;
          ctx.globalAlpha = isHot || isOver ? 1 : 0.5;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = isOver && p.over!.ok ? C.bone : isHot || isOver ? C.coral : C.muted;
          ctx.font = fontPx(u * 0.75);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(it.value), cx, cy + 1);
          ctx.restore();
          continue;
        }

        const isNew = it.key === f?.key && age < FX_MS;
        const land = isNew ? clamp(age / LAND_MS) : 1;
        const e = easeOutBack(land);
        const lift = (1 - e) * -u * 1.6;
        const scale = 1 + (1 - land) * 0.3;
        const face = FACE[it.ink];
        const text = it.ink === "bone" ? C.ink : C.bone;
        ctx.save();
        ctx.globalAlpha = isNew ? clamp(land * 2.2) : 1;
        ctx.translate(b.x + b.w / 2, b.y + b.h / 2 + lift);
        ctx.rotate(isNew ? (1 - land) * -0.25 : 0);
        ctx.scale(scale, scale);
        const x = -b.w / 2, y = -b.h / 2, r = Math.max(3, u * 0.24);
        rr(ctx, x + shadow, y + shadow, b.w, b.h, r);
        ctx.fillStyle = C.ink;
        ctx.fill();
        rr(ctx, x, y, b.w, b.h, r);
        ctx.fillStyle = face;
        ctx.fill();
        if (it.ink === "bone") { ctx.lineWidth = Math.max(1.5, u * 0.08); ctx.strokeStyle = C.ink; ctx.stroke(); }
        // Divider and pips.
        ctx.strokeStyle = text;
        ctx.globalAlpha *= 0.6;
        ctx.lineWidth = Math.max(1.2, u * 0.07);
        ctx.setLineDash([u * 0.12, u * 0.1]);
        ctx.beginPath();
        if (it.double) { ctx.moveTo(x + b.w * 0.22, 0); ctx.lineTo(x + b.w * 0.78, 0); }
        else { ctx.moveTo(0, y + b.h * 0.22); ctx.lineTo(0, y + b.h * 0.78); }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha /= 0.6;
        ctx.fillStyle = text;
        ctx.font = fontPx(u * 0.62);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (it.double) { ctx.fillText(String(it.left), 0, -b.h / 4 + 1); ctx.fillText(String(it.right), 0, b.h / 4 + 1); }
        else { ctx.fillText(String(it.left), -b.w / 4, 1); ctx.fillText(String(it.right), b.w / 4, 1); }
        ctx.restore();

        if (isNew) {
          const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          const ring = clamp((age - 180) / (f!.orb ? 1000 : 700));
          if (ring > 0 && ring < 1) {
            ctx.save();
            ctx.globalAlpha = 1 - ring;
            ctx.lineWidth = 3;
            ctx.strokeStyle = f!.orb ? C.magenta : it.ink === "bone" ? C.ink : face;
            const s = 1 + ring * 0.8;
            rr(ctx, cx - (b.w / 2 + 4) * s, cy - (b.h / 2 + 4) * s, (b.w + 8) * s, (b.h + 8) * s, u * 0.3 * s);
            ctx.stroke();
            ctx.restore();
          }
          const sp = clamp((age - 200) / 640);
          if (sp > 0 && sp < 1) {
            ctx.save();
            ctx.globalAlpha = 1 - sp;
            const col = f!.orb ? C.magenta : it.ink === "bone" ? C.mustard : face;
            for (let i = 0; i < 10; i++) {
              const a = (i * Math.PI) / 5;
              const d = u * 0.4 + sp * u * 1.6;
              const s = (i % 2 ? 4 : 6) * (1 - sp * 0.6);
              ctx.fillStyle = C.ink;
              ctx.fillRect(cx + Math.cos(a) * d - s / 2 - 1, cy + Math.sin(a) * d - s / 2 - 1, s + 2, s + 2);
              ctx.fillStyle = col;
              ctx.fillRect(cx + Math.cos(a) * d - s / 2, cy + Math.sin(a) * d - s / 2, s, s);
            }
            ctx.restore();
          }
          if (f!.orb) {
            const t = clamp((age - 250) / 1250);
            if (t > 0 && t < 1) {
              const rise = t < 0.18 ? (t / 0.18) * 14 : 14 + (t - 0.18) * 20;
              ctx.save();
              ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : clamp(t * 6);
              ctx.font = fontPx(12);
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const label = "+1 ORB";
              const w = ctx.measureText(label).width + 16;
              const lx = Math.min(width - w / 2 - 2, Math.max(w / 2 + 2, cx));
              const ly = Math.max(12, b.y - 4 - rise);
              rr(ctx, lx - w / 2 + 2, ly - 9 + 2, w, 18, 9);
              ctx.fillStyle = C.ink;
              ctx.fill();
              rr(ctx, lx - w / 2, ly - 9, w, 18, 9);
              ctx.fillStyle = C.magenta;
              ctx.fill();
              ctx.fillStyle = C.bone;
              ctx.fillText(label, lx, ly + 1);
              ctx.restore();
            }
          }
        }
      }
      if (still) busy = false;
      raf = busy ? requestAnimationFrame(paint) : 0;
    };

    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const ro = new ResizeObserver(() => { width = el.clientWidth; HEIGHT = el.clientHeight || HEIGHT; kick(); });
    ro.observe(el);
    void document.fonts?.ready.then(() => { readFont(); kick(); });
    // Repaint whenever React hands us new props, and on scroll (the end rects move with the page).
    const onScroll = () => kick();
    window.addEventListener("scroll", onScroll, { passive: true });
    kickRef.current = kick;
    kick();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [endsRef]);

  // New props: ask the painter for a frame.
  useEffect(() => {
    kickRef.current();
  });

  function hit(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    for (const b of boxesRef.current) {
      if (b.item.kind === "end" && x > b.x - 12 && x < b.x + b.w + 12 && y > b.y - 12 && y < b.y + b.h + 12) return b.item.side;
    }
    return null;
  }

  return (
    <div className="ow-board">
      <canvas
        ref={canvas}
        className="ow-canvas"
        role="img"
        aria-label={label}
        onPointerUp={(e) => { const s = hit(e); if (s && hot.includes(s)) onEnd(s); }}
        onPointerMove={(e) => { e.currentTarget.style.cursor = hit(e) && hot.includes(hit(e)!) ? "pointer" : "default"; }}
      />
      {(["L", "R"] as Side[]).map((s) => (
        <button key={s} className="ow-sr" disabled={!hot.includes(s)} onClick={() => onEnd(s)}>
          Cast on the {s === "L" ? "left" : "right"} end, {ends[s]}
        </button>
      ))}
    </div>
  );
}
