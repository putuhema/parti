"use client";

import type { FunctionReturnType } from "convex/server";
import type { CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import type { DeckId, Question } from "../../../convex/lib/sync/deck";
import type { Value } from "../../../convex/lib/sync/rules";

export type SyncView = NonNullable<FunctionReturnType<typeof api.sync.view>>;
export type SyncGameView = NonNullable<SyncView["game"]>;
export type NameOf = (id?: string | null) => string;

export const GAME_NAME = "In Sync";
export const RULE = "A game for two. You both answer the same question in secret, then guess what the other said. The reveal shows how in sync you are, and every card ends with something to talk about. Twice a game, you write your own question for each other.";

export const DECK_LOOK: Record<DeckId | "ask", { face: string; edge: string; ink: string; label: string }> = {
  light: { face: "#FFB020", edge: "#E08A00", ink: "#7A4A00", label: "JUST FOR FUN" },
  dreams: { face: "#1CB0F6", edge: "#1478A8", ink: "#0B4F73", label: "DREAMS" },
  deep: { face: "#6C5CE7", edge: "#4B3EC2", ink: "#2E2580", label: "DEEP TALK" },
  flirty: { face: "#E8508F", edge: "#BC2F6C", ink: "#7D1544", label: "CUTE & FLIRTY" },
  ask: { face: "#2EB89A", edge: "#1F8A73", ink: "#0E4F41", label: "YOUR OWN QUESTION" },
};
export const deckVars = (k: keyof typeof DECK_LOOK) => {
  const d = DECK_LOOK[k];
  return { "--dk": d.face, "--dk-edge": d.edge, "--dk-ink": d.ink } as CSSProperties;
};

export function useNameOf(room: SyncView): NameOf {
  return (id?: string | null) => {
    if (!id) return "Someone";
    if (id === room.meId) return "You";
    return room.game?.names[id] ?? room.members.find((m) => m.id === id)?.name ?? "Them";
  };
}

/** An answer in words. */
export function answerText(q: Question, v: Value | undefined | null, nameOf: NameOf): string {
  if (v === undefined || v === null) return "—";
  switch (q.type) {
    case "pick": return q.options[v as number] ?? "—";
    case "scale": return `${v}/10`;
    case "rank": return (v as number[]).map((k, i) => `${i + 1}. ${q.items[k]}`).join("  ");
    case "who": return nameOf(v as string);
    case "open": return String(v);
  }
}

export function timeAgo(at: number, now: number) {
  const days = Math.floor((now - at) / 86_400_000);
  if (days < 1) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** A ring showing a percentage. */
export function Ring({ pct, size = 120, label }: { pct: number; size?: number; label?: string }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${pct}% in sync`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--cream-2)" strokeWidth="11" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--pink)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 50 50)" style={{ transition: "stroke-dasharray 900ms var(--spring)" }} />
      <text x="50" y={label ? 50 : 56} textAnchor="middle" fontSize="24" fontWeight="900" fill="var(--plum)">{pct}%</text>
      {label && <text x="50" y="66" textAnchor="middle" fontSize="9" fontWeight="900" letterSpacing=".08em" fill="var(--muted)">{label}</text>}
    </svg>
  );
}
