"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { ChessMode } from "../../../convex/lib/chess";
import { BotFace, MODES, ModeIcon } from "@/components/chess/bits";
import { GameSwitch, Icon, Mascot, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { LESSONS } from "@/lib/lessons";

export default function ChessHome() {
  const { token, me } = useIdentity();
  const router = useRouter();
  const create = useMutation(api.chess.create);
  const joinAny = useMutation(api.chess.joinAny);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const done = LESSONS.filter((l) => (me.chessLessons[l.id] ?? 0) > 0).length;
  const next = LESSONS.find((l) => !(me.chessLessons[l.id] > 0));
  const unit = next?.unit ?? 2;
  const inUnit = LESSONS.filter((l) => l.unit === unit);
  const unitDone = inUnit.filter((l) => me.chessLessons[l.id] > 0).length;

  async function open(mode: ChessMode) {
    if (busy) return;
    feedback.unlock();
    feedback.tap();
    setBusy(true);
    try {
      const c = await create({ token, mode });
      router.push(`/chess/room/${c}`);
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

      <GameSwitch current="chess" />

      <Link href="/chess/learn" onClick={() => feedback.tap()} style={{ borderRadius: 22, background: "#D7FFB8", border: "2px solid #A5ED6E", boxShadow: "0 5px 0 #A5ED6E", padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mascot size={58} className="bob" />
          <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".08em", color: "var(--lime-dark)" }}>UNIT {unit} · {unit === 1 ? "MEET THE PIECES" : "WIN THE GAME"}</span>
            <span style={{ fontSize: 21, fontWeight: 900, color: "#2F6E00" }}>{done === 0 ? "Learn chess" : next ? "Keep learning" : "All lessons done!"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ flex: 1, height: 12, borderRadius: 6, background: "#fff", overflow: "hidden" }}>
                <span style={{ display: "block", width: `${(unitDone / inUnit.length) * 100}%`, height: "100%", borderRadius: 6, background: "var(--lime)", transition: "width 400ms var(--spring)" }} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#2F6E00" }}>{unitDone} / {inUnit.length}</span>
            </span>
          </span>
        </span>
        <span className="btn btn-green" style={{ minHeight: 46, fontSize: 17 }}>{next ? `${done ? "Continue" : "Start"} · ${next.name}` : "Practice again"}</span>
      </Link>

      <h2 className="label" style={{ marginTop: 2 }}>Solo challenges</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <Link href="/chess/rush" onClick={() => { feedback.unlock(); feedback.tap(); }} style={{ borderRadius: 18, background: "#FFF0DB", border: "2px solid #FFC880", boxShadow: "0 4px 0 #FFC880", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#E08600" }}><Icon.Flame size={24} /><span style={{ fontSize: 16, fontWeight: 900, color: "#9A5200" }}>Puzzle Rush</span></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#9A5200", lineHeight: 1.25 }}>Endless puzzles. Build your streak.</span>
        </Link>
        <Link href="/chess/journey" onClick={() => { feedback.unlock(); feedback.tap(); }} style={{ borderRadius: 18, background: "#F3E2FF", border: "2px solid #DDB3FF", boxShadow: "0 4px 0 #DDB3FF", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon.Crown size={24} /><span style={{ fontSize: 16, fontWeight: 900, color: "#8A4FB5" }}>Journey</span></span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#8A4FB5", lineHeight: 1.25 }}>Roguelike run with power-ups.</span>
        </Link>
      </div>

      <h2 className="label" style={{ marginTop: 2 }}>Play with a friend</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {MODES.map((m) => (
          <button key={m.id} className="card" disabled={busy} onClick={() => open(m.id)} style={{ padding: "9px 10px", gap: 8, minHeight: 64, borderRadius: 18 }}>
            <ModeIcon mode={m} size={34} />
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.15 }}>{m.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.short}</span>
            </span>
          </button>
        ))}
      </div>

      <Link href="/chess/bot" className="card" style={{ padding: "12px 16px" }} onClick={() => feedback.tap()}>
        <BotFace size={40} />
        <span style={{ flex: 1, fontSize: 17, fontWeight: 800 }}>Practice vs Bolt</span>
        <Icon.Chevron />
      </Link>

      <div className="grow" />
      <button className="btn btn-white" onClick={() => { feedback.unlock(); feedback.tap(); setJoinOpen(true); }}>Join with code</button>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room">
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Join a room</h2>
          <label htmlFor="ccode" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input id="ccode" className="input code" autoFocus autoCapitalize="characters" autoComplete="off" maxLength={4} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} placeholder="K7Q2" />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </main>
  );
}
