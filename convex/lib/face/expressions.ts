export type Blendshapes = Record<string, number>;

export type ExpressionDef = {
  id: string;
  emoji: string;
  name: string;
  cue: string;
  accent: string;
  /** Returns 0..100 match score from MediaPipe 52 ARKit blendshapes. */
  score: (b: Blendshapes) => number;
};

const g = (b: Blendshapes, k: string) => b[k] ?? 0;
const avg = (...xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100)));

export const EXPRESSIONS: readonly ExpressionDef[] = [
  {
    id: "big-grin",
    emoji: "😄",
    name: "Big Grin",
    cue: "Flash your biggest, happiest cheese smile!",
    accent: "#FFBE3B",
    score: (b) => clamp100(avg(g(b, "mouthSmileLeft"), g(b, "mouthSmileRight")) * 1.15 + g(b, "jawOpen") * 0.45),
  },
  {
    id: "cheeky-wink",
    emoji: "😉",
    name: "Cheeky Wink",
    cue: "Close one eye tight and keep the other wide open!",
    accent: "#FF5B8A",
    score: (b) => {
      const diff = Math.abs(g(b, "eyeBlinkLeft") - g(b, "eyeBlinkRight"));
      const smile = avg(g(b, "mouthSmileLeft"), g(b, "mouthSmileRight"));
      return clamp100(diff * 1.45 + smile * 0.25);
    },
  },
  {
    id: "shocked",
    emoji: "😮",
    name: "Shocked Pikachu",
    cue: "Drop your jaw wide open and raise your eyebrows!",
    accent: "#FF8C1A",
    score: (b) =>
      clamp100(
        g(b, "jawOpen") * 0.85 +
          g(b, "browInnerUp") * 0.4 +
          avg(g(b, "eyeWideLeft"), g(b, "eyeWideRight")) * 0.45,
      ),
  },
  {
    id: "kissy",
    emoji: "😘",
    name: "Kissy Face",
    cue: "Pucker up and send a kiss right to the camera!",
    accent: "#F05A9A",
    score: (b) => clamp100(g(b, "mouthPucker") * 1.35 + g(b, "mouthFunnel") * 0.25),
  },
  {
    id: "pufferfish",
    emoji: "🐡",
    name: "Pufferfish",
    cue: "Puff out both cheeks as big as you can!",
    accent: "#28A6FF",
    score: (b) => clamp100(g(b, "cheekPuff") * 1.65),
  },
  {
    id: "grumpy",
    emoji: "😠",
    name: "Grumpy Brows",
    cue: "Furrow your eyebrows down and frown like you're hangry!",
    accent: "#E0485C",
    score: (b) =>
      clamp100(
        avg(g(b, "browDownLeft"), g(b, "browDownRight")) * 1.15 +
          avg(g(b, "mouthFrownLeft"), g(b, "mouthFrownRight")) * 0.65,
      ),
  },
  {
    id: "smirk",
    emoji: "😏",
    name: "Smug Smirk",
    cue: "Lift just ONE corner of your mouth in a sly smirk!",
    accent: "#9775FF",
    score: (b) => {
      const asym = Math.abs(g(b, "mouthSmileLeft") - g(b, "mouthSmileRight"));
      const maxS = Math.max(g(b, "mouthSmileLeft"), g(b, "mouthSmileRight"));
      return clamp100(asym * 1.7 + maxS * 0.25);
    },
  },
  {
    id: "puppy-eyes",
    emoji: "🥺",
    name: "Puppy Eyes",
    cue: "Lift your inner eyebrows up with a tiny pout!",
    accent: "#6852A0",
    score: (b) =>
      clamp100(
        g(b, "browInnerUp") * 0.95 +
          avg(g(b, "mouthFrownLeft"), g(b, "mouthFrownRight")) * 0.65 +
          g(b, "mouthPucker") * 0.25,
      ),
  },
  {
    id: "scream",
    emoji: "😱",
    name: "Dramatic Scream",
    cue: "Open wide, eyes huge — full horror movie gasp!",
    accent: "#E0485C",
    score: (b) =>
      clamp100(
        g(b, "jawOpen") * 0.75 +
          avg(g(b, "eyeWideLeft"), g(b, "eyeWideRight")) * 0.65 +
          g(b, "browInnerUp") * 0.35,
      ),
  },
  {
    id: "grimace",
    emoji: "😬",
    name: "Awkward Grimace",
    cue: "Stretch your mouth wide and show all your teeth!",
    accent: "#20BA9C",
    score: (b) =>
      clamp100(
        avg(g(b, "mouthStretchLeft"), g(b, "mouthStretchRight")) * 1.2 +
          avg(g(b, "mouthUpperUpLeft"), g(b, "mouthUpperUpRight")) * 0.55 +
          avg(g(b, "mouthLowerDownLeft"), g(b, "mouthLowerDownRight")) * 0.35,
      ),
  },
  {
    id: "whistle",
    emoji: "😗",
    name: "Innocent Whistle",
    cue: "Make a neat little O with your lips!",
    accent: "#3578E5",
    score: (b) => clamp100(g(b, "mouthFunnel") * 1.35 + g(b, "mouthPucker") * 0.3),
  },
  {
    id: "laughing-squint",
    emoji: "😆",
    name: "Cracking Up",
    cue: "Big smile + scrunch your eyes shut like you're dying laughing!",
    accent: "#FFBE3B",
    score: (b) =>
      clamp100(
        avg(g(b, "mouthSmileLeft"), g(b, "mouthSmileRight")) * 0.75 +
          avg(g(b, "eyeSquintLeft"), g(b, "eyeSquintRight")) * 0.85,
      ),
  },
  {
    id: "side-eye",
    emoji: "😒",
    name: "Bombastic Side-Eye",
    cue: "Keep your head still and dart your eyes hard to one side!",
    accent: "#6852A0",
    score: (b) => {
      const lookL = avg(g(b, "eyeLookOutLeft"), g(b, "eyeLookInRight"));
      const lookR = avg(g(b, "eyeLookInLeft"), g(b, "eyeLookOutRight"));
      return clamp100(Math.max(lookL, lookR) * 1.55);
    },
  },
  {
    id: "unimpressed",
    emoji: "😑",
    name: "Totally Done",
    cue: "Squint your eyes and press your lips flat together.",
    accent: "#504064",
    score: (b) =>
      clamp100(
        avg(g(b, "eyeSquintLeft"), g(b, "eyeSquintRight")) * 0.8 +
          avg(g(b, "mouthPressLeft"), g(b, "mouthPressRight")) * 0.95,
      ),
  },
  {
    id: "peaceful",
    emoji: "😌",
    name: "Peaceful Zen",
    cue: "Close both eyes softly with a gentle smile.",
    accent: "#2CC770",
    score: (b) =>
      clamp100(
        avg(g(b, "eyeBlinkLeft"), g(b, "eyeBlinkRight")) * 0.9 +
          avg(g(b, "mouthSmileLeft"), g(b, "mouthSmileRight")) * 0.55,
      ),
  },
  {
    id: "suspicious",
    emoji: "🤨",
    name: "Raised Brow",
    cue: "Raise your eyebrows super high like 'wait, really?!'",
    accent: "#FF8C1A",
    score: (b) =>
      clamp100(
        Math.max(g(b, "browOuterUpLeft"), g(b, "browOuterUpRight")) * 1.15 +
          Math.abs(g(b, "browOuterUpLeft") - g(b, "browOuterUpRight")) * 0.7,
      ),
  },
  {
    id: "determined",
    emoji: "😤",
    name: "Huff & Puff",
    cue: "Scrunch your nose up and furrow your brows!",
    accent: "#E0485C",
    score: (b) =>
      clamp100(
        avg(g(b, "noseSneerLeft"), g(b, "noseSneerRight")) * 1.2 +
          avg(g(b, "browDownLeft"), g(b, "browDownRight")) * 0.65,
      ),
  },
  {
    id: "ooh",
    emoji: "😯",
    name: "Ooh Fancy",
    cue: "Raise your brows and make a surprised O mouth!",
    accent: "#28A6FF",
    score: (b) =>
      clamp100(g(b, "jawOpen") * 0.6 + g(b, "mouthFunnel") * 0.65 + g(b, "browInnerUp") * 0.45),
  },
];

export const EXPRESSION_BY_ID: Record<string, ExpressionDef> = Object.fromEntries(
  EXPRESSIONS.map((e) => [e.id, e]),
);
