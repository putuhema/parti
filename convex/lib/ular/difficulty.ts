/**
 * Difficulty ratings for the shared trivia bank (convex/lib/trivia/questions.ts).
 * Kept separate so Quiz Loop / Buzz Board stay untouched while Ular Tangga scales
 * ladder climb and snake drop distance by how hard the question is.
 */
import type { Difficulty } from "./board";

// Question IDs 0..209 in convex/lib/trivia/questions.ts:
//   0..24  SCIENCE, 25..49 PLACES, 50..74 HISTORY, 75..99 ARTS, 100..124 SPORTS, 125..149 FOOD
//   150..159 MORE SCIENCE, 160..169 MORE PLACES, 170..179 MORE HISTORY,
//   180..189 MORE ARTS, 190..199 MORE SPORTS, 200..209 MORE FOOD

const HARD_IDS = new Set<number>([
  // Science (specific numbers, astronomy, physics, biology)
  5, 11, 12, 14, 16, 18, 21, 22, 154, 155,
  // Places (tricky capitals, rivers, mountain ranges, borders)
  29, 30, 33, 34, 35, 40, 43, 46, 47, 167,
  // History (exact years, ancient wonders, specific historical figures)
  55, 59, 63, 64, 68, 69, 70, 71, 171, 173, 175, 178, 179,
  // Arts (counts, specific works/artists/terms)
  77, 78, 86, 88, 90, 91, 92, 94, 98, 181, 183, 187,
  // Sports (specific measurements, terminology, records)
  106, 107, 110, 115, 119, 120, 124, 194, 198,
  // Food & Life (math conversions, spices, specific origins)
  128, 132, 133, 135, 143, 145, 205, 206,
]);

const MEDIUM_IDS = new Set<number>([
  // Science
  0, 2, 8, 9, 15, 17, 20, 23, 151, 153, 157,
  // Places
  27, 31, 37, 39, 41, 42, 44, 49, 162, 164, 166,
  // History
  51, 53, 54, 57, 58, 60, 61, 62, 65, 66, 67, 73, 170, 172, 174, 176, 177,
  // Arts
  76, 80, 82, 83, 84, 85, 87, 89, 93, 95, 96, 97, 99, 180, 182, 184, 185, 186, 188,
  // Sports
  102, 103, 104, 105, 109, 112, 113, 114, 116, 118, 121, 122, 123, 190, 191, 192, 193, 195, 197,
  // Food & Life
  126, 127, 129, 130, 137, 138, 139, 141, 142, 144, 146, 147, 200, 201, 202, 204, 207, 208,
]);

export function difficultyOf(qId: number): Difficulty {
  if (HARD_IDS.has(qId)) return "hard";
  if (MEDIUM_IDS.has(qId)) return "medium";
  return "easy";
}
