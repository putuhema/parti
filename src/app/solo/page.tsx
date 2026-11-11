"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { completedGroups, generatePuzzle, setAt, type Difficulty } from "../../../convex/lib/sudoku";
import { CoachCard } from "@/components/Coach";
import { Game, type CoachMarks } from "@/components/Game";
import { Confetti, Hearts, Mascot, TopBar, formatTime } from "@/components/ui";
import { nextLesson, type Lesson } from "@/lib/coach";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";

const LEVELS: Difficulty[] = ["easy", "medium", "hard", "expert"];

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
            <button key={l} className="seg" style={{ minHeight: 56, fontSize: 18, textTransform: "capitalize" }} onClick={() => { feedback.unlock(); feedback.tap(); setLevel(l); }}>
              {l}
            </button>
          ))}
        </div>
      </main>
    );
  }
  return <SoloGame key={round} level={level} onAgain={() => setRound((r) => r + 1)} onChange={() => setLevel(null)} />;
}

function SoloGame({ level, onAgain, onChange }: { level: Difficulty; onAgain: () => void; onChange: () => void }) {
  const [{ puzzle, solution }] = useState(() => generatePuzzle(level));
  const [values, setValues] = useState(puzzle);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(3);
  const [startedAt] = useState(() => Date.now());
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const now = useNow(1000);
  // Coach: eliminations already worked out stay known, so later lessons build on them.
  const known = useRef(new Set<string>());
  const [lesson, setLesson] = useState<{ lesson: Lesson; index: number } | null>(null);
  const [focus, setFocus] = useState<{ cell: number; id: number } | null>(null);

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
  const marks: CoachMarks | null = step ? { area: step.area, focus: step.focus, clues: step.clues, marks: step.marks, target: step.place?.cell } : null;
  const askCoach = () => {
    if (lesson) { setLesson(null); return; }
    const l = nextLesson(values, known.current, 12);
    setLesson({ lesson: l, index: 0 });
    const first = l.steps[0];
    if (first) setFocus({ cell: first.place?.cell ?? first.focus[0], id: Date.now() });
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
        coach={marks} focusCell={focus} coachTool={doneAt ? undefined : { onClick: askCoach, active: !!lesson }} />
      {lesson && !doneAt && (
        <CoachCard
          lesson={lesson.lesson}
          index={lesson.index}
          onNext={() => {
            const i = lesson.index + 1;
            setLesson({ ...lesson, index: i });
            const s = lesson.lesson.steps[i];
            if (s) setFocus({ cell: s.place?.cell ?? s.focus[0], id: Date.now() });
          }}
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
