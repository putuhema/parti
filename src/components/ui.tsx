"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";

// ---------- Player colors ----------
export type Paint = { face: string; edge: string; ink: string; soft: string };
export const ME: Paint = { face: "#1899D6", edge: "#1478A8", ink: "#1899D6", soft: "#CBEBFC" };
export const FRIENDS: Paint[] = [
  { face: "#E08600", edge: "#B86E00", ink: "#CC7700", soft: "#FFF1DD" },
  { face: "#A568CC", edge: "#8A4FB5", ink: "#A568CC", soft: "#F7EDFF" },
  { face: "#D9489F", edge: "#B2347F", ink: "#C23C8E", soft: "#FFE8F5" },
  { face: "#46A302", edge: "#3A8700", ink: "#3A8700", soft: "#E8FAD9" },
  { face: "#2B70C9", edge: "#1F57A0", ink: "#2B70C9", soft: "#E3EEFC" },
];

export function paintFor(key: string, isMe = false): Paint {
  if (isMe) return ME;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FRIENDS[h % FRIENDS.length];
}

/** Me is always blue; everyone else gets a distinct color in seat order. */
export function roomPaints<T extends { id: string; isMe: boolean; seat: number }>(players: T[]) {
  const map = new Map<string, Paint>();
  let k = 0;
  for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
    map.set(p.id, p.isMe ? ME : FRIENDS[k++ % FRIENDS.length]);
  }
  return map;
}

// ---------- Sudoku | Chess switch ----------
// ---------- Mascot ----------
/** The party mascot: your drawing in public/mascot.png (198×248). `size` is the height. */
export function Mascot({ size = 72, className }: { size?: number; mood?: "happy" | "joy" | "wow"; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/mascot.png" alt="" aria-hidden="true" draggable={false} className={className}
      width={Math.round((size * 198) / 248)} height={size} style={{ flexShrink: 0, display: "block" }} />
  );
}

// ---------- Icons ----------
type IconProps = { size?: number; color?: string };
export const Icon = {
  Close: ({ size = 18, color = "#AFAFAF" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3 l14 14 M17 3 L3 17" stroke={color} strokeWidth="3.2" strokeLinecap="round" /></svg>
  ),
  Back: ({ size = 20, color = "#AFAFAF" }: IconProps) => (
    <svg width={size * 0.6} height={size} viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 L2 10 l8 8" stroke={color} strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  Chevron: ({ size = 20, color = "#AFAFAF" }: IconProps) => (
    <svg width={size * 0.6} height={size} viewBox="0 0 12 20" aria-hidden="true"><path d="M2 2 l8 8 -8 8" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  Bolt: ({ size = 24, color = "#fff" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 L4 14 h7 l-1 8 9-12 h-7z" fill={color} /></svg>
  ),
  People: ({ size = 28, color = "#fff" }: IconProps) => (
    <svg width={size} height={size * 0.875} viewBox="0 0 32 28" aria-hidden="true"><circle cx="11" cy="8" r="5" fill={color} /><circle cx="22" cy="9" r="4" fill={color} opacity=".85" /><path d="M2 25 a9 8 0 0 1 18 0z" fill={color} /><path d="M17 25 a8 7 0 0 1 13 -4 v4z" fill={color} opacity=".85" /></svg>
  ),
  Grid: ({ size = 20, color = "#6F6F6F" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="17" rx="4" stroke={color} strokeWidth="2" fill="none" /><path d="M7.3 1.5v17M12.7 1.5v17M1.5 7.3h17M1.5 12.7h17" stroke={color} strokeWidth="1.5" /></svg>
  ),
  Flame: ({ size = 22, className }: IconProps & { className?: string }) => (
    <svg className={className} width={size * 0.82} height={size} viewBox="0 0 18 22" aria-hidden="true"><path d="M9 1 C10 6 16 8 16 14 A7 7 0 0 1 2 14 C2 10 5 9 5 5 C7 7 8 8 9 1Z" fill="#FF9600" /><path d="M9 11 C10 14 12 14 12 16.5 A3 3 0 0 1 6 16.5 C6 14.5 8 14 9 11Z" fill="#FFC800" /></svg>
  ),
  Trophy: ({ size = 20 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2 h10 v5 a5 5 0 0 1 -10 0z" fill="#FFC800" /><path d="M5 4 H2 a3 3 0 0 0 3 4 M15 4 h3 a3 3 0 0 1 -3 4" stroke="#E5A800" strokeWidth="2" fill="none" /><rect x="8" y="11" width="4" height="4" fill="#E5A800" /><rect x="5" y="15" width="10" height="3" rx="1.5" fill="#E5A800" /></svg>
  ),
  Share: ({ size = 16, color = "#1899D6" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10 V2 M4.5 5 L8 1.5 11.5 5 M2 9 v4.5 h12 V9" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  Undo: ({ size = 22, color = "#6F6F6F" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 L4 9 9 4 M4 9 h10 a6 6 0 0 1 0 12 h-3" stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  Erase: ({ size = 22, color = "#6F6F6F" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 20 h12 M4.5 14.5 l9-9 a2 2 0 0 1 3 0 l3 3 a2 2 0 0 1 0 3 L12 19 H8.5 l-4-4z" stroke={color} strokeWidth="2.4" fill="none" strokeLinejoin="round" strokeLinecap="round" /></svg>
  ),
  Pencil: ({ size = 22, color = "#6F6F6F" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 l1-4 11-11 3 3 -11 11z M14 7 l3 3" stroke={color} strokeWidth="2.4" fill="none" strokeLinejoin="round" strokeLinecap="round" /></svg>
  ),
  Bulb: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18 h6 M10 21 h4 M12 3 a6 6 0 0 0 -3.5 10.9 c.6.5 1 1.2 1 2.1 h5 c0-.9.4-1.6 1-2.1 A6 6 0 0 0 12 3z" stroke="#E5A800" strokeWidth="2.4" fill="#FFF4CC" strokeLinejoin="round" strokeLinecap="round" /></svg>
  ),
  Check: ({ size = 16, color = "#58CC02" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7.5 l3 3 7-7" stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  Lock: ({ size = 20, color = "#EA2B2B" }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="9" width="14" height="10" rx="3" fill={color} /><path d="M6 9 V6 a4 4 0 0 1 8 0 v3" stroke={color} strokeWidth="2.4" fill="none" /></svg>
  ),
  Sound: ({ size = 22, muted = false }: IconProps & { muted?: boolean }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9 h4 l5-4 v14 l-5-4 H4z" fill="#AFAFAF" />{muted ? <path d="M16 9 l5 6 M21 9 l-5 6" stroke="#AFAFAF" strokeWidth="2.4" strokeLinecap="round" /> : <path d="M16 8.5 a5 5 0 0 1 0 7 M18.5 6 a8.5 8.5 0 0 1 0 12" stroke="#AFAFAF" strokeWidth="2.4" fill="none" strokeLinecap="round" />}</svg>
  ),
  Crown: ({ size = 30 }: IconProps) => (
    <svg width={size} height={size * 0.73} viewBox="0 0 30 22" aria-hidden="true"><path d="M2 6 l7 6 6 -10 6 10 7 -6 -3 15 H5z" fill="#FFC800" stroke="#E5A800" strokeWidth="2" strokeLinejoin="round" /></svg>
  ),
  Shield: ({ size = 52 }: IconProps) => (
    <svg width={size} height={size * 1.15} viewBox="0 0 52 60" aria-hidden="true"><path d="M26 4 L48 12 V30 C48 44 38 52 26 57 C14 52 4 44 4 30 V12z" fill="#E5A800" /><path d="M26 1 L48 9 V27 C48 41 38 49 26 54 C14 49 4 41 4 27 V9z" fill="#FFC800" /><path d="M26 15 l4 8 9 1 -6.5 6 1.7 9 -8.2 -4.5 -8.2 4.5 1.7 -9 -6.5 -6 9 -1z" fill="#fff" /></svg>
  ),
};

export function Heart({ on, size = 22 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 26 24" aria-hidden="true">
      <path d="M13 22 C5 16 1 12 1 7.5 A5.5 5.5 0 0 1 13 5 A5.5 5.5 0 0 1 25 7.5 C25 12 21 16 13 22Z" fill={on ? "#FF4B4B" : "#E5E5E5"} />
    </svg>
  );
}

export function Hearts({ left, total, size = 22 }: { left: number; total: number; size?: number }) {
  return (
    <span style={{ display: "flex", gap: 2 }} role="img" aria-label={`${left} of ${total} hearts left`}>
      {Array.from({ length: total }, (_, i) => (
        <Heart key={i} on={i < left} size={size} />
      ))}
    </span>
  );
}

export function Avatar({ name, paint: given, size = 40, style }: { name: string; paint?: Paint; size?: number; style?: CSSProperties }) {
  const paint = given ?? FRIENDS[0]; // a player who left has no color any more
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: paint.face, boxShadow: `0 3px 0 ${paint.edge}`, fontSize: Math.round(size * 0.44), ...style }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function TopBar({ back, title, right }: { back?: string | (() => void); title?: ReactNode; right?: ReactNode }) {
  const backEl =
    typeof back === "string" ? (
      <Link href={back} className="icon-btn" aria-label="Back"><Icon.Back /></Link>
    ) : back ? (
      <button className="icon-btn" aria-label="Back" onClick={back}><Icon.Back /></button>
    ) : (
      <span style={{ width: 44 }} />
    );
  return (
    <header className="topbar">
      {backEl}
      <h1>{title}</h1>
      <span style={{ minWidth: 44, display: "flex", justifyContent: "flex-end" }}>{right}</span>
    </header>
  );
}

export function Confetti({ count = 60 }: { count?: number }) {
  const [pieces] = useState(() => {
    const cols = ["#58CC02", "#1CB0F6", "#FF9600", "#CE82FF", "#FFC800", "#FF4B4B"];
    return Array.from({ length: count }, (_, i) => {
      const w = 7 + Math.random() * 7;
      return {
        key: i,
        style: {
          left: `${Math.random() * 100}%`,
          width: w,
          height: Math.random() > 0.5 ? w : w * 1.8,
          borderRadius: Math.random() > 0.7 ? "50%" : 3,
          background: cols[i % cols.length],
          animationDelay: `${Math.random() * 0.8}s`,
          animationDuration: `${2.2 + Math.random() * 1.6}s`,
        } as CSSProperties,
      };
    });
  });
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => <span key={p.key} style={p.style} />)}
    </div>
  );
}

export function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <span className="grabber" />
        {children}
      </div>
    </>
  );
}
