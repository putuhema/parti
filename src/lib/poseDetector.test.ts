import { describe, expect, it } from "vitest";
import { POSE_BY_ID } from "../../convex/lib/pose/poses";
import { mirrorJoints, scorePose } from "./poseDetector";

describe("poseDetector scoring", () => {
  it("scores 100 for an exact pose match", () => {
    const heart = POSE_BY_ID["big-heart"];
    expect(scorePose(heart.joints, heart.joints)).toBe(100);
  });

  it("scores significantly lower for a very different pose", () => {
    const heart = POSE_BY_ID["big-heart"];
    const tPose = POSE_BY_ID["t-pose"];
    const cross = POSE_BY_ID["x-cross"];
    expect(scorePose(tPose.joints, heart.joints)).toBeLessThan(65);
    expect(scorePose(cross.joints, heart.joints)).toBeLessThan(55);
  });

  it("scores 100 for mirrored pose when mirrorInvariant is true", () => {
    const dab = POSE_BY_ID["the-dab"];
    expect(dab.mirrorInvariant).toBe(true);
    const flipped = mirrorJoints(dab.joints);
    expect(scorePose(flipped, dab.joints, true)).toBe(100);
  });
});
