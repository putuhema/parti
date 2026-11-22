import { describe, expect, it } from "vitest";
import { START_DICE, alive, autoAct, bid, botMove, callLiar, countFace, isBot, legal, minQty, newGame, nextRound, peek, replaceWithBot, totalDice, type BluffGame } from "../../convex/lib/bluff/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
/** A fixed table: a and b with known dice. */
function table(a: number[], b: number[]): BluffGame {
  const g = newGame(["a", "b"], 0, seeded(1), 0);
  g.players = ["a", "b"];
  g.dice = { a, b };
  g.turn = "a";
  return g;
}

describe("bluff bay", () => {
  it("seats humans and bots with five dice each", () => {
    const g = newGame(["a", "b"], 2, seeded(3), 0);
    expect(g.players).toHaveLength(4);
    expect(g.players.filter(isBot)).toHaveLength(2);
    for (const p of g.players) expect(g.dice[p]).toHaveLength(START_DICE);
    expect(totalDice(g)).toBe(20);
  });

  it("only takes higher bids, and never on 1s", () => {
    const g = table([2, 3, 3, 4, 5], [1, 1, 6, 6, 2]);
    expect(legal(g, 2, 1)).toBe(false);
    expect(bid(g, "a", 3, 4, 0)).toBeNull();
    expect(g.turn).toBe("b");
    expect(legal(g, 3, 3)).toBe(false);
    expect(legal(g, 3, 5)).toBe(true);
    expect(legal(g, 4, 2)).toBe(true);
    expect(legal(g, 11, 2)).toBe(false);
    expect(minQty(g, 3)).toBe(4);
    expect(minQty(g, 6)).toBe(3);
    expect(bid(g, "a", 5, 5, 0)).toMatch(/turn/);
  });

  it("counts wild 1s, and the wrong side loses a die", () => {
    const g = table([2, 3, 3, 4, 5], [1, 1, 6, 6, 2]);
    expect(countFace(g, 6)).toBe(4);
    bid(g, "a", 4, 6, 0);
    callLiar(g, "b", 0); // there are four 6s: the bid was true, so the caller loses
    expect(g.reveal).toMatchObject({ count: 4, liar: false, loser: "b" });
    nextRound(g, seeded(2), 0);
    expect(g.dice.b).toHaveLength(4);
    expect(g.turn).toBe("b");

    bid(g, "b", 9, 6, 0);
    callLiar(g, "a", 0);
    expect(g.reveal?.liar).toBe(true);
    expect(g.reveal?.loser).toBe("b");
  });

  it("knocks a player out at zero dice and ends with one left", () => {
    const g = table([2], [3]);
    bid(g, "a", 2, 6, 0);
    callLiar(g, "b", 0);
    nextRound(g, seeded(2), 0);
    expect(g.done).toEqual({ winner: "b", reason: "end" });
    expect(g.out).toEqual(["a"]);
  });

  it("lets each player peek once, at the next player's die", () => {
    const g = table([2, 3, 3, 4, 5], [1, 1, 6, 6, 2]);
    expect(peek(g, "a", seeded(4))).toBeNull();
    expect(g.peeks.a.target).toBe("b");
    expect(g.dice.b[g.peeks.a.index]).toBe(g.peeks.a.value);
    expect(peek(g, "a", seeded(4))).toMatch(/used/);
  });

  it("bots call an impossible bid", () => {
    const g = table([2, 3, 3, 4, 5], [1, 1, 6, 6, 2]);
    bid(g, "a", 9, 4, 0);
    expect(botMove(g, "b", seeded(5))).toEqual({ call: true });
  });

  it("plays 40 whole bot games to a single winner", () => {
    for (let s = 1; s <= 40; s++) {
      const r = seeded(s);
      const g = newGame([], 2 + (s % 5), r, 0);
      let guard = 2000;
      while (!g.done && guard--) autoAct(g, r, 0);
      expect(g.done?.winner).toBeTruthy();
      expect(alive(g)).toEqual([g.done!.winner]);
    }
  });

  it("hands a leaving player's seat and dice to a bot", () => {
    const g = newGame(["a", "b"], 1, seeded(6), 0);
    const dice = g.dice.a;
    replaceWithBot(g, "a");
    expect(g.players).not.toContain("a");
    const bot = g.players.find((p) => isBot(p) && g.dice[p] === dice);
    expect(bot).toBeTruthy();
  });
});
