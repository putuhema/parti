"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BOARD, CATS, cellOf, type Space } from "../../../convex/lib/trivia/board";
import { Countdown, TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, Icon, Mascot, Sheet, roomPaints, type Paint } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { CatChip, Die, GAME_NAME, Gem, GemRow, useAct, type TriviaGameView, type TriviaView } from "./common";

const ANSWER_MS = 20_000;
const ROLL_MS = 30_000;
const MOVE_MS = 20_000;
const PICK_MS = 15_000;
const LETTERS = ["A", "B", "C", "D"];

function spaceName(s: Space) {
  switch (s.kind) {
    case "start": return "Start: free roll";
    case "again": return "Free roll";
    case "wild": return "Wild · any category";
    case "cat": return CATS[s.cat].name;
    case "gem": return `${CATS[s.cat].name} gem`;
  }
}

export function TriviaPlay({ room }: { room: TriviaView }) {
  const g = room.game!;
  const { send, toast, say, clearToast } = useAct(room.code);
  const paints = roomPaints(room.members);
  const nameOf = (id?: string | null) => {
    const m = room.members.find((x) => x.id === id);
    return m?.isMe ? "You" : m?.name ?? "Friend";
  };
  const myTurn = g.turn === room.meId && !g.done;
  const turnName = nameOf(g.turn);
  const [busy, setBusy] = useState(false);

  // Announce new events (gems, free rolls, wild spaces) with a toast.
  const lastEvent = useRef(g.log.at(-1)?.at ?? 0);
  useEffect(() => {
    const e = g.log.at(-1);
    if (!e || e.at <= lastEvent.current) return;
    lastEvent.current = e.at;
    const who = nameOf(e.by);
    if (e.kind === "gem") { if (e.by === room.meId) feedback.clear(); else feedback.ping(); } // the question card says it
    else if (e.kind === "again") { say(`${who === "You" ? "Free roll!" : `${who} gets a free roll`}`, "info"); feedback.coin(); }
    else if (e.kind === "wild") say(`${who === "You" ? "Wild! Pick any category" : `${who} hit a wild space`}`, "info");
    else if (e.kind === "left") say(`${who} left the game`, "info");
    else if (e.kind === "right") feedback.correct();
    else if (e.kind === "wrong" || e.kind === "late") feedback.wrong();
  }, [g.log]); // eslint-disable-line react-hooks/exhaustive-deps

  // A little "ping" when it becomes your turn.
  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current && g.phase === "roll") feedback.ping();
    wasMine.current = myTurn;
  }, [myTurn, g.phase]);

  async function act(action: "roll" | "move" | "pick" | "answer", n?: number) {
    if (busy) return;
    feedback.unlock();
    feedback.tap();
    setBusy(true);
    await send(action, n);
    setBusy(false);
  }

  const showQuestion = (g.phase === "question" || g.phase === "reveal") && g.question;

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <Header room={room} />
      <Players room={room} g={g} paints={paints} />

      <div className="tq-stage">
        <Board g={g} paints={paints} canMove={myTurn && g.phase === "move" && !busy} onMove={(i) => act("move", i)} center={<Center g={g} turnName={turnName} myTurn={myTurn} />} />
        {showQuestion && <QuestionCard g={g} myTurn={myTurn} turnName={turnName} busy={busy} onAnswer={(i) => act("answer", i)} />}
      </div>

      <section className="tq-actions" aria-live="polite">
        {!g.done && <Actions g={g} myTurn={myTurn} turnName={turnName} busy={busy} act={act} />}
      </section>

      <Toast toast={toast} onDone={clearToast} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={myTurn ? "You go first" : `${turnName} goes first`} />}
      {g.done && <Done room={room} g={g} paints={paints} nameOf={nameOf} />}
    </main>
  );
}

function Header({ room }: { room: TriviaView }) {
  const { token } = useIdentity();
  const router = useRouter();
  const leave = useMutation(api.trivia.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/trivia"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (room.game?.done || !room.game?.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip" style={{ background: "var(--cream-2)", color: "var(--plum)" }}>{GAME_NAME.toUpperCase()} · FIRST TO {room.goal}</span>
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

function Players({ room, g, paints }: { room: TriviaView; g: TriviaGameView; paints: Map<string, Paint> }) {
  return (
    <section className="tq-players" style={{ gridTemplateColumns: `repeat(${g.players.length}, minmax(0, 1fr))` }} aria-label="Players">
      {g.players.map((id) => {
        const m = room.members.find((x) => x.id === id);
        const paint = paints.get(id);
        const on = g.turn === id && !g.done;
        return (
          <div key={id} className="tq-player" style={{ borderColor: on ? paint?.face : "var(--line)", boxShadow: on ? `0 0 0 3px ${paint?.soft}` : "none" }} aria-current={on ? "true" : undefined}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Avatar name={m?.name ?? "?"} paint={paint} size={24} />
              <span style={{ fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m?.isMe ? "You" : m?.name ?? "Left"}</span>
            </span>
            <GemRow gems={g.gems[id] ?? []} goal={g.goal} size={g.players.length > 2 ? 13 : 16} />
          </div>
        );
      })}
    </section>
  );
}

function SpaceFace({ s }: { s: Space }) {
  if (s.kind === "gem") return <Gem cat={s.cat} size={22} />;
  if (s.kind === "cat") return <span className="tq-emoji">{CATS[s.cat].icon}</span>;
  if (s.kind === "wild") return <span style={{ color: "#fff", fontSize: 18 }}>★</span>;
  if (s.kind === "again") return <span style={{ color: "#8E5A00", fontSize: 18 }}>↻</span>;
  return <span style={{ color: "#8E5A00", fontSize: 12, fontWeight: 900 }}>GO</span>;
}

function spaceStyle(s: Space) {
  if (s.kind === "gem") return { background: CATS[s.cat].face, boxShadow: `inset 0 -4px 0 ${CATS[s.cat].edge}` };
  if (s.kind === "cat") return { background: CATS[s.cat].soft, boxShadow: `inset 0 -3px 0 ${CATS[s.cat].face}66` };
  if (s.kind === "wild") return { background: "var(--plum)", boxShadow: "inset 0 -4px 0 #2F2838" };
  return { background: "var(--butter)", boxShadow: "inset 0 -4px 0 var(--butter-edge)" };
}

function Board({ g, paints, canMove, onMove, center }: { g: TriviaGameView; paints: Map<string, Paint>; canMove: boolean; onMove: (i: number) => void; center: React.ReactNode }) {
  const showTargets = g.phase === "move" && !g.done;
  // Several tokens on one space sit side by side.
  const groups = new Map<number, string[]>();
  for (const p of g.players) groups.set(g.pos[p], [...(groups.get(g.pos[p]) ?? []), p]);
  return (
    <div className="tq-board" role="group" aria-label="Board">
      {BOARD.map((s, i) => {
        const [r, c] = cellOf(i);
        const target = showTargets && g.options.includes(i);
        return (
          <button key={i} type="button" className={`tq-space${target ? " target" : ""}`} style={{ gridRow: r + 1, gridColumn: c + 1, ...spaceStyle(s) }}
            disabled={!target || !canMove} onClick={() => onMove(i)} aria-label={`${spaceName(s)}${target ? ", you can move here" : ""}`}>
            <SpaceFace s={s} />
          </button>
        );
      })}
      <div className="tq-center">{center}</div>
      {g.players.map((p) => {
        const [r, c] = cellOf(g.pos[p] ?? 0);
        const group = groups.get(g.pos[p]) ?? [p];
        const k = group.indexOf(p);
        const spread = group.length > 1 ? [[-1, -1], [1, 1], [1, -1], [-1, 1]][k] : [0, 0];
        // Cell centers: 6px board padding, 3px gaps between the 7 cells.
        const at = (n: number, d: number) => `calc(6px + (100% - 30px) * ${(n + 0.5) / 7} + ${n * 3 + d * 8}px)`;
        const paint = paints.get(p);
        const on = g.turn === p;
        return (
          <span key={p} className={`tq-token${on ? " on" : ""}`} aria-hidden="true"
            style={{ left: at(c, spread[0]), top: at(r, spread[1]), background: paint?.face, boxShadow: `0 3px 0 ${paint?.edge}`, zIndex: on ? 3 : 2 }} />
        );
      })}
    </div>
  );
}

function Center({ g, turnName, myTurn }: { g: TriviaGameView; turnName: string; myTurn: boolean }) {
  const text =
    g.done ? "Game over"
    : g.phase === "roll" ? (myTurn ? "Your turn. Roll!" : `${turnName}'s turn`)
    : g.phase === "move" ? (myTurn ? "Tap a glowing space" : `${turnName} is moving`)
    : g.phase === "pick" ? (myTurn ? "Pick a category" : `${turnName} is picking`)
    : myTurn ? "Your question" : `${turnName} is answering`;
  return (
    <>
      <Die key={`${g.seq}-${g.roll}`} value={g.phase === "roll" ? null : g.roll} size={58} rolling={g.phase === "move"} />
      <span style={{ fontSize: 15, fontWeight: 900, color: "var(--plum)", textAlign: "center", lineHeight: 1.2 }}>{text}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--plum-soft)", textAlign: "center" }}>First to {g.goal} gems</span>
    </>
  );
}

function Actions({ g, myTurn, turnName, busy, act }: { g: TriviaGameView; myTurn: boolean; turnName: string; busy: boolean; act: (a: "roll" | "move" | "pick" | "answer", n?: number) => void }) {
  const total = g.phase === "roll" ? ROLL_MS : g.phase === "move" ? MOVE_MS : g.phase === "pick" ? PICK_MS : ANSWER_MS;
  if (g.phase === "question" || g.phase === "reveal") return null;
  const timer = <TimerBar deadline={g.deadline} total={total} />;
  if (!myTurn) {
    const doing = g.phase === "roll" ? "rolling" : g.phase === "move" ? "choosing a way" : g.phase === "pick" ? "picking a category" : "answering";
    return (
      <>
        <p className="wait" style={{ margin: 0, textAlign: "center", fontSize: 17, fontWeight: 900, color: "var(--muted)", minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>{turnName} is {doing}…</p>
        {timer}
      </>
    );
  }
  if (g.phase === "roll") return <><button className="btn btn-green" disabled={busy} onClick={() => act("roll")}>Roll the die</button>{timer}</>;
  if (g.phase === "move") {
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {g.options.map((to, k) => {
            const s = BOARD[to];
            return (
              <button key={to} className="btn btn-white" style={{ minHeight: 56, fontSize: 15, flexDirection: "column", gap: 0, color: "var(--ink)" }} disabled={busy} onClick={() => act("move", to)}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{k === 0 ? `${g.roll} clockwise ↻` : `${g.roll} back ↺`}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{s.kind === "gem" && <Gem cat={s.cat} size={16} />}{spaceName(s)}</span>
              </button>
            );
          })}
        </div>
        {timer}
      </>
    );
  }
  if (g.phase === "pick") {
    return (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {CATS.map((c, i) => (
            <button key={c.name} className="btn" style={{ minHeight: 48, fontSize: 14, background: c.face, color: "#fff", boxShadow: `0 4px 0 ${c.edge}`, padding: "0 6px" }} disabled={busy} onClick={() => act("pick", i)}>
              <span aria-hidden="true">{c.icon}</span> {c.name}
            </button>
          ))}
        </div>
        {timer}
      </>
    );
  }
  return null; // the question card has its own timer
}

function QuestionCard({ g, myTurn, turnName, busy, onAnswer }: { g: TriviaGameView; myTurn: boolean; turnName: string; busy: boolean; onAnswer: (i: number) => void }) {
  const q = g.question!;
  const c = CATS[q.cat];
  const reveal = g.phase === "reveal";
  const res = g.result;
  const verdict = !reveal || !res ? null
    : res.gem !== null ? { text: `${myTurn ? "You won" : `${turnName} won`} the ${c.name} gem!`, good: true }
    : res.correct ? { text: `Right! ${myTurn ? "Roll" : `${turnName} rolls`} again`, good: true }
    : res.pick === null ? { text: "Time's up!", good: false }
    : { text: myTurn ? "Not quite. Next player" : `${turnName} missed it`, good: false };
  return (
    <section className="tq-question rise" style={{ borderColor: c.face, boxShadow: `0 6px 0 ${c.edge}` }} aria-label="Question" aria-live="polite">
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <CatChip cat={q.cat} gem={q.gem} />
        {!myTurn && <span style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>{turnName.toUpperCase()} ANSWERS</span>}
      </span>
      <h2 style={{ margin: 0, fontSize: 21, fontWeight: 900, lineHeight: 1.25 }}>{q.text}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.choices.map((choice, i) => {
          const right = reveal && q.correct === i;
          const wrongPick = reveal && res?.pick === i && !right;
          const cls = right ? " right" : wrongPick ? " wrong" : reveal ? " dim" : "";
          return (
            <button key={i} type="button" className={`tq-choice${cls}`} disabled={!myTurn || reveal || busy} onClick={() => onAnswer(i)}>
              <span className="tq-letter" style={right || wrongPick ? undefined : { background: c.soft, color: c.ink }}>{LETTERS[i]}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{choice}</span>
              {right && <Icon.Check size={18} color="#fff" />}
            </button>
          );
        })}
      </div>
      {verdict ? (
        <p className="pop" style={{ margin: 0, textAlign: "center", fontSize: 18, fontWeight: 900, color: verdict.good ? "var(--lime-dark)" : "var(--cherry-edge)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {res?.gem !== null && res?.gem !== undefined && <Gem cat={res.gem} size={24} />}{verdict.text}
        </p>
      ) : (
        <TimerBar deadline={g.deadline} total={ANSWER_MS} />
      )}
    </section>
  );
}

function Done({ room, g, paints, nameOf }: { room: TriviaView; g: TriviaGameView; paints: Map<string, Paint>; nameOf: (id?: string | null) => string }) {
  const { token } = useIdentity();
  const router = useRouter();
  const rematch = useMutation(api.trivia.rematch);
  const leave = useMutation(api.trivia.leave);
  const d = g.done!;
  const iWon = d.winner === room.meId;
  const solo = g.players.length === 1 && d.text === "gems";
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const me = g.stats[room.meId];
  const title = solo ? `All ${g.goal} gems!` : d.text === "left" ? "Everyone else left" : iWon ? "You win!" : `${nameOf(d.winner)} wins`;
  const sub = solo && me ? `${me.right} right out of ${me.asked} questions` : d.text === "left" ? "You win this one." : `First to ${g.goal} gems`;
  return (
    <div className="overlay">
      {iWon && <Confetti />}
      <Mascot size={100} mood={iWon ? "joy" : "wow"} className={iWon ? "jump" : undefined} />
      <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: iWon ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>
      <div className="list" style={{ width: "100%", maxWidth: 380, background: "#fff" }}>
        {[...g.players].sort((a, b) => (g.gems[b]?.length ?? 0) - (g.gems[a]?.length ?? 0)).map((p) => {
          const s = g.stats[p];
          return (
            <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
              <Avatar name={room.members.find((m) => m.id === p)?.name ?? "?"} paint={paints.get(p)} size={32} />
              <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, gap: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{nameOf(p)}{p === d.winner && " 👑"}</span>
                <GemRow gems={g.gems[p] ?? []} goal={g.goal} size={16} />
              </span>
              {s && <span style={{ fontSize: 13, fontWeight: 900, color: "var(--muted)", whiteSpace: "nowrap" }}>{s.right}/{s.asked} right</span>}
            </div>
          );
        })}
      </div>
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ token, code: room.code }); }}>Play again</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={async () => { await leave({ token, code: room.code }).catch(() => {}); router.push("/trivia"); }}>Back home</button>
    </div>
  );
}
