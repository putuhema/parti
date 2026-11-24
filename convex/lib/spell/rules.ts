import { SPELL_BY_ID, type SpellId } from "./spells";

export const SPELL_MAX = 2;
export const BOT_ID = "bot:archmage";
export const MAX_HP = 100;
export const MAX_SHIELD = 45;
export const CAST_COOLDOWN_MS = 2000;
export const FROZEN_EXTRA_MS = 1100;
export const OVERCHARGE_MAX = 3; // 3 casts charges your next spell for +8 bonus power!

export function isSpellBot(id: string): boolean {
  return id === BOT_ID;
}

export type WizardState = {
  hp: number;
  shield: number;
  frozen: boolean;
  nextCastAt: number;
  casts: number;
  charge: number; // 0..OVERCHARGE_MAX
  lastSpell?: SpellId;
  combo: number; // consecutive distinct-element casts
};

export type SpellEvent = {
  id: number;
  by: string;
  target: string;
  spell: SpellId;
  damage: number;
  blocked: number;
  healed: number;
  shielded: number;
  shattered: boolean;
  pierced: boolean;
  overcharged: boolean;
  combo: number;
  at: number;
};

export type SpellGame = {
  seq: number;
  players: [string, string];
  wizards: Record<string, WizardState>;
  events: SpellEvent[];
  lastEventId: number;
  botNextAt?: number;
  botSched?: number;
  done?: {
    winner: string;
    reason: "ko" | "forfeit";
  };
};

export function newSpellGame(p1: string, p2: string, now: number, countdownMs: number): SpellGame {
  const readyAt = now + countdownMs;
  const freshWiz = (): WizardState => ({
    hp: MAX_HP,
    shield: 0,
    frozen: false,
    nextCastAt: readyAt,
    casts: 0,
    charge: 0,
    combo: 0,
  });
  return {
    seq: 0,
    players: [p1, p2],
    wizards: {
      [p1]: freshWiz(),
      [p2]: freshWiz(),
    },
    events: [],
    lastEventId: 0,
    botNextAt: isSpellBot(p2) ? readyAt + 2400 : undefined,
  };
}

export function castSpell(g: SpellGame, casterId: string, spellId: SpellId, now: number): SpellEvent {
  if (g.done) throw new Error("The duel is already over");
  if (!g.players.includes(casterId)) throw new Error("You're watching this duel");
  const caster = g.wizards[casterId];
  const targetId = g.players[0] === casterId ? g.players[1] : g.players[0];
  const target = g.wizards[targetId];

  if (now < caster.nextCastAt - 150) {
    throw new Error("Wand recharging!");
  }

  const def = SPELL_BY_ID[spellId];
  const overcharged = (caster.charge ?? 0) >= OVERCHARGE_MAX;
  // Switching elements builds a fun elemental combo streak!
  const nextCombo = caster.lastSpell && caster.lastSpell !== spellId ? (caster.combo ?? 0) + 1 : 1;
  const comboBonus = nextCombo >= 3 ? 4 : 0;
  const overBonus = overcharged ? 8 : 0;

  let damage = 0;
  let blocked = 0;
  let healed = 0;
  let shielded = 0;
  let shattered = false;
  let pierced = false;

  if (def.damage > 0) {
    let raw = def.damage + overBonus + comboBonus;
    if (def.shatterBonus && target.frozen) {
      raw += def.shatterBonus;
      target.frozen = false;
      shattered = true;
    }
    if (def.piercesShield && target.shield > 0) {
      pierced = true;
      target.shield = 0;
      damage = raw;
    } else if (target.shield > 0) {
      blocked = Math.min(target.shield, raw);
      target.shield -= blocked;
      damage = raw - blocked;
    } else {
      damage = raw;
    }
    target.hp = Math.max(0, target.hp - damage);
    if (def.appliesFreeze && damage > 0) {
      target.frozen = true;
    }
  }

  if (def.shield > 0) {
    const before = caster.shield;
    caster.shield = Math.min(MAX_SHIELD, caster.shield + def.shield + overBonus);
    shielded = caster.shield - before;
  }

  if (def.heal > 0) {
    const before = caster.hp;
    caster.hp = Math.min(MAX_HP, caster.hp + def.heal + overBonus);
    healed = caster.hp - before;
    caster.frozen = false;
  }

  const cd = CAST_COOLDOWN_MS + (caster.frozen ? FROZEN_EXTRA_MS : 0);
  if (caster.frozen && def.heal === 0) {
    caster.frozen = false;
  }
  caster.nextCastAt = now + cd;
  caster.casts += 1;
  caster.lastSpell = spellId;
  caster.combo = nextCombo;
  caster.charge = overcharged ? 0 : Math.min(OVERCHARGE_MAX, (caster.charge ?? 0) + 1);

  g.lastEventId += 1;
  const ev: SpellEvent = {
    id: g.lastEventId,
    by: casterId,
    target: targetId,
    spell: spellId,
    damage,
    blocked,
    healed,
    shielded,
    shattered,
    pierced,
    overcharged,
    combo: nextCombo,
    at: now,
  };
  g.events = [...g.events.slice(-11), ev];

  if (target.hp <= 0) {
    g.done = { winner: casterId, reason: "ko" };
    g.botNextAt = undefined;
  }

  return ev;
}

export function chooseBotSpell(g: SpellGame, rng: () => number): SpellId {
  const bot = g.wizards[BOT_ID];
  const oppId = g.players[0] === BOT_ID ? g.players[1] : g.players[0];
  const opp = g.wizards[oppId];

  if (opp.frozen && rng() < 0.72) return "fire";
  if (opp.shield >= 12 && rng() < 0.65) return "lightning";
  if (bot.hp <= 45 && rng() < 0.45) return "heal";
  if (bot.shield === 0 && rng() < 0.28) return "shield";
  const r = rng();
  if (r < 0.36) return "fire";
  if (r < 0.68) return "frost";
  return "lightning";
}

export function stepBot(g: SpellGame, now: number, rng: () => number) {
  if (g.done || !g.players.includes(BOT_ID)) return;
  const spell = chooseBotSpell(g, rng);
  castSpell(g, BOT_ID, spell, now);
  if (!g.done) {
    g.botNextAt = now + 3400 + Math.floor(rng() * 1400);
  }
}
