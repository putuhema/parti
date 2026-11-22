"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ShellPage } from "@/components/shell";
import { GAME_NAME } from "@/components/island/Play";
import { Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

const STEPS: [string, string][] = [
  ["Roll and hop", "Hop around the island. Blue pays 🪙, red costs, ❓ is pure chaos, 🛍️ sells handy items."],
  ["Grab the gems", "Pass the 💎 Gem Shrine with 20 coins to buy a gem. Then it moves somewhere new!"],
  ["Minigame time", "After every round, everyone plays a minigame for coins. Most gems at the end wins."],
];

export default function IslandHome() {
  const { me } = useIdentity();
  const router = useRouter();
  const create = useMutation(api.island.create);
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
      router.push(`/island/room/${c}`);
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
      <h1 className="display" style={{ margin: "2px 4px 0", fontSize: 30 }}>{GAME_NAME}</h1>

      <section className="bz-hero li-hero" aria-hidden="true">
        <Hero />
      </section>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map(([t, s], i) => (
          <li key={t} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 32, height: 32, borderRadius: 11, background: "var(--plum)", color: "#fff", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 16, fontWeight: 900 }}>{t}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", lineHeight: 1.3 }}>{s}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grow" />
      {error && !joinOpen && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      <button className="btn btn-green" disabled={busy} onClick={open}>New game</button>
      <button className="btn btn-white" onClick={() => { feedback.unlock(); feedback.tap(); setError(""); setJoinOpen(true); }}>Join with code</button>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room">
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Join a room</h2>
          <label htmlFor="icode" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input id="icode" className="input code" autoFocus autoCapitalize="characters" autoComplete="off" maxLength={4} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} placeholder="K7Q2" />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}

/** A little stretch of the island path. */
function Hero() {
  const path = ["+3", "❓", "💎", "−3", "🛍️", "+3"];
  return (
    <div className="li-heroart">
      {path.map((t, i) => <span key={i} className={t === "+3" ? "blue" : t === "−3" ? "red" : t === "❓" ? "event" : t === "🛍️" ? "shop" : "shrine"}>{t}</span>)}
      <i className="tok a">🐵</i><i className="tok b">🎲</i>
    </div>
  );
}
