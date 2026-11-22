"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { cardById, topicOf, type Card } from "../../../convex/lib/brain/cards";
import { Toast } from "@/components/words/common";
import { Confetti, Icon, Mascot, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { BrainBook, FactCard, GAME_NAME, topicVars, type BrainGameView, type BrainView } from "./common";

type Move = { kind: "ready" } | { kind: "quiz"; pick: number } | { kind: "pick"; pick: number } | { kind: "lock" } | { kind: "next" };
type ToastT = { text: string; kind: "bad" | "good"; id: number } | null;

export function BrainPlay({ room }: { room: BrainView }) {
  const g = room.game!;
  const act = useMutation(api.brain.act);
  const [toast, setToast] = useState<ToastT>(null);
  const me = room.meId;
  const partner = g.players.find((p) => p !== me) ?? null;
  const partnerName = partner ? g.names[partner] ?? "your partner" : "";
  const solo = g.players.length === 1;

  async function send(move: Move) {
    feedback.unlock();
    feedback.tap();
    try { await act({ code: room.code, round: g.round, move }); } catch (e) { feedback.wrong(); setToast({ text: errorText(e, "Not allowed"), kind: "bad", id: Date.now() }); }
  }

  // Sounds when the phase changes: a ping for a new step, a cheer or a groan for the reveal.
  const last = useRef(`${g.round}${g.phase}`);
  useEffect(() => {
    const key = `${g.round}${g.phase}`;
    if (key === last.current || g.done) { last.current = key; return; }
    last.current = key;
    if (g.phase === "reveal") {
      const res = g.results.at(-1);
      if (res && res.answers.every((a) => a.right)) feedback.correct(); else feedback.wrong();
    } else feedback.ping();
  }, [g.round, g.phase, g.done, g.results]);

  return (
    <main className="screen tight bw-screen">
      <Header room={room} g={g} />
      {!g.done && (
        <div className="bw-hud">
          <span className="chip bw-chip">ROUND {g.round + 1}/{g.rounds}</span>
          {g.streak > 1 && <span className="chip bw-streak">🔥 {g.streak} in a row</span>}
          <span className="grow" />
          <span className="chip bw-score">🧠 {g.score}</span>
        </div>
      )}
      {g.done ? null : !g.isPlayer ? (
        <p className="bw-wait wait">You&apos;re watching.</p>
      ) : g.phase === "read" ? (
        <Read g={g} me={me} partnerName={partnerName} send={send} />
      ) : g.phase === "teach" ? (
        <Teach g={g} me={me} partnerName={partnerName} send={send} />
      ) : g.phase === "quiz" ? (
        <Quiz key={g.round} g={g} me={me} partnerName={partnerName} send={send} />
      ) : g.phase === "agree" ? (
        <Agree key={g.round} g={g} me={me} partnerName={partnerName} solo={solo} send={send} />
      ) : (
        <Reveal g={g} me={me} partnerName={partnerName} solo={solo} send={send} />
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} />}
    </main>
  );
}

type Props = { g: BrainGameView; me: string; partnerName: string; send: (m: Move) => void };
const cardOf = (id: string | null | undefined) => (id ? cardById(id) ?? null : null);

// ---------- Teach Swap ----------
function Read({ g, me, partnerName, send }: Props) {
  const card = cardOf(g.myCard);
  const ready = g.ready.includes(me);
  if (!card) return null;
  return (
    <>
      <p className="bw-step"><b>1 · Read your card</b> {partnerName} has a different one. Soon you&apos;ll teach yours without showing your screen.</p>
      <FactCard card={card} className="rise" />
      <div className="grow" />
      <button className={`btn ${ready ? "btn-white" : "btn-green"}`} disabled={ready} onClick={() => send({ kind: "ready" })}>
        {ready ? `Waiting for ${partnerName} to finish reading…` : "I'm ready to teach"}
      </button>
    </>
  );
}

function Teach({ g, me, partnerName, send }: Props) {
  const card = cardOf(g.myCard);
  const [peek, setPeek] = useState(false);
  const ready = g.ready.includes(me);
  const first = g.players[0] === me;
  if (!card) return null;
  return (
    <>
      <p className="bw-step"><b>2 · Teach each other 🗣️</b> {first ? `You go first, then ${partnerName}.` : `${partnerName} goes first, then you.`} Explain it in your own words. Don&apos;t read it out!</p>
      <section className="bw-cheat rise" style={topicVars(card.topic)}>
        <span className="bw-emoji big" aria-hidden="true">{card.emoji}</span>
        <h3>{card.title}</h3>
        <span className="label">Your key words</span>
        <div className="bw-keys big">{card.keys.map((k) => <span key={k}>{k}</span>)}</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { feedback.tap(); setPeek(!peek); }}>{peek ? "Hide card" : "Peek at the full card"}</button>
        {peek && <p className="bw-peek">{card.text}</p>}
      </section>
      <p className="bw-tip">💡 Teaching it helps <i>you</i> remember it too. Ask {partnerName} a question about theirs!</p>
      <div className="grow" />
      <button className={`btn ${ready ? "btn-white" : "btn-green"}`} disabled={ready} onClick={() => send({ kind: "ready" })}>
        {ready ? `Waiting for ${partnerName}…` : "Got it! Quiz me"}
      </button>
    </>
  );
}

function Options({ card, order, picked, onPick, who, disabled }: { card: Card; order: number[]; picked: number | null; onPick: (i: number) => void; who?: Record<number, { name: string; me: boolean }[]>; disabled?: boolean }) {
  return (
    <div className="bw-options">
      {(order.length ? order : [0, 1, 2, 3]).map((i, k) => (
        <button key={i} type="button" className="bw-opt" aria-pressed={picked === i} disabled={disabled} onClick={() => onPick(i)}>
          <span className="ltr">{"ABCD"[k]}</span>
          <span className="txt">{card.options[i]}</span>
          {who?.[i]?.length ? <span className="who">{who[i].map((w) => <i key={w.name} className={w.me ? "me" : undefined}>{w.name.slice(0, 1).toUpperCase()}</i>)}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Quiz({ g, me, partnerName, send }: Props) {
  const card = cardOf(g.quizCard);
  const mine = g.picks[me];
  const [pick, setPick] = useState<number | null>(mine ?? null);
  if (!card) return null;
  const done = mine !== undefined;
  return (
    <>
      <p className="bw-step"><b>3 · Quiz time</b> What did {partnerName} teach you?</p>
      <section className="bw-qcard rise" style={topicVars(card.topic)}>
        <span className="bw-topic">{card.emoji} FROM {partnerName.toUpperCase()}</span>
        <h3>{card.q}</h3>
      </section>
      <Options card={card} order={g.order[card.id] ?? []} picked={pick} disabled={done} onPick={(i) => { feedback.tap(); setPick(i); }} />
      <div className="grow" />
      <button className={`btn ${done ? "btn-white" : "btn-green"}`} disabled={done || pick === null} onClick={() => pick !== null && send({ kind: "quiz", pick })}>
        {done ? `Locked in. Waiting for ${partnerName}…` : "Lock in"}
      </button>
    </>
  );
}

// ---------- Agree to Answer ----------
function Agree({ g, me, partnerName, solo, send }: Props & { solo: boolean }) {
  const card = cardOf(g.myCard);
  if (!card) return null;
  const mine = g.picks[me] ?? null;
  const theirs = solo ? null : g.picks[g.players.find((p) => p !== me)!] ?? null;
  const locked = g.locked.includes(me);
  const who: Record<number, { name: string; me: boolean }[]> = {};
  for (const p of g.players) if (g.picks[p] !== undefined) (who[g.picks[p]] ??= []).push({ name: p === me ? "You" : g.names[p] ?? "?", me: p === me });
  const agree = !solo && mine !== null && mine === theirs;
  return (
    <>
      <p className="bw-step">{solo ? <><b>Your question</b> Pick an answer, then learn the real story.</> : <><b>Agree to answer 🤝</b> You only lock in when you both pick the same answer. Talk it out!</>}</p>
      <section className="bw-qcard rise" style={topicVars(card.topic)}>
        <span className="bw-topic">{topicOf(card.topic).icon} {topicOf(card.topic).name.toUpperCase()}</span>
        <h3>{card.q}</h3>
      </section>
      <Options card={card} order={g.order[card.id] ?? []} picked={mine} who={solo ? undefined : who} onPick={(i) => send({ kind: "pick", pick: i })} />
      {g.disagree && <p className="bw-disagree pop" role="alert">🤔 You picked different answers. Convince each other, then lock in again.</p>}
      {!solo && !g.disagree && mine !== null && theirs !== null && <p className={`bw-agree${agree ? " yes" : ""}`}>{agree ? "✨ You agree! Lock it in." : `${partnerName} picked something else…`}</p>}
      <div className="grow" />
      <button className={`btn ${locked ? "btn-white" : "btn-green"}`} disabled={mine === null || locked} onClick={() => send({ kind: "lock" })}>
        {locked ? `Locked. Waiting for ${partnerName}…` : "Lock in"}
      </button>
    </>
  );
}

// ---------- The reveal ----------
function Reveal({ g, me, partnerName, solo, send }: Props & { solo: boolean }) {
  const res = g.results.find((r) => r.round === g.round);
  const ready = g.ready.includes(me);
  const [open, setOpen] = useState<string | null>(null);
  if (!res) return null;
  const all = res.answers.every((a) => a.right);
  const name = (id: string) => (id === me ? "You" : g.names[id] ?? partnerName);
  return (
    <>
      <p className={`bw-verdict pop${all ? " good" : ""}`}>
        {g.mode === "teach" ? (all ? "Perfect swap! 🧠⇄🧠" : res.answers.some((a) => a.right) ? "Half the knowledge made it!" : "Lost in translation 😅") : all ? "Correct! 🎉" : "Not quite! 🤓"}
        <small>+{res.points}</small>
      </p>
      {res.answers.map((a) => {
        const card = cardById(a.card)!;
        return (
          <section key={a.card} className={`bw-result rise${a.right ? " right" : " wrong"}`} style={topicVars(card.topic)}>
            {g.mode === "teach" && a.teacher && <span className="bw-teach">{name(a.teacher)} taught {name(a.by[0]) === "You" ? "you" : name(a.by[0])} {a.right ? "· great teacher! 🍎" : ""}</span>}
            <b className="bw-rq">{card.q}</b>
            <span className="bw-ra">✓ {card.options[card.answer]}</span>
            {!a.right && <span className="bw-rp">✗ {g.mode === "teach" ? `${name(a.by[0])} said` : solo ? "You said" : "You both said"}: {card.options[a.pick]}</span>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { feedback.tap(); setOpen(open === a.card ? null : a.card); }}>{open === a.card ? "Hide the card" : "📖 Read the full card"}</button>
            {open === a.card && <FactCard card={card} />}
          </section>
        );
      })}
      <p className="bw-saved">📖 Added to your Brain Book</p>
      <div className="grow" />
      <button className={`btn ${ready ? "btn-white" : "btn-green"}`} disabled={ready} onClick={() => send({ kind: "next" })}>
        {ready ? `Waiting for ${partnerName}…` : g.round + 1 >= g.rounds ? "See how we did" : "Next round"}
      </button>
    </>
  );
}

// ---------- Header and the end ----------
function Header({ room, g }: { room: BrainView; g: BrainGameView }) {
  const router = useRouter();
  const leave = useMutation(api.brain.leave);
  const [ask, setAsk] = useState(false);
  const [book, setBook] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/brain"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip bw-chip">{GAME_NAME.toUpperCase()} · {g.mode === "teach" ? "TEACH SWAP" : "AGREE"}</span>
        <span className="grow" />
        <button className="icon-btn" aria-label="Open Brain Book" onClick={() => { feedback.tap(); setBook(true); }}>📖</button>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>What you learned so far stays in your Brain Book.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep learning</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
      <BrainBook open={book} onClose={() => setBook(false)} learned={room.learned} />
    </>
  );
}

function Done({ room, g }: { room: BrainView; g: BrainGameView }) {
  const router = useRouter();
  const rematch = useMutation(api.brain.rematch);
  const leave = useMutation(api.brain.leave);
  const [book, setBook] = useState(false);
  const left = g.done?.reason === "left";
  const pct = Math.round((100 * g.score) / Math.max(1, g.max));
  const cards = [...new Set(g.results.flatMap((r) => r.answers.map((a) => a.card)))].map((id) => cardById(id)!).filter(Boolean);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (!left) feedback.win();
  }, [left]);
  return (
    <div className="overlay bw-done">
      {!left && pct >= 60 && <Confetti />}
      <Mascot size={84} mood={left ? "wow" : "joy"} className={left ? undefined : "jump"} />
      <h2>{left ? "Your partner left" : pct >= 85 ? "Big brains! 🧠" : pct >= 55 ? "Smarter together!" : "Every fact counts!"}</h2>
      {!left && <p className="bw-donesub">{g.score} points · best streak {g.best} · {cards.length} new facts</p>}
      <div className="bw-learned">
        {cards.map((c) => (
          <span key={c.id} style={topicVars(c.topic)}><i>{c.emoji}</i>{c.title}</span>
        ))}
      </div>
      <p className="bw-donesub">📖 Brain Book: {room.learned.length}/{room.total} facts</p>
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); setBook(true); }}>Open Brain Book</button>
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Learn more</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/brain"); }}>Back home</button>
      <BrainBook open={book} onClose={() => setBook(false)} learned={room.learned} />
    </div>
  );
}
