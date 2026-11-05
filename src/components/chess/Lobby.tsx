"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, Icon, Sheet, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { MODES, ModeIcon, modeInfo } from "./bits";
import type { ChessView } from "./types";

const CLOCKS = [
  { ms: 3 * 60_000, label: "3 min" },
  { ms: 5 * 60_000, label: "5 min" },
  { ms: 10 * 60_000, label: "10 min" },
  { ms: 0, label: "None" },
];
const LEVELS = [
  { n: 1, label: "Gentle" },
  { n: 2, label: "Casual" },
  { n: 3, label: "Tricky" },
];

export function ChessLobby({ room }: { room: ChessView }) {
  const { token } = useIdentity();
  const router = useRouter();
  const settings = useMutation(api.chess.settings);
  const start = useMutation(api.chess.start);
  const leave = useMutation(api.chess.leave);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const host = room.isHost;
  const mode = modeInfo(room.mode);
  const players = room.members.map((m) => ({ ...m }));
  const paints = roomPaints(players);
  const needsTwo = room.mode !== "puzzles";
  const ready = !needsTwo || room.members.length >= 2;
  const usesClock = ["classic", "powerups", "fog", "duck", "shuffle", "threecheck"].includes(room.mode);
  const usesBot = room.mode === "team" || room.mode === "coach";

  const set = (patch: { mode?: typeof room.mode; clockMs?: number; botLevel?: number; coachId?: Id<"players"> }) => {
    if (!host) return;
    feedback.tap();
    void settings({ token, code: room.code, ...patch }).catch((e) => setError(errorText(e)));
  };

  async function share() {
    feedback.tap();
    const url = `${location.origin}/chess/room/${room.code}`;
    const text = `Play ${mode.name} chess with me on Parti! Code ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Parti", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  async function go() {
    feedback.unlock();
    setStarting(true);
    setError("");
    try {
      await start({ token, code: room.code });
    } catch (e) {
      setError(errorText(e));
      setStarting(false);
    }
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/chess"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center" }} aria-label={`In the room: ${room.members.map((m) => m.name).join(", ")}`}>
          {players.map((m, i) => (
            <Avatar key={m.id} name={m.name} paint={paints.get(m.id)!} size={36} style={{ border: "2px solid #fff", boxShadow: "none", marginLeft: i ? -10 : 0, opacity: m.online ? 1 : 0.4 }} />
          ))}
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise" key={room.mode} style={{ borderRadius: 22, background: mode.soft, border: `2px solid ${mode.line}`, boxShadow: `0 4px 0 ${mode.line}`, padding: 16, display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ModeIcon mode={mode} size={48} />
          <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: mode.ink }}>{mode.party ? "PARTY MODE · " : ""}{mode.who.toUpperCase()}</span>
            <span style={{ fontSize: 22, fontWeight: 900 }}>{mode.name}</span>
          </span>
          {host && <button className="btn btn-white btn-sm" onClick={() => { feedback.tap(); setPicking(true); }}>Change</button>}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: mode.ink }}>{mode.rule}</span>
        {!host && <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>{room.members.find((m) => m.isHost)?.name ?? "The host"} picked this game</span>}
      </section>

      <Sheet open={picking} onClose={() => setPicking(false)} label="Change game mode">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, textAlign: "center" }}>Change mode</h2>
        <div className="mode-grid" role="radiogroup" aria-label="Game mode">
          {MODES.map((m) => {
            const on = m.id === room.mode;
            return (
              <button key={m.id} className="mode-tile" role="radio" aria-checked={on} onClick={() => { set({ mode: m.id }); setPicking(false); }} style={on ? { background: m.soft, borderColor: m.edge, boxShadow: `0 4px 0 ${m.edge}` } : undefined}>
                <ModeIcon mode={m} size={34} />
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span className="nm">{m.name}</span>
                  <span className="who">{m.who}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      {usesClock && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">Clock per player</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
            {CLOCKS.map((c) => <button key={c.ms} className="seg" aria-pressed={room.clockMs === c.ms} disabled={!host} onClick={() => set({ clockMs: c.ms })}>{c.label}</button>)}
          </div>
        </section>
      )}
      {usesBot && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">Bolt&apos;s level</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {LEVELS.map((l) => <button key={l.n} className="seg" aria-pressed={room.botLevel === l.n} disabled={!host} onClick={() => set({ botLevel: l.n })}>{l.label}</button>)}
          </div>
        </section>
      )}
      {room.mode === "coach" && room.members.length >= 2 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">Who is the coach?</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {room.members.slice(0, 2).map((m) => (
              <button key={m.id} className="seg" aria-pressed={room.coachId === m.id} disabled={!host} onClick={() => set({ coachId: m.id })}>{m.isMe ? "Me" : m.name}</button>
            ))}
          </div>
        </section>
      )}

      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={!ready || starting}>
          {ready ? `Start ${mode.name}` : "Waiting for a friend…"}
        </button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {!ready && host && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Invite a friend"}</button>}
    </main>
  );
}
