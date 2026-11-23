"use client";

import type { CSSProperties } from "react";
import { GROUPS, SPACES } from "../../../convex/lib/boom/rules";
import { ANCHOR, DEPTH, SEA, SLAB, TH, TILE, TW, diamond } from "./iso";
import { ASSETS, SHOW_LABELS, type Asset } from "./assets";
import { Sprite } from "./Sprite";
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
  judol: { icon: "🎰", c: "#3B2D5C", label: "JUDOL" },
  fish: { icon: "🎣", c: "#9ED7EE", label: "MANCING" },
};
const INK = "#231B1A", BONE = "#F3EDE0";

/** The art key for a space, most specific first. */
export function artFor(i: number): Asset | undefined {
  const s = SPACES[i];
  return ASSETS[`tile:space-${i}`] ?? ASSETS[`tile:${s.kind === "lot" ? `lot-${s.group}` : s.kind}`];
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
  const dark = s.kind === "start" || s.kind === "jail" || s.kind === "wheel" || s.kind === "judol";
  return (
    <button
      type="button"
      data-i={i}
      className={`jn-it${offer ? " offer" : ""}${owned ? " own" : ""}`}
      style={{ left: x - ANCHOR.x, top: y - ANCHOR.y, zIndex: z * 2, ...(owned ? { "--o": ink } : {}) } as CSSProperties}
      onClick={onTap}
      aria-label={label}
    >
      {art ? <Sprite a={art} className="jn-itart" /> : <Block top={top} side={side} />}
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

export type LandCell = { x: number; y: number; z: number; track: boolean; left: boolean; right: boolean };

/**
 * The ground: the sea filling the whole grid, and the plus-shaped land rising out of it. Land cells show their
 * cliff faces only where the next cell (down-left or down-right on screen) is sea. Spaces off the track show a
 * faint grid, or your `ground` art.
 */
export function IsoGround({ cells, sea, waves, w, h }: { cells: LandCell[]; sea: [number, number][]; waves: { x: number; y: number }[]; w: number; h: number }) {
  const ground = ASSETS["tile:ground"];
  const g = DEPTH; // the land's top is at the foot of the track tiles
  const s = DEPTH + SLAB; // sea level
  const [tp, rp, bp, lp] = sea;
  const at = (p: [number, number], dy: number) => `${p[0]},${p[1] + dy}`;
  const sorted = [...cells].sort((a, b) => a.z - b.z);
  return (
    <>
      <svg className="jn-ground" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {/* the sea, on its own thin base */}
        <polygon points={`${at(lp, s)} ${at(bp, s)} ${at(bp, s + SEA)} ${at(lp, s + SEA)}`} fill="#4E9FB6" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <polygon points={`${at(bp, s)} ${at(rp, s)} ${at(rp, s + SEA)} ${at(bp, s + SEA)}`} fill="#3F8AA0" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <polygon points={`${at(tp, s)} ${at(rp, s)} ${at(bp, s)} ${at(lp, s)}`} fill="#7CC8EC" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        {waves.map((v, k) => (
          <path key={k} d={`M${v.x - 14} ${v.y + s} q7 -6 14 0 t14 0`} fill="none" stroke="#F3EDE0" strokeOpacity=".7" strokeWidth="2.5" strokeLinecap="round" />
        ))}
        {/* the land, back to front: cliffs where it meets the sea, then the top */}
        {sorted.map((c) => {
          const L = [c.x - TW / 2, c.y + g] as const, B = [c.x, c.y + TH / 2 + g] as const, R = [c.x + TW / 2, c.y + g] as const;
          return (
            <g key={`${c.x},${c.y}`}>
              {c.left && <polygon points={`${L[0]},${L[1]} ${B[0]},${B[1]} ${B[0]},${B[1] + SLAB} ${L[0]},${L[1] + SLAB}`} fill="#D9C9A8" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />}
              {c.right && <polygon points={`${B[0]},${B[1]} ${R[0]},${R[1]} ${R[0]},${R[1] + SLAB} ${B[0]},${B[1] + SLAB}`} fill="#BFA882" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />}
              <polygon points={diamond(c.x, c.y, g)} fill="#E9DFC9" stroke={c.track || ground ? "none" : INK} strokeOpacity=".1" strokeWidth="1.5" />
            </g>
          );
        })}
        {/* the land's outline, so the plus reads crisply against the sea */}
        {sorted.map((c) => (
          <g key={`o${c.x},${c.y}`} stroke={INK} strokeWidth="2.5" strokeLinecap="round">
            {c.left && <line x1={c.x - TW / 2} y1={c.y + g} x2={c.x} y2={c.y + TH / 2 + g} />}
            {c.right && <line x1={c.x} y1={c.y + TH / 2 + g} x2={c.x + TW / 2} y2={c.y + g} />}
          </g>
        ))}
      </svg>
      {ground && cells.filter((c) => !c.track).map((c) => (
        <span key={`${c.x},${c.y}`} className="jn-itground" style={{ left: c.x - ANCHOR.x, top: c.y - ANCHOR.y + g, zIndex: c.z * 2 - 1 }}>
          <Sprite a={ground} />
        </span>
      ))}
    </>
  );
}
