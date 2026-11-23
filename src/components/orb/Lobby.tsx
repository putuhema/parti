"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BOT_NAMES, ORBS_TO_WIN, SEATS as MAX_PLAYERS } from "../../../convex/lib/orb/rules";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { InviteFriends } from "@/components/InviteFriends";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { OrbGlyph, type OrbView } from "./Play";

export function OrbLobby({ room }: { room: OrbView }) {
  const router = useRouter();
  const start = useMutation(api.orb.start);
  const settings = useMutation(api.orb.settings);
  const leave = useMutation(api.orb.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const host = room.isHost;
  const paints = roomPaints(room.members);
  const bots = Math.max(room.members.length === 1 ? 1 : 0, Math.min(room.bots, MAX_PLAYERS - room.members.length));

  async function share() {
    feedback.tap();
    const url = `${location.origin}/orb/room/${room.code}`;
    const text = `🔮 Duel me in Orbwick! Match dominoes, grab orbs, hex your friends. Code ${room.code}`;
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
    <main className="screen tight ow-screen">
      <header className="topbar">
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/orb"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise ow-lobbycard">
        <span className="ow-kicker">2–{MAX_PLAYERS} wizards · first to {ORBS_TO_WIN} orbs</span>
        <span className="ow-wordmark sm"><OrbGlyph size={34} /><span>rbwick</span></span>
        <span className="ow-lobbytext">Cast dominoes onto either end of the chain, matching pips. A double claims an orb; a lucky seven makes the next wizard draw. Hold {ORBS_TO_WIN} orbs or cast your last tile to win.</span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Bot wizards</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {[0, 1, 2, 3].map((n) => (
            <button key={n} className="seg" aria-pressed={room.bots === n} disabled={!host || room.members.length + n > MAX_PLAYERS} style={{ minHeight: 50 }} onClick={() => { feedback.tap(); void settings({ code: room.code, bots: n }).catch((e) => setError(errorText(e))); }}>
              {n === 0 ? "None" : n}
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Wizards · {room.members.length + bots}/{MAX_PLAYERS}</span>
        <div className="list">
          {room.members.map((m) => (
            <div key={m.id} className={`list-row${m.isMe ? " me" : ""}`}>
              <Avatar name={m.name} paint={paints.get(m.id)} size={36} style={{ opacity: now - m.lastSeen < 30_000 ? 1 : 0.4 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{m.isMe ? `${m.name} (you)` : m.name}</span>
              {m.isHost && <span className="chip chip-sun">HOST</span>}
            </div>
          ))}
          {Object.values(BOT_NAMES).slice(0, bots).map((b) => (
            <div key={b} className="list-row" style={{ opacity: 0.6 }}>
              <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, background: "var(--cream-2)", fontSize: 18 }}>🤖</span>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>{b} (bot)</span>
            </div>
          ))}
        </div>
        {room.members.length === 1 && room.bots === 0 && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>A duel needs two: one bot will join you.</span>}
      </section>

      {room.members.length < MAX_PLAYERS && <InviteFriends kind="orb" code={room.code} />}
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting}>Start the duel 🔮</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {host && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Share link"}</button>}
    </main>
  );
}
