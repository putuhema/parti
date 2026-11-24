import { describe, expect, it } from "vitest";
import {
  acceptSecretGuess,
  addReaction,
  advance,
  computeTurnScore,
  leaveGame,
  newGame,
  onDeadline,
  rateSnap,
  skipTurn,
  submitGuess,
  submitSnap,
} from "./rules";
import { POSES, POSE_BY_ID, posesForPack } from "./poses";
import { PROMPTS, isCloseGuess } from "./prompts";

function makeRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("pose catalog & prompts", () => {
  it("has 48 distinct poses across 3 packs with valid normalized joints", () => {
    expect(POSES.length).toBe(48);
    expect(Object.keys(POSE_BY_ID).length).toBe(48);
    expect(posesForPack("cute").length).toBe(16);
    expect(posesForPack("silly").length).toBe(16);
    expect(posesForPack("active").length).toBe(16);
    expect(posesForPack("mix").length).toBe(48);
    for (const p of POSES) {
      for (const [x, y] of Object.values(p.joints)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("matches forgiving guesses in Secret Prompt", () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(40);
    expect(isCloseGuess("statue of liberty", "Statue of Liberty")).toBe(true);
    expect(isCloseGuess("dodging bee!", "Dodging a bee")).toBe(true);
    expect(isCloseGuess("completely wrong", "Statue of Liberty")).toBe(false);
  });
});

describe("classic mode rules", () => {
  it("runs a full 2-player LDR couple game through posing, reveal, rating, collage, and finish", () => {
    const rng = makeRng(7);
    const g = newGame(["alice", "bob"], "cute", 2, 15, 1000, 2800, rng, "classic");

    expect(g.phase).toBe("posing");
    expect(g.currentTurn.playerId).toBe("alice");
    expect(g.poseIds.length).toBe(2);
    expect(g.poseIds[0]).not.toBe(g.poseIds[1]);

    addReaction(g, "bob", "🔥", 2000);
    expect(g.hype).toHaveLength(1);

    submitSnap(g, "alice", 88, 5000);
    expect(g.phase).toBe("reveal");
    expect(g.currentTurn.aiScore).toBe(88);

    rateSnap(g, "bob", "nailed", 6000);
    expect(computeTurnScore(g.currentTurn).totalScore).toBe(Math.round(88 * 0.55 + 100 * 0.45));

    advance(g, 7000);
    expect(g.phase).toBe("posing");
    expect(g.currentTurn.playerId).toBe("bob");
    expect(g.currentTurn.poseId).toBe(g.poseIds[0]);
    expect(g.scores.alice).toBe(93);

    submitSnap(g, "bob", undefined, 9000);
    rateSnap(g, "alice", "close", 10_000);
    expect(computeTurnScore(g.currentTurn).totalScore).toBe(75);

    advance(g, 11_000);
    expect(g.phase).toBe("roundSummary");
    expect(g.history).toHaveLength(1);

    advance(g, 12_000);
    expect(g.phase).toBe("posing");
    expect(g.round).toBe(1);
    expect(g.currentTurn.playerId).toBe("bob"); // rotates starter on round 2!

    skipTurn(g, "bob", 13_000);
    advance(g, 14_000);
    submitSnap(g, "alice", 90, 15_000);
    advance(g, 16_000);
    expect(g.phase).toBe("roundSummary");
    advance(g, 17_000);

    expect(g.done).toBeDefined();
    expect(g.done!.winners).toEqual(["alice"]);
  });

  it("supports solo practice mode skipping roundSummary", () => {
    const g = newGame(["solo"], "active", 2, 10, 1000, 2800, makeRng(1), "classic");
    submitSnap(g, "solo", 82, 4000);
    advance(g, 5000);
    expect(g.phase).toBe("posing");
    expect(g.round).toBe(1);

    onDeadline(g, 20_000);
    expect(g.phase).toBe("reveal");
    expect(g.currentTurn.skipped).toBe(true);

    onDeadline(g, 35_000);
    expect(g.done).toBeDefined();
    expect(g.done!.winners).toEqual(["solo"]);
  });

  it("handles a player leaving mid-turn cleanly", () => {
    const g = newGame(["alice", "bob"], "silly", 2, 15, 1000, 2800, makeRng(3), "classic");
    leaveGame(g, "alice", 3000);
    expect(g.out).toContain("alice");
    expect(g.phase).toBe("posing");
    expect(g.currentTurn.playerId).toBe("bob");
  });
});

describe("copycat mode rules", () => {
  it("lets leader invent a custom pose with skeleton and partner mirrors it", () => {
    const g = newGame(["alice", "bob"], "mix", 2, 15, 1000, 2800, makeRng(9), "copycat");
    expect(g.currentTurn.role).toBe("lead");
    expect(g.currentTurn.playerId).toBe("alice");

    const sampleJoints = POSES[0].joints;
    submitSnap(g, "alice", undefined, 4000, sampleJoints);
    expect(g.leaderJoints).toEqual(sampleJoints);
    expect(g.phase).toBe("posing");
    expect(g.currentTurn.role).toBe("copy");
    expect(g.currentTurn.playerId).toBe("bob");

    submitSnap(g, "bob", 86, 8000);
    expect(g.phase).toBe("reveal");
    rateSnap(g, "alice", "nailed", 9000);
    advance(g, 10_000);
    expect(g.phase).toBe("roundSummary");
    expect(g.history[0].results.map((r) => r.role)).toEqual(["lead", "copy"]);

    // Round 2 rotates leader to Bob
    advance(g, 11_000);
    expect(g.round).toBe(1);
    expect(g.leaderId).toBe("bob");
    expect(g.currentTurn.role).toBe("lead");
  });
});

describe("secret prompt mode rules", () => {
  it("hides prompt, lets actor snap, guesser guess, and actor accept close guesses", () => {
    const g = newGame(["alice", "bob"], "mix", 2, 15, 1000, 2800, makeRng(11), "secret");
    expect(g.secretPrompt).toBeTruthy();
    expect(g.currentTurn.playerId).toBe("alice");

    submitSnap(g, "alice", undefined, 4000);
    expect(g.phase).toBe("guessing");

    submitGuess(g, "bob", "random guess", 5000);
    expect(g.phase).toBe("guessing");
    expect(g.guesses).toHaveLength(1);

    // Actor can accept a close guess manually
    acceptSecretGuess(g, "alice", "bob", 6000);
    expect(g.phase).toBe("reveal");
    expect(g.solvedBy).toBe("bob");
    expect(g.scores.bob).toBe(100);
    expect(g.scores.alice).toBe(95);

    advance(g, 7000);
    expect(g.round).toBe(1);
    expect(g.currentTurn.playerId).toBe("bob");
  });
});

describe("pose telephone mode rules", () => {
  it("alternates pose -> skeleton guess -> pose -> skeleton guess -> chainReveal", () => {
    const g = newGame(["alice", "bob"], "mix", 1, 15, 1000, 2800, makeRng(13), "telephone");
    expect(g.phase).toBe("posing");
    expect(g.currentTurn.playerId).toBe("alice");

    // Step 0: Alice poses
    submitSnap(g, "alice", undefined, 4000, POSES[1].joints);
    expect(g.chainStep).toBe(1);
    expect(g.phase).toBe("guessing");
    expect(g.currentTurn.playerId).toBe("bob");

    // Step 1: Bob guesses from skeleton
    submitGuess(g, "bob", "holding a giant pizza", 6000);
    expect(g.chainStep).toBe(2);
    expect(g.phase).toBe("posing");
    expect(g.currentTurn.playerId).toBe("alice");

    // Step 2: Alice poses Bob's guess
    submitSnap(g, "alice", undefined, 9000, POSES[2].joints);
    expect(g.chainStep).toBe(3);
    expect(g.phase).toBe("guessing");
    expect(g.currentTurn.playerId).toBe("bob");

    // Step 3: Bob makes final guess -> chainReveal!
    submitGuess(g, "bob", "catching a giant pizza", 12_000);
    expect(g.phase).toBe("chainReveal");
    expect(g.history).toHaveLength(1);
    expect(g.history[0].chain).toHaveLength(4);

    advance(g, 15_000);
    expect(g.done).toBeDefined();
  });
});
