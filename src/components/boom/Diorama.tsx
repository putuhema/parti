// Tiny isometric dioramas that stand on each space: a scene for every island group, a vehicle for each
// transport hub, and a prop for the corners and special spaces. Drawn in the board's 2:1 projection, in the
// cut-paper style (flat fills, ink outlines). A space with its own art in tiles.ts skips its diorama.
//
// Each scene is drawn in a 64 × 64 box whose ground anchor (where it meets the tile) is at (32, 56).
// Ground units run u (down-right) and v (down-left); h goes straight up.

import type { ReactNode } from "react";
import { SPACES } from "../../../convex/lib/boom/rules";

const INK = "#231B1A";
type Pt = [number, number];
const P = (u: number, v: number, h = 0): Pt => [32 + (u - v), 56 + (u + v) / 2 - h];
const pts = (...ps: Pt[]) => ps.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
const S = { stroke: INK, strokeWidth: 1.1, strokeLinejoin: "round" as const };

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** A box on the ground from (u, v), w along u, d along v, h tall. */
function Box({ u, v, w, d, h, top, side, z = 0 }: { u: number; v: number; w: number; d: number; h: number; top: string; side: string; z?: number }) {
  return (
    <g>
      <polygon points={pts(P(u, v + d, z), P(u + w, v + d, z), P(u + w, v + d, z + h), P(u, v + d, z + h))} fill={side} {...S} />
      <polygon points={pts(P(u + w, v, z), P(u + w, v + d, z), P(u + w, v + d, z + h), P(u + w, v, z + h))} fill={shade(side, 0.22)} {...S} />
      <polygon points={pts(P(u, v, z + h), P(u + w, v, z + h), P(u + w, v + d, z + h), P(u, v + d, z + h))} fill={top} {...S} />
    </g>
  );
}
/** A pitched roof over a box, ridge along u. `lift` curls the ends up (tongkonan, rumah gadang). */
function Roof({ u, v, w, d, h, rh, c, lift = 0 }: { u: number; v: number; w: number; d: number; h: number; rh: number; c: string; lift?: number }) {
  const a = P(u - lift / 2, v + d / 2, h + rh + lift), b = P(u + w + lift / 2, v + d / 2, h + rh + lift);
  return (
    <g>
      <path d={`M${pts(P(u, v + d, h))} L${pts(P(u + w, v + d, h))} Q${pts(P(u + w, v + d / 2, h + rh))} ${pts(b)} Q${pts(P(u + w / 2, v + d / 2, h + rh - 1))} ${pts(a)} Q${pts(P(u, v + d / 2, h + rh))} ${pts(P(u, v + d, h))} Z`} fill={c} {...S} />
      <polygon points={pts(P(u + w, v, h), P(u + w, v + d, h), P(u + w, v + d / 2, h + rh))} fill={shade(c, 0.25)} {...S} />
    </g>
  );
}
function Shadow({ u, v, r }: { u: number; v: number; r: number }) {
  const [x, y] = P(u, v);
  return <ellipse cx={x} cy={y} rx={r} ry={r / 2} fill={INK} opacity=".14" />;
}
function Tree({ u, v, s = 1, c = "#3DAE4A" }: { u: number; v: number; s?: number; c?: string }) {
  const [x, y] = P(u, v);
  return (
    <g>
      <Shadow u={u} v={v} r={4 * s} />
      <path d={`M${x} ${y} V${y - 6 * s}`} stroke={INK} strokeWidth={1.6 * s} strokeLinecap="round" />
      <circle cx={x} cy={y - 9 * s} r={5 * s} fill={c} {...S} />
      <circle cx={x - 1.6 * s} cy={y - 10.6 * s} r={1.6 * s} fill="#fff" opacity=".35" />
    </g>
  );
}
function Pine({ u, v, s = 1 }: { u: number; v: number; s?: number }) {
  const [x, y] = P(u, v);
  return (
    <g>
      <Shadow u={u} v={v} r={3.5 * s} />
      <polygon points={`${x},${y - 16 * s} ${x + 5 * s},${y - 5 * s} ${x - 5 * s},${y - 5 * s}`} fill="#2F7D52" {...S} />
      <polygon points={`${x},${y - 11 * s} ${x + 6 * s},${y - 1 * s} ${x - 6 * s},${y - 1 * s}`} fill="#3A9A62" {...S} />
    </g>
  );
}
function Palm({ u, v, s = 1, flip = false }: { u: number; v: number; s?: number; flip?: boolean }) {
  const [x, y] = P(u, v);
  const k = flip ? -1 : 1;
  const tx = x + 4 * s * k, ty = y - 15 * s;
  return (
    <g>
      <Shadow u={u} v={v} r={4 * s} />
      <path d={`M${x} ${y} Q${x + 1 * k} ${y - 9 * s} ${tx} ${ty}`} fill="none" stroke="#8A5A3A" strokeWidth={2 * s} strokeLinecap="round" />
      {[-1, -0.4, 0.4, 1].map((a) => (
        <path key={a} d={`M${tx} ${ty} q${7 * a * s} ${-3 * s} ${9 * a * s} ${3 * s}`} fill="none" stroke="#2F9E5A" strokeWidth={2.2 * s} strokeLinecap="round" />
      ))}
      <circle cx={tx} cy={ty + 1} r={1.4 * s} fill="#8A5A3A" />
    </g>
  );
}
function Water({ r = 14 }: { r?: number }) {
  return <polygon points={pts(P(-r, -r), P(r, -r), P(r, r), P(-r, r))} fill="#7CC8EC" stroke={INK} strokeWidth="1" strokeLinejoin="round" opacity=".95" />;
}
function Flag({ u, v, h, c, c2 = "#F3EDE0" }: { u: number; v: number; h: number; c: string; c2?: string }) {
  const [x, y] = P(u, v);
  return (
    <g>
      <path d={`M${x} ${y} V${y - h}`} stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <rect x={x} y={y - h} width="9" height="3" fill={c} {...S} strokeWidth=".8" />
      <rect x={x} y={y - h + 3} width="9" height="3" fill={c2} {...S} strokeWidth=".8" />
    </g>
  );
}

const SCENES: Record<string, () => ReactNode> = {
  // ---- the island groups ----
  "lot-0": () => ( // Papua: snowy peaks and pines
    <>
      <polygon points={pts(P(-12, 4), P(4, 4), P(-4, -4, 28))} fill="#7B8D6A" {...S} />
      <polygon points={pts(P(4, -12), P(4, 4), P(-4, -4, 28))} fill="#5E6E52" {...S} />
      <polygon points={pts(P(-4, -4, 28), P(-6, -1, 20), P(-3.5, 0, 22), P(-1, 0, 19), P(0, -2, 21.5))} fill="#F3EDE0" {...S} strokeWidth=".8" />
      <Pine u={10} v={-2} s={0.8} />
      <Pine u={4} v={9} s={0.95} />
    </>
  ),
  "lot-1": () => ( // Maluku & Nusa Tenggara: a palm islet in the sea
    <>
      <Water r={12} />
      <polygon points={pts(P(-7, -7), P(7, -7), P(7, 7), P(-7, 7))} fill="#F2D9A0" {...S} />
      <Palm u={-1} v={-1} s={1} />
      <Palm u={4} v={2} s={0.75} flip />
    </>
  ),
  "lot-2": () => ( // Sulawesi: a tongkonan, the boat-roofed house
    <>
      <Box u={-8} v={-4} w={14} d={8} h={8} top="#B5643C" side="#8A4A2C" z={3} />
      <Box u={-7} v={-3} w={2} d={2} h={3} top="#5A4A44" side="#5A4A44" />
      <Box u={3} v={-3} w={2} d={2} h={3} top="#5A4A44" side="#5A4A44" />
      <Roof u={-8} v={-4} w={14} d={8} h={11} rh={6} c="#3A3A3A" lift={6} />
      <Tree u={10} v={6} s={0.7} c="#4FA85A" />
    </>
  ),
  "lot-3": () => ( // Kalimantan: rainforest
    <>
      <Tree u={-6} v={-6} s={1.25} c="#2E8B4F" />
      <Tree u={4} v={-5} s={0.95} c="#3DAE4A" />
      <Tree u={-5} v={4} s={0.9} c="#4FB860" />
      <Tree u={5} v={5} s={1.1} c="#2F7D52" />
    </>
  ),
  "lot-4": () => ( // Sumatra: rumah gadang with horned roofs
    <>
      <Box u={-9} v={-4} w={16} d={8} h={9} top="#C98A4B" side="#A0663A" z={2} />
      <Roof u={-9} v={-4} w={16} d={8} h={11} rh={8} c="#4A3A33" lift={8} />
      <Box u={-9} v={-4} w={2} d={2} h={2} top="#5A4A44" side="#5A4A44" />
      <Box u={5} v={-4} w={2} d={2} h={2} top="#5A4A44" side="#5A4A44" />
    </>
  ),
  "lot-5": () => ( // Bali & Lombok: a split gate and a frangipani
    <>
      <Box u={-10} v={-3} w={6} d={6} h={10} top="#C2703F" side="#A85A32" />
      <Box u={-9} v={-2} w={4} d={4} h={4} top="#C2703F" side="#A85A32" z={10} />
      <Box u={-8} v={-1} w={2} d={2} h={4} top="#C2703F" side="#A85A32" z={14} />
      <Box u={0} v={-3} w={6} d={6} h={10} top="#C2703F" side="#A85A32" />
      <Box u={1} v={-2} w={4} d={4} h={4} top="#C2703F" side="#A85A32" z={10} />
      <Box u={2} v={-1} w={2} d={2} h={4} top="#C2703F" side="#A85A32" z={14} />
      <Tree u={6} v={8} s={0.8} c="#F7B6C9" />
    </>
  ),
  "lot-6": () => ( // Jawa: a stepped candi with a stupa
    <>
      <Box u={-10} v={-10} w={20} d={20} h={4} top="#B9B0A0" side="#8F8676" />
      <Box u={-7} v={-7} w={14} d={14} h={4} top="#B9B0A0" side="#8F8676" z={4} />
      <Box u={-4} v={-4} w={8} d={8} h={4} top="#B9B0A0" side="#8F8676" z={8} />
      {(() => { const [x, y] = P(0, 0, 12); return <><path d={`M${x - 4} ${y} Q${x} ${y - 9} ${x + 4} ${y} Z`} fill="#A39A8A" {...S} /><path d={`M${x} ${y - 7} V${y - 11}`} stroke={INK} strokeWidth="1.4" strokeLinecap="round" /></>; })()}
    </>
  ),
  "lot-7": () => ( // Jakarta: towers and a monument with a golden flame
    <>
      <Box u={-10} v={-2} w={6} d={6} h={18} top="#9FC7D8" side="#6C9FB5" />
      <Box u={-2} v={-10} w={6} d={6} h={26} top="#B9D7E3" side="#7FB0C4" />
      <Box u={4} v={2} w={5} d={5} h={12} top="#9FC7D8" side="#6C9FB5" />
      {(() => { const [x, y] = P(-1, 8); return <><Shadow u={-1} v={8} r={3} /><polygon points={`${x - 2},${y} ${x + 2},${y} ${x + 1},${y - 22} ${x - 1},${y - 22}`} fill="#F3EDE0" {...S} /><path d={`M${x} ${y - 22} q-3 -4 0 -7 q3 3 0 7`} fill="#F4C64E" {...S} strokeWidth=".9" /></>; })()}
    </>
  ),
  // ---- transport hubs ----
  Pelabuhan: () => (
    <>
      <Water r={13} />
      <Box u={-8} v={-3} w={14} d={6} h={4} top="#F3EDE0" side="#E2574C" />
      <Box u={-4} v={-2} w={6} d={4} h={4} top="#F3EDE0" side="#D9CBB0" z={4} />
      <Box u={-3} v={-1} w={2} d={2} h={5} top="#231B1A" side="#E2574C" z={8} />
    </>
  ),
  Bandara: () => (
    <>
      <Box u={-10} v={-6} w={6} d={6} h={16} top="#F3EDE0" side="#D9CBB0" />
      <Box u={-11} v={-7} w={8} d={8} h={4} top="#69BFD6" side="#4E9FB6" z={16} />
      {(() => { const [x, y] = P(5, 3, 6); return <g transform={`translate(${x} ${y}) rotate(-26)`}><path d="M-9 0 H9 Q12 0 9 2 H-9 Z" fill="#F3EDE0" {...S} /><path d="M-2 0 L-6 -6 H-3 L3 0 Z M-2 2 L-6 8 H-3 L3 2 Z M-8 0 L-10 -4 H-8 L-5 0 Z" fill="#69BFD6" {...S} strokeWidth=".9" /></g>; })()}
    </>
  ),
  Stasiun: () => (
    <>
      <polygon points={pts(P(-14, 1), P(14, 1), P(14, 5), P(-14, 5))} fill="#8A7A70" {...S} />
      <Box u={-11} v={1} w={10} d={4} h={7} top="#F3EDE0" side="#E2574C" />
      <Box u={0} v={1} w={10} d={4} h={7} top="#F3EDE0" side="#E2574C" />
      <Box u={-6} v={-9} w={10} d={5} h={6} top="#C98A4B" side="#A0663A" />
    </>
  ),
  Terminal: () => (
    <>
      <Box u={-9} v={-2} w={16} d={6} h={8} top="#F3EDE0" side="#3DB6F2" />
      {(() => { const [x, y] = P(-5, 4, 4); return <rect x={x} y={y} width="16" height="3" fill="#CFE9F2" stroke={INK} strokeWidth=".8" transform={`skewY(-26.57) translate(0 ${x * 0.5})`} />; })()}
      <Box u={-12} v={-12} w={4} d={4} h={10} top="#F4C64E" side="#C9A23A" />
    </>
  ),
  // ---- corners ----
  start: () => (
    <>
      <Box u={-6} v={-6} w={12} d={12} h={3} top="#F3EDE0" side="#D9CBB0" />
      <Flag u={0} v={0} h={24} c="#E2574C" />
    </>
  ),
  jail: () => (
    <>
      <Box u={-8} v={-6} w={14} d={10} h={10} top="#F3EDE0" side="#5E4A8C" />
      <Roof u={-8} v={-6} w={14} d={10} h={10} rh={5} c="#3B2D5C" />
      {(() => { const [x, y] = P(-1, -1, 16); return <path d={`M${x - 3} ${y} a3 3 0 0 1 6 0 Z`} fill="#E2574C" {...S} />; })()}
    </>
  ),
  jackpot: () => (
    <>
      <Box u={-8} v={-8} w={12} d={12} h={12} top="#9E9E9E" side="#7A7A7A" />
      {[0, 1, 2, 3].map((k) => { const [x, y] = P(8, 4, k * 2.2); return <ellipse key={k} cx={x} cy={y} rx="4.5" ry="2.2" fill="#F4C64E" {...S} strokeWidth=".8" />; })}
      {(() => { const [x, y] = P(-2, 4, 7); return <circle cx={x} cy={y} r="2.6" fill="#F4C64E" {...S} />; })()}
    </>
  ),
  wheel: () => (
    <>
      <Box u={-10} v={-6} w={18} d={10} h={4} top="#C98A4B" side="#A0663A" />
      {(() => { const [x, y] = P(-6, -6, 4); return <><path d={`M${x} ${y} V${y - 14}`} stroke={INK} strokeWidth="1.2" /><rect x={x - 1} y={y - 22} width="16" height="10" fill="#D23A8C" {...S} transform={`skewY(-26.57) translate(0 ${x * 0.5})`} /></>; })()}
      {(() => { const [x, y] = P(3, 1, 4); return <path d={`M${x} ${y} l5 -3 v6 Z`} fill="#F4C64E" {...S} />; })()}
    </>
  ),
  // ---- special spaces ----
  surprise: () => (
    <>
      <Box u={-6} v={-6} w={12} d={12} h={12} top="#F4C64E" side="#D9A93A" />
      {(() => { const [x, y] = P(0, 0, 12); return <text x={x} y={y + 3} textAnchor="middle" fontSize="10" fontWeight="900" fill={INK}>?</text>; })()}
    </>
  ),
  bonus: () => (
    <>
      {[0, 1, 2].map((k) => <Box key={k} u={-7 + k} v={-5 - k} w={12} d={8} h={2} top="#F3EDE0" side="#CFE9DA" z={k * 2} />)}
      {(() => { const [x, y] = P(0, -1, 6); return <path d={`M${x - 6} ${y - 1} L${x} ${y + 2} L${x + 6} ${y - 1}`} fill="none" stroke={INK} strokeWidth=".9" />; })()}
    </>
  ),
  tax: () => (
    <>
      <Box u={-10} v={-4} w={6} d={6} h={12} top="#F3EDE0" side="#F7D3DF" />
      {(() => { const [x, y] = P(-4, 0, 7); return <path d={`M${x} ${y} L${x + 18} ${y + 9}`} stroke="#E2574C" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="3 2.4" />; })()}
    </>
  ),
  judol: () => (
    <>
      <Box u={-6} v={-5} w={10} d={8} h={16} top="#3B2D5C" side="#5B3A86" />
      {(() => { const [x, y] = P(-6, 3, 10); return <><rect x={x + 1} y={y - 3} width="9" height="4" rx="1" fill="#F4C64E" {...S} strokeWidth=".8" transform={`skewY(-26.57) translate(0 ${(x + 1) * 0.5})`} /></>; })()}
      {(() => { const [x, y] = P(-1, -1, 16); return <circle cx={x} cy={y - 3} r="2.4" fill="#E2574C" {...S} className="jn-dioblink" />; })()}
    </>
  ),
};

/** Which scene a space gets, if any. */
export function dioramaFor(i: number): string | null {
  const s = SPACES[i];
  const key = s.kind === "lot" ? `lot-${s.group}` : s.kind === "hub" ? s.name : s.kind;
  return SCENES[key] ? key : null;
}

export function Diorama({ scene }: { scene: string }) {
  return (
    <svg className="jn-dio" viewBox="0 0 64 64" aria-hidden="true">
      {SCENES[scene]()}
    </svg>
  );
}
