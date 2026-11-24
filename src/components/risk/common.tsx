"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { TERRITORIES } from "../../../convex/lib/risk/map";
import { BOT_NAMES, isBot, type CardKind } from "../../../convex/lib/risk/rules";

export const GAME_NAME = "Risk";
export const RULE = "Deploy armies, clash dice across 6 continents, trade territory cards, and rule the map.";

export type RiskView = NonNullable<FunctionReturnType<typeof api.risk.view>>;
export type RiskGameView = NonNullable<RiskView["game"]>;
export type RiskEventView = RiskGameView["log"][number];

export type PlayerPalette = {
  fill: string;
  light: string;
  edge: string;
  ink: string;
  name: string;
};

/** Toybox Vinyl player empire colors — bright, distinct, high-contrast on porcelain & ocean. */
export const EMPIRES: PlayerPalette[] = [
  { fill: "#8B62F7", light: "#B296FF", edge: "#623CD1", ink: "#FFFFFF", name: "Grape" },
  { fill: "#27BA66", light: "#5CE093", edge: "#168A47", ink: "#FFFFFF", name: "Emerald" },
  { fill: "#FF526D", light: "#FF879A", edge: "#CC2B46", ink: "#FFFFFF", name: "Coral" },
  { fill: "#F5A615", light: "#FFD05C", edge: "#C27C00", ink: "#3D2400", name: "Amber" },
  { fill: "#1C9AF2", light: "#6BC5FF", edge: "#0B6FBF", ink: "#FFFFFF", name: "Cobalt" },
];

export function paletteMap(players: string[], meId: string): Map<string, PlayerPalette> {
  const map = new Map<string, PlayerPalette>();
  let otherIdx = 1;
  for (const p of players) {
    if (p === meId) map.set(p, EMPIRES[0]);
    else map.set(p, EMPIRES[otherIdx++ % EMPIRES.length]);
  }
  return map;
}

export const CARD_META: Record<CardKind, { emoji: string; label: string; bg: string; edge: string; ink: string }> = {
  infantry: { emoji: "🪖", label: "Infantry", bg: "#E2F8EC", edge: "#A4E6C1", ink: "#146E3A" },
  cavalry: { emoji: "🐎", label: "Cavalry", bg: "#FFF3D1", edge: "#F0CC73", ink: "#7A4A00" },
  artillery: { emoji: "💣", label: "Artillery", bg: "#FFE5EA", edge: "#F5B5C2", ink: "#B82340" },
  wild: { emoji: "⭐", label: "Wild", bg: "#EFE8FF", edge: "#CBB8FF", ink: "#5632B8" },
};

export function useNameOf(room: RiskView) {
  return (id?: string | null) => {
    if (!id) return "";
    if (isBot(id)) return BOT_NAMES[id] ?? "Bot";
    return room.game?.names[id] ?? room.members.find((m) => m.id === id)?.name ?? "Player";
  };
}

export function describeEvent(
  e: RiskEventView,
  nameOf: (id?: string | null) => string,
  meId: string,
): { text: string; tone: "good" | "bad" | "info" } {
  const who = e.by === meId ? "You" : nameOf(e.by);
  const tTo = e.to ? TERRITORIES[e.to as keyof typeof TERRITORIES]?.name ?? e.to : "";
  const tFrom = e.from ? TERRITORIES[e.from as keyof typeof TERRITORIES]?.name ?? e.from : "";
  switch (e.kind) {
    case "deploy":
      return { text: `${who} deployed +${e.troops} to ${tTo}`, tone: "info" };
    case "trade":
      return { text: `${who} traded cards for +${e.troops} armies!`, tone: "good" };
    case "capture":
      return { text: `${who} captured ${tTo} from ${tFrom}!`, tone: e.by === meId ? "good" : "bad" };
    case "attack":
      return {
        text: `${who} clashed at ${tTo} (−${e.atkLost ?? 0} vs −${e.defLost ?? 0})`,
        tone: "info",
      };
    case "fortify":
      return { text: `${who} fortified ${tFrom} → ${tTo} (${e.troops})`, tone: "info" };
    case "eliminate":
      return { text: `${who} eliminated ${e.target === meId ? "you" : nameOf(e.target)}!`, tone: e.by === meId ? "good" : "bad" };
    case "win":
      return { text: `${who} conquered the world!`, tone: "good" };
    case "timeout":
      return { text: `${who}'s turn timed out`, tone: "info" };
    case "leave":
      return { text: `${who} left the battle`, tone: "info" };
  }
}
