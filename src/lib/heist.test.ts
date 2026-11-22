import { describe, expect, it } from "vitest";
import { LEVELS } from "../../convex/lib/heist/levels";
import { HACK_TICKS, TICKS, actionFor, cone, parseLevel, planPath, playRound, solve, startSim, step, type LevelDef } from "../../convex/lib/heist/rules";

const mini = (map: string[], guards: LevelDef["guards"] = []) => parseLevel({ id: "t", name: "t", intro: "", map, guards, par: 9 });

describe("heist levels", () => {
  for (const def of LEVELS) {
    it(`${def.id} can be won, with every coin, and par is the solver's best plus two`, () => {
      const lv = parseLevel(def);
      expect(lv.starts.cat && lv.starts.hacker && lv.gem && lv.exits.length).toBeTruthy();
      const ticks = solve(lv);
      expect(ticks).toBeGreaterThan(0);
      expect(def.par).toBe(Math.ceil(ticks / TICKS) + 2);
      expect(solve(lv, { coins: true })).toBeGreaterThan(0);
    }, 60_000);
  }
});

describe("heist rules", () => {
  it("guards see in a cone, blocked by walls; plants hide you, but not from a bump", () => {
    const lv = mini([
      "#######",
      "#A....#",
      "#B.#..#",
      "#.h...#",
      "#..*.E#",
      "#######",
    ], [[[1, 3, "e"]]]);
    const sim = startSim(lv);
    const seen = cone(lv, sim, { x: 1, y: 3 }, "e").map((p) => `${p.x},${p.y}`);
    expect(seen).toContain("2,3");
    expect(seen).toContain("4,4");
    expect(seen).not.toContain("3,2"); // wall
    // Hacker steps onto the plant right in front of the guard: hidden.
    const r = step(lv, { ...sim, hacker: { x: 2, y: 2 } }, { cat: "wait", hacker: "s" });
    expect(r.bust).toBeNull();
    // Walking into the guard: caught.
    const r2 = step(lv, { ...sim, hacker: { x: 1, y: 2 } }, { cat: "wait", hacker: "s" });
    expect(r2.bust?.by).toBe("guard");
  });

  it("only the Cat picks locks; picking takes the step", () => {
    const lv = mini(["#####", "#A.D*", "#B.#E", "#####"]);
    let sim = startSim(lv);
    sim = step(lv, sim, { cat: "e", hacker: "wait" }).sim;
    const hackerTry = step(lv, { ...sim, hacker: { x: 2, y: 1 }, cat: { x: 1, y: 1 } }, { cat: "wait", hacker: "e" });
    expect(hackerTry.sim.open).toEqual([]);
    const pick = step(lv, sim, { cat: "e", hacker: "wait" });
    expect(pick.sim.open).toEqual(["3,1"]);
    expect(pick.sim.cat).toEqual({ x: 2, y: 1 });
    expect(step(lv, pick.sim, { cat: "e", hacker: "wait" }).sim.cat).toEqual({ x: 3, y: 1 });
  });

  it("lasers bust you unless hacked, and a hack wears off", () => {
    const lv = mini(["#######", "#A.T..#", "#..B-*E", "#######"]);
    const sim = startSim(lv);
    expect(step(lv, sim, { cat: "wait", hacker: "e" }).bust?.by).toBe("laser");
    const hacked = step(lv, sim, { cat: "wait", hacker: "hack" });
    expect(hacked.sim.hack).toBe(HACK_TICKS);
    expect(step(lv, hacked.sim, { cat: "wait", hacker: "e" }).bust).toBeNull();
    const rounds = playRound(lv, sim, { cat: ["wait"], hacker: ["hack", "e", "e"] });
    expect(rounds.at(-1)!.sim.gem).toBe(true);
  });

  it("plans: tapping tiles turns into actions, and paths show where you'll be", () => {
    const lv = parseLevel(LEVELS[0]);
    const sim = startSim(lv);
    expect(actionFor(lv, sim, "cat", sim.cat, [], { x: 2, y: 1 })).toBe("e");
    expect(actionFor(lv, sim, "cat", sim.cat, [], sim.cat)).toBe("wait");
    expect(actionFor(lv, sim, "cat", sim.cat, [], { x: 3, y: 3 })).toBeNull();
    expect(planPath(lv, sim, "cat", ["e", "e", "wait"])).toEqual([{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 1 }]);
  });
});
