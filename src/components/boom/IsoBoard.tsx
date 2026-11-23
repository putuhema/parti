"use client";

import type { CSSProperties } from "react";
import { GROUPS, SPACES } from "../../../convex/lib/boom/rules";
import { ANCHOR, DEPTH, SLAB, TH, TILE, TW, diamond } from "./iso";
import { SHOW_LABELS, TILE_ART } from "./tiles";
import { money, short, type BoomGameView } from "./common";

// The pieces of the isometric board: the ground the ring sits on, and one tile per space. Tiles show your art
// from tiles.ts when there is some, or a flat placeholder block, with the name and price laid flat on top.

export const CORNERS: Record<string, { icon: string; c: string; label: string }> = {
  start: { icon: "🇮🇩", c: "#E2574C", label: "START" },
  jail: { icon: "🚨", c: "#5E4A8C", label: "DIPERIKSA" },
  jackpot: { icon: "💰", c: "#F4C64E", label: "" },
  wheel: { icon: "📣", c: "#D23A8C", label: "KAMPANYE" },
};
const SPECIAL: Record<string, { icon: string; c: string; label: string }> = {
  surprise: { icon: "?", c: "#F4C64E", label: "KEJUTAN" },
  bonus: { icon: "✉️", c: "#CFE9DA", label: "FAJAR" },
  tax: { icon: "🧾", c: "#F7D3DF", label: "PUNGLI" },
};
const INK = "#231B1A", BONE = "#F3EDE0";

/** The art key for a space, most specific first. */
export function artFor(i: number): string | undefined {
  const s = SPACES[i];
  return TILE_ART[`space-${i}`] ?? TILE_ART[s.kind === "lot" ? `lot-${s.group}` : s.kind];
}

/** Darken a hex colour by `k` (0–1), for the shaded side faces. */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** The placeholder block: a top face and two shaded sides, in the template's exact geometry. */
function Block({ top, side }: { top: string; side: string }) {
  const { x, y } = ANCHOR;
  const l = x - TW / 2, r = x + TW / 2, t = y - TH / 2, b = y + TH / 2;
  return (
    <svg className="jn-itart" viewBox={`0 0 ${TILE} ${TILE}`} aria-hidden="true">
      <polygon points={`${l},${y} ${x},${b} ${x},${b + DEPTH} ${l},${y + DEPTH}`} fill={shade(side, 0.05)} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points={`${x},${b} ${r},${y} ${r},${y + DEPTH} ${x},${b + DEPTH}`} fill={shade(side, 0.28)} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points={`${x},${t} ${r},${y} ${x},${b} ${l},${y}`} fill={top} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function IsoTile({ i, g, x, y, z, ink, offer, label, onTap }: {
  i: number; g: BoomGameView; x: number; y: number; z: number; ink: string | null; offer: boolean; label: string; onTap: () => void;
}) {
  const s = SPACES[i];
  const art = artFor(i);
  const owned = !!ink;
  let top = BONE, side = "#C9B793", icon = "", name = "", amt = "", band: string | null = null;
  if (s.kind === "lot") { side = GROUPS[s.group].color; band = side; name = s.name; amt = short(owned ? g.rents[i] : s.price); }
  else if (s.kind === "hub") { side = "#6B5A52"; icon = s.icon; name = s.name; amt = short(owned ? g.rents[i] : s.price); }
  else if (CORNERS[s.kind]) { const c = CORNERS[s.kind]; top = c.c; side = c.c; icon = c.icon; amt = s.kind === "jackpot" ? short(g.pot) : c.label; }
  else { const c = SPECIAL[s.kind]; top = c.c; side = c.c; icon = c.icon; amt = c.label; }
  const dark = s.kind === "start" || s.kind === "jail" || s.kind === "wheel";
  return (
    <button
      type="button"
      data-i={i}
      className={`jn-it${offer ? " offer" : ""}${owned ? " own" : ""}`}
      style={{ left: x - ANCHOR.x, top: y - ANCHOR.y, zIndex: z * 2, ...(owned ? { "--o": ink } : {}) } as CSSProperties}
      onClick={onTap}
      aria-label={label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tile art is a fixed-size sprite on a transformed layer */}
      {art ? <img className="jn-itart" src={art} alt="" draggable={false} /> : <Block top={top} side={side} />}
      {/* The top face, as a flat square sheared onto the diamond: labels and the owner's outline lie on it. */}
      <span className={`jn-itface${dark ? " dark" : ""}`}>
        {SHOW_LABELS && (
          <>
            {band && <i className="jn-itband" style={{ background: band }} />}
            {icon && <span className="jn-itico">{icon}</span>}
            {name && <span className="jn-itname">{name}</span>}
            <b className="jn-itamt">{amt}</b>
          </>
        )}
      </span>
    </button>
  );
}

/** Screen-reader label for a space. */
export function tileLabel(i: number, g: BoomGameView, ownerName: string | null) {
  const s = SPACES[i];
  if (s.kind === "lot" || s.kind === "hub") return `${s.name}${ownerName ? `, owned by ${ownerName}, rent ${money(g.rents[i])}` : `, for sale at ${money(s.price)}`}`;
  return s.name;
}

/** The ground: the base slab under the board and the grid of cells inside the ring (or your ground art). */
export function IsoGround({ cells, w, h, corners }: { cells: { x: number; y: number; z: number }[]; w: number; h: number; corners: [number, number][] }) {
  const ground = TILE_ART.ground;
  const [tp, rp, bp, lp] = corners; // outer vertices of the whole grid's top face
  const drop = DEPTH; // the ground sits at the foot of the ring tiles
  const g = (p: [number, number], dy = 0) => `${p[0]},${p[1] + drop + dy}`;
  return (
    <>
      <svg className="jn-ground" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <polygon points={`${g(lp)} ${g(bp)} ${g(bp, SLAB)} ${g(lp, SLAB)}`} fill="#D9C9A8" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <polygon points={`${g(bp)} ${g(rp)} ${g(rp, SLAB)} ${g(bp, SLAB)}`} fill="#BFA882" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <polygon points={`${g(tp)} ${g(rp)} ${g(bp)} ${g(lp)}`} fill="#E9DFC9" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        {!ground && cells.map((c) => <polygon key={`${c.x},${c.y}`} points={diamond(c.x, c.y, drop)} fill="none" stroke={INK} strokeOpacity=".09" strokeWidth="1.5" />)}
      </svg>
      {ground && cells.map((c) => (
        // eslint-disable-next-line @next/next/no-img-element -- same as tile art
        <img key={`${c.x},${c.y}`} className="jn-itground" src={ground} alt="" draggable={false} style={{ left: c.x - ANCHOR.x, top: c.y - ANCHOR.y + drop, zIndex: c.z * 2 - 1 }} />
      ))}
    </>
  );
}

