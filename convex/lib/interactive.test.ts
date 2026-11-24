import { describe, expect, it } from "vitest";
import { EXPRESSIONS, EXPRESSION_BY_ID } from "./face/expressions";
import { advanceFace, newFaceGame, rateFaceSnap, submitFaceSnap } from "./face/rules";
import { advanceDoodle, guessDoodle, newDoodleGame } from "./doodle/rules";
import { advanceSplit, newSplitGame, snapSplitSide } from "./split/rules";
import { endHeadsRound, markHeadsCard, newHeadsGame, nextHeadsRound, startHeadsRound } from "./heads/rules";

const rng = () => 0.37;

describe("Emoji Face Match rules", () => {
  it("scores blendshapes and completes a 2-player game", () => {
    expect(EXPRESSIONS.length).toBe(18);
    expect(EXPRESSION_BY_ID["cheeky-wink"].score({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.05 })).toBeGreaterThan(80);
    expect(EXPRESSION_BY_ID["pufferfish"].score({ cheekPuff: 0.7 })).toBeGreaterThan(80);

    const g = newFaceGame(["a", "b"], 1, 15, 1000, 2000, rng);
    submitFaceSnap(g, "a", 92, 4000);
    rateFaceSnap(g, "b", "nailed", 5000);
    advanceFace(g, 6000);
    expect(g.currentTurn.playerId).toBe("b");
    submitFaceSnap(g, "b", 80, 8000);
    advanceFace(g, 9000);
    expect(g.phase).toBe("roundSummary");
    advanceFace(g, 10_000);
    expect(g.done?.winners).toEqual(["a"]);
  });
});

describe("Air Doodle rules", () => {
  it("awards points on close guess and rotates drawer", () => {
    const g = newDoodleGame(["a", "b"], 2, 45, 1000, 2000, rng);
    const word = g.words[0];
    guessDoodle(g, "b", word.toLowerCase(), 5000);
    expect(g.phase).toBe("reveal");
    expect(g.solvedBy).toBe("b");
    expect(g.scores.b).toBe(100);
    expect(g.scores.a).toBe(85);
    advanceDoodle(g, 6000);
    expect(g.drawerId).toBe("b");
    expect(g.round).toBe(1);
  });
});

describe("Split-Screen Co-op Photobooth rules", () => {
  it("captures left then right, swaps sides each round, and finishes", () => {
    const g = newSplitGame(["a", "b"], 2, rng);
    expect(snapSplitSide(g, "a")).toBe("left");
    expect(g.phase).toBe("right");
    expect(snapSplitSide(g, "b")).toBe("right");
    expect(g.phase).toBe("reveal");
    advanceSplit(g);
    expect(g.round).toBe(1);
    expect(g.leftPlayerId).toBe("b");
    expect(g.rightPlayerId).toBe("a");
  });
});

describe("Heads Up rules", () => {
  it("tracks got/pass cards, rotates guesser, and computes winner", () => {
    const g = newHeadsGame(["a", "b"], "couple", 2, 60, rng);
    startHeadsRound(g, 1000);
    markHeadsCard(g, "got", 2000);
    markHeadsCard(g, "pass", 3000);
    markHeadsCard(g, "got", 4000);
    endHeadsRound(g);
    expect(g.scores.a).toBe(2);
    expect(g.phase).toBe("summary");
    nextHeadsRound(g);
    expect(g.guesserId).toBe("b");
    startHeadsRound(g, 10_000);
    markHeadsCard(g, "got", 11_000);
    endHeadsRound(g);
    nextHeadsRound(g);
    expect(g.done?.winners).toEqual(["a"]);
    expect(g.done?.totalGot).toBe(3);
  });
});
