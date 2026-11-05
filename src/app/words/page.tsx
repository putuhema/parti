"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ModeChip, WORD_MODES, type WMode } from "@/components/words/common";
import { GameSwitch, Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

type Lang = "en" | "id" | "mix";
const LANG_KEY = "parti:words-lang";
function readLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "id" || v === "mix" ? v : "en";
  } catch {
    return "en";
  }
}

export default function WordsHome() {
  const { token, me } = useIdentity();
  const router = useRouter();
  const create = useMutation(api.words.create);
  const joinAny = useMutation(api.chess.joinAny);
  const [lang, setLang] = useState<Lang>(() => (typeof window === "undefined" ? "en" : readLang()));
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const id = lang === "id";

  function pickLang(l: Lang) {
    feedback.tap();
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch {}
  }

  async function open(mode: WMode) {
    if (busy) return;
    feedback.unlock();
    feedback.tap();
    setBusy(true);
    try {
      const c = await create({ token, mode, lang });
      router.push(`/words/room/${c}`);
    } finally {
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const path = await joinAny({ token, code: code.trim().toUpperCase() });
      feedback.correct();
      router.push(path);
    } catch (err) {
      feedback.wrong();
      setError(errorText(err, "Couldn't join"));
    }
  }

  return (
    <main className="screen" style={{ gap: 14 }}>
      <header className="topbar" style={{ justifyContent: "space-between" }}>
        <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.01em", color: "var(--lime-dark)" }}>Parti</span>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="stat-pill" style={{ color: "var(--tangerine-ink)" }} aria-label={`${me.streak} day streak`}><Icon.Flame size={20} />{me.streak}</span>
          <span className="stat-pill" style={{ color: "var(--sun-ink)" }} aria-label={`${me.wins} wins`}><Icon.Trophy />{me.wins}</span>
        </div>
      </header>

      <GameSwitch current="words" />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="label" style={{ flexShrink: 0 }}>{id ? "Bahasa" : "Language"}</span>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, background: "#F0F0F0", borderRadius: 14, padding: 4 }} role="group" aria-label="Word language">
          {([["en", "English"], ["id", "Indonesia"], ["mix", "Both"]] as const).map(([l, label]) => (
            <button key={l} aria-pressed={lang === l} onClick={() => pickLang(l)} style={{ minHeight: 40, borderRadius: 11, border: 0, cursor: "pointer", fontSize: 15, fontWeight: 900, color: lang === l ? "var(--ink)" : "var(--muted)", background: lang === l ? "#fff" : "transparent", boxShadow: lang === l ? "0 3px 0 var(--line)" : "none" }}>{label}</button>
          ))}
        </div>
      </div>

      <h2 className="label" style={{ marginTop: 2 }}>{id ? "Main bareng teman" : "Play with a friend"}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {WORD_MODES.map((m) => {
          const [name, sub] = id ? m.id_ : m.en;
          return (
            <button key={m.id} className="card" disabled={busy} onClick={() => open(m.id)} style={{ padding: "9px 10px", gap: 8, minHeight: 64, borderRadius: 18 }}>
              <ModeChip mode={m} size={34} />
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.15 }}>{name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grow" />
      <button className="btn btn-white" onClick={() => { feedback.unlock(); feedback.tap(); setJoinOpen(true); }}>{id ? "Gabung dengan kode" : "Join with code"}</button>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room">
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Join a room</h2>
          <label htmlFor="wcode" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input id="wcode" className="input code" autoFocus autoCapitalize="characters" autoComplete="off" maxLength={4} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} placeholder="K7Q2" />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </main>
  );
}
