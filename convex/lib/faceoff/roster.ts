/**
 * Face Off: the 24 characters and the questions you can ask about them.
 * Shared by the server (answers questions) and phones (draws the board).
 *
 * The traits below ARE the drawing brief: each drawing has to match its row,
 * or the automatic yes/no answers will be wrong. Drop each drawing in
 * public/faceoff/<id>.png (square, ~512×512). Until a file exists the game
 * draws a simple placeholder face from these traits.
 */

export type Hair = "black" | "brown" | "blonde" | "red" | "white" | "bald";
export type Shirt = "red" | "blue" | "green" | "yellow";

export interface Character {
  id: string; // also the drawing's file name
  name: string;
  hair: Hair;
  shirt: Shirt;
  glasses: boolean;
  hat: boolean;
  beard: boolean;
  earrings: boolean;
  freckles: boolean;
  longHair: boolean;
}

type Row = [name: string, hair: Hair, shirt: Shirt, flags: string];
// flags: G glasses, H hat, B beard, E earrings, F freckles, L long hair
const ROWS: Row[] = [
  ["Ayu", "black", "red", "G E L"],
  ["Budi", "black", "blue", "H B"],
  ["Citra", "brown", "green", "E F L"],
  ["Dewi", "blonde", "yellow", "G H L"],
  ["Eko", "bald", "red", "G B"],
  ["Fajar", "red", "blue", "F"],
  ["Gita", "white", "green", "H E L"],
  ["Hana", "black", "yellow", "F L"],
  ["Iwan", "brown", "red", "G B F"],
  ["Joko", "white", "blue", "G B"],
  ["Kiki", "red", "yellow", "H E F L"],
  ["Lala", "blonde", "green", "E"],
  ["Maya", "brown", "blue", "G L"],
  ["Nina", "black", "green", "H F"],
  ["Omar", "bald", "yellow", "H B E"],
  ["Putu", "black", "red", ""],
  ["Rina", "blonde", "blue", "E F L"],
  ["Sari", "red", "red", "G L"],
  ["Tono", "brown", "yellow", "H B"],
  ["Udin", "bald", "green", "F"],
  ["Vina", "white", "yellow", "G E"],
  ["Wayan", "blonde", "red", "H B"],
  ["Yogi", "black", "blue", "E"],
  ["Zara", "brown", "green", "G H E L"],
];

export const CHARACTERS: Character[] = ROWS.map(([name, hair, shirt, flags]) => {
  const f = new Set(flags.split(" "));
  return {
    id: name.toLowerCase(),
    name,
    hair,
    shirt,
    glasses: f.has("G"),
    hat: f.has("H"),
    beard: f.has("B"),
    earrings: f.has("E"),
    freckles: f.has("F"),
    longHair: f.has("L"),
  };
});

export interface Question {
  id: string;
  group: "Hair" | "Shirt" | "Face & style";
  text: string; // "Do they wear glasses?"
  short: string; // "Glasses" for the log
  test: (c: Character) => boolean;
}

const HAIR_WORD: Record<Exclude<Hair, "bald">, string> = { black: "black", brown: "brown", blonde: "blonde", red: "red", white: "white", };

export const QUESTIONS: Question[] = [
  ...(Object.keys(HAIR_WORD) as Exclude<Hair, "bald">[]).map((h) => ({
    id: `hair-${h}`, group: "Hair" as const, text: `Is their hair ${HAIR_WORD[h]}?`, short: `${h[0].toUpperCase()}${h.slice(1)} hair`, test: (c: Character) => c.hair === h,
  })),
  { id: "hair-bald", group: "Hair", text: "Are they bald?", short: "Bald", test: (c) => c.hair === "bald" },
  { id: "long", group: "Hair", text: "Do they have long hair?", short: "Long hair", test: (c) => c.longHair },
  ...(["red", "blue", "green", "yellow"] as Shirt[]).map((s) => ({
    id: `shirt-${s}`, group: "Shirt" as const, text: `Is their shirt ${s}?`, short: `${s[0].toUpperCase()}${s.slice(1)} shirt`, test: (c: Character) => c.shirt === s,
  })),
  { id: "glasses", group: "Face & style", text: "Do they wear glasses?", short: "Glasses", test: (c) => c.glasses },
  { id: "hat", group: "Face & style", text: "Are they wearing a hat?", short: "Hat", test: (c) => c.hat },
  { id: "beard", group: "Face & style", text: "Do they have a beard?", short: "Beard", test: (c) => c.beard },
  { id: "earrings", group: "Face & style", text: "Do they wear earrings?", short: "Earrings", test: (c) => c.earrings },
  { id: "freckles", group: "Face & style", text: "Do they have freckles?", short: "Freckles", test: (c) => c.freckles },
];

export const questionById = (id: string) => QUESTIONS.find((q) => q.id === id);

/** Seconds per turn. */
export const TURN_MS = 45_000;
