"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, Icon, Sheet, paintFor } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";

type Kind = "sudoku" | "chess" | "words" | "trivia" | "buzz" | "faceoff" | "scramble" | "tiles" | "boom";

/** "Invite friends" for a lobby: pick friends and they get a live invite in their Friends tab. */
export function InviteFriends({ kind, code }: { kind: Kind; code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-white btn-sm" style={{ alignSelf: "center" }} onClick={() => { feedback.unlock(); feedback.tap(); setOpen(true); }}>
        <Icon.People size={20} color="var(--sky-btn)" /> Invite friends
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Invite friends">
        {open && <FriendPicker kind={kind} code={code} />}
      </Sheet>
    </>
  );
}

function FriendPicker({ kind, code }: { kind: Kind; code: string }) {
  const friends = useQuery(api.invites.friendsFor, { code });
  const send = useMutation(api.invites.send);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function invite(id: string) {
    setBusy(id);
    setError("");
    try {
      await send({ to: id as Id<"players">, kind, code });
      feedback.correct();
    } catch (e) {
      feedback.wrong();
      setError(errorText(e, "Couldn't send"));
    }
    setBusy(null);
  }
  return (
    <>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Invite friends</h2>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>They&apos;ll see it in their Friends tab, ready to join.</p>
      {friends === undefined ? null : friends.length === 0 ? (
        <p style={{ margin: 0, padding: "18px 12px", borderRadius: 18, background: "var(--cream-2)", fontSize: 15, fontWeight: 700, color: "var(--plum-soft)", textAlign: "center" }}>
          No friends yet. Share the room code {code}; anyone you play with becomes a friend.
        </p>
      ) : (
        <div className="list" style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {friends.map((f) => (
            <div key={f.id} className="list-row">
              <Avatar name={f.name} paint={paintFor(f.id)} size={34} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{f.name}</span>
              <button className={`btn btn-sm ${f.invited ? "btn-white" : "btn-green"}`} style={{ minWidth: 96 }} disabled={busy === f.id} onClick={() => invite(f.id)}>
                {f.invited ? <><Icon.Check /> Sent</> : "Invite"}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" style={{ margin: 0, color: "var(--cherry-edge)", fontWeight: 800, textAlign: "center" }}>{error}</p>}
    </>
  );
}
