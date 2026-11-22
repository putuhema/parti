import type { LevelDef } from "./rules";

// Back-and-forth patrol along a row or column, as a looping path.
const sweep = (from: [number, number], to: [number, number]): [number, number][] => {
  const [x0, y0] = from, [x1, y1] = to;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const there = Array.from({ length: n + 1 }, (_, i) => [x0 + Math.sign(x1 - x0) * i, y0 + Math.sign(y1 - y0) * i] as [number, number]);
  return [...there, ...there.slice(1, -1).reverse()];
};

// `par` is the fewest rounds the solver needs, plus two (see src/lib/heist.test.ts).
export const LEVELS: LevelDef[] = [
  {
    id: "backdoor",
    name: "The Back Door",
    intro: "One guard walks the hall. Slip past behind them, grab the gem and meet at the van. Plants hide you.",
    map: [
      "#########",
      "#A.....E#",
      "#B.##...#",
      "#..##.h.#",
      "#.......#",
      "#.##.##.#",
      "#.h...h.#",
      "#.##.##.#",
      "#$..*...#",
      "#########",
    ],
    guards: [sweep([1, 4], [7, 4])],
    par: 10,
  },
  {
    id: "camera",
    name: "Camera Shy",
    intro: "A camera watches the only way in. Hacker: hack the terminal to switch cameras off for 6 steps. Move fast!",
    map: [
      "#########",
      "#A..T...#",
      "#B......#",
      "####.####",
      "#..>....#",
      "#.......#",
      "#...*...#",
      "#.....$.#",
      "#E.....<#",
      "#########",
    ],
    guards: [],
    par: 7,
  },
  {
    id: "locked",
    name: "Locked Up",
    intro: "The gem is behind a locked door. Only the Cat can pick locks. Watch the guard in the lower hall.",
    map: [
      "#########",
      "#A.B#..*#",
      "#...D...#",
      "#...#.h.#",
      "##.###.##",
      "#.......#",
      "#$......#",
      "#...E...#",
      "#########",
    ],
    guards: [sweep([1, 5], [7, 5])],
    par: 9,
  },
  {
    id: "lasers",
    name: "Laser Hall",
    intro: "Two rows of lasers. A hack turns them off for 6 steps, so time it. There's a second terminal down below.",
    map: [
      "#########",
      "#A.B...T#",
      "#.......#",
      "#-------#",
      "#.......#",
      "#.h...h.#",
      "#T..*..$#",
      "#-------#",
      "#...E...#",
      "#########",
    ],
    guards: [sweep([1, 4], [7, 4])],
    par: 7,
  },
  {
    id: "crossing",
    name: "Rush Hour",
    intro: "Two guards cross paths in the gallery. Find the gap, and split up if you have to.",
    map: [
      "#########",
      "#A..#..E#",
      "#B..D...#",
      "#...#.h.#",
      "#.#...#.#",
      "#.......#",
      "#h.#.#..#",
      "#...$...#",
      "#.#.*.#.#",
      "#.......#",
      "#########",
    ],
    guards: [sweep([1, 5], [7, 5]), sweep([4, 4], [4, 9])],
    par: 10,
  },
  {
    id: "vault",
    name: "The Vault",
    intro: "Everything at once: a locked vault, cameras, lasers and a patrol. You'll need both of you.",
    map: [
      "#########",
      "#A.B#E..#",
      "#...#...#",
      "#T..#.h.#",
      "#.......#",
      "#.h.....#",
      "##-###D##",
      "#.......#",
      "#>..$..*#",
      "#########",
    ],
    guards: [sweep([1, 4], [7, 4])],
    par: 10,
  },
];
