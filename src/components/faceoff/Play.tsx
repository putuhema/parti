"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { CHARACTERS, QUESTIONS, TURN_MS, questionById } from "../../../convex/lib/faceoff/roster";
import { Countdown, TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, FRIENDS, Icon, Mascot, Sheet, roomPaints, type Paint } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { BOT, GAME_NAME, Portrait, useAct, useNameOf, type FaceGameView, type FaceView } from "./common";

const GROUPS = ["Hair", "Shirt", "Face & style"] as const;

export function FacePlay({ room }: { room: FaceView }) {
  const g = room.game!;
  const { send, toast, say, clearToast } = useAct(room.code);
  const nameOf = useNameOf(room);
  const paints = roomPaints(room.members);
  paints.set(BOT, FRIENDS[0]);
  const me = g.isPlayer ? room.meId : g.players[0];
  const them = g.players.find((p) => p !== me)!;
  const myTurn = g.isPlayer && g.turn === me && !g.done;
  const [busy, setBusy] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [guessMode, setGuessing] = useState(false);
  const guessing = guessMode && myTurn;
  const [confirm, setConfirm] = useState<number | null>(null);

  // Sounds and toasts for each new event.
  const seen = useRef(g.log.length);
  useEffect(() => {
    if (g.log.length < seen.current) seen.current = 0;
    for (const e of g.log.slice(seen.current)) {
      if (e.kind === "ask") {
        if (e.by === me) { if (e.yes) feedback.correct(); else feedback.move(); }
        else feedback.ping();
      } else if (e.kind === "timeout") say(e.by === me ? "Time's up, turn passed" : `${nameOf(e.by)} ran out of time`, "info");
      else if (e.kind === "left") say(`${nameOf(e.by)} left the game`, "info");
    }
    seen.current = g.log.length;
  }, [g.log]); // eslint-disable-line react-hooks/exhaustive-deps

  // A ping when it becomes your turn.
  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current) feedback.ping();
    wasMine.current = myTurn;
  }, [myTurn]);

  async function run(move: { kind: "ask"; q: string } | { kind: "guess"; char: number }) {
    if (busy) return;
    feedback.unlock();
    feedback.tap();
    setBusy(true);
    setAskOpen(false);
    setConfirm(null);
    setGuessing(false);
    await send(move);
    setBusy(false);
  }

  const myDown = new Set(g.down[me] ?? []);
  const myLeft = CHARACTERS.length - myDown.size;
  const theirLeft = CHARACTERS.length - (g.down[them]?.length ?? 0);
  const myAsks = g.log.filter((e) => e.kind === "ask" && e.by === me);

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <Header room={room} g={g} />

      <section className="fo-top">
        <div className="fo-secret" aria-label={g.secret[me] != null ? `Your face is ${CHARACTERS[g.secret[me]!].name}` : "Hidden face"}>
          <span className="fo-secret-pic">{g.secret[me] != null && <Portrait index={g.secret[me]!} />}</span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span className="label" style={{ fontSize: 11 }}>{g.isPlayer ? "You are" : nameOf(me)}</span>
            <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.1 }}>{g.secret[me] != null ? CHARACTERS[g.secret[me]!].name : "?"}</span>
          </span>
        </div>
        <div className="fo-versus">
          <Side name={g.isPlayer ? "You" : nameOf(me)} paint={paints.get(me)} left={myLeft} on={g.turn === me && !g.done} />
          <Side name={nameOf(them)} paint={paints.get(them)} left={theirLeft} on={g.turn === them && !g.done} />
        </div>
      </section>

      <LastEvent g={g} me={me} nameOf={nameOf} />

      <div className={`fo-board${guessing ? " guessing" : ""}`} role="group" aria-label={guessing ? "Tap the face you think they have" : "Your board"}>
        {CHARACTERS.map((c, i) => {
          const down = myDown.has(i);
          return (
            <button key={`${c.id}-${down}`} type="button" className={`fo-card${down ? " down" : ""}`} disabled={!guessing || down || busy}
              onClick={() => { feedback.tap(); setConfirm(i); }} aria-label={`${c.name}${down ? ", flipped down" : ""}`}>
              <Portrait index={i} />
              <span className="fo-name">{c.name}</span>
            </button>
          );
        })}
      </div>

      {myAsks.length > 0 && (
        <section className="fo-asked" aria-label="Your answers so far">
          {myAsks.map((e) => e.kind === "ask" && (
            <span key={e.at} className={`fo-ans ${e.yes ? "yes" : "no"}`}>{questionById(e.q)?.short} · {e.yes ? "Yes" : "No"}</span>
          ))}
        </section>
      )}

      <div className="grow" />
      <section className="bz-actions" aria-live="polite">
        {myTurn ? (
          guessing ? (
            <>
              <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900, color: "var(--plum)" }}>Tap the face you think they have</p>
              <button className="btn btn-white" onClick={() => { feedback.tap(); setGuessing(false); }}>Cancel</button>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
              <button className="btn btn-green" disabled={busy} onClick={() => { feedback.unlock(); feedback.tap(); setAskOpen(true); }}>Ask</button>
              <button className="btn btn-white" disabled={busy} onClick={() => { feedback.tap(); setGuessing(true); }}>Guess</button>
            </div>
          )
        ) : !g.done && (
          <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {g.turn === BOT ? "Bot is thinking…" : `${nameOf(g.turn)} is choosing…`}
          </p>
        )}
        {!g.done && g.turn !== BOT && <TimerBar deadline={g.deadline} total={TURN_MS} />}
      </section>

      <Sheet open={askOpen} onClose={() => setAskOpen(false)} label="Ask a question">
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, textAlign: "center" }}>Ask {nameOf(them)}…</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "62vh", overflowY: "auto", paddingBottom: 4 }}>
          {GROUPS.map((group) => (
            <div key={group} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label" style={{ fontSize: 12 }}>{group}</span>
              <div className="fo-qs">
                {QUESTIONS.filter((q) => q.group === group).map((q) => {
                  const used = (g.asked[me] ?? []).includes(q.id);
                  return (
                    <button key={q.id} type="button" className="fo-q" disabled={used || busy} onClick={() => run({ kind: "ask", q: q.id })}>
                      {q.text}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={confirm !== null} onClose={() => setConfirm(null)} label="Confirm guess">
        {confirm !== null && (
          <>
            <span style={{ width: 120, alignSelf: "center", borderRadius: 20, overflow: "hidden", background: "var(--cream-2)", boxShadow: "0 4px 0 var(--cream-3)" }}><Portrait index={confirm} /></span>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Is it {CHARACTERS[confirm].name}?</h2>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
              {myLeft > 1 ? `You still have ${myLeft} faces up. ` : ""}Right wins the game. Wrong loses it.
            </p>
            <button className="btn btn-green" disabled={busy} onClick={() => run({ kind: "guess", char: confirm })}>Lock it in</button>
            <button className="btn btn-white" onClick={() => setConfirm(null)}>Not yet</button>
          </>
        )}
      </Sheet>

      <Toast toast={toast} onDone={clearToast} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={g.turn === me ? "You ask first" : `${nameOf(g.turn)} asks first`} />}
      {g.done && <Done room={room} g={g} me={me} them={them} nameOf={nameOf} />}
    </main>
  );
}

function Side({ name, paint, left, on }: { name: string; paint?: Paint; left: number; on: boolean }) {
  return (
    <div className="fo-side" style={{ borderColor: on ? paint?.face : "var(--line)", boxShadow: on ? `0 0 0 3px ${paint?.soft}` : "none" }} aria-current={on ? "true" : undefined}>
      <Avatar name={name} paint={paint} size={22} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      <span key={left} className="pop" style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums" }} aria-label={`${left} faces left`}>{left}</span>
    </div>
  );
}

/** The most recent question and its answer. */
function LastEvent({ g, me, nameOf }: { g: FaceGameView; me: string; nameOf: (id?: string | null) => string }) {
  const e = [...g.log].reverse().find((x) => x.kind === "ask");
  if (!e || e.kind !== "ask") {
    return <p className="fo-last" style={{ color: "var(--muted)" }}>Ask questions to flip faces down. Last face standing is theirs.</p>;
  }
  const q = questionById(e.q);
  const mine = e.by === me;
  return (
    <p key={e.at} className="fo-last rise">
      <span style={{ minWidth: 0 }}>
        <b>{mine ? "You" : nameOf(e.by)}</b> asked{mine ? "" : " about yours"}: {q?.text}
      </span>
      <span className={`fo-ans big ${e.yes ? "yes" : "no"}`}>{e.yes ? "YES" : "NO"}</span>
    </p>
  );
}

function Header({ room, g }: { room: FaceView; g: FaceGameView }) {
  const { token } = useIdentity();
  const router = useRouter();
  const leave = useMutation(api.faceoff.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/faceoff"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip" style={{ background: "var(--cream-2)", color: "var(--plum)" }}>{GAME_NAME.toUpperCase()}{g.vsBot ? " · VS BOT" : ""}</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{g.vsBot ? "The game ends." : "Your friend wins this one."}</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, me, them, nameOf }: { room: FaceView; g: FaceGameView; me: string; them: string; nameOf: (id?: string | null) => string }) {
  const { token } = useIdentity();
  const router = useRouter();
  const rematch = useMutation(api.faceoff.rematch);
  const leave = useMutation(api.faceoff.leave);
  const d = g.done!;
  const iWon = g.isPlayer && d.winner === me;
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const last = g.log.at(-1);
  const guessed = last?.kind === "guess" ? last : null;
  const title = d.reason === "left" ? (iWon ? "You win!" : "Game over") : iWon ? "You got it!" : g.isPlayer ? `${nameOf(d.winner)} wins` : `${nameOf(d.winner)} wins`;
  const sub =
    d.reason === "left" ? `${nameOf(last?.by)} left the game.`
    : d.reason === "wrong" && guessed ? `${nameOf(guessed.by)} guessed ${CHARACTERS[guessed.char].name}. Wrong face!`
    : guessed ? `${nameOf(guessed.by)} guessed ${CHARACTERS[guessed.char].name} after ${g.asked[guessed.by]?.length ?? 0} questions.`
    : "";
  return (
    <div className="overlay">
      {iWon && <Confetti />}
      <Mascot size={88} mood={iWon ? "joy" : "wow"} className={iWon ? "jump" : undefined} />
      <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: iWon ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{title}</h2>
      {sub && <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 320 }}>
        {[me, them].map((p) => {
          const idx = g.secret[p];
          return (
            <div key={p} className="fo-reveal" style={{ borderColor: d.winner === p ? "var(--lime)" : "var(--line)" }}>
              <span className="label" style={{ fontSize: 11 }}>{p === room.meId ? "You were" : `${nameOf(p)} was`}</span>
              <span style={{ width: "100%", borderRadius: 14, overflow: "hidden", background: "var(--cream-2)", animation: "flipin 500ms var(--spring) both" }}>{idx != null && <Portrait index={idx} />}</span>
              <span style={{ fontSize: 17, fontWeight: 900 }}>{idx != null ? CHARACTERS[idx].name : "?"}{d.winner === p && " 👑"}</span>
            </div>
          );
        })}
      </div>
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ token, code: room.code }); }}>Play again</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/faceoff"); }}>Back home</button>
    </div>
  );
}
