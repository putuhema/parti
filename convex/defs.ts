import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { isWord } from "./lib/words/dict";

/** What a word means, from Wiktionary. Indonesian words get English meanings. */
export type Def = { pos: string; text: string };

const lang = v.union(v.literal("en"), v.literal("id"));
const MISS_RETRY_MS = 7 * 86_400_000; // look again for words Wiktionary didn't have
const MAX_DEFS = 5;

export const cached = internalQuery({
  args: { lang, word: v.string() },
  handler: async (ctx, { lang, word }) => {
    return await ctx.db.query("wordDefs").withIndex("by_lang_and_word", (q) => q.eq("lang", lang).eq("word", word)).unique();
  },
});

export const save = internalMutation({
  args: { lang, word: v.string(), defs: v.array(v.object({ pos: v.string(), text: v.string() })) },
  handler: async (ctx, { lang, word, defs }) => {
    const old = await ctx.db.query("wordDefs").withIndex("by_lang_and_word", (q) => q.eq("lang", lang).eq("word", word)).unique();
    if (old) await ctx.db.patch(old._id, { defs, fetchedAt: Date.now() });
    else await ctx.db.insert("wordDefs", { lang, word, defs, fetchedAt: Date.now() });
  },
});

/** Drop a cached meaning so the next lookup fetches it fresh (run from the dashboard or CLI). */
export const forget = internalMutation({
  args: { lang, word: v.string() },
  handler: async (ctx, { lang, word }) => {
    const old = await ctx.db.query("wordDefs").withIndex("by_lang_and_word", (q) => q.eq("lang", lang).eq("word", word)).unique();
    if (old) await ctx.db.delete(old._id);
  },
});

/** Turn a Wiktionary definition (HTML) into plain text. Sub-senses become "; "-separated. */
export function plain(html: string) {
  return html
    .replace(/<li[^>]*>/g, "; ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s*;\s*;/g, ";")
    .replace(/:\s*;/g, ":")
    .replace(/\s+/g, " ")
    .replace(/\s+;/g, ";")
    .replace(/[;:]\s*$/, "")
    .trim();
}

type Entry = { partOfSpeech?: string; definitions?: { definition?: string }[] };

/** Pick this language's senses out of Wiktionary's REST reply. */
export function parseDefs(body: unknown, l: "en" | "id"): Def[] {
  if (!body || typeof body !== "object") return [];
  const entries = (body as Record<string, unknown>)[l];
  if (!Array.isArray(entries)) return [];
  const out: Def[] = [];
  for (const e of entries as Entry[]) {
    for (const d of e.definitions ?? []) {
      const text = plain(d.definition ?? "");
      // Sub-senses also come on their own; skip ones already shown inside a longer sense.
      if (text && out.length < MAX_DEFS && !out.some((o) => o.text.includes(text))) out.push({ pos: (e.partOfSpeech ?? "").toLowerCase(), text: text.slice(0, 240) });
    }
  }
  return out;
}

/** "active of makan", "plural of cat": the word this one is a form of, if any. */
export function rootOf(defs: Def[], word: string) {
  for (const d of defs) {
    const m = /^[a-z -]{0,40}\bof ([a-z]+)$/i.exec(d.text);
    if (m && m[1].toLowerCase() !== word) return m[1].toLowerCase();
  }
  return null;
}

/** Fetch from Wiktionary. Null when it couldn't be reached (so we don't cache a miss). */
async function fetchDefs(word: string, l: "en" | "id"): Promise<Def[] | null> {
  try {
    const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`, {
      headers: { "User-Agent": "pums-party/1.0 (word game)", Accept: "application/json" },
    });
    if (res.status === 404) return [];
    if (!res.ok) return null;
    return parseDefs(await res.json(), l);
  } catch {
    return null;
  }
}

/** The meaning of a word from our word list. Cached; fetched from Wiktionary the first time. */
export const define = action({
  args: { word: v.string(), lang },
  handler: async (ctx, args): Promise<{ word: string; defs: Def[] }> => {
    if (!(await ctx.auth.getUserIdentity())) throw new ConvexError("Not signed in");
    const word = args.word.trim().toLowerCase();
    if (!/^[a-z]{3,20}$/.test(word) || !isWord(word, args.lang)) throw new ConvexError("Not a word we know");
    const hit = await ctx.runQuery(internal.defs.cached, { lang: args.lang, word });
    if (hit && (hit.defs.length > 0 || Date.now() - hit.fetchedAt < MISS_RETRY_MS)) return { word, defs: hit.defs };
    const defs = await fetchDefs(word, args.lang);
    if (defs === null) return { word, defs: hit?.defs ?? [] }; // try again next time
    // A form of another word ("active of makan"): add what the root means too.
    const root = rootOf(defs, word);
    if (root && isWord(root, args.lang)) {
      const more = (await fetchDefs(root, args.lang)) ?? [];
      defs.push(...more.slice(0, 3).map((d) => ({ pos: `${root.toUpperCase()}${d.pos ? ", " + d.pos : ""}:`, text: d.text })));
    }
    await ctx.runMutation(internal.defs.save, { lang: args.lang, word, defs });
    return { word, defs };
  },
});
