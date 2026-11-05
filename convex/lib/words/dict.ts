import type { Lang, RoomLang } from "./content";
import { EN_WORDS } from "./en";
import { ID_WORDS } from "./id";

let cache: Record<Lang, Set<string>> | null = null;
function sets() {
  if (!cache) cache = { en: new Set(EN_WORDS.split(" ")), id: new Set(ID_WORDS.split(" ")) };
  return cache;
}

/** Is this a real word in the room's language(s)? */
export function isWord(word: string, lang: RoomLang) {
  const w = word.toLowerCase();
  const s = sets();
  return lang === "mix" ? s.en.has(w) || s.id.has(w) : s[lang].has(w);
}

/** Words that start with `a` and end with `b` (for Letter Pair). */
export function pairWords(a: string, b: string, lang: RoomLang, limit = 50) {
  const out: string[] = [];
  const s = sets();
  const pools = lang === "mix" ? [s.id, s.en] : [s[lang]];
  for (const pool of pools)
    for (const w of pool) {
      if (w.length >= 3 && w[0] === a && w[w.length - 1] === b) out.push(w);
      if (out.length >= limit) return out;
    }
  return out;
}
