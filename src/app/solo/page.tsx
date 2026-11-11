"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { completedGroups, setAt, type Difficulty } from "../../../convex/lib/sudoku";
import { CoachCard, type Stage } from "@/components/Coach";
import { Game, type CoachMarks } from "@/components/Game";
import { Confetti, Hearts, Mascot, TopBar, formatTime } from "@/components/ui";
import { candidateDigits, nextLesson, nudgeOf, TECHNIQUES, type Lesson, type Step } from "@/lib/coach";
import type { PracticePuzzle } from "@/lib/practice";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";

const LEVELS: Difficulty[] = ["easy", "medium", "hard", "expert"];
/** What each level practices. Every puzzle is checked so the coach can solve it with these. */
const LEVEL_INFO: Record<Difficulty, string> = {
  easy: "Singles only",
  medium: "Pointing pairs, box/line, naked pairs",
  hard: "Hidden pairs, X-Wings, Skyscrapers, Kites",
  expert: "Wings, coloring, rectangles, chains",
};

export default function Solo() {
  const [level, setLevel] = useState<Difficulty | null>(null);
  const [round, setRound] = useState(0);
  if (!level) {
    return (
      <main className="screen">
        <TopBar back="/sudoku" title="Practice solo" />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 0" }}>
          <Mascot size={100} className="bob" />
          <p style={{ margin: 0, fontSize: 18, fontWeight: 800, textAlign: "center" }}>Warm up before you take on your friends.</p>
        </div>
        <h2 className="label">Pick a level</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {LEVELS.map((l) => (
            <button key={l} className="seg" style={{ minHeight: 64, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }} onClick={() => { feedback.unlock(); feedback.tap(); setLevel(l); }}>
              <span style={{ fontSize: 18, textTransform: "capitalize" }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "none" }}>{LEVEL_INFO[l]}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }
  return <PracticeLoader key={round} level={level} onAgain={() => setRound((r) => r + 1)} onChange={() => setLevel(null)} />;
}

/** Picks a puzzle the coach can solve at this level, in a worker so the screen stays smooth. */
function PracticeLoader({ level, onAgain, onChange }: { level: Difficulty; onAgain: () => void; onChange: () => void }) {
  const [picked, setPicked] = useState<PracticePuzzle | null>(null);
  useEffect(() => {
    const w = new Worker(new URL("../../lib/practice.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<PracticePuzzle>) => setPicked(e.data);
    w.postMessage({ id: 1, level });
    return () => w.terminate();
  }, [level]);
  if (!picked) {
    return (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Mascot size={96} className="bob" />
        <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Kubo is picking a {level} puzzle…</p>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>{LEVEL_INFO[level]}</p>
      </main>
    );
  }
  return <SoloGame level={level} picked={picked} onAgain={onAgain} onChange={onChange} />;
}

function SoloGame({ level, picked, onAgain, onChange }: { level: Difficulty; picked: PracticePuzzle; onAgain: () => void; onChange: () => void }) {
  const { puzzle, solution } = picked;
  const [values, setValues] = useState(puzzle);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(3);
  const [startedAt] = useState(() => Date.now());
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const now = useNow(1000);
  // Coach: eliminations you've been shown stay known (and in your notes), so later lessons build on them.
  const known = useRef(new Set<string>());
  const [lesson, setLesson] = useState<{ lesson: Lesson; index: number; stage: Stage } | null>(null);
  const [focus, setFocus] = useState<{ cell: number; id: number } | null>(null);
  const [notesPatch, setNotesPatch] = useState<{ id: number; cells: Record<number, { keep: number[]; drop: number[] }> } | null>(null);

  const apply = useCallback(
    (cell: number, digit: number) => {
      if (solution[cell] !== String(digit)) {
        setMistakes((m) => m + 1);
        return { correct: false, row: false, col: false, box: false, finished: false };
      }
      const next = setAt(values, cell, String(digit));
      setValues(next);
      const finished = next === solution;
      if (finished) setDoneAt(Date.now());
      return { correct: true, ...completedGroups(next, solution, cell), finished };
    },
    [solution, values],
  );

  const onPlace = useCallback(async (cell: number, digit: number) => {
    setLesson(null); // the board changed, so the lesson is stale
    return apply(cell, digit);
  }, [apply]);
  const hintApi = { left: hints, use: async (cell: number) => { setHints((h) => h - 1); return apply(cell, Number(solution[cell])); } };

  const step = lesson?.lesson.steps[lesson.index];
  const marks: CoachMarks | null = !step || !lesson ? null : coachMarks(step, lesson.stage);

  const askCoach = () => {
    if (lesson) { setLesson(null); return; }
    // Work on a copy: only the steps you actually see become part of what you know.
    setLesson({ lesson: nextLesson(values, new Set(known.current)), index: 0, stage: 0 });
  };
  /** Reveal the full step: remember its eliminations, cross them off in your notes, point at it. */
  const showStep = () => {
    if (!lesson || !step) return;
    setLesson({ ...lesson, stage: 2 });
    if (step.elim.length) {
      for (const e of step.elim) known.current.add(`${e.cell}:${e.digit}`);
      const cand = candidateDigits(values, known.current);
      const cells: Record<number, { keep: number[]; drop: number[] }> = {};
      for (const e of step.elim) {
        const c = (cells[e.cell] ??= { keep: cand[e.cell], drop: [] });
        c.drop.push(e.digit);
      }
      setNotesPatch({ id: Date.now(), cells });
    }
    setFocus({ cell: step.place?.cell ?? step.focus[0], id: Date.now() });
  };
  const placeFromCoach = () => {
    const p = step?.place;
    if (!p) return;
    setLesson(null);
    if (apply(p.cell, p.digit).correct) feedback.correct();
  };
  const reveal = () => {
    // Stuck: fill one empty cell from the solution, preferring one the lesson was looking at.
    const cell = step?.focus.find((i) => values[i] === "0") ?? values.indexOf("0");
    setLesson(null);
    if (cell >= 0) { setFocus({ cell, id: Date.now() }); apply(cell, Number(solution[cell])); feedback.correct(); }
  };

  return (
    <main className="screen tight">
      <TopBar
        back="/"
        title={<span className="chip chip-mist">SOLO · {level.toUpperCase()}</span>}
        right={<span style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 18, fontWeight: 900, color: "var(--muted)" }}>{formatTime((doneAt ?? now) - startedAt)}</span><Hearts left={Math.max(0, 3 - mistakes)} total={3} /></span>}
      />
      <Game puzzle={puzzle} values={values} onPlace={onPlace} hints={hintApi} disabled={!!doneAt}
        coach={marks} focusCell={focus} notesPatch={notesPatch} coachTool={doneAt ? undefined : { onClick: askCoach, active: !!lesson }} />
      {lesson && !doneAt && (
        <CoachCard
          lesson={lesson.lesson}
          index={lesson.index}
          stage={lesson.stage}
          onMore={() => setLesson({ ...lesson, stage: 1 })}
          onShow={showStep}
          onNext={() => setLesson({ ...lesson, index: lesson.index + 1, stage: 0 })}
          onPlace={placeFromCoach}
          onTry={() => { if (step?.place) setFocus({ cell: step.place.cell, id: Date.now() }); setLesson(null); }}
          onReveal={reveal}
          onClose={() => setLesson(null)}
        />
      )}
      {doneAt && (
        <div className="overlay">
          <Confetti />
          <Mascot size={120} mood="joy" className="jump" />
          <h2 style={{ margin: 0, fontSize: 40, fontWeight: 900, color: "var(--lime-dark)" }}>Solved!</h2>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--muted)" }}>{formatTime(doneAt - startedAt)} · {mistakes} mistake{mistakes === 1 ? "" : "s"}</p>
          {picked.used.some((t) => TECHNIQUES[t].level > 1) && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span className="label">Tricks this puzzle needed</span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 360 }}>
                {picked.used.filter((t) => TECHNIQUES[t].level > 1).map((t) => <span key={t} className="chip chip-sun">{TECHNIQUES[t].name}</span>)}
              </span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignSelf: "stretch", maxWidth: 420, margin: "0 auto", width: "100%" }}>
            <button className="btn btn-green" onClick={onAgain}>Play again</button>
            <button className="btn btn-white" onClick={onChange}>Change level</button>
            <Link href="/sudoku" className="btn btn-ghost">Back to Sudoku</Link>
          </div>
        </div>
      )}
    </main>
  );
}

/** What the board highlights at each hint stage, so a nudge never gives the move away. */
function coachMarks(step: Step, stage: Stage): CoachMarks {
  if (stage === 0) return { area: nudgeOf(step).cells, focus: [], clues: [], marks: {} };
  if (stage === 1) {
    // Name the trick: show the pattern, but not the answer or what it rules out.
    if (step.place) return { area: step.area, focus: [], clues: step.clues, marks: {} };
    const marks = Object.fromEntries(step.focus.filter((c) => step.marks[c]).map((c) => [c, { show: step.marks[c].show, strike: [] }]));
    return { area: step.area, focus: step.focus, clues: [], marks, colors: step.colors, order: step.order };
  }
  return { area: step.area, focus: step.focus, clues: step.clues, marks: step.marks, target: step.place?.cell, colors: step.colors, order: step.order };
}
