"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { BETS, ITEM_MAX, themeOf } from "../../../convex/lib/truth/rules";
import { Toast } from "@/components/words/common";
import { Confetti, Icon, Mascot, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { GAME_NAME, Vault, type TruthGameView, type TruthView } from "./common";

type Move = { kind: "write"; items: string[]; lie: number } | { kind: "guess"; pick: number; bet: number } | { kind: "ask"; item: number } | { kind: "next" };
type ToastT = { text: string; kind: "bad" | "good"; id: number } | null;
type Props = { room: TruthView; g: TruthGameView; partnerName: string; send: (m: Move) => Promise<boolean> };

export function TruthPlay({ room }: { room: TruthView }) {
  const g = room.game!;
  const act = useMutation(api.truth.act);
  const [toast, setToast] = useState<ToastT>(null);
  const partnerName = g.names[g.partner] ?? "your partner";

  async function send(move: Move) {
    feedback.unlock();
    feedback.tap();
    try {
      await act({ code: room.code, round: g.round, move });
      return true;
    } catch (e) {
      feedback.wrong();
      setToast({ text: errorText(e, "Not allowed"), kind: "bad", id: Date.now() });
      return false;
    }
  }

  const key = `${g.round}${g.phase}`;
  const last = useRef(key);
  useEffect(() => {
    if (key === last.current || g.done) { last.current = key; return; }
    last.current = key;
    if (g.phase === "reveal") {
      const r = g.results.at(-1);
      if (r && r.points[room.meId] >= r.points[g.partner]) feedback.correct(); else feedback.wrong();
    } else feedback.ping();
  }, [key, g.done, g.phase, g.results, g.partner, room.meId]);

  const theme = themeOf(g.theme ?? "random");
  return (
    <main className="screen tight tl-screen">
      <Header room={room} g={g} />
      {!g.done && (
        <>
          <div className="tl-hud">
            <span className="chip tl-chip">ROUND {g.round + 1}/{g.rounds}</span>
            <span className="grow" />
            {g.players.map((p) => (
              <span key={p} className={`chip tl-score${p === room.meId ? " me" : ""}`}>{p === room.meId ? "You" : g.names[p]} {g.scores[p]}</span>
            ))}
          </div>
          <section className="tl-theme rise" key={g.round}>
            <span className="ico">{theme.icon}</span>
            <span className="txt"><b>{theme.name}</b>{theme.prompt}</span>
          </section>
        </>
      )}
      {g.done ? null : !g.isPlayer ? (
        <p className="tl-wait wait">You&apos;re watching.</p>
      ) : g.phase === "write" ? (
        <Write key={g.round} room={room} g={g} partnerName={partnerName} send={send} />
      ) : g.phase === "guess" ? (
        <Guess key={g.round} room={room} g={g} partnerName={partnerName} send={send} />
      ) : (
        <Reveal room={room} g={g} partnerName={partnerName} send={send} />
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} />}
    </main>
  );
}

// ---------- Writing your three ----------
function Write({ g, partnerName, send }: Props) {
  const theme = themeOf(g.theme ?? "random");
  const [items, setItems] = useState(["", "", ""]);
  const [lie, setLie] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  if (g.mine) {
    return (
      <>
        <div className="tl-mine">
          {g.mine.items.map((t, i) => (
            <p key={i} className={`tl-item${i === g.mine!.lie ? " lie" : ""}`}><span>{i === g.mine!.lie ? "🤥" : "✅"}</span>{t}</p>
          ))}
        </div>
        <p className="tl-wait wait">{g.partnerWrote ? "Both done! Here we go…" : `Locked in. ${partnerName} is still writing…`}</p>
      </>
    );
  }
  const ok = items.every((s) => s.trim().length >= 4) && lie !== null;
  async function go() {
    if (!ok || lie === null) return;
    setSending(true);
    if (!(await send({ kind: "write", items, lie }))) setSending(false);
  }
  return (
    <>
      <p className="tl-step"><b>Write 2 truths and 1 lie</b> Tap 🤥 on the one you made up. Make the lie believable, and the truths a little surprising!</p>
      <div className="tl-inputs">
        {items.map((t, i) => (
          <div key={i} className={`tl-inrow${lie === i ? " lie" : ""}`}>
            <input className="input" maxLength={ITEM_MAX} value={t} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? theme.example : i === 1 ? "Another thing about you…" : "And one more…"} aria-label={`Statement ${i + 1}`} autoComplete="off" />
            <button type="button" className="tl-lie" aria-pressed={lie === i} aria-label={`Statement ${i + 1} is the lie`} onClick={() => { feedback.tap(); setLie(i); }}>🤥</button>
          </div>
        ))}
      </div>
      <p className="tl-hint">{lie === null ? "Tap 🤥 next to the one that's the lie." : `“${items[lie] || `Statement ${lie + 1}`}” is your lie. 🤫`}</p>
      <div className="grow" />
      <button className="btn btn-green" disabled={!ok || sending} onClick={go}>Lock in</button>
    </>
  );
}

// ---------- Guessing the lie ----------
function Guess({ g, partnerName, send }: Props) {
  const [pick, setPick] = useState<number | null>(null);
  const [bet, setBet] = useState(1);
  const [sending, setSending] = useState(false);
  if (g.myGuess) {
    return (
      <>
        <div className="tl-mine">
          {(g.theirs ?? []).map((t, i) => (
            <p key={i} className={`tl-item${i === g.myGuess!.shown ? " picked" : ""}`}><span>{i === g.myGuess!.shown ? "🤥?" : "•"}</span>{t}</p>
          ))}
        </div>
        <p className="tl-wait wait">{g.partnerGuessed ? "Revealing…" : `You bet ${g.myGuess.bet}. ${partnerName} is still guessing…`}</p>
      </>
    );
  }
  async function go() {
    if (pick === null) return;
    setSending(true);
    if (!(await send({ kind: "guess", pick, bet }))) setSending(false);
  }
  return (
    <>
      <p className="tl-step"><b>Which one is {partnerName}&apos;s lie?</b> Ask questions on the call first. Squint at them. Then pick.</p>
      <div className="tl-cards">
        {(g.theirs ?? []).map((t, i) => (
          <button key={i} type="button" className="tl-card" aria-pressed={pick === i} onClick={() => { feedback.tap(); setPick(i); }}>
            <span className="no">{i + 1}</span>{t}
            {pick === i && <span className="tag">🤥 the lie?</span>}
          </button>
        ))}
      </div>
      <div className="tl-bets">
        <span className="label">How sure are you?</span>
        {BETS.map((b) => (
          <button key={b} type="button" className="tl-bet" aria-pressed={bet === b} onClick={() => { feedback.tap(); setBet(b); }}>
            {["🤔", "🙂", "😎"][b - 1]} {b} {b === 1 ? "pt" : "pts"}
          </button>
        ))}
      </div>
      <div className="grow" />
      <button className="btn btn-green" disabled={pick === null || sending} onClick={go}>{pick === null ? "Pick the lie" : `Bet ${bet} on it`}</button>
    </>
  );
}

// ---------- The reveal ----------
function Reveal({ room, g, partnerName, send }: Props) {
  const r = g.results.at(-1);
  const me = room.meId, them = g.partner;
  const ready = g.ready.includes(me);
  if (!r) return null;
  const myAsk = g.asks[me];
  const theirAsk = g.asks[them];
  const side = (owner: string) => {
    const e = r.entries[owner];
    const guesser = owner === me ? them : me;
    const gs = r.guesses[guesser];
    const right = gs.pick === e.lie;
    return (
      <section className={`tl-side rise${owner === me ? " me" : ""}`}>
        <h3>{owner === me ? "Your three" : `${partnerName}'s three`}</h3>
        {e.items.map((t, i) => {
          const isLie = i === e.lie;
          const guessed = gs.pick === i;
          const canAsk = owner === them && !isLie;
          return (
            <div key={i} className={`tl-item${isLie ? " lie" : " true"}${guessed ? " guessed" : ""}`}>
              <span>{isLie ? "🤥" : "✅"}</span>
              <span className="t">{t}</span>
              {guessed && <i>{guesser === me ? "your guess" : `${partnerName}'s guess`}</i>}
              {canAsk && (
                <button type="button" className={`tl-ask${myAsk === i ? " on" : ""}`} onClick={() => void send({ kind: "ask", item: i })}>{myAsk === i ? "📖 Asked!" : "Tell me more"}</button>
              )}
            </div>
          );
        })}
        <p className={`tl-outcome${(guesser === me) === right ? " good" : ""}`}>
          {right ? `${guesser === me ? "You" : partnerName} spotted it! +${gs.bet} ${guesser === me ? "you" : partnerName}` : `${owner === me ? "You" : partnerName} fooled ${guesser === me ? "you" : partnerName}! +${gs.bet} ${owner === me ? "you" : partnerName}`}
        </p>
      </section>
    );
  };
  return (
    <>
      {side(them)}
      {side(me)}
      {theirAsk !== undefined && (
        <p className="tl-storytime pop">📖 <b>Story time!</b> {partnerName} wants to hear about “{r.entries[me].items[theirAsk]}”. Tell them now!</p>
      )}
      {myAsk === undefined && <p className="tl-hint">Tap “Tell me more” on one of {partnerName}&apos;s truths to hear the story behind it.</p>}
      <p className="tl-saved">🔐 The truths went into your Vault</p>
      <button className={`btn ${ready ? "btn-white" : "btn-green"}`} disabled={ready} onClick={() => void send({ kind: "next" })}>
        {ready ? `Waiting for ${partnerName}…` : g.round + 1 >= g.rounds ? "See who won" : "Next round"}
      </button>
    </>
  );
}

// ---------- Header and end ----------
function Header({ room, g }: { room: TruthView; g: TruthGameView }) {
  const router = useRouter();
  const leave = useMutation(api.truth.leave);
  const [ask, setAsk] = useState(false);
  const [vault, setVault] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/truth"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip tl-chip">{GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <button className="icon-btn" aria-label="Open the Vault" onClick={() => { feedback.tap(); setVault(true); }}>🔐</button>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>Truths revealed so far stay in your Vault.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
      <Vault open={vault} onClose={() => setVault(false)} vault={room.vault} members={room.members} meId={room.meId} />
    </>
  );
}

function Done({ room, g }: { room: TruthView; g: TruthGameView }) {
  const router = useRouter();
  const rematch = useMutation(api.truth.rematch);
  const leave = useMutation(api.truth.leave);
  const [vault, setVault] = useState(false);
  const me = room.meId;
  const left = g.done?.reason === "left";
  const best = Math.max(...g.players.map((p) => g.scores[p]));
  const winners = g.players.filter((p) => g.scores[p] === best);
  const name = (p: string) => (p === me ? "You" : g.names[p]);
  const detective = [...g.players].sort((a, b) => g.stats[b].spotted - g.stats[a].spotted)[0];
  const liar = [...g.players].sort((a, b) => g.stats[b].fooled - g.stats[a].fooled)[0];
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (!left) feedback.win();
  }, [left]);
  return (
    <div className="overlay tl-done">
      {!left && winners.includes(me) && <Confetti />}
      <Mascot size={84} mood={left ? "wow" : "joy"} className={left ? undefined : "jump"} />
      <h2>{left ? "Your partner left" : winners.length > 1 ? "A tie!" : `${name(winners[0])} ${winners[0] === me ? "win" : "wins"}!`}</h2>
      {!left && (
        <>
          <p className="tl-final">{g.players.map((p) => `${name(p)} ${g.scores[p]}`).join(" · ")}</p>
          <div className="tl-awards">
            <span><b>🕵️ Lie detector</b>{name(detective)} · {g.stats[detective].spotted} spotted</span>
            <span><b>🎭 Best liar</b>{name(liar)} · {g.stats[liar].fooled} fooled</span>
          </div>
        </>
      )}
      <p className="tl-final">🔐 Your Vault holds {room.vault.length} truths about each other</p>
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); setVault(true); }}>Open the Vault</button>
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/truth"); }}>Back home</button>
      <Vault open={vault} onClose={() => setVault(false)} vault={room.vault} members={room.members} meId={room.meId} />
    </div>
  );
}
