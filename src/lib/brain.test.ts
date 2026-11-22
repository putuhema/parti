import { describe, expect, it } from "vitest";
import { CARDS, TOPICS, cardById } from "../../convex/lib/brain/cards";
import { agreeLock, agreePick, learnedBy, markReady, newGame, nextRound, quizAnswer, quizCardFor, type BrainGame } from "../../convex/lib/brain/rules";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const ALL = TOPICS.map((t) => t.id);

describe("brain cards", () => {
  it("are well-formed: unique ids, four different options, keys, and every topic filled", () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) {
      expect(new Set(c.options).size).toBe(4);
      expect(c.answer).toBeGreaterThanOrEqual(0);
      expect(c.answer).toBeLessThan(4);
      expect(c.keys.every((k) => k.length > 0)).toBe(true);
      expect(c.text.length).toBeLessThan(320);
    }
    for (const t of TOPICS) expect(CARDS.filter((c) => c.topic === t.id).length).toBeGreaterThanOrEqual(8);
  });
});

describe("teach swap", () => {
  it("each player reads their own card, gets quizzed on the partner's, and both right is a perfect swap", () => {
    const g = newGame(["ana", "ben"], "teach", ALL, 3, [], seeded(1));
    expect(g.phase).toBe("read");
    const r0 = g.rounds[0];
    expect(r0.cards.ana).not.toBe(r0.cards.ben);
    expect(quizCardFor(g, "ana")).toBe(r0.cards.ben);
    markReady(g, "ana");
    expect(g.phase).toBe("read");
    markReady(g, "ben");
    expect(g.phase).toBe("teach");
    markReady(g, "ana");
    markReady(g, "ben");
    expect(g.phase).toBe("quiz");
    expect(quizAnswer(g, "ana", cardById(r0.cards.ben)!.answer)).toBeNull();
    expect(quizAnswer(g, "ana", 0)).toBe("Already answered");
    quizAnswer(g, "ben", cardById(r0.cards.ana)!.answer);
    expect(g.phase).toBe("reveal");
    expect(g.score).toBe(250);
    expect(g.results[0].answers.every((a) => a.right)).toBe(true);
    nextRound(g, "ana");
    nextRound(g, "ben");
    expect(g.round).toBe(1);
    expect(g.phase).toBe("read");
    expect(learnedBy(g, "ana").sort()).toEqual([r0.cards.ana, r0.cards.ben].sort());
  });
});

describe("agree to answer", () => {
  const play = (g: BrainGame) => {
    const c = cardById(g.rounds[g.round].shared)!;
    return c;
  };
  it("only reveals once both lock in on the same answer", () => {
    const g = newGame(["ana", "ben"], "agree", ["indonesia"], 3, [], seeded(2));
    const c = play(g);
    agreePick(g, "ana", c.answer);
    agreePick(g, "ben", (c.answer + 1) % 4);
    agreeLock(g, "ana");
    agreeLock(g, "ben");
    expect(g.disagree).toBe(true);
    expect(g.phase).toBe("agree");
    agreePick(g, "ben", c.answer);
    expect(g.disagree).toBe(false);
    agreeLock(g, "ana");
    agreeLock(g, "ben");
    expect(g.phase).toBe("reveal");
    expect(g.score).toBe(100);
  });

  it("plays alone, with streaks, prefers unlearned cards, and finishes", () => {
    const learned = CARDS.filter((c) => c.topic === "space").slice(0, 5).map((c) => c.id);
    const g = newGame(["solo"], "teach", ["space"], 3, learned, seeded(3));
    expect(g.mode).toBe("agree");
    expect(g.rounds.every((r) => !learned.includes(r.shared!))).toBe(true);
    for (let i = 0; i < 3; i++) {
      agreePick(g, "solo", play(g).answer);
      agreeLock(g, "solo");
      nextRound(g, "solo");
    }
    expect(g.done?.reason).toBe("end");
    expect(g.score).toBe(300 + 20 + 40);
    expect(g.best).toBe(3);
  });
});
