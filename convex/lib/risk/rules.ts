import type { Id } from "../../_generated/dataModel";
import { CONTINENT_LIST, TERRITORIES, TERRITORY_IDS, isAdjacent, type ContinentId, type TerritoryId } from "./map";

// Classic Risk rules engine — pure TypeScript, deterministic with an injected RNG for testing.

export const RISK_MAX = 5;
export const MODE_CHOICES = ["blitz", "domination"] as const;
export type RiskMode = (typeof MODE_CHOICES)[number];
export const BLITZ_GOAL = 15; // First to 15 of 24 territories wins in Blitz mode
export const BLITZ_MAX_ROUNDS = 14;

export const HUMAN_TURN_MS = 90_000;
export const BOT_STEP_MS = 850;

export const BOT_IDS = ["bot:0", "bot:1", "bot:2"] as const;
export const BOT_NAMES: Record<string, string> = {
  "bot:0": "General Bima",
  "bot:1": "Captain Sari",
  "bot:2": "Admiral Koko",
};

export type Seat = Id<"players"> | (typeof BOT_IDS)[number];
export type CardKind = "infantry" | "cavalry" | "artillery" | "wild";
export type Phase = "deploy" | "attack" | "occupy" | "fortify";

export type RiskCard = {
  id: number;
  kind: CardKind;
  territory?: TerritoryId;
};

export type BattleRoll = {
  id: number;
  by: Seat;
  defender: Seat;
  from: TerritoryId;
  to: TerritoryId;
  atkDice: number[]; // sorted descending
  defDice: number[]; // sorted descending
  atkLost: number;
  defLost: number;
  captured: boolean;
  waves: number;
};

export type RiskEvent = {
  n: number;
  kind: "deploy" | "trade" | "attack" | "capture" | "fortify" | "eliminate" | "win" | "leave" | "timeout";
  by: Seat;
  from?: TerritoryId;
  to?: TerritoryId;
  troops?: number;
  target?: Seat;
  atkDice?: number[];
  defDice?: number[];
  atkLost?: number;
  defLost?: number;
  waves?: number;
  note?: string;
};

export type RiskGame = {
  seq: number;
  mode: RiskMode;
  players: Seat[];
  out: Seat[]; // eliminated or left players
  owners: Record<TerritoryId, Seat>;
  troops: Record<TerritoryId, number>;
  cards: Record<string, RiskCard[]>;
  nextCardId: number;
  tradesDone: number;
  turn: Seat;
  phase: Phase;
  round: number;
  reinforce: number; // troops remaining to deploy during `deploy` phase
  conqueredThisTurn: boolean;
  pendingOccupy?: {
    from: TerritoryId;
    to: TerritoryId;
    min: number;
    max: number;
  };
  lastBattle?: BattleRoll;
  log: RiskEvent[];
  deadline?: number;
  sched?: number;
  done?: {
    winners: Seat[];
    reason: "domination" | "blitz" | "rounds" | "last" | "empty";
  };
};

export function isBot(p: string): p is (typeof BOT_IDS)[number] {
  return p.startsWith("bot:");
}

function push(g: RiskGame, ev: Omit<RiskEvent, "n">) {
  const n = (g.log.at(-1)?.n ?? 0) + 1;
  g.log.push({ n, ...ev });
  if (g.log.length > 36) g.log = g.log.slice(-36);
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function alivePlayers(g: RiskGame): Seat[] {
  return g.players.filter((p) => !g.out.includes(p));
}

export function territoriesOf(g: RiskGame, p: Seat): TerritoryId[] {
  return TERRITORY_IDS.filter((id) => g.owners[id] === p);
}

export function continentsHeldBy(g: RiskGame, p: Seat): ContinentId[] {
  return CONTINENT_LIST.filter((c) => c.territories.every((t) => g.owners[t] === p)).map((c) => c.id);
}

export function continentBonusOf(g: RiskGame, p: Seat): number {
  return CONTINENT_LIST.reduce((sum, c) => (c.territories.every((t) => g.owners[t] === p) ? sum + c.bonus : sum), 0);
}

/** Reinforcements granted at the start of a player's turn. */
export function turnReinforcements(g: RiskGame, p: Seat): number {
  const count = territoriesOf(g, p).length;
  const base = Math.max(3, Math.floor(count / 3));
  return base + continentBonusOf(g, p);
}

/** Escalating Risk trade-in value: 4, 6, 8, 10, 12, 15, 20, 25... */
export function nextTradeBonus(tradesDone: number): number {
  const table = [4, 6, 8, 10, 12, 15];
  if (tradesDone < table.length) return table[tradesDone];
  return 15 + (tradesDone - table.length + 1) * 5;
}

/** True if 3 cards form a valid Risk set (3 of a kind, 1 of each, or wilds filling in). */
export function isValidCardSet(cards: RiskCard[]): boolean {
  if (cards.length !== 3) return false;
  const nonWild = cards.filter((c) => c.kind !== "wild").map((c) => c.kind);
  if (nonWild.length <= 1) return true;
  if (nonWild.length === 2) return true; // wild completes either 3-of-a-kind or 1-of-each!
  const set = new Set(nonWild);
  return set.size === 1 || set.size === 3;
}

/** Find a valid 3-card set in a player's hand, or null if none exists. */
export function findValidSet(hand: RiskCard[]): [number, number, number] | null {
  if (hand.length < 3) return null;
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        if (isValidCardSet([hand[i], hand[j], hand[k]])) {
          return [hand[i].id, hand[j].id, hand[k].id];
        }
      }
    }
  }
  return null;
}

/** All territories reachable from `start` through territories owned by `owner` (BFS). */
export function reachableOwned(g: RiskGame, owner: Seat, start: TerritoryId): TerritoryId[] {
  if (g.owners[start] !== owner) return [];
  const visited = new Set<TerritoryId>([start]);
  const queue: TerritoryId[] = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of TERRITORIES[cur].neighbors) {
      if (!visited.has(nb) && g.owners[nb] === owner) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  visited.delete(start);
  return [...visited];
}

function drawCard(g: RiskGame, p: Seat, rand: () => number) {
  const roll = rand();
  const kind: CardKind = roll < 0.08 ? "wild" : roll < 0.39 ? "infantry" : roll < 0.70 ? "cavalry" : "artillery";
  const territory = kind === "wild" ? undefined : TERRITORY_IDS[Math.floor(rand() * TERRITORY_IDS.length)];
  g.cards[p] = [...(g.cards[p] ?? []), { id: g.nextCardId++, kind, territory }];
}

function setDeadline(g: RiskGame, now: number, extraMs = 0) {
  if (g.done) {
    g.deadline = undefined;
    return;
  }
  const wait = isBot(g.turn) ? BOT_STEP_MS : HUMAN_TURN_MS;
  g.deadline = now + extraMs + wait;
}

export function newGame(
  players: Seat[],
  mode: RiskMode,
  now: number,
  countdownMs: number,
  rand: () => number,
): RiskGame {
  const ids = shuffle(TERRITORY_IDS, rand);
  const owners = {} as Record<TerritoryId, Seat>;
  const troops = {} as Record<TerritoryId, number>;
  const cards: Record<string, RiskCard[]> = {};
  for (const p of players) cards[p] = [];

  // Deal all 24 territories evenly
  ids.forEach((id, idx) => {
    owners[id] = players[idx % players.length];
    troops[id] = 1;
  });

  // Auto-distribute starting armies cleanly so gameplay begins immediately
  const startPool = players.length === 2 ? 22 : players.length === 3 ? 18 : players.length === 4 ? 15 : 13;
  for (const p of players) {
    const owned = TERRITORY_IDS.filter((t) => owners[t] === p);
    let left = Math.max(0, startPool - owned.length);
    const border = owned.filter((t) => TERRITORIES[t].neighbors.some((n) => owners[n] !== p));
    const pool = border.length ? border : owned;
    while (left > 0) {
      const pick = pool[Math.floor(rand() * pool.length)];
      troops[pick] += 1;
      left -= 1;
    }
  }

  const first = players[0];
  const g: RiskGame = {
    seq: 0,
    mode,
    players,
    out: [],
    owners,
    troops,
    cards,
    nextCardId: 1,
    tradesDone: 0,
    turn: first,
    phase: "deploy",
    round: 1,
    reinforce: 0,
    conqueredThisTurn: false,
    log: [],
  };
  g.reinforce = turnReinforcements(g, first);
  setDeadline(g, now, countdownMs);
  return g;
}

/** Check if the active player or game state has triggered victory. */
function checkVictory(g: RiskGame): boolean {
  if (g.done) return true;
  const alive = alivePlayers(g);
  if (alive.length === 0) {
    g.done = { winners: [], reason: "empty" };
    g.deadline = undefined;
    return true;
  }
  if (alive.length === 1) {
    g.done = { winners: [alive[0]], reason: g.out.length === g.players.length - 1 ? "domination" : "last" };
    push(g, { kind: "win", by: alive[0] });
    g.deadline = undefined;
    return true;
  }
  for (const p of alive) {
    const cnt = territoriesOf(g, p).length;
    if (cnt === TERRITORY_IDS.length) {
      g.done = { winners: [p], reason: "domination" };
      push(g, { kind: "win", by: p });
      g.deadline = undefined;
      return true;
    }
    if (g.mode === "blitz" && cnt >= BLITZ_GOAL) {
      g.done = { winners: [p], reason: "blitz" };
      push(g, { kind: "win", by: p });
      g.deadline = undefined;
      return true;
    }
  }
  return false;
}

function advanceTurn(g: RiskGame, rand: () => number, now: number) {
  if (g.done) return;
  if (g.conqueredThisTurn && !g.out.includes(g.turn)) {
    drawCard(g, g.turn, rand);
  }
  g.conqueredThisTurn = false;
  g.pendingOccupy = undefined;

  const alive = alivePlayers(g);
  if (alive.length <= 1) {
    checkVictory(g);
    return;
  }

  const curIdx = g.players.indexOf(g.turn);
  let nextIdx = curIdx;
  let wrapped = false;
  for (let step = 1; step <= g.players.length; step++) {
    const idx = (curIdx + step) % g.players.length;
    if (idx <= curIdx) wrapped = true;
    if (!g.out.includes(g.players[idx])) {
      nextIdx = idx;
      break;
    }
  }

  if (wrapped) {
    g.round += 1;
    if (g.mode === "blitz" && g.round > BLITZ_MAX_ROUNDS) {
      // Blitz round cap: highest territories, tie-break by total troops
      const scored = alive.map((p) => ({
        p,
        terr: territoriesOf(g, p).length,
        army: territoriesOf(g, p).reduce((s, t) => s + g.troops[t], 0),
      }));
      scored.sort((a, b) => b.terr - a.terr || b.army - a.army);
      const top = scored[0];
      const winners = scored.filter((x) => x.terr === top.terr && x.army === top.army).map((x) => x.p);
      g.done = { winners, reason: "rounds" };
      push(g, { kind: "win", by: winners[0] });
      g.deadline = undefined;
      return;
    }
  }

  g.turn = g.players[nextIdx];
  g.phase = "deploy";
  g.reinforce = turnReinforcements(g, g.turn);
  setDeadline(g, now);
}

export function tradeCards(g: RiskGame, cardIds: number[], now: number) {
  if (g.done || g.phase !== "deploy") throw new Error("You can only trade cards during Deploy");
  const hand = g.cards[g.turn] ?? [];
  const chosen = cardIds.map((id) => hand.find((c) => c.id === id)).filter((c): c is RiskCard => Boolean(c));
  if (chosen.length !== 3 || new Set(cardIds).size !== 3 || !isValidCardSet(chosen)) {
    throw new Error("Pick 3 matching cards or 1 of each type");
  }
  const bonus = nextTradeBonus(g.tradesDone);
  g.tradesDone += 1;
  g.cards[g.turn] = hand.filter((c) => !cardIds.includes(c.id));
  g.reinforce += bonus;

  // Classic Risk territory bonus: +2 troops on the first traded card territory you own!
  let bonusTerr: TerritoryId | undefined;
  for (const c of chosen) {
    if (c.territory && g.owners[c.territory] === g.turn) {
      g.troops[c.territory] += 2;
      bonusTerr = c.territory;
      break;
    }
  }
  push(g, { kind: "trade", by: g.turn, troops: bonus, to: bonusTerr });
  setDeadline(g, now);
}

export function deploy(g: RiskGame, to: TerritoryId, count: number, now: number) {
  if (g.done || g.phase !== "deploy") throw new Error("Not in Deploy phase");
  if ((g.cards[g.turn]?.length ?? 0) >= 5) {
    throw new Error("Trade in a card set first (5+ cards)");
  }
  if (g.owners[to] !== g.turn) throw new Error("You can only deploy to your own territory");
  const amt = Math.min(g.reinforce, Math.max(1, Math.floor(count)));
  if (amt <= 0) throw new Error("No reinforcements left");
  g.troops[to] += amt;
  g.reinforce -= amt;
  push(g, { kind: "deploy", by: g.turn, to, troops: amt });
  if (g.reinforce <= 0) {
    g.phase = "attack";
  }
  setDeadline(g, now);
}

function rollDice(n: number, rand: () => number): number[] {
  return Array.from({ length: n }, () => 1 + Math.floor(rand() * 6)).sort((a, b) => b - a);
}

export function attack(
  g: RiskGame,
  from: TerritoryId,
  to: TerritoryId,
  blitz: boolean,
  rand: () => number,
  now: number,
) {
  if (g.done || g.phase !== "attack") throw new Error("Not in Attack phase");
  if (g.owners[from] !== g.turn) throw new Error("Pick one of your own territories");
  if (g.owners[to] === g.turn) throw new Error("You already own that territory");
  if (!isAdjacent(from, to)) throw new Error("Territories must share a border");
  if (g.troops[from] < 2) throw new Error("Need at least 2 troops to attack");

  const defender = g.owners[to];
  let waves = 0;
  let totalAtkLost = 0;
  let totalDefLost = 0;
  let lastAtk: number[] = [];
  let lastDef: number[] = [];

  do {
    const atkN = Math.min(3, g.troops[from] - 1);
    const defN = Math.min(2, g.troops[to]);
    lastAtk = rollDice(atkN, rand);
    lastDef = rollDice(defN, rand);
    let aLoss = 0;
    let dLoss = 0;
    const pairs = Math.min(lastAtk.length, lastDef.length);
    for (let i = 0; i < pairs; i++) {
      if (lastAtk[i] > lastDef[i]) dLoss += 1;
      else aLoss += 1; // Ties go to defender
    }
    g.troops[from] -= aLoss;
    g.troops[to] -= dLoss;
    totalAtkLost += aLoss;
    totalDefLost += dLoss;
    waves += 1;
  } while (blitz && g.troops[from] >= 2 && g.troops[to] > 0 && waves < 40);

  const captured = g.troops[to] <= 0;
  g.lastBattle = {
    id: (g.lastBattle?.id ?? 0) + 1,
    by: g.turn,
    defender,
    from,
    to,
    atkDice: lastAtk,
    defDice: lastDef,
    atkLost: totalAtkLost,
    defLost: totalDefLost,
    captured,
    waves,
  };

  if (captured) {
    const minMove = Math.min(lastAtk.length, g.troops[from] - 1);
    const maxMove = g.troops[from] - 1;
    g.owners[to] = g.turn;
    g.conqueredThisTurn = true;

    // Check defender elimination
    const defRemaining = territoriesOf(g, defender).length;
    if (defRemaining === 0 && !g.out.includes(defender)) {
      g.out.push(defender);
      // Steal eliminated player's Risk cards
      const loot = g.cards[defender] ?? [];
      if (loot.length) {
        g.cards[g.turn] = [...(g.cards[g.turn] ?? []), ...loot];
        g.cards[defender] = [];
      }
      push(g, { kind: "eliminate", by: g.turn, target: defender, to });
    }

    push(g, {
      kind: "capture",
      by: g.turn,
      from,
      to,
      target: defender,
      atkDice: lastAtk,
      defDice: lastDef,
      atkLost: totalAtkLost,
      defLost: totalDefLost,
      waves,
    });

    if (minMove === maxMove || checkVictory(g)) {
      g.troops[from] -= minMove;
      g.troops[to] = minMove;
      checkVictory(g);
    } else {
      // Leave 0 temporarily until occupy commits, or pre-move minMove and allow moving extra?
      // Cleaner: keep `troops[to] = minMove` and let `occupy` set exact `move` (from `minMove` to `maxMove`).
      g.troops[to] = 0;
      g.phase = "occupy";
      g.pendingOccupy = { from, to, min: minMove, max: maxMove };
    }
  } else {
    push(g, {
      kind: "attack",
      by: g.turn,
      from,
      to,
      target: defender,
      atkDice: lastAtk,
      defDice: lastDef,
      atkLost: totalAtkLost,
      defLost: totalDefLost,
      waves,
    });
  }

  setDeadline(g, now);
}

export function occupy(g: RiskGame, count: number, now: number) {
  if (g.done || g.phase !== "occupy" || !g.pendingOccupy) throw new Error("No territory to occupy");
  const { from, to, min, max } = g.pendingOccupy;
  const move = Math.min(max, Math.max(min, Math.floor(count)));
  g.troops[from] -= move;
  g.troops[to] = move;
  g.pendingOccupy = undefined;
  g.phase = "attack";
  if (!checkVictory(g)) {
    // If eliminating a player pushed us to 6+ cards, classic Risk lets you keep attacking or trade next turn; keep flow brisk!
    setDeadline(g, now);
  }
}

export function toFortify(g: RiskGame, now: number) {
  if (g.done || g.phase !== "attack") throw new Error("Not in Attack phase");
  g.phase = "fortify";
  setDeadline(g, now);
}

export function fortify(g: RiskGame, from: TerritoryId, to: TerritoryId, count: number, rand: () => number, now: number) {
  if (g.done || g.phase !== "fortify") throw new Error("Not in Fortify phase");
  if (g.owners[from] !== g.turn || g.owners[to] !== g.turn) throw new Error("Both territories must be yours");
  if (from === to) throw new Error("Pick a different destination");
  if (!reachableOwned(g, g.turn, from).includes(to)) throw new Error("Territories must be connected through your lands");
  const maxMove = g.troops[from] - 1;
  if (maxMove < 1) throw new Error("Need at least 2 troops to fortify from here");
  const move = Math.min(maxMove, Math.max(1, Math.floor(count)));
  g.troops[from] -= move;
  g.troops[to] += move;
  push(g, { kind: "fortify", by: g.turn, from, to, troops: move });
  advanceTurn(g, rand, now);
}

export function endTurn(g: RiskGame, rand: () => number, now: number) {
  if (g.done) return;
  if (g.phase === "deploy") throw new Error("Deploy all reinforcements first");
  if (g.phase === "occupy" && g.pendingOccupy) {
    occupy(g, g.pendingOccupy.max, now);
    if (g.done) return;
  }
  advanceTurn(g, rand, now);
}

/** Smart, snappy AI general — executes one clean readable action per scheduled tick. */
export function botStep(g: RiskGame, rand: () => number, now: number) {
  if (g.done) return;
  const me = g.turn;

  if (g.phase === "deploy") {
    // 1. Trade cards if we have a valid set
    const hand = g.cards[me] ?? [];
    const set = findValidSet(hand);
    if (set) {
      tradeCards(g, set, now);
      return;
    }

    // 2. Pick strongest frontier territory (bonus score if it helps finish a continent)
    const owned = territoriesOf(g, me);
    if (!owned.length) {
      advanceTurn(g, rand, now);
      return;
    }
    const borders = owned.filter((t) => TERRITORIES[t].neighbors.some((n) => g.owners[n] !== me));
    const candidates = borders.length ? borders : owned;

    let best = candidates[0];
    let bestScore = -1e9;
    for (const t of candidates) {
      const enemies = TERRITORIES[t].neighbors.filter((n) => g.owners[n] !== me);
      const weakestEnemy = enemies.length ? Math.min(...enemies.map((n) => g.troops[n])) : 99;
      const cont = CONTINENT_LIST.find((c) => c.id === TERRITORIES[t].continent)!;
      const myInCont = cont.territories.filter((x) => g.owners[x] === me).length;
      const contProgress = myInCont / cont.territories.length;
      const score = contProgress * 8 + (g.troops[t] - weakestEnemy) * 1.4 - weakestEnemy * 0.8 + rand() * 1.2;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    deploy(g, best, g.reinforce, now);
    return;
  }

  if (g.phase === "occupy" && g.pendingOccupy) {
    const { from, to, min, max } = g.pendingOccupy;
    const fromHasEnemy = TERRITORIES[from].neighbors.some((n) => g.owners[n] !== me);
    const toHasEnemy = TERRITORIES[to].neighbors.some((n) => g.owners[n] !== me);
    const move = toHasEnemy && !fromHasEnemy ? max : toHasEnemy ? Math.max(min, Math.ceil((min + max) / 2)) : min;
    occupy(g, move, now);
    return;
  }

  if (g.phase === "attack") {
    // Pick the best advantageous attack
    const owned = territoriesOf(g, me);
    let bestAtk: { from: TerritoryId; to: TerritoryId; score: number } | null = null;
    for (const from of owned) {
      if (g.troops[from] < 2) continue;
      for (const to of TERRITORIES[from].neighbors) {
        if (g.owners[to] === me) continue;
        const diff = g.troops[from] - g.troops[to];
        const ratio = g.troops[from] / Math.max(1, g.troops[to]);
        // Attack if we have clear advantage, or decent odds when we haven't earned a card yet
        const threshold = g.conqueredThisTurn ? 2 : 1;
        if (diff >= threshold || (ratio >= 1.5 && g.troops[from] >= 3)) {
          const cont = CONTINENT_LIST.find((c) => c.id === TERRITORIES[to].continent)!;
          const almostMine = cont.territories.filter((x) => g.owners[x] !== me).length === 1 ? 6 : 0;
          const score = diff * 2 + ratio * 3 + almostMine - g.troops[to] * 0.5 + rand();
          if (!bestAtk || score > bestAtk.score) bestAtk = { from, to, score };
        }
      }
    }
    if (bestAtk) {
      attack(g, bestAtk.from, bestAtk.to, true, rand, now);
      return;
    }
    toFortify(g, now);
    return;
  }

  if (g.phase === "fortify") {
    // Move trapped interior troops forward to an active border
    const owned = territoriesOf(g, me);
    const interior = owned
      .filter((t) => g.troops[t] >= 2 && TERRITORIES[t].neighbors.every((n) => g.owners[n] === me))
      .sort((a, b) => g.troops[b] - g.troops[a]);

    for (const src of interior) {
      const reach = reachableOwned(g, me, src);
      const borderTargets = reach.filter((t) => TERRITORIES[t].neighbors.some((n) => g.owners[n] !== me));
      if (borderTargets.length) {
        // Send to the border with the most enemy pressure
        borderTargets.sort((a, b) => {
          const pa = TERRITORIES[a].neighbors.filter((n) => g.owners[n] !== me).reduce((s, n) => s + g.troops[n], 0);
          const pb = TERRITORIES[b].neighbors.filter((n) => g.owners[n] !== me).reduce((s, n) => s + g.troops[n], 0);
          return pb - pa;
        });
        fortify(g, src, borderTargets[0], g.troops[src] - 1, rand, now);
        return;
      }
    }
    advanceTurn(g, rand, now);
  }
}

export function onDeadline(g: RiskGame, rand: () => number, now: number) {
  if (g.done) return;
  if (isBot(g.turn)) {
    botStep(g, rand, now);
    return;
  }
  // Human turn timed out: auto-finish cleanly so nobody gets stuck
  push(g, { kind: "timeout", by: g.turn });
  if (g.phase === "deploy") {
    const hand = g.cards[g.turn] ?? [];
    if (hand.length >= 5) {
      const set = findValidSet(hand);
      if (set) tradeCards(g, set, now);
    }
    const owned = territoriesOf(g, g.turn);
    if (owned.length && g.reinforce > 0) {
      g.troops[owned[0]] += g.reinforce;
      g.reinforce = 0;
    }
  }
  if (g.phase === "occupy" && g.pendingOccupy) {
    occupy(g, g.pendingOccupy.min, now);
    if (g.done) return;
  }
  advanceTurn(g, rand, now);
}

export function leaveGame(g: RiskGame, who: Seat, rand: () => number, now: number) {
  if (g.done || g.out.includes(who)) return;
  g.out.push(who);
  push(g, { kind: "leave", by: who });

  // Remaining humans? If no humans remain (or only 1 alive total), end cleanly
  const alive = alivePlayers(g);
  const aliveHumans = alive.filter((p) => !isBot(p));
  if (aliveHumans.length === 0 || alive.length <= 1) {
    if (alive.length === 1) {
      g.done = { winners: [alive[0]], reason: "last" };
      push(g, { kind: "win", by: alive[0] });
    } else {
      g.done = { winners: [], reason: "empty" };
    }
    g.deadline = undefined;
    return;
  }

  // Redistribute leaver's territories evenly among remaining alive players so borders stay playable
  const abandoned = territoriesOf(g, who);
  abandoned.forEach((t, i) => {
    g.owners[t] = alive[i % alive.length];
    g.troops[t] = Math.max(1, Math.min(2, g.troops[t]));
  });
  g.cards[who] = [];

  if (checkVictory(g)) return;
  if (g.turn === who) {
    g.pendingOccupy = undefined;
    g.conqueredThisTurn = false;
    advanceTurn(g, rand, now);
  }
}
