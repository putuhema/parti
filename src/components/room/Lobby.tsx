"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Difficulty } from "../../../convex/lib/sudoku";
import { Avatar, Icon, TopBar, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import type { RoomView } from "./types";
import { InviteFriends } from "@/components/InviteFriends";

const LEVELS: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "expert", label: "Expert" },
];

export function Lobby({ room }: { room: RoomView }) {
  const router = useRouter();
  const settings = useMutation(api.rooms.settings);
  const start = useMutation(api.rooms.start);
  const leave = useMutation(api.rooms.leave);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const paints = roomPaints(room.players);
  const host = room.isHost;

  async function share() {
    feedback.tap();
    const url = `${location.origin}/room/${room.code}`;
    const text = `Join my Parti Sudoku room ${room.code}!`;
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
      await start({ code: room.code });
    } catch (e) {
      setError(errorText(e));
      setStarting(false);
    }
  }

  const slots = Array.from({ length: 4 }, (_, i) => room.players[i]);

  return (
    <main className="screen">
      <TopBar
        back={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/sudoku"); }}
        title={host ? "New room" : "Room"}
      />

      <section style={{ background: "var(--mist)", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <span className="label">Room code</span>
        <div style={{ display: "flex", gap: 8 }} aria-label={`Room code ${room.code.split("").join(" ")}`}>
          {room.code.split("").map((ch, i) => (
            <span key={i} style={{ width: 54, height: 62, borderRadius: 14, background: "#fff", border: "2px solid var(--line)", boxShadow: "0 4px 0 var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 900 }}>
              {ch}
            </span>
          ))}
        </div>
        <button className="btn btn-white btn-sm" onClick={share}>
          <Icon.Share /> {copied ? "Link copied!" : "Share link"}
        </button>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="label">Mode {host ? "" : "· host picks"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {(["race", "coop"] as const).map((m) => (
            <button
              key={m}
              className="select-card"
              aria-pressed={room.mode === m}
              disabled={!host}
              onClick={() => { feedback.tap(); void settings({ code: room.code, mode: m }); }}
            >
              <span style={{ width: 44, height: 44, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: m === "race" ? "var(--sky)" : "var(--grape)", boxShadow: `0 3px 0 ${m === "race" ? "var(--sky-btn)" : "var(--grape-edge)"}` }}>
                {m === "race" ? <Icon.Bolt /> : <Icon.People size={26} />}
              </span>
              <span style={{ fontSize: 19, fontWeight: 900 }}>{m === "race" ? "Race" : "Co-op"}</span>
              <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, color: "var(--muted)" }}>
                {m === "race" ? "Same board. Fastest wins." : "One board, solved as a team."}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="label">Difficulty</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className="seg"
              aria-pressed={room.difficulty === l.id}
              disabled={!host}
              onClick={() => { feedback.tap(); void settings({ code: room.code, difficulty: l.id }); }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="label">Players · {room.players.length} of 4</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {slots.map((p, i) =>
            p ? (
              <div key={p.id} className="rise" style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: "2px solid var(--line)", borderRadius: 16, opacity: p.online ? 1 : 0.5 }}>
                <Avatar name={p.name} paint={paints.get(p.id)!} />
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.isMe ? "You" : p.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: p.online ? "var(--lime-dark)" : "var(--muted)" }}>
                    {p.isHost ? "HOST · " : ""}{p.online ? "READY" : "AWAY"}
                  </span>
                </span>
              </div>
            ) : (
              <div key={`empty-${i}`} className="wait" style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: "2px dashed #CFCFCF", borderRadius: 16 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--mist)", flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>Waiting…</span>
              </div>
            ),
          )}
        </div>
      </section>

      <InviteFriends kind="sudoku" code={room.code} />
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <>
          {room.players.length < 2 && (
            <p style={{ margin: 0, textAlign: "center", fontWeight: 700, color: "var(--muted)" }}>Share the code so friends can join, or start alone to warm up.</p>
          )}
          <button className="btn btn-green" onClick={go} disabled={starting}>{starting ? "Starting…" : "Start game"}</button>
        </>
      ) : (
        <button className="btn" disabled>Waiting for host to start…</button>
      )}
    </main>
  );
}
