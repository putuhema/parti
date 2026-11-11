"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { completedGroups, setAt, type Difficulty } from "../../../convex/lib/sudoku";
import { CoachCard, type Stage } from "@/components/Coach";
import { Game, type CoachMarks } from "@/components/Game";
import { Confetti, Hearts, Mascot, TopBar, formatTime } from "@/components/ui";
import { candidateDigits, LEVEL_NAMES, nextLesson, nudgeOf, TECHNIQUES, type Lesson, type Step, type TechniqueId } from "@/lib/coach";
import { drillFor, hasDrill } from "@/lib/drills";
import { useIdentity } from "@/lib/identity";
import { useTrickCredit } from "@/lib/useTrickCredit";
import type { PracticePuzzle } from "@/lib/practice";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";

const LEVELS: Difficulty[] = ["easy", "medium", "hard", "expert"];
/** A quiet minute without placing a number: the Coach button offers help. */
const STUCK_MS = 60_000;
/** Finding a trick yourself this many times masters it. */
const MASTERED = 3;
/** What each level practices. Every puzzle is checked so the coach can solve it with these. */
const LEVEL_INFO: Record<Difficulty, string> = {
  easy: "Singles only",
  medium: "Pointing pairs, box/line, naked pairs",
  hard: "Hidden pairs, X-Wings, Skyscrapers, Kites, empty rectangles",
  expert: "Wings, coloring, unique rectangles, chains",
};

type Mode = { kind: "level"; level: Difficulty } | { kind: "drill"; trick: TechniqueId };

export default function Solo() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [tricks, setTricks] = useState(false);
  const [round, setRound] = useState(0);
  if (mode) {
    const back = () => { setMode(null); setTricks(mode.kind === "drill"); };
    return <PracticeLoader key={`${round}-${mode.kind === "drill" ? mode.trick : mode.level}`} mode={mode} onAgain={() => setRound((r) => r + 1)} onChange={back} onDrill={(trick) => setMode({ kind: "drill", trick })} />;
  }
  if (tricks) return <TricksScreen onBack={() => setTricks(false)} onDrill={(trick) => setMode({ kind: "drill", trick })} />;
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
          <button key={l} className="seg" style={{ minHeight: 64, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }} onClick={() => { feedback.unlock(); feedback.tap(); setMode({ kind: "level", level: l }); }}>
            <span style={{ fontSize: 18, textTransform: "capitalize" }}>{l}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "none" }}>{LEVEL_INFO[l]}</span>
          </button>
        ))}
      </div>
      <button className="pill-btn" style={{ fontSize: 18, marginTop: 4 }} onClick={() => { feedback.unlock(); feedback.tap(); setTricks(true); }}>
        🎓 Learn the tricks
      </button>
    </main>
  );
}

/** Every trick Kubo teaches, how far you've got with each, and a drill to practice it. */
function TricksScreen({ onBack, onDrill }: { onBack: () => void; onDrill: (t: TechniqueId) => void }) {
  const { me } = useIdentity();
  const [open, setOpen] = useState<TechniqueId | null>(null);
  const all = Object.keys(TECHNIQUES) as TechniqueId[];
  const mastered = all.filter((t) => (me.tricks[t]?.found ?? 0) >= MASTERED).length;
  return (
    <main className="screen">
      <TopBar back={onBack} title="Learn the tricks" />
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
        Find a trick yourself {MASTERED} times to master it. You&apos;ve mastered {mastered} of {all.length}.
      </p>
      {([1, 2, 3, 4] as const).map((lvl) => (
        <section key={lvl} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="label">{LEVEL_NAMES[lvl]}</h2>
          <div className="list">
            {all.filter((t) => TECHNIQUES[t].level === lvl).map((t) => {
              const p = me.tricks[t];
              const status = (p?.found ?? 0) >= MASTERED ? "mastered" : p?.found ? "learned" : p?.shown ? "seen" : "new";
              return (
                <div key={t} className="list-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={`trick-badge ${status}`} aria-hidden="true">{status === "mastered" ? "★" : status === "learned" ? "✓" : status === "seen" ? "•" : ""}</span>
                    <button className="trick-name" aria-expanded={open === t} onClick={() => { feedback.tap(); setOpen(open === t ? null : t); }}>
                      <span style={{ fontSize: 16, fontWeight: 900 }}>{TECHNIQUES[t].name}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>
                        {status === "new" ? "Not tried yet" : `Found ${p?.found ?? 0} yourself · shown ${p?.shown ?? 0}`}
                      </span>
                    </button>
                    <button className="btn btn-sm btn-green" style={{ width: "auto", padding: "0 14px" }} disabled={!hasDrill(t)} onClick={() => { feedback.unlock(); feedback.tap(); onDrill(t); }}>Drill</button>
                  </span>
                  {open === t && <p style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.4, color: "var(--plum)" }}>{TECHNIQUES[t].tip}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}

/** Picks a puzzle the coach can solve at this level (in a worker so the screen stays smooth), or sets up a drill. */
function PracticeLoader({ mode, onAgain, onChange, onDrill }: { mode: Mode; onAgain: () => void; onChange: () => void; onDrill: (t: TechniqueId) => void }) {
  const [picked, setPicked] = useState<PracticePuzzle | "none" | null>(() => {
    if (mode.kind !== "drill") return null;
    const d = drillFor(mode.trick);
    return d ? { ...d, drill: mode.trick, hardest: TECHNIQUES[mode.trick].level, used: [mode.trick], graded: true } : "none";
  });
  const level = mode.kind === "level" ? mode.level : null;
  useEffect(() => {
    if (!level) return;
    const w = new Worker(new URL("../../lib/practice.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ result: PracticePuzzle }>) => setPicked(e.data.result);
    w.postMessage({ id: 1, level });
    return () => w.terminate();
  }, [level]);
  if (picked === "none") {
    return (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Mascot size={96} mood="wow" />
        <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>No drill for this trick yet</p>
        <button className="btn btn-white" onClick={onChange}>Back to tricks</button>
      </main>
    );
  }
  if (!picked) {
    return (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <Mascot size={96} className="bob" />
        <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Kubo is picking a {level} puzzle…</p>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>{level && LEVEL_INFO[level]}</p>
      </main>
    );
  }
  return <SoloGame label={mode.kind === "drill" ? `DRILL · ${TECHNIQUES[mode.trick].name.toUpperCase()}` : `SOLO · ${mode.kind === "level" ? mode.level.toUpperCase() : ""}`} picked={picked} onAgain={onAgain} onChange={onChange} onDrill={onDrill} />;
}

function SoloGame({ label, picked, onAgain, onChange, onDrill }: { label: string; picked: PracticePuzzle; onAgain: () => void; onChange: () => void; onDrill: (t: TechniqueId) => void }) {
  const { puzzle, solution } = picked;
  const drill = picked.drill;
  // A drill starts part-way through, with Kubo already pointing at the trick.
  const [values, setValues] = useState(picked.start ?? puzzle);
  const [mistakes, setMistakes] = useState(0);
  const [hints, setHints] = useState(3);
  const [startedAt] = useState(() => Date.now());
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const now = useNow(1000);
  // A drill opens at its trick. For rare tricks that come after a few easier eliminations,
  // Kubo applies those first (into your notes) and starts the lesson at the trick itself.
  const [drillSetup] = useState(() => {
    if (!drill) return null;
    const start = picked.start ?? puzzle;
    const l = nextLesson(start, new Set());
    const at = Math.max(0, l.steps.findIndex((s) => s.technique === drill));
    const prior = l.steps.slice(0, at).flatMap((s) => s.elim);
    const cand = candidateDigits(start, new Set(prior.map((e) => `${e.cell}:${e.digit}`)));
    const cells: Record<number, { keep: number[]; drop: number[] }> = {};
    for (const e of prior) (cells[e.cell] ??= { keep: cand[e.cell], drop: [] }).drop.push(e.digit);
    // The steps before the trick were applied silently, so the lesson starts at the trick ("Step 1 of …").
    return { lesson: { ...l, steps: l.steps.slice(at) }, at: 0, prior: prior.map((e) => `${e.cell}:${e.digit}`), patch: prior.length ? { id: 1, cells } : null };
  });
  // Coach: eliminations you've been shown stay known (and in your notes), so later lessons build on them.
  const known = useRef(new Set<string>(drillSetup?.prior ?? []));
  const [lesson, setLesson] = useState<{ lesson: Lesson; index: number; stage: Stage } | null>(() =>
    drillSetup ? { lesson: drillSetup.lesson, index: drillSetup.at, stage: 1 } : null);
  /** Drills end once you've placed the number the trick unlocks. */
  const [drillDone, setDrillDone] = useState<"found" | "shown" | null>(null);
  const [focus, setFocus] = useState<{ cell: number; id: number } | null>(null);
  const { me } = useIdentity();
  const recordTricks = useMutation(api.players.recordTricks);
  // The move the open (or last) lesson leads to. Placing it yourself before "Show me" counts as finding the trick.
  // A drill's lesson is open from the start, so its goal is pending from the start too.
  const pending = useRef<{ cell: number; digit: number; tricks: TechniqueId[]; revealed: boolean } | null>(lesson ? goalOf(lesson.lesson) : null);
  const settle = (how: "found" | "shown") => {
    const p = pending.current;
    pending.current = null;
    if (p) void recordTricks({ found: how === "found" ? p.tricks : [], shown: how === "shown" ? p.tricks : [] }).catch(() => {});
    if (p && drill && p.tricks.includes(drill)) setDrillDone(how);
  };
  // When you last placed a number: after a quiet minute the Coach button offers help.
  const [lastProgress, setLastProgress] = useState(() => Date.now());
  // Which eliminations each coach notes edit made, so undoing it makes Kubo forget them too.
  const patchElims = useRef(new Map<number, string[]>(drillSetup?.patch ? [[1, drillSetup.prior]] : []));
  const [notesPatch, setNotesPatch] = useState<{ id: number; cells: Record<number, { keep: number[]; drop: number[] }> } | null>(drillSetup?.patch ?? null);

  const apply = useCallback(
    (cell: number, digit: number) => {
      if (solution[cell] !== String(digit)) {
        setMistakes((m) => m + 1);
        return { correct: false, row: false, col: false, box: false, finished: false };
      }
      const next = setAt(values, cell, String(digit));
      setValues(next);
      setLastProgress(Date.now());
      const finished = next === solution;
      if (finished) setDoneAt(Date.now());
      return { correct: true, ...completedGroups(next, solution, cell), finished };
    },
    [solution, values],
  );

  const credit = useTrickCredit();
  const onPlace = useCallback(async (cell: number, digit: number) => {
    setLesson(null); // the board changed, so the lesson is stale
    const before = values;
    const r = apply(cell, digit);
    const p = pending.current;
    if (r.correct && p && p.cell === cell && p.digit === digit) settle(p.revealed ? "shown" : "found");
    // Any other correct move you make yourself counts for the tricks behind it.
    else if (r.correct) credit(before, cell, digit, known.current);
    return r;
  }, [apply, values, credit]); // eslint-disable-line react-hooks/exhaustive-deps
  const hintApi = { left: hints, use: async (cell: number) => {
    setHints((h) => h - 1);
    if (pending.current?.cell === cell) settle("shown");
    return apply(cell, Number(solution[cell]));
  } };

  const step = lesson?.lesson.steps[lesson.index];
  const marks: CoachMarks | null = !step || !lesson ? null : coachMarks(step, lesson.stage);

  const askCoach = () => {
    if (lesson) { setLesson(null); return; }
    // Work on a copy: only the steps you actually see become part of what you know.
    const l = nextLesson(values, new Set(known.current));
    setLesson({ lesson: l, index: 0, stage: 0 });
    pending.current = goalOf(l);
  };
  /** Reveal the full step: remember its eliminations, cross them off in your notes, point at it. */
  const showStep = () => {
    if (!lesson || !step) return;
    setLesson({ ...lesson, stage: 2 });
    if (pending.current) pending.current.revealed = true;
    if (step.elim.length) {
      for (const e of step.elim) known.current.add(`${e.cell}:${e.digit}`);
      const cand = candidateDigits(values, known.current);
      const cells: Record<number, { keep: number[]; drop: number[] }> = {};
      for (const e of step.elim) {
        const c = (cells[e.cell] ??= { keep: cand[e.cell], drop: [] });
        c.drop.push(e.digit);
      }
      const id = Date.now();
      patchElims.current.set(id, step.elim.map((e) => `${e.cell}:${e.digit}`));
      setNotesPatch({ id, cells });
    }
    setFocus({ cell: step.place?.cell ?? step.focus[0], id: Date.now() });
  };
  const placeFromCoach = () => {
    const p = step?.place;
    if (!p) return;
    setLesson(null);
    settle("shown");
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
        title={<span className={`chip ${drill ? "chip-sun" : "chip-mist"}`} style={{ display: "inline-block", maxWidth: "46vw", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle" }} title={label}>{label}</span>}
        right={<span style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 18, fontWeight: 900, color: "var(--muted)" }}>{formatTime((doneAt ?? now) - startedAt)}</span><Hearts left={Math.max(0, 3 - mistakes)} total={3} /></span>}
      />
      <Game puzzle={puzzle} values={values} onPlace={onPlace} hints={hintApi} disabled={!!doneAt}
        solved={!!doneAt} finishNote={doneAt ? `${formatTime(doneAt - startedAt)} · ${mistakes} mistake${mistakes === 1 ? "" : "s"}` : undefined}
        coach={marks} focusCell={focus} notesPatch={notesPatch}
        onUndoPatch={(id) => { for (const k of patchElims.current.get(id) ?? []) known.current.delete(k); patchElims.current.delete(id); }}
        coachTool={doneAt ? undefined : { onClick: askCoach, active: !!lesson, pulse: !lesson && now - lastProgress > STUCK_MS }}
        wrongTip={(d) => `${d} doesn't fit here, but no ${d} nearby shows why. Tap Coach for a hint.`} />
      {drillDone && !doneAt && (
        <div className="overlay">
          {drillDone === "found" && <Confetti count={40} />}
          <Mascot size={110} mood={drillDone === "found" ? "joy" : "happy"} className={drillDone === "found" ? "jump" : "bob"} />
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 900, textAlign: "center", color: drillDone === "found" ? "var(--lime-dark)" : "var(--ink)" }}>
            {drillDone === "found" ? `You found the ${TECHNIQUES[drill!].name}!` : `Now you've seen a ${TECHNIQUES[drill!].name}`}
          </h2>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>
            {drillDone === "found" ? "That counts toward mastering it." : "Try another one and see if you can spot it before Kubo shows you."}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignSelf: "stretch", maxWidth: 420, margin: "0 auto", width: "100%" }}>
            <button className="btn btn-green" onClick={onAgain}>Another {TECHNIQUES[drill!].name}</button>
            <button className="btn btn-white" onClick={() => setDrillDone(null)}>Keep solving this puzzle</button>
            <button className="btn btn-ghost" onClick={onChange}>Back to tricks</button>
          </div>
        </div>
      )}
      {lesson && !doneAt && (
        <CoachCard
          lesson={lesson.lesson}
          index={lesson.index}
          stage={lesson.stage}
          progress={me.tricks}
          onDrill={drill ? undefined : onDrill}
          onMore={() => setLesson({ ...lesson, stage: 1 })}
          onShow={showStep}
          onNext={() => setLesson({ ...lesson, index: lesson.index + 1, stage: 0 })}
          onPlace={placeFromCoach}
          onTry={() => { if (step?.place) setFocus({ cell: step.place.cell, id: Date.now() }); setLesson(null); }}
          onReveal={reveal}
          onClose={() => setLesson(null)}
        />
      )}
      {/* The board's SOLVED! celebration plays first; the summary follows. */}
      {doneAt && now - doneAt > 2200 && (
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
            <button className="btn btn-white" onClick={onChange}>{drill ? "Back to tricks" : "Change level"}</button>
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

/** The number a lesson leads to, and the tricks on the way. */
function goalOf(l: Lesson) {
  const goal = l.steps.at(-1)?.place;
  return goal && !l.stuck ? { ...goal, tricks: l.steps.map((s) => s.technique), revealed: false } : null;
}
