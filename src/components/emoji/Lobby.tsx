"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CATEGORIES } from "../../../convex/lib/emoji/content";
import { ROUND_CHOICES } from "../../../convex/lib/emoji/rules";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { InviteFriends } from "@/components/InviteFriends";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { GAME_NAME, RULE, type EmojiView } from "./common";

export function EmojiLobby({ room }: { room: EmojiView }) {
  const router = useRouter();
  const start = useMutation(api.emoji.start);
  const settings = useMutation(api.emoji.settings);
  const leave = useMutation(api.emoji.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const host = room.isHost;
  const paints = roomPaints(room.members);
  const two = room.members.length === 2;
  const partner = room.members.find((m) => !m.isMe);

  function change(next: Partial<{ categories: string[]; rounds: number }>) {
    feedback.tap();
    setError("");
    void settings({ code: room.code, categories: room.categories, rounds: room.rounds, ...next }).catch((e) => setError(errorText(e)));
  }

  async function share() {
    feedback.tap();
    const url = `${location.origin}/emoji/room/${room.code}`;
    const text = `🎬🍿❓ Play ${GAME_NAME} with me on pums party! Code ${room.code}`;
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
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/emoji"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise ec-lobbycard">
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: "#B86E00" }}>CO-OP FOR TWO · BEST ON A CALL</span>
        <span className="display" style={{ fontSize: 26 }}>{GAME_NAME}</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "var(--plum)" }}>{RULE}</span>
      </section>

      {room.best && <p className="ec-best">🏆 Your best for {room.rounds} rounds: <b>{room.best.best}</b> · {room.best.games} {room.best.games === 1 ? "game" : "games"} played</p>}

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Categories {room.categories.length === 0 && "· all of them"}</span>
        <div className="ec-cats">
          {CATEGORIES.map((c) => {
            const on = room.categories.includes(c.id);
            return (
              <button key={c.id} type="button" className="ec-cat" aria-pressed={on} disabled={!host} onClick={() => change({ categories: on ? room.categories.filter((x) => x !== c.id) : [...room.categories, c.id] })}>
                <span>{c.icon}</span>{c.name}
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
              <span>{["Quick", "Classic", "Marathon"][k]}</span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{n} rounds</span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">The two of you</span>
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
              <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, background: "var(--cream-2)", boxShadow: "0 3px 0 var(--cream-3)", fontSize: 18 }}>🤔</span>
              <span className="wait" style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>Waiting for your partner…</span>
            </div>
          )}
        </div>
      </section>

      {!two && <InviteFriends kind="emoji" code={room.code} />}
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting || !two}>{two ? `Start with ${partner?.name}` : "Invite someone to start"}</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {host && !two && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Share link"}</button>}
    </main>
  );
}
