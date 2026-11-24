"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { isBot } from "../../../convex/lib/ular/board";
import { CATS } from "../../../convex/lib/trivia/board";

export type UlarView = NonNullable<FunctionReturnType<typeof api.ular.view>>;
export type UlarGameView = NonNullable<UlarView["game"]>;
export type UlarEventView = UlarGameView["log"][number];

export const GAME_NAME = "Ular Tangga";
export const RULE = "Snakes and ladders across a little Nusantara island, with a trivia question on every square you land on. At the foot of a tangga, answer right to climb. On an ular's head, answer right or slide down. Anywhere else, a right answer earns a bonus step. First to square 100 wins.";
const BOT_NAMES: Record<string, string> = { bot1: "Budi", bot2: "Sari" };

export function useNameOf(room: UlarView) {
  return (id?: string | null) => {
    if (!id) return "Someone";
    if (id === room.meId) return "You";
    if (isBot(id)) return BOT_NAMES[id] ?? "Bot";
    return room.game?.names[id] ?? room.members.find((m) => m.id === id)?.name ?? "Friend";
  };
}

/** One line for the news. `good` is from your point of view. */
export function describe(e: UlarEventView, nameOf: (id?: string | null) => string, me: string): { text: string; tone: "good" | "bad" | "info" } {
  const who = nameOf(e.by);
  const mine = e.by === me;
  const tone = (good: boolean) => (mine ? (good ? "good" : "bad") : "info") as "good" | "bad" | "info";
  switch (e.kind) {
    case "roll": return { text: `${who} rolled ${e.dice}${e.bounced ? ", bounced back" : ""} to ${e.to}`, tone: "info" };
    case "ask": return { text: `${CATS[e.cat ?? 0].icon} ${CATS[e.cat ?? 0].name} question for ${who === "You" ? "you" : who}`, tone: "info" };
    case "answer": return { text: `${who} ${e.ok ? "got it right!" : e.pick === -1 ? "ran out of time" : "got it wrong"}`, tone: tone(!!e.ok) };
    case "climb": return { text: `${who} climbed a tangga: ${e.from} → ${e.to}`, tone: tone(true) };
    case "bite": return { text: `An ular bit ${who === "You" ? "you" : who}: ${e.from} → ${e.to}`, tone: tone(false) };
    case "bonus": return { text: `${who} took a bonus step to ${e.to}`, tone: tone(true) };
    case "win": return { text: `${who} reached 100!`, tone: tone(true) };
    case "left": return { text: `${who} left the game`, tone: "info" };
  }
}
