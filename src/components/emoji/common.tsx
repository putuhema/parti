"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { CATEGORIES } from "../../../convex/lib/emoji/content";
import { GAP } from "../../../convex/lib/emoji/rules";

export type EmojiView = NonNullable<FunctionReturnType<typeof api.emoji.view>>;
export type EmojiGameView = NonNullable<EmojiView["game"]>;

export const GAME_NAME = "Emoji Charades";
export const RULE = "One of you picks a secret (a movie, song, food, place or saying) and describes it using only emoji, tap by tap. The other watches the clue grow live and types guesses before the clock runs out. Faster guesses score more, and you swap every round. It's you two against the clock.";

export const catOf = (id?: string | null) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

/** The emoji clue so far. Word gaps show as wider spaces. */
export function Clue({ clue, big, empty }: { clue: string[]; big?: boolean; empty?: string }) {
  return (
    <div className={`ec-clue${big ? " big" : ""}`} aria-label={clue.length ? `Clue: ${clue.filter((c) => c !== GAP).join(" ")}` : "No clue yet"}>
      {clue.length === 0 && <span className="ec-empty wait">{empty ?? "…"}</span>}
      {clue.map((e, i) => (e === GAP ? <span key={i} className="ec-gap" /> : <span key={i} className="ec-e">{e}</span>))}
    </div>
  );
}
