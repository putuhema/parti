"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { applyMove, findMove, fromFen, inCheck, legalMoves, movesFrom, typeOf, VALUE, colorOf, type State } from "../../../../../convex/lib/chess";
import { Board } from "@/components/chess/Board";
import { Confetti, Heart, Icon, Mascot } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";
import { LESSONS, bestMoves, parseStars, starTargets, type FenStep, type StarStep, type TapStep } from "@/lib/lessons";

const HEARTS = 5;

type StepResult = { ok: boolean; penalty: number };

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const lesson = LESSONS.find((l) => l.id === id);
  const router = useRouter();
  const { token } = useIdentity();
  const done = useMutation(api.chess.lessonDone);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0); // bump to restart
  const [hearts, setHearts] = useState(HEARTS);
  const [penalty, setPenalty] = useState(0);
  const [solved, setSolved] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ stars: number; xp: number } | null>(null);

  if (!lesson) {
    return (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Mascot size={90} mood="wow" />
        <h1 style={{ margin: 0 }}>Lesson not found</h1>
        <Link href="/chess/learn" className="btn btn-green">Back to lessons</Link>
      </main>
    );
  }
  const s = lesson.steps[step];
  const pct = ((step + (solved ? 1 : 0)) / lesson.steps.length) * 100;

  const mistake = () => {
    feedback.wrong();
    setPenalty((p) => p + 1);
    setHearts((h) => h - 1);
  };
  const success = (msg: string, r?: StepResult) => {
    if (r) setPenalty((p) => p + r.penalty);
    feedback.correct(step + 1);
    setSolved(msg);
  };
  async function next() {
    feedback.tap();
    if (step + 1 < lesson!.steps.length) {
      setStep(step + 1);
      setSolved(null);
      return;
    }
    const stars = penalty === 0 ? 3 : penalty <= 2 ? 2 : 1;
    feedback.win();
    const xp = await done({ token, lesson: lesson!.id, stars }).catch(() => 0);
    setFinished({ stars, xp });
  }
  const restart = () => { setStep(0); setHearts(HEARTS); setPenalty(0); setSolved(null); setRun((r) => r + 1); };

  if (finished) {
    const idx = LESSONS.indexOf(lesson);
    const after = LESSONS[idx + 1];
    return (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 18 }}>
        <Confetti />
        <Mascot size={120} mood="joy" className="jump" />
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: "var(--lime-dark)" }}>Lesson complete!</h1>
        <div style={{ display: "flex", gap: 8 }} aria-label={`${finished.stars} of 3 stars`}>
          {[1, 2, 3].map((k) => (
            <svg key={k} className="pop" style={{ animationDelay: `${k * 150}ms` }} width="54" height="54" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 l3 6.5 7 .8 -5.2 4.8 1.4 7 -6.2 -3.6 -6.2 3.6 1.4 -7 L2 9.3 l7 -.8z" fill={k <= finished.stars ? "#FFC800" : "#E5E5E5"} stroke={k <= finished.stars ? "#E5A800" : "#CFCFCF"} strokeWidth="1.4" strokeLinejoin="round" /></svg>
          ))}
        </div>
        <span className="chip chip-sun" style={{ fontSize: 18 }}>+{finished.xp} XP</span>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--muted)" }}>{finished.stars === 3 ? "Perfect, no mistakes!" : "Play it again for 3 stars."}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignSelf: "stretch" }}>
          {after && <button className="btn btn-green" onClick={() => router.push(`/chess/learn/${after.id}`)}>Next: {after.name}</button>}
          <Link href="/chess/learn" className={`btn ${after ? "btn-white" : "btn-green"}`}>Back to lessons</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <header className="topbar" style={{ gap: 12 }}>
        <Link href="/chess/learn" className="icon-btn" aria-label="Close lesson"><Icon.Close /></Link>
        <span className="bar" style={{ flex: 1, height: 16, borderRadius: 8 }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Lesson progress">
          <span style={{ width: `${pct}%`, background: "var(--lime)", borderRadius: 8 }} />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 18, fontWeight: 900, color: "var(--cherry-edge)" }} aria-label={`${hearts} hearts`}>
          <Heart on size={24} />{hearts}
        </span>
      </header>

      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>{s.title}</h1>

      {s.kind === "stars" && <StarsStep key={`${run}-${step}`} step={s} onSolved={success} />}
      {s.kind === "fen" && <FenLesson key={`${run}-${step}`} step={s} onSolved={(m) => success(m)} onMistake={mistake} locked={!!solved} />}
      {s.kind === "tap" && <TapLesson key={`${run}-${step}`} step={s} onSolved={() => success("You found it!")} onMistake={mistake} locked={!!solved} />}

      {solved && (
        <div className="sheet" style={{ background: "#D7FFB8", borderTop: "2px solid #A5ED6E" }} role="status">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon.Check size={26} color="#58A700" /></span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#2F6E00" }}>{solved}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--lime-dark)" }}>Step {step + 1} of {lesson.steps.length}</span>
            </span>
          </div>
          <button className="btn btn-green" onClick={next}>{step + 1 < lesson.steps.length ? "Continue" : "Finish"}</button>
        </div>
      )}
      {hearts <= 0 && !solved && (
        <>
          <div className="sheet-backdrop" />
          <div className="sheet" role="dialog" aria-label="Out of hearts">
            <span className="grabber" />
            <div style={{ display: "flex", justifyContent: "center" }}><Mascot size={80} mood="wow" /></div>
            <h2 style={{ margin: 0, textAlign: "center", fontSize: 24, fontWeight: 900 }}>Out of hearts</h2>
            <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 700, color: "var(--muted)" }}>No worries. Every chess player learns by trying again!</p>
            <button className="btn btn-green" onClick={restart}>Try again</button>
            <Link href="/chess/learn" className="btn btn-white">Back to lessons</Link>
          </div>
        </>
      )}
    </main>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <section className="tip">
      <Mascot size={60} className="bob" />
      <p aria-live="polite">{text}</p>
    </section>
  );
}

// ---------- Stars ----------
function StarsStep({ step, onSolved }: { step: StarStep; onSolved: (msg: string, r: StepResult) => void }) {
  const board = useMemo(() => parseStars(step.rows), [step]);
  const best = useMemo(() => bestMoves(board), [board]);
  const [at, setAt] = useState(board.start);
  const [piece, setPiece] = useState(board.piece);
  const [sel, setSel] = useState(false);
  const [got, setGot] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [moved, setMoved] = useState<number | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [tip, setTip] = useState(step.tip);
  const [over, setOver] = useState(false);
  const enemies = new Set(board.enemies.filter((e) => !got.includes(e)));
  const targets = sel && !over ? starTargets(board, piece, at, enemies) : [];
  const goals = board.stars.length + board.enemies.length;

  const cells = Array.from({ length: board.n * board.n }, (_, i) => {
    if (i === at) return piece;
    if (board.blockers.includes(i)) return "P";
    if (enemies.has(i)) return step.rows.join("")[i];
    return ".";
  }).join("");

  function tap(i: number) {
    if (over) return;
    if (i === at) { feedback.tap(); setSel(!sel); return; }
    if (!sel) { setShake(at); setTip("Tap your piece first to see where it can go."); setTimeout(() => setShake(null), 320); return; }
    if (!targets.includes(i)) {
      setShake(i);
      setTimeout(() => setShake(null), 320);
      setTip(board.blockers.includes(i) ? "That's your own pawn. You can't land there." : "That square isn't on the dots. Try another one!");
      feedback.wrong();
      return;
    }
    const hit = board.stars.includes(i) || board.enemies.includes(i);
    const nextGot = hit && !got.includes(i) ? [...got, i] : got;
    const promoted = piece === "P" && Math.floor(i / board.n) === 0;
    setAt(i);
    setMoved(i);
    setGot(nextGot);
    if (promoted) setPiece("Q");
    const n = moves + 1;
    setMoves(n);
    if (board.enemies.includes(i)) feedback.capture(); else if (hit) feedback.correct(nextGot.length); else feedback.move();
    const left = goals - nextGot.length;
    if (promoted) setTip("Your pawn became a queen! That's called promotion.");
    else if (left > 0) setTip(hit ? `Nice! ${left} to go.` : "Keep going. Plan your path!");
    if (left === 0) {
      setTip(n <= best ? "Perfect path! You found the fastest way." : `You did it! The fastest way takes ${best} moves.`);
      setOver(true);
      setSel(false);
      const extra = Math.max(0, n - best);
      setTimeout(() => onSolved(n <= best ? `Perfect! ${n} moves` : `Done in ${n} moves`, { ok: true, penalty: extra > 2 ? 2 : extra > 0 ? 1 : 0 }), 450);
    }
  }

  return (
    <>
      <Tip text={tip} />
      <Board cells={cells} size={board.n} selected={sel ? at : null} targets={targets} stars={board.stars.filter((x) => !got.includes(x))} moved={moved} shake={shake} onTap={tap} label="Lesson board" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", gap: 4 }} aria-label={`${got.length} of ${goals} done`}>
          {Array.from({ length: goals }, (_, k) => (
            <svg key={k} width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 l3 6.5 7 .8 -5.2 4.8 1.4 7 -6.2 -3.6 -6.2 3.6 1.4 -7 L2 9.3 l7 -.8z" fill={k < got.length ? "#FFC800" : "#E5E5E5"} /></svg>
          ))}
        </span>
        <span style={{ fontSize: 17, fontWeight: 900, color: "var(--muted)" }}>Moves: {moves} · Best: {best}</span>
      </div>
    </>
  );
}

// ---------- Tap a square ----------
function TapLesson({ step, onSolved, onMistake, locked }: { step: TapStep; onSolved: () => void; onMistake: () => void; locked: boolean }) {
  const [shake, setShake] = useState<number | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const [tip, setTip] = useState(step.tip);
  const goal = (8 - Number(step.square[1])) * 8 + "abcdefgh".indexOf(step.square[0]);
  const name = (i: number) => "abcdefgh"[i % 8] + (8 - Math.floor(i / 8));
  return (
    <>
      <Tip text={tip} />
      <div style={{ textAlign: "center", fontSize: 40, fontWeight: 900, color: "var(--sky-btn)" }}>{step.square}</div>
      <Board
        cells={".".repeat(64)}
        selected={hit}
        shake={shake}
        onTap={(i) => {
          if (locked) return;
          if (i === goal) { setHit(i); onSolved(); return; }
          setShake(i);
          setTimeout(() => setShake(null), 320);
          setTip(`That's ${name(i)}. Look at the letters along the bottom and the numbers on the left.`);
          onMistake();
        }}
      />
    </>
  );
}

// ---------- Real positions ----------
function FenLesson({ step, onSolved, onMistake, locked }: { step: FenStep; onSolved: (msg: string) => void; onMistake: () => void; locked: boolean }) {
  const start = useMemo(() => fromFen(step.fen), [step]);
  const [state, setState] = useState<State>(start);
  const [sel, setSel] = useState<number | null>(null);
  const [last, setLast] = useState<[number, number] | null>(null);
  const [tip, setTip] = useState(step.tip);
  const [shake, setShake] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const me = start.turn;
  const targets = sel != null ? movesFrom(state, sel).map((m) => m.to) : [];
  const check = inCheck(state) ? state.cells.indexOf(state.turn === "w" ? "K" : "k") : undefined;
  const bestValue = Math.max(0, ...legalMoves(start).map((m) => (start.cells[m.to] === "." ? 0 : VALUE[typeOf(start.cells[m.to])])));

  function tap(i: number) {
    if (locked || state !== start) return;
    const ch = state.cells[i];
    if (sel != null && targets.includes(i)) {
      const m = findMove(state, sel, i)!;
      const res = applyMove(state, m);
      setState(res.state);
      setLast([m.from, m.to]);
      setSel(null);
      if (res.captured) feedback.capture(); else feedback.move();
      const n = res.state;
      const ok =
        step.goal === "mate" ? inCheck(n) && legalMoves(n).length === 0 :
        step.goal === "check" ? inCheck(n) :
        step.goal === "castle" ? typeOf(state.cells[m.from]) === "k" && Math.abs(m.to - m.from) === 2 :
        step.goal === "escape" ? true :
        !!res.captured && VALUE[typeOf(res.captured)] === bestValue;
      if (ok) {
        const msg = step.goal === "mate" ? "Checkmate!" : step.goal === "check" ? "Check!" : step.goal === "castle" ? "Castled!" : step.goal === "escape" ? "King is safe!" : "Great capture!";
        if (step.goal === "mate" || step.goal === "check") feedback.check();
        timer.current = setTimeout(() => onSolved(msg), 400);
        return;
      }
      setTip(
        step.goal === "mate" ? (inCheck(n) ? "That's check, but the king can escape. Look for a move with no way out." : "That doesn't attack the king. Look for checkmate!") :
        step.goal === "check" ? "That move doesn't attack the king. Try again!" :
        step.goal === "castle" ? "That's a normal move. Castling means moving the king two squares sideways." :
        "There's a bigger prize. Remember: queen 9, rook 5, knight and bishop 3, pawn 1.",
      );
      onMistake();
      timer.current = setTimeout(() => { setState(start); setLast(null); }, 900);
      return;
    }
    if (colorOf(ch) === me) {
      feedback.tap();
      setSel(sel === i ? null : i);
      if (movesFrom(state, i).length === 0) setTip("That piece has no safe moves. Try another one.");
      return;
    }
    if (sel != null) {
      setShake(i);
      setTimeout(() => setShake(null), 320);
    }
    setSel(null);
  }

  return (
    <>
      <Tip text={tip} />
      <Board cells={state.cells} flipped={me === "b"} selected={sel} targets={targets} last={last} check={check} shake={shake} onTap={tap} moved={last?.[1] ?? null} />
      <p style={{ margin: 0, textAlign: "center", fontSize: 16, fontWeight: 900 }}>You play {me === "w" ? "white" : "black"}</p>
    </>
  );
}
