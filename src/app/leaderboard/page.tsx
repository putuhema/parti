"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Avatar, Icon, Mascot, TopBar, formatTime, paintFor } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { useIdentity } from "@/lib/identity";

type Period = "today" | "week" | "league";
type Scope = "friends" | "world";

const PODIUM = {
  1: { face: "#FFC800", edge: "#E5A800", h: 96, ink: "#5C4200" },
  2: { face: "#D9DEE3", edge: "#B9C0C7", h: 72, ink: "#3C3C3C" },
  3: { face: "#F0B98A", edge: "#D4935E", h: 56, ink: "#5A3110" },
} as const;

export default function LeaderboardPage() {
  const { token, me } = useIdentity();
  const [period, setPeriod] = useState<Period>("today");
  const [scope, setScope] = useState<Scope>("friends");
  const data = useQuery(api.leaderboard.get, { token, period, scope });
  const now = useNow(60_000);
  const league = period === "league";

  const fmt = (v: number) => {
    if (!data) return "";
    if (data.kind === "time") return v < 0 ? "Not yet" : formatTime(v);
    if (data.kind === "xp") return `${v.toLocaleString()} XP`;
    return v.toLocaleString();
  };

  const rows = data?.rows ?? [];
  const ranked = data?.kind === "time" ? rows.filter((r) => r.value >= 0) : rows;
  const showPodium = !league && ranked.length >= 3;
  const podium = showPodium ? [ranked[1], ranked[0], ranked[2]] : [];
  const rest = showPodium ? rows.slice(3) : rows;
  const offset = showPodium ? 3 : 0;
  const daysLeft = data && "nextResetAt" in data && data.nextResetAt ? Math.max(1, Math.ceil((data.nextResetAt - now) / 86_400_000)) : 0;

  return (
    <main className="screen tight">
      <TopBar back="/" title="Leaderboard" />

      <nav style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }} aria-label="Leaderboard period">
        {([["today", "Today"], ["week", "This week"], ["league", "League"]] as const).map(([id, label]) => (
          <button key={id} className="seg solid" aria-pressed={period === id} onClick={() => { feedback.tap(); setPeriod(id); }}>{label}</button>
        ))}
      </nav>

      {!league && (
        <div style={{ display: "flex", gap: 4, background: "var(--mist)", borderRadius: 14, padding: 4, alignSelf: "center" }}>
          {([["friends", "Friends"], ["world", "Worldwide"]] as const).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={scope === id}
              onClick={() => { feedback.tap(); setScope(id); }}
              style={{ minHeight: 36, padding: "0 16px", borderRadius: 10, border: 0, fontSize: 14, fontWeight: 900, cursor: "pointer", color: scope === id ? "var(--ink)" : "var(--muted)", background: scope === id ? "#fff" : "transparent", boxShadow: scope === id ? "0 2px 0 var(--line)" : "none" }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {league && data && "tierName" in data && (
        <section style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 20, background: "var(--sun-soft)", border: "2px solid var(--sun-line)" }}>
          <Icon.Shield />
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 900 }}>{data.tierName} League</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--sun-ink)" }}>
              {data.canPromote ? "Top 3 move up" : "Top of the mountain"} · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
            </span>
          </span>
        </section>
      )}

      {!data ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Mascot size={70} className="bob" /></div>
      ) : rows.length === 0 ? (
        <Empty period={period} />
      ) : (
        <>
          {showPodium && (
            <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, alignItems: "end", paddingTop: 8 }} aria-label="Top 3">
              {podium.map((r, k) => {
                const place = (k === 1 ? 1 : k === 0 ? 2 : 3) as 1 | 2 | 3;
                const s = PODIUM[place];
                return (
                  <div key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {place === 1 && <span className="bob"><Icon.Crown /></span>}
                    <Avatar name={r.name} paint={paintFor(r.id, r.isMe)} size={place === 1 ? 60 : 50} style={r.isMe ? { outline: "3px solid var(--sky-line)", outlineOffset: 2 } : undefined} />
                    <span style={{ fontSize: 15, fontWeight: 900, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.isMe ? "You" : r.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>{fmt(r.value)}</span>
                    <div className="grow-up" style={{ alignSelf: "stretch", height: s.h, borderRadius: "14px 14px 6px 6px", background: s.face, boxShadow: `inset 0 -6px 0 ${s.edge}`, display: "flex", justifyContent: "center", paddingTop: 8, fontSize: 28, fontWeight: 900, color: s.ink, animationDelay: `${(place - 1) * 120}ms` }}>
                      {place}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {rest.length > 0 && (
            <section className="list">
              {rest.map((r, k) => {
                const rank = offset + k + 1;
                const up = league && rank <= 3;
                const down = league && rows.length >= 6 && rank > rows.length - 3;
                return (
                  <div key={r.id} className={`list-row ${r.isMe ? "me" : ""}`} style={{ minHeight: 52 }}>
                    <span style={{ width: 26, textAlign: "center", fontSize: 16, fontWeight: 900, color: up ? "var(--lime-dark)" : down ? "var(--cherry-edge)" : "var(--muted)" }}>{rank}</span>
                    {up && <svg width="12" height="10" viewBox="0 0 12 10" role="img" aria-label="Moving up"><path d="M6 1 L11 9 H1z" fill="#58CC02" /></svg>}
                    {down && <svg width="12" height="10" viewBox="0 0 12 10" role="img" aria-label="Moving down"><path d="M6 9 L11 1 H1z" fill="#FF4B4B" /></svg>}
                    <Avatar name={r.name} paint={paintFor(r.id, r.isMe)} size={34} />
                    <span style={{ flex: 1, fontSize: 16, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.isMe ? "You" : r.name}</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: "var(--muted)" }}>{fmt(r.value)}</span>
                  </div>
                );
              })}
            </section>
          )}

          {data.myRank && data.myValue !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 16, background: "var(--sky-soft)", border: "2px solid var(--sky-line)", boxShadow: "0 4px 0 var(--sky-line)", position: "sticky", bottom: 12 }}>
              <span style={{ minWidth: 48, fontSize: 15, fontWeight: 900, color: "var(--sky-edge)" }}>#{data.myRank.toLocaleString()}</span>
              <Avatar name={me.name} paint={paintFor("", true)} size={34} />
              <span style={{ flex: 1, fontSize: 16, fontWeight: 900 }}>You</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: "var(--sky-edge)" }}>{fmt(data.myValue)}</span>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Empty({ period }: { period: Period }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "32px 0", textAlign: "center" }}>
      <Mascot size={90} mood="wow" />
      <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Nobody here yet.</p>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>
        {period === "league" ? "Win games this week to climb the league." : "Finish today's Daily Duel to be first on the board!"}
      </p>
    </div>
  );
}
