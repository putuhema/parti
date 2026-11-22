"use client";

// The Party Blitz minigames. Each is built from the round's seed, so every player gets exactly the
// same layout. A minigame calls `report` as its score changes and may call `finish` to end early;
// otherwise it ends when its time runs out.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { microOf, rng, type MicroId } from "../../../convex/lib/party/rules";
import { feedback } from "@/lib/feedback";

type Props = { seed: number; ms: number; report: (s: number) => void; finish: (s: number) => void };

/** Runs one minigame: its clock, its time bar, and making sure it ends exactly once. */
export function MicroGame({ id, seed, onDone }: { id: MicroId; seed: number; onDone: (score: number) => void }) {
  const meta = microOf(id);
  const done = useRef(false);
  const score = useRef(0);
  const [left, setLeft] = useState(meta.ms);
  const finish = useCallback((s: number) => {
    if (done.current) return;
    done.current = true;
    onDone(Math.max(0, Math.min(meta.cap, Math.round(s))));
  }, [meta.cap, onDone]);
  const report = useCallback((s: number) => { score.current = s; }, []);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      const l = meta.ms - (Date.now() - start);
      setLeft(Math.max(0, l));
      if (l <= 0) { clearInterval(t); finish(score.current); }
    }, 100);
    return () => clearInterval(t);
  }, [meta.ms, finish]);
  const props = { seed, ms: meta.ms, report, finish };
  const pct = (left / meta.ms) * 100;
  return (
    <section className="pb-micro">
      <div className="pb-timebar" aria-label={`${Math.ceil(left / 1000)} seconds left`}><span style={{ width: `${pct}%`, background: pct < 25 ? "var(--cherry)" : undefined }} /></div>
      {id === "tap" && <Tap {...props} />}
      {id === "draw" && <QuickDraw {...props} />}
      {id === "odd" && <OddOne {...props} />}
      {id === "count" && <CountIt {...props} />}
      {id === "bar" && <StopBar {...props} />}
      {id === "math" && <QuickMath {...props} />}
      {id === "color" && <ColorClash {...props} />}
      {id === "balloons" && <Balloons {...props} />}
      {id === "memory" && <Memory {...props} />}
    </section>
  );
}

const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const shuffle = <T,>(r: () => number, xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Ticks every `ms` while mounted, returning milliseconds since mount. */
function useElapsed(ms = 40) {
  const [el, setEl] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setEl(Date.now() - start), ms);
    return () => clearInterval(t);
  }, [ms]);
  return el;
}

// ---------- 👆 Tap Frenzy ----------
function Tap({ report }: Props) {
  const n = useRef(0);
  const [count, setCount] = useState(0);
  return (
    <div className="pb-center">
      <button type="button" className="pb-tapbtn" onPointerDown={(e) => { e.preventDefault(); n.current += 1; setCount(n.current); report(n.current); feedback.tap(); }}>
        <b key={count} className="pop">{count}</b>
        <small>TAP!</small>
      </button>
    </div>
  );
}

// ---------- 🤠 Quick Draw ----------
function QuickDraw({ seed, finish }: Props) {
  const delay = useMemo(() => 1500 + rng(seed)() * 2500, [seed]);
  const [state, setState] = useState<"wait" | "go" | "early" | "hit">("wait");
  const [ms, setMs] = useState(0);
  const goAt = useRef(0);
  useEffect(() => {
    const t = setTimeout(() => { goAt.current = Date.now(); setState("go"); feedback.go(); }, delay);
    const miss = setTimeout(() => finish(0), delay + 2000);
    return () => { clearTimeout(t); clearTimeout(miss); };
  }, [delay, finish]);
  function tap() {
    if (state === "wait") { setState("early"); feedback.wrong(); finish(0); }
    else if (state === "go") {
      const r = Date.now() - goAt.current;
      setMs(r);
      setState("hit");
      feedback.correct();
      finish(Math.max(1, 1000 - r));
    }
  }
  return (
    <button type="button" className={`pb-draw ${state}`} onPointerDown={(e) => { e.preventDefault(); tap(); }}>
      {state === "wait" && <><b>Wait for it…</b><small>Don&apos;t tap yet 🤫</small></>}
      {state === "go" && <b>TAP NOW!</b>}
      {state === "early" && <><b>Too early! 😱</b><small>0 points</small></>}
      {state === "hit" && <><b>{ms} ms</b><small>{ms < 300 ? "Lightning! ⚡" : ms < 450 ? "Quick! 🤠" : "Got there! 🐢"}</small></>}
    </button>
  );
}

// ---------- 🔍 Odd One Out ----------
const ODD_PAIRS: [string, string][] = [["😀", "😃"], ["🐱", "🐯"], ["🍎", "🍅"], ["⭐", "🌟"], ["🐶", "🐕"], ["🌕", "🌝"], ["🍩", "🥯"], ["🐸", "🐢"], ["🌸", "🌺"], ["🔵", "🟦"], ["🙈", "🙊"], ["🍊", "🍑"], ["🐻", "🐼"], ["🚗", "🚕"], ["💙", "💜"], ["🦆", "🐤"]];
function OddOne({ seed, report }: Props) {
  const levels = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 40 }, () => {
      const [a, b] = pick(r, ODD_PAIRS);
      const flip = r() < 0.5;
      return { base: flip ? b : a, odd: flip ? a : b, at: Math.floor(r() * 25) };
    });
  }, [seed]);
  const [lv, setLv] = useState(0);
  const [shake, setShake] = useState(0);
  const L = levels[Math.min(lv, levels.length - 1)];
  return (
    <div className="pb-center">
      <p className="pb-count">Found: <b>{lv}</b></p>
      <div key={`${lv}-${shake}`} className={`pb-oddgrid${shake ? " shake" : ""}`}>
        {Array.from({ length: 25 }, (_, i) => (
          <button key={i} type="button" onPointerDown={(e) => {
            e.preventDefault();
            if (i === L.at) { feedback.correct(); setLv(lv + 1); report(lv + 1); }
            else { feedback.wrong(); setShake((s) => s + 1); }
          }}>{i === L.at ? L.odd : L.base}</button>
        ))}
      </div>
    </div>
  );
}

// ---------- 🔢 Count It ----------
const COUNT_SETS: [string, string][] = [["🐱", "🐶"], ["🍎", "🍐"], ["⭐", "🌙"], ["🎈", "🎁"], ["🐟", "🐠"], ["🍩", "🍪"]];
function CountIt({ seed, ms, report, finish }: Props) {
  const qs = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 3 }, () => {
      const [target, other] = pick(r, COUNT_SETS);
      const n = 3 + Math.floor(r() * 7), m = 4 + Math.floor(r() * 7);
      const items = shuffle(r, [...Array(n).fill(target), ...Array(m).fill(other)]).map((e) => ({ e, x: 6 + r() * 82, y: 6 + r() * 80, rot: r() * 40 - 20 }));
      const opts = shuffle(r, [...new Set([n, n + 1, n - 1, n + 2, n - 2].filter((v) => v > 0))].slice(0, 4));
      return { target, n, items, opts };
    });
  }, [seed]);
  const [q, setQ] = useState(0);
  const [look, setLook] = useState(true);
  const [right, setRight] = useState(0);
  const start = useRef(0);
  useEffect(() => { start.current = performance.now(); }, []);
  useEffect(() => {
    if (!look) return;
    const t = setTimeout(() => setLook(false), 2200);
    return () => clearTimeout(t);
  }, [look, q]);
  const Q = qs[Math.min(q, 2)];
  function answer(v: number, at: number) {
    const ok = v === Q.n;
    if (ok) feedback.correct(); else feedback.wrong();
    const got = right + (ok ? 1 : 0);
    setRight(got);
    report(got * 100);
    if (q >= 2) finish(got * 100 + Math.max(0, Math.floor((ms - (at - start.current)) / 150)));
    else { setQ(q + 1); setLook(true); }
  }
  return (
    <div className="pb-center">
      <p className="pb-count">How many <b>{Q.target}</b>? <small>({q + 1}/3)</small></p>
      <div className="pb-field">
        {look ? Q.items.map((it, i) => <span key={i} style={{ left: `${it.x}%`, top: `${it.y}%`, transform: `rotate(${it.rot}deg)` }}>{it.e}</span>) : <b className="pb-gone">❓</b>}
      </div>
      <div className="pb-opts">
        {Q.opts.map((v) => <button key={v} type="button" className="pb-opt" disabled={look} onClick={(e) => answer(v, e.timeStamp)}>{v}</button>)}
      </div>
    </div>
  );
}

// ---------- 🎯 Stop the Bar ----------
function StopBar({ seed, report, finish }: Props) {
  const tries = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 3 }, () => ({ c: 0.2 + r() * 0.6, period: 1100 + r() * 700 }));
  }, [seed]);
  const el = useElapsed(16);
  const [n, setN] = useState(0);
  const [base, setBase] = useState(0);
  const [hits, setHits] = useState<number[]>([]);
  const [paused, setPaused] = useState<number | null>(null);
  const T = tries[Math.min(n, 2)];
  const phase = (Math.max(0, el - base) % T.period) / T.period;
  const pos = paused ?? (phase < 0.5 ? phase * 2 : 2 - phase * 2);
  function stop() {
    if (paused !== null || n >= 3) return;
    const d = Math.abs(pos - T.c);
    const pts = Math.max(0, Math.round(100 - d * 400));
    const all = [...hits, pts];
    setHits(all);
    setPaused(pos);
    report(all.reduce((a, b) => a + b, 0));
    if (pts >= 90) feedback.correct(); else if (pts > 0) feedback.tap(); else feedback.wrong();
    setTimeout(() => {
      if (all.length >= 3) { finish(all.reduce((a, b) => a + b, 0)); return; }
      setPaused(null);
      setN(all.length);
      setBase(el + 700);
    }, 700);
  }
  return (
    <div className="pb-center">
      <p className="pb-count">Try {Math.min(n + 1, 3)}/3 · <b>{hits.reduce((a, b) => a + b, 0)}</b> pts</p>
      <div className="pb-bar">
        <span className="zone" style={{ left: `${(T.c - 0.08) * 100}%`, width: "16%" }}><i /></span>
        <span className="marker" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="pb-hits">{hits.map((h, i) => <span key={i} className={h >= 90 ? "great" : h > 0 ? "ok" : "miss"}>{h >= 90 ? "🎯" : h > 0 ? "👍" : "💨"} {h}</span>)}</div>
      <button type="button" className="btn btn-green pb-stop" onPointerDown={(e) => { e.preventDefault(); stop(); }}>STOP!</button>
    </div>
  );
}

// ---------- ➕ Quick Math ----------
function QuickMath({ seed, report }: Props) {
  const qs = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 80 }, () => {
      const plus = r() < 0.6;
      let a = 2 + Math.floor(r() * 19), b = 1 + Math.floor(r() * 12);
      if (!plus && b > a) [a, b] = [b, a];
      const ans = plus ? a + b : a - b;
      const opts = shuffle(r, [ans, ans + 1 + Math.floor(r() * 3), Math.max(0, ans - 1 - Math.floor(r() * 3))].filter((v, i, xs) => xs.indexOf(v) === i));
      while (opts.length < 3) opts.push(ans + 10 + opts.length);
      return { text: `${a} ${plus ? "+" : "−"} ${b}`, ans, opts };
    });
  }, [seed]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  const Q = qs[Math.min(i, qs.length - 1)];
  function answer(v: number) {
    const ok = v === Q.ans;
    const s = Math.max(0, score + (ok ? 1 : -1));
    setScore(s);
    report(s);
    setFlash(ok ? "good" : "bad");
    if (ok) feedback.correct(); else feedback.wrong();
    setI(i + 1);
  }
  return (
    <div className="pb-center">
      <p className="pb-count">Score: <b>{score}</b></p>
      <p key={i} className={`pb-sum pop${flash ? ` ${flash}` : ""}`}>{Q.text} = ?</p>
      <div className="pb-opts three">{Q.opts.map((v) => <button key={`${i}-${v}`} type="button" className="pb-opt" onClick={() => answer(v)}>{v}</button>)}</div>
    </div>
  );
}

// ---------- 🎨 Color Clash ----------
const COLORS = [
  { name: "RED", c: "#FF4B4B" }, { name: "BLUE", c: "#1899D6" }, { name: "GREEN", c: "#58CC02" }, { name: "YELLOW", c: "#E5A800" }, { name: "PURPLE", c: "#A568CC" },
];
function ColorClash({ seed, report }: Props) {
  const qs = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 80 }, () => {
      const word = Math.floor(r() * COLORS.length);
      let ink = Math.floor(r() * COLORS.length);
      if (ink === word) ink = (ink + 1 + Math.floor(r() * (COLORS.length - 1))) % COLORS.length;
      const others = shuffle(r, COLORS.map((_, i) => i).filter((i) => i !== ink && i !== word)).slice(0, 2);
      return { word, ink, opts: shuffle(r, [ink, word, ...others]) };
    });
  }, [seed]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const Q = qs[Math.min(i, qs.length - 1)];
  function answer(k: number) {
    const ok = k === Q.ink;
    const s = Math.max(0, score + (ok ? 1 : -1));
    setScore(s);
    report(s);
    if (ok) feedback.correct(); else feedback.wrong();
    setI(i + 1);
  }
  return (
    <div className="pb-center">
      <p className="pb-count">Score: <b>{score}</b> · tap the INK colour</p>
      <p key={i} className="pb-word pop" style={{ color: COLORS[Q.ink].c }}>{COLORS[Q.word].name}</p>
      <div className="pb-swatches">
        {Q.opts.map((k) => <button key={`${i}-${k}`} type="button" aria-label={COLORS[k].name} style={{ background: COLORS[k].c }} onClick={() => answer(k)} />)}
      </div>
    </div>
  );
}

// ---------- 🎈 Balloon Pop ----------
function Balloons({ seed, report }: Props) {
  const spawns = useMemo(() => {
    const r = rng(seed);
    const out: { at: number; x: number; bomb: boolean; dur: number; hue: number }[] = [];
    for (let t = 200; t < 9000; t += 260 + r() * 240) out.push({ at: t, x: 6 + r() * 80, bomb: r() < 0.2, dur: 2400 + r() * 1200, hue: Math.floor(r() * 360) });
    return out;
  }, [seed]);
  const el = useElapsed(40);
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [pops, setPops] = useState<{ x: number; y: number; t: string; k: number }[]>([]);
  function pop(i: number, x: number, y: number) {
    if (gone.has(i)) return;
    const b = spawns[i];
    const s = Math.max(0, score + (b.bomb ? -2 : 1));
    setGone(new Set(gone).add(i));
    setScore(s);
    report(s);
    setPops((p) => [...p.slice(-6), { x, y, t: b.bomb ? "💥 −2" : "+1", k: i }]);
    if (b.bomb) feedback.wrong(); else feedback.tap();
  }
  return (
    <div className="pb-center">
      <p className="pb-count">Popped: <b>{score}</b></p>
      <div className="pb-sky">
        {spawns.map((b, i) => {
          const t = el - b.at;
          if (t < 0 || t > b.dur || gone.has(i)) return null;
          const y = 105 - (t / b.dur) * 125;
          return (
            <button key={i} type="button" className={`pb-balloon${b.bomb ? " bomb" : ""}`} style={{ left: `${b.x}%`, top: `${y}%`, "--h": b.hue } as CSSProperties} onPointerDown={(e) => { e.preventDefault(); pop(i, b.x, y); }}>
              {b.bomb ? "💣" : "🎈"}
            </button>
          );
        })}
        {pops.map((p) => <span key={p.k} className="pb-popped" style={{ left: `${p.x}%`, top: `${p.y}%` }}>{p.t}</span>)}
      </div>
    </div>
  );
}

// ---------- 🧠 Memory Flash ----------
const MEM = ["🍎", "🐶", "⭐", "🎈"];
function Memory({ seed, report, finish }: Props) {
  const seq = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 22 }, () => Math.floor(r() * MEM.length));
  }, [seed]);
  const [len, setLen] = useState(3);
  const [showing, setShowing] = useState(0); // index being flashed, or -1 when it's your turn
  const [input, setInput] = useState<number[]>([]);
  const [best, setBest] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  // Flash the sequence: a short beat, then each emoji lit for 450ms with a 200ms gap.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < len; i++) {
      const at = 400 + i * 650;
      timers.push(setTimeout(() => { setShowing(i); setLit(seq[i]); }, at));
      timers.push(setTimeout(() => setLit(null), at + 450));
    }
    timers.push(setTimeout(() => setShowing(-1), 400 + len * 650));
    return () => timers.forEach(clearTimeout);
  }, [len, seq]);
  function tap(k: number) {
    if (showing !== -1) return;
    const next = [...input, k];
    if (seq[next.length - 1] !== k) { feedback.wrong(); finish(best); return; }
    feedback.tap();
    if (next.length === len) {
      setBest(len);
      report(len);
      feedback.correct();
      setInput([]);
      setShowing(0);
      setLen(len + 1);
    } else setInput(next);
  }
  return (
    <div className="pb-center">
      <p className="pb-count">{showing !== -1 ? "Watch… 👀" : `Your turn: ${input.length}/${len}`} · best <b>{best}</b></p>
      <div className="pb-mem">
        {MEM.map((e, k) => (
          <button key={k} type="button" className={lit === k ? "lit" : ""} disabled={showing !== -1} onPointerDown={(ev) => { ev.preventDefault(); tap(k); }}>{e}</button>
        ))}
      </div>
    </div>
  );
}
