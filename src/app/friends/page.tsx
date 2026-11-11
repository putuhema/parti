"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ShellPage } from "@/components/shell";
import { Avatar, Icon, Mascot, paintFor } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";

/** Everything about playing with other people: invites, joining by code, and your friends. */
export default function FriendsPage() {
  const data = useQuery(api.leaderboard.get, { period: "week", scope: "friends" });
  const friends = (data?.rows ?? []).filter((r) => !r.isMe);

  return (
    <ShellPage tab="friends">
      <h1 className="display" style={{ margin: "6px 4px 0", fontSize: 30 }}>Friends</h1>

      <Invites />
      <JoinByCode />

      {data === undefined ? null : friends.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "28px 16px", borderRadius: 24, background: "var(--cream-2)", textAlign: "center" }}>
          <Mascot size={72} className="bob" />
          <span className="display" style={{ fontSize: 22 }}>No friends yet</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--plum-soft)" }}>
            Play any room with someone and you become friends. Then you can invite each other from any lobby.
          </span>
        </div>
      ) : (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="Your friends">
          <span className="label" style={{ color: "var(--plum-soft)", paddingLeft: 4 }}>Your friends · points this week</span>
          {friends.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 20, background: "#fff", boxShadow: "0 3px 0 var(--cream-3)" }}>
              <Avatar name={f.name} paint={paintFor(f.id)} size={42} />
              <span style={{ flex: 1, fontSize: 18, fontWeight: 900, color: "var(--plum)" }}>{f.name}</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: "var(--plum-soft)" }}>{f.value.toLocaleString()}</span>
            </div>
          ))}
        </section>
      )}

      <Link href="/leaderboard" className="pill-btn" onClick={() => feedback.tap()} style={{ fontSize: 18 }}>
        <Icon.Trophy /> Leaderboard
      </Link>
    </ShellPage>
  );
}

/** Live invites from friends. They vanish after 30 minutes. */
function Invites() {
  const router = useRouter();
  const invites = useQuery(api.invites.mine);
  const dismiss = useMutation(api.invites.dismiss);
  if (!invites?.length) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label="Game invites" aria-live="polite">
      <span className="label" style={{ color: "var(--plum-soft)", paddingLeft: 4 }}>Invites</span>
      {invites.map((inv) => (
        <div key={inv.id} className="rise fr-invite">
          <Avatar name={inv.from} paint={paintFor(inv.fromId)} size={40} />
          <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.2 }}>{inv.from} invited you</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>{inv.game} · {inv.code}</span>
          </span>
          <button className="btn btn-green btn-sm" onClick={() => {
            feedback.unlock();
            feedback.correct();
            void dismiss({ id: inv.id as Id<"invites"> }).catch(() => {});
            router.push(inv.path);
          }}>Join</button>
          <button className="icon-btn" aria-label={`Dismiss invite from ${inv.from}`} onClick={() => { feedback.tap(); void dismiss({ id: inv.id as Id<"invites"> }); }}><Icon.Close size={14} /></button>
        </div>
      ))}
    </section>
  );
}

function JoinByCode() {
  const router = useRouter();
  const joinAny = useMutation(api.chess.joinAny);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 4 || busy) return;
    feedback.unlock();
    setError("");
    setBusy(true);
    try {
      const path = await joinAny({ code });
      feedback.correct();
      router.push(path);
    } catch (err) {
      feedback.wrong();
      setError(errorText(err, "Couldn't join"));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={join} className="fr-join" aria-label="Join a game with a code">
      <label htmlFor="joincode" className="label" style={{ color: "var(--plum-soft)" }}>Got a room code?</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="joincode" className="input code" style={{ flex: 1, minWidth: 0 }} autoCapitalize="characters" autoComplete="off" maxLength={4} value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} placeholder="K7Q2" />
        <button className="btn btn-green" style={{ width: "auto", padding: "0 22px" }} disabled={code.length !== 4 || busy}>Join</button>
      </div>
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800 }}>{error}</p>}
    </form>
  );
}
