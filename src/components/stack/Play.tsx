"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { FALL_MS, TURN_MS, W, isBot, slide } from "../../../convex/lib/stack/rules";
import { TimerBar, Toast } from "@/components/words/common";
import { Avatar, Confetti, Icon, Sheet, roomPaints, type Paint } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";

export type StackView = NonNullable<FunctionReturnType<typeof api.stack.view>>;
type G = NonNullable<StackView["game"]>;
export const GAME_NAME = "Sky Stack";
const ROWS = 9; // floors on screen at once
const FH = 100 / (ROWS + 3); // floor height, % of the stage
const GROUND: Paint = { face: "#8C7B6B", edge: "#6E5F51", ink: "#6E5F51", soft: "#EFE7DF" };

export function StackPlay({ room }: { room: StackView }) {
  const g = room.game!;
  const me = room.meId;
  const act = useMutation(api.stack.act);
  const [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const toastN = useRef(0);
  const name = (id: string) => (id === me ? "You" : g.names[id] ?? "Builder");
  const paints = roomPaints(g.players.map((id, seat) => ({ id, seat, isMe: id === me })));
  const paintOf = (id: string) => (id ? paints.get(id) ?? GROUND : GROUND);
  const myTurn = g.phase === "drop" && g.turn === me && !g.done;
  const top = g.floors[g.floors.length - 1];
  const camera = Math.max(0, g.height - (ROWS - 3)); // floors scrolled below the screen

  // The sliding block runs on each phone's own clock from when it saw the turn start.
  const slider = useRef<HTMLDivElement>(null);
  const started = useRef(0);
  const dropped = useRef<number | null>(null);
  const [frozen, setFrozen] = useState<{ turnNo: number; x: number } | null>(null);
  const turnNo = g.turnNo;
  const sliding = g.phase === "drop" && !g.done;
  useEffect(() => {
    if (!sliding) return;
    started.current = performance.now();
    dropped.current = null;
    let raf = 0;
    const loop = () => {
      const x = slide(turnNo, g.height, top.width, performance.now() - started.current);
      if (slider.current && dropped.current === null) slider.current.style.left = `${(x / W) * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sliding, turnNo, g.height, top.width]);

  async function tap() {
    if (!myTurn || dropped.current !== null) return;
    const ms = performance.now() - started.current;
    dropped.current = ms;
    setFrozen({ turnNo, x: slide(turnNo, g.height, top.width, ms) });
    feedback.tap();
    try { await act({ code: room.code, turnNo, ms }); }
    catch (e) { dropped.current = null; setFrozen(null); toastN.current += 1; setToast({ text: errorText(e, "Missed the beat"), kind: "bad", id: toastN.current }); }
  }

  // Sounds and the sliced-off piece falling away.
  const prev = useRef({ n: g.floors.length, top });
  const [chip, setChip] = useState<{ key: number; left: number; width: number; row: number; color: string } | null>(null);
  const [flash, setFlash] = useState<{ key: number; text: string } | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = { n: g.floors.length, top };
    if (g.floors.length !== was.n + 1) return;
    const f = top, L = was.top.left, w = was.top.width;
    const cut = w - f.width;
    if (f.perfect) {
      feedback.correct();
      setFlash({ key: g.turnNo, text: f.width > w ? "PERFECT ×3! It grew!" : "PERFECT!" });
    } else {
      feedback.move();
      if (cut > 0.5) {
        const left = f.left > L + 0.01 ? L + w : f.left + f.width - w;
        setChip({ key: g.turnNo, left, width: cut, row: g.floors.length - 1, color: paintOf(f.by).face });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.floors.length]);
  const lastPhase = useRef(g.phase);
  useEffect(() => {
    if (g.phase === "fall" && lastPhase.current !== "fall") feedback.slam();
    if (g.phase === "drop" && g.turn === me && lastPhase.current !== "drop") feedback.ping();
    lastPhase.current = g.phase;
  }, [g.phase, g.turn, me]);
  const wasMine = useRef(myTurn);
  useEffect(() => { if (myTurn && !wasMine.current) feedback.ping(); wasMine.current = myTurn; }, [myTurn]);

  const rowBottom = (i: number) => `${(i - camera) * FH + FH}%`;
  const box = (left: number, width: number, row: number, p: Paint): CSSProperties => ({ left: `${(left / W) * 100}%`, width: `${(width / W) * 100}%`, bottom: rowBottom(row), height: `${FH}%`, background: p.face, boxShadow: `inset 0 -5px 0 ${p.edge}` });
  const showFrozen = frozen && frozen.turnNo === turnNo;
  const fall = g.phase === "fall" ? g.crash : null;

  return (
    <main className={`screen tight ss-screen${myTurn ? " myturn" : ""}`}>
      <Header room={room} />

      <div className="ss-players">
        {g.players.map((p) => (
          <span key={p} className={`ss-pl${g.turn === p && !g.done ? " turn" : ""}${g.lives[p] <= 0 ? " out" : ""}`}>
            {isBot(p) ? <span className="ss-bot" aria-hidden="true">🤖</span> : <Avatar name={g.names[p] ?? "?"} paint={paints.get(p)} size={32} />}
            <b>{name(p)}</b>
            <small>{g.lives[p] > 0 ? "❤️".repeat(g.lives[p]) : "💀"}</small>
          </span>
        ))}
      </div>

      <section className={`ss-stage${fall ? " falling" : ""}`} onPointerDown={(e) => { e.preventDefault(); void tap(); }} role="button" aria-label={myTurn ? "Tap to drop the block" : "The tower"}>
        <span className="ss-sky" aria-hidden="true">☁️</span>
        <span className="ss-floor-no" aria-live="polite">{g.height} {g.height === 1 ? "floor" : "floors"}</span>
        <div className="ss-tower">
          {g.floors.map((f, i) => (i < camera - 1 ? null : (
            <div key={i} className={`ss-block${f.perfect ? " perfect" : ""}${i === g.floors.length - 1 && i > 0 ? " landed" : ""}`} style={box(f.left, f.width, i, paintOf(f.by))} />
          )))}
        </div>
        {chip && <div key={chip.key} className="ss-sliver" style={{ ...box(chip.left, chip.width, chip.row, GROUND), background: chip.color }} onAnimationEnd={() => setChip(null)} />}
        {sliding && (
          <div ref={slider} className="ss-block ss-slider" style={{ ...box(showFrozen ? frozen!.x : -999, top.width, g.height + 1, paintOf(g.turn)), ...(showFrozen ? { left: `${(frozen!.x / W) * 100}%` } : {}) }} />
        )}
        {fall && <div className="ss-block ss-missed" style={box(fall.x, fall.width, g.height + 1, paintOf(fall.who))} />}
        {flash && <span key={flash.key} className="ss-flash" onAnimationEnd={() => setFlash(null)}>{flash.text}</span>}
      </section>

      {fall ? (
        <section className="ss-crash rise">
          <h2>💥 CRASH!</h2>
          <p>{name(fall.who)} toppled the tower at <b>{fall.height}</b> {fall.height === 1 ? "floor" : "floors"}{g.solo ? "" : ` · −1 ❤️`}</p>
          <TimerBar deadline={g.deadline} total={FALL_MS} />
        </section>
      ) : myTurn ? (
        <section className="ss-go">
          <b className="bob">Your turn! Tap the tower to drop 👇</b>
          <TimerBar deadline={g.deadline} total={TURN_MS} />
        </section>
      ) : !g.done ? (
        <section className="ss-wait">
          <span><b>{name(g.turn)}</b> {isBot(g.turn) ? "is lining it up… 🤖" : "is building…"}</span>
          {!isBot(g.turn) && <TimerBar deadline={g.deadline} total={TURN_MS} />}
        </section>
      ) : null}

      <Toast toast={toast} onDone={() => setToast(null)} />
      {g.done && <Done room={room} g={g} name={name} />}
    </main>
  );
}

function Header({ room }: { room: StackView }) {
  const router = useRouter();
  const leave = useMutation(api.stack.leave);
  const g = room.game!;
  const [ask, setAsk] = useState(false);
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/stack"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8, minHeight: 44 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (g.done || !g.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip ss-chip">🏗️ {GAME_NAME.toUpperCase()}</span>
        <span className="grow" />
        <span className="chip chip-mist">BEST {g.best.height}</span>
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Clock out early?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{g.solo ? "Your tower will be left unfinished." : "A robot will take over your building."}</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Stay</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

function Done({ room, g, name }: { room: StackView; g: G; name: (id: string) => string }) {
  const router = useRouter();
  const rematch = useMutation(api.stack.rematch);
  const leave = useMutation(api.stack.leave);
  const winner = g.done?.winner ?? null;
  const iWon = winner === room.meId || (g.solo && (g.done?.height ?? 0) >= 10);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (iWon) feedback.win(); else feedback.wrong();
  }, [iWon]);
  const order = [...(winner ? [winner] : []), ...[...g.out].reverse()];
  const h = g.done?.height ?? 0;
  return (
    <div className="overlay ss-done">
      {iWon && <Confetti />}
      <span className="ss-crown">{g.solo ? "🏙️" : winner ? "👷" : "🚧"}</span>
      <h2>{g.solo ? `${h} ${h === 1 ? "floor" : "floors"}!` : winner ? (winner === room.meId ? "You're the master builder!" : `${name(winner)} is the master builder!`) : "Site closed"}</h2>
      <p className="ss-tallest">{g.solo ? (h >= 20 ? "A real skyscraper 🏙️" : h >= 10 ? "Nice and tall!" : "Keep stacking, you'll get higher!") : `Tallest tower: ${g.best.height} floors`}</p>
      {!g.solo && (
        <div className="list" style={{ width: "100%", maxWidth: 360 }}>
          {order.map((p, i) => (
            <div key={p} className={`list-row${p === room.meId ? " me" : ""}`}>
              <span style={{ width: 28, fontSize: 18, fontWeight: 900 }}>{i === 0 && winner ? "🏆" : `#${i + 1}`}</span>
              <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>{name(p)}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>🧱 {g.placed[p] ?? 0} · ✨ {g.perfects[p] ?? 0}</span>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-green" style={{ maxWidth: 380 }} onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      <button className="btn btn-ghost" style={{ maxWidth: 380 }} onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/stack"); }}>Back home</button>
    </div>
  );
}
