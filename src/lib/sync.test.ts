import { describe, expect, it } from "vitest";
import { QUESTIONS, questionById } from "../../convex/lib/sync/deck";
import { buildCards, guessScore, knowsPercent, memoriesFrom, newGame, questionOf, react, ready, submit, syncPercent, validValue, writeQuestion } from "../../convex/lib/sync/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const P: [string, string] = ["ana", "ben"];
const ALL = ["light", "dreams", "deep", "flirty"] as const;

describe("sync decks", () => {
  it("has unique ids and well-formed questions", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    for (const q of QUESTIONS) {
      if (q.type === "pick") expect(q.options.length).toBeGreaterThanOrEqual(2);
      if (q.type === "rank") expect(q.items.length).toBe(4);
      expect(q.talk.length).toBeGreaterThan(5);
    }
  });

  it("builds a game of the right length, fresh questions first, with two ask cards", () => {
    const seen = QUESTIONS.filter((q) => q.deck === "light").slice(0, 15).map((q) => q.id);
    const cards = buildCards(seeded(1), ["light"], 12, seen, [], true, P);
    expect(cards).toHaveLength(12);
    expect(cards.filter((c) => c.ask).map((c) => c.ask)).toEqual(["ana", "ben"]);
    const ids = cards.filter((c) => c.qid).map((c) => c.qid!);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !seen.includes(id)).length).toBe(7); // all 7 unseen light questions used
    expect(ids.filter((id) => questionById(id)!.type === "open").length).toBeLessThanOrEqual(3);
  });

  it("adds a throwback from a past game", () => {
    const memories = [{ qid: "l9", at: 1, answers: { ana: 3, ben: 8 } }];
    const cards = buildCards(seeded(2), [...ALL], 8, [], memories, false, P);
    expect(cards).toHaveLength(8);
    expect(cards.filter((c) => c.throwback)).toHaveLength(1);
    expect(cards.filter((c) => c.qid === "l9")).toHaveLength(1);
  });
});

describe("sync scoring", () => {
  const scale = questionById("l9")!;
  const rank = questionById("l13")!;
  it("scores guesses", () => {
    expect(guessScore(questionById("l1")!, 2, 2)).toBe(1);
    expect(guessScore(questionById("l1")!, 1, 2)).toBe(0);
    expect(guessScore(scale, 5, 5)).toBe(1);
    expect(guessScore(scale, 7, 5)).toBe(0.5);
    expect(guessScore(scale, 10, 0)).toBe(0);
    expect(guessScore(rank, [0, 1, 2, 3], [0, 1, 2, 3])).toBe(1);
    expect(guessScore(rank, [3, 2, 1, 0], [0, 1, 2, 3])).toBe(0);
    expect(guessScore(rank, [1, 0, 2, 3], [0, 1, 2, 3])).toBe(0.75);
  });
  it("checks answers", () => {
    expect(validValue(rank, [0, 1, 2, 3], P)).toBe(true);
    expect(validValue(rank, [0, 0, 2, 3], P)).toBe(false);
    expect(validValue(scale, 11, P)).toBe(false);
    expect(validValue(questionById("l16")!, "ana", P)).toBe(true);
    expect(validValue(questionById("l16")!, "zed", P)).toBe(false);
  });
});

describe("sync game", () => {
  it("plays a full game", () => {
    const g = newGame(P, [...ALL], 8, true, [], [], seeded(4));
    let guard = 0;
    while (!g.done && guard++ < 50) {
      const card = g.cards[g.i];
      if (g.phase === "write") {
        expect(writeQuestion(g, card.ask!, { q: "Tea or coffee?", options: ["Tea", "Coffee"] })).toBeNull();
        continue;
      }
      if (g.phase === "answer") {
        const q = questionOf(card)!;
        const answer = q.type === "pick" ? 0 : q.type === "scale" ? 5 : q.type === "rank" ? [0, 1, 2, 3] : q.type === "who" ? "ana" : "hello";
        for (const p of P) {
          const asker = card.ask === p;
          const err = submit(g, p, { me: asker ? undefined : answer, guess: answer });
          expect(err).toBeNull();
        }
        expect(g.phase).toBe("reveal");
        react(g, "ana", "❤️");
        expect(g.reactions).toHaveLength(1);
        continue;
      }
      ready(g, "ana");
      expect(g.phase).toBe("reveal");
      ready(g, "ben");
    }
    expect(g.done?.reason).toBe("end");
    expect(g.results).toHaveLength(8);
    expect(syncPercent(g.results)).toBe(100);
    expect(knowsPercent(g.results, "ana")).toBe(100);
    const mem = memoriesFrom(g.results, 7);
    expect(mem.every((m) => Object.keys(m.answers).length === 2)).toBe(true);
  });

  it("refuses bad moves", () => {
    const g = newGame(P, ["light"], 8, false, [], [], seeded(9));
    expect(submit(g, "ana", {})).toBe("Pick an answer first");
    expect(writeQuestion(g, "ana", { q: "x", options: ["a", "b"] })).toBe("Not your turn to ask");
  });
});
