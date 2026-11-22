"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { REACTS, REVEAL_MS, TURN_MS, isBot } from "../../../convex/lib/bluff/rules";
import { TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, Icon, Sheet, roomPaints } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";

export type BluffView = NonNullable<FunctionReturnType<typeof api.bluff.view>>;
type G = NonNullable<BluffView["game"]>;
export const GAME_NAME = "Bluff Bay";
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const say = (qty: number, face: number) => `${WORDS[qty] ?? qty} ${face}${qty === 1 ? "" : "s"}`;

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};
/** A die face. `hot` glows (it counts for the bid); 1s are wild and gold. */
export function Die({ face, size = 40, hot, dim, hidden }: { face: number; size?: number; hot?: boolean; dim?: boolean; hidden?: boolean }) {
  return (
    <svg className={`bb-die${hot ? " hot" : ""}${dim ? " dim" : ""}${face === 1 && !hidden ? " wild" : ""}${hidden ? " back" : ""}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={hidden ? "Hidden die" : `${face}${face === 1 ? " (wild)" : ""}`}>
      <rect x="4" y="4" width="92" height="92" rx="20" />
      {hidden ? <text x="50" y="54" textAnchor="middle" dominantBaseline="middle">?</text> : PIPS[face]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" />)}
    </svg>
  );
}

export function BluffPlay({ room }: { room: BluffView }) {
  const g = room.game!;
  const me = room.meId;
  const act = useMutation(api.bluff.act);
  const now = useNow(400);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const toastN = useRef(0);
  const name = (id: string) => (id === me ? "You" : g.names[id] ?? "Pirate");
  const paints = roomPaints(g.players.map((id, seat) => ({ id, seat, isMe: id === me })));
  const myTurn = g.phase === "bid" && g.turn === me && !g.done;
  const mine = g.dice[me] ?? [];

  // A ping when it's your go; a thud when LIAR is called; a cheer or groan for the reveal.
  const wasMine = useRef(false);
  useEffect(() => { if (myTurn && !wasMine.current) feedback.ping(); wasMine.current = myTurn; }, [myTurn]);
  const lastPhase = useRef(g.phase);
  useEffect(() => {
    if (g.phase === "reveal" && lastPhase.current !== "reveal") {
      feedback.slam();
      const r = g.reveal;
      if (r && (r.caller === me || r.bidder === me)) setTimeout(() => (r.loser === me ? feedback.wrong() : feedback.correct()), 900);
    }
    lastPhase.current = g.phase;
  }, [g.phase, g.reveal, me]);

  async function send(move: Parameters<typeof act>[0]["move"]) {
    try { await act({ code: room.code, move }); }
    catch (e) { feedback.wrong(); toastN.current += 1; setToast({ text: errorText(e, "Couldn't do that"), kind: "bad", id: toastN.current }); }
  }

  const r = g.reveal;
  const showFace = g.phase === "reveal" && r ? r.bid.face : null;

  return (
    <main className={`screen tight bb-screen${myTurn ? " myturn" : ""}`}>
      <Header room={room} />

      <section className="bb-table" style={{ gridTemplateColumns: `repeat(${g.players.length <= 4 ? 2 : 3}, minmax(0, 1fr))` }}>
        {g.players.map((p) => {
          const out = g.counts[p] === 0;
          const shown = g.dice[p];
          const reacts = g.reacts.filter((x) => x.who === p && now - x.at < 3000);
          const lastBid = g.bid?.by === p ? g.bid : null;
          return (
            <div key={p} className={`bb-seat${g.turn === p && g.phase === "bid" && !g.done ? " turn" : ""}${out ? " out" : ""}${p === me ? " me" : ""}${r?.loser === p ? " loser" : ""}`}>
              <span className="av">
                {isBot(p) ? <span className="bb-bot" aria-hidden="true">🦜</span> : <Avatar name={g.names[p] ?? "?"} paint={paints.get(p)} size={36} />}
                {reacts.map((x) => <span key={x.at} className="bb-react">{x.e}</span>)}
              </span>
              <b className="nm">{name(p)}</b>
              {out ? (
                <span className="bb-cnt">☠️ out</span>
              ) : shown && p !== me ? (
                <span className="bb-mini">{shown.map((d, i) => <Die key={i} face={d} size={18} hot={showFace !== null && (d === showFace || d === 1)} dim={showFace !== null && d !== showFace && d !== 1} />)}</span>
              ) : (
                <span className="bb-cnt">{"🎲".repeat(g.counts[p])}</span>
              )}
              {lastBid && g.phase === "bid" && <span key={g.bids.length} className="bb-said pop">{say(lastBid.qty, lastBid.face)}</span>}
            </div>
          );
        })}
      </section>

      {g.phase === "reveal" && r ? (
        <section className="bb-reveal rise" aria-live="polite">
          <p className="bb-call">🏴‍☠️ <b>{name(r.caller)}</b> called LIAR!</p>
          <p className="bb-math">
            {name(r.bidder)} bid <b>{say(r.bid.qty, r.bid.face)}</b>. There {r.count === 1 ? "was" : "were"} <b className={r.liar ? "bad" : "good"}>{r.count}</b>.
          </p>
          <p className={`bb-verdict ${r.loser === me ? "bad" : "good"}`}>{r.liar ? `${name(r.bidder)} ${r.bidder === me ? "were" : "was"} bluffing!` : "The bid was true!"} {name(r.loser)} {r.loser === me ? "lose" : "loses"} a die 🎲</p>
          <TimerBar deadline={g.deadline} total={REVEAL_MS} />
        </section>
      ) : (
        <section className="bb-bidline">
          {g.bid ? (
            <>
              <span className="lbl">{name(g.bid.by)} {g.bid.by === me ? "bid" : "bids"}</span>
              <span className="big">{g.bid.qty} ×</span>
              <Die face={g.bid.face} size={44} />
            </>
          ) : (
            <span className="lbl">{myTurn ? "Open the bidding!" : `${name(g.turn)} opens the bidding…`}</span>
          )}
        </section>
      )}

      {g.isPlayer && mine.length > 0 && (
        <section className="bb-hand">
          <span className="label">Your dice <small>· 1s are wild</small></span>
          <div className="row">{mine.map((d, i) => <Die key={`${g.round}-${i}`} face={d} size={46} hot={showFace !== null && (d === showFace || d === 1)} />)}</div>
          {g.peek && (
            <p className="bb-peek">👀 {name(g.peek.target)} has a <Die face={g.peek.value} size={24} /> in their cup</p>
          )}
        </section>
      )}
      {g.isPlayer && mine.length === 0 && !g.done && <p className="bb-outmsg">☠️ You&apos;re out of dice. Watch the rest fight it out!</p>}

      {myTurn ? (
        <Controls key={`${g.round}:${g.bids.length}`} g={g} me={me} send={send} />
      ) : g.phase === "bid" && !g.done ? (
        <div className="bb-wait">
          {isBot(g.turn) ? <span><b>{name(g.turn)}</b> is thinking… 🦜</span> : <span>Waiting for <b>{name(g.turn)}</b>…</span>}
          {!isBot(g.turn) && <TimerBar deadline={g.deadline} total={TURN_MS} />}
        </div>
      ) : null}

      <div className="bb-reacts" role="group" aria-label="Reactions">
        {REACTS.map((e) => <button key={e} type="button" onClick={() => { feedback.tap(); void send({ kind: "react", e }); }}>{e}</button>)}
      </div>
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} name={name} />}
    </main>
  );
}

function Controls({ g, me, send }: { g: G; me: string; send: (m: { kind: "bid"; qty: number; face: number } | { kind: "liar" } | { kind: "peek" }) => Promise<void> }) {
  const total = Object.values(g.counts).reduce((a, b) => a + b, 0);
  const minFor = (f: number) => { const b = g.bid; const q = !b ? 1 : f > b.face ? b.qty : b.qty + 1; return q <= total ? q : null; };
  const firstFace = [2, 3, 4, 5, 6].find((f) => minFor(f) !== null) ?? 6;
  const [face, setFace] = useState(g.bid && minFor(g.bid.face) !== null ? g.bid.face : firstFace);
  const [qty, setQty] = useState(minFor(face) ?? total);
  const min = minFor(face);
  const ok = min !== null && qty >= min && qty <= total;
  const canPeek = !g.peekUsed && (g.counts[me] ?? 0) > 0;

  return (
    <section className="bb-controls rise">
      <TimerBar deadline={g.deadline} total={TURN_MS} />
      <div className="bb-faces" role="group" aria-label="Face">
        {[2, 3, 4, 5, 6].map((f) => (
          <button key={f} type="button" aria-pressed={face === f} disabled={minFor(f) === null} onClick={() => { feedback.tap(); setFace(f); setQty((q) => Math.max(q, minFor(f) ?? q)); }}>
            <Die face={f} size={38} />
          </button>
        ))}
      </div>
      <div className="bb-qty">
        <button type="button" aria-label="Fewer" disabled={min === null || qty <= min} onClick={() => { feedback.tap(); setQty((q) => q - 1); }}>−</button>
        <span><b>{qty}</b> × <Die face={face} size={28} /></span>
        <button type="button" aria-label="More" disabled={qty >= total} onClick={() => { feedback.tap(); setQty((q) => q + 1); }}>+</button>
      </div>
      <div className="bb-go">
        <button className="btn btn-green" disabled={!ok} onClick={() => { feedback.tap(); void send({ kind: "bid", qty, face }); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>Bid {qty} × <Die face={face} size={26} /></button>
        {g.bid && <button className="btn bb-liar" onClick={() => { feedback.tap(); void send({ kind: "liar" }); }}>LIAR!</button>}
      </div>
      {canPeek && <button type="button" className="bb-peekbtn" onClick={() => { feedback.tap(); void send({ kind: "peek" }); }}>👀 Peek at a neighbour&apos;s die (once a game)</button>}
    </section>
  );
}

function Header({ room }: { room: BluffView }) {
  const router = useRouter();
  const leave = useMutation(api.bluff.leave);
  const g = room.game!;
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/bluff"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip bb-chip">🏴‍☠️ {GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist">ROUND {g.round}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Abandon ship?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>A parrot will take your seat and your dice.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Stay</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, name }: { room: BluffView; g: G; name: (id: string) => string }) {
  const router = useRouter();
  const rematch = useMutation(api.bluff.rematch);
  const leave = useMutation(api.bluff.leave);
  const winner = g.done?.winner ?? null;
  const iWon = winner === room.meId;
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const order = [...(winner ? [winner] : []), ...[...g.out].reverse()];
  return (
    <div className="overlay bb-done">
      {iWon && <Confetti />}
      <span className="bb-crown">{winner ? "🏴‍☠️" : "⚓"}</span>
      <h2>{winner ? (iWon ? "You rule the bay!" : `${name(winner)} rules the bay!`) : "The table emptied"}</h2>
      <div className="list" style={{ width: "100%", maxWidth: 360 }}>
        {order.map((p, i) => (
          <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
            <span style={{ width: 28, fontSize: 18, fontWeight: 900 }}>{i === 0 && winner ? "🏆" : `#${i + 1}`}</span>
            <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{name(p)}</span>
            <span>{p === winner ? "🎲".repeat(Math.max(1, g.counts[p])) : "☠️"}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/bluff"); }}>Back home</button>
    </div>
  );
}
