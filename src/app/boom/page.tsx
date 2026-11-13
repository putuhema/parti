"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ShellPage } from "@/components/shell";
import { GROUPS, SPACES, priceOf } from "../../../convex/lib/boom/rules";
import { GAME_NAME, short } from "@/components/boom/common";
import { Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

const STEPS: [string, string][] = [
  ["Roll and island-hop", "Two dice carry you from Papua to Jakarta. Pass Start for Rp200rb gajian, and doubles roll again."],
  ["Buy and build", "Buy the towns and transport you land on. Land on your own town to build a warung, ruko, then hotel."],
  ["Collect rent", "Anyone who stops on your spaces pays you. The richest juragan after the last round wins."],
];

export default function BoomHome() {
  const { me } = useIdentity();
  const router = useRouter();
  const create = useMutation(api.boom.create);
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
      router.push(`/boom/room/${c}`);
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

      <section className="bz-hero" aria-hidden="true">
        <MiniBoard />
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
          <label htmlFor="bcode" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input id="bcode" className="input code" autoFocus autoCapitalize="characters" autoComplete="off" maxLength={4} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} placeholder="K7Q2" />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}

/** A strip of the board for the intro: towns in their island colours. */
function MiniBoard() {
  const lots = [0, 4, 9, 15, 25, 33];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
      {lots.map((i, k) => {
        const s = SPACES[i];
        return (
          <span key={i} style={{ position: "relative", width: 44, height: 56, borderRadius: 10, background: "#fff", boxShadow: "0 3px 0 var(--cream-3)", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 5, fontSize: 11, fontWeight: 900, color: "var(--plum)" }}>
            {s.kind === "lot" && <span style={{ position: "absolute", inset: "0 0 auto 0", height: 13, background: GROUPS[s.group].color }} />}
            <span style={{ fontSize: 20, lineHeight: 1 }}>{s.kind === "start" ? "🇮🇩" : s.kind === "hub" ? s.icon : k === 2 ? "🛖" : k === 5 ? "🏨" : ""}</span>
            {s.kind === "start" ? "START" : short(priceOf(i))}
          </span>
        );
      })}
    </div>
  );
}
