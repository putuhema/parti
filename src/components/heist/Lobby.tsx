"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LEVELS } from "../../../convex/lib/heist/levels";
import { ROLES, parseLevel, startSim } from "../../../convex/lib/heist/rules";
import { Avatar, Icon, roomPaints } from "@/components/ui";
import { InviteFriends } from "@/components/InviteFriends";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { Board, GAME_NAME, RULE, ROLE_LOOK, Stars, type HeistView } from "./common";

export function HeistLobby({ room }: { room: HeistView }) {
  const router = useRouter();
  const start = useMutation(api.heist.start);
  const pick = useMutation(api.heist.pickLevel);
  const swap = useMutation(api.heist.swap);
  const leave = useMutation(api.heist.leave);
  const now = useNow(5000);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const host = room.isHost;
  const paints = roomPaints(room.members);
  const solo = room.members.length === 1;
  const chosen = LEVELS.find((l) => l.id === room.level) ?? LEVELS[0];
  const lv = useMemo(() => parseLevel(chosen), [chosen]);

  async function share() {
    feedback.tap();
    const url = `${location.origin}/heist/room/${room.code}`;
    const text = `Pull off a heist with me in ${GAME_NAME} on pums party! Code ${room.code}`;
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
        <button className="icon-btn" aria-label="Leave room" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/heist"); }}><Icon.Close /></button>
        <span style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span className="label" style={{ fontSize: 12 }}>Room code</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".14em" }}>{room.code}</span>
        </span>
        <button className="icon-btn" style={{ border: "2px solid var(--line)", boxShadow: "0 3px 0 var(--line)" }} aria-label={copied ? "Link copied" : "Share invite link"} onClick={share}><Icon.Share size={18} /></button>
      </header>

      <section className="rise hz-lobbycard">
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: "#B8A9FF" }}>CO-OP · 2 PLAYERS OR SOLO</span>
        <span className="display" style={{ fontSize: 26, color: "#fff" }}>{GAME_NAME}</span>
        <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: "#E4DDF5" }}>{RULE}</span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">Pick tonight&apos;s job</span>
        <div className="hz-levels">
          {LEVELS.map((l, i) => (
            <button key={l.id} type="button" className="hz-level" aria-pressed={room.level === l.id} disabled={!host}
              onClick={() => { feedback.tap(); void pick({ code: room.code, level: l.id }).catch((e) => setError(errorText(e))); }}>
              <span className="no">{i + 1}</span>
              <span className="nm">{l.name}</span>
              <Stars got={room.best[l.id] ?? 0} size={14} />
            </button>
          ))}
        </div>
        <div className="hz-peek">
          <Board lv={lv} sim={startSim(lv)} />
          <p>{chosen.intro}</p>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="label">The crew</span>
        <div className="list">
          {ROLES.map((r, seat) => {
            const m = room.members.find((x) => x.seat === seat) ?? (solo ? room.members[0] : undefined);
            return (
              <div key={r} className={`list-row${m?.isMe ? " me" : ""}`}>
                <span className="hz-roleico" style={{ background: ROLE_LOOK[r].color, boxShadow: `0 3px 0 ${ROLE_LOOK[r].edge}` }}>{ROLE_LOOK[r].icon}</span>
                <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>{ROLE_LOOK[r].name} · {m ? (m.isMe ? "you" : m.name) : "waiting…"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{ROLE_LOOK[r].power}</span>
                </span>
                {m && <Avatar name={m.name} paint={paints.get(m.id)} size={30} style={{ opacity: now - m.lastSeen < 30_000 ? 1 : 0.4 }} />}
              </div>
            );
          })}
        </div>
        {room.members.length === 2 && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={() => { feedback.tap(); void swap({ code: room.code }); }}>⇄ Swap roles</button>}
        {solo && <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>Alone? You&apos;ll plan for both thieves.</p>}
      </section>

      {solo && <InviteFriends kind="heist" code={room.code} />}
      <div className="grow" />
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
      {host ? (
        <button className="btn btn-green" onClick={go} disabled={starting}>{solo ? "Start solo heist" : "Start the heist"}</button>
      ) : (
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>Waiting for the host to start</p>
      )}
      {host && solo && <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={share}><Icon.Share /> {copied ? "Link copied!" : "Share link"}</button>}
    </main>
  );
}
