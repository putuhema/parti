"use client";

import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Def } from "../../../convex/defs";
import type { TileLang } from "../../../convex/lib/tiles/rules";
import { Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";

type Played = { w: string; by: string; score: number };

/** Meanings already looked up on this phone, so reopening a word is instant. */
const known = new Map<string, Def[]>();

/** Every word made this game, newest first. Tap one to see what it means. */
export function WordBook({ open, onClose, played, lang, nameOf, focus }: { open: boolean; onClose: () => void; played: Played[]; lang: TileLang; nameOf: (id?: string | null) => string; focus?: string | null }) {
  // One row per word; the same word played twice shows once, with its latest play.
  const rows: Played[] = [];
  const seen = new Set<string>();
  for (const p of [...played].reverse()) {
    if (seen.has(p.w)) continue;
    seen.add(p.w);
    rows.push(p);
  }
  return (
    <Sheet open={open} onClose={onClose} label="Words played">
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Words played</h2>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
        Tap a word to see what it means.{lang === "id" ? " Meanings are in English." : ""}
      </p>
      {rows.length === 0 ? (
        <p style={{ margin: 0, padding: "18px 12px", borderRadius: 18, background: "var(--cream-2)", fontSize: 15, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center" }}>No words yet.</p>
      ) : (
        <div className="list" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {open && rows.map((p) => <WordRow key={p.w} p={p} lang={lang} nameOf={nameOf} startOpen={p.w === focus} />)}
        </div>
      )}
    </Sheet>
  );
}

function WordRow({ p, lang, nameOf, startOpen }: { p: Played; lang: TileLang; nameOf: (id?: string | null) => string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="tt-wordrow">
      <button type="button" className="tt-wordbtn" aria-expanded={open} onClick={() => { feedback.tap(); setOpen(!open); }}>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", textAlign: "left" }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: ".04em" }}>{p.w.toUpperCase()}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{nameOf(p.by)} · +{p.score}</span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 18, color: "var(--plum-soft)", transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms" }}>›</span>
      </button>
      {open && <Meaning word={p.w} lang={lang} />}
    </div>
  );
}

/** Looks the word up (once) and shows its meanings. */
export function Meaning({ word, lang }: { word: string; lang: TileLang }) {
  const define = useAction(api.defs.define);
  const key = `${lang}:${word}`;
  const [defs, setDefs] = useState<Def[] | null>(() => known.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (known.has(key)) return;
    let live = true;
    define({ word, lang })
      .then((r) => { known.set(key, r.defs); if (live) setDefs(r.defs); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [key, word, lang, define]);

  const more = lang === "id" ? `https://kbbi.kemdikbud.go.id/entri/${word}` : `https://en.wiktionary.org/wiki/${word}`;
  if (failed) return <p className="tt-meaning muted">Couldn&apos;t look that up right now.</p>;
  if (!defs) return <p className="tt-meaning muted wait">Looking it up…</p>;
  return (
    <div className="tt-meaning">
      {defs.length === 0 ? (
        <p style={{ margin: 0, color: "var(--muted)" }}>No meaning found for this one, but it&apos;s in our word list.</p>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          {defs.map((d, k) => (
            <li key={k}>{d.pos && <i style={{ color: "var(--plum-soft)" }}>{d.pos} </i>}{d.text}</li>
          ))}
        </ol>
      )}
      <a href={more} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 900, color: "var(--sky-btn)" }}>
        {lang === "id" ? "More in KBBI ↗" : "More on Wiktionary ↗"}
      </a>
    </div>
  );
}
