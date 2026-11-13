"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { CHOICE_MS, COLS, GROUPS, LAP_BONUS, N, ROLL_MS, ROWS, SPACES, TAX, HUB_RENT, baseRent, buildCost, cellOf, eventMs, isBot, priceOf, type BoomEvent } from "../../../convex/lib/boom/rules";
import { Countdown, TimerBar, Toast } from "@/components/words/common";
import { Confetti, Icon, Mascot, Sheet, type Paint } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { GAME_NAME, describe, money, seatPaints, short, useNameOf, type BoomGameView, type BoomView } from "./common";

type NameOf = (id?: string | null) => string;
type Paints = Map<string, Paint>;
type Banner = { n: number; text: string; tone: "good" | "bad" | "info"; kind: BoomEvent["kind"] };
type Dice = { faces: [number, number]; rolling: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const HOUSES = ["", "🛖", "🏪", "🏨"];
const LEVELS = ["Empty lot", "Warung", "Ruko", "Hotel"];
const paintVars = (p?: Paint) => (p ? ({ "--face": p.face, "--edge": p.edge, "--soft": p.soft } as CSSProperties) : undefined);

export function BoomPlay({ room }: { room: BoomView }) {
  const live = room.game!;
  const nameOf = useNameOf(room);
  const paints = seatPaints(live, room.meId);
  const act = useMutation(api.boom.act);

  // The board on screen lags the server while dice roll and tokens hop, then catches up.
  const [shown, setShown] = useState(live);
  const [tokens, setTokens] = useState<Record<string, number>>(live.pos);
  const [dice, setDice] = useState<Dice>({ faces: [3, 4], rolling: false });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "bad"; id: number } | null>(null);
  const [info, setInfo] = useState<number | null>(null);

  const latest = useRef(live);
  const lastN = useRef(live.log.at(-1)?.n ?? 0);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function play(e: BoomEvent) {
    const say = () => setBanner({ n: e.n, kind: e.kind, ...describe(e, nameOf, room.meId) });
    if (e.kind === "roll") {
      setBanner(null);
      setDice({ faces: e.dice!, rolling: true });
      feedback.tick();
      await sleep(650);
      setDice({ faces: e.dice!, rolling: false });
      say();
      await sleep(250);
      for (let at = e.from!; at !== e.to; ) {
        at = (at + 1) % N;
        const here = at;
        setTokens((t) => ({ ...t, [e.by]: here }));
        if (e.by === room.meId) feedback.tap();
        await sleep(190);
      }
      return;
    }
    if (e.to !== undefined) setTokens((t) => ({ ...t, [e.by]: e.to! }));
    say();
    const tone = describe(e, nameOf, room.meId).tone;
    if (tone === "good") feedback.correct();
    else if (tone === "bad") feedback.wrong();
    await sleep(eventMs(e));
  }

  useEffect(() => {
    latest.current = live;
    if (running.current) return;
    running.current = true;
    void (async () => {
      while (alive.current) {
        const g = latest.current;
        const fresh = g.log.filter((e) => e.n > lastN.current);
        // Nothing new, or far behind (the tab was asleep): jump straight to now.
        if (!fresh.length || fresh.length > 12) {
          lastN.current = g.log.at(-1)?.n ?? lastN.current;
          setShown(g);
          setTokens(g.pos);
          break;
        }
        for (const e of fresh) {
          if (!alive.current) break;
          await play(e);
          lastN.current = e.n;
        }
      }
      running.current = false;
    })();
  }, [live.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const g = shown;
  const settled = shown.seq === live.seq;
  const myTurn = g.isPlayer && g.turn === room.meId && !g.done && settled;
  const offer = !g.done && g.phase !== "roll" ? g.pos[g.turn] : null;

  // A ping when it becomes your turn.
  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current) feedback.ping();
    wasMine.current = myTurn;
  }, [myTurn]);

  async function send(move: { kind: "roll" } | { kind: "choose"; yes: boolean }) {
    if (sending) return;
    feedback.unlock();
    feedback.tap();
    setSending(true);
    try {
      await act({ code: room.code, move });
    } catch (e) {
      feedback.wrong();
      setToast({ text: errorText(e, "Not allowed"), kind: "bad", id: Date.now() });
    }
    setSending(false);
  }

  return (
    <main className="screen tight bm-screen">
      <Header room={room} g={g} />
      <div className="bm-wrap">
        <div className="bm-board">
          {SPACES.map((_, i) => (
            <Tile key={i} i={i} g={g} paints={paints} nameOf={nameOf} offer={offer === i} onTap={() => { feedback.tap(); setInfo(i); }} />
          ))}

          <section className="bm-panel" aria-live="polite">
            <div className="bm-scores">
              {g.players.map((p) => (
                <div key={p} className={`bm-score${g.turn === p && !g.done ? " on" : ""}${g.out.includes(p) ? " gone" : ""}`} style={paintVars(paints.get(p))} aria-current={g.turn === p ? "true" : undefined}>
                  <span className="dot" aria-hidden="true">{isBot(p) ? "🤖" : nameOf(p).slice(0, 1)}</span>
                  <span className="nm">{nameOf(p)}</span>
                  <span key={g.cash[p]} className="cash pop">{g.out.includes(p) ? "OUT" : money(g.cash[p])}</span>
                </div>
              ))}
            </div>
            <div className="bm-meta">
              <span>ROUND {Math.min(g.round, g.maxRounds)}/{g.maxRounds}</span>
              <span>ARISAN {money(g.pot)}</span>
            </div>
            <div className="bm-decks" aria-hidden="true">
              <span key={banner?.kind === "card" ? `q${banner.n}` : "q"} className={`bm-deck q${banner?.kind === "card" ? " flash" : ""}`}>?<small>KEJUTAN</small></span>
              <span key={banner?.kind === "bonus" ? `g${banner.n}` : "g"} className={`bm-deck g${banner?.kind === "bonus" ? " flash" : ""}`}>🎁<small>THR</small></span>
            </div>
            <p key={offer !== null && settled ? "offer" : banner?.n ?? 0} className={`bm-banner${offer !== null && settled ? " in" : banner ? ` in ${banner.tone}` : ""}`} style={{ margin: 0 }}>
              {offer !== null && settled
                ? g.phase === "buy" ? `${SPACES[offer].name} is for sale` : `Build on ${SPACES[offer].name}? Rent goes up to ${money(baseRent(offer, g.level[offer] + 1))}`
                : banner?.text ?? "Buy towns. Collect rent. Be the juragan."}
            </p>
            <div className="bm-turn">
              <span className="bm-turnname">
                <small>{g.done ? "GAME OVER" : "NOW PLAYING"}</small>
                {g.done ? "Final count" : g.turn === room.meId ? "Your turn" : `${nameOf(g.turn)}'s turn`}
              </span>
              <span className="bm-dice" role="img" aria-label={dice.rolling ? "Dice rolling" : `Dice show ${dice.faces[0]} and ${dice.faces[1]}`}>
                <Die face={dice.faces[0]} rolling={dice.rolling} />
                <Die face={dice.faces[1]} rolling={dice.rolling} />
              </span>
            </div>
            <div className="bm-actions">
              {myTurn && g.phase === "roll" && <button className="btn btn-green" disabled={sending} onClick={() => send({ kind: "roll" })}>🎲 Roll</button>}
              {myTurn && g.phase !== "roll" && (
                <div className="row">
                  <button className="btn btn-green" disabled={sending} onClick={() => send({ kind: "choose", yes: true })}>
                    {g.phase === "buy" ? `Buy ${money(priceOf(g.pos[g.turn]))}` : `Build ${money(buildCost(g.pos[g.turn]))}`}
                  </button>
                  <button className="btn btn-white" disabled={sending} onClick={() => send({ kind: "choose", yes: false })}>Skip</button>
                </div>
              )}
              {!myTurn && !g.done && (
                <p className="bm-wait wait">
                  {!settled ? "…" : g.turn === room.meId ? "You're out of this one" : g.phase === "roll" ? `${nameOf(g.turn)} is rolling…` : `${nameOf(g.turn)} is deciding…`}
                </p>
              )}
              {myTurn && <TimerBar deadline={live.deadline} total={g.phase === "roll" ? ROLL_MS : CHOICE_MS} />}
            </div>
          </section>

          <div className="bm-tokens" aria-hidden="true">
            {g.players.map((p) => {
              const at = tokens[p] ?? 0;
              const { col, row } = cellOf(at);
              const mates = g.players.filter((x) => (tokens[x] ?? 0) === at && !g.out.includes(x));
              const k = mates.indexOf(p);
              const dx = mates.length > 1 ? (k - (mates.length - 1) / 2) * 3.4 : 0;
              return (
                <span key={p} className={`bm-token${g.turn === p && !g.done ? " on" : ""}${g.out.includes(p) ? " out" : ""}`}
                  style={{ ...paintVars(paints.get(p)), left: `${((col + 0.5) / COLS) * 100}%`, top: `${((row + 0.5) / ROWS) * 100}%`, transform: `translate(${dx}cqw, ${k * 0.8}cqw)` }}>
                  {isBot(p) ? "🤖" : nameOf(p).slice(0, 1)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <Toast toast={toast} onDone={() => setToast(null)} />
      <TileSheet i={info} onClose={() => setInfo(null)} g={g} nameOf={nameOf} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={live.turn === room.meId ? "You roll first" : `${nameOf(live.turn)} rolls first`} />}
      {g.done && <Done room={room} g={g} nameOf={nameOf} />}
    </main>
  );
}

function Die({ face, rolling }: { face: number; rolling: boolean }) {
  // While rolling, the face flickers through random numbers.
  const [flick, setFlick] = useState(face);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setFlick(1 + Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(t);
  }, [rolling]);
  const on = PIPS[rolling ? flick : face];
  return (
    <span className={`bm-die${rolling ? " rolling" : ""}`}>
      {Array.from({ length: 9 }, (_, k) => (on.includes(k) ? <i key={k} /> : <span key={k} />))}
    </span>
  );
}

const CORNERS: Record<string, { icon: string; c: string; ce: string }> = {
  start: { icon: "🇮🇩", c: "#D62828", ce: "#A81C1C" },
  jail: { icon: "🚦", c: "#1899D6", ce: "#1478A8" },
  jackpot: { icon: "💰", c: "#E08600", ce: "#B86E00" },
  wheel: { icon: "🎡", c: "#A568CC", ce: "#8A4FB5" },
};

function Tile({ i, g, paints, nameOf, offer, onTap }: { i: number; g: BoomGameView; paints: Paints; nameOf: NameOf; offer: boolean; onTap: () => void }) {
  const s = SPACES[i];
  const { col, row } = cellOf(i);
  const place: CSSProperties = { gridColumn: col + 1, gridRow: row + 1 };
  const o = g.owner[i];
  const cls = (extra: string) => `bm-tile ${extra}${offer ? " offer" : ""}`;

  if (s.kind === "lot" || s.kind === "hub") {
    const owned = o ? `, owned by ${nameOf(o)}, rent ${money(g.rents[i])}` : `, for sale at ${money(s.price)}`;
    return (
      <button type="button" className={cls(`${s.kind}${o ? " own" : ""}`)} onClick={onTap} aria-label={`${s.name}${owned}`}
        style={{ ...place, ...paintVars(o ? paints.get(o) : undefined), ...(s.kind === "lot" ? ({ "--g": GROUPS[s.group].color } as CSSProperties) : {}) }}>
        {s.kind === "lot" && <span className="bm-band" />}
        {s.kind === "hub" ? <span className="bm-ico">{s.icon}</span> : !o ? null : g.level[i] ? <span className="bm-ico">{HOUSES[g.level[i]]}</span> : <span className="bm-flag" />}
        <span className="bm-amt">{short(o ? g.rents[i] : s.price)}</span>
      </button>
    );
  }
  if (s.kind === "surprise" || s.kind === "bonus" || s.kind === "tax") {
    return (
      <button type="button" className={cls(`sp ${s.kind}`)} style={place} onClick={onTap} aria-label={s.name}>
        <span className="bm-ico">{s.kind === "surprise" ? "?" : s.kind === "bonus" ? "🎁" : "🧾"}</span>
        <span className="bm-amt">{s.kind === "tax" ? `−${short(TAX)}` : s.kind === "bonus" ? "THR" : "KEJUTAN"}</span>
      </button>
    );
  }
  const c = CORNERS[s.kind];
  return (
    <button type="button" className={cls("corner")} style={{ ...place, "--c": c.c, "--ce": c.ce } as CSSProperties} onClick={onTap} aria-label={s.name}>
      <span className="bm-ico">{c.icon}</span>
      <span className="bm-amt">{s.kind === "jackpot" ? short(g.pot) : s.kind === "start" ? "START" : s.kind === "jail" ? "MACET" : "PASAR"}</span>
    </button>
  );
}

const ABOUT: Record<string, string> = {
  start: `Everyone begins here. It's gajian every time you pass: collect ${money(LAP_BONUS)}.`,
  jail: "Just passing through is fine. If you get stuck in macet, you sit out your next turn.",
  jackpot: "Land here to win the arisan pot. Pajak and fines top it up.",
  wheel: "A night at the pasar malam: win a prize, blow your money, or get stuck in macet on the way out.",
  surprise: "Draw a kejutan card. It might pay you, cost you, or move you.",
  bonus: `THR time! Collect ${money(50)} to ${money(200)}.`,
  tax: `Pay ${money(TAX)} pajak into the arisan pot.`,
};

function TileSheet({ i, onClose, g, nameOf }: { i: number | null; onClose: () => void; g: BoomGameView; nameOf: NameOf }) {
  // Keep the last space on screen while the sheet slides shut.
  const [kept, setKept] = useState(0);
  if (i !== null && i !== kept) setKept(i);
  const k = i ?? kept;
  const s = SPACES[k];
  const o = g.owner[k];
  const hubs = o ? SPACES.filter((x, n) => x.kind === "hub" && g.owner[n] === o).length : 0;
  return (
    <Sheet open={i !== null} onClose={onClose} label={s.name}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>{s.name}</h2>
      {s.kind === "lot" || s.kind === "hub" ? (
        <>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--muted)", textAlign: "center" }}>
            {s.kind === "lot" && <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: GROUPS[s.group].color, marginRight: 6 }} />}
            {s.kind === "lot" ? GROUPS[s.group].name : "Transport"} · {o ? `owned by ${nameOf(o) === "You" ? "you" : nameOf(o)}` : `for sale at ${money(s.price)}`}
          </p>
          <div className="bm-rents">
            {s.kind === "lot"
              ? LEVELS.map((label, lv) => (
                  <Row key={label} label={label} value={money(baseRent(k, lv))} now={!!o && g.level[k] === lv} />
                ))
              : HUB_RENT.slice(1).map((r, n) => <Row key={r} label={`Owner has ${n + 1} of 4`} value={money(r)} now={hubs === n + 1} />)}
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)", textAlign: "center", lineHeight: 1.35 }}>
            {s.kind === "lot"
              ? `Land here again to build for ${money(buildCost(k))}: warung, then ruko, then hotel. Own all of ${GROUPS[s.group].name} and rent doubles.`
              : "Rent grows with each of the four transport hubs the owner has: pelabuhan, bandara, stasiun and terminal."}
          </p>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)", textAlign: "center", lineHeight: 1.35 }}>{ABOUT[s.kind]}</p>
      )}
      <button className="btn btn-white" onClick={onClose}>Got it</button>
    </Sheet>
  );
}

function Row({ label, value, now }: { label: string; value: string; now: boolean }) {
  return (
    <>
      <span className={now ? "now" : undefined}>{label}{now && " ←"}</span>
      <span className={now ? "now" : undefined} style={{ fontWeight: 900, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{value}</span>
    </>
  );
}

function Header({ room, g }: { room: BoomView; g: BoomGameView }) {
  const router = useRouter();
  const leave = useMutation(api.boom.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/boom"); };
  const humans = g.players.filter((p) => !isBot(p) && !g.out.includes(p)).length;
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip" style={{ background: "var(--cream-2)", color: "var(--plum)" }}>{GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist" aria-label={`Room code ${room.code}`}>{room.code}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{humans <= 1 || g.players.length - g.out.length <= 2 ? "The game ends." : "Your spaces go back to the bank and the others play on."}</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, nameOf }: { room: BoomView; g: BoomGameView; nameOf: NameOf }) {
  const router = useRouter();
  const rematch = useMutation(api.boom.rematch);
  const leave = useMutation(api.boom.leave);
  const d = g.done!;
  const iWon = d.winners.includes(room.meId);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const ranked = [...g.players].sort((a, b) => d.worth[b] - d.worth[a]);
  const title = iWon ? (d.winners.length > 1 ? "It's a tie!" : "You win!") : d.winners.length === 1 ? `${nameOf(d.winners[0])} wins` : "Game over";
  const sub = d.reason === "rounds" ? `${g.maxRounds} rounds played. Cash plus everything you own:` : d.reason === "last" ? "Last one standing." : "The players left the game.";
  return (
    <div className="overlay">
      {iWon && <Confetti />}
      <Mascot size={88} mood={iWon ? "joy" : "wow"} className={iWon ? "jump" : undefined} />
      <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: iWon ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>
      <div className="list" style={{ width: "100%", maxWidth: 360 }}>
        {ranked.map((p) => (
          <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 900 }}>{nameOf(p)}{d.winners.includes(p) && " 👑"}</span>
            <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: g.out.includes(p) ? "var(--muted)" : undefined }}>{g.out.includes(p) ? "Out" : money(d.worth[p])}</span>
          </div>
        ))}
      </div>
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-white" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/boom"); }}>Back home</button>
    </div>
  );
}
