"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { STARTERS } from "../../../convex/lib/story/content";
import { LENGTHS } from "../../../convex/lib/story/rules";
import { Avatar, Icon, Sheet, roomPaints } from "@/components/ui";
import { InviteFriends } from "@/components/InviteFriends";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { GAME_NAME, RULE, StoryPaper, type StoryView } from "./common";

export function StoryLobby({ room }: { room: StoryView }) {
  const router = useRouter();
  const start = useMutation(api.story.start);
  const settings = useMutation(api.story.settings);
  const leave = useMutation(api.story.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const host = room.isHost;
  const paints = roomPaints(room.members);
  const two = room.members.length === 2;
  const starter = room.starter !== null ? STARTERS[room.starter] : null;
  const book = room.shelf.find((b) => b.id === reading);

  function change(next: Partial<{ length: number; starter: number | null }>) {
    feedback.tap();
    setError("");
    void settings({ code: room.code, length: room.length, starter: room.starter, ...next }).catch((e) => setError(errorText(e)));
  }

  async function share() {
    feedback.tap();
    const url = `${location.origin}/story/room/${room.code}`;
    const text = `Write a sneaky story with me in ${GAME_NAME} on pums party! Code ${room.code}`;
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
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/story"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise st-lobbycard">
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: "#8A5A1F" }}>FOR TWO · WRITE TOGETHER</span>
        <span className="display" style={{ fontSize: 26 }}>{GAME_NAME}</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "var(--plum)" }}>{RULE}</span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Story starter</span>
        <button type="button" className="st-starterbtn" disabled={!host} onClick={() => { feedback.tap(); setPicking(true); }}>
          <span className="ico">{starter ? starter.emoji : "🎲"}</span>
          <span style={{ flex: 1 }}>{starter ? starter.text : "Surprise us! A random starter."}</span>
          {host && <span className="chg">Change</span>}
        </button>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Story length</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {LENGTHS.map((n, k) => (
            <button key={n} className="seg" aria-pressed={room.length === n} disabled={!host} style={{ minHeight: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }} onClick={() => change({ length: n })}>
              <span>{["Short", "Medium", "Epic"][k]}</span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{n} lines</span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Writers · {room.members.length}/2</span>
        <div className="list">
          {room.members.map((m) => (
            <div key={m.id} className={`list-row${m.isMe ? " me" : ""}`}>
              <Avatar name={m.name} paint={paints.get(m.id)} size={36} style={{ opacity: now - m.lastSeen < 30_000 ? 1 : 0.4 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{m.isMe ? `${m.name} (you)` : m.name}</span>
              {m.isHost && <span className="chip chip-sun">HOST</span>}
            </div>
          ))}
          {!two && (
            <div className="list-row">
              <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, background: "var(--cream-2)", boxShadow: "0 3px 0 var(--cream-3)", fontSize: 18 }}>✍️</span>
              <span className="wait" style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>Waiting for your co-writer…</span>
            </div>
          )}
        </div>
      </section>

      {two && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">📚 Your Story Shelf · {room.shelf.length}</span>
          {room.shelf.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>Your finished stories will live here.</p>
          ) : (
            <div className="st-shelf">
              {room.shelf.map((b) => (
                <button key={b.id} type="button" className="st-spine" onClick={() => { feedback.tap(); setReading(b.id); }}>
                  <span>{STARTERS[b.starter]?.emoji ?? "📖"}</span>
                  <b>{STARTERS[b.starter]?.text ?? "A story"}</b>
                  <small>{new Date(b.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {b.lines.length} lines</small>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {!two && <InviteFriends kind="story" code={room.code} />}
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting || !two}>{two ? "Start writing" : "Invite someone to start"}</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {host && !two && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Share link"}</button>}

      <Sheet open={picking} onClose={() => setPicking(false)} label="Pick a story starter">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, textAlign: "center" }}>How does it begin?</h2>
        <div className="st-starters">
          <button type="button" className="st-starterbtn" aria-pressed={room.starter === null} onClick={() => { change({ starter: null }); setPicking(false); }}>
            <span className="ico">🎲</span><span style={{ flex: 1 }}>Surprise us!</span>
          </button>
          {STARTERS.map((s, i) => (
            <button key={i} type="button" className="st-starterbtn" aria-pressed={room.starter === i} onClick={() => { change({ starter: i }); setPicking(false); }}>
              <span className="ico">{s.emoji}</span><span style={{ flex: 1 }}>{s.text}</span>
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={!!book} onClose={() => setReading(null)} label="A story from your shelf">
        {book && (
          <>
            <StoryPaper starter={book.starter} lines={book.lines} players={Object.keys(book.names)} names={book.names} meId={room.meId} className="st-final" />
            <button className="btn btn-white" onClick={() => setReading(null)}>Close</button>
          </>
        )}
      </Sheet>
    </main>
  );
}
