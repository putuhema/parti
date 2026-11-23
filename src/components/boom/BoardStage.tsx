"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Actor, breathe, drawFigure, type PoseName } from "./figure";

// The stick-figure layer over the board: one figure per player, standing on their space. Figures hop
// space to space (crouch, leap, squash on landing, dust), face the way they travel, and act out what
// happens to them. Big moments jolt the board on a spring and throw coins, confetti or dust.

export type StagePlayer = { id: string; ink: string; tile: number; out: boolean; turn: boolean };
export type StageEvent = { n: number; kind: string; by: string; other?: string; amount?: number; success?: boolean } | null;

type Fig = {
  actor: Actor;
  x: number; y: number; // where the feet are now (px)
  hop: { fx: number; fy: number; tx: number; ty: number; t: number; d: number; h: number } | null;
  sq: number; sqV: number; // squash spring (0 = rest)
  flip: boolean;
  tile: number;
  fallen: boolean;
};
type Bit = { x: number; y: number; vx: number; vy: number; g: number; drag: number; t: number; life: number; c: string; r: number; vr: number; kind: "coin" | "chip" | "dust"; tx?: number; ty?: number };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export type Grid = { cols: number; rows: number; at: (tile: number) => { col: number; row: number } };
export type Pt = { x: number; y: number };

/**
 * The board itself is a tilted (isometric on big screens) plane, but figures stand upright: they're drawn in
 * screen space on this canvas, at `centers` (where each space lands on screen after the projection).
 */
export function BoardStage({ players, event, centers, cell, boardRef }: {
  players: StagePlayer[];
  event: StageEvent;
  centers: Pt[]; // each space's centre on screen, relative to the canvas
  cell: number; // how big a space looks on screen, for sizing figures
  boardRef: RefObject<HTMLDivElement | null>; // the layer that shakes on big moments
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const props = useRef({ players, event, centers, cell });
  useEffect(() => { props.current = { players, event, centers, cell }; });
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const figs = new Map<string, Fig>();
    const bits: Bit[] = [];
    let shake = 0, shakeV = 0, lastT = 0, raf = 0, seenN = -1;

    const standAt = (tile: number, id: string) => {
      const p = props.current;
      const c = p.centers[tile] ?? { x: -999, y: -999 };
      const mates = p.players.filter((q) => !q.out && q.tile === tile);
      const k = Math.max(0, mates.findIndex((q) => q.id === id));
      const spread = mates.length > 1 ? (k - (mates.length - 1) / 2) * p.cell * 0.28 : 0;
      return { x: c.x + spread, y: c.y + p.cell * 0.18 };
    };
    const jolt = (a: number) => { if (!still) shakeV += a; };
    const burst = (x: number, y: number, n: number, cols: string[], kind: Bit["kind"] = "chip") => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rnd(-1.2, 1.2), sp = rnd(90, 220);
        bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 520, drag: 1.3, t: 0, life: rnd(0.5, 0.9), c: cols[i % cols.length], r: rnd(0, 6), vr: rnd(-14, 14), kind });
      }
    };
    const dust = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        bits.push({ x: x + side * rnd(2, 7), y, vx: side * rnd(30, 80), vy: -rnd(5, 25), g: 120, drag: 5, t: 0, life: rnd(0.25, 0.45), c: "rgba(90,74,68,.35)", r: rnd(1.5, 3), vr: 0, kind: "dust" });
      }
    };
    /** Coins that arc from one point and home in on another. */
    const coins = (fx: number, fy: number, tx: number, ty: number, n: number) => {
      for (let i = 0; i < n; i++) bits.push({ x: fx + rnd(-4, 4), y: fy, vx: rnd(-60, 60), vy: rnd(-220, -140), g: 0, drag: 0, t: -i * 0.06, life: 0.9, c: "#F4C64E", r: 0, vr: 0, kind: "coin", tx, ty });
    };
    const act = (id: string, ...steps: { pose: PoseName; d: number }[]) => figs.get(id)?.actor.set(...steps.map((s) => ({ ...s, ez: "soft" as const })));

    function onEvent(e: NonNullable<StageEvent>) {
      const f = figs.get(e.by);
      const p = props.current;
      const ink = p.players.find((q) => q.id === e.by)?.ink ?? "#231B1A";
      switch (e.kind) {
        case "roll":
          act(e.by, { pose: "windup", d: 0.16 }, { pose: "throw", d: 0.12 }, { pose: "stand", d: 0.3 });
          break;
        case "buy":
        case "build":
          act(e.by, { pose: "crouch", d: 0.08 }, { pose: "cheer", d: 0.16 }, { pose: "cheer", d: 0.45 }, { pose: "stand", d: 0.3 });
          if (f) burst(f.x, f.y - p.cell * 0.9, 14, [ink, "#F4C64E", "#F3EDE0"]);
          jolt(e.kind === "build" ? 90 : 60);
          break;
        case "rent": {
          act(e.by, { pose: "slump", d: 0.2 }, { pose: "slump", d: 0.7 }, { pose: "stand", d: 0.35 });
          if (e.other) act(e.other, { pose: "crouch", d: 0.08 }, { pose: "cheer", d: 0.15 }, { pose: "cheer", d: 0.5 }, { pose: "stand", d: 0.3 });
          const to = e.other ? figs.get(e.other) : null;
          if (f && to) coins(f.x, f.y - p.cell * 0.7, to.x, to.y - p.cell * 0.7, Math.min(10, 3 + Math.round((e.amount ?? 0) / 40)));
          break;
        }
        case "lap":
        case "bonus":
        case "jackpot":
          act(e.by, { pose: "cheer", d: 0.16 }, { pose: "cheer", d: 0.4 }, { pose: "stand", d: 0.3 });
          if (f) coins(f.x, f.y - p.cell * 2, f.x, f.y - p.cell * 0.6, e.kind === "jackpot" ? 12 : 6);
          if (e.kind === "jackpot") jolt(140);
          break;
        case "tax":
        case "sold":
          act(e.by, { pose: "slump", d: 0.2 }, { pose: "slump", d: 0.5 }, { pose: "stand", d: 0.3 });
          break;
        case "jail":
          act(e.by, { pose: "handsUp", d: 0.15 }, { pose: "handsUp", d: 0.9 }, { pose: "slump", d: 0.3 });
          if (f) burst(f.x, f.y - p.cell * 1.1, 10, ["#E2574C", "#69BFD6"]);
          jolt(120);
          break;
        case "lobby":
          if ((e as { success?: boolean }).success) act(e.by, { pose: "crouch", d: 0.08 }, { pose: "cheer", d: 0.16 }, { pose: "cheer", d: 0.5 }, { pose: "stand", d: 0.3 });
          else act(e.by, { pose: "slump", d: 0.2 }, { pose: "slump", d: 0.6 }, { pose: "stand", d: 0.3 });
          break;
        case "skip":
          act(e.by, { pose: "sit", d: 0.25 }, { pose: "sit", d: 0.6 }, { pose: "stand", d: 0.3 });
          break;
        case "card":
        case "wheel":
          act(e.by, { pose: (e.amount ?? 0) < 0 ? "shrug" : "point", d: 0.2 }, { pose: "stand", d: 0.6 });
          break;
        case "bankrupt":
        case "left":
          if (f) { f.fallen = true; f.actor.set({ pose: "fall", d: 0.4, ez: "in" }); }
          jolt(160);
          break;
      }
    }

    const paint = (now: number) => {
      const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
      lastT = now;
      const p = props.current;
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!p.centers.length) { raf = requestAnimationFrame(paint); return; }
      const dpr = window.devicePixelRatio || 1;
      if (el.width !== Math.round(cw * dpr) || el.height !== Math.round(ch * dpr)) { el.width = Math.round(cw * dpr); el.height = Math.round(ch * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      // Keep a figure for every player; start hops when their space changes.
      for (const pl of p.players) {
        let f = figs.get(pl.id);
        const spot = standAt(pl.tile, pl.id);
        if (!f) {
          f = { actor: new Actor(), x: spot.x, y: spot.y, hop: null, sq: 0, sqV: 0, flip: false, tile: pl.tile, fallen: pl.out };
          if (pl.out) f.actor.set({ pose: "fall", d: 0.01 });
          figs.set(pl.id, f);
        }
        if (f.tile !== pl.tile) {
          const far = Math.abs(f.x - spot.x) + Math.abs(f.y - spot.y) > p.cell * 2.5;
          f.hop = { fx: f.x, fy: f.y, tx: spot.x, ty: spot.y, t: 0, d: far ? 0.55 : 0.17, h: far ? p.cell * 2.2 : p.cell * 0.55 };
          if (Math.abs(spot.x - f.x) > 2) f.flip = spot.x < f.x;
          f.actor.set({ pose: "crouch", d: still ? 0.01 : 0.04 }, { pose: "leap", d: far ? 0.3 : 0.08 });
          f.tile = pl.tile;
        } else if (!f.hop) {
          // Settle toward the spot (it moves when someone else arrives on the same space, or on resize).
          f.x += (spot.x - f.x) * Math.min(1, dt * 12);
          f.y += (spot.y - f.y) * Math.min(1, dt * 12);
        }
      }
      for (const id of [...figs.keys()]) if (!p.players.some((q) => q.id === id)) figs.delete(id);

      const e = p.event;
      if (e && e.n !== seenN) { seenN = e.n; onEvent(e); }

      // Springs and hops.
      shakeV += (-260 * shake - 15 * shakeV) * dt;
      shake += shakeV * dt;
      const board = boardRef.current;
      if (board) board.style.translate = Math.abs(shake) > 0.05 ? `0 ${shake.toFixed(2)}px` : "";
      for (const f of figs.values()) {
        f.actor.update(dt);
        if (f.hop) {
          f.hop.t += dt;
          const k = Math.min(1, f.hop.t / f.hop.d);
          f.x = f.hop.fx + (f.hop.tx - f.hop.fx) * k;
          f.y = f.hop.fy + (f.hop.ty - f.hop.fy) * k - Math.sin(k * Math.PI) * f.hop.h;
          if (k >= 1) {
            f.hop = null;
            f.sqV -= still ? 0 : 7;
            dust(f.x, f.y, 5);
            f.actor.set({ pose: "land", d: 0.05 }, { pose: f.fallen ? "fall" : "stand", d: 0.18 });
          }
        }
        f.sqV += (-320 * f.sq - 14 * f.sqV) * dt;
        f.sq += f.sqV * dt;
      }

      // Figures, back to front.
      const order = [...p.players].sort((a, b) => (figs.get(a.id)?.y ?? 0) - (figs.get(b.id)?.y ?? 0));
      // Figures stand a little taller than a space, so they read on a phone; big boards cap the size.
      const scale = Math.max(0.55, Math.min(1.5, (p.cell * 1.15) / 66));
      for (const pl of order) {
        const f = figs.get(pl.id)!;
        const air = f.hop ? Math.sin(Math.min(1, f.hop.t / f.hop.d) * Math.PI) : 0;
        // contact shadow
        ctx.save();
        ctx.globalAlpha = (pl.out ? 0.06 : 0.16) * (1 - air * 0.6);
        ctx.fillStyle = "#231B1A";
        const base = f.hop ? f.hop.fy + (f.hop.ty - f.hop.fy) * Math.min(1, f.hop.t / f.hop.d) : f.y;
        ctx.beginPath(); ctx.ellipse(f.x, base + 1, 9 * scale * (1 - air * 0.4), 2.6 * scale, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // the turn marker: a little bobbing chevron overhead
        if (pl.turn && !pl.out) {
          const bob = still ? 0 : Math.sin(now / 220) * 2;
          ctx.save();
          ctx.fillStyle = pl.ink; ctx.strokeStyle = "#231B1A"; ctx.lineWidth = 1.5;
          const ty = f.y - 82 * scale + bob;
          ctx.beginPath(); ctx.moveTo(f.x - 5, ty - 6); ctx.lineTo(f.x + 5, ty - 6); ctx.lineTo(f.x, ty); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        const stretch = f.hop ? 0.1 * air : 0;
        const sq = f.sq;
        drawFigure(ctx, breathe(f.actor.pose, still || f.fallen ? 0 : Math.sin(now / 420 + pl.id.length) * 0.9), f.x, f.y, {
          shirt: pl.ink, flip: f.flip, scale, alpha: pl.out ? 0.45 : 1,
          sx: 1 + sq * 0.5 - stretch * 0.5, sy: 1 - sq + stretch,
        });
      }

      // Particles: coins home in on their target; chips and dust fall.
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.t += dt;
        if (b.t < 0) continue;
        if (b.kind === "coin" && b.tx !== undefined) {
          const k = Math.min(1, b.t / b.life);
          b.vx += ((b.tx - b.x) * 40 - b.vx * 6) * dt;
          b.vy += ((b.ty! - b.y) * 40 - b.vy * 6) * dt + 300 * dt * (1 - k);
        } else {
          b.vy += b.g * dt;
          b.vx *= 1 - Math.min(1, b.drag * dt);
        }
        b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
        if (b.t > b.life) { bits.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = b.kind === "coin" ? 1 : Math.max(0, 1 - b.t / b.life);
        ctx.translate(b.x, b.y);
        if (b.kind === "coin") {
          ctx.fillStyle = "#231B1A"; ctx.beginPath(); ctx.arc(1, 1, 4.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#B8860B"; ctx.font = "800 6px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("Rp", 0, 0.5);
        } else if (b.kind === "dust") {
          ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(0, 0, b.r * (1 - b.t / b.life * 0.5), 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.rotate(b.r);
          ctx.fillStyle = "#231B1A"; ctx.fillRect(-3, -1.8, 6, 3.6);
          ctx.fillStyle = b.c; ctx.fillRect(-2.2, -1, 4.4, 2);
        }
        ctx.restore();
      }

      const busy = !still || bits.length > 0 || [...figs.values()].some((f) => f.hop || !f.actor.idle);
      raf = busy ? requestAnimationFrame(paint) : 0;
    };
    const go = () => { if (!raf) raf = requestAnimationFrame(paint); };
    kick.current = go;
    const ro = new ResizeObserver(go);
    ro.observe(el);
    go();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [boardRef]);

  useEffect(() => { kick.current(); });

  return <canvas ref={canvas} className="jn-stage" aria-hidden="true" />;
}
