"use client";

import type { ReactNode } from "react";
import type { ChessMode } from "../../../convex/lib/chess";
import { Avatar, type Paint } from "@/components/ui";
import { Piece } from "./Board";

export type ModeInfo = {
  id: ChessMode;
  name: string;
  who: string;
  rule: string;
  party?: boolean;
  face: string;
  edge: string;
  soft: string;
  line: string;
  ink: string;
  icon: string; // stroke path, 24x24
};

export const MODES: ModeInfo[] = [
  { id: "classic", name: "Classic", who: "2 players", face: "#1CB0F6", edge: "#1899D6", soft: "#DDF4FF", line: "#84D8FF", ink: "#1478A8", icon: "M4 20 L20 4 M14 4 h6 v6 M20 20 L4 4 M4 10 V4 h6", rule: "Normal chess with a friend. Standard rules, a clock each, and reactions to tease each other." },
  { id: "team", name: "Team vs Bot", who: "2 vs bot", party: true, face: "#CE82FF", edge: "#A568CC", soft: "#F3E2FF", line: "#DDB3FF", ink: "#8A4FB5", icon: "M6 8 h12 a3 3 0 0 1 3 3 v6 a3 3 0 0 1 -3 3 H6 a3 3 0 0 1 -3 -3 v-6 a3 3 0 0 1 3 -3z M12 8 V4 M9 14 h.01 M15 14 h.01", rule: "You and a friend share one army against Bolt the bot. The Brain picks a piece type, the Hand makes the move. Roles swap every turn." },
  { id: "coach", name: "Coach Mode", who: "Coach + learner", party: true, face: "#FF9600", edge: "#E08600", soft: "#FFF0DB", line: "#FFC880", ink: "#9A5200", icon: "M2 9 L12 4 L22 9 L12 14z M6 11 v5 c3 2 9 2 12 0 v-5 M22 9 v5", rule: "A friend who knows chess coaches you live against Bolt. They draw arrows and marks on your board, and you make every move." },
  { id: "puzzles", name: "Puzzle Race", who: "1–4 players", party: true, face: "#1CC6B4", edge: "#14A394", soft: "#D6FAF6", line: "#8BE8DE", ink: "#0B6B61", icon: "M12 9 v4.5 l3 2 M9 2 h6 M12 22 a8 8 0 1 0 0-16 a8 8 0 1 0 0 16z", rule: "Everyone gets the same 5 checkmate puzzles. First to solve them all wins. A wrong move freezes you for 10 seconds." },
  { id: "powerups", name: "Power-ups", who: "2 players", party: true, face: "#FF4B4B", edge: "#EA2B2B", soft: "#FFDFE0", line: "#FFB2B2", ink: "#B81F1F", icon: "M13 2 L4 14 h7 l-1 8 9-12 h-7z", rule: "Normal chess plus cards. Capture or give check to earn energy, then play Shield, Freeze, Swap or Rocket." },
  { id: "fog", name: "Fog of War", who: "2 players", party: true, face: "#6F6F6F", edge: "#4B4B4B", soft: "#F0F0F0", line: "#DADADA", ink: "#4B4B4B", icon: "M6 18 h11 a4.5 4.5 0 0 0 0-9 a6.5 6.5 0 0 0 -12.5 1.8 A3.7 3.7 0 0 0 6 18z", rule: "You only see the squares your pieces can reach. No check rules: capture the king to win." },
  { id: "duck", name: "Duck Chess", who: "2 players", party: true, face: "#FFC800", edge: "#E5A800", soft: "#FFF4CC", line: "#FFE27A", ink: "#7A5800", icon: "M8 11 a4 4 0 1 1 7.5 2 L21 12.5 l-3.5 3 c-.5 3 -3.5 5 -7 5 c-4 0 -7.5 -2 -7.5 -5 c0 -2.5 2.5 -4 5 -4.5z M11.5 9 h.01", rule: "After every move you put the rubber duck on an empty square. Nobody can pass through it. No check rules: capture the king to win." },
  { id: "shuffle", name: "Shuffle Start", who: "2 players", face: "#58CC02", edge: "#46A302", soft: "#D7FFB8", line: "#A5ED6E", ink: "#2F6E00", icon: "M3 7 h4 l10 10 h4 M3 17 h4 l3-3 M14 10 l3-3 h4 M18 4 l3 3 -3 3 M18 14 l3 3 -3 3", rule: "The back row is shuffled the same way for both sides. No memorized openings, just thinking. No castling." },
  { id: "threecheck", name: "Three-Check", who: "2 players", face: "#FF86D0", edge: "#E06BB5", soft: "#FFE3F4", line: "#FFB8E2", ink: "#A3247A", icon: "M12 3 a9 9 0 1 0 0 18 a9 9 0 1 0 0-18z M12 8 a4 4 0 1 0 0 8 a4 4 0 1 0 0-8z", rule: "Put the enemy king in check three times and you win. Fast and aggressive." },
];
export const modeInfo = (id: string) => MODES.find((m) => m.id === id) ?? MODES[0];

export function ModeIcon({ mode, size = 36 }: { mode: ModeInfo; size?: number }) {
  return (
    <span className="ic" style={{ width: size, height: size, borderRadius: size / 3, background: mode.face, boxShadow: `0 3px 0 ${mode.edge}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" aria-hidden="true"><path d={mode.icon} stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

export function BotFace({ size = 42 }: { size?: number }) {
  return (
    <span className="bot-face" style={{ width: size, height: size, borderRadius: size / 3 }} aria-hidden="true">
      <svg width={size * 0.66} height={size * 0.62} viewBox="0 0 36 34"><rect x="6" y="8" width="24" height="20" rx="7" fill="#fff" /><rect x="16.5" y="2" width="3" height="6" fill="#fff" /><circle cx="18" cy="2.5" r="2.5" fill="#fff" /><circle cx="13" cy="17" r="3" fill="#A568CC" /><circle cx="23" cy="17" r="3" fill="#A568CC" /><rect x="13" y="22" width="10" height="2.5" rx="1.25" fill="#A568CC" /></svg>
    </span>
  );
}

export function Think() {
  return <span className="think" aria-label="Thinking"><i /><i /><i /></span>;
}

export function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

export function Clock({ ms, on, label }: { ms: number; on: boolean; label: string }) {
  return <span className={`clock${on ? (ms < 30_000 ? " low" : " on") : ""}`} aria-label={label}>{formatClock(ms)}</span>;
}

const ORDER = "qrbnp";
/** Captured pieces in a little row, biggest first. */
export function Captured({ pieces, plus }: { pieces: string[]; plus: number }) {
  const sorted = [...pieces].sort((a, b) => ORDER.indexOf(a.toLowerCase()) - ORDER.indexOf(b.toLowerCase()));
  return (
    <span className="sub" aria-label={`${pieces.length} captured`}>
      {sorted.map((p, i) => <Piece key={i} code={p} size={18} style={{ marginRight: -4 }} />)}
      {plus > 0 && <span style={{ marginLeft: 8 }}>+{plus}</span>}
    </span>
  );
}

export function PlayerBar({ name, initial, paint, bot, sub, right, thinking, children }: { name: string; initial?: string; paint?: Paint; bot?: boolean; sub?: ReactNode; right?: ReactNode; thinking?: boolean; children?: ReactNode }) {
  return (
    <section className="pbar">
      {bot ? <BotFace size={40} /> : <Avatar name={initial ?? name} paint={paint!} size={40} />}
      <span className="who">
        <span className="name">{name}{thinking && <span style={{ color: paint?.face ?? "#A568CC" }}><Think /></span>}</span>
        {sub}
      </span>
      {right}
      {children}
    </section>
  );
}

export function Energy({ n, max = 5, size = 14 }: { n: number; max?: number; size?: number }) {
  return (
    <span className="energy" role="img" aria-label={`${n} of ${max} energy`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} width={size} height={size * 1.15} viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 L4 14 h7 l-1 8 9-12 h-7z" fill={i < n ? "#FFC800" : "#E5E5E5"} /></svg>
      ))}
    </span>
  );
}

/** Material captured by each side, from the current board. */
export function capturedFrom(cells: string) {
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const count = (ch: string) => [...cells].filter((c) => c === ch).length;
  const byWhite: string[] = [], byBlack: string[] = [];
  const val: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let w = 0, b = 0;
  for (const t of Object.keys(start)) {
    const blackLost = Math.max(0, start[t] - count(t));
    const whiteLost = Math.max(0, start[t] - count(t.toUpperCase()));
    for (let i = 0; i < blackLost; i++) byWhite.push(t);
    for (let i = 0; i < whiteLost; i++) byBlack.push(t.toUpperCase());
    w += blackLost * val[t];
    b += whiteLost * val[t];
  }
  return { byWhite, byBlack, diff: w - b };
}
