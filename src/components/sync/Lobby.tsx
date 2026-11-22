"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { DECKS, type DeckId } from "../../../convex/lib/sync/deck";
import { LENGTHS } from "../../../convex/lib/sync/rules";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { InviteFriends } from "@/components/InviteFriends";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { GAME_NAME, RULE, deckVars, type SyncView } from "./common";

export function SyncLobby({ room }: { room: SyncView }) {
  const router = useRouter();
  const start = useMutation(api.sync.start);
  const settings = useMutation(api.sync.settings);
  const leave = useMutation(api.sync.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const host = room.isHost;
  const paints = roomPaints(room.members);
  const two = room.members.length === 2;
  const partner = room.members.find((m) => !m.isMe);

  function change(next: Partial<{ decks: DeckId[]; length: number; own: boolean }>) {
    feedback.tap();
    setError("");
    void settings({ code: room.code, decks: room.decks, length: room.length, own: room.own, ...next }).catch((e) => setError(errorText(e)));
  }

  async function share() {
    feedback.tap();
    const url = `${location.origin}/sync/room/${room.code}`;
    const text = `How in sync are we? Play ${GAME_NAME} with me on pums party! Code ${room.code}`;
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
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/sync"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise sy-lobbycard">
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: "var(--pink-edge)" }}>FOR TWO · BEST ON A CALL</span>
        <span className="display" style={{ fontSize: 26 }}>{GAME_NAME}</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "var(--plum)" }}>{RULE}</span>
      </section>

      {room.pair && room.pair.games > 0 && (
        <section className="sy-pairstats rise">
          <span>💞 You two</span>
          <b>{room.pair.games} {room.pair.games === 1 ? "game" : "games"}</b>
          <b>best {room.pair.bestSync}%</b>
          <b>last {room.pair.lastSync}%</b>
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Decks</span>
        <div className="sy-decks">
          {DECKS.map((d) => {
            const on = room.decks.includes(d.id);
            return (
              <button key={d.id} type="button" className="sy-deckbtn" style={deckVars(d.id)} aria-pressed={on} disabled={!host}
                onClick={() => change({ decks: on ? room.decks.filter((x) => x !== d.id) : [...room.decks, d.id] })}>
                <span className="ico" aria-hidden="true">{d.icon}</span>
                <span className="nm">{d.name}</span>
                <span className="sub">{d.sub}</span>
                {on && <span className="tick" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">How many cards</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {LENGTHS.map((n, k) => (
            <button key={n} className="seg" aria-pressed={room.length === n} disabled={!host} style={{ minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }} onClick={() => change({ length: n })}>
              <span>{["Quick", "Cozy", "Long night"][k]}</span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{n} cards</span>
            </button>
          ))}
        </div>
        <button type="button" className="sy-toggle" role="switch" aria-checked={room.own} disabled={!host} onClick={() => change({ own: !room.own })}>
          <span className="sy-switch" aria-hidden="true"><span /></span>
          <span style={{ flex: 1, textAlign: "left" }}>
            <b>Ask your own questions</b>
            <small>Each of you writes one question for the other</small>
          </span>
        </button>
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
              <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, background: "var(--cream-2)", boxShadow: "0 3px 0 var(--cream-3)", fontSize: 18 }}>💌</span>
              <span className="wait" style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>Waiting for your person…</span>
            </div>
          )}
        </div>
      </section>

      {!two && <InviteFriends kind="sync" code={room.code} />}
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
