"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SilatBoard } from "@/components/silat/SilatBoard";
import { SilatCard } from "@/components/silat/SilatCard";
import { Icon, Sheet } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { CARDS, canCapture, canPlay, canReady, cardCost, isAttack, playCombo, readyCard, typeOf, type ComboItem } from "@/lib/silat/cards";
import { rangkaiById, rangkaiFor, rangkaiStarts, type Rangkai } from "@/lib/silat/rangkai";
import { beginEnemy, clone, enemyStep, finishEnemy, forecast, freeSteps, isGuarded, jabChance, reactionDamage, sqName, TENAGA, unitName, type Fight } from "@/lib/silat/rules";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sound(f: Fight) {
  const has = (t: string) => f.fx.some((x) => x.t === t);
  if (has("ringout")) feedback.ringout();
  else if (has("ko")) feedback.ko();
  else if (has("slam")) feedback.slam();
  else if (has("boom")) feedback.clear();
  else if (f.fx.some((x) => x.t === "dmg" && x.hero)) feedback.wrong();
  else if (has("dmg")) feedback.capture();
  else feedback.move();
  if (has("gold")) setTimeout(() => feedback.coin(), 260);
}

export function FightView({ fight, floorLabel, onChange }: { fight: Fight; floorLabel: string; onChange: (f: Fight) => void }) {
  /** A card picked from the hand (its index in the real hand), waiting for a square. */
  const [sel, setSel] = useState<number | null>(null);
  /** The combo being built. Nothing happens until you press Play. No undo once it's played. */
  const [combo, setCombo] = useState<ComboItem[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [piles, setPiles] = useState(false);
  /** A move card aimed at an enemy's square, waiting for the attack that captures it. */
  const [capturing, setCapturing] = useState<{ idx: number; sq: number } | null>(null);
  /** Choosing a Tangkis card to ready (Siap) for the enemy turn. */
  const [readying, setReadying] = useState(false);
  /** The named combos just played, shown as a big banner over the board. */
  const [banner, setBanner] = useState<{ key: number; list: Rangkai[] } | null>(null);
  const [fxKey, setFxKey] = useState(0);
  const loop = useRef(0);
  const shakeRef = useRef<HTMLDivElement>(null);

  // Shake the board on big hits.
  useEffect(() => {
    const big = fight.fx.some((x) => x.t === "boom" || x.t === "ringout" || x.t === "ko" || x.t === "slam" || (x.t === "dmg" && x.hero)) || fight.combo >= 3;
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
  // The board as it will be after the combo so far (a preview: dice assume the worst for you).
  const sim = combo.length ? playCombo(f, combo, { sim: true }) : null;
  const q = sim?.fight ?? f;
  const qIndex = (i: number) => (sim ? sim.origin.indexOf(i) : i); // a real-hand card's place in the preview hand
  const queued = new Map<number, number>(); // real hand index -> combo number
  combo.forEach((it, n) => {
    if (it.k === "card") queued.set(it.idx, n + 1);
    if (it.k === "capture") { queued.set(it.idx, n + 1); queued.set(it.atk, n + 1); }
  });
  // Named combos: what's been queued so far, and which hand cards would finish one next.
  const chain = combo.flatMap((it) => (it.k === "step" ? ["step"] : it.k === "capture" ? [f.hand[it.idx], f.hand[it.atk]] : [f.hand[it.idx]]));
  /** Attacks in hand that could capture `sq` together with the move card at real index `mi`. */
  const capturers = (mi: number, sq: number) =>
    f.hand.map((_, j) => j).filter((j) => j !== mi && !queued.has(j) && qIndex(mi) >= 0 && qIndex(j) >= 0 && canCapture(q, qIndex(mi), qIndex(j), sq, chain));
  /** Enemy squares the move card at real index `mi` can capture on. */
  const captureSquares = (mi: number) => (playing && !queued.has(mi) && qIndex(mi) >= 0 ? CARDS[f.hand[mi]]?.reach?.(q).filter((sq) => capturers(mi, sq).length > 0) ?? [] : []);
  const finishes = new Map<number, Rangkai>();
  const starts = new Map<number, Rangkai>();
  f.hand.forEach((id, i) => {
    if (queued.has(i) || !playing || qIndex(i) < 0 || !canPlay(q, id)) return;
    const r = rangkaiFor(chain, id, typeOf);
    if (r) { finishes.set(i, r); return; }
    const rest = f.hand.filter((_, j) => j !== i && !queued.has(j));
    const st = rangkaiStarts(chain, id, rest, typeOf);
    if (st) starts.set(i, st);
  });
  const triggered = (q.rangkai ?? []).map(rangkaiById).filter((r): r is Rangkai => !!r);
  const selId = sel !== null ? f.hand[sel] : null;
  const card = selId ? CARDS[selId] : null;
  const selQ = sel !== null ? qIndex(sel) : -1;
  const captures = sel !== null && !capturing ? captureSquares(sel) : [];
  const ready = !!card && playing && selQ >= 0 && (canPlay(q, selId!) || captures.length > 0);
  const targets = ready && canPlay(q, selId!) ? card!.targets(q) : [];
  const capturable = capturing ? new Set(capturers(capturing.idx, capturing.sq)) : null;
  const preyUnit = capturing ? q.units.find((u) => u.sq === capturing.sq) : undefined;
  const steps = playing && sel === null && !capturing ? freeSteps(q) : [];
  // Where moving gets you jabbed by an enemy that covers the square (if its d20 hits).
  const danger = new Map<number, number>();
  for (const sq of card?.type === "Gerak" ? targets : steps) {
    const d = reactionDamage(q, sq);
    if (d > 0) danger.set(sq, d);
  }
  const fc = f.status === "play" ? forecast(q) : null;
  const incoming = fc?.damage ?? 0;
  const warn = incoming > 0;
  const warnText = !fc ? "" : incoming > 0 ? `Up to ${incoming} damage` : "Nobody gets hurt";
  const display = q;

  function commit(next: Fight) {
    setFxKey((k) => k + 1);
    sound(next);
    onChange(next);
  }

  function add(it: ComboItem) {
    feedback.tap();
    setCombo((c) => [...c, it]);
    setSel(null);
    setCapturing(null);
  }

  /** Drop combo step `n` and everything after it (it hasn't been played yet). */
  function cut(n: number) {
    feedback.tap();
    setCombo((c) => c.slice(0, n));
    setSel(null);
    setCapturing(null);
  }

  function pickCard(i: number) {
    if (!playing) return;
    feedback.unlock();
    if (queued.has(i)) return cut(queued.get(i)! - 1);
    const id = f.hand[i];
    if (readying) {
      if (!canReady(f, id)) { feedback.wrong(); return; }
      feedback.correct();
      setReadying(false);
      commit(readyCard(f, i));
      return;
    }
    if (capturing) {
      // Pick the attack that takes the piece. Only ones that knock it out work.
      if (i === capturing.idx) { setCapturing(null); feedback.tap(); return; }
      if (capturable?.has(i)) return add({ k: "capture", idx: capturing.idx, atk: i, sq: capturing.sq });
      feedback.wrong();
      return;
    }
    if (sel === i) { setSel(null); feedback.tap(); return; }
    const qi = qIndex(i);
    if (qi < 0 || (!canPlay(q, id) && !captureSquares(i).length)) { feedback.wrong(); setSel(i); return; }
    if (CARDS[id].self) return add({ k: "card", idx: i, sq: q.hero.sq });
    feedback.tap();
    setSel(i);
  }

  function tap(sq: number) {
    if (!playing) return;
    if (capturing) { setCapturing(null); feedback.tap(); return; }
    if (readying) { setReadying(false); feedback.tap(); return; }
    if (sel !== null) {
      if (targets.includes(sq)) add({ k: "card", idx: sel, sq });
      else if (captures.includes(sq)) { feedback.tap(); setCapturing({ idx: sel, sq }); setSel(null); }
      else setSel(null);
      return;
    }
    if (steps.includes(sq)) add({ k: "step", sq });
  }

  /** Play the whole combo. It's locked in: there's no undo. */
  function playIt() {
    if (!playing || !combo.length) return;
    feedback.unlock();
    const r = playCombo(f, combo);
    setCombo([]);
    setSel(null);
    commit(r.fight);
    const named = (r.fight.rangkai ?? []).map(rangkaiById).filter((x): x is Rangkai => !!x);
    if (named.length) {
      setBanner({ key: Date.now(), list: named });
      setTimeout(() => feedback.win(), 120);
      try {
        shakeRef.current?.animate?.(
          [{ transform: "scale(1)" }, { transform: "scale(1.035) rotate(-0.6deg)" }, { transform: "scale(.99) rotate(0.4deg)" }, { transform: "scale(1)" }],
          { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" },
        );
      } catch {}
    }
  }

  /** Play out the enemy turn one intent at a time. Picks up where it left off after a reload. */
  async function runEnemy(start: Fight) {
    const id = ++loop.current;
    let s = start;
    for (;;) {
      await sleep(340);
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
    await sleep(220);
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
    setCombo([]);
    setCapturing(null);
    const s = clone(f);
    beginEnemy(s);
    onChange(s);
    void runEnemy(s);
  }

  const guardedNear = card?.type === "Serang" ? targets.map((sq) => q.units.find((u) => u.sq === sq)).find((u) => u && isGuarded(q, u)) : undefined;
  const tip = readying
    ? ["Siap: ready a Tangkis card", "Pay its Tenaga now. It goes off on the first attack this enemy turn, then you kick the attacker back. Unused, it returns to your hand."]
    : capturing && preyUnit
    ? [`Capture the ${unitName(preyUnit)} (${preyUnit.hp} HP)`, `${CARDS[f.hand[capturing.idx]].name}: pick a glowing attack that knocks it out, and you land on ${sqName(f, capturing.sq)}. Tap the board to cancel.`]
    : busy || !card
    ? null
    : !ready
      ? [card.name, selQ < 0 ? "Already used in this combo." : cardCost(q, selId!) > q.tenaga ? "Not enough Tenaga left in this combo." : "Nothing to use it on right now."]
      : sel !== null && finishes.has(sel)
        ? [`${card.name} · finishes ${finishes.get(sel)!.name}!`, finishes.get(sel)!.text]
        : sel !== null && starts.has(sel)
          ? [`${card.name} · starts ${starts.get(sel)!.name}`, starts.get(sel)!.text]
        : captures.length && !targets.length
          ? [card.name, "Swords = capture: land on an enemy by knocking it out with an attack."]
        : [card.name, captures.length ? "Tap a square, or a sword to capture an enemy with an attack." : guardedNear ? `Tap a highlighted square. ${unitName(guardedNear)} is guarded (blue shield): it only budges 1 square.` : "Tap a highlighted square to add it to your combo."];
  const hint = combo.length
    ? "Add more, or press Play. Once played, it's locked in."
    : f.stepUsed ? "Build a combo: pick cards, then Play." : `Build a combo: pick cards or step, then Play. Red dots: an enemy jabs you, ${Math.round(jabChance(f) * 100)}% to hit (d20).`;
  const itemName = (it: ComboItem) =>
    it.k === "step"
      ? `Step ${sqName(f, it.sq)}`
      : it.k === "capture"
        ? `${CARDS[f.hand[it.idx]]?.name ?? "?"} × ${CARDS[f.hand[it.atk]]?.name ?? "?"} ${sqName(f, it.sq)}`
        : `${CARDS[f.hand[it.idx]]?.name ?? "?"}${CARDS[f.hand[it.idx]]?.self ? "" : ` ${sqName(f, it.sq)}`}`;
  const cardsQueued = combo.reduce((a, it) => a + (it.k === "capture" ? 2 : it.k === "card" ? 1 : 0), 0);
  // The tray under the board shows the latest event when nothing else is going on.
  const latest = (f.log ?? []).filter((l) => l.k !== "turn").slice(-1)[0];
  // The full log: grouped by turn, newest turn first, events in the order they happened.
  const turns: { title: string; lines: { t: string; k?: string }[] }[] = [];
  for (const l of f.log ?? []) {
    if (l.k === "turn" || !turns.length) turns.push({ title: l.k === "turn" ? l.t : "Setup", lines: [] });
    if (l.k !== "turn") turns[turns.length - 1].lines.push(l);
  }
  turns.reverse();

  return (
    <main className="screen sl-fight">
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/silat" className="icon-btn" aria-label="Leave fight (your run is saved)" style={{ background: "#fff", boxShadow: "0 3px 0 var(--cream-3)" }}><Icon.Close /></Link>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
          <span className="display" style={{ fontSize: 18 }}>{floorLabel}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--plum-soft)" }}>
            {[f.name, `Turn ${f.turn}`].filter(Boolean).join(" · ")}
          </span>
          {f.survive && f.status !== "won" && (
            <span style={{ marginTop: 2, padding: "1px 8px", borderRadius: 999, background: "#FFF4CC", color: "#8A6400", fontSize: 12, fontWeight: 900 }}>
              Survive {Math.max(1, f.survive - f.turn + 1)} more {f.survive - f.turn + 1 === 1 ? "turn" : "turns"} (or beat the King)
            </span>
          )}
        </div>
        <button type="button" className={`icon-btn sl-logtoggle${logOpen ? " on" : ""}`} aria-pressed={logOpen} aria-label={logOpen ? "Hide the battle log" : "Show the battle log"} onClick={() => { feedback.tap(); setLogOpen((o) => !o); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
        </button>
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

      <div className="sl-stage">
        <div className="sl-stage-in" ref={shakeRef}>
          <SilatBoard
            fight={f}
            preview={display !== f ? display : undefined}
            hl={{ targets, steps, danger, jab: jabChance(q), captures, pending: capturing?.sq ?? null, combo: combo.map((it, n) => ({ sq: it.sq, n: n + 1 })) }}
            onTap={tap}
            fxKey={fxKey}
            combo={f.status === "play" && display === f ? f.combo : 0}
          />

          {logOpen && (
            <div className="sl-logfloat" role="dialog" aria-label="Battle log">
              <div className="sl-logfloat-head">
                <span>Battle log</span>
                <button type="button" onClick={() => { feedback.tap(); setLogOpen(false); }} aria-label="Hide the battle log">Hide</button>
              </div>
              <div className="sl-logfloat-body">
                {turns.map((turn, ti) => (
                  <section key={turns.length - ti} className="sl-logturn">
                    <h3>{turn.title}{ti === 0 && f.status === "play" ? " · now" : ""}</h3>
                    {turn.lines.length ? turn.lines.map((l, i) => (
                      <p key={i} className={`sl-logline full ${l.k ?? ""}`}>{l.t}</p>
                    )) : <p className="sl-logline full hint">Nothing yet.</p>}
                  </section>
                ))}
              </div>
            </div>
          )}

          {banner && (
            <div key={banner.key} className="sl-rangkai" onAnimationEnd={() => setBanner(null)} aria-live="polite">
              <small>Jurus Rangkai</small>
              {banner.list.map((r) => <span key={r.id} style={{ color: r.color }}>{r.name}!</span>)}
            </div>
          )}
        </div>
      </div>

      <div className="sl-tray" aria-live="polite">
        {tip ? (
          <span className="sl-tray-tip"><b>{tip[0]}</b> {tip[1]}</span>
        ) : combo.length ? (
          <div className="sl-combo-strip" aria-label="Your combo">
            {combo.map((it, n) => (
              <button key={n} type="button" className={`sl-chip${sim?.fizzled.includes(n) ? " bad" : ""}`} onClick={() => cut(n)} aria-label={`Step ${n + 1}: ${itemName(it)}. Tap to remove it and everything after.`}>
                <b>{n + 1}</b>{itemName(it)}
              </button>
            ))}
            {triggered.map((r, i) => <span key={`r${i}`} className="sl-chip named" style={{ background: r.color }}>✦ {r.name}</span>)}
            {q.combo >= 2 && <span className="sl-chip" style={{ background: "#3C3C3C", color: "#FFC800" }}>×{q.combo}</span>}
            {[...new Map([...finishes.values()].map((r) => [r.id, r])).values()].map((r) => (
              <span key={`n${r.id}`} className="sl-chip next" style={{ color: r.color, borderColor: r.color }}>next ✦ {r.name}</span>
            ))}
          </div>
        ) : (
          <button type="button" className="sl-tray-log" onClick={() => { feedback.tap(); setLogOpen(true); }}>
            <span className={`sl-logline ${busy && latest ? latest.k ?? "" : "hint"}`}>{busy && latest ? latest.t : finishes.size || starts.size ? finishes.size ? "✦ A glowing card finishes a named combo (Jurus Rangkai)" : "▸ Cards with an arrow start a named combo. Tap one to see it" : hint}</span>
          </button>
        )}
      </div>

      <div className="sl-hand">
        {f.hand.map((id, i) => {
          const mid = (f.hand.length - 1) / 2;
          const off = i - mid;
          const on = sel === i;
          const lifted = on || queued.has(i);
          const x = off * Math.min(54, 270 / Math.max(1, f.hand.length - 1));
          const y = on ? -30 : queued.has(i) ? -18 : off * off * 4;
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
              style={{ left: `calc(50% + ${x}px - 50px)`, transform: `translateY(${y}px) rotate(${lifted ? 0 : rot}deg) scale(${on ? 1.12 : 1})`, zIndex: on ? 20 : i + 1 }}
            >
              <span className="deal" style={{ animationDelay: `${i * 70}ms` }}>
                {finishes.has(i) ? (
                  <span className="sl-named" style={{ background: finishes.get(i)!.color }} aria-label={`Finishes ${finishes.get(i)!.name}`}>✦</span>
                ) : starts.has(i) && !lifted ? (
                  <span className="sl-named start" style={{ background: starts.get(i)!.color }} aria-label={`Starts ${starts.get(i)!.name}`}>▸</span>
                ) : null}
                <span className={`bob${finishes.has(i) || capturable?.has(i) || (readying && canReady(f, id)) ? " sl-glow" : ""}`} style={{ animationDelay: `${-i * 0.6}s`, animationPlayState: on || queued.has(i) ? "paused" : undefined }}>
                  <SilatCard id={id} on={on || queued.has(i)} off={readying ? !canReady(f, id) : !queued.has(i) && (capturing ? !capturable?.has(i) && i !== capturing.idx : qIndex(i) < 0 || (!canPlay(q, id) && !captureSquares(i).length))} cost={cardCost(q, id)} />
                </span>
                {queued.has(i) && <span className="qn">{queued.get(i)}</span>}
              </span>
            </button>
          );
        })}
        <button type="button" className="sl-pile" style={{ left: 0 }} onClick={() => { feedback.tap(); setPiles(true); }} aria-label={`Draw pile: ${f.draw.length} cards`}>
          {f.draw.length}<small>draw</small>
        </button>
        <button type="button" className="sl-pile" style={{ right: 0 }} onClick={() => { feedback.tap(); setPiles(true); }} aria-label={`Discard pile: ${f.discard.length} cards`}>
          {f.discard.length}<small>discard</small>
        </button>
        {!f.hand.length && busy && <p style={{ textAlign: "center", fontWeight: 800, color: "var(--plum-soft)", margin: "60px 0 0" }}>Enemies are moving…</p>}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {combo.length ? (
          <>
            <button className="btn btn-white" style={{ width: 88, flexShrink: 0, color: "var(--plum)" }} disabled={!playing} onClick={() => cut(0)}>Clear</button>
            <button className="btn btn-green" disabled={!playing} onClick={playIt} style={{ flexDirection: "column", gap: 2, minHeight: 58, background: "#1899D6", boxShadow: "0 4px 0 #1478A8" }}>
              <span>{cardsQueued ? `Play cards (${cardsQueued})` : "Play step"}</span>
              <span style={{ fontSize: 12, letterSpacing: 0, textTransform: "none", opacity: 0.9 }}>No undo once played</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`sl-siap${f.ready ? " set" : ""}${readying ? " on" : ""}`}
              disabled={!playing || !!f.ready || (!readying && !f.hand.some((id) => canReady(f, id)))}
              onClick={() => { feedback.tap(); setReadying((r) => !r); setSel(null); }}
              aria-label={f.ready ? `Readied: ${CARDS[f.ready]?.name}` : "Siap: ready a Tangkis card for the enemy turn"}
            >
              <span className="k">Siap</span>
              <span className="v">{f.ready ? CARDS[f.ready]?.name : readying ? "pick one" : "ready a card"}</span>
            </button>
            <button className="btn btn-green" disabled={!playing} onClick={() => { setReadying(false); endTurn(); }} style={{ flexDirection: "column", gap: 2, minHeight: 58, background: warn ? "#E5383B" : undefined, boxShadow: warn ? "0 4px 0 #A52126" : undefined }}>
              <span>End turn</span>
              <span style={{ fontSize: 12, letterSpacing: 0, textTransform: "none", opacity: 0.9 }}>{warnText}</span>
            </button>
          </>
        )}
      </div>

      <Sheet open={piles} onClose={() => setPiles(false)} label="Your piles">
        {([["Draw pile", [...f.draw].sort(), "Shown in A–Z order, not the order you'll draw them. When it runs out, your discard pile is shuffled in."], ["Discard pile", f.discard, ""], ["Exhausted", f.exhausted, "Gone for the rest of this fight."]] as const).map(([title, list, note]) => (list.length || title !== "Exhausted") && (
          <section key={title} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            <h3 className="display" style={{ margin: 0, fontSize: 18 }}>{title} · {list.length}</h3>
            {note && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--plum-soft)" }}>{note}</span>}
            <div className="sl-pilelist">
              {list.length ? list.map((id, i) => <span key={i} className="sl-chip" style={{ cursor: "default" }}>{CARDS[id]?.name ?? id}</span>) : <span style={{ fontSize: 13, fontWeight: 700, color: "var(--plum-soft)" }}>Empty</span>}
            </div>
          </section>
        ))}
      </Sheet>
    </main>
  );
}
