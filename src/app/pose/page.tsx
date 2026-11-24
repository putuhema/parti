"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { POSES } from "../../../convex/lib/pose/poses";
import { PoseFigure } from "@/components/pose/PoseFigure";
import { GAME_NAME } from "@/components/pose/common";
import { ShellPage } from "@/components/shell";
import { Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

const STEPS: [string, string, string][] = [
  ["🫶", "Get a surprise pose", "Each round gives you a cute, silly, or active silhouette to match right on your camera."],
  ["📸", "Take turns striking it", "Align with the live ghost guide — AI scores your match in real time and snaps your polaroid!"],
  ["💞", "Rate & save your strip", "React to your partner's snaps, compare side-by-side, and download a shared photobooth strip."],
];

export default function PoseHome() {
  const { me } = useIdentity();
  const router = useRouter();
  const create = useMutation(api.pose.create);
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
      router.push(`/pose/room/${c}`);
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
          <span className="stat-pill" style={{ color: "var(--tangerine-ink)" }} aria-label={`${me.streak} day streak`}>
            <Icon.Flame size={20} />{me.streak}
          </span>
          <span className="stat-pill" style={{ color: "var(--sun-ink)" }} aria-label={`${me.wins} wins`}>
            <Icon.Trophy />{me.wins}
          </span>
        </div>
      }
    >
      <section className="ps-hero">
        <span className="ps-kicker">LDR COUPLES &amp; FRIENDS · LIVE CAMERA</span>
        <h1 className="display" style={{ margin: 0, fontSize: 36, lineHeight: 1 }}>{GAME_NAME}</h1>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, opacity: 0.92 }}>
          Match the pose on camera, hype your partner &amp; build a photobooth strip
        </p>
        <div className="ps-heroart" aria-hidden="true">
          <div className="ps-herocard" style={{ transform: "rotate(-7deg)" }}>
            <PoseFigure pose={POSES[0]} variant="mini" />
            <span>🫶</span>
          </div>
          <span className="ps-heroheart">📸</span>
          <div className="ps-herocard" style={{ transform: "rotate(7deg)" }}>
            <PoseFigure pose={POSES[2]} variant="mini" />
            <span>✌️</span>
          </div>
        </div>
      </section>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        {STEPS.map(([icon, title, sub]) => (
          <li key={title} className="ps-stepcard">
            <span className="ps-stepicon" aria-hidden="true">{icon}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 900 }}>{title}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--muted)", lineHeight: 1.32 }}>{sub}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grow" />
      {error && !joinOpen && (
        <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>
          {error}
        </p>
      )}
      <button className="btn btn-green" disabled={busy} onClick={open}>
        {busy ? "Opening photobooth…" : "New game"}
      </button>
      <button
        className="btn btn-white"
        onClick={() => {
          feedback.unlock();
          feedback.tap();
          setError("");
          setJoinOpen(true);
        }}
      >
        Join with code
      </button>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room">
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 24, textAlign: "center" }}>Join a room</h2>
          <label htmlFor="pscode" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input
            id="pscode"
            className="input code"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={4}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              setError("");
            }}
            placeholder="K7Q2"
          />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}
