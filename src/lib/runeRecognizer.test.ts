import { describe, expect, it } from "vitest";
import { recognizeRune, type Pt2 } from "./runeRecognizer";
import { BOT_ID, castSpell, newSpellGame, stepBot } from "../../convex/lib/spell/rules";

describe("runeRecognizer", () => {
  it("recognizes a circle as Arcane Shield", () => {
    const circle: Pt2[] = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 27) * Math.PI * 2;
      return [0.5 + Math.cos(a) * 0.22, 0.5 + Math.sin(a) * 0.22];
    });
    expect(recognizeRune(circle)?.spell).toBe("shield");
  });

  it("recognizes a peak ^ as Fireball", () => {
    const peak: Pt2[] = [
      [0.25, 0.7], [0.3, 0.58], [0.36, 0.46], [0.43, 0.34], [0.5, 0.22],
      [0.57, 0.34], [0.64, 0.46], [0.7, 0.58], [0.75, 0.7],
    ];
    expect(recognizeRune(peak)?.spell).toBe("fire");
  });

  it("recognizes a Z zigzag as Lightning", () => {
    const z: Pt2[] = [
      [0.25, 0.25], [0.45, 0.25], [0.7, 0.25],
      [0.55, 0.45], [0.4, 0.6], [0.25, 0.75],
      [0.45, 0.75], [0.72, 0.75],
    ];
    expect(recognizeRune(z)?.spell).toBe("lightning");
  });

  it("recognizes a horizontal slash as Frost and vertical line as Heal", () => {
    const horiz: Pt2[] = Array.from({ length: 10 }, (_, i) => [0.2 + i * 0.06, 0.5]);
    const vert: Pt2[] = Array.from({ length: 10 }, (_, i) => [0.5, 0.2 + i * 0.06]);
    expect(recognizeRune(horiz)?.spell).toBe("frost");
    expect(recognizeRune(vert)?.spell).toBe("heal");
  });
});

describe("Spellcaster Duel rules", () => {
  it("applies Frost + Fireball shatter combo, Lightning shield-pierce, and KO victory", () => {
    const g = newSpellGame("p1", "p2", 1000, 2000);
    // p1 casts Frost -> 12 dmg + Freezes p2
    const ev1 = castSpell(g, "p1", "frost", 3500);
    expect(ev1.damage).toBe(12);
    expect(g.wizards.p2.frozen).toBe(true);

    // p1 casts Fireball -> 24 + 10 shatter bonus = 34 dmg!
    const ev2 = castSpell(g, "p1", "fire", 6000);
    expect(ev2.shattered).toBe(true);
    expect(ev2.damage).toBe(34);
    expect(g.wizards.p2.hp).toBe(100 - 12 - 34);

    // p2 raises Shield (+26), p1 pierces it with Lightning (3rd distinct element -> +4 combo bonus!)
    castSpell(g, "p2", "shield", 6500);
    expect(g.wizards.p2.shield).toBe(26);
    const ev3 = castSpell(g, "p1", "lightning", 8500);
    expect(ev3.pierced).toBe(true);
    expect(ev3.combo).toBe(3);
    expect(g.wizards.p2.shield).toBe(0);
    expect(ev3.damage).toBe(24);
    expect(g.wizards.p1.charge).toBe(3); // Now overcharged!
  });

  it("runs Arcane Bot turns cleanly", () => {
    const g = newSpellGame("p1", BOT_ID, 1000, 2000);
    stepBot(g, 5500, () => 0.2);
    expect(g.events.length).toBe(1);
    expect(g.events[0].by).toBe(BOT_ID);
  });
});
