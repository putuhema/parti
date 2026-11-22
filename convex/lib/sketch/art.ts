// The picture book: simple line drawings of real things, on a 100×100 grid.
// Paths use absolute M, L, H, V, Q, C and Z commands, plus "O cx cy r" for a circle.
// `taboo` lists words the describer may not say; `clues` are what the bot reads out in solo play.

export type Art = { id: string; word: string; taboo: string[]; paths: string[]; clues: string[] };

export const ART: Art[] = [
  {
    id: "banana", word: "banana", taboo: ["bananas", "pisang"],
    paths: ["M14 32 Q18 80 64 84 Q82 84 90 70 Q84 63 78 66 Q60 70 46 60 Q30 48 24 30 Z", "M14 32 L12 24 L20 23 L24 30"],
    clues: ["It's one long curved shape, like a big smile that got stretched.", "It starts at the top-left, swoops down, and ends on the right a bit lower than the middle.", "It's fat in the middle and thin and pointy at the right end.", "A tiny stub pokes up from the top-left end. It's a fruit!"],
  },
  {
    id: "dinosaur", word: "dinosaur", taboo: ["dino", "dinosaurs", "dinosaurus"],
    paths: ["M18 16 Q24 8 31 12 L31 18 Q30 32 40 44 Q56 36 70 46 Q80 52 94 74 Q80 68 74 64 L74 84 L67 84 L66 68 L50 68 L49 84 L42 84 L42 66 Q32 60 26 40 Q24 28 24 20 Q18 22 18 16 Z", "O 25 14 1.5"],
    clues: ["A big animal seen from the side, with a round fat body in the middle-right.", "A very long neck goes up to the top-left and ends in a small head.", "Four short straight legs stand at the bottom, like table legs.", "A long tail stretches down to the bottom-right corner. It lived a very long time ago."],
  },
  {
    id: "house", word: "house", taboo: ["home", "houses", "rumah"],
    paths: ["M22 48 L22 86 L78 86 L78 48", "M12 50 L50 16 L88 50 Z", "M44 86 L44 66 L56 66 L56 86", "M28 56 L38 56 L38 66 L28 66 Z", "M62 56 L72 56 L72 66 L62 66 Z", "M66 32 L66 20 L74 20 L74 39"],
    clues: ["A big square sits on the bottom half of the page.", "On top of the square is a wide triangle, like a hat that's a bit wider than the square.", "In the middle of the bottom edge is a tall rectangle you could walk through.", "Two small squares sit on either side of it, and a little chimney pokes out of the right slope."],
  },
  {
    id: "fish", word: "fish", taboo: ["fishes", "ikan"],
    paths: ["M14 50 Q38 22 68 50 Q38 78 14 50 Z", "M68 50 L88 32 L86 68 Z", "O 28 46 3", "M40 38 Q34 50 40 62"],
    clues: ["A wide oval lies across the middle, pointy at the left end.", "On the right end of the oval is a triangle, pointing into the oval.", "Near the left tip there's a small dot, like an eye.", "A curved line runs up and down just behind the dot. It lives in water."],
  },
  {
    id: "cat", word: "cat", taboo: ["cats", "kitten", "kitty", "kucing", "meow"],
    paths: ["O 50 58 26", "M30 42 L28 18 L46 33", "M54 33 L72 18 L70 42", "O 40 54 3", "O 60 54 3", "M47 64 L53 64 L50 68 Z", "M20 64 L38 66", "M20 72 L38 69", "M62 66 L80 64", "M62 69 L80 72"],
    clues: ["A big circle in the middle of the page: it's a face.", "Two pointy triangles stick up from the top of the circle, like ears.", "Two dots for eyes and a tiny upside-down triangle nose below them.", "Two straight lines poke out sideways from each cheek, like whiskers. It purrs."],
  },
  {
    id: "tree", word: "tree", taboo: ["trees", "pohon"],
    paths: ["M44 90 L44 64", "M56 64 L56 90", "M36 90 L64 90", "M44 64 Q24 66 24 50 Q16 36 32 30 Q34 12 50 14 Q66 12 68 30 Q84 36 76 50 Q76 66 56 64"],
    clues: ["At the bottom middle are two short straight lines going up, like a thick post.", "On top of the post is a big bumpy cloud shape that fills most of the top.", "The bumpy shape is about twice as wide as the post is tall.", "There's a flat line along the very bottom, like the ground."],
  },
  {
    id: "car", word: "car", taboo: ["cars", "mobil", "auto"],
    paths: ["M10 66 L10 52 Q12 48 22 47 L32 34 Q34 32 40 32 L64 32 Q68 32 72 36 L80 47 Q90 48 90 54 L90 66 Z", "O 28 68 9", "O 72 68 9", "M36 46 L40 37 L50 37 L50 46 Z", "M56 46 L56 37 L66 37 L72 46 Z"],
    clues: ["A long shape lies across the middle, flat on the bottom and with a bump on top.", "The bump on top has sloping sides, and two windows inside it.", "Two circles sit on the bottom edge, one near each end.", "You'd drive it to school."],
  },
  {
    id: "sun", word: "sun", taboo: ["sunny", "matahari", "sunshine"],
    paths: ["O 50 50 18", "M76 50 L90 50", "M68 68 L78 78", "M50 76 L50 90", "M32 68 L22 78", "M24 50 L10 50", "M32 32 L22 22", "M50 24 L50 10", "M68 32 L78 22", "M42 54 Q50 62 58 54", "O 43 45 2", "O 57 45 2"],
    clues: ["A circle right in the middle, about a third of the page wide.", "Eight short straight lines point out from the circle all around, like spokes.", "Inside the circle are two dots and a smile.", "It's yellow and hot in real life, and it's up in the sky."],
  },
  {
    id: "umbrella", word: "umbrella", taboo: ["umbrellas", "payung"],
    paths: ["M12 50 Q14 16 50 14 Q86 16 88 50 Q79 43 70 50 Q60 43 50 50 Q40 43 30 50 Q21 43 12 50 Z", "M50 50 L50 80 Q50 88 43 88 Q37 88 37 82", "M50 14 L50 8"],
    clues: ["A wide dome fills the top half, like half a circle sitting flat.", "Its bottom edge isn't straight: it's made of four little bumps.", "A long straight line hangs down from the middle of the dome.", "At the bottom, the line curls to the left like a hook. You use it when it rains."],
  },
  {
    id: "icecream", word: "ice cream", taboo: ["ice", "cream", "icecream", "es krim", "cone"],
    paths: ["M32 46 L50 92 L68 46", "M28 46 Q22 28 38 24 Q50 14 62 24 Q78 28 72 46 Z", "O 50 13 4", "M40 54 L60 70", "M60 54 L42 72"],
    clues: ["In the bottom half is a tall triangle pointing down.", "There's a criss-cross pattern inside the triangle.", "On top of the triangle sits a bumpy round blob, a bit wider than the triangle.", "A tiny circle sits right on top of the blob. It's a cold treat."],
  },
  {
    id: "rocket", word: "rocket", taboo: ["rockets", "roket", "spaceship"],
    paths: ["M38 74 L38 34 Q38 16 50 6 Q62 16 62 34 L62 74 Z", "O 50 38 7", "M38 56 L26 74 L38 74", "M62 56 L74 74 L62 74", "M42 74 L46 90 L50 80 L54 90 L58 74"],
    clues: ["A tall thin shape stands up in the middle, pointy at the top.", "A round window sits a bit above its middle.", "Two triangles stick out at the bottom, one on each side.", "Under it is a zigzag, like flames. It flies to space."],
  },
  {
    id: "apple", word: "apple", taboo: ["apples", "apel"],
    paths: ["M50 28 Q36 18 24 30 Q12 46 22 66 Q32 88 50 80 Q68 88 78 66 Q88 46 76 30 Q64 18 50 28 Z", "M50 28 Q50 18 56 12", "M54 20 Q64 10 74 14 Q66 24 54 20 Z"],
    clues: ["A big round shape fills most of the page, with a small dip at the top middle.", "There's also a small dip at the bottom middle.", "A short curvy stick goes up from the top dip.", "Next to the stick is a small leaf pointing right. It's a fruit, often red."],
  },
  {
    id: "mug", word: "mug", taboo: ["cup", "mugs", "cups", "gelas", "cangkir", "coffee", "tea"],
    paths: ["M22 34 L26 84 Q26 88 30 88 L62 88 Q66 88 66 84 L70 34 Z", "M68 46 Q86 46 84 60 Q82 72 66 70", "M38 28 Q34 22 38 16 Q42 10 38 6", "M54 28 Q50 22 54 16 Q58 10 54 6"],
    clues: ["A tall box, a bit narrower at the bottom, open at the top, slightly left of middle.", "On its right side is a curved loop, like an ear.", "Above the box are two wiggly lines going up, like steam.", "You drink hot drinks from it."],
  },
  {
    id: "snowman", word: "snowman", taboo: ["snow", "snowmen", "salju"],
    paths: ["O 50 70 20", "O 50 38 13", "M36 26 L64 26", "M41 26 L41 10 L59 10 L59 26", "O 45 36 1.5", "O 55 36 1.5", "M50 40 L60 42 L50 43", "M31 64 L14 50", "M69 64 L86 50", "O 50 64 2", "O 50 74 2"],
    clues: ["Two circles stacked: a big one at the bottom and a smaller one on top.", "On top of the small circle is a tall box hat with a flat brim.", "Two thin sticks poke out of the big circle, going up and out like arms.", "A little pointy nose sticks out to the right. It melts in the sun."],
  },
  {
    id: "flower", word: "flower", taboo: ["flowers", "bunga"],
    paths: ["O 50 34 8", "O 65 34 8", "O 57.5 47 8", "O 42.5 47 8", "O 35 34 8", "O 42.5 21 8", "O 57.5 21 8", "M50 55 Q48 72 50 92", "M49 76 Q34 64 26 72 Q38 82 49 76 Z"],
    clues: ["Near the top middle is a small circle with six circles around it, touching it.", "From the bottom of that, a long wavy line goes straight down to the bottom.", "Halfway down the line, a leaf sticks out to the left.", "It grows in a garden."],
  },
  {
    id: "boat", word: "boat", taboo: ["boats", "ship", "perahu", "kapal", "sailboat"],
    paths: ["M12 64 L88 64 L76 82 L24 82 Z", "M50 64 L50 12", "M52 14 L80 56 L52 56", "M48 20 L24 56 L48 56", "M8 90 Q18 84 28 90 Q38 96 48 90 Q58 84 68 90 Q78 96 88 90"],
    clues: ["Near the bottom, a wide shape: flat top, narrower flat bottom, slanted sides.", "A tall straight pole stands up from its middle.", "Two triangles hang on either side of the pole, the right one is bigger.", "Under everything is a wavy line. It floats."],
  },
  {
    id: "heart", word: "heart", taboo: ["hearts", "love", "hati", "jantung"],
    paths: ["M50 86 Q14 60 14 38 Q14 18 32 18 Q44 18 50 32 Q56 18 68 18 Q86 18 86 38 Q86 60 50 86 Z"],
    clues: ["One big shape filling the page.", "The top has two round bumps side by side, with a dip in the middle.", "The sides curve inward down to one sharp point at the bottom middle.", "People draw it on cards for someone they care about."],
  },
  {
    id: "glasses", word: "glasses", taboo: ["glass", "spectacles", "kacamata", "sunglasses"],
    paths: ["O 30 52 15", "O 70 52 15", "M45 50 Q50 44 55 50", "M15 50 L6 42", "M85 50 L94 42"],
    clues: ["Two circles side by side across the middle, the same size.", "A small curved bridge joins them in the middle.", "From the outer side of each circle, a short line goes up and out.", "You wear them to see better."],
  },
  {
    id: "key", word: "key", taboo: ["keys", "kunci", "lock"],
    paths: ["O 26 50 14", "O 26 50 5", "M40 50 L90 50", "M70 50 L70 58", "M78 50 L78 62", "M86 50 L86 60"],
    clues: ["On the left, a circle with a smaller circle inside it.", "From the right side of the circle, a long straight line goes all the way to the right.", "Near the right end, three short lines hang down from it, different lengths.", "You use it to open a door."],
  },
  {
    id: "lightbulb", word: "light bulb", taboo: ["light", "bulb", "lamp", "lampu", "idea"],
    paths: ["M38 64 Q38 56 32 48 Q22 34 32 20 Q42 8 50 8 Q58 8 68 20 Q78 34 68 48 Q62 56 62 64 Z", "M40 70 L60 70", "M40 76 L60 76", "M44 82 L56 82", "M44 64 L46 44 Q50 38 54 44 L56 64"],
    clues: ["A big round shape at the top that gets narrow at the bottom, like an upside-down pear.", "Under it are three short flat lines, the lowest one shortest.", "Inside the round part, a thin upside-down U.", "It glows. Cartoons draw it over your head when you think of something clever."],
  },
  {
    id: "mushroom", word: "mushroom", taboo: ["mushrooms", "jamur", "toadstool"],
    paths: ["M12 52 Q14 14 50 14 Q86 14 88 52 Z", "M38 52 L36 86 Q36 90 40 90 L60 90 Q64 90 64 86 L62 52", "O 34 32 5", "O 56 26 6", "O 72 40 4"],
    clues: ["The top half is a wide dome with a flat bottom edge.", "Under the dome is a short thick stalk, like a box.", "Three spots of different sizes are on the dome.", "It grows in the forest and some are poisonous."],
  },
  {
    id: "snail", word: "snail", taboo: ["snails", "siput", "keong"],
    paths: ["M50 60 Q40 60 40 50 Q40 40 52 40 Q64 40 64 52 Q64 68 48 68 Q30 68 30 50 Q30 28 52 28 Q76 28 76 52 Q76 72 70 74", "M12 76 L84 76 Q92 76 90 66 L86 54", "M86 56 L82 40", "M89 58 L94 44", "O 82 38 2", "O 94 42 2"],
    clues: ["A spiral in the middle, like a swirl that winds into the centre.", "Under the spiral is a long flat line, across most of the bottom.", "On the right, that line bends up into a little head.", "Two thin feelers with dots go up from the head. It's very slow."],
  },
  {
    id: "moon", word: "moon", taboo: ["moons", "bulan", "crescent"],
    paths: ["M60 12 Q24 16 22 50 Q24 86 62 88 Q36 76 36 50 Q36 24 60 12 Z", "M76 30 L78 36 L84 36 L79 40 L81 46 L76 42 L71 46 L73 40 L68 36 L74 36 Z"],
    clues: ["On the left is a big thin curve shaped like the letter C, pointy at both ends.", "It's fat in the middle and fills from top to bottom.", "On the right, a small five-pointed star.", "You see it in the night sky."],
  },
  {
    id: "rain", word: "rain cloud", taboo: ["rain", "cloud", "hujan", "awan", "storm"],
    paths: ["M24 56 Q10 56 12 44 Q14 32 28 34 Q30 18 48 20 Q60 12 70 24 Q88 22 88 40 Q90 56 74 56 Z", "M30 66 L26 76", "M50 66 L46 76", "M70 66 L66 76", "M40 80 L36 90", "M60 80 L56 90"],
    clues: ["A wide bumpy fluffy shape across the top half, with a flat bottom.", "Under it are five short slanted lines in two rows.", "The lines all lean the same way, like they're falling.", "Take an umbrella!"],
  },
  {
    id: "kite", word: "kite", taboo: ["kites", "layang", "layangan"],
    paths: ["M50 8 L78 38 L50 76 L22 38 Z", "M50 8 L50 76", "M22 38 L78 38", "M50 76 Q40 82 48 86 Q56 90 46 95"],
    clues: ["A tall diamond in the top part, longer below than above.", "Inside it, a cross: one line top to bottom and one side to side.", "The side-to-side line is above the diamond's middle.", "A wiggly tail hangs from the bottom point. It flies on a windy day."],
  },
  {
    id: "balloon", word: "balloon", taboo: ["balloons", "balon"],
    paths: ["M50 66 Q24 62 24 36 Q24 10 50 10 Q76 10 76 36 Q76 62 50 66 Z", "M46 70 L50 66 L54 70 Z", "M50 70 Q44 80 52 86 Q58 92 50 96"],
    clues: ["A big oval, taller than wide, in the top two-thirds of the page.", "Under it, a tiny triangle knot.", "A wavy line hangs down from the knot to the bottom.", "It floats at a birthday party."],
  },
  {
    id: "butterfly", word: "butterfly", taboo: ["butterflies", "kupu", "moth"],
    paths: ["M48 30 L48 76 Q50 80 52 76 L52 30 Q50 26 48 30 Z", "M48 40 Q30 14 14 22 Q8 40 46 52", "M52 40 Q70 14 86 22 Q92 40 54 52", "M47 54 Q24 56 22 72 Q32 86 48 66", "M53 54 Q76 56 78 72 Q68 86 52 66", "M49 28 Q44 16 38 14", "M51 28 Q56 16 62 14"],
    clues: ["A thin tall body goes straight down the middle.", "On each side, two wings: a bigger one on top and a smaller one below.", "The top wings stretch up toward the top corners.", "Two curly feelers at the top. It flutters from flower to flower."],
  },
  {
    id: "clock", word: "clock", taboo: ["clocks", "jam", "watch", "time"],
    paths: ["O 50 50 38", "O 50 50 2", "M50 50 L50 24", "M50 50 L68 58", "M50 14 L50 20", "M86 50 L80 50", "M50 86 L50 80", "M14 50 L20 50"],
    clues: ["One big circle filling almost the whole page.", "Four tiny lines on its edge: top, bottom, left and right, pointing in.", "From the centre, a long line goes straight up and a shorter one goes down to the right.", "It tells you when to go to school."],
  },
  {
    id: "pencil", word: "pencil", taboo: ["pencils", "pensil", "pen"],
    paths: ["M20 76 L68 28 L78 38 L30 86 Z", "M20 76 L12 94 L30 86", "M68 28 L76 20 L86 30 L78 38"],
    clues: ["A long thin rectangle lies diagonally, from bottom-left to top-right.", "At the bottom-left end, it narrows to a sharp point.", "At the top-right end, there's a short little box on the end.", "You draw with it, just like now."],
  },
  {
    id: "crown", word: "crown", taboo: ["crowns", "mahkota", "king", "queen"],
    paths: ["M16 76 L12 30 L32 52 L50 22 L68 52 L88 30 L84 76 Z", "M16 66 L84 66", "O 12 27 3", "O 50 19 3", "O 88 27 3"],
    clues: ["A wide shape: flat bottom, and the top is a zigzag with three tall points.", "The middle point is the tallest.", "A straight line runs across near the bottom.", "Three little circles sit on the tips. Royalty wears it on their head."],
  },
  {
    id: "turtle", word: "turtle", taboo: ["turtles", "tortoise", "kura"],
    paths: ["M18 66 Q20 30 50 30 Q80 30 82 66 Z", "M36 66 L40 46 L60 46 L64 66", "M40 46 L34 34", "M60 46 L66 34", "M82 58 Q94 54 94 62 Q94 68 82 66", "M26 66 L24 78 L34 78 L34 66", "M66 66 L66 78 L76 78 L74 66", "M18 62 L8 66 L18 66", "O 89 59 1.5"],
    clues: ["A dome shape sits in the middle with a flat bottom, like half a circle.", "Inside the dome are some lines making a pattern of shapes.", "A small round head pokes out on the right, a tiny tail on the left.", "Two stubby feet stick out underneath. It carries its house on its back."],
  },
  {
    id: "pizza", word: "pizza", taboo: ["pizzas", "slice"],
    paths: ["M50 90 L14 22 Q50 6 86 22 Z", "M18 28 Q50 14 82 28", "O 44 36 6", "O 60 48 5", "O 50 64 5", "O 36 52 4"],
    clues: ["A big triangle pointing down, with the point at the bottom middle.", "Its top edge is curved, and there's a second curved line just under it.", "Four circles of different sizes are spread inside.", "It's Italian food with melted cheese on top."],
  },
  {
    id: "envelope", word: "envelope", taboo: ["envelopes", "amplop", "letter", "mail"],
    paths: ["M14 26 L86 26 L86 76 L14 76 Z", "M14 26 L50 54 L86 26"],
    clues: ["A wide rectangle across the middle, wider than tall.", "From the top-left and top-right corners, two lines meet in the middle.", "Together they make a big V that reaches a bit past the middle.", "You put a note inside, lick it shut and post it."],
  },
  {
    id: "watermelon", word: "watermelon", taboo: ["melon", "semangka", "watermelons"],
    paths: ["M10 40 Q50 108 90 40 Z", "M18 46 Q50 96 82 46", "O 40 54 2", "O 50 60 2", "O 60 54 2", "O 50 50 2"],
    clues: ["A wide half-circle bowl shape: flat on top, round underneath.", "The flat top is a bit above the middle of the page.", "Just inside the round edge is another curve, following it.", "Four little dots inside, like seeds. It's a juicy summer fruit."],
  },
  {
    id: "candle", word: "candle", taboo: ["candles", "lilin"],
    paths: ["M40 40 L40 88 L60 88 L60 40 Z", "M50 36 Q40 24 50 10 Q60 24 50 36 Z", "M50 40 L50 36"],
    clues: ["A tall narrow rectangle stands in the bottom middle.", "Above it, a short line, then a teardrop shape pointing up.", "The teardrop is about the same width as the rectangle.", "You blow it out on your birthday."],
  },
];

// ---------- Turning paths into lines ----------
const Q_STEPS = 12, C_STEPS = 16;

/** One drawing as polylines of flat [x0, y0, x1, y1, …] integers on a 0–`size` canvas. */
export function artLines(art: Art, size = 1000): number[][] {
  const k = size / 100;
  const out: number[][] = [];
  for (const path of art.paths) {
    const tokens = path.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
    let i = 0;
    const num = () => parseFloat(tokens[i++]);
    let cur: number[] = [];
    let x = 0, y = 0, sx = 0, sy = 0, cmd = "";
    const push = (px: number, py: number) => { cur.push(Math.round(px * k), Math.round(py * k)); x = px; y = py; };
    const end = () => { if (cur.length >= 4) out.push(cur); cur = []; };
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
      switch (cmd) {
        case "M": end(); sx = num(); sy = num(); push(sx, sy); cmd = "L"; break;
        case "L": push(num(), num()); break;
        case "H": push(num(), y); break;
        case "V": push(x, num()); break;
        case "Q": {
          const x0 = x, y0 = y, cx = num(), cy = num(), ex = num(), ey = num();
          for (let s = 1; s <= Q_STEPS; s++) {
            const t = s / Q_STEPS, u = 1 - t;
            push(u * u * x0 + 2 * u * t * cx + t * t * ex, u * u * y0 + 2 * u * t * cy + t * t * ey);
          }
          break;
        }
        case "C": {
          const x0 = x, y0 = y, c1x = num(), c1y = num(), c2x = num(), c2y = num(), ex = num(), ey = num();
          for (let s = 1; s <= C_STEPS; s++) {
            const t = s / C_STEPS, u = 1 - t;
            push(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex, u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey);
          }
          break;
        }
        case "Z": push(sx, sy); end(); break;
        case "O": {
          end();
          const cx = num(), cy = num(), r = num();
          const n = r < 4 ? 10 : 32;
          for (let s = 0; s <= n; s++) push(cx + r * Math.cos((s / n) * Math.PI * 2), cy + r * Math.sin((s / n) * Math.PI * 2));
          end();
          break;
        }
        default: i++;
      }
    }
    end();
  }
  return out;
}

export const artById = (id?: string) => ART.find((a) => a.id === id);
