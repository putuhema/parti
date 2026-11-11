"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Lobby } from "@/components/room/Lobby";
import { RoomGame } from "@/components/room/RoomGame";
import { RoomResults } from "@/components/room/RoomResults";
import { Mascot } from "@/components/ui";
import { errorText } from "@/lib/errors";

export default function RoomPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = raw.toUpperCase();
  const room = useQuery(api.rooms.view, { code });
  const join = useMutation(api.rooms.join);
  const presence = useMutation(api.rooms.presence);
  const [joinError, setJoinError] = useState("");

  // Results show once you're done (race) or the game ends. If that happens while you're
  // on the board, and you actually solved it, hold the board briefly for the celebration.
  const doneMe = room?.mode === "race" && (room.myFinishedAt || room.myGaveUp);
  const wantResults = !!room && room.status !== "lobby" && (room.status === "finished" || !!doneMe);
  const solvedIt = !!room && (room.mode === "coop" ? room.outcome === "won" : !!room.myFinishedAt);
  const [prevWant, setPrevWant] = useState(wantResults);
  const [held, setHeld] = useState<number | null>(null);
  if (wantResults !== prevWant) {
    setPrevWant(wantResults);
    if (wantResults && solvedIt && room) setHeld(room.gameNo);
  }
  useEffect(() => {
    if (held === null) return;
    const t = setTimeout(() => setHeld(null), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [held]);

  // Opening an invite link joins you automatically.
  const needsJoin = room && !room.isMember && room.status !== "playing";
  // Auto-join only when you open the link, never right after you leave (you'd bounce back in).
  const wasMember = useRef(false);
  useEffect(() => {
    if (room?.isMember) wasMember.current = true;
  }, [room?.isMember]);
  useEffect(() => {
    if (needsJoin && !wasMember.current) join({ code }).catch((e) => setJoinError(errorText(e, "Couldn't join")));
  }, [needsJoin, code, join]);

  // Heartbeat so friends can see who's still here.
  const isMember = room?.isMember;
  useEffect(() => {
    if (!isMember) return;
    const beat = () => void presence({ code }).catch(() => {});
    beat();
    const t = setInterval(beat, 10_000);
    return () => clearInterval(t);
  }, [isMember, code, presence]);

  if (room === undefined) return <Center><Mascot size={80} className="bob" /></Center>;
  if (room === null) return <Message title="Room not found" text={`There's no room with the code ${code}.`} />;
  if (!room.isMember) {
    if (joinError) return <Message title="Can't join" text={joinError} />;
    if (room.status === "playing") return <Message title="Game in progress" text="This room is mid-game. Ask the host for a rematch invite." />;
    return <Center><Mascot size={80} className="bob" /></Center>;
  }

  if (room.status === "lobby") return <Lobby room={room} />;
  // Keep the board up for a moment after you finish, so the celebration can play.
  if (held === room.gameNo) return <RoomGame key={room.gameNo} room={room} />;
  if (wantResults) return <RoomResults room={room} />;
  return <RoomGame key={room.gameNo} room={room} />;
}

/** How long the SOLVED! celebration plays before the results screen. */
const CELEBRATE_MS = 2400;

function Center({ children }: { children: React.ReactNode }) {
  return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}>{children}</main>;
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Mascot size={100} mood="wow" />
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)" }}>{text}</p>
      <Link href="/sudoku" className="btn btn-green" style={{ marginTop: 12 }}>Back home</Link>
    </main>
  );
}
