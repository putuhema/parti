"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BOT_NAMES, ROUND_CHOICES, SEATS as MAX_PLAYERS } from "../../../convex/lib/island/rules";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { InviteFriends } from "@/components/InviteFriends";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { GAME_NAME, type IslandView } from "./Play";

export function IslandLobby({ room }: { room: IslandView }) {
  const router = useRouter();
  const start = useMutation(api.island.start);
  const settings = useMutation(api.island.settings);
  const leave = useMutation(api.island.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const host = room.isHost;
  const paints = roomPaints(room.members);

  async function share() {
    feedback.tap();
    const url = `${location.origin}/island/room/${room.code}`;
    const text = `🏝️ Come play Lucky Island with me! Dice, gems and minigames. Code ${room.code}`;
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
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/island"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise li-lobbycard">
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: "#FFF4CC" }}>1–{MAX_PLAYERS} PLAYERS · BOTS FILL EMPTY SEATS</span>
        <span className="display" style={{ fontSize: 26, color: "#fff" }}>🏝️ {GAME_NAME}</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "#E6FAF4" }}>Roll the dice and hop around the island. Blue spaces pay, red ones cost, ❓ spaces are chaos and 🛍️ shops sell items. Pass the 💎 Gem Shrine with 20 coins to buy a gem. After every round, a minigame pays out coins. Most gems wins!</span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Game length</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {ROUND_CHOICES.map((n, k) => (
            <button key={n} className="seg" aria-pressed={room.rounds === n} disabled={!host} style={{ minHeight: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }} onClick={() => { feedback.tap(); void settings({ code: room.code, rounds: n }).catch((e) => setError(errorText(e))); }}>
              <span>{["Quick trip", "Holiday", "Long stay"][k]}</span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{n} rounds</span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Players · {room.members.length}/{MAX_PLAYERS}</span>
        <div className="list">
          {room.members.map((m) => (
            <div key={m.id} className={`list-row${m.isMe ? " me" : ""}`}>
              <Avatar name={m.name} paint={paints.get(m.id)} size={36} style={{ opacity: now - m.lastSeen < 30_000 ? 1 : 0.4 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{m.isMe ? `${m.name} (you)` : m.name}</span>
              {m.isHost && <span className="chip chip-sun">HOST</span>}
            </div>
          ))}
          {Object.values(BOT_NAMES).slice(0, Math.max(0, MAX_PLAYERS - room.members.length)).map((b) => (
            <div key={b} className="list-row" style={{ opacity: 0.6 }}>
              <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, background: "var(--cream-2)", fontSize: 18 }}>🤖</span>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>{b} (bot)</span>
            </div>
          ))}
        </div>
      </section>

      {room.members.length < MAX_PLAYERS && <InviteFriends kind="party" code={room.code} />}
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting}>{room.members.length < MAX_PLAYERS ? `Start · ${MAX_PLAYERS - room.members.length} ${MAX_PLAYERS - room.members.length === 1 ? "bot" : "bots"} join` : "Start the party"}</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {host && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Share link"}</button>}
    </main>
  );
}
