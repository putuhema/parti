"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { CHOICE_MS, COLS, GROUPS, LAP_BONUS, N, ROLL_MS, ROWS, SPACES, TAX, HUB_RENT, baseRent, buildCost, cellOf, eventMs, isBot, priceOf, type Art, type BoomEvent } from "../../../convex/lib/boom/rules";
import { Countdown, TimerBar, Toast } from "@/components/words/common";
import { Confetti, Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { BoardStage, type Grid, type StageEvent } from "./BoardStage";
import { Building, BUILDING_NAMES } from "./Building";
import { CardScene } from "./CardScene";
import { describe, money, short, useNameOf, type BoomGameView, type BoomView } from "./common";

type NameOf = (id?: string | null) => string;
type Banner = { n: number; text: string; tone: "good" | "bad" | "info"; kind: BoomEvent["kind"]; by: string; art?: Art; raw?: string; amount?: number };
type Dice = { faces: [number, number]; rolling: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

// Orbwick's player inks: you are always plum; everyone else gets the next ink in seat order.
const OTHERS = ["#69BFD6", "#3FA77A", "#D23A8C", "#E2574C"];
const PLUM = "#5E4A8C";
function inksFor(players: string[], me: string) {
  const map = new Map<string, string>();
  let k = 0;
  for (const p of players) map.set(p, p === me ? PLUM : OTHERS[k++ % OTHERS.length]);
  return map;
}

/** Big screens get a landscape ring (12×7); phones keep the tall one (7×12). */
function useWide() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia("(min-width: 1000px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia("(min-width: 1000px)").matches,
    () => false,
  );
}
const PORTRAIT: Grid = { cols: COLS, rows: ROWS, at: cellOf };
const LANDSCAPE: Grid = { cols: ROWS, rows: COLS, at: (i) => { const c = cellOf(i); return { col: ROWS - 1 - c.row, row: c.col }; } };

/** A tiny peci-wearing head for player cards. */
function Head({ ink }: { ink: string }) {
  return (
    <span className="ow-hat" style={{ background: ink }} aria-hidden="true">
      <svg width="26" height="30" viewBox="0 0 26 30"><path d="M5 30 L5 22 Q13 17 21 22 L21 30 Z" fill={ink} stroke="#231B1A" strokeWidth="2" /><circle cx="13" cy="13" r="7" fill="#231B1A" /><path d="M6.4 9.6 L7.4 3 L18.6 3 L19.6 9.6 Z" fill="#231B1A" /><rect x="7" y="6.4" width="12" height="1.8" fill={ink} /></svg>
    </span>
  );
}

export function BoomPlay({ room }: { room: BoomView }) {
  const live = room.game!;
  const nameOf = useNameOf(room);
  const act = useMutation(api.boom.act);
  const inks = useMemo(() => inksFor(live.players, room.meId), [live.players, room.meId]);
  const inkOf = (p?: string | null) => (p ? inks.get(p) ?? "#231B1A" : "#231B1A");
  const wide = useWide();
  const grid = wide ? LANDSCAPE : PORTRAIT;
  const boardRef = useRef<HTMLDivElement>(null);

  // The board on screen lags the server while dice roll and figures hop, then catches up.
  const [shown, setShown] = useState(live);
  const [tokens, setTokens] = useState<Record<string, number>>(live.pos);
  const [dice, setDice] = useState<Dice>({ faces: [3, 4], rolling: false });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [stageEvent, setStageEvent] = useState<StageEvent>(null);
  const [history, setHistory] = useState<Banner[]>([]);
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
    const say = () => {
      const d = describe(e, nameOf, room.meId);
      // The card itself shows the satire, so the news line just says who drew it.
      const short = e.kind === "card" ? `${nameOf(e.by)} drew a Kejutan card` : e.kind === "wheel" ? `${nameOf(e.by)} spun the Kampanye wheel` : d.text;
      const b: Banner = { n: e.n, kind: e.kind, by: e.by, art: e.art, raw: e.text, amount: e.amount, tone: d.tone, text: short };
      setBanner(b);
      // The rail keeps the full line (card text included) for the last few events.
      if (e.kind !== "roll") setHistory((h) => [...h, { ...b, text: d.text }].slice(-5));
    };
    setStageEvent({ n: e.n, kind: e.kind, by: e.by, other: e.other, amount: e.amount });
    if (e.kind === "roll") {
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
    // Satire cards stay up a little longer so there's time to read them.
    await sleep(eventMs(e) + (e.kind === "card" || e.kind === "wheel" ? 900 : 0));
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

  const headline = g.done ? "Final count." : g.turn === room.meId ? "Your move." : `${nameOf(g.turn)}'s move.`;
  const status = offer !== null && settled
    ? g.phase === "buy" ? `${SPACES[offer].name} is for sale: ${money(priceOf(offer))}` : `Build on ${SPACES[offer].name}? Rent goes up to ${money(baseRent(offer, g.level[offer] + 1))}`
    : !settled ? "…" : g.done ? "" : g.turn === room.meId ? "Roll the dice!" : g.phase === "roll" ? `${nameOf(g.turn)} is rolling…` : `${nameOf(g.turn)} is deciding…`;
  const card = banner && (banner.kind === "card" || banner.kind === "wheel") && banner.art ? banner : null;
  const players = (
    <div className="ow-players jn-players">
      {g.players.map((p) => (
        <span key={p} className={`ow-pl${g.turn === p && !g.done ? " turn" : ""}${g.out.includes(p) ? " jn-out" : ""}`} style={{ "--f": inkOf(p), "--t": "#F3EDE0" } as CSSProperties} aria-current={g.turn === p ? "true" : undefined}>
          <Head ink={inkOf(p)} />
          <span className="ow-plname">
            <b>{nameOf(p)}</b>
            <span className="ow-plmeta"><small key={g.cash[p]} className="jn-cash">{g.out.includes(p) ? "Bangkrut" : money(g.cash[p])}</small></span>
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <main className={`screen tight ow-screen ow-play jn-play${myTurn ? " myturn" : ""}`}>
      <Header room={room} g={g} />

      <aside className="ow-rail" aria-label="Juragan">
        <span className="ow-raillabel">Juragan</span>
        {players}
        <div className="ow-log jn-log">
          <span className="ow-loglabel">Kabar terbaru</span>
          <ol className="jn-history">
            {history.length ? [...history].reverse().map((h) => <li key={h.n} className={h.tone}><i style={{ background: inkOf(h.by) }} />{h.text}</li>) : <li>Buy towns. Collect rent. Be the juragan.</li>}
          </ol>
        </div>
      </aside>

      <section className="ow-table jn-table" aria-label="The board">
        <div className="jn-boardwrap">
          <div className={`jn-board${wide ? " wide" : ""}`} ref={boardRef} style={{ "--cols": grid.cols, "--rows": grid.rows } as CSSProperties}>
            {SPACES.map((_, i) => (
              <Tile key={i} i={i} g={g} grid={grid} inkOf={inkOf} nameOf={nameOf} offer={offer === i} onTap={() => { feedback.tap(); setInfo(i); }} />
            ))}
            {/* The middle of the ring: fixed-size slots, so nothing moves when the news changes. */}
            <div className="jn-center" style={{ gridColumn: `2 / ${grid.cols}`, gridRow: `2 / ${grid.rows}` }}>
              <h2 className="jn-headline">{headline}</h2>
              <div className="jn-centerplayers">{players}</div>
              <p key={banner?.n ?? "hello"} className={`jn-banner ${banner?.tone ?? ""}`} aria-live="polite">{banner?.text ?? "Buy towns. Collect rent. Be the juragan."}</p>
              <span className="jn-dice" role="img" aria-label={dice.rolling ? "Dice rolling" : `Dice show ${dice.faces[0]} and ${dice.faces[1]}`}>
                <Die face={dice.faces[0]} rolling={dice.rolling} />
                <Die face={dice.faces[1]} rolling={dice.rolling} delay />
              </span>
            </div>
            <BoardStage
              boardRef={boardRef}
              grid={grid}
              event={stageEvent}
              players={g.players.map((p) => ({ id: p, ink: inkOf(p), tile: tokens[p] ?? 0, out: g.out.includes(p), turn: g.turn === p && !g.done }))}
            />
            {card && (
              <div className="jn-cardlayer">
                <div key={card.n} className="jn-card">
                  <span className="jn-cardtag">{card.kind === "card" ? "KEJUTAN" : "KAMPANYE"}</span>
                  <CardScene art={card.art!} hero={inkOf(card.by)} />
                  <p className="jn-cardtext">{card.raw}</p>
                  <p className="jn-cardwho">{nameOf(card.by)}{card.amount ? ` ${card.amount > 0 ? "+" : "−"}${money(Math.abs(card.amount))}` : ""}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="ow-timer">{myTurn && <TimerBar deadline={live.deadline} total={g.phase === "roll" ? ROLL_MS : CHOICE_MS} />}</div>

      <section className="ow-dock jn-dock" aria-label="Your move">
        <span className="ow-leaf a" /><span className="ow-leaf b" /><span className="ow-leaf c" />
        <div className="ow-dockhead">
          <span>Kas <b>{g.isPlayer ? money(g.cash[room.meId] ?? 0) : "—"}</b></span>
          <span className="ow-docktimer">{myTurn && <TimerBar deadline={live.deadline} total={g.phase === "roll" ? ROLL_MS : CHOICE_MS} />}</span>
        </div>
        <p className="jn-status">{status}</p>
        <div className="ow-actions jn-actions">
          {myTurn && g.phase === "roll" && <button className="ow-btn cast jn-wide" disabled={sending} onClick={() => send({ kind: "roll" })}>🎲 Roll</button>}
          {myTurn && g.phase !== "roll" && (
            <>
              <button className="ow-btn cast" disabled={sending} onClick={() => send({ kind: "choose", yes: true })}>
                {g.phase === "buy" ? `Buy ${money(priceOf(g.pos[g.turn]))}` : `Build ${money(buildCost(g.pos[g.turn]))}`}
              </button>
              <button className="ow-btn ghost" disabled={sending} onClick={() => send({ kind: "choose", yes: false })}>Skip</button>
            </>
          )}
          {!myTurn && <button className="ow-btn ghost jn-wide" disabled>{g.done ? "Game over" : "Waiting…"}</button>}
        </div>
      </section>

      <Toast toast={toast} onDone={() => setToast(null)} />
      <TileSheet i={info} onClose={() => setInfo(null)} g={g} nameOf={nameOf} inkOf={inkOf} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={live.turn === room.meId ? "You roll first" : `${nameOf(live.turn)} rolls first`} />}
      {g.done && <Done room={room} g={g} nameOf={nameOf} inkOf={inkOf} />}
    </main>
  );
}

function Die({ face, rolling, delay }: { face: number; rolling: boolean; delay?: boolean }) {
  // While rolling, the face flickers through random numbers.
  const [flick, setFlick] = useState(face);
  useEffect(() => {
    if (!rolling) return;
    const t = setInterval(() => setFlick(1 + Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(t);
  }, [rolling]);
  const on = PIPS[rolling ? flick : face];
  return (
    <span className={`jn-die${rolling ? " rolling" : ""}${delay ? " late" : ""}`}>
      {Array.from({ length: 9 }, (_, k) => (on.includes(k) ? <i key={k} /> : <span key={k} />))}
    </span>
  );
}

const CORNERS: Record<string, { icon: string; c: string; label: string }> = {
  start: { icon: "🇮🇩", c: "#E2574C", label: "START" },
  jail: { icon: "🚨", c: "#5E4A8C", label: "DIPERIKSA" },
  jackpot: { icon: "💰", c: "#F4C64E", label: "" },
  wheel: { icon: "📣", c: "#D23A8C", label: "KAMPANYE" },
};

function Tile({ i, g, grid, inkOf, nameOf, offer, onTap }: { i: number; g: BoomGameView; grid: Grid; inkOf: (p?: string | null) => string; nameOf: NameOf; offer: boolean; onTap: () => void }) {
  const s = SPACES[i];
  const { col, row } = grid.at(i);
  const place: CSSProperties = { gridColumn: col + 1, gridRow: row + 1 };
  const o = g.owner[i];
  const cls = (extra: string) => `jn-tile ${extra}${offer ? " offer" : ""}`;

  if (s.kind === "lot" || s.kind === "hub") {
    const owned = o ? `, owned by ${nameOf(o)}, rent ${money(g.rents[i])}` : `, for sale at ${money(s.price)}`;
    return (
      <button type="button" className={cls(`${s.kind}${o ? " own" : ""}`)} onClick={onTap} aria-label={`${s.name}${owned}`}
        style={{ ...place, ...(o ? ({ "--o": inkOf(o) } as CSSProperties) : {}), ...(s.kind === "lot" ? ({ "--g": GROUPS[s.group].color } as CSSProperties) : {}) }}>
        {s.kind === "lot" && <span className="jn-band" />}
        <span className="jn-name">{s.name}</span>
        {s.kind === "hub" ? <span className="jn-ico">{s.icon}</span> : o ? <Building key={`${o}-${g.level[i]}`} level={g.level[i]} ink={inkOf(o)} className="pop" /> : null}
        <span className="jn-amt">{short(o ? g.rents[i] : s.price)}</span>
      </button>
    );
  }
  if (s.kind === "surprise" || s.kind === "bonus" || s.kind === "tax") {
    return (
      <button type="button" className={cls(`sp ${s.kind}`)} style={place} onClick={onTap} aria-label={s.name}>
        <span className="jn-ico">{s.kind === "surprise" ? "?" : s.kind === "bonus" ? "✉️" : "🧾"}</span>
        <span className="jn-amt">{s.kind === "tax" ? "PUNGLI" : s.kind === "bonus" ? "FAJAR" : "KEJUTAN"}</span>
      </button>
    );
  }
  const c = CORNERS[s.kind];
  return (
    <button type="button" className={cls("corner")} style={{ ...place, "--c": c.c } as CSSProperties} onClick={onTap} aria-label={s.name}>
      <span className="jn-ico">{c.icon}</span>
      <span className="jn-amt">{s.kind === "jackpot" ? short(g.pot) : c.label}</span>
    </button>
  );
}

const ABOUT: Record<string, string> = {
  start: `Everyone begins here. It's gajian every time you pass: collect ${money(LAP_BONUS)}.`,
  jail: "Just passing through is fine. If you get called in for questioning, you sit out your next turn.",
  jackpot: "Land here to cash in the dana aspirasi. Pungli and fines keep topping it up.",
  wheel: "A kampanye rally: rake in sponsors, blow the budget, or get audited and called in.",
  surprise: "Draw a Kejutan card of political satire. It might pay you, cost you, or move you.",
  bonus: `A serangan fajar envelope! Collect ${money(50)} to ${money(200)}.`,
  tax: `Pay ${money(TAX)} in pungli. It goes into the dana aspirasi.`,
};

function TileSheet({ i, onClose, g, nameOf, inkOf }: { i: number | null; onClose: () => void; g: BoomGameView; nameOf: NameOf; inkOf: (p?: string | null) => string }) {
  // Keep the last space on screen while the sheet slides shut.
  const [kept, setKept] = useState(0);
  if (i !== null && i !== kept) setKept(i);
  const k = i ?? kept;
  const s = SPACES[k];
  const o = g.owner[k];
  const hubs = o ? SPACES.filter((x, n) => x.kind === "hub" && g.owner[n] === o).length : 0;
  const band = s.kind === "lot" ? GROUPS[s.group].color : s.kind === "hub" ? "#5A4A44" : CORNERS[s.kind]?.c ?? "#F4C64E";
  const kicker = s.kind === "lot" ? GROUPS[s.group].name : s.kind === "hub" ? "Transport" : "Special space";
  return (
    <Sheet open={i !== null} onClose={onClose} label={s.name}>
      <div className="jn-sheet">
        <span className="jn-sheetband" style={{ background: band }} />
        <span className="ow-kicker">{kicker}</span>
        <h2>{s.name}</h2>
        {s.kind === "lot" || s.kind === "hub" ? (
          <>
            <p className="jn-sheetowner">
              {o ? <><span className="ow-dot" style={{ background: inkOf(o) }} /> Owned by {nameOf(o) === "You" ? "you" : nameOf(o)}</> : <>For sale at <b>{money(s.price)}</b></>}
            </p>
            <div className="jn-rents">
              {s.kind === "lot"
                ? BUILDING_NAMES.map((label, lv) => <Row key={label} label={label} value={money(baseRent(k, lv))} now={!!o && g.level[k] === lv} art={<Building level={lv} ink={o ? inkOf(o) : "#B9B0A6"} />} />)
                : HUB_RENT.slice(1).map((r, n) => <Row key={r} label={`Owner has ${n + 1} of 4`} value={money(r)} now={hubs === n + 1} />)}
            </div>
            <p className="jn-sheetnote">
              {s.kind === "lot"
                ? `Land here again to build for ${money(buildCost(k))}: warung, then ruko, then hotel. Own all of ${GROUPS[s.group].name} and rent doubles.`
                : "Rent grows with each of the four transport hubs the owner has: pelabuhan, bandara, stasiun and terminal."}
            </p>
          </>
        ) : (
          <p className="jn-sheetnote big">{ABOUT[s.kind]}</p>
        )}
        <button className="ow-btn cast" onClick={onClose}>Got it</button>
      </div>
    </Sheet>
  );
}

function Row({ label, value, now, art }: { label: string; value: string; now: boolean; art?: React.ReactNode }) {
  return (
    <div className={`jn-rentrow${now ? " now" : ""}`}>
      <span className="jn-rentlabel">{art}{label}{now && <b className="jn-nowtag">now</b>}</span>
      <span className="jn-rentval">{value}</span>
    </div>
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
        <span className="ow-wordmark xs">Juragan</span>
        <span className="grow" />
        <span className="jn-pot" aria-label={`Dana aspirasi ${money(g.pot)}`}>💰 {short(g.pot)}</span>
        <span className="ow-chip">Ronde {Math.min(g.round, g.maxRounds)}/{g.maxRounds}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <div className="jn-sheet">
          <span className="jn-sheetband" style={{ background: "#E2574C" }} />
          <h2>Leave this game?</h2>
          <p className="jn-sheetnote big">{humans <= 1 || g.players.length - g.out.length <= 2 ? "The game ends." : "Your spaces go back to the bank and the others play on."}</p>
          <button className="ow-btn cast" onClick={() => setAsk(false)}>Keep playing</button>
          <button className="ow-btn ghost" onClick={go}>Leave</button>
        </div>
      </Sheet>
    </>
  );
}

function Done({ room, g, nameOf, inkOf }: { room: BoomView; g: BoomGameView; nameOf: NameOf; inkOf: (p?: string | null) => string }) {
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
  const title = iWon ? (d.winners.length > 1 ? "It's a tie!" : "You're the juragan!") : d.winners.length === 1 ? `${nameOf(d.winners[0])} is the juragan` : "Game over";
  const sub = d.reason === "rounds" ? `${g.maxRounds} rounds played. Cash plus everything you own:` : d.reason === "last" ? "Last one standing." : "The players left the game.";
  return (
    <div className="overlay ow-done">
      {iWon && <Confetti />}
      <span className="jn-donehead" aria-hidden="true"><Head ink={inkOf(d.winners[0])} /></span>
      <h2>{title}</h2>
      <p className="ow-why">{sub}</p>
      <div className="list" style={{ width: "100%", maxWidth: 360 }}>
        {ranked.map((p) => (
          <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
            <span className="ow-dot" style={{ background: inkOf(p) }} />
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
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/boom"); }}>Back home</button>
    </div>
  );
}
