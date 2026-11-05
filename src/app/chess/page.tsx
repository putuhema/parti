"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { ChessMode } from "../../../convex/lib/chess";
import { BotFace, ModeIcon, modeInfo } from "@/components/chess/bits";
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

      <h2 className="label" style={{ marginTop: 2 }}>Play with friends</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button className="card" style={{ padding: "14px 16px" }} onClick={() => open("classic")} disabled={busy}>
          <ModeIcon mode={modeInfo("classic")} size={52} />
          <span className="col">
            <span className="title">1 vs 1</span>
            <span className="sub">Chess with a friend. Pick a mode and a clock.</span>
          </span>
          <Icon.Chevron />
        </button>
        <button className="card" style={{ padding: "14px 16px" }} onClick={() => open("team")} disabled={busy}>
          <ModeIcon mode={modeInfo("team")} size={52} />
          <span className="col">
            <span className="title">Team vs Bot</span>
            <span className="sub">Two of you share one army against Bolt.</span>
          </span>
          <Icon.Chevron />
        </button>
      </div>

      <h2 className="label" style={{ marginTop: 2 }}>Party modes</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {(["coach", "powerups", "puzzles"] as ChessMode[]).map((id) => {
          const m = modeInfo(id);
          return (
            <button key={id} onClick={() => open(id)} disabled={busy} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 6px", borderRadius: 18, background: m.soft, border: `2px solid ${m.line}`, boxShadow: `0 4px 0 ${m.line}`, cursor: "pointer" }}>
              <ModeIcon mode={m} size={40} />
              <span style={{ fontSize: 15, fontWeight: 900 }}>{m.name}</span>
            </button>
          );
        })}
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
