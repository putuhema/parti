import { describe, expect, it } from "vitest";
import {
  addReaction,
  advance,
  computeTurnScore,
  leaveGame,
  newGame,
  onDeadline,
  rateSnap,
  skipTurn,
  submitSnap,
} from "./rules";
import { POSES, POSE_BY_ID, posesForPack } from "./poses";

function makeRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("pose catalog", () => {
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
});

describe("pose match rules", () => {
  it("runs a full 2-player LDR couple game through posing, reveal, rating, collage, and finish", () => {
    const rng = makeRng(7);
    const g = newGame(["alice", "bob"], "cute", 2, 15, 1000, 2800, rng);

    expect(g.phase).toBe("posing");
    expect(g.currentTurn.playerId).toBe("alice");
    expect(g.poseIds.length).toBe(2);
    expect(g.poseIds[0]).not.toBe(g.poseIds[1]);

    // Bob sends hype while Alice is posing
    addReaction(g, "bob", "🔥", 2000);
    expect(g.hype).toHaveLength(1);

    // Alice snaps with 88% AI match
    submitSnap(g, "alice", 88, 5000);
    expect(g.phase).toBe("reveal");
    expect(g.currentTurn.aiScore).toBe(88);

    // Bob rates "nailed" (+100)
    rateSnap(g, "bob", "nailed", 6000);
    expect(computeTurnScore(g.currentTurn).totalScore).toBe(Math.round(88 * 0.55 + 100 * 0.45));

    // Advance -> Bob's turn on the same pose!
    advance(g, 7000);
    expect(g.phase).toBe("posing");
    expect(g.currentTurn.playerId).toBe("bob");
    expect(g.currentTurn.poseId).toBe(g.poseIds[0]);
    expect(g.scores.alice).toBe(93);

    // Bob snaps without AI score (camera-only fallback)
    submitSnap(g, "bob", undefined, 9000);
    rateSnap(g, "alice", "close", 10_000);
    expect(computeTurnScore(g.currentTurn).totalScore).toBe(75);

    // Advance -> Round summary collage!
    advance(g, 11_000);
    expect(g.phase).toBe("roundSummary");
    expect(g.history).toHaveLength(1);
    expect(g.history[0].results.map((r) => r.playerId)).toEqual(["alice", "bob"]);

    // Advance -> Round 2 starts with Alice
    advance(g, 12_000);
    expect(g.phase).toBe("posing");
    expect(g.round).toBe(1);
    expect(g.currentTurn.playerId).toBe("alice");
    expect(g.currentTurn.poseId).toBe(g.poseIds[1]);

    // Alice skips, Bob snaps -> finish
    skipTurn(g, "alice", 13_000);
    expect(computeTurnScore(g.currentTurn).totalScore).toBe(0);
    advance(g, 14_000);
    submitSnap(g, "bob", 90, 15_000);
    advance(g, 16_000);
    expect(g.phase).toBe("roundSummary");
    advance(g, 17_000);

    expect(g.done).toBeDefined();
    expect(g.done!.winners).toEqual(["bob"]); // bob: 75 + 90 = 165 vs alice: 93 + 0 = 93
    expect(g.done!.totalPoses).toBe(2);
    expect(g.done!.coupleSync).toBe(Math.round((93 + 75 + 0 + 90) / 4));
  });

  it("supports solo practice mode skipping roundSummary", () => {
    const g = newGame(["solo"], "active", 2, 10, 1000, 2800, makeRng(1));
    submitSnap(g, "solo", 82, 4000);
    advance(g, 5000);
    expect(g.phase).toBe("posing");
    expect(g.round).toBe(1);

    onDeadline(g, 20_000); // times out posing -> reveal (skipped)
    expect(g.phase).toBe("reveal");
    expect(g.currentTurn.skipped).toBe(true);

    onDeadline(g, 35_000); // advances -> finishes
    expect(g.done).toBeDefined();
    expect(g.done!.winners).toEqual(["solo"]);
  });

  it("handles a player leaving mid-turn cleanly", () => {
    const g = newGame(["alice", "bob"], "silly", 2, 15, 1000, 2800, makeRng(3));
    leaveGame(g, "alice", 3000);
    expect(g.out).toContain("alice");
    expect(g.phase).toBe("posing");
    expect(g.currentTurn.playerId).toBe("bob");
  });
});
