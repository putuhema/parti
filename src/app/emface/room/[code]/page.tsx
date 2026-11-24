"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { EmFaceLobby, EmFacePlay } from "@/components/emface/Room";
import { Mascot } from "@/components/ui";
import { errorText } from "@/lib/errors";

export default function EmFaceRoomPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = raw.toUpperCase();
  const room = useQuery(api.emface.view, { code });
  const join = useMutation(api.emface.join);
  const presence = useMutation(api.emface.presence);
  const [joinError, setJoinError] = useState("");
  const wasMember = useRef(false);

  useEffect(() => {
    if (room?.isMember) wasMember.current = true;
  }, [room?.isMember]);

  useEffect(() => {
    if (room && !room.isMember && !wasMember.current) {
      join({ code }).catch((e) => setJoinError(errorText(e, "Couldn't join")));
    }
  }, [room, code, join]);

  const isMember = room?.isMember;
  useEffect(() => {
    if (!isMember) return;
    const beat = () => void presence({ code }).catch(() => {});
    beat();
    const t = setInterval(beat, 15_000);
    return () => clearInterval(t);
  }, [isMember, code, presence]);

  if (room === undefined) return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><Mascot size={80} className="bob" /></main>;
  if (room === null) {
    return (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Mascot size={100} mood="wow" />
        <h1 className="display" style={{ margin: 0, fontSize: 28 }}>Room not found</h1>
        <Link href="/emface" className="btn btn-green">Back home</Link>
      </main>
    );
  }
  if (!room.isMember) {
    return joinError ? (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Mascot size={100} mood="wow" />
        <p style={{ fontWeight: 800 }}>{joinError}</p>
        <Link href="/emface" className="btn btn-green">Back home</Link>
      </main>
    ) : <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><Mascot size={80} className="bob" /></main>;
  }
  if (room.status === "lobby" || !room.game) return <EmFaceLobby room={room} />;
  return <EmFacePlay key={room.gameNo} room={room} />;
}
