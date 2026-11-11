"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BUZZ_CATS, COLS, tileValue } from "../../../convex/lib/buzz/board";
import { Countdown, TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, Icon, Mascot, Sheet, roomPaints, type Paint } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { CatChip, GAME_NAME, fmtScore, useAct, type BuzzGameView, type BuzzView } from "./common";

const PICK_MS = 20_000;
const WAGER_MS = 15_000;
const ANSWER_MS = 15_000;
const LETTERS = ["A", "B", "C", "D"];

type Act = (a: "pick" | "wager" | "answer", n: number) => void;

export function BuzzPlay({ room }: { room: BuzzView }) {
  const g = room.game!;
  const { send, toast, say, clearToast } = useAct(room.code);
  const paints = roomPaints(room.members);
  const nameOf = (id?: string | null) => {
    const m = room.members.find((x) => x.id === id);
    return m?.isMe ? "You" : m?.name ?? "Friend";
  };
  const myPick = g.picker === room.meId && !g.done;
  const pickerName = nameOf(g.picker);
  const [busy, setBusy] = useState(false);

  // Hot seat and departures get a toast.
  const lastEvent = useRef(g.log.at(-1)?.at ?? 0);
  useEffect(() => {
    const e = g.log.at(-1);
    if (!e || e.at <= lastEvent.current) return;
    lastEvent.current = e.at;
    if (e.kind === "hot") { say(e.by === room.meId ? "Hot Seat! Place your bet" : `${nameOf(e.by)} found the Hot Seat`, "info"); feedback.coin(); }
    else if (e.kind === "left") say(`${nameOf(e.by)} left the game`, "info");
  }, [g.log]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sounds for every answer, mine or not.
  const seenTries = useRef(g.tries.length);
  useEffect(() => {
    if (g.tries.length < seenTries.current) seenTries.current = 0;
    for (const t of g.tries.slice(seenTries.current)) {
      if (t.correct) { if (t.by === room.meId) feedback.correct(); else feedback.ping(); }
      else if (t.by === room.meId) feedback.wrong();
    }
    seenTries.current = g.tries.length;
  }, [g.tries, room.meId]);

  // A ping when it becomes your pick.
  const wasMine = useRef(myPick);
  useEffect(() => {
    if (myPick && !wasMine.current && g.phase === "pick") feedback.ping();
    wasMine.current = myPick;
  }, [myPick, g.phase]);

  const act: Act = async (action, n) => {
    if (busy) return;
    feedback.unlock();
    feedback.tap();
    setBusy(true);
    await send(action, n);
    setBusy(false);
  };

  const card = g.phase === "wager" ? "wager" : (g.phase === "question" || g.phase === "reveal") && g.question ? "question" : null;

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <Header room={room} />
      <Scores room={room} g={g} paints={paints} />

      <div className="bz-stage">
        <Board g={g} canPick={myPick && g.phase === "pick" && !busy} onPick={(i) => act("pick", i)} />
        {card === "wager" && <WagerCard g={g} mine={myPick} pickerName={pickerName} busy={busy} act={act} />}
        {card === "question" && <QuestionCard room={room} g={g} paints={paints} nameOf={nameOf} busy={busy} act={act} />}
      </div>

      <section className="bz-actions" aria-live="polite">
        {g.phase === "pick" && !g.done && (
          <>
            <p className={myPick ? undefined : "wait"} style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: myPick ? "var(--plum)" : "var(--muted)", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {myPick ? "Your pick! Tap a tile" : `${pickerName} is picking a tile…`}
            </p>
            <TimerBar deadline={g.deadline} total={PICK_MS} />
          </>
        )}
      </section>

      <Toast toast={toast} onDone={clearToast} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={myPick ? "You pick first" : `${pickerName} picks first`} />}
      {g.done && <Done room={room} g={g} paints={paints} nameOf={nameOf} />}
    </main>
  );
}

function Header({ room }: { room: BuzzView }) {
  const router = useRouter();
  const leave = useMutation(api.buzz.leave);
  const [ask, setAsk] = useState(false);
  const g = room.game!;
  const left = g.tiles.filter((t) => !t.used).length;
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/buzz"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip" style={{ background: "var(--cream-2)", color: "var(--plum)" }}>{GAME_NAME.toUpperCase()} · {left} LEFT</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{room.members.length > 2 ? "The others keep playing without you." : "The game ends."}</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Scores({ room, g, paints }: { room: BuzzView; g: BuzzGameView; paints: Map<string, Paint> }) {
  const cols = g.players.length > 3 ? 3 : g.players.length;
  return (
    <section className="bz-scores" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-label="Scores">
      {g.players.map((id) => {
        const m = room.members.find((x) => x.id === id);
        const paint = paints.get(id);
        const on = g.picker === id && !g.done;
        const score = g.scores[id] ?? 0;
        return (
          <div key={id} className="bz-score" style={{ borderColor: on ? paint?.face : "var(--line)", boxShadow: on ? `0 0 0 3px ${paint?.soft}` : "none" }} aria-current={on ? "true" : undefined}>
            <Avatar name={m?.name ?? "?"} paint={paint} size={24} />
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m?.isMe ? "You" : m?.name ?? "Left"}</span>
              <span key={score} className="pop" style={{ fontSize: 16, fontWeight: 900, color: score < 0 ? "var(--cherry-edge)" : "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{fmtScore(score)}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}

function Board({ g, canPick, onPick }: { g: BuzzGameView; canPick: boolean; onPick: (i: number) => void }) {
  return (
    <div className="bz-board" role="group" aria-label="Board" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
      {g.cats.map((cat) => {
        const c = BUZZ_CATS[cat];
        return (
          <div key={cat} className="bz-head" style={{ background: c.face, boxShadow: `inset 0 -4px 0 ${c.edge}` }}>
            <span aria-hidden="true" style={{ fontSize: 18 }}>{c.icon}</span>
            <span>{c.name}</span>
          </div>
        );
      })}
      {g.tiles.map((t, i) => {
        const cat = g.cats[i % COLS];
        const open = g.tile === i && !t.used;
        return (
          <button key={i} type="button" className={`bz-tile${t.used ? " used" : ""}${open ? " open" : ""}${canPick && !t.used ? " live" : ""}`}
            disabled={!canPick || t.used} onClick={() => onPick(i)}
            aria-label={t.used ? `${BUZZ_CATS[cat].name} ${tileValue(i)}, done${t.hot ? ", was the Hot Seat" : ""}` : `${BUZZ_CATS[cat].name} for ${tileValue(i)}`}>
            {t.used ? (t.hot ? "🔥" : "") : tileValue(i)}
          </button>
        );
      })}
    </div>
  );
}

function wagerSteps(max: number) {
  const r = (x: number) => Math.max(5, Math.round(x / 50) * 50);
  return [...new Set([r(max * 0.25), r(max * 0.5), r(max * 0.75), max])].filter((x) => x <= max).sort((a, b) => a - b);
}

function WagerCard({ g, mine, pickerName, busy, act }: { g: BuzzGameView; mine: boolean; pickerName: string; busy: boolean; act: Act }) {
  const cat = g.cats[g.tile! % COLS];
  const steps = wagerSteps(g.maxWager);
  return (
    <section className="bz-card-over bz-hot rise" aria-label="Hot Seat" aria-live="polite">
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <CatChip cat={cat} />
        <span style={{ fontSize: 28 }} aria-hidden="true">🔥</span>
      </span>
      <h2 className="display" style={{ margin: 0, fontSize: 30, textAlign: "center" }}>Hot Seat</h2>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 800, textAlign: "center", color: "var(--plum)", lineHeight: 1.35 }}>
        {mine ? `Only you answer this one. Bet up to ${g.maxWager.toLocaleString()}. Right adds it, wrong takes it away.` : `${pickerName} answers this one alone and is placing a bet.`}
      </p>
      {mine && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 8 }}>
          {steps.map((s, k) => (
            <button key={s} className={`btn ${k === steps.length - 1 ? "btn-green" : "btn-white"}`} style={{ minHeight: 56, flexDirection: "column", gap: 0, padding: "0 4px", fontSize: 17 }} disabled={busy} onClick={() => act("wager", s)}>
              {s.toLocaleString()}
              {k === steps.length - 1 && <span style={{ fontSize: 11 }}>ALL IN</span>}
            </button>
          ))}
        </div>
      )}
      <div className="grow" />
      <TimerBar deadline={g.deadline} total={WAGER_MS} />
    </section>
  );
}

function QuestionCard({ room, g, paints, nameOf, busy, act }: { room: BuzzView; g: BuzzGameView; paints: Map<string, Paint>; nameOf: (id?: string | null) => string; busy: boolean; act: Act }) {
  const q = g.question!;
  const c = BUZZ_CATS[q.cat];
  const reveal = g.phase === "reveal";
  const hot = g.tiles[g.tile!]?.hot;
  const worth = g.wager ?? tileValue(g.tile!);
  const mine = g.tries.find((t) => t.by === room.meId);
  const canTry = g.isPlayer && !mine && (!hot || g.picker === room.meId) && g.phase === "question";
  const solo = g.players.length === 1;

  const status = reveal
    ? g.takenBy ? { text: `${g.takenBy === room.meId ? "You got it" : `${nameOf(g.takenBy)} got it`}! +${worth.toLocaleString()}`, good: true }
      : g.tries.length ? { text: "Nobody got it", good: false } : { text: "Time's up!", good: false }
    : mine && !mine.correct ? { text: solo || hot ? `Not quite. −${worth.toLocaleString()}` : `Wrong, −${worth.toLocaleString()}. Others can still steal it`, good: false }
    : hot ? { text: g.picker === room.meId ? `Your bet: ${worth.toLocaleString()}` : `${nameOf(g.picker)} bet ${worth.toLocaleString()}`, good: true }
    : null;

  return (
    <section className="bz-card-over rise" style={{ borderColor: c.face, boxShadow: `0 6px 0 ${c.edge}` }} aria-label="Question" aria-live="polite">
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <CatChip cat={q.cat} label={hot ? "🔥 HOT SEAT" : undefined} />
        <span style={{ fontSize: 20, fontWeight: 900, color: c.ink, fontVariantNumeric: "tabular-nums" }}>{worth.toLocaleString()}</span>
      </span>
      <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900, lineHeight: 1.25 }}>{q.text}</h2>
      {!reveal && !solo && !hot && canTry && <span className="bz-hint">First right answer wins it. Wrong loses {worth.toLocaleString()}.</span>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.choices.map((choice, i) => {
          const right = reveal && q.correct === i;
          const pickedWrong = g.tries.filter((t) => t.pick === i && !t.correct);
          const myWrong = pickedWrong.some((t) => t.by === room.meId);
          const winner = g.tries.find((t) => t.pick === i && t.correct);
          const cls = right ? " right" : myWrong ? " wrong" : pickedWrong.length ? " struck" : reveal ? " dim" : "";
          return (
            <button key={i} type="button" className={`bz-choice${cls}`} disabled={!canTry || busy || pickedWrong.length > 0} onClick={() => act("answer", i)}>
              <span className="bz-letter" style={right || myWrong ? undefined : { background: c.soft, color: c.ink }}>{LETTERS[i]}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{choice}</span>
              <span style={{ display: "flex", gap: 2 }}>
                {[...pickedWrong, ...(winner ? [winner] : [])].map((t) => (
                  <Avatar key={t.by} name={room.members.find((m) => m.id === t.by)?.name ?? "?"} paint={paints.get(t.by)} size={22} />
                ))}
              </span>
              {right && <Icon.Check size={18} color="#fff" />}
            </button>
          );
        })}
      </div>
      {status && (
        <p key={status.text} className="pop" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: status.good ? "var(--lime-dark)" : "var(--cherry-edge)" }}>{status.text}</p>
      )}
      {!reveal && <TimerBar deadline={g.deadline} total={ANSWER_MS} />}
    </section>
  );
}

function Done({ room, g, paints, nameOf }: { room: BuzzView; g: BuzzGameView; paints: Map<string, Paint>; nameOf: (id?: string | null) => string }) {
  const router = useRouter();
  const rematch = useMutation(api.buzz.rematch);
  const leave = useMutation(api.buzz.leave);
  const d = g.done!;
  const iWon = d.winners.includes(room.meId);
  const solo = g.players.length === 1 && d.text === "board";
  const tie = d.winners.length > 1;
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon || solo) feedback.win(); else feedback.wrong();
  }, [iWon, solo]);
  const me = g.stats[room.meId];
  const myScore = g.scores[room.meId] ?? 0;
  const title = solo ? `${fmtScore(myScore)} points` : d.text === "left" ? "Everyone else left" : tie ? (iWon ? "You tied for first!" : "It's a tie") : iWon ? "You win!" : `${nameOf(d.winners[0])} wins`;
  const sub = solo && me ? `${me.right} right, ${me.wrong} wrong` : d.text === "left" ? "You win this one." : "Board cleared";
  return (
    <div className="overlay">
      {(iWon || (solo && myScore > 0)) && <Confetti />}
      <Mascot size={100} mood={iWon || solo ? "joy" : "wow"} className={iWon ? "jump" : undefined} />
      <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: iWon || solo ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>
      <div className="list" style={{ width: "100%", maxWidth: 380, background: "#fff" }}>
        {[...g.players].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0)).map((p) => {
          const s = g.stats[p];
          return (
            <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
              <Avatar name={room.members.find((m) => m.id === p)?.name ?? "?"} paint={paints.get(p)} size={32} />
              <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{nameOf(p)}{d.winners.includes(p) && !solo && " 👑"}</span>
                {s && <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>{s.right} right · {s.wrong} wrong</span>}
              </span>
              <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: (g.scores[p] ?? 0) < 0 ? "var(--cherry-edge)" : "var(--ink)" }}>{fmtScore(g.scores[p] ?? 0)}</span>
            </div>
          );
        })}
      </div>
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/buzz"); }}>Back home</button>
    </div>
  );
}
