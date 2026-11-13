"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { SPACES, isBot, type BoomEvent } from "../../../convex/lib/boom/rules";
import { roomPaints } from "@/components/ui";

export type BoomView = NonNullable<FunctionReturnType<typeof api.boom.view>>;
export type BoomGameView = NonNullable<BoomView["game"]>;

export const GAME_NAME = "Juragan Nusantara";
export const RULE = "Island-hop across Indonesia from Merauke to Menteng and buy the towns you land on. Others pay you rent when they stop there, and building a warung, ruko or hotel makes it cost more. The richest juragan when the rounds run out wins.";
const BOT_NAMES: Record<string, string> = { bot1: "Budi", bot2: "Sari" };

/** Game money is in thousands of rupiah: 60 is "60rb" (ribu), 1500 is "1,5jt" (juta). */
export const short = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })}jt` : `${n}rb`);
export const money = (n: number) => `Rp${short(n)}`;

export function useNameOf(room: BoomView) {
  return (id?: string | null) => {
    if (!id) return "Someone";
    if (id === room.meId) return "You";
    if (isBot(id)) return BOT_NAMES[id] ?? "Bot";
    return room.game?.names[id] ?? room.members.find((m) => m.id === id)?.name ?? "Friend";
  };
}

/** You are always blue; everyone else gets a colour in turn order. */
export function seatPaints(g: BoomGameView, meId: string) {
  return roomPaints(g.players.map((id, seat) => ({ id, seat, isMe: id === meId })));
}

/** One line for the middle of the board. `good` is from your point of view. */
export function describe(e: BoomEvent, nameOf: (id?: string | null) => string, me: string): { text: string; tone: "good" | "bad" | "info" } {
  const who = nameOf(e.by);
  const mine = e.by === me;
  const amt = money(Math.abs(e.amount ?? 0));
  const tile = e.tile !== undefined ? SPACES[e.tile].name : "";
  const tone = (good: boolean) => (mine ? (good ? "good" : "bad") : "info") as "good" | "bad" | "info";
  switch (e.kind) {
    case "roll": {
      const [a, b] = e.dice!;
      return { text: `${who} rolled ${a + b}${a === b ? ", doubles!" : ""}`, tone: "info" };
    }
    case "lap": return { text: `${who} passed Start. Gajian! +${amt}`, tone: tone(true) };
    case "buy": return { text: `${who} bought ${tile} for ${amt}`, tone: tone(true) };
    case "build": return { text: `${who} built on ${tile}`, tone: tone(true) };
    case "rent": {
      const to = e.other === me ? "you" : nameOf(e.other);
      return { text: `${who} paid ${to} ${amt} rent on ${tile}`, tone: e.other === me ? "good" : tone(false) };
    }
    case "tax": return { text: `${who} paid ${amt} pajak`, tone: tone(false) };
    case "bonus": return { text: `${who} got THR: +${amt}`, tone: tone(true) };
    case "card": {
      const n = e.amount ?? 0;
      return { text: `${who} drew: ${e.text}${n ? ` ${n > 0 ? "+" : "−"}${amt}` : ""}`, tone: n ? tone(n > 0) : "info" };
    }
    case "jackpot": return { text: `${who} won the arisan: +${amt}`, tone: tone(true) };
    case "wheel": {
      const n = e.amount ?? 0;
      return { text: `${who} at the pasar malam: ${e.text}${n ? ` ${n > 0 ? "+" : "−"}${amt}` : ""}`, tone: n ? tone(n > 0) : "info" };
    }
    case "jail": return { text: `${who} got stuck in macet`, tone: tone(false) };
    case "skip": return { text: `${who} sat out a turn in macet`, tone: "info" };
    case "sold": return { text: `${who} sold ${tile} for ${amt}`, tone: tone(false) };
    case "bankrupt": return { text: `${who} went bankrupt`, tone: tone(false) };
    case "left": return { text: `${who} left the game`, tone: "info" };
  }
}
