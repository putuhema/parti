// Jurus Rangkai: named combos. Play certain cards one right after another inside a single combo
// and the last one is powered up, with its own name, banner and sound.
import { drawCards, say, type Fight } from "./rules";

/** One link in the sequence: a card id, any card of a type ("type:Serang"), or your free step ("step"). */
export type Link = string;

export interface Rangkai {
  id: string;
  name: string;
  /** What it does, in one line (shown on the hint and in the Card Collection). */
  text: string;
  /** The cards, in order. The bonus lands on the last one. */
  seq: Link[];
  color: string;
  /** Runs just before the last card plays. */
  before?: (s: Fight) => void;
  /** Runs just after the last card plays. */
  after?: (s: Fight) => void;
}

const surge = (n: number) => (s: Fight) => { s.surge = (s.surge ?? 0) + n; };

export const RANGKAI: Rangkai[] = [
  {
    id: "terkam2", name: "Terkam Ganda", text: "Terkam, then Terkam: the second one hits +2 and gives 2 Block",
    seq: ["terkam", "terkam"], color: "#FF9600", before: surge(2), after: (s) => { s.hero.block += 2; },
  },
  {
    id: "jebakan", name: "Jebakan Passant", text: "En Passant, then any attack: it hits +2 and refunds 1 Tenaga",
    seq: ["passant", "type:Serang"], color: "#FF4B4B", before: surge(2), after: (s) => { s.tenaga++; },
  },
  {
    id: "tendang3", name: "Tendangan Beruntun", text: "Tendang three times in a row: the third hits +3",
    seq: ["tendang", "tendang", "tendang"], color: "#FF4B4B", before: surge(3),
  },
  {
    id: "kuda", name: "Serbuan Kuda", text: "Langkah Kuda, then any attack: it hits +1",
    seq: ["kuda", "type:Serang"], color: "#1CB0F6", before: surge(1),
  },
  {
    id: "banting", name: "Tarik Banting", text: "Tarik, then Bantingan: the throw hits +2",
    seq: ["tarik", "bantingan"], color: "#FF9600", before: surge(2),
  },
  {
    id: "sate", name: "Paku Sate", text: "Paku, then Tusuk Sate: the skewer hits +3",
    seq: ["paku", "tusuk"], color: "#D9489F", before: surge(3),
  },
  {
    id: "skakmat", name: "Skakmat Silat", text: "Skak!, then any attack: it hits +3",
    seq: ["skak", "type:Serang"], color: "#3C3C3C", before: surge(3),
  },
  {
    id: "rokade", name: "Rokade Kilat", text: "Rokade, then any attack: it hits +1 and you draw 1",
    seq: ["rokade", "type:Serang"], color: "#1CB0F6", before: surge(1), after: (s) => drawCards(s, 1),
  },
  {
    id: "bangau", name: "Bayang Bangau", text: "Elakan, then Tangkisan: your dodge and kick-back can't fail. +2 Block",
    seq: ["elakan", "tangkisan"], color: "#58CC02", after: (s) => { s.luck = { ...s.luck!, sure: true }; s.hero.block += 2; },
  },
  {
    id: "benteng", name: "Benteng Tiga Lapis", text: "Tangkis three times in a row: +4 more Block",
    seq: ["tangkis", "tangkis", "tangkis"], color: "#58CC02", after: (s) => { s.hero.block += 4; },
  },
  {
    id: "asap", name: "Serangan Bayangan", text: "Bom Asap, then Kerambit: the knife hits +3",
    seq: ["asap", "kerambit"], color: "#6F6F6F", before: surge(3),
  },
  {
    id: "langkah", name: "Langkah Harimau", text: "Your free step, then Terkam: it hits +1",
    seq: ["step", "terkam"], color: "#FF9600", before: surge(1),
  },
];

const matches = (link: Link, token: string, typeOf: (id: string) => string | undefined) =>
  link.startsWith("type:") ? typeOf(token) === link.slice(5) : link === token;

/** The named combo that `next` would finish, given what's been played so far in this combo (longest wins). */
export function rangkaiFor(chain: string[], next: string, typeOf: (id: string) => string | undefined): Rangkai | null {
  const all = [...chain, next];
  let best: Rangkai | null = null;
  for (const r of RANGKAI) {
    if (r.seq.length > all.length) continue;
    const tail = all.slice(all.length - r.seq.length);
    if (r.seq.every((l, i) => matches(l, tail[i], typeOf)) && (!best || r.seq.length > best.seq.length)) best = r;
  }
  return best;
}

/** A named combo that playing `next` now would *start* (or continue), when the rest of it is in your hand. */
export function rangkaiStarts(chain: string[], next: string, rest: string[], typeOf: (id: string) => string | undefined): Rangkai | null {
  const all = [...chain, next];
  for (const r of RANGKAI) {
    // How much of the start of r.seq the end of `all` already matches (at least `next`, never the whole thing).
    for (let k = Math.min(r.seq.length - 1, all.length); k >= 1; k--) {
      const tail = all.slice(all.length - k);
      if (!r.seq.slice(0, k).every((l, i) => matches(l, tail[i], typeOf))) continue;
      const pool = [...rest];
      const ok = r.seq.slice(k).every((l) => {
        if (l === "step") return true;
        const j = pool.findIndex((id) => matches(l, id, typeOf));
        if (j < 0) return false;
        pool.splice(j, 1);
        return true;
      });
      if (ok) return r;
    }
  }
  return null;
}

/** Announce a named combo (log + remember it for the banner). */
export function announce(s: Fight, r: Rangkai) {
  (s.rangkai ??= []).push(r.id);
  say(s, `Jurus Rangkai: ${r.name}!`, "good");
}

export const rangkaiById = (id: string) => RANGKAI.find((r) => r.id === id);
