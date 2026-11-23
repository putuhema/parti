"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { CARDS, CHOICE_MS, COLS, DILEMMA_MS, GROUPS, HOLD_FILL_MS, LAP_BONUS, LOBBY_FEE, MASH_MS, N, NEGO_DEAL, NEGO_OVER, QTE_MS, ROLL_MS, ROWS, SPACES, TAX, HUB_RENT, RAISES, nextBid, openingBid, BETS, SLOT, SLOT_PAY, SLOT_SPINS, baseRent, buildCost, cellOf, eventMs, isBot, mashTarget, priceOf, type Art, type BoomEvent, type Outcome, type Qte } from "../../../convex/lib/boom/rules";
import { Countdown, Toast } from "@/components/words/common";
import { Confetti, Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { BoardStage, type StageEvent } from "./BoardStage";
import { CORNERS, IsoGround, IsoTile, tileLabel } from "./IsoBoard";
import { TH, TW, place, turn, turnedSize, worldSize, type Rot } from "./iso";
import { Building, BUILDING_NAMES } from "./Building";
import { CardScene } from "./CardScene";
import { TimingBar } from "./TimingBar";
import { HoldMeter, MashMeter } from "./QteMeters";
import { describe, money, short, useNameOf, type BoomGameView, type BoomView } from "./common";

type NameOf = (id?: string | null) => string;
type Banner = { n: number; text: string; tone: "good" | "bad" | "info"; kind: BoomEvent["kind"]; by: string; art?: Art; raw?: string; amount?: number; choice?: string; risky?: boolean; success?: boolean; note?: string; qte?: Qte; ms?: number; taps?: number; target?: number; nego?: BoomEvent["nego"]; other?: string; tile?: number; bet?: number; reels?: [number, number, number]; slot?: BoomEvent["slot"]; spin?: number };
/** "+Rp150rb", "−Rp100rb", plus "· Diperiksa" when the outcome sends you in. */
const outcome = (o: Outcome) => `${o.amount > 0 ? `+${money(o.amount)}` : o.amount < 0 ? `−${money(-o.amount)}` : "Rp0"}${o.jail ? " · Diperiksa" : ""}`;
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
/**
 * The board fills the whole screen and the HUD floats over it. These are the edges the floating HUD covers
 * (they match the .jn-play styles), so the board is fitted and centred in the open space between them.
 */
const HUD_PHONE = { top: 112, bottom: 150, left: 0, right: 0 }, HUD_WIDE = { top: 72, bottom: 120, left: 280, right: 8 };
const ZOOM_IN = 2.2;
const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

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
  const boardRef = useRef<HTMLDivElement>(null); // the upright layer that shakes on big moments
  const wrapRef = useRef<HTMLDivElement>(null);
  // The isometric grid, turned in quarter turns. Every space's top-face centre, in world pixels.
  const [rot, setRot] = useState<Rot>(0);
  const [fading, setFading] = useState(false);
  const turned = turnedSize(COLS, ROWS, rot);
  const world = worldSize(COLS, ROWS);
  const at = useMemo(() => SPACES.map((_, i) => place(turn(cellOf(i), COLS, ROWS, rot), turned.rows)), [rot, turned.rows]);
  const ground = useMemo(() => {
    const ring = new Set(SPACES.map((_, i) => `${cellOf(i).col},${cellOf(i).row}`));
    const cells: { x: number; y: number; z: number }[] = [];
    for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) {
      if (!ring.has(`${col},${row}`)) cells.push(place(turn({ col, row }, COLS, ROWS, rot), turned.rows));
    }
    const P = (col: number, row: number) => place({ col, row }, turned.rows);
    const tp = P(0, 0), rp = P(turned.cols - 1, 0), bp = P(turned.cols - 1, turned.rows - 1), lp = P(0, turned.rows - 1);
    const corners: [number, number][] = [[tp.x, tp.y - TH / 2], [rp.x + TW / 2, rp.y], [bp.x, bp.y + TH / 2], [lp.x - TW / 2, lp.y]];
    return { cells, corners };
  }, [rot, turned.rows, turned.cols]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hud = wide ? HUD_WIDE : HUD_PHONE;
  const viewH = size.h - hud.top - hud.bottom, viewW = size.w - hud.left - hud.right;
  const fit = size.w ? Math.max(0.1, Math.min((viewW - 16) / world.w, (viewH - 8) / world.h)) : 0;
  // Zoomed in, the camera follows whoever's turn it is, until you drag it somewhere else.
  // Phones start zoomed in (the whole diamond is tiny there); big screens start on the whole board.
  const [zoomPick, setZoomPick] = useState<{ wide: boolean; on: boolean } | null>(null);
  const zoomed = zoomPick && zoomPick.wide === wide ? zoomPick.on : !wide;
  const [pan, setPan] = useState<{ x: number; y: number; turn: string } | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; id: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  /** Quarter-turn the board: fade out, turn, fade back in, so tiles never slide through each other. */
  function spin(d: 1 | -1 | 0) {
    feedback.tap();
    setFading(true);
    setTimeout(() => {
      setRot((r) => (d === 0 ? 0 : (((r + d) % 4) + 4) % 4) as Rot);
      setPan(null);
      setTimeout(() => setFading(false), 30);
    }, 140);
  }

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
      const b: Banner = { n: e.n, kind: e.kind, by: e.by, art: e.art, raw: e.text, amount: e.amount, tone: d.tone, text: short, choice: e.choice, risky: e.risky, success: e.success, note: e.note, qte: e.qte, ms: e.ms, taps: e.taps, target: e.target, nego: e.nego, other: e.other, tile: e.tile, bet: e.bet, reels: e.reels, slot: e.slot, spin: e.spin };
      setBanner(b);
      // The rail keeps the full line (card text included) for the last few events.
      if (e.kind !== "roll") setHistory((h) => [...h, { ...b, text: d.text }].slice(-5));
    };
    setStageEvent({ n: e.n, kind: e.kind, by: e.by, other: e.other, amount: e.amount, success: e.success });
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
  const offer = !g.done && (g.phase === "buy" || g.phase === "build") ? g.pos[g.turn] : null;
  // Landed on a space you can buy or build on: the land dialog opens once the figure has landed.
  const pendLand = settled && offer !== null ? offer : null;
  // At the Judol slot: bet, spin, maybe spin again.
  const pendGamble = settled && !g.done && g.phase === "gamble";
  // Lelang: a live auction everyone can bid in (bids update the board state without new events).
  const auc = !g.done && g.phase === "auction" && g.auction ? g.auction : null;
  // A Kejutan dilemma waiting on the player whose turn it is (shown once the board has caught up).
  const pend = settled && !g.done && g.phase === "dilemma" && g.qte ? g.qte : null;
  const pendCard = pend ? CARDS[pend.card] : null;
  const qteKey = pend ? `${g.round}-${g.turn}-${pend.card}-${pend.phase}` : "";
  const [runState, setRun] = useState<{ key: string; start: number; stopAt: number | null } | null>(null);
  const run = runState && runState.key === qteKey ? runState : null;

  // Diperiksa: wait it out, or pay the fee and mash.
  const pendJail = settled && !g.done && g.phase === "jailed";
  const pendRent = settled && !g.done && g.phase === "rent" && g.nego ? g.nego : null;
  const stepKey = `${g.phase}-${g.seq}`;
  const [mashState, setMash] = useState<{ key: string; start: number; taps: number } | null>(null);
  const mash = pendJail && mashState && mashState.key === stepKey ? mashState : null;
  const mashTaps = useRef(0);
  function startMash() {
    if (!pendJail || mash || sending) return;
    feedback.unlock();
    feedback.tick();
    mashTaps.current = 0;
    setMash({ key: stepKey, start: performance.now(), taps: 0 });
  }
  function tapMash() {
    if (!mash || performance.now() - mash.start > MASH_MS) return;
    mashTaps.current += 1;
    feedback.tap();
    setMash({ ...mash, taps: mashTaps.current });
  }
  useEffect(() => {
    if (!mash) return;
    const t = setTimeout(() => void send({ kind: "jail", lobby: true, taps: mashTaps.current }), Math.max(0, mash.start + MASH_MS - performance.now()));
    return () => clearTimeout(t);
  }, [mash?.key, mash?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rent: pay in full, or hold the haggling meter and let go in the deal zone.
  const [holdState, setHold] = useState<{ key: string; start: number | null; stopMs: number | null } | null>(null);
  const hold = pendRent && holdState && holdState.key === stepKey ? holdState : null;
  function armHold() {
    if (!pendRent || hold || sending) return;
    feedback.unlock();
    feedback.tick();
    setHold({ key: stepKey, start: null, stopMs: null });
  }
  function holdDown(e: React.PointerEvent) {
    if (!hold || hold.start !== null) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
    setHold({ ...hold, start: performance.now() });
  }
  function holdUp() {
    if (!hold || hold.start === null || hold.stopMs !== null) return;
    const holdMs = Math.round(performance.now() - hold.start);
    setHold({ ...hold, stopMs: holdMs });
    void send({ kind: "rent", haggle: true, holdMs });
  }
  // Holding on past the end of the bar lets go for you (and it's too late by then).
  useEffect(() => {
    if (!hold || hold.start === null || hold.stopMs !== null) return;
    const t = setTimeout(holdUp, Math.max(0, hold.start + HOLD_FILL_MS * 1.25 - performance.now()));
    return () => clearTimeout(t);
  }, [hold?.start, hold?.stopMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current) feedback.ping();
    wasMine.current = myTurn;
  }, [myTurn]);

  /** Go risky: the timing bar starts now, and the tap is measured from this moment. */
  function goRisky() {
    if (!pend || run || sending) return;
    feedback.unlock();
    feedback.tick();
    setRun({ key: qteKey, start: performance.now(), stopAt: null });
  }
  function tapQte() {
    if (!run || run.stopAt !== null) return;
    const ms = Math.round(performance.now() - run.start);
    setRun({ ...run, stopAt: ms });
    void send({ kind: "dilemma", risky: true, ms });
  }
  // No tap before the bar runs out counts as a miss.
  useEffect(() => {
    if (!run || run.stopAt !== null) return;
    const t = setTimeout(() => {
      setRun((r) => (r && r.stopAt === null ? { ...r, stopAt: QTE_MS + 1 } : r));
      void send({ kind: "dilemma", risky: true, ms: QTE_MS + 1 });
    }, Math.max(0, run.start + QTE_MS + 150 - performance.now()));
    return () => clearTimeout(t);
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(move: { kind: "roll" } | { kind: "gamble"; bet: number } | { kind: "bid"; raise: number } | { kind: "choose"; yes: boolean } | { kind: "dilemma"; risky: boolean; ms?: number } | { kind: "jail"; lobby: boolean; taps?: number } | { kind: "rent"; haggle: boolean; holdMs?: number }) {
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
  const mine = g.turn === room.meId;
  const status = pendJail
    ? mine ? (mash ? `Tap TEKAN as fast as you can! ${mash.taps}/${mashTarget(g.round)}` : "You're being questioned. Wait it out, or lobby?") : `${nameOf(g.turn)} is being questioned…`
    : pendRent
    ? mine ? (hold ? (hold.start === null ? "Hold the button, let go in the green zone" : "Let go in the green zone!") : `Rent due on ${SPACES[pendRent.tile].name}: ${money(pendRent.rent)}`) : `${nameOf(g.turn)} owes ${nameOf(pendRent.owner)} rent…`
    : pend
    ? g.turn === room.meId ? (run && run.stopAt === null ? "Tap when the needle is in the zone!" : run ? "…" : "Kejutan! Play it safe, or take the risk?") : `${nameOf(g.turn)} is deciding…`
    : auc
    ? `Lelang ${SPACES[auc.tile].name}! ${auc.leader ? `${auc.leader === room.meId ? "You lead" : `${nameOf(auc.leader)} leads`} at ${money(auc.bid)}` : "Anyone can bid"}`
    : pendGamble
    ? mine ? "Judol! Pasang taruhan, atau udahan?" : `${nameOf(g.turn)} is at the judol slot…`
    : offer !== null && settled
    ? g.phase === "buy" ? `${SPACES[offer].name} is for sale: ${money(priceOf(offer))}` : `Build on ${SPACES[offer].name}? Rent goes up to ${money(baseRent(offer, g.level[offer] + 1))}`
    : !settled ? "…" : g.done ? "" : g.turn === room.meId ? "Roll the dice!" : g.phase === "roll" ? `${nameOf(g.turn)} is rolling…` : `${nameOf(g.turn)} is deciding…`;
  const card = banner && (banner.kind === "card" || banner.kind === "wheel") && banner.art ? banner : null;
  // A quick time event that just finished, replayed for everyone.
  const qteDone = banner && (banner.kind === "lobby" || (banner.kind === "rent" && banner.nego)) ? banner : null;
  const lastAuction = banner && banner.kind === "auction" && banner.tile !== undefined ? banner : null;
  const lastSpin = banner && banner.kind === "gamble" && banner.bet && banner.reels ? banner : null;
  const negoPrice = (r: number, k: number) => money(Math.round((r * k) / 5) * 5);
  const sc = zoomed ? Math.max(fit * ZOOM_IN, (viewH - 8) / world.h) : fit;
  const focus = at[tokens[g.turn] ?? 0];
  const userPan = pan && pan.turn === g.turn ? pan : null;
  let camX = world.w / 2, camY = world.h / 2;
  if (zoomed) {
    const hw = viewW / 2 / sc, hh = viewH / 2 / sc;
    camX = clamp(userPan?.x ?? focus.x, hw, world.w - hw);
    camY = clamp(userPan?.y ?? focus.y, hh, world.h - hh);
  }
  const camera = `translate(${(hud.left + viewW / 2 - camX * sc).toFixed(1)}px, ${(hud.top + viewH / 2 - camY * sc).toFixed(1)}px) scale(${sc.toFixed(4)})`;
  function onDown(e: React.PointerEvent) {
    if (e.button !== 0 || !zoomed || (e.target as HTMLElement).closest(".jn-cardlayer")) return;
    drag.current = { x: e.clientX, y: e.clientY, cx: camX, cy: camY, id: e.pointerId, moved: false };
    dragged.current = false;
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) { d.moved = true; dragged.current = true; setPanning(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    setPan({ x: d.cx - dx / sc, y: d.cy - dy / sc, turn: g.turn });
  }
  function onUp(e: React.PointerEvent) {
    if (drag.current?.id === e.pointerId) { drag.current = null; setPanning(false); }
  }
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
        <div className="jn-boardwrap" ref={wrapRef}>
          {/* The HUD sits in the corners, over the board, so the board itself stays clear. */}
          <div className="jn-hudtop">{players}</div>
          <div className="jn-hudbl">
            <h2 className="jn-headline">{headline}</h2>
            <p className="jn-turnpill" style={{ "--f": inkOf(g.turn) } as CSSProperties} aria-live="polite"><i />{status || headline}</p>
            <div className="jn-hudrow">
              <span className="jn-dice" role="img" aria-label={dice.rolling ? "Dice rolling" : `Dice show ${dice.faces[0]} and ${dice.faces[1]}`}>
                <Die face={dice.faces[0]} rolling={dice.rolling} />
                <Die face={dice.faces[1]} rolling={dice.rolling} delay />
              </span>
              <p key={banner?.n ?? "hello"} className={`jn-banner ${banner?.tone ?? ""}`} aria-live="polite">{banner?.text ?? "Buy towns. Collect rent. Be the juragan."}</p>
            </div>
          </div>
          <div className="jn-cam" role="group" aria-label="Board view">
            <button type="button" className="jn-cambtn" aria-label="Turn the board left" onClick={() => spin(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.2-5.1M5 4v4h4" /></svg></button>
            <button type="button" className="jn-cambtn" aria-label="Turn the board right" onClick={() => spin(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.2-5.1M19 4v4h-4" /></svg></button>
            <button type="button" className="jn-cambtn" aria-label={zoomed ? "Zoom out to the whole board" : "Zoom in on the player"} aria-pressed={zoomed} onClick={() => { feedback.tap(); setZoomPick({ wide, on: !zoomed }); setPan(null); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{zoomed ? <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 20 20M7.5 10.5h6" /> : <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 20 20M7.5 10.5h6M10.5 7.5v6" />}</svg>
            </button>
          </div>
          <div
            className={`jn-iso${zoomed ? " zoomed" : ""}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; } }}
          >
            {/* The world: ground, tiles, buildings and figures, all in world pixels, moved and scaled by the camera. */}
            <div className={`jn-world${fading ? " fading" : ""}${panning ? " panning" : ""}`} ref={boardRef} style={{ width: world.w, height: world.h, transform: camera, opacity: fit ? undefined : 0 }}>
              <IsoGround cells={ground.cells} corners={ground.corners} w={world.w} h={world.h} />
              {SPACES.map((_, i) => (
                <IsoTile key={i} i={i} g={g} {...at[i]} ink={g.owner[i] ? inkOf(g.owner[i]) : null} offer={offer === i}
                  label={tileLabel(i, g, g.owner[i] ? nameOf(g.owner[i]) : null)} onTap={() => { feedback.tap(); setInfo(i); }} />
              ))}
              {/* Buildings stand upright on their spaces, drawn in the same back-to-front order as the tiles. */}
              {SPACES.map((sp, i) => sp.kind === "lot" && g.owner[i] ? (
                <span key={`b${i}`} className="jn-prop" style={{ left: at[i].x, top: at[i].y + 8, zIndex: at[i].z * 2 + 1, height: g.level[i] ? 74 : 54 }} aria-hidden="true">
                  <Building key={`${g.owner[i]}-${g.level[i]}`} level={g.level[i]} ink={inkOf(g.owner[i])} className="pop" />
                </span>
              ) : null)}
            <BoardStage
              boardRef={boardRef}
              centers={at}
              cell={TH * 1.25}
              event={stageEvent}
              players={g.players.map((p) => ({ id: p, ink: inkOf(p), tile: tokens[p] ?? 0, out: g.out.includes(p), turn: g.turn === p && !g.done, jailed: (g.jail[p] ?? 0) > 0 }))}
            />
            </div>
            {pendJail ? (
              <div className={`jn-cardlayer${mash ? " live" : ""}`} onPointerDown={mash ? (e) => { e.preventDefault(); tapMash(); } : undefined}>
                <div key={stepKey} className={`jn-card${myTurn ? " act" : ""}`}>
                  <span className="jn-cardtag">DIPERIKSA</span>
                  <CardScene art="ott" hero={inkOf(g.turn)} />
                  <p className="jn-cardtext">{mine ? "Kamu dipanggil untuk diperiksa." : `${nameOf(g.turn)} sedang diperiksa.`}</p>
                  {mash ? (
                    <>
                      <MashMeter target={mashTarget(g.round)} taps={mash.taps} live start={mash.start} />
                      <span className="jn-tapcall">TEKAN! TEKAN!</span>
                    </>
                  ) : (
                    <div className="jn-opts">
                      <Choice kind="safe" act={myTurn} busy={sending} title="Tunggu" sub="Skip this turn" onPick={() => send({ kind: "jail", lobby: false })} />
                      <Choice kind="risky" act={myTurn} busy={sending} title="Lobi orang dalam" sub={`−${money(LOBBY_FEE)} · tap ${mashTarget(g.round)}× in ${MASH_MS / 1000}s`} onPick={startMash} />
                    </div>
                  )}
                  <p className="jn-cardwho">{mine ? (mash ? "Tap anywhere, as fast as you can!" : "Your call") : `${nameOf(g.turn)} is deciding…`}</p>
                </div>
              </div>
            ) : pendRent ? (
              <div className="jn-cardlayer">
                <div key={stepKey} className={`jn-card${myTurn ? " act" : ""}`}>
                  <span className="jn-cardtag">SEWA · NEGO?</span>
                  <span className="jn-rentart"><Building level={g.level[pendRent.tile]} ink={inkOf(pendRent.owner)} /></span>
                  <p className="jn-cardtext">{mine ? "You owe" : `${nameOf(g.turn)} owes`} {nameOf(pendRent.owner) === "You" ? "you" : nameOf(pendRent.owner)} {money(pendRent.rent)} rent on {SPACES[pendRent.tile].name}.</p>
                  {hold ? (
                    <>
                      <HoldMeter lo={pendRent.lo} hi={pendRent.hi} live holdStart={hold.start} stopMs={hold.stopMs} />
                      <button className={`ow-btn cast jn-cardbtn jn-holdbtn${hold.start !== null ? " held" : ""}`} disabled={hold.stopMs !== null} onPointerDown={holdDown} onPointerUp={holdUp} onPointerCancel={holdUp}>
                        {hold.stopMs !== null ? "…" : hold.start === null ? "Press and hold" : "Let go!"}
                      </button>
                    </>
                  ) : (
                    <div className="jn-opts">
                      <Choice kind="safe" act={myTurn} busy={sending} title="Bayar" sub={money(pendRent.rent)} onPick={() => send({ kind: "rent", haggle: false })} />
                      <Choice kind="risky" act={myTurn} busy={sending} title="Nego!" sub={`${negoPrice(pendRent.rent, NEGO_DEAL)} on a deal · ${negoPrice(pendRent.rent, NEGO_OVER)} if you push too hard`} onPick={armHold} />
                    </div>
                  )}
                  <p className="jn-cardwho">{mine ? (hold ? "Hold, then let go in the green zone" : "Your call") : `${nameOf(g.turn)} is deciding…`}</p>
                </div>
              </div>
            ) : pend && pendCard ? (
              // A dilemma waiting for a choice; tapping the card also stops the needle.
              <div className={`jn-cardlayer${run && run.stopAt === null ? " live" : ""}`} onPointerDown={run && run.stopAt === null ? (e) => { e.preventDefault(); tapQte(); } : undefined}>
                <div key={qteKey} className={`jn-card${myTurn ? " act" : ""}`}>
                  <span className="jn-cardtag">KEJUTAN · PILIH!</span>
                  <CardScene art={pendCard.art} hero={inkOf(g.turn)} />
                  <p className="jn-cardtext">{pendCard.text}</p>
                  {run ? (
                    <>
                      <TimingBar q={pend} mode={{ kind: "live", start: run.start, stopAt: run.stopAt }} />
                      {run.stopAt === null && <span className="jn-tapcall">TAP!</span>}
                    </>
                  ) : (
                    <div className="jn-opts">
                      <Choice kind="safe" act={myTurn} busy={sending} title={pendCard.dilemma!.safe.label} sub={outcome(pendCard.dilemma!.safe.out)} onPick={() => send({ kind: "dilemma", risky: false })} />
                      <Choice kind="risky" act={myTurn} busy={sending} title={pendCard.dilemma!.risky.label} sub={`${outcome(pendCard.dilemma!.risky.win)} / ${outcome(pendCard.dilemma!.risky.lose)}`} onPick={goRisky} />
                    </div>
                  )}
                  <p className="jn-cardwho">{g.turn === room.meId ? (run ? "Tap anywhere on the card!" : "Your call") : `${nameOf(g.turn)} is deciding…`}</p>
                </div>
              </div>
            ) : pendLand !== null ? (
              <div className="jn-cardlayer">
                <LandCard key={stepKey} i={pendLand} g={g} build={g.phase === "build"} act={myTurn} busy={sending} ink={inkOf(g.turn)}
                  who={mine ? null : nameOf(g.turn)} cash={g.cash[g.turn] ?? 0}
                  onYes={() => send({ kind: "choose", yes: true })} onNo={() => send({ kind: "choose", yes: false })} />
              </div>
            ) : auc ? (
              <div className="jn-cardlayer">
                <AuctionCard
                  key={`lelang-${auc.tile}-${g.round}-${auc.from}`}
                  a={auc}
                  g={g}
                  deadline={live.deadline}
                  me={room.meId}
                  canBid={g.isPlayer}
                  busy={sending}
                  nameOf={nameOf}
                  inkOf={inkOf}
                  onBid={(raise) => send({ kind: "bid", raise })}
                />
              </div>
            ) : lastAuction ? (
              <div className="jn-cardlayer">
                <div key={lastAuction.n} className="jn-card jn-lelang done">
                  <span className="jn-cardtag">LELANG</span>
                  <span className="jn-gavel down" aria-hidden="true">🔨</span>
                  <h3 className="jn-landname">{SPACES[lastAuction.tile!].name}</h3>
                  <div className="jn-bidbox">
                    <b className="jn-qtestamp">{lastAuction.amount ? "TERJUAL!" : "TIDAK LAKU"}</b>
                  </div>
                  <p className="jn-cardwho">{lastAuction.amount ? `${nameOf(lastAuction.by)} · ${money(lastAuction.amount)}` : "The bank keeps it."}</p>
                </div>
              </div>
            ) : pendGamble || lastSpin ? (
              <div className="jn-cardlayer">
                <GambleCard
                  key={`judol-${g.turn}-${g.round}`}
                  spin={lastSpin}
                  open={pendGamble}
                  act={myTurn && pendGamble}
                  busy={sending}
                  cash={g.cash[g.turn] ?? 0}
                  spins={g.spins ?? 0}
                  who={(pendGamble ? g.turn : lastSpin?.by) === room.meId ? null : nameOf(pendGamble ? g.turn : lastSpin?.by)}
                  ink={inkOf(pendGamble ? g.turn : lastSpin?.by)}
                  onBet={(bet) => send({ kind: "gamble", bet })}
                />
              </div>
            ) : qteDone ? (
              <div className="jn-cardlayer">
                <div key={qteDone.n} className="jn-card">
                  {qteDone.kind === "lobby" ? (
                    <>
                      <span className="jn-cardtag">LOBI ORANG DALAM</span>
                      <CardScene art="ott" hero={inkOf(qteDone.by)} />
                      <MashMeter target={qteDone.target ?? 0} taps={qteDone.taps ?? 0} live={false} success={qteDone.success} />
                      <p className="jn-cardwho">{nameOf(qteDone.by)} −{money(LOBBY_FEE)}{qteDone.success ? " · walks free" : " · still questioned"}</p>
                    </>
                  ) : (
                    <>
                      <span className="jn-cardtag">NEGO SEWA</span>
                      {qteDone.tile !== undefined && <span className="jn-rentart"><Building level={g.level[qteDone.tile]} ink={inkOf(qteDone.other)} /></span>}
                      <HoldMeter lo={qteDone.nego!.lo} hi={qteDone.nego!.hi} live={false} level={qteDone.nego!.level} result={qteDone.nego!.result} />
                      <p className="jn-cardwho">{nameOf(qteDone.by)} paid {qteDone.other === room.meId ? "you" : nameOf(qteDone.other)} {money(qteDone.amount ?? 0)} <s>{money(qteDone.nego!.rent)}</s></p>
                    </>
                  )}
                </div>
              </div>
            ) : card && (
              <div className="jn-cardlayer">
                <div key={card.n} className="jn-card">
                  <span className="jn-cardtag">{card.kind === "card" ? "KEJUTAN" : "KAMPANYE"}</span>
                  <CardScene art={card.art!} hero={inkOf(card.by)} />
                  <p className="jn-cardtext">{card.raw}</p>
                  {card.choice && <p className={`jn-cardchoice${card.risky ? " risky" : ""}`}>→ {card.choice}</p>}
                  {card.risky && card.qte && card.ms !== undefined && <TimingBar q={card.qte} mode={{ kind: "replay", ms: card.ms, success: !!card.success }} />}
                  {card.note && <p className="jn-cardnote">{card.note}</p>}
                  <p className="jn-cardwho">{nameOf(card.by)}{card.amount ? ` ${card.amount > 0 ? "+" : "−"}${money(Math.abs(card.amount))}` : ""}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Your move floats in the corner: a big Roll button wrapped in the turn clock, or just the clock while a card waits. */}
      {myTurn && g.phase !== "auction" && (
        <div className={`jn-act${g.phase === "roll" ? " roll" : ""}`}>
          <TimerRing deadline={live.deadline} total={g.phase === "roll" ? ROLL_MS : g.phase === "dilemma" ? DILEMMA_MS : CHOICE_MS} />
          {g.phase === "roll" ? (
            <button type="button" className="jn-rollbtn" disabled={sending} onClick={() => send({ kind: "roll" })} aria-label="Roll the dice">
              <span aria-hidden="true">🎲</span><b>ROLL</b>
            </button>
          ) : (
            <span className="jn-actsecs"><Secs deadline={live.deadline} /></span>
          )}
        </div>
      )}

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

/** The turn clock as a ring: it drains smoothly and turns coral in the last five seconds. */
function TimerRing({ deadline, total }: { deadline?: number | null; total: number }) {
  const ring = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const left = deadline ? Math.max(0, deadline - Date.now()) : 0;
      const el = ring.current;
      if (el) {
        el.style.strokeDashoffset = String(100 - Math.min(100, (left / total) * 100));
        el.style.stroke = left < 5000 ? "var(--ow-coral)" : "var(--ow-mustard)";
      }
      if (left > 0) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deadline, total]);
  return (
    <svg className="jn-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="45" className="jn-ringtrack" />
      <circle ref={ring} cx="50" cy="50" r="45" className="jn-ringfill" pathLength={100} />
    </svg>
  );
}

/** Seconds left on the turn clock. */
function Secs({ deadline }: { deadline?: number | null }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0);
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline]);
  return <>{left}s</>;
}

/** "Going once, going twice": what the auctioneer is calling with this much time left. */
function useCall(deadline?: number | null) {
  const [left, setLeft] = useState(99);
  useEffect(() => {
    const tick = () => setLeft(deadline ? (deadline - Date.now()) / 1000 : 99);
    tick();
    const t = setInterval(tick, 150);
    return () => clearInterval(t);
  }, [deadline]);
  return left;
}

/** The Lelang card: what's up, the current bid and who holds it, the hammer clock, and raise buttons for everyone. */
function AuctionCard({ a, g, deadline, me, canBid, busy, nameOf, inkOf, onBid }: {
  a: NonNullable<BoomGameView["auction"]>; g: BoomGameView; deadline?: number | null; me: string; canBid: boolean; busy: boolean;
  nameOf: NameOf; inkOf: (p?: string | null) => string; onBid: (raise: number) => void;
}) {
  const s = SPACES[a.tile];
  const lot = s.kind === "lot";
  const left = useCall(deadline);
  const call = left > 3 ? "Tawar!" : left > 2 ? "Satu kali…" : left > 1 ? "Dua kali…" : left > 0 ? "Tiga…" : "Dok!";
  const leading = a.leader === me;
  const cash = g.cash[me] ?? 0;
  const prev = useRef(a.bid);
  useEffect(() => {
    if (a.bid !== prev.current) { prev.current = a.bid; if (a.leader !== me) feedback.tick(); }
  }, [a.bid, a.leader, me]);
  return (
    <div className={`jn-card jn-lelang${canBid ? " act" : ""}`} style={{ "--band": lot ? GROUPS[s.group].color : "#6B5A52" } as CSSProperties}>
      <span className="jn-landband" />
      <span className="jn-cardtag">LELANG!</span>
      <span className={`jn-gavel${left < 1.2 ? " down" : ""}`} aria-hidden="true">🔨</span>
      <span className="ow-kicker">{lot ? GROUPS[s.group].name : "Transport"} · harga {money(priceOf(a.tile))}</span>
      <h3 className="jn-landname">{s.name}</h3>
      <div className="jn-bidbox" aria-live="polite">
        <b key={a.bid} className="jn-bid">{a.leader ? money(a.bid) : "—"}</b>
        <span className="jn-bidder">
          {a.leader ? <><i style={{ background: inkOf(a.leader) }} />{a.leader === me ? "You lead" : `${nameOf(a.leader)} leads`}</> : `Opens at ${money(openingBid(a.tile))}`}
        </span>
      </div>
      <div className="jn-hammer"><span className="jn-hammerfill" style={{ width: `${Math.max(0, Math.min(100, (left / 7) * 100))}%` }} /><b>{call}</b></div>
      {canBid && (leading ? (
        <p className="jn-leadnote">You’re winning. Hold on…</p>
      ) : (
        <div className="jn-raises">
          {(a.leader ? RAISES : [RAISES[0]]).map((r) => {
            const next = nextBid(a, r);
            return (
              <button key={r} type="button" className="jn-bet" disabled={busy || cash < next || left <= 0} onClick={() => onBid(r)}>
                {a.leader ? <>+{money(r)}<small>{money(next)}</small></> : <>Buka {money(next)}</>}
              </button>
            );
          })}
        </div>
      ))}
      <p className="jn-slotfine">{nameOf(a.from)} passed on it · {a.bids} bid{a.bids === 1 ? "" : "s"}</p>
    </div>
  );
}

const SLOT_STAMP = { jackpot: "JACKPOT!!", triple: "MAXWIN ×4", pair: "MENANG ×2", zonk: "ZONK", raid: "GEREBEK!" } as const;
const playedSpins = new Set<number>(); // spins whose reels already rolled on this phone

/** The Judol slot machine: three reels that spin and stop one by one, then a stamp. */
function SlotReels({ spin }: { spin: Banner | null }) {
  const final = spin?.reels ?? [0, 1, 2];
  const fresh = !!spin && !playedSpins.has(spin.n);
  const [shown, setShown] = useState<number[]>(fresh ? [1, 3, 2] : [...final]);
  const [stopped, setStopped] = useState(fresh ? 0 : 3);
  const n = spin?.n;
  const reels = spin?.reels;
  useEffect(() => {
    if (n === undefined || !reels || playedSpins.has(n)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const stops = reduce ? [0, 0, 0] : [550, 900, 1300];
    let last = 0;
    const iv = setInterval(() => {
      const t = performance.now() - t0;
      const stop = stops.filter((x) => t >= x).length;
      if (stop !== last) { last = stop; feedback.tick(); }
      setStopped(stop);
      setShown((cur) => cur.map((v, k) => (k < stop ? reels[k] : (v + 1 + Math.floor(Math.random() * 3)) % SLOT.length)));
      // Only once the reels have stopped does this spin count as seen (a re-run mid-spin starts it again).
      if (stop >= 3) { clearInterval(iv); playedSpins.add(n); }
    }, 70);
    return () => clearInterval(iv);
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = !!spin && stopped >= 3;
  const res = spin?.slot;
  return (
    <div className={`jn-slot${done && res ? ` ${res}` : ""}`}>
      <span className="jn-slottop">SLOT GACOR <i /><i /><i /></span>
      <div className="jn-reels">
        {shown.map((v, k) => <span key={k} className={`jn-reel${k < stopped || !spin ? " stop" : ""}`}><b>{SLOT[v]}</b></span>)}
      </div>
      {done && res && <b className="jn-qtestamp">{SLOT_STAMP[res]}</b>}
    </div>
  );
}

/** The Judol card: the machine, the stakes, and bet chips for the player at the table. */
function GambleCard({ spin, open, act, busy, cash, spins, who, ink, onBet }: {
  spin: Banner | null; open: boolean; act: boolean; busy: boolean; cash: number; spins: number; who: string | null; ink: string; onBet: (bet: number) => void;
}) {
  const net = spin?.amount ?? 0;
  return (
    <div className={`jn-card jn-judol${act ? " act" : ""}`} style={{ "--f": ink } as CSSProperties}>
      <span className="jn-cardtag">JUDOL · {open ? `PUTARAN ${spins + 1}/${SLOT_SPINS}` : "HASIL"}</span>
      <SlotReels key={spin?.n ?? "idle"} spin={spin} />
      {spin && <p className={`jn-slotnet${net > 0 ? " up" : " down"}`}>{who ?? "You"} {net >= 0 ? "+" : "−"}{money(Math.abs(net))}</p>}
      {open && act ? (
        <>
          <div className="jn-bets">
            {BETS.map((b) => (
              <button key={b} type="button" className="jn-bet" disabled={busy || cash < b} onClick={() => onBet(b)}>{money(b)}</button>
            ))}
          </div>
          <button type="button" className="ow-btn ghost jn-cardbtn" disabled={busy} onClick={() => onBet(0)}>{spins ? "Udahan, cukup" : "Lewati"}</button>
          <p className="jn-slotfine">Pair ×{SLOT_PAY.pair} · Triple ×{SLOT_PAY.triple} · 7️⃣7️⃣7️⃣ ×{SLOT_PAY.jackpot} · 🚨🚨 = gerebek</p>
        </>
      ) : (
        <p className="jn-cardwho">{open ? `${who} is deciding…` : "Bandar selalu menang."}</p>
      )}
    </div>
  );
}

/** One side of a decision on a card: a real button for the player deciding, a plain chip for everyone watching. */
function Choice({ kind, act, busy, title, sub, onPick }: { kind: "safe" | "risky"; act: boolean; busy: boolean; title: string; sub: string; onPick: () => void }) {
  if (!act) return <span className={`jn-optchip ${kind}`}><b>{title}</b>{sub}</span>;
  return (
    <button type="button" className={`jn-optchip ${kind} jn-choice`} disabled={busy} onClick={onPick}>
      <b>{title}</b>{sub}
    </button>
  );
}

/** The land dialog: what you landed on, what it costs, what it earns, and buy/build right there. */
function LandCard({ i, g, build, act, busy, ink, who, cash, onYes, onNo }: {
  i: number; g: BoomGameView; build: boolean; act: boolean; busy: boolean; ink: string; who: string | null; cash: number; onYes: () => void; onNo: () => void;
}) {
  const s = SPACES[i];
  const lot = s.kind === "lot";
  const band = lot ? GROUPS[s.group].color : "#6B5A52";
  const cost = build ? buildCost(i) : priceOf(i);
  const short_ = cash < cost;
  const lv = g.level[i];
  const rentNow = lot ? baseRent(i, build ? lv : 0) : HUB_RENT[1];
  const rentNext = build ? baseRent(i, lv + 1) : null;
  return (
    <div className={`jn-card jn-land${act ? " act" : ""}`} style={{ "--band": band } as CSSProperties}>
      <span className="jn-landband" />
      <span className="jn-cardtag">{build ? "BANGUN?" : "DIJUAL"}</span>
      <span className="jn-landart">
        {lot ? <Building level={build ? lv + 1 : 0} ink={ink} /> : <span className="jn-landico">{s.kind === "hub" ? s.icon : ""}</span>}
      </span>
      <span className="ow-kicker">{lot ? GROUPS[s.group].name : "Transport"}</span>
      <h3 className="jn-landname">{s.name}</h3>
      <div className="jn-landrows">
        {build ? (
          <>
            <span><i>{BUILDING_NAMES[lv]}</i> → <b>{BUILDING_NAMES[lv + 1]}</b></span>
            <span>Rent <i>{money(rentNow)}</i> → <b>{money(rentNext!)}</b></span>
          </>
        ) : (
          <>
            <span>Price <b>{money(cost)}</b></span>
            <span>Rent <b>{money(rentNow)}</b>{lot ? " · build to raise it" : " · more with each hub"}</span>
          </>
        )}
      </div>
      {act ? (
        <div className="jn-landacts">
          <button type="button" className="ow-btn cast" disabled={busy || short_} onClick={onYes}>
            {short_ ? "Kas kurang" : `${build ? "Bangun" : "Beli"} ${money(cost)}`}
          </button>
          <button type="button" className="ow-btn ghost" disabled={busy} onClick={onNo}>Lewati</button>
        </div>
      ) : (
        <p className="jn-cardwho">{who} is deciding…</p>
      )}
      {act && <p className="jn-landcash">Kas {money(cash)} → {money(Math.max(0, cash - cost))}</p>}
    </div>
  );
}

const ABOUT: Record<string, string> = {
  start: `Everyone begins here. It's gajian every time you pass: collect ${money(LAP_BONUS)}.`,
  jail: "Just passing through is fine. If you get called in for questioning, you sit out your next turn.",
  jackpot: "Land here to cash in the dana aspirasi. Pungli and fines keep topping it up.",
  judol: `Judi online, satire edition. Bet ${money(BETS[0])} to ${money(BETS[2])}: a pair pays ×${SLOT_PAY.pair}, three of a kind ×${SLOT_PAY.triple}, 7-7-7 ×${SLOT_PAY.jackpot}. Two sirens is a raid and you're called in. Up to ${SLOT_SPINS} spins, and the bandar always wins in the end.`,
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
