"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ShellPage } from "@/components/shell";
import { Avatar, Icon, ME, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

export default function MePage() {
  const { token, me } = useIdentity();
  const rename = useMutation(api.players.rename);
  const [muted, setMuted] = useState(feedback.isMuted());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.name);
  const [error, setError] = useState("");

  const stats = [
    { label: "Day streak", value: me.streak, icon: <Icon.Flame size={22} />, color: "var(--tangerine-ink)" },
    { label: "Wins", value: me.wins, icon: <Icon.Trophy size={22} />, color: "var(--sun-ink)" },
    { label: "League", value: me.tierName, icon: <Icon.Crown size={22} />, color: "var(--grape-ink)" },
    { label: "XP this week", value: me.weekXp.toLocaleString(), icon: <Icon.Bolt size={20} color="#1899D6" />, color: "var(--sky-edge)" },
  ];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await rename({ token, name });
      feedback.correct();
      setEditing(false);
    } catch (err) {
      feedback.wrong();
      setError(errorText(err, "Couldn't save"));
    }
  }

  return (
    <ShellPage tab="me">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 8 }}>
        <Avatar name={me.name} paint={ME} size={92} />
        <h1 className="display" style={{ margin: 0, fontSize: 32 }}>{me.name}</h1>
        <button className="btn btn-sm btn-white" style={{ color: "var(--plum)" }} onClick={() => { feedback.tap(); setName(me.name); setEditing(true); }}>Change name</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px", borderRadius: 22, background: "#fff", boxShadow: "0 3px 0 var(--cream-3)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: s.color }}>{s.icon}<span style={{ fontSize: 24, fontWeight: 900 }}>{s.value}</span></span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--plum-soft)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      <Link href="/leaderboard" className="pill-btn" onClick={() => feedback.tap()} style={{ fontSize: 18 }}>
        <Icon.Trophy /> Leaderboard
      </Link>
      <button
        className="pill-btn"
        style={{ fontSize: 18 }}
        aria-pressed={!muted}
        onClick={() => { feedback.setMuted(!muted); setMuted(!muted); if (muted) feedback.tap(); }}
      >
        <Icon.Sound muted={muted} /> {muted ? "Sound off" : "Sound on"}
      </button>

      <Sheet open={editing} onClose={() => setEditing(false)} label="Change your name">
        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Your name</h2>
          <label htmlFor="myname" className="label" style={{ textAlign: "center" }}>What should friends call you?</label>
          <input id="myname" className="input" autoFocus autoComplete="nickname" maxLength={16} value={name} onChange={(e) => { setName(e.target.value); setError(""); }} style={{ fontSize: 20 }} />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={!name.trim()}>Save</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}
