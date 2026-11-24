"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ShellPage } from "@/components/shell";
import { Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

const STEPS: [string, string, string][] = [
  ["😜", "Get a goofy emoji", "18 expressive emojis — winks, pufferfish cheeks, puppy eyes, side-eye & more."],
  ["🤖", "Live face-AI match", "Real-time facial expression tracking scores your face and auto-snaps when you nail it!"],
  ["💞", "Perfect in bed", "No standing up required — great for late-night LDR calls & hilarious polaroids."],
];

export default function EmFaceHome() {
  const { me } = useIdentity();
  const router = useRouter();
  const create = useMutation(api.emface.create);
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
      router.push(`/emface/room/${c}`);
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
      tab="games"
      gap={14}
      right={
        <div style={{ display: "flex", gap: 8 }}>
          <span className="stat-pill" style={{ color: "var(--tangerine-ink)" }}><Icon.Flame size={20} />{me.streak}</span>
          <span className="stat-pill" style={{ color: "var(--sun-ink)" }}><Icon.Trophy />{me.wins}</span>
        </div>
      }
    >
      <section className="ef-hero">
        <span className="ps-kicker">LIVE FACE AI · LDR COUPLES &amp; FRIENDS</span>
        <h1 className="display" style={{ margin: 0, fontSize: 34, lineHeight: 1.05 }}>Emoji Face Match</h1>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, opacity: 0.92 }}>
          Pull off ridiculous emoji faces on camera &amp; rate your partner!
        </p>
        <div style={{ display: "flex", gap: 12, fontSize: 38, marginTop: 4 }} aria-hidden="true">
          <span>😉</span><span>🐡</span><span>🥺</span><span>😱</span>
        </div>
      </section>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        {STEPS.map(([icon, title, sub]) => (
          <li key={title} className="ps-stepcard">
            <span className="ps-stepicon" style={{ background: "var(--sun-soft)" }} aria-hidden="true">{icon}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 900 }}>{title}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--muted)", lineHeight: 1.32 }}>{sub}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grow" />
      {error && !joinOpen && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      <button className="btn btn-green" disabled={busy} onClick={open}>{busy ? "Opening…" : "New game"}</button>
      <button className="btn btn-white" onClick={() => { feedback.unlock(); feedback.tap(); setJoinOpen(true); }}>Join with code</button>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room">
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 24, textAlign: "center" }}>Join a room</h2>
          <input className="input code" autoFocus maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="K7Q2" />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}
