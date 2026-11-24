"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { ASK_MS, DIFFICULTY_INFO, GOAL, GRID, ROLL_MS, catOf, cellOf, isBot, onIsland, type Difficulty } from "../../../convex/lib/ular/board";
import { CATS } from "../../../convex/lib/trivia/board";
import { Countdown, Toast } from "@/components/words/common";
import { Confetti, Icon, Sheet } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { BoardStage, type StageEvent } from "@/components/boom/BoardStage";
import { IsoGround, type LandCell } from "@/components/boom/IsoBoard";
import { Diorama } from "@/components/boom/Diorama";
import { Die, Head, TimerRing } from "@/components/boom/Play";
import { ANCHOR, DEPTH, SLAB, TH, TILE, TW, place, turn, turnedSize, worldSize, type Rot } from "@/components/boom/iso";
import { GAME_NAME, describe, useNameOf, type UlarEventView, type UlarGameView, type UlarView } from "./common";

type NameOf = (id?: string | null) => string;
type Banner = { n: number; text: string; tone: "good" | "bad" | "info"; e: UlarEventView };
type BoardFeatures = {
  boxes: Record<string, Difficulty>;
  ladders: Record<string, number>;
  snakes: Record<string, number>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Orbwick's player inks: you are always plum; everyone else gets the next ink in seat order.
const OTHERS = ["#69BFD6", "#3FA77A", "#D23A8C", "#E2574C"];
const PLUM = "#5E4A8C";
function inksFor(players: string[], me: string) {
  const map = new Map<string, string>();
  let k = 0;
  for (const p of players) map.set(p, p === me ? PLUM : OTHERS[k++ % OTHERS.length]);
  return map;
}
function useWide() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia("(min-width: 1000px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia("(min-width: 1000px)").matches,
    () => false,
  );
}
const HUD_PHONE = { top: 112, bottom: 150, left: 0, right: 0 }, HUD_WIDE = { top: 72, bottom: 120, left: 280, right: 8 };
const ZOOM_IN = 2.2;
const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
const SNAKE_COLS = ["#3FA77A", "#E2574C", "#5E4A8C", "#F4C64E", "#D23A8C", "#69BFD6", "#FF9A1F", "#3DAE4A"];
const SEA_PROPS = [{ col: 0, row: 3, scene: "perahu" }, { col: 13, row: 10, scene: "islet" }, { col: 12, row: 0, scene: "ikan" }, { col: 1, row: 13, scene: "ikan" }];

/** The squares you pass through on a roll: forward, then back down if you bounced off 100. */
function pathOf(from: number, dice: number) {
  const out: number[] = [];
  let at = from, dir = 1;
  for (let k = 0; k < dice; k++) {
    if (at === GOAL) dir = -1;
    at += dir;
    out.push(at);
  }
  return out;
}

function featuresOf(g: UlarGameView): BoardFeatures {
  return {
    boxes: { ...(g.boxes as Record<string, Difficulty>) },
    ladders: { ...(g.ladders as Record<string, number>) },
    snakes: { ...(g.snakes as Record<string, number>) },
  };
}

export function UlarPlay({ room }: { room: UlarView }) {
  const live = room.game!;
  const nameOf = useNameOf(room);
  const act = useMutation(api.ular.act);
  const inks = useMemo(() => inksFor(live.players, room.meId), [live.players, room.meId]);
  const inkOf = (p?: string | null) => (p ? inks.get(p) ?? "#231B1A" : "#231B1A");
  const wide = useWide();
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // ---- the iso world ----
  const [rot, setRot] = useState<Rot>(0);
  const [fading, setFading] = useState(false);
  const turned = turnedSize(GRID, GRID, rot);
  const world = worldSize(GRID, GRID);
  const at = useMemo(() => Array.from({ length: GOAL + 1 }, (_, i) => place(turn(cellOf(i), GRID, GRID, rot), turned.rows)), [rot, turned.rows]);
  const ground = useMemo(() => {
    const key = (c: { col: number; row: number }) => `${c.col},${c.row}`;
    const squares = new Set(Array.from({ length: GOAL }, (_, i) => key(cellOf(i + 1))));
    const all: { col: number; row: number }[] = [];
    for (let col = 0; col < GRID; col++) for (let row = 0; row < GRID; row++) all.push({ col, row });
    const landT = new Set(all.filter((c) => onIsland(c.col, c.row)).map((c) => key(turn(c, GRID, GRID, rot))));
    const cells: LandCell[] = all.filter((c) => onIsland(c.col, c.row)).map((c) => {
      const t = turn(c, GRID, GRID, rot);
      return { ...place(t, turned.rows), track: squares.has(key(c)), left: !landT.has(`${t.col},${t.row + 1}`), right: !landT.has(`${t.col + 1},${t.row}`) };
    });
    const P = (col: number, row: number) => place({ col, row }, turned.rows);
    const tp = P(0, 0), rp = P(turned.cols - 1, 0), bp = P(turned.cols - 1, turned.rows - 1), lp = P(0, turned.rows - 1);
    const sea: [number, number][] = [[tp.x, tp.y - TH / 2], [rp.x + TW / 2, rp.y], [bp.x, bp.y + TH / 2], [lp.x - TW / 2, lp.y]];
    const waves = all.filter((c) => !onIsland(c.col, c.row) && (c.col * 7 + c.row * 3) % 4 === 0).map((c) => place(turn(c, GRID, GRID, rot), turned.rows));
    const isles = SEA_PROPS.map(({ col, row, scene }) => ({ ...place(turn({ col, row }, GRID, GRID, rot), turned.rows), scene }));
    return { cells, sea, waves, isles };
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
  const [zoomPick, setZoomPick] = useState<{ wide: boolean; on: boolean } | null>(null);
  const zoomed = zoomPick && zoomPick.wide === wide ? zoomPick.on : !wide;
  function spin(d: 1 | -1) {
    feedback.tap();
    setFading(true);
    setTimeout(() => { setRot((r) => ((((r + d) % 4) + 4) % 4) as Rot); setTimeout(() => setFading(false), 30); }, 140);
  }

  // ---- the board on screen lags the server while dice roll, boxes spawn ladders/snakes, and figures move ----
  const [shown, setShown] = useState(live);
  const [tokens, setTokens] = useState<Record<string, number>>(live.pos);
  const [board, setBoard] = useState<BoardFeatures>(() => featuresOf(live));
  const [dice, setDice] = useState({ face: 3, rolling: false });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [stageEvent, setStageEvent] = useState<StageEvent>(null);
  const [history, setHistory] = useState<Banner[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "bad"; id: number } | null>(null);
  const latest = useRef(live);
  const lastN = useRef(live.log.at(-1)?.n ?? 0);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function play(e: UlarEventView) {
    const d = describe(e, nameOf, room.meId);
    const b: Banner = { n: e.n, text: d.text, tone: d.tone, e };
    const say = () => {
      setBanner(b);
      if (e.kind !== "roll" && e.kind !== "ask") setHistory((h) => [...h, b].slice(-5));
    };
    setStageEvent({
      n: e.n,
      kind: e.kind === "climb" ? "jackpot" : e.kind === "bite" ? "jail" : e.kind === "answer" ? (e.ok ? "lobby" : "skip") : e.kind,
      by: e.by,
      success: e.ok ?? undefined,
    });
    if (e.kind === "roll") {
      setDice({ face: e.dice!, rolling: true });
      feedback.tick();
      await sleep(600);
      setDice({ face: e.dice!, rolling: false });
      say();
      await sleep(200);
      for (const sq of pathOf(e.from!, e.dice!)) {
        setTokens((t) => ({ ...t, [e.by]: sq }));
        if (e.by === room.meId) feedback.tap();
        await sleep(230);
      }
      return;
    }
    say();
    if (e.kind === "answer" && e.by === room.meId) {
      if (e.ok) feedback.correct();
      else feedback.wrong();
    }
    if (e.kind === "climb" || e.kind === "bite") {
      // Reveal the newly spawned ladder or snake right as the Mystery Box resolves!
      if (e.spawned && e.from !== undefined && e.to !== undefined) {
        const fromKey = String(e.from);
        const dest = e.to;
        setBoard((prev) => {
          const nextBoxes = { ...prev.boxes };
          delete nextBoxes[fromKey];
          return {
            boxes: nextBoxes,
            ladders: e.kind === "climb" ? { ...prev.ladders, [fromKey]: dest } : prev.ladders,
            snakes: e.kind === "bite" ? { ...prev.snakes, [fromKey]: dest } : prev.snakes,
          };
        });
        await sleep(420);
      } else {
        await sleep(320);
      }
      setTokens((t) => ({ ...t, [e.by]: e.to! }));
      if (e.kind === "climb" && e.by === room.meId) feedback.correct();
      if (e.kind === "bite" && e.by === room.meId) feedback.wrong();
    }
    await sleep(e.kind === "answer" ? 1700 : e.kind === "climb" ? 1050 : e.kind === "bite" ? 1200 : e.kind === "win" ? 1200 : 450);
  }

  useEffect(() => {
    latest.current = live;
    if (running.current) return;
    running.current = true;
    void (async () => {
      while (alive.current) {
        const g = latest.current;
        const fresh = g.log.filter((e) => e.n > lastN.current);
        if (!fresh.length || fresh.length > 14) {
          lastN.current = g.log.at(-1)?.n ?? lastN.current;
          setShown(g);
          setTokens(g.pos);
          setBoard(featuresOf(g));
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
  const ask = settled && !g.done && g.phase === "ask" && g.ask ? g.ask : null;
  const reveal = banner && banner.e.kind === "answer" ? banner.e : null;
  const [picked, setPicked] = useState<{ seq: number; k: number } | null>(null);

  async function send(move: { kind: "roll" } | { kind: "answer"; pick: number }) {
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
  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current) feedback.ping();
    wasMine.current = myTurn;
  }, [myTurn]);

  // ---- the camera: whole island, or zoomed in following whoever's turn it is ----
  const sc = zoomed ? Math.max(fit * ZOOM_IN, (viewH - 8) / world.h) : fit;
  const focus = at[tokens[g.turn] ?? 0];
  let camX = world.w / 2, camY = world.h / 2;
  if (zoomed) {
    const hw = viewW / 2 / sc, hh = viewH / 2 / sc;
    camX = clamp(focus.x, hw, world.w - hw);
    camY = clamp(focus.y, hh, world.h - hh);
  }
  const camera = `translate(${(hud.left + viewW / 2 - camX * sc).toFixed(1)}px, ${(hud.top + viewH / 2 - camY * sc).toFixed(1)}px) scale(${sc.toFixed(4)})`;

  const headline = g.done ? "Game over." : g.turn === room.meId ? "Your move." : `${nameOf(g.turn)}'s move.`;
  const mine = g.turn === room.meId;
  const status = ask
    ? mine
      ? `🎁 ${"★".repeat(DIFFICULTY_INFO[ask.diff].stars)} Mystery Box: right = 🪜 #${ask.upTo}, wrong = 🐍 #${ask.downTo}`
      : `${nameOf(g.turn)} opened a Mystery Box…`
    : !settled ? "…" : g.done ? "" : mine ? "Roll the die!" : `${nameOf(g.turn)} is rolling…`;

  const players = (
    <div className="ow-players jn-players">
      {g.players.map((p) => (
        <span key={p} className={`ow-pl${g.turn === p && !g.done ? " turn" : ""}${g.out.includes(p) ? " jn-out" : ""}`} style={{ "--f": inkOf(p), "--t": "#F3EDE0" } as CSSProperties} aria-current={g.turn === p ? "true" : undefined}>
          <Head ink={inkOf(p)} />
          <span className="ow-plname">
            <b>{nameOf(p)}</b>
            <span className="ow-plmeta"><small key={tokens[p]} className="jn-cash">{g.out.includes(p) ? "Out" : tokens[p] ? `Kotak ${tokens[p]}` : "Start"}</small></span>
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <main className={`screen tight ow-screen ow-play jn-play ul-play${myTurn ? " myturn" : ""}`}>
      <Header room={room} g={g} />
      <aside className="ow-rail" aria-label="Players">
        <span className="ow-raillabel">Players</span>
        {players}
        <div className="ow-log jn-log">
          <span className="ow-loglabel">Kabar terbaru</span>
          <ol className="jn-history">
            {history.length ? [...history].reverse().map((h) => <li key={h.n} className={h.tone}><i style={{ background: inkOf(h.e.by) }} />{h.text}</li>) : <li>Hit Mystery Boxes (?) to spawn ladders — miss and unleash snakes!</li>}
          </ol>
        </div>
      </aside>

      <section className="ow-table jn-table" aria-label="The board">
        <div className="jn-boardwrap" ref={wrapRef}>
          <div className="jn-hudtop">{players}</div>
          <div className="jn-hudbl">
            <h2 className="jn-headline">{headline}</h2>
            <p className="jn-turnpill" style={{ "--f": inkOf(g.turn) } as CSSProperties} aria-live="polite"><i />{status || headline}</p>
            <div className="jn-hudrow">
              <span className="jn-dice" role="img" aria-label={dice.rolling ? "Die rolling" : `Die shows ${dice.face}`}><Die face={dice.face} rolling={dice.rolling} /></span>
              <p key={banner?.n ?? "hello"} className={`jn-banner ${banner?.tone ?? ""}`} aria-live="polite">{banner?.text ?? "First to 100 wins."}</p>
            </div>
          </div>
          <div className="jn-cam" role="group" aria-label="Board view">
            <button type="button" className="jn-cambtn" aria-label="Turn the board left" onClick={() => spin(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.2-5.1M5 4v4h4" /></svg></button>
            <button type="button" className="jn-cambtn" aria-label="Turn the board right" onClick={() => spin(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.2-5.1M19 4v4h-4" /></svg></button>
            <button type="button" className="jn-cambtn" aria-label={zoomed ? "Zoom out to the whole board" : "Zoom in on the player"} aria-pressed={zoomed} onClick={() => { feedback.tap(); setZoomPick({ wide, on: !zoomed }); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{zoomed ? <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 20 20M7.5 10.5h6" /> : <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 20 20M7.5 10.5h6M10.5 7.5v6" />}</svg>
            </button>
          </div>

          <div className="jn-iso">
            <div className={`jn-world${fading ? " fading" : ""}`} ref={boardRef} style={{ width: world.w, height: world.h, transform: camera, opacity: fit ? undefined : 0 }}>
              <IsoGround cells={ground.cells} sea={ground.sea} waves={ground.waves} w={world.w} h={world.h} />
              {ground.isles.map((p) => (
                <span key={`s${p.x},${p.y}`} className="jn-dioprop sea" style={{ left: p.x, top: p.y + DEPTH + SLAB, zIndex: 1 }} aria-hidden="true"><Diorama scene={p.scene} /></span>
              ))}
              {Array.from({ length: GOAL }, (_, k) => k + 1).map((sq) => (
                <Square
                  key={sq}
                  sq={sq}
                  x={at[sq].x}
                  y={at[sq].y}
                  z={at[sq].z}
                  hot={ask?.at === sq}
                  box={board.boxes[String(sq)]}
                  hasLadder={Boolean(board.ladders[String(sq)])}
                  hasSnake={Boolean(board.snakes[String(sq)])}
                />
              ))}
              <span className="jn-dioprop" style={{ left: at[0].x, top: at[0].y + DEPTH - 6, zIndex: at[0].z * 2 + 1 }} aria-hidden="true"><Diorama scene="start" /></span>
              <SnakesAndLadders at={at} w={world.w} h={world.h} ladders={board.ladders} snakes={board.snakes} />
              <BoardStage
                boardRef={boardRef}
                centers={at}
                cell={TH * 1.25}
                event={stageEvent}
                players={g.players.map((p) => ({ id: p, ink: inkOf(p), tile: tokens[p] ?? 0, out: g.out.includes(p), turn: g.turn === p && !g.done }))}
              />
            </div>
            {ask ? (
              <div className="jn-cardlayer">
                <QuestionCard key={`${g.seq}-${ask.at}`} ask={ask} act={myTurn} busy={sending} who={nameOf(g.turn)} ink={inkOf(g.turn)} deadline={live.deadline}
                  picked={picked && picked.seq === g.seq ? picked.k : null}
                  onPick={(k) => { setPicked({ seq: g.seq, k }); void send({ kind: "answer", pick: k }); }} />
              </div>
            ) : reveal ? (
              <div className="jn-cardlayer">
                <Reveal key={reveal.n} e={reveal} who={nameOf(reveal.by)} />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {myTurn && g.phase === "roll" && (
        <div className="jn-act roll">
          <TimerRing deadline={live.deadline} total={ROLL_MS} />
          <button type="button" className="jn-rollbtn" disabled={sending} onClick={() => send({ kind: "roll" })} aria-label="Roll the die">
            <span aria-hidden="true">🎲</span><b>ROLL</b>
          </button>
        </div>
      )}

      <Toast toast={toast} onDone={() => setToast(null)} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={live.turn === room.meId ? "You roll first" : `${nameOf(live.turn)} rolls first`} />}
      {g.done && <Done room={room} g={g} nameOf={nameOf} inkOf={inkOf} />}
    </main>
  );
}

/** One numbered square: clean island tiles for plain squares, glowing Mystery Box tiles for unrevealed questions. */
function Square({
  sq,
  x,
  y,
  z,
  hot,
  box,
  hasLadder,
  hasSnake,
}: {
  sq: number;
  x: number;
  y: number;
  z: number;
  hot: boolean;
  box?: Difficulty;
  hasLadder: boolean;
  hasSnake: boolean;
}) {
  const c = CATS[catOf(sq)];
  const info = box ? DIFFICULTY_INFO[box] : null;
  const { x: ax, y: ay } = ANCHOR;
  const l = ax - TW / 2, r = ax + TW / 2, t = ay - TH / 2, b = ay + TH / 2;
  const S = { stroke: "#231B1A", strokeWidth: 2, strokeLinejoin: "round" as const };
  const top = sq === GOAL ? "#F4C64E" : info ? "#FFF7DC" : sq % 2 === 0 ? "#F7F1E3" : "#EFE6D2";
  const sideL = info ? info.color : c.face;
  const sideR = info ? info.ink : c.edge;
  const label = `Square ${sq}${info ? `, ${info.label} mystery box` : hasLadder ? ", foot of a ladder" : hasSnake ? ", snake's head" : ""}`;

  return (
    <div className={`jn-it ul-sq${hot ? " offer" : ""}${info ? ` ul-box ul-box-${box}` : ""}`} style={{ left: x - ANCHOR.x, top: y - ANCHOR.y, zIndex: z * 2 }} aria-label={label}>
      <svg className="jn-itart" viewBox={`0 0 ${TILE} ${TILE}`} aria-hidden="true">
        <polygon points={`${l},${ay} ${ax},${b} ${ax},${b + DEPTH} ${l},${ay + DEPTH}`} fill={sideL} {...S} />
        <polygon points={`${ax},${b} ${r},${ay} ${r},${ay + DEPTH} ${ax},${b + DEPTH}`} fill={sideR} {...S} />
        <polygon points={`${ax},${t} ${r},${ay} ${ax},${b} ${l},${ay}`} fill={top} {...S} />
      </svg>
      <span className="jn-itface ul-face">
        <i className="jn-itband" style={{ background: info ? info.color : c.face, opacity: info ? 1 : 0.45 }} />
        {info ? (
          <>
            <b className="ul-num ul-qmark" style={{ color: info.ink }}>?</b>
            <span className="ul-stars" style={{ color: info.color }}>{"★".repeat(info.stars)}</span>
          </>
        ) : (
          <>
            <b className="ul-num">{sq === GOAL ? "🏁" : sq}</b>
            {sq === GOAL && <span className="ul-cat">FINISH</span>}
          </>
        )}
      </span>
    </div>
  );
}

/** Dynamically spawned ladders (wooden, lying across the squares) and snakes (slithering), drawn in world pixels. */
function SnakesAndLadders({
  at,
  w,
  h,
  ladders: ladderMap,
  snakes: snakeMap,
}: {
  at: { x: number; y: number }[];
  w: number;
  h: number;
  ladders: Record<string, number>;
  snakes: Record<string, number>;
}) {
  const ladders = Object.entries(ladderMap).map(([f, t]) => [Number(f), t] as const);
  const snakes = Object.entries(snakeMap).map(([hd, tl]) => [Number(hd), tl] as const);
  if (!ladders.length && !snakes.length) return null;
  return (
    <svg className="ul-sl" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {ladders.map(([f, t]) => {
        const a = at[f], b = at[t];
        if (!a || !b) return null;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy * 11, ny = ux * 11;
        const rungs = Math.max(2, Math.floor(len / 22));
        const rail = (s: number) => `M${a.x + nx * s} ${a.y + ny * s} L${b.x + nx * s} ${b.y + ny * s}`;
        return (
          <g key={`l${f}`} className="ul-ladder ul-spawn">
            <path d={`${rail(1)} ${rail(-1)}`} transform="translate(0 7)" stroke="#231B1A" strokeOpacity=".18" strokeWidth="8" strokeLinecap="round" />
            {Array.from({ length: rungs }, (_, k) => {
              const p = (k + 0.5) / rungs, cx = a.x + dx * p, cy = a.y + dy * p;
              return <path key={k} d={`M${cx + nx} ${cy + ny} L${cx - nx} ${cy - ny}`} stroke="#231B1A" strokeWidth="7" strokeLinecap="round" />;
            })}
            {Array.from({ length: rungs }, (_, k) => {
              const p = (k + 0.5) / rungs, cx = a.x + dx * p, cy = a.y + dy * p;
              return <path key={k} d={`M${cx + nx} ${cy + ny} L${cx - nx} ${cy - ny}`} stroke="#E0B27A" strokeWidth="3.5" strokeLinecap="round" />;
            })}
            <path d={`${rail(1)} ${rail(-1)}`} stroke="#231B1A" strokeWidth="9" strokeLinecap="round" />
            <path d={`${rail(1)} ${rail(-1)}`} stroke="#B98A5A" strokeWidth="5" strokeLinecap="round" />
          </g>
        );
      })}
      {snakes.map(([hd, tl], k) => {
        const a = at[hd], b = at[tl];
        if (!a || !b) return null;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
        const amp = Math.min(70, len * 0.28) * (hd % 2 ? 1 : -1);
        const d = `M${a.x} ${a.y} C${a.x + dx * 0.3 + nx * amp} ${a.y + dy * 0.3 + ny * amp} ${a.x + dx * 0.7 - nx * amp} ${a.y + dy * 0.7 - ny * amp} ${b.x} ${b.y}`;
        const col = SNAKE_COLS[(hd + k) % SNAKE_COLS.length];
        const ang = (Math.atan2(dy * 0.3 + ny * amp, dx * 0.3 + nx * amp) * 180) / Math.PI;
        return (
          <g key={`s${hd}`} className="ul-snake ul-spawn">
            <path d={d} transform="translate(0 7)" fill="none" stroke="#231B1A" strokeOpacity=".16" strokeWidth="16" strokeLinecap="round" />
            <path d={d} fill="none" stroke="#231B1A" strokeWidth="17" strokeLinecap="round" />
            <path d={d} fill="none" stroke={col} strokeWidth="12" strokeLinecap="round" />
            <path d={d} fill="none" stroke="#F3EDE0" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" strokeDasharray="3 13" className="ul-slither" />
            <g transform={`translate(${a.x} ${a.y}) rotate(${ang + 180})`}>
              <path d="M-14 0 l-9 -2 m9 2 l-9 3" stroke="#E2574C" strokeWidth="2" strokeLinecap="round" className="ul-tongue" />
              <ellipse cx="0" cy="0" rx="15" ry="11" fill={col} stroke="#231B1A" strokeWidth="2.5" />
              <circle cx="-5" cy="-5" r="3.2" fill="#F3EDE0" stroke="#231B1A" strokeWidth="1.2" /><circle cx="-5.6" cy="-5" r="1.4" fill="#231B1A" />
              <circle cx="-5" cy="5" r="3.2" fill="#F3EDE0" stroke="#231B1A" strokeWidth="1.2" /><circle cx="-5.6" cy="5" r="1.4" fill="#231B1A" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** The Mystery Box question: shows difficulty & exact ladder/snake stakes before answering. */
function QuestionCard({ ask, act, busy, who, ink, deadline, picked, onPick }: {
  ask: NonNullable<UlarGameView["ask"]>; act: boolean; busy: boolean; who: string; ink: string; deadline?: number | null; picked: number | null; onPick: (k: number) => void;
}) {
  const c = CATS[ask.cat];
  const info = DIFFICULTY_INFO[ask.diff];
  const upDist = ask.upTo - ask.at;
  const downDist = ask.at - ask.downTo;
  return (
    <div className={`jn-card ul-q${act ? " act" : ""}`} style={{ "--cat": c.face, "--catsoft": c.soft, "--catink": c.ink, "--f": ink } as CSSProperties}>
      <span className="jn-landband" style={{ background: info.color }} />
      <div className="ul-cardhead">
        <span className="jn-cardtag ul-cattag">{c.icon} {c.name.toUpperCase()} · #{ask.at}</span>
        <span className="ul-diff" style={{ background: info.color, color: ask.diff === "medium" ? "#231B1A" : "#F3EDE0" }}>
          {"★".repeat(info.stars)} {info.label.toUpperCase()}
        </span>
      </div>
      <div className="ul-stakes-row">
        <span className="ul-stakes ladder">🪜 Right → #{ask.upTo} (+{upDist})</span>
        <span className="ul-stakes snake">🐍 Wrong → #{ask.downTo} (−{downDist})</span>
      </div>
      <p className="ul-qtext">{ask.text}</p>
      <div className="ul-choices">
        {ask.choices.map((ch, k) => (
          act ? (
            <button key={k} type="button" className={`ul-choice${picked === k ? " picked" : ""}`} disabled={busy || picked !== null} onClick={() => onPick(k)}>
              <i>{"ABCD"[k]}</i>{ch}
            </button>
          ) : (
            <span key={k} className="ul-choice"><i>{"ABCD"[k]}</i>{ch}</span>
          )
        ))}
      </div>
      <QTimer deadline={deadline} />
      {!act && <p className="jn-cardwho">{who} is answering…</p>}
    </div>
  );
}

/** A slim bar that drains to the answer deadline. */
function QTimer({ deadline }: { deadline?: number | null }) {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const left = deadline ? Math.max(0, deadline - Date.now()) : 0;
      if (bar.current) { bar.current.style.width = `${Math.min(100, (left / ASK_MS) * 100)}%`; bar.current.classList.toggle("low", left < 5000); }
      if (left > 0) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deadline]);
  return <span className="ul-qtimer"><span ref={bar} /></span>;
}

/** The answer, revealed for everyone: the right choice in green, a wrong pick in coral. */
function Reveal({ e, who }: { e: UlarEventView; who: string }) {
  const c = CATS[e.cat ?? 0];
  const outcome = e.ok && e.upTo ? `🪜 Tangga spawned → #${e.upTo}!` : !e.ok && e.downTo ? `🐍 Ular unleashed → #${e.downTo}!` : "";
  return (
    <div className="jn-card ul-q reveal" style={{ "--cat": c.face, "--catsoft": c.soft } as CSSProperties}>
      <span className="jn-landband" style={{ background: e.ok ? "#3FA77A" : "#E2574C" }} />
      <span className="jn-cardtag ul-cattag">{c.icon} {c.name.toUpperCase()}</span>
      {outcome && <p className={`ul-stakes ${e.ok ? "ladder" : "snake"}`}>{outcome}</p>}
      <p className="ul-qtext">{e.text}</p>
      <div className="ul-choices">
        {(e.choices ?? []).map((ch, k) => (
          <span key={k} className={`ul-choice${k === e.right ? " right" : k === e.pick ? " wrong" : ""}`}><i>{"ABCD"[k]}</i>{ch}</span>
        ))}
      </div>
      <b className={`jn-qtestamp ul-stamp${e.ok ? " ok" : ""}`}>{e.ok ? "TANGGA!" : e.pick === -1 ? "ULAR!" : "ULAR!"}</b>
      <p className="jn-cardwho">{who}</p>
    </div>
  );
}

function Header({ room, g }: { room: UlarView; g: UlarGameView }) {
  const router = useRouter();
  const leave = useMutation(api.ular.leave);
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/ular"); };
  const humans = g.players.filter((p) => !isBot(p) && !g.out.includes(p)).length;
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="ow-wordmark xs">{GAME_NAME}</span>
        <span className="grow" />
        <span className="ow-chip">Ronde {Math.min(g.round, g.maxRounds)}/{g.maxRounds}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <div className="jn-sheet">
          <span className="jn-sheetband" style={{ background: "#E2574C" }} />
          <h2>Leave this game?</h2>
          <p className="jn-sheetnote big">{humans <= 1 || g.players.length - g.out.length <= 2 ? "The game ends." : "The others play on without you."}</p>
          <button className="ow-btn cast" onClick={() => setAsk(false)}>Keep playing</button>
          <button className="ow-btn ghost" onClick={go}>Leave</button>
        </div>
      </Sheet>
    </>
  );
}

function Done({ room, g, nameOf, inkOf }: { room: UlarView; g: UlarGameView; nameOf: NameOf; inkOf: (p?: string | null) => string }) {
  const router = useRouter();
  const rematch = useMutation(api.ular.rematch);
  const leave = useMutation(api.ular.leave);
  const d = g.done!;
  const iWon = d.winners.includes(room.meId);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const ranked = [...g.players].sort((a, b) => g.pos[b] - g.pos[a]);
  const title = iWon ? (d.winners.length > 1 ? "It's a tie!" : "You reached 100!") : d.winners.length === 1 ? `${nameOf(d.winners[0])} wins` : "Game over";
  const sub = d.reason === "finish" ? "First to square 100." : d.reason === "rounds" ? `${g.maxRounds} rounds played. Furthest along wins:` : d.reason === "last" ? "Last one standing." : "The players left the game.";
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
            <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: g.out.includes(p) ? "var(--muted)" : undefined }}>{g.out.includes(p) ? "Out" : `#${g.pos[p]}`}</span>
          </div>
        ))}
      </div>
      {room.isHost ? (
        <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/ular"); }}>Back home</button>
    </div>
  );
}
