/** The Tile Town bot: finds playable words for its rack and picks a decent one, not the best. */
import { isWord, wordSet } from "../words/dict";
import { CELLS, CENTER, MIN_WORD, SIZE, judge, takeFrom, type Placed, type TileLang } from "./rules";

const MAX_LEN = 8;
const MAX_TRIES = 5000; // full checks per turn, to keep the bot's turn cheap

const pools: Partial<Record<TileLang, string[]>> = {};
function pool(lang: TileLang) {
  // Everyday English is plenty; the Indonesian everyday list is tiny, so use the full one.
  if (!pools[lang]) pools[lang] = [...wordSet(lang, lang === "en")].filter((w) => w.length >= MIN_WORD && w.length <= MAX_LEN);
  return pools[lang]!;
}

/** Every row and column, as lists of square indexes. */
const LINES: number[][] = [];
for (let r = 0; r < SIZE; r++) LINES.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
for (let c = 0; c < SIZE; c++) LINES.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));

export interface BotMove {
  tiles: Placed[];
  score: number;
  words: string[];
}

/** Playable moves for a rack, best first. Every word in each move is checked against the dictionary. */
export function botMoves(board: string[], rack: string[], lang: TileLang, rand: () => number, limit = 40): BotMove[] {
  const onBoard = new Set(board.filter(Boolean));
  const empty = onBoard.size === 0;
  const have: Record<string, number> = {};
  for (const l of rack) have[l] = (have[l] ?? 0) + 1;

  // Words we could spell with our rack plus at most a few letters already on the board.
  const words = pool(lang).filter((w) => {
    const need: Record<string, number> = {};
    let missing = 0;
    for (const ch of w) {
      need[ch] = (need[ch] ?? 0) + 1;
      if (need[ch] > (have[ch] ?? 0)) {
        if (empty || !onBoard.has(ch)) return false;
        if (++missing > 3) return false;
      }
    }
    return missing < w.length;
  });
  // Shuffle so the bot doesn't always reach for the same words.
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }

  const found: BotMove[] = [];
  const seen = new Set<string>();
  let tries = 0;
  for (const w of words) {
    for (const line of LINES) {
      for (let s = 0; s + w.length <= SIZE; s++) {
        const before = s > 0 ? board[line[s - 1]] : "";
        const after = s + w.length < SIZE ? board[line[s + w.length]] : "";
        if (before || after) continue;
        const tiles: Placed[] = [];
        let fits = true;
        let usesBoard = false;
        for (let k = 0; k < w.length; k++) {
          const sq = line[s + k];
          if (board[sq]) {
            if (board[sq] !== w[k]) { fits = false; break; }
            usesBoard = true;
          } else tiles.push({ i: sq, l: w[k] });
        }
        if (!fits || tiles.length === 0) continue;
        if (empty && !tiles.some((t) => t.i === CENTER)) continue;
        if (!takeFrom(rack, tiles.map((t) => t.l))) continue;
        if (!empty && !usesBoard && !tiles.some((t) => near(board, t.i))) continue;
        const key = tiles.map((t) => `${t.i}${t.l}`).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        if (++tries > MAX_TRIES) return rank(found, limit);
        const j = judge(board, tiles, lang);
        if (!j.ok || !j.words.every((f) => isWord(f.word, lang))) continue;
        found.push({ tiles, score: j.score, words: j.words.map((f) => f.word) });
      }
    }
    if (found.length >= limit * 4) break;
  }
  return rank(found, limit);
}

function near(board: string[], i: number) {
  const r = Math.floor(i / SIZE), c = i % SIZE;
  return (c > 0 && !!board[i - 1]) || (c < SIZE - 1 && !!board[i + 1]) || (r > 0 && !!board[i - SIZE]) || (r < SIZE - 1 && i + SIZE < CELLS && !!board[i + SIZE]);
}

const rank = (moves: BotMove[], limit: number) => moves.sort((a, b) => b.score - a.score).slice(0, limit);

/** A friendly bot: somewhere in the top half of what it found, so it can be beaten. */
export function pickBotMove(moves: BotMove[], rand: () => number) {
  if (moves.length === 0) return null;
  const half = Math.max(1, Math.ceil(moves.length / 2));
  return moves[Math.floor(rand() * half)];
}
