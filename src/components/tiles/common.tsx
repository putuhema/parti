"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { valueOf, type TileLang } from "../../../convex/lib/tiles/rules";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";

export type TileView = NonNullable<FunctionReturnType<typeof api.tiles.view>>;
export type TileGameView = NonNullable<TileView["game"]>;
export type Move = { kind: "play"; tiles: { i: number; l: string }[] } | { kind: "swap"; letters: string[] } | { kind: "pass" };

export const GAME_NAME = "Tile Town";
export const RULE = "Build crossing words on an 11×11 board from a rack of 6 letter tiles. Every word must be 3+ letters and connect to what's there. Rare letters and bonus squares score big; use all 6 tiles for +25.";
export const BOT = "bot";

export function useNameOf(room: TileView) {
  return (id?: string | null) => {
    if (id === BOT) return "Bot";
    const m = room.members.find((x) => x.id === id);
    return m?.isMe ? "You" : m?.name ?? "Friend";
  };
}

/** Send a move. Errors show as a short toast and a buzz. */
export function useAct(code: string) {
  const act = useMutation(api.tiles.act);
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const say = (text: string, kind: "good" | "bad" | "info" = "info") => setToast({ text, kind, id: Date.now() + Math.random() });
  async function send(move: Move) {
    try {
      await act({ code, move });
      return true;
    } catch (e) {
      feedback.wrong();
      say(errorText(e, "Not allowed"), "bad");
      return false;
    }
  }
  return { send, toast, say, clearToast: () => setToast(null) };
}

/** One letter tile with its value in the corner. */
export function Tile({ l, lang, className = "", style }: { l: string; lang: TileLang; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`tt-tile ${className}`} style={style}>
      <span className="tt-l">{l.toUpperCase()}</span>
      <span className="tt-v">{valueOf(lang, l)}</span>
    </span>
  );
}
