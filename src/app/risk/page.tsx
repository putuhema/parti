"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ShellPage } from "@/components/shell";
import { GAME_NAME } from "@/components/risk/common";
import { Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

const STEPS: [string, string, string][] = [
  ["🪖", "Deploy & hold continents", "Reinforce your borders every turn. Control a full continent for +2 to +5 bonus armies."],
  ["🎲", "Clash dice or Blitz", "Attack neighboring lands with 3 red dice vs 2 blue defender dice — roll wave-by-wave or hit Blitz!"],
  ["🃏", "Trade cards & fortify", "Capture a territory to earn a Risk card. Trade sets of 3 for huge army surges, then fortify your frontline."],
];

export default function RiskHome() {
  const { me } = useIdentity();
  const router = useRouter();
  const create = useMutation(api.risk.create);
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
      router.push(`/risk/room/${c}`);
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
      <section className="rk-hero">
        <span className="rk-kicker">2–5 COMMANDERS · SOLO VS AI OR FRIENDS</span>
        <h1 className="display" style={{ margin: 0, fontSize: 36, lineHeight: 1 }}>{GAME_NAME}</h1>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, opacity: 0.9 }}>
          Conquer continents, clash dice, rule the globe
        </p>
        <div className="rk-heroart" aria-hidden="true">
          <span>🌍</span>
          <span>⚔️</span>
          <span>🎲</span>
        </div>
      </section>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        {STEPS.map(([icon, title, sub]) => (
          <li key={title} className="rk-stepcard">
            <span className="rk-stepicon" aria-hidden="true">{icon}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 900 }}>{title}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--muted)", lineHeight: 1.32 }}>{sub}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grow" />
      {error && !joinOpen && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      <button className="btn btn-green" disabled={busy} onClick={open}>
        {busy ? "Opening war room…" : "New game"}
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
          <label htmlFor="rkcode" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input
            id="rkcode"
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
            placeholder="RISK"
          />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}
