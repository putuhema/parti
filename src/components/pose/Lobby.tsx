"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { PACK_META, type PosePack } from "../../../convex/lib/pose/poses";
import {
  MODE_CHOICES,
  MODE_META,
  PACK_CHOICES,
  POSE_MAX,
  ROUND_CHOICES,
  TIMER_CHOICES,
  type PoseMode,
} from "../../../convex/lib/pose/rules";
import { InviteFriends } from "@/components/InviteFriends";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { GAME_NAME, RULE, type PoseView } from "./common";

export function PoseLobby({ room }: { room: PoseView }) {
  const router = useRouter();
  const start = useMutation(api.pose.start);
  const settings = useMutation(api.pose.settings);
  const leave = useMutation(api.pose.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const host = room.isHost;
  const paints = roomPaints(room.members);
  const modeMeta = MODE_META[room.mode];
  const needsMorePlayers = room.members.length < modeMeta.minPlayers;

  async function share() {
    feedback.tap();
    const url = `${location.origin}/pose/room/${room.code}`;
    const text = `Strike a pose with me in ${GAME_NAME} on pums party! Code ${room.code}`;
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

  function pickMode(mode: PoseMode) {
    if (!host) return;
    feedback.tap();
    void settings({ code: room.code, mode }).catch((e) => setError(errorText(e)));
  }

  function pickPack(pack: PosePack) {
    if (!host) return;
    feedback.tap();
    void settings({ code: room.code, pack }).catch((e) => setError(errorText(e)));
  }

  function pickRounds(rounds: number) {
    if (!host) return;
    feedback.tap();
    void settings({ code: room.code, rounds }).catch((e) => setError(errorText(e)));
  }

  function pickTimer(turnSec: number) {
    if (!host) return;
    feedback.tap();
    void settings({ code: room.code, turnSec }).catch((e) => setError(errorText(e)));
  }

  return (
    <main className="screen tight">
      <header className="topbar">
        <button
          className="icon-btn"
          aria-label="Leave room"
          onClick={async () => {
            await leave({ code: room.code }).catch(() => {});
            router.push("/pose");
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

      <section className="rise ps-lobbycard">
        <span className="ps-kicker">4 CAMERA MODES · LDR COUPLES &amp; FRIENDS</span>
        <h1 className="display" style={{ margin: 0, fontSize: 30, lineHeight: 1.05 }}>{GAME_NAME}</h1>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, opacity: 0.9, lineHeight: 1.35 }}>{RULE}</p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Game mode</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {MODE_CHOICES.map((m) => {
            const meta = MODE_META[m];
            return (
              <button
                key={m}
                type="button"
                className="seg"
                aria-pressed={room.mode === m}
                disabled={!host}
                style={{ minHeight: 62, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "8px 6px" }}
                onClick={() => pickMode(m)}
              >
                <span>{meta.emoji} {meta.label}</span>
                <span style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.2 }}>{meta.sub}</span>
              </button>
            );
          })}
        </div>
      </section>

      {room.mode === "classic" && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">Pose vibe (48 poses)</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PACK_CHOICES.map((p) => {
              const meta = PACK_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  className="seg"
                  aria-pressed={room.pack === p}
                  disabled={!host}
                  style={{ minHeight: 54, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}
                  onClick={() => pickPack(p)}
                >
                  <span>{meta.emoji} {meta.label}</span>
                  <span style={{ fontSize: 11, opacity: 0.75 }}>{meta.sub}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Rounds</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {ROUND_CHOICES.map((r) => (
              <button
                key={r}
                type="button"
                className="seg"
                aria-pressed={room.rounds === r}
                disabled={!host}
                style={{ minHeight: 44 }}
                onClick={() => pickRounds(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label">Turn timer</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {TIMER_CHOICES.map((t) => (
              <button
                key={t}
                type="button"
                className="seg"
                aria-pressed={room.turnSec === t}
                disabled={!host}
                style={{ minHeight: 44 }}
                onClick={() => pickTimer(t)}
              >
                {t}s
              </button>
            ))}
          </div>
        </section>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="label">Players ({room.members.length}/{POSE_MAX})</span>
          {copied && <span style={{ fontSize: 13, fontWeight: 900, color: "var(--lime-ink)" }}>Link copied!</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {room.members.map((m) => {
            const away = now - m.lastSeen > 40_000 && !m.isMe;
            return (
              <div key={m.id} className="row-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={m.name} paint={paints.get(m.id)} size={40} />
                <span style={{ flex: 1, fontWeight: 900, fontSize: 16 }}>
                  {m.name} {m.isMe && <span style={{ color: "var(--muted)", fontWeight: 800 }}>(you)</span>}
                </span>
                {m.isHost && <span className="pill" style={{ background: "var(--sun-soft)", color: "var(--sun-ink)" }}>Host</span>}
                {away && <span className="pill">Away</span>}
              </div>
            );
          })}
        </div>
      </section>

      <InviteFriends kind="pose" code={room.code} />

      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" disabled={starting || needsMorePlayers} onClick={go}>
          {starting
            ? "Setting up camera stage…"
            : needsMorePlayers
              ? `Invite a partner for ${modeMeta.label}`
              : room.members.length === 1
                ? "Start solo practice"
                : `Start ${modeMeta.label} (${room.members.length}p)`}
        </button>
      ) : (
        <p style={{ margin: 0, textAlign: "center", fontWeight: 800, color: "var(--muted)", padding: "12px 0" }}>
          Waiting for the host to start…
        </p>
      )}
    </main>
  );
}
