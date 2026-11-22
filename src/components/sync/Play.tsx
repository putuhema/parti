"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { questionById, type Question } from "../../../convex/lib/sync/deck";
import { ASK_OPT_LEN, ASK_Q_LEN, OPEN_LEN, REACTIONS, verdict, type Result, type Value } from "../../../convex/lib/sync/rules";
import { Toast } from "@/components/words/common";
import { Confetti, Icon, Mascot, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";
import { DECK_LOOK, GAME_NAME, Ring, answerText, deckVars, timeAgo, useNameOf, type NameOf, type SyncGameView, type SyncView } from "./common";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
type ToastT = { text: string; kind: "bad" | "good"; id: number } | null;

export function SyncPlay({ room }: { room: SyncView }) {
  const g = room.game!;
  const nameOf = useNameOf(room);
  const [toast, setToast] = useState<ToastT>(null);
  const oops = (e: unknown) => { feedback.wrong(); setToast({ text: errorText(e, "Not allowed"), kind: "bad", id: Date.now() }); };
  const partnerName = g.names[g.partner] ?? "them";

  // A little sound when the reveal lands or a new card starts.
  const last = useRef(`${g.i}${g.phase}`);
  useEffect(() => {
    const key = `${g.i}${g.phase}`;
    if (key !== last.current && !g.done) {
      if (g.phase === "reveal") feedback.correct();
      else feedback.ping();
    }
    last.current = key;
  }, [g.i, g.phase, g.done]);

  const deck = g.card?.ask ? "ask" : g.question?.deck ?? "light";
  return (
    <main className="screen tight sy-screen" style={deckVars(deck)}>
      <Header room={room} g={g} />
      {!g.done && (
        <div className="sy-progress" aria-label={`Card ${g.i + 1} of ${g.total}`}>
          {Array.from({ length: g.total }, (_, k) => (
            <span key={k} className={k < g.i ? "on" : k === g.i ? "now" : ""} />
          ))}
        </div>
      )}
      {g.done ? null : !g.isPlayer ? (
        <p className="sy-wait wait">You&apos;re watching.</p>
      ) : g.phase === "write" ? (
        g.card?.ask === room.meId ? <Write key={g.i} room={room} g={g} partnerName={partnerName} oops={oops} /> : <Waiting text={`${partnerName} is writing a question just for you…`} />
      ) : g.phase === "answer" ? (
        <Answer key={g.i} room={room} g={g} nameOf={nameOf} partnerName={partnerName} oops={oops} />
      ) : (
        <Reveal key={g.i} room={room} g={g} nameOf={nameOf} partnerName={partnerName} oops={oops} />
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} partnerName={partnerName} />}
    </main>
  );
}

// ---------- The question card ----------
function QuestionCard({ g, partnerName, compact }: { g: SyncGameView; partnerName: string; compact?: boolean }) {
  const q = g.question;
  const look = DECK_LOOK[g.card?.ask ? "ask" : q?.deck ?? "light"];
  const now = useNow(60_000);
  return (
    <section className={`sy-card rise${compact ? " compact" : ""}`}>
      <span className="sy-deck">
        {look.label}
        {g.card?.throwback && <span className="sy-throw">🔁 THROWBACK · {timeAgo(g.card.throwback.at, now).toUpperCase()}</span>}
      </span>
      {g.card?.ask && <span className="sy-from">{g.card.ask === g.partner ? `${partnerName} asks you:` : `You asked ${partnerName}:`}</span>}
      <span className="sy-q">{q?.q ?? "…"}</span>
    </section>
  );
}

// ---------- Answering ----------
function Answer({ room, g, nameOf, partnerName, oops }: { room: SyncView; g: SyncGameView; nameOf: NameOf; partnerName: string; oops: (e: unknown) => void }) {
  const send = useMutation(api.sync.answer);
  const q = g.question!;
  const need = g.needs;
  const [step, setStep] = useState<"me" | "guess">(need.me ? "me" : "guess");
  const [me, setMe] = useState<Value | null>(null);
  const [guess, setGuess] = useState<Value | null>(null);
  const [sending, setSending] = useState(false);

  if (g.mine) {
    return (
      <>
        <QuestionCard g={g} partnerName={partnerName} compact />
        <section className="sy-locked rise">
          <span className="sy-lock">🔒</span>
          <b>Locked in!</b>
          <span className="wait">{g.partnerDone ? "Revealing…" : `Waiting for ${partnerName}…`}</span>
        </section>
        <p className="sy-tip">Tip: no peeking, no hints on the call 🤫</p>
      </>
    );
  }

  const value = step === "me" ? me : guess;
  const set = step === "me" ? setMe : setGuess;
  const filled = value !== null && (q.type !== "open" || (typeof value === "string" && value.trim().length > 0)) && (q.type !== "rank" || (value as number[]).length === q.items.length);
  const last = step === "guess" || !need.guess;

  async function go() {
    if (!filled) return;
    feedback.tap();
    if (!last) { setStep("guess"); return; }
    setSending(true);
    try {
      await send({ code: room.code, card: g.i, ...(need.me ? { me: me! } : {}), ...(need.guess ? { guess: guess! } : {}) });
    } catch (e) { oops(e); setSending(false); }
  }

  const prompt = step === "me"
    ? q.type === "who" ? "Who's it? Be honest." : q.type === "open" ? "Your answer" : q.type === "rank" ? "Your ranking: tap from favourite to least" : "Your answer"
    : q.type === "rank" ? `How will ${partnerName} rank them?` : q.type === "scale" ? `Where will ${partnerName} put it?` : `What will ${partnerName} pick?`;

  return (
    <>
      <QuestionCard g={g} partnerName={partnerName} />
      <div className="sy-step">
        {need.me && need.guess && <span className="sy-stepno">{step === "me" ? "1/2" : "2/2"}</span>}
        <span className={`sy-prompt${step === "guess" ? " guess" : ""}`}>{step === "guess" && "🔮 "}{prompt}</span>
      </div>
      <Input key={step} q={q} value={value} onChange={set} room={room} g={g} nameOf={nameOf} />
      <div className="grow" />
      <div className="sy-actions">
        {step === "guess" && need.me && <button className="btn btn-white btn-sm" onClick={() => { feedback.tap(); setStep("me"); }}><Icon.Back /> Back</button>}
        <button className="btn btn-green" disabled={!filled || sending} onClick={go}>{last ? "Lock in" : `Next: guess ${partnerName}`}</button>
      </div>
    </>
  );
}

function Input({ q, value, onChange, room, g, nameOf }: { q: Question; value: Value | null; onChange: (v: Value | null) => void; room: SyncView; g: SyncGameView; nameOf: NameOf }) {
  if (q.type === "pick") {
    return (
      <div className={`sy-options n${q.options.length}`}>
        {q.options.map((o, k) => (
          <button key={k} type="button" className="sy-opt" aria-pressed={value === k} onClick={() => { feedback.tap(); onChange(k); }}>{o}</button>
        ))}
      </div>
    );
  }
  if (q.type === "scale") {
    const v = typeof value === "number" ? value : null;
    return (
      <div className="sy-scale">
        <span className="sy-scalenum" aria-hidden="true">{v ?? "?"}<small>/10</small></span>
        <input type="range" min={0} max={10} step={1} value={v ?? 5} onChange={(e) => onChange(Number(e.target.value))} onPointerDown={() => { if (v === null) onChange(5); }} aria-label={q.q} className={v === null ? "unset" : ""} />
        <div className="sy-scalelabels"><span>{q.lo}</span><span>{q.hi}</span></div>
      </div>
    );
  }
  if (q.type === "rank") {
    const order = Array.isArray(value) ? value : [];
    return (
      <div className="sy-rank">
        {q.items.map((item, k) => {
          const pos = order.indexOf(k);
          return (
            <button key={k} type="button" className="sy-rankitem" aria-pressed={pos >= 0} onClick={() => { feedback.tap(); onChange(pos >= 0 ? order.filter((x) => x !== k) : [...order, k]); }}>
              <span className="no">{pos >= 0 ? pos + 1 : ""}</span>{item}
            </button>
          );
        })}
        <button type="button" className="btn btn-ghost btn-sm" disabled={!order.length} onClick={() => onChange([])}>Start over</button>
      </div>
    );
  }
  if (q.type === "who") {
    const ids = [room.meId, g.partner];
    return (
      <div className="sy-options n2">
        {ids.map((id) => (
          <button key={id} type="button" className="sy-opt who" aria-pressed={value === id} onClick={() => { feedback.tap(); onChange(id); }}>
            <span className="sy-face">{id === room.meId ? "🙋" : "👉"}</span>{id === room.meId ? "Me" : nameOf(id)}
          </button>
        ))}
      </div>
    );
  }
  return (
    <textarea className="input sy-open" maxLength={OPEN_LEN} rows={3} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer…" aria-label="Your answer" />
  );
}

// ---------- Your own question ----------
const IDEAS = ["Which of my habits is the most annoying?", "What would I order at a warung?", "Where would I go if I could leave tomorrow?", "What was I like when we first met?"];

function Write({ room, g, partnerName, oops }: { room: SyncView; g: SyncGameView; partnerName: string; oops: (e: unknown) => void }) {
  const ask = useMutation(api.sync.ask);
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [sending, setSending] = useState(false);
  const ok = q.trim() && opts.filter((o) => o.trim()).length >= 2;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    feedback.tap();
    setSending(true);
    try { await ask({ code: room.code, card: g.i, q, options: opts.filter((o) => o.trim()) }); } catch (err) { oops(err); setSending(false); }
  }
  return (
    <form className="sy-write rise" onSubmit={go}>
      <section className="sy-card">
        <span className="sy-deck">{DECK_LOOK.ask.label}</span>
        <span className="sy-q small">Your turn! Ask {partnerName} anything. They answer, you guess what they&apos;ll pick.</span>
      </section>
      <label className="label" htmlFor="syq">Your question</label>
      <input id="syq" className="input" maxLength={ASK_Q_LEN} value={q} onChange={(e) => setQ(e.target.value)} placeholder={IDEAS[g.i % IDEAS.length]} autoComplete="off" />
      <span className="label">Answers to choose from</span>
      {opts.map((o, k) => (
        <div key={k} className="sy-optrow">
          <input className="input" maxLength={ASK_OPT_LEN} value={o} onChange={(e) => setOpts(opts.map((x, j) => (j === k ? e.target.value : x)))} placeholder={`Answer ${k + 1}`} aria-label={`Answer ${k + 1}`} autoComplete="off" />
          {opts.length > 2 && <button type="button" className="icon-btn" aria-label={`Remove answer ${k + 1}`} onClick={() => setOpts(opts.filter((_, j) => j !== k))}><Icon.Close /></button>}
        </div>
      ))}
      {opts.length < 4 && <button type="button" className="btn btn-white btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpts([...opts, ""])}>+ Add an answer</button>}
      <div className="grow" />
      <button className="btn btn-green" disabled={!ok || sending}>Ask {partnerName}</button>
    </form>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <section className="sy-waiting">
      <Mascot size={84} className="bob" />
      <p className="wait">{text}</p>
    </section>
  );
}

// ---------- The reveal ----------
function Reveal({ room, g, nameOf, partnerName, oops }: { room: SyncView; g: SyncGameView; nameOf: NameOf; partnerName: string; oops: (e: unknown) => void }) {
  const next = useMutation(api.sync.next);
  const react = useMutation(api.sync.react);
  const res = g.results[g.i] as Result | undefined;
  const q = g.question;
  const now = useNow(60_000);
  const iAmReady = g.ready.includes(room.meId);
  const partnerReady = g.ready.includes(g.partner);

  // Your partner's reactions get a little buzz.
  const lastN = useRef(g.reactions.at(-1)?.n ?? 0);
  useEffect(() => {
    const newest = g.reactions.at(-1);
    if (newest && newest.n > lastN.current && newest.by !== room.meId) feedback.tick();
    lastN.current = newest?.n ?? lastN.current;
  }, [g.reactions, room.meId]);

  if (!res || !q) return null;
  const v = verdict(res.sync);
  const me = room.meId, them = g.partner;
  const say = (id: string) => (id === me ? "You" : partnerName);

  return (
    <>
      <QuestionCard g={g} partnerName={partnerName} compact />
      {v && <p className={`sy-verdict pop${(res.sync ?? 0) >= 0.7 ? " good" : ""}`}>{v}</p>}

      {q.type === "scale" ? (
        <ScaleReveal q={q} res={res} me={me} them={them} partnerName={partnerName} />
      ) : q.type === "open" ? (
        <div className="sy-bubbles">
          {[me, them].map((p) => (
            <div key={p} className={`sy-bubble${p === me ? " me" : ""}`}><b>{say(p)}</b>{String(res.entries[p]?.me ?? "—")}</div>
          ))}
        </div>
      ) : q.type === "who" ? (
        <div className="sy-rows">
          {[me, them].map((p) => (
            <div key={p} className={`sy-row${p === me ? " me" : ""}`}><span>{say(p)} said</span><b>{res.entries[p]?.me === p ? (p === me ? "Me!" : "Themselves!") : res.entries[p]?.me === me ? (p === me ? "Me!" : "You!") : nameOf(res.entries[p]?.me as string)}</b></div>
          ))}
        </div>
      ) : (
        <div className="sy-rows">
          {[me, them].filter((p) => res.entries[p]?.me !== undefined).map((p) => {
            const guesser = p === me ? them : me;
            const s = res.scores[guesser];
            return (
              <div key={p} className={`sy-row${p === me ? " me" : ""}`}>
                <span>{say(p)} {q.type === "rank" ? "ranked" : "picked"}</span>
                {q.type === "rank" ? (
                  <span className="sy-pills">{(res.entries[p]?.me as number[]).map((k, n) => <span key={k}><i>{n + 1}</i>{q.items[k]}</span>)}</span>
                ) : (
                  <b>{answerText(q, res.entries[p]?.me, nameOf)}</b>
                )}
                <span className="sy-guess">
                  {say(guesser)} guessed: {answerText(q, res.entries[guesser]?.guess, nameOf)}
                  <i className={s === 1 ? "yes" : s && s > 0 ? "meh" : "no"}>{s === 1 ? "✓" : s && s > 0 ? `${Math.round(s * 100)}%` : "✗"}</i>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {g.card?.throwback?.answers && (
        <div className="sy-then">
          <b>🔁 {cap(timeAgo(g.card.throwback.at, now))}:</b> you said {answerText(q, g.card.throwback.answers[me], nameOf)} · {partnerName} said {answerText(q, g.card.throwback.answers[them], nameOf)}
          <span>Did anything change? Why?</span>
        </div>
      )}

      <section className="sy-talk rise">
        <span className="label">💬 Talk about it</span>
        <p>{q.talk}</p>
      </section>

      <div className="sy-reacts" aria-label="React">
        {REACTIONS.map((e) => (
          <button key={e} type="button" className="sy-react" aria-label={`React ${e}`} onClick={() => { feedback.tap(); void react({ code: room.code, card: g.i, e }).catch(oops); }}>{e}</button>
        ))}
      </div>
      <div className="sy-floats" aria-hidden="true">
        {g.reactions.slice(-10).map((r) => (
          <span key={r.n} className={`sy-float${r.by === me ? " me" : ""}`} style={{ left: `${12 + ((r.n * 37) % 70)}%` }}>{r.e}</span>
        ))}
      </div>

      <div className="grow" />
      <button className={`btn ${iAmReady ? "btn-white" : "btn-green"}`} disabled={iAmReady} onClick={() => { feedback.tap(); void next({ code: room.code, card: g.i }).catch(oops); }}>
        {iAmReady ? `Waiting for ${partnerName}…` : g.i + 1 >= g.total ? "See our results" : partnerReady ? `${partnerName} is ready. Next card` : "Next card"}
      </button>
    </>
  );
}

function ScaleReveal({ q, res, me, them, partnerName }: { q: Extract<Question, { type: "scale" }>; res: Result; me: string; them: string; partnerName: string }) {
  const at = (v: unknown) => `${((typeof v === "number" ? v : 5) / 10) * 100}%`;
  const marks = [
    { id: "a", label: "You", v: res.entries[me]?.me, cls: "me" },
    { id: "b", label: partnerName, v: res.entries[them]?.me, cls: "them" },
  ];
  const guesses = [
    { id: "c", label: `Your guess for ${partnerName}`, v: res.entries[me]?.guess, s: res.scores[me], cls: "me" },
    { id: "d", label: `${partnerName}'s guess for you`, v: res.entries[them]?.guess, s: res.scores[them], cls: "them" },
  ];
  return (
    <div className="sy-track-wrap">
      <div className="sy-track">
        {marks.map((m) => (
          <span key={m.id} className={`sy-mark ${m.cls}`} style={{ left: at(m.v) }}><b>{m.v as number}</b><small>{m.label}</small></span>
        ))}
      </div>
      <div className="sy-scalelabels"><span>{q.lo}</span><span>{q.hi}</span></div>
      {guesses.map((gu) => (
        <div key={gu.id} className="sy-guessline">
          <span className={`dot ${gu.cls}`} />{gu.label}: <b>{gu.v as number}</b>
          <i className={gu.s === 1 ? "yes" : gu.s && gu.s > 0 ? "meh" : "no"}>{gu.s === 1 ? "✓" : `${Math.round((gu.s ?? 0) * 100)}%`}</i>
        </div>
      ))}
    </div>
  );
}

// ---------- Header and results ----------
function Header({ room, g }: { room: SyncView; g: SyncGameView }) {
  const router = useRouter();
  const leave = useMutation(api.sync.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/sync"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip sy-chip">{GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        {!g.done && g.results.some((r) => r.sync !== null) && <span className="chip sy-meter" aria-label={`${g.sync}% in sync so far`}>💞 {g.sync}%</span>}
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>The game ends for both of you.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, partnerName }: { room: SyncView; g: SyncGameView; partnerName: string }) {
  const router = useRouter();
  const rematch = useMutation(api.sync.rematch);
  const leave = useMutation(api.sync.leave);
  const left = g.done?.reason === "left";
  const sync = g.sync;
  const best = room.pair?.bestSync ?? 0;
  const newBest = !left && room.pair && room.pair.games > 1 && sync >= best;
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (!left) feedback.win();
  }, [left]);

  const scored = g.results.filter((r) => r.sync !== null);
  const perfect = scored.filter((r) => r.sync === 1).length;
  const surprise = [...scored].sort((a, b) => a.sync! - b.sync!)[0];
  const surpriseQ = surprise ? surprise.card.custom?.q ?? questionById(surprise.card.qid)?.q ?? null : null;
  return (
    <div className="overlay sy-done">
      {!left && sync >= 70 && <Confetti />}
      {left ? (
        <>
          <Mascot size={88} mood="wow" />
          <h2 className="sy-donetitle">{partnerName} left the game</h2>
        </>
      ) : (
        <>
          <Ring pct={sync} size={150} label="IN SYNC" />
          <h2 className="sy-donetitle">{sync >= 85 ? "Soulmates? 💞" : sync >= 65 ? "Pretty in sync!" : sync >= 45 ? "Still learning each other" : "So much to talk about!"}</h2>
          <p className="sy-donesub">{newBest ? "🏆 Your best game together yet!" : room.pair && room.pair.games > 1 ? `Game ${room.pair.games} together · best ${best}%` : "Your first game together!"}</p>
          <div className="sy-knows">
            <span><b>{g.knows[room.meId] ?? 0}%</b>You read {partnerName}</span>
            <span><b>{g.knows[g.partner] ?? 0}%</b>{partnerName} read you</span>
            <span><b>{perfect}</b>Perfect matches</span>
          </div>
          {surprise && surpriseQ && (surprise.sync ?? 1) < 0.7 && (
            <div className="sy-surprise">
              <span className="label">😳 Biggest surprise</span>
              <b>{surpriseQ}</b>
              <span>Worth a second chat?</span>
            </div>
          )}
        </>
      )}
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/sync"); }}>Back home</button>
    </div>
  );
}

