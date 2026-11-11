"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { SCRAMBLE_MAX } from "../../../convex/lib/scramble/board";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { useIdentity } from "@/lib/identity";
import { GAME_NAME, RULE, type GridView } from "./common";

export function GridLobby({ room }: { room: GridView }) {
  const { token } = useIdentity();
  const router = useRouter();
  const start = useMutation(api.scramble.start);
  const settings = useMutation(api.scramble.settings);
  const leave = useMutation(api.scramble.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const host = room.isHost;
  const paints = roomPaints(room.members);
  const solo = room.members.length === 1;

  async function share() {
    feedback.tap();
    const url = `${location.origin}/scramble/room/${room.code}`;
    const text = `Play ${GAME_NAME} with me on pums party! Code ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "pums party", text, url });
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
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/scramble"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise bz-card">
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: "var(--plum-soft)" }}>1–{SCRAMBLE_MAX} PLAYERS · WORD GRID</span>
        <span className="display" style={{ fontSize: 26 }}>{GAME_NAME}</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "var(--plum)" }}>{RULE}</span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Language</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {([["en", "English"], ["id", "Bahasa Indonesia"]] as const).map(([l, label]) => (
            <button key={l} className="seg" aria-pressed={room.lang === l} disabled={!host} style={{ minHeight: 52 }}
              onClick={() => { feedback.tap(); void settings({ token, code: room.code, lang: l }).catch((e) => setError(errorText(e))); }}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Players · {room.members.length}/{SCRAMBLE_MAX}</span>
        <div className="list">
          {room.members.map((m) => (
            <div key={m.id} className={`list-row${m.isMe ? " me" : ""}`}>
              <Avatar name={m.name} paint={paints.get(m.id)} size={36} style={{ opacity: now - m.lastSeen < 30_000 ? 1 : 0.4 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{m.isMe ? `${m.name} (you)` : m.name}</span>
              {m.isHost && <span className="chip chip-sun">HOST</span>}
            </div>
          ))}
          {solo && (
            <div className="list-row">
              <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, background: "var(--cream-2)", boxShadow: "0 3px 0 var(--cream-3)", color: "var(--plum-soft)", fontSize: 16 }}>?</span>
              <span className="wait" style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>Invite friends, or play solo</span>
            </div>
          )}
        </div>
      </section>

      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting}>{solo ? "Play solo" : `Start with ${room.members.length} players`}</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {host && room.members.length < SCRAMBLE_MAX && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Invite friends"}</button>}
    </main>
  );
}
