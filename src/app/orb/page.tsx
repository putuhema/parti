"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ShellPage } from "@/components/shell";
import { OrbGlyph, Domino } from "@/components/orb/Play";
import { Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

const STEPS: [string, string][] = [
  ["Match the pips", "Cast a domino onto either end of the chain. Its touching half must match."],
  ["Doubles grab orbs", "Cast a double to claim an orb. Hold 3 orbs and you win."],
  ["Sevens hex", "Halves that add to 7 make the next wizard draw. Empty your hand to win outright!"],
];

export default function OrbHome() {
  const { me } = useIdentity();
  const router = useRouter();
  const create = useMutation(api.orb.create);
  const joinAny = useMutation(api.chess.joinAny);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function open() {
    if (busy) return;
    feedback.unlock();
    feedback.tap();
    setBusy(true);
    try {
      const c = await create({});
      router.push(`/orb/room/${c}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const path = await joinAny({ code: code.trim().toUpperCase() });
      feedback.correct();
      router.push(path);
    } catch (err) {
      feedback.wrong();
      setError(errorText(err, "Couldn't join"));
    }
  }

  return (
    <ShellPage
      tab="games" gap={14}
      right={
        <div style={{ display: "flex", gap: 8 }}>
          <span className="stat-pill" style={{ color: "var(--tangerine-ink)" }} aria-label={`${me.streak} day streak`}><Icon.Flame size={20} />{me.streak}</span>
          <span className="stat-pill" style={{ color: "var(--sun-ink)" }} aria-label={`${me.wins} wins`}><Icon.Trophy />{me.wins}</span>
        </div>
      }
    >
      <section className="ow-hero" aria-hidden="true">
        <span className="ow-wordmark"><OrbGlyph size={52} /><span>rbwick</span></span>
        <span className="ow-tag">A domino duel for wizards</span>
        <span className="ow-herotiles">
          <Domino t={[5, 6]} tilt={-6} />
          <Domino t={[3, 1]} tilt={8} ink="lagoon" />
          <Domino t={[4, 4]} tilt={-4} ink="moss" />
        </span>
      </section>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map(([t, s], i) => (
          <li key={t} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 32, height: 32, borderRadius: 11, background: "#231B1A", color: "#F4C64E", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 16, fontWeight: 900 }}>{t}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", lineHeight: 1.3 }}>{s}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grow" />
      {error && !joinOpen && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      <button className="btn btn-green" disabled={busy} onClick={open}>New duel</button>
      <button className="btn btn-white" onClick={() => { feedback.unlock(); feedback.tap(); setError(""); setJoinOpen(true); }}>Join with code</button>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room">
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Join a room</h2>
          <label htmlFor="ocode" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input id="ocode" className="input code" autoFocus autoCapitalize="characters" autoComplete="off" maxLength={4} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} placeholder="K7Q2" />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}
