"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { TOPICS, type TopicId } from "../../../convex/lib/brain/cards";
import { ROUND_CHOICES, type Mode } from "../../../convex/lib/brain/rules";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { InviteFriends } from "@/components/InviteFriends";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { BrainBook, GAME_NAME, RULE, topicVars, type BrainView } from "./common";

const MODES: { id: Mode; icon: string; name: string; sub: string }[] = [
  { id: "teach", icon: "🗣️", name: "Teach Swap", sub: "Learn a fact, teach it, get quizzed on theirs" },
  { id: "agree", icon: "🤝", name: "Agree to Answer", sub: "Same question; lock in only when you agree" },
];

export function BrainLobby({ room }: { room: BrainView }) {
  const router = useRouter();
  const start = useMutation(api.brain.start);
  const settings = useMutation(api.brain.settings);
  const leave = useMutation(api.brain.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [book, setBook] = useState(false);
  const host = room.isHost;
  const paints = roomPaints(room.members);
  const solo = room.members.length === 1;

  function change(next: Partial<{ mode: Mode; topics: TopicId[]; rounds: number }>) {
    feedback.tap();
    setError("");
    void settings({ code: room.code, mode: room.mode, topics: room.topics, rounds: room.rounds, ...next }).catch((e) => setError(errorText(e)));
  }

  async function share() {
    feedback.tap();
    const url = `${location.origin}/brain/room/${room.code}`;
    const text = `Let's learn something together in ${GAME_NAME} on pums party! Code ${room.code}`;
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
      await start({ code: room.code });
    } catch (e) {
      setError(errorText(e));
      setStarting(false);
    }
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/brain"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise bw-lobbycard">
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: "var(--sky-edge)" }}>LEARN TOGETHER · BEST ON A CALL</span>
        <span className="display" style={{ fontSize: 26 }}>{GAME_NAME}</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "var(--plum)" }}>{RULE}</span>
      </section>

      <button type="button" className="bw-bookbtn" onClick={() => { feedback.tap(); setBook(true); }}>
        <span>📖</span>
        <b>Your Brain Book</b>
        <span className="bar"><span style={{ width: `${(room.learned.length / room.total) * 100}%` }} /></span>
        <small>{room.learned.length}/{room.total}</small>
      </button>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Mode</span>
        <div className="bw-modes">
          {MODES.map((m) => {
            const off = solo && m.id === "teach";
            return (
              <button key={m.id} type="button" className="bw-mode" aria-pressed={!off && (room.mode === m.id || (solo && m.id === "agree"))} disabled={!host || off} onClick={() => change({ mode: m.id })}>
                <span className="ico">{m.icon}</span>
                <b>{m.name}</b>
                <small>{off ? "Needs 2 players" : m.sub}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Topics</span>
        <div className="bw-topics">
          {TOPICS.map((t) => {
            const on = room.topics.includes(t.id);
            return (
              <button key={t.id} type="button" className="bw-topicbtn" style={topicVars(t.id)} aria-pressed={on} disabled={!host}
                onClick={() => change({ topics: on ? room.topics.filter((x) => x !== t.id) : [...room.topics, t.id] })}>
                <span>{t.icon}</span>{t.name}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Rounds</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {ROUND_CHOICES.map((n, k) => (
            <button key={n} className="seg" aria-pressed={room.rounds === n} disabled={!host} style={{ minHeight: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }} onClick={() => change({ rounds: n })}>
              <span>{["Quick", "Classic", "Deep dive"][k]}</span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{n} rounds</span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Players · {room.members.length}/2</span>
        <div className="list">
          {room.members.map((m) => (
            <div key={m.id} className={`list-row${m.isMe ? " me" : ""}`}>
              <Avatar name={m.name} paint={paints.get(m.id)} size={36} style={{ opacity: now - m.lastSeen < 30_000 ? 1 : 0.4 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{m.isMe ? `${m.name} (you)` : m.name}</span>
              {m.isHost && <span className="chip chip-sun">HOST</span>}
            </div>
          ))}
        </div>
      </section>

      {solo && <InviteFriends kind="brain" code={room.code} />}
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting}>{solo ? "Study solo" : "Start learning"}</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {host && solo && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Share link"}</button>}
      <BrainBook open={book} onClose={() => setBook(false)} learned={room.learned} />
    </main>
  );
}
