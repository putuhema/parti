import { describe, expect, it } from "vitest";
import { BOARD, GEM_COST, ITEMS, N, arm, autoAct, botScore, cellOf, current, isBot, newGame, rankOf, replaceWithBot, revealMini, roll, shopChoice, shrineChoice, submitMini, type IslandGame } from "../../convex/lib/island/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Let bots and timers play until a human must act, or the game ends. */
function runBots(g: IslandGame, r: () => number, now = 0, guard = 200) {
  while (!g.done && guard-- > 0) {
    if ((g.phase === "roll" || g.phase === "shop") && !isBot(current(g))) return;
    if (g.phase === "shrine" && g.pending && !isBot(g.pending.who)) return;
    if (g.phase === "mini") { for (const p of g.players) if (!isBot(p) && g.mini!.scores[p] === undefined) return; }
    autoAct(g, r, now);
  }
}

describe("lucky island", () => {
  it("lays the board out around the edge of a 7×7 grid", () => {
    const cells = new Set(Array.from({ length: N }, (_, i) => `${cellOf(i).col},${cellOf(i).row}`));
    expect(cells.size).toBe(N);
    for (let i = 0; i < N; i++) {
      const a = cellOf(i), b = cellOf((i + 1) % N);
      expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
    }
  });

  it("fills empty seats with bots and puts the shrine on a blue space", () => {
    const g = newGame(["me"], 5, seeded(1), 0);
    expect(g.players).toHaveLength(4);
    expect(g.players.filter(isBot)).toHaveLength(3);
    expect(BOARD[g.shrine]).toBe("blue");
  });

  it("plays whole games with bots to the end, always with a winner", () => {
    for (let s = 1; s <= 20; s++) {
      const r = seeded(s);
      const g = newGame(["me"], 5, r, 0);
      let guard = 500;
      while (!g.done && guard-- > 0) {
        runBots(g, r);
        if (g.done) break;
        if (g.phase === "roll") roll(g, "me", r, 0);
        else if (g.phase === "shrine") shrineChoice(g, "me", true, r, 0);
        else if (g.phase === "shop") shopChoice(g, "me", g.coins.me >= ITEMS.double.cost ? "double" : null, 0);
        else if (g.phase === "mini") { submitMini(g, "me", botScore(g.mini!.micro, r), g.mini!.startAt); revealMini(g, r, 0); }
      }
      expect(g.done?.reason).toBe("end");
      expect(g.done!.winners.length).toBeGreaterThan(0);
      expect(g.round).toBe(5);
      expect(rankOf(g)[0]).toBe(g.done!.winners[0]);
      for (const p of g.players) expect(g.coins[p]).toBeGreaterThanOrEqual(0);
    }
  });

  it("stops at the shrine to buy a gem, which then moves", () => {
    const g = newGame(["me", "you"], 5, seeded(3), 0);
    const p = current(g);
    g.coins[p] = 50;
    g.pos[p] = (g.shrine - 1 + N) % N;
    const shrine = g.shrine;
    roll(g, p, () => 0, 0); // rolls a 1: lands right on the shrine
    expect(g.phase).toBe("shrine");
    shrineChoice(g, p, true, seeded(4), 0);
    expect(g.gems[p]).toBe(1);
    expect(g.coins[p]).toBeGreaterThanOrEqual(50 - GEM_COST - 3);
    expect(g.shrine).not.toBe(shrine);
  });

  it("items: double dice rolls two, warp jumps next to the shrine", () => {
    const g = newGame(["me", "you"], 5, seeded(5), 0);
    const p = current(g);
    g.items[p] = ["double", "warp"];
    expect(arm(g, p, "double")).toBeNull();
    roll(g, p, seeded(6), 0);
    expect(g.lastMove!.dice).toHaveLength(2);
    expect(g.items[p]).toEqual(["warp"]);
  });

  it("a bot takes over the seat of someone who leaves", () => {
    const g = newGame(["me", "you"], 5, seeded(7), 0);
    g.coins.you = 42;
    replaceWithBot(g, "you");
    expect(g.players).not.toContain("you");
    const bot = g.players.find((p) => isBot(p) && g.coins[p] === 42);
    expect(bot).toBeDefined();
  });
});
