export type SpellId = "fire" | "lightning" | "frost" | "shield" | "heal";

export type SpellDef = {
  id: SpellId;
  name: string;
  emoji: string;
  rune: string;
  runeHint: string;
  color: string;
  glow: string;
  damage: number;
  shield: number;
  heal: number;
  piercesShield?: boolean;
  appliesFreeze?: boolean;
  shatterBonus?: number;
  desc: string;
};

export const SPELLS: readonly SpellDef[] = [
  {
    id: "fire",
    name: "Fireball",
    emoji: "🔥",
    rune: "△",
    runeHint: "Draw a peak ^ or triangle △",
    color: "#FF6B2B",
    glow: "#FF9F1C",
    damage: 24,
    shield: 0,
    heal: 0,
    shatterBonus: 10,
    desc: "24 dmg (+10 if target is Frozen!)",
  },
  {
    id: "lightning",
    name: "Lightning",
    emoji: "⚡",
    rune: "⚡",
    runeHint: "Draw a zigzag Z",
    color: "#35D0FF",
    glow: "#80E8FF",
    damage: 20,
    shield: 0,
    heal: 0,
    piercesShield: true,
    desc: "20 dmg · Pierces Shields!",
  },
  {
    id: "frost",
    name: "Frost Nova",
    emoji: "❄️",
    rune: "—",
    runeHint: "Swipe a horizontal line —",
    color: "#60A5FA",
    glow: "#BAE6FD",
    damage: 12,
    shield: 0,
    heal: 0,
    appliesFreeze: true,
    desc: "12 dmg · Freezes target!",
  },
  {
    id: "shield",
    name: "Arcane Shield",
    emoji: "🛡️",
    rune: "⭕",
    runeHint: "Draw a circle ⭕",
    color: "#A78BFA",
    glow: "#DDD6FE",
    damage: 0,
    shield: 26,
    heal: 0,
    desc: "+26 Shield (blocks Fire & Frost)",
  },
  {
    id: "heal",
    name: "Healing Pulse",
    emoji: "💚",
    rune: "|",
    runeHint: "Swipe a vertical line |",
    color: "#34D399",
    glow: "#A7F3D0",
    damage: 0,
    shield: 0,
    heal: 18,
    desc: "+18 HP & melts Freeze",
  },
];

export const SPELL_BY_ID: Record<SpellId, SpellDef> = Object.fromEntries(
  SPELLS.map((s) => [s.id, s]),
) as Record<SpellId, SpellDef>;

export const SPELL_IDS: readonly SpellId[] = SPELLS.map((s) => s.id);
