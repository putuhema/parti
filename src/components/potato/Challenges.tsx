"use client";

// The quick challenges you must beat before you can throw the bomb. A wrong tap gives you a fresh
// challenge of the same kind (and costs you precious time).

import { useEffect, useMemo, useRef, useState } from "react";
import { rng } from "../../../convex/lib/party/rules";
import { CHALLENGES, type ChallengeKind } from "../../../convex/lib/potato/rules";
import { feedback } from "@/lib/feedback";

type Props = { seed: number; solved: () => void; miss: () => void };

export function Challenge({ kind, seed, onSolved }: { kind: ChallengeKind; seed: number; onSolved: () => void }) {
  const [tries, setTries] = useState(0);
  const prompt = CHALLENGES.find((c) => c.kind === kind)?.prompt ?? "";
  const s = seed + tries * 7919;
  const miss = () => { feedback.wrong(); setTries((t) => t + 1); };
  const solved = () => { feedback.correct(); onSolved(); };
  const props = { seed: s, solved, miss };
  return (
    <section key={tries} className={`hp-challenge${tries ? " shake" : ""}`}>
      <p className="hp-prompt">{prompt}</p>
      {kind === "find" && <Find {...props} />}
      {kind === "sum" && <Sum {...props} />}
      {kind === "taps" && <Taps {...props} />}
      {kind === "odd" && <Odd {...props} />}
      {kind === "ink" && <Ink {...props} />}
      {kind === "hold" && <Hold {...props} />}
      {kind === "bigger" && <Bigger {...props} />}
    </section>
  );
}

const shuffle = <T,>(r: () => number, xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const tap = (f: () => void) => ({ onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); f(); } });

const POOL = ["🍕", "🍩", "🐸", "🦄", "🌵", "🎸", "🚀", "🍉", "🐙", "⚽", "🎁", "🌈", "🦊", "🍟", "🐢", "🎈"];
function Find({ seed, solved, miss }: Props) {
  const { target, items } = useMemo(() => {
    const r = rng(seed);
    const items = shuffle(r, POOL).slice(0, 6);
    return { target: items[Math.floor(r() * 6)], items: shuffle(r, items) };
  }, [seed]);
  return (
    <>
      <span className="hp-target">{target}</span>
      <div className="hp-grid three">{items.map((e) => <button key={e} type="button" {...tap(() => (e === target ? solved() : miss()))}>{e}</button>)}</div>
    </>
  );
}

function Sum({ seed, solved, miss }: Props) {
  const { a, b, opts } = useMemo(() => {
    const r = rng(seed);
    const a = 2 + Math.floor(r() * 9), b = 1 + Math.floor(r() * 9);
    return { a, b, opts: shuffle(r, [a + b, a + b + 1, a + b - 1 > 0 ? a + b - 1 : a + b + 2]) };
  }, [seed]);
  return (
    <>
      <span className="hp-big">{a} + {b}</span>
      <div className="hp-grid three">{opts.map((v) => <button key={v} type="button" className="num" {...tap(() => (v === a + b ? solved() : miss()))}>{v}</button>)}</div>
    </>
  );
}

function Taps({ solved }: Props) {
  const [n, setN] = useState(0);
  return (
    <button type="button" className="hp-tapper" {...tap(() => { feedback.tap(); const m = n + 1; setN(m); if (m >= 8) solved(); })}>
      <b>{8 - n}</b><small>more!</small>
    </button>
  );
}

const PAIRS: [string, string][] = [["😀", "😃"], ["🐱", "🐯"], ["🍎", "🍅"], ["⭐", "🌟"], ["🐶", "🐕"], ["🌸", "🌺"], ["💙", "💜"], ["🙈", "🙊"]];
function Odd({ seed, solved, miss }: Props) {
  const { base, odd, at } = useMemo(() => {
    const r = rng(seed);
    const [x, y] = PAIRS[Math.floor(r() * PAIRS.length)];
    return { base: x, odd: y, at: Math.floor(r() * 9) };
  }, [seed]);
  return <div className="hp-grid three">{Array.from({ length: 9 }, (_, i) => <button key={i} type="button" {...tap(() => (i === at ? solved() : miss()))}>{i === at ? odd : base}</button>)}</div>;
}

const INKS = [{ n: "RED", c: "#FF4B4B" }, { n: "BLUE", c: "#1899D6" }, { n: "GREEN", c: "#58CC02" }, { n: "YELLOW", c: "#E5A800" }];
function Ink({ seed, solved, miss }: Props) {
  const { word, ink, order } = useMemo(() => {
    const r = rng(seed);
    const word = Math.floor(r() * 4);
    const ink = (word + 1 + Math.floor(r() * 3)) % 4;
    return { word, ink, order: shuffle(r, [0, 1, 2, 3]) };
  }, [seed]);
  return (
    <>
      <span className="hp-big" style={{ color: INKS[ink].c }}>{INKS[word].n}</span>
      <div className="hp-grid four">{order.map((k) => <button key={k} type="button" className="swatch" aria-label={INKS[k].n} style={{ background: INKS[k].c }} {...tap(() => (k === ink ? solved() : miss()))} />)}</div>
    </>
  );
}

function Hold({ solved }: Props) {
  const [pct, setPct] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setPct(0); };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  function start() {
    if (timer.current) return;
    const t0 = performance.now();
    timer.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / 1500);
      setPct(p);
      if (p >= 1) { if (timer.current) clearInterval(timer.current); timer.current = null; solved(); }
    }, 30);
  }
  return (
    <button type="button" className="hp-hold" style={{ background: `conic-gradient(#FF9600 ${pct * 360}deg, #FFE6C2 0)` }}
      onPointerDown={(e) => { e.preventDefault(); start(); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
      <span>{pct > 0 ? "Keep holding…" : "Press and hold"}</span>
    </button>
  );
}

function Bigger({ seed, solved, miss }: Props) {
  const [a, b] = useMemo(() => {
    const r = rng(seed);
    const x = 10 + Math.floor(r() * 89);
    let y = 10 + Math.floor(r() * 89);
    if (y === x) y = x + 1;
    return [x, y];
  }, [seed]);
  return <div className="hp-grid two">{[a, b].map((v) => <button key={v} type="button" className="num" {...tap(() => (v === Math.max(a, b) ? solved() : miss()))}>{v}</button>)}</div>;
}
