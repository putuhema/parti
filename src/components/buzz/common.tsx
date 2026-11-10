"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BUZZ_CATS } from "../../../convex/lib/buzz/board";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

export type BuzzView = NonNullable<FunctionReturnType<typeof api.buzz.view>>;
export type BuzzGameView = NonNullable<BuzzView["game"]>;

export const GAME_NAME = "Buzz Board";
export const RULE = "Pick a tile from the board. Everyone races to answer: first right answer wins the points and picks next. A wrong answer loses them. One tile hides a Hot Seat where the picker bets on it alone.";

export const fmtScore = (n: number) => (n < 0 ? `−${Math.abs(n).toLocaleString()}` : n.toLocaleString());

export function CatChip({ cat, label }: { cat: number; label?: string }) {
  const c = BUZZ_CATS[cat];
  return (
    <span className="chip" style={{ background: c.soft, color: c.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden="true">{c.icon}</span>
      {c.name.toUpperCase()}
      {label && <><span aria-hidden="true">·</span>{label}</>}
    </span>
  );
}

/** Send a move. Errors show as a short toast and a buzz. */
export function useAct(code: string) {
  const { token } = useIdentity();
  const act = useMutation(api.buzz.act);
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const say = (text: string, kind: "good" | "bad" | "info" = "info") => setToast({ text, kind, id: Date.now() + Math.random() });
  async function send(action: "pick" | "wager" | "answer", n: number) {
    try {
      await act({ token, code, action, n });
      return true;
    } catch (e) {
      feedback.wrong();
      say(errorText(e, "Not allowed"), "bad");
      return false;
    }
  }
  return { send, toast, say, clearToast: () => setToast(null) };
}
