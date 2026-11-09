"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SilatBoard } from "@/components/silat/SilatBoard";
import { SilatCard } from "@/components/silat/SilatCard";
import { Icon, Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { CARDS, canPlay, isAttack, playCard } from "@/lib/silat/cards";
import { beginEnemy, clone, enemyStep, finishEnemy, forecast, freeSteps, step, TENAGA, type Fight } from "@/lib/silat/rules";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sound(f: Fight) {
  if (f.fx.some((x) => x.t === "boom" || x.t === "ringout")) feedback.clear();
  else if (f.fx.some((x) => x.t === "dmg" && x.hero)) feedback.wrong();
  else if (f.fx.some((x) => x.t === "ko")) feedback.capture();
  else if (f.fx.some((x) => x.t === "dmg")) feedback.capture();
  else feedback.move();
}

export function FightView({ fight, floorLabel, onChange }: { fight: Fight; floorLabel: string; onChange: (f: Fight) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [history, setHistory] = useState<Fight[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [fxKey, setFxKey] = useState(0);
  const loop = useRef(0);
  const shakeRef = useRef<HTMLDivElement>(null);

  // Shake the board on big hits.
  useEffect(() => {
    const big = fight.fx.some((x) => x.t === "boom" || x.t === "ringout" || x.t === "lost" || (x.t === "dmg" && x.hero)) || fight.combo >= 3;
    if (!big || !shakeRef.current?.animate) return;
    try {
      shakeRef.current.animate(
        [{ transform: "translate(0,0)" }, { transform: "translate(-6px,3px)" }, { transform: "translate(5px,-4px)" }, { transform: "translate(-3px,2px)" }, { transform: "translate(0,0)" }],
        { duration: 260, easing: "ease-out" },
      );
    } catch {}
  }, [fxKey]); // eslint-disable-line react-hooks/exhaustive-deps -- once per new effect batch

  const f = fight;
  const busy = f.status === "enemy";
  const playing = f.status === "play" && !busy;
  const selId = sel !== null ? f.hand[sel] : null;
  const card = selId ? CARDS[selId] : null;
  const targets = card && playing && selId && canPlay(f, selId) ? card.targets(f) : [];
  const display = sel !== null && pending !== null && targets.includes(pending) ? playCard(f, sel, pending) : f;
  const steps = playing && sel === null ? freeSteps(f) : [];
  const fc = f.status === "play" ? forecast(display) : null;
  const incoming = fc?.damage ?? 0;
  const warn = fc && (incoming > 0 || fc.wargaHurt > 0 || fc.wargaDead > 0);
  const warnText = !fc
    ? ""
    : fc.wargaDead > 0
      ? `A villager dies: you lose ${incoming}`
      : incoming > 0
        ? `You'll take ${incoming} damage${fc.wargaHurt ? `, a villager ${fc.wargaHurt}` : ""}`
        : fc.wargaHurt > 0
          ? `A villager takes ${fc.wargaHurt} damage`
          : "Nobody gets hurt";

  function commit(next: Fight) {
    setHistory((h) => [...h, f]);
    setFxKey((k) => k + 1);
    sound(next);
    onChange(next);
  }

  function pickCard(i: number) {
    if (!playing) return;
    feedback.unlock();
    const id = f.hand[i];
    if (sel === i) { setSel(null); setPending(null); feedback.tap(); return; }
    if (!canPlay(f, id)) { feedback.wrong(); setSel(i); setPending(null); return; }
    feedback.tap();
    setSel(i);
    setPending(CARDS[id].self ? f.hero.sq : null);
  }

  function tap(sq: number) {
    if (!playing) return;
    if (sel !== null) {
      if (!targets.includes(sq)) { setSel(null); setPending(null); return; }
      if (pending === sq) {
        commit(playCard(f, sel, sq));
        setSel(null);
        setPending(null);
        return;
      }
      feedback.tap();
      setPending(sq);
      return;
    }
    if (steps.includes(sq)) commit(step(f, sq));
  }

  function undo() {
    if (!history.length || !playing) return;
    feedback.tap();
    setSel(null);
    setPending(null);
    onChange(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }

  /** Play out the enemy turn one intent at a time. Picks up where it left off after a reload. */
  async function runEnemy(start: Fight) {
    const id = ++loop.current;
    let s = start;
    for (;;) {
      await sleep(430);
      if (loop.current !== id) return;
      const next = clone(s);
      next.fx = [];
      if (!enemyStep(next)) break;
      s = next;
      setFxKey((k) => k + 1);
      if (s.fx.length) sound(s);
      onChange(s);
      if (s.status !== "enemy") break;
    }
    await sleep(300);
    if (loop.current !== id) return;
    if (s.status === "enemy") {
      s = clone(s);
      s.fx = [];
      finishEnemy(s, isAttack);
      setFxKey((k) => k + 1);
      onChange(s);
    }
  }

  // Resume an enemy turn that was cut off (left the page, reloaded).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runEnemy only sets state after an await
    if (fight.status === "enemy") void runEnemy(fight);
    const cancel = loop;
    return () => { cancel.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  function endTurn() {
    if (!playing) return;
    feedback.unlock();
    feedback.tap();
    setSel(null);
    setPending(null);
    setHistory([]);
    const s = clone(f);
    beginEnemy(s);
    onChange(s);
    void runEnemy(s);
  }

  const tip = busy
    ? null
    : card
      ? !canPlay(f, selId!)
        ? [card.name, card.cost > f.tenaga ? "Not enough Tenaga." : "Nothing to use it on right now."]
        : pending !== null
          ? [card.name, card.self ? "Tap your king or Play to use it." : "Tap again to play. The board shows what will happen."]
          : [card.name, "Tap a highlighted square."]
      : null;
  const hint = f.stepUsed ? "Pick a card, or end your turn." : "Pick a card, or tap a green dot for your free step.";
  const recent = (f.log ?? []).slice(-3);

  return (
    <main className="screen" style={{ gap: 10, paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/silat" className="icon-btn" aria-label="Leave fight (your run is saved)" style={{ background: "#fff", boxShadow: "0 3px 0 var(--cream-3)" }}><Icon.Close /></Link>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
          <span className="display" style={{ fontSize: 18 }}>{floorLabel}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--plum-soft)" }}>Turn {f.turn} · deck {f.draw.length} · discard {f.discard.length}</span>
        </div>
        <span style={{ width: 44 }} />
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }} aria-label={`Health ${display.hero.hp} of ${f.hero.max}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 C5 15 2.5 11.5 2.5 8 a4.8 4.8 0 0 1 9.5 -1 a4.8 4.8 0 0 1 9.5 1 C21.5 11.5 19 15 12 21z" fill="#FF4B4B" /></svg>
          <span style={{ flex: 1, height: 12, borderRadius: 7, background: "#FFDFE0", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${(display.hero.hp / f.hero.max) * 100}%`, background: "#FF4B4B", borderRadius: 7, transition: "width 300ms" }} />
          </span>
          <span style={{ fontSize: 14, fontWeight: 900, color: "#B81F1F" }}>{display.hero.hp}/{f.hero.max}</span>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 10, background: "#D7FFB8", fontSize: 14, fontWeight: 900, color: "#2F6E00" }} aria-label={`Block ${display.hero.block}`}>
          <svg width="14" height="15" viewBox="0 0 24 26" aria-hidden="true"><path d="M12 1 L22 5 V12 C22 19 17 23 12 25 C7 23 2 19 2 12 V5z" fill="#46A302" /></svg>
          {display.hero.block}
        </span>
        <span style={{ display: "flex", gap: 8, padding: "0 4px" }} aria-label={`Tenaga ${display.tenaga} of ${TENAGA}`}>
          {Array.from({ length: TENAGA }, (_, i) => <span key={i} className={`sl-gem${i < display.tenaga ? "" : " empty"}`} />)}
        </span>
      </div>

      <div ref={shakeRef}>
        <SilatBoard fight={display} preview={display !== f} hl={{ targets, pending, steps }} onTap={tap} fxKey={fxKey} combo={f.status === "play" && display === f ? f.combo : 0} />
      </div>

      {tip ? (
        <div className="sl-info">
          <div style={{ flex: 1, display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: "var(--plum)" }}>{tip[0]}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--plum-soft)" }}>{tip[1]}</span>
          </div>
          {pending !== null && sel !== null && (
            <button className="btn btn-sm btn-green" style={{ flexShrink: 0 }} onClick={() => tap(pending)}>Play</button>
          )}
        </div>
      ) : (
        <button type="button" className="sl-info sl-log" onClick={() => { feedback.tap(); setLogOpen(true); }} aria-label="Battle log. Tap to see everything that happened.">
          <span style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }} aria-live="polite">
            {recent.map((l, i) => (
              <span key={(f.log?.length ?? 0) - recent.length + i} className={`sl-logline ${l.k ?? ""}${i === recent.length - 1 ? " new" : ""}`}>{l.t}</span>
            ))}
            {!busy && <span className="sl-logline hint">{hint}</span>}
          </span>
          <span className="sl-logbtn">Log</span>
        </button>
      )}

      <Sheet open={logOpen} onClose={() => setLogOpen(false)} label="Battle log">
        <h2 className="display" style={{ margin: 0, fontSize: 24, textAlign: "center" }}>Battle log</h2>
        <div style={{ maxHeight: "55dvh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {[...(f.log ?? [])].reverse().map((l, i) => (
            <span key={i} className={`sl-logline full ${l.k ?? ""}`}>{l.t}</span>
          ))}
        </div>
      </Sheet>

      <div className="sl-hand">
        {f.hand.map((id, i) => {
          const mid = (f.hand.length - 1) / 2;
          const off = i - mid;
          const on = sel === i;
          const x = off * 54;
          const y = on ? -44 : off * off * 4;
          const rot = on ? 0 : off * 5;
          return (
            <button
              key={`${f.turn}-${id}-${f.hand.slice(0, i).filter((x) => x === id).length}`}
              type="button"
              className="sl-cw"
              disabled={!playing}
              aria-label={`${CARDS[id].name}, costs ${CARDS[id].cost}. ${CARDS[id].text}`}
              aria-pressed={on}
              onClick={() => pickCard(i)}
              style={{ left: `calc(50% + ${x}px - 50px)`, transform: `translateY(${y}px) rotate(${rot}deg) scale(${on ? 1.12 : 1})`, zIndex: on ? 20 : i + 1 }}
            >
              <span className="deal" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="bob" style={{ animationDelay: `${-i * 0.6}s`, animationPlayState: on ? "paused" : undefined }}>
                  <SilatCard id={id} on={on} off={!canPlay(f, id)} />
                </span>
              </span>
            </button>
          );
        })}
        {!f.hand.length && busy && <p style={{ textAlign: "center", fontWeight: 800, color: "var(--plum-soft)", margin: "60px 0 0" }}>Enemies are moving…</p>}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-white" style={{ width: 88, flexShrink: 0, color: "var(--plum)" }} disabled={!history.length || !playing} onClick={undo}>Undo</button>
        <button className="btn btn-green" disabled={!playing} onClick={endTurn} style={{ flexDirection: "column", gap: 2, minHeight: 58, background: warn ? "#E5383B" : undefined, boxShadow: warn ? "0 4px 0 #A52126" : undefined }}>
          <span>End turn</span>
          <span style={{ fontSize: 12, letterSpacing: 0, textTransform: "none", opacity: 0.9 }}>{warnText}</span>
        </button>
      </div>
    </main>
  );
}
