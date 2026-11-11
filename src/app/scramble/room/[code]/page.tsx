"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { GridLobby } from "@/components/scramble/Lobby";
import { ScramblePlay } from "@/components/scramble/Play";
import { Mascot } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { useIdentity } from "@/lib/identity";

export default function ScrambleRoomPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = raw.toUpperCase();
  const { token } = useIdentity();
  const room = useQuery(api.scramble.view, { token, code });
  const join = useMutation(api.scramble.join);
  const presence = useMutation(api.scramble.presence);
  const [joinError, setJoinError] = useState("");

  const needsJoin = room && !room.isMember;
  // Auto-join only when you open the link, never right after you leave (you'd bounce back in).
  const wasMember = useRef(false);
  useEffect(() => {
    if (room?.isMember) wasMember.current = true;
  }, [room?.isMember]);
  useEffect(() => {
    if (needsJoin && !wasMember.current) join({ token, code }).catch((e) => setJoinError(errorText(e, "Couldn't join")));
  }, [needsJoin, token, code, join]);

  const isMember = room?.isMember;
  useEffect(() => {
    if (!isMember) return;
    const beat = () => void presence({ token, code }).catch(() => {});
    beat();
    const t = setInterval(beat, 15_000);
    return () => clearInterval(t);
  }, [isMember, token, code, presence]);

  if (room === undefined) return <Center><Mascot size={80} className="bob" /></Center>;
  if (room === null) return <Message title="Room not found" text={`There's no Scramble room with the code ${code}.`} />;
  if (!room.isMember) return joinError ? <Message title="Can't join" text={joinError} /> : <Center><Mascot size={80} className="bob" /></Center>;
  if (room.status === "lobby" || !room.game) return <GridLobby room={room} />;
  return <ScramblePlay key={room.gameNo} room={room} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}>{children}</main>;
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Mascot size={100} mood="wow" />
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)" }}>{text}</p>
      <Link href="/scramble" className="btn btn-green" style={{ marginTop: 12 }}>Back home</Link>
    </main>
  );
}
