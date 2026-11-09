"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ShellPage } from "@/components/shell";
import { Avatar, Icon, Mascot, Sheet, paintFor } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

export default function FriendsPage() {
  const { token } = useIdentity();
  const router = useRouter();
  const data = useQuery(api.leaderboard.get, { token, period: "week", scope: "friends" });
  const joinAny = useMutation(api.chess.joinAny);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const friends = (data?.rows ?? []).filter((r) => !r.isMe);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const path = await joinAny({ token, code: code.trim().toUpperCase() });
      feedback.correct();
      router.push(path);
    } catch (err) {
      feedback.wrong();
      setError(errorText(err, "Couldn't join"));
    }
  }

  return (
    <ShellPage tab="friends">
      <h1 className="display" style={{ margin: "6px 4px 0", fontSize: 30 }}>Friends</h1>

      <button className="pill-btn primary" onClick={() => { feedback.unlock(); feedback.tap(); setJoinOpen(true); }}>Join a game with a code</button>

      {data === undefined ? null : friends.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "28px 16px", borderRadius: 24, background: "var(--cream-2)", textAlign: "center" }}>
          <Mascot size={72} className="bob" />
          <span className="display" style={{ fontSize: 22 }}>No friends yet</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--plum-soft)" }}>
            Play any room with someone and you become friends automatically.
          </span>
        </div>
      ) : (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="Your friends">
          <span className="label" style={{ color: "var(--plum-soft)", paddingLeft: 4 }}>Points this week</span>
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

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} label="Join a room">
        <form onSubmit={join} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Join a room</h2>
          <label htmlFor="fcode" className="label" style={{ textAlign: "center" }}>Enter the 4-character code</label>
          <input id="fcode" className="input code" autoFocus autoCapitalize="characters" autoComplete="off" maxLength={4} value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} placeholder="K7Q2" />
          {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
          <button className="btn btn-green" disabled={code.length !== 4}>Join</button>
        </form>
      </Sheet>
    </ShellPage>
  );
}
