"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BLITZ_GOAL, BLITZ_MAX_ROUNDS, BOT_IDS, RISK_MAX, type RiskMode } from "../../../convex/lib/risk/rules";
import { InviteFriends } from "@/components/InviteFriends";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { GAME_NAME, RULE, type RiskView } from "./common";

export function RiskLobby({ room }: { room: RiskView }) {
  const router = useRouter();
  const start = useMutation(api.risk.start);
  const settings = useMutation(api.risk.settings);
  const leave = useMutation(api.risk.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const host = room.isHost;
  const paints = roomPaints(room.members);
  const humans = room.members.length;
  const maxBots = Math.min(BOT_IDS.length, RISK_MAX - humans);
  const minBots = humans === 1 ? 1 : 0;
  const effectiveBots = Math.max(minBots, Math.min(room.bots, maxBots));
  const totalSeats = humans + effectiveBots;

  async function share() {
    feedback.tap();
    const url = `${location.origin}/risk/room/${room.code}`;
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
    feedback.tap();
    setStarting(true);
    setError("");
    try {
      await start({ code: room.code });
    } catch (e) {
      setError(errorText(e));
      setStarting(false);
    }
  }

  function pickMode(mode: RiskMode) {
    if (!host) return;
    feedback.tap();
    void settings({ code: room.code, mode }).catch((e) => setError(errorText(e)));
  }

  function pickBots(bots: number) {
    if (!host) return;
    feedback.tap();
    void settings({ code: room.code, bots }).catch((e) => setError(errorText(e)));
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button
          className="icon-btn"
          aria-label="Leave room"
          onClick={async () => {
            await leave({ code: room.code }).catch(() => {});
            router.push("/risk");
          }}
        >
          <Icon.Close />
        </button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button
          className="icon-btn"
          style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }}
          aria-label={copied ? "Link copied" : "Share invite link"}
          onClick={share}
        >
          <Icon.Share size={18} />
        </button>
      </header>

      <section className="rise rk-lobbycard">
        <span className="rk-kicker">2–{RISK_MAX} COMMANDERS · 6 CONTINENTS</span>
        <h1 className="display" style={{ margin: 0, fontSize: 30, lineHeight: 1.05 }}>{GAME_NAME}</h1>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, opacity: 0.85, lineHeight: 1.35 }}>{RULE}</p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Victory mode</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            type="button"
            className="seg"
            aria-pressed={room.mode === "blitz"}
            disabled={!host}
            style={{ minHeight: 62, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}
            onClick={() => pickMode("blitz")}
          >
            <span>⚡ Blitz</span>
            <span style={{ fontSize: 12, opacity: 0.75 }}>First to {BLITZ_GOAL} lands · {BLITZ_MAX_ROUNDS}r</span>
          </button>
          <button
            type="button"
            className="seg"
            aria-pressed={room.mode === "domination"}
            disabled={!host}
            style={{ minHeight: 62, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}
            onClick={() => pickMode("domination")}
          >
            <span>🌍 Domination</span>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Conquer all 24 lands</span>
          </button>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">AI Generals · {effectiveBots}</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
          {[0, 1, 2, 3].map((n) => {
            const disabled = !host || n < minBots || n > maxBots;
            return (
              <button
                key={n}
                type="button"
                className="seg"
                aria-pressed={effectiveBots === n}
                disabled={disabled}
                style={{ minHeight: 46 }}
                onClick={() => pickBots(n)}
              >
                {n === 0 ? "None" : `${n} AI`}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Commanders · {totalSeats}/{RISK_MAX}</span>
        <div className="list">
          {room.members.map((m) => (
            <div key={m.id} className={`list-row${m.isMe ? " me" : ""}`}>
              <Avatar name={m.name} paint={paints.get(m.id)} size={36} style={{ opacity: now - m.lastSeen < 30_000 ? 1 : 0.4 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{m.isMe ? `${m.name} (you)` : m.name}</span>
              {m.isHost && <span className="chip chip-sun">HOST</span>}
            </div>
          ))}
          {effectiveBots > 0 && (
            <div className="list-row">
              <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, background: "var(--cream-2)", boxShadow: "0 3px 0 var(--cream-3)", color: "var(--plum-soft)", fontSize: 18 }}>🤖</span>
              <span style={{ flex: 1, fontSize: 15.5, fontWeight: 800, color: "var(--muted)" }}>
                +{effectiveBots} AI {effectiveBots === 1 ? "General" : "Generals"} ready to battle
              </span>
            </div>
          )}
        </div>
      </section>

      <InviteFriends kind="risk" code={room.code} />
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting || totalSeats < 2}>
          {starting ? "Deploying armies…" : `Start battle (${totalSeats} commanders)`}
        </button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>
          Waiting for the host to start
        </p>
      )}
      {host && room.members.length < RISK_MAX && (
        <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}>
          <Icon.Share /> {copied ? "Link copied!" : "Share link"}
        </button>
      )}
    </main>
  );
}
