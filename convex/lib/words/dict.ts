import type { Lang, RoomLang } from "./content";
import { EN_WORDS } from "./en";
import { EN_COMMON } from "./enCommon";
import { ID_WORDS } from "./id";
import { ID_COMMON } from "./idCommon";

type Sets = Record<Lang, Set<string>>;
let cache: { all: Sets; common: Sets } | null = null;
function sets() {
  if (!cache)
    cache = {
      all: { en: new Set(EN_WORDS.split(" ")), id: new Set(ID_WORDS.split(" ")) },
      common: { en: new Set(EN_COMMON.split(" ")), id: new Set(ID_COMMON.split(" ")) },
    };
  return cache;
}
const langs = (lang: RoomLang): Lang[] => (lang === "mix" ? ["id", "en"] : [lang]);

/** Is this a real word in the room's language(s)? */
export function isWord(word: string, lang: RoomLang) {
  const w = word.toLowerCase();
  const s = sets().all;
  return langs(lang).some((l) => s[l].has(w));
}

function collect(pools: Set<string>[], a: string, b: string, limit: number) {
  const out: string[] = [];
  for (const pool of pools)
    for (const w of pool) {
      if (w.length >= 3 && w[0] === a && w[w.length - 1] === b) out.push(w);
      if (out.length >= limit) return out;
    }
  return out;
}

/** Words that start with `a` and end with `b` (for Letter Pair). */
export function pairWords(a: string, b: string, lang: RoomLang, limit = 50) {
  const s = sets().all;
  return collect(langs(lang).map((l) => s[l]), a, b, limit);
}

/** Everyday words that fit, for showing as examples. Falls back to the full list. */
export function pairExamples(a: string, b: string, lang: RoomLang, limit = 600) {
  const s = sets().common;
  const common = collect(langs(lang).map((l) => s[l]), a, b, limit);
  return common.length >= 4 ? common : pairWords(a, b, lang, limit);
}
