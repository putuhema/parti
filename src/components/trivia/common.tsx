"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CATS } from "../../../convex/lib/trivia/board";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";

export type TriviaView = NonNullable<FunctionReturnType<typeof api.trivia.view>>;
export type TriviaGameView = NonNullable<TriviaView["game"]>;

export const GAME_NAME = "Quiz Loop";
export const RULE = "Roll the die and step either way around the loop. Land on a color, answer its question. Answer right on a gem space to win that gem, and any right answer rolls again. First to collect the gems wins.";

/** A faceted gem in a category's color. Grey and dashed when not won yet. */
export function Gem({ cat, size = 22, on = true }: { cat: number; size?: number; on?: boolean }) {
  const c = CATS[cat];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}>
      <path d="M7 3.5 h10 l4.5 5.5 L12 21 L2.5 9z" fill={on ? c.face : "#fff"} stroke={on ? c.edge : "#D0D0D0"} strokeWidth="1.6" strokeLinejoin="round" strokeDasharray={on ? undefined : "2.4 2"} />
      {on && <path d="M2.8 9 h18.4 M7 3.5 L9.5 9 L12 3.5 L14.5 9 L17 3.5 M9.5 9 L12 20.5 L14.5 9" stroke="rgba(255,255,255,.6)" strokeWidth="1.2" fill="none" strokeLinejoin="round" />}
    </svg>
  );
}

/** One row of gem slots: the ones you need to win. */
export function GemRow({ gems, goal, size = 18 }: { gems: number[]; goal: number; size?: number }) {
  const empty = Math.max(0, goal - gems.length);
  return (
    <span style={{ display: "flex", gap: 2, flexWrap: "wrap" }} role="img" aria-label={`${gems.length} of ${goal} gems${gems.length ? `: ${gems.map((g) => CATS[g].name).join(", ")}` : ""}`}>
      {gems.map((g) => <Gem key={g} cat={g} size={size} />)}
      {Array.from({ length: empty }, (_, i) => <Gem key={`e${i}`} cat={0} size={size} on={false} />)}
    </span>
  );
}

export function CatChip({ cat, gem }: { cat: number; gem?: boolean }) {
  const c = CATS[cat];
  return (
    <span className="chip" style={{ background: c.soft, color: c.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden="true">{c.icon}</span>
      {c.name.toUpperCase()}
      {gem && <><span aria-hidden="true">·</span><Gem cat={cat} size={16} /> GEM</>}
    </span>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};
export function Die({ value, size = 56, rolling }: { value: number | null; size?: number; rolling?: boolean }) {
  return (
    <svg className={rolling ? "tq-die-roll" : undefined} width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={value ? `Rolled ${value}` : "Die"}>
      <rect x="2" y="5" width="36" height="33" rx="9" fill="#D9D0C6" />
      <rect x="2" y="2" width="36" height="33" rx="9" fill="#fff" stroke="#E8D9CB" strokeWidth="1.5" />
      {(PIPS[value ?? 0] ?? []).map(([x, y], i) => <circle key={i} cx={2 + x * 9} cy={y * 8.25} r="3.4" fill="#4A3F55" />)}
      {!value && <text x="20" y="24" textAnchor="middle" fontSize="16" fontWeight="900" fill="#AFAFAF">?</text>}
    </svg>
  );
}

/** Send a move. Errors show as a short toast and a buzz. */
export function useAct(code: string) {
  const act = useMutation(api.trivia.act);
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const say = (text: string, kind: "good" | "bad" | "info" = "info") => setToast({ text, kind, id: Date.now() + Math.random() });
  async function send(action: "roll" | "move" | "pick" | "answer", n?: number) {
    try {
      return await act({ code, action, n });
    } catch (e) {
      feedback.wrong();
      say(errorText(e, "Not allowed"), "bad");
      return null;
    }
  }
  return { send, toast, say, clearToast: () => setToast(null) };
}
