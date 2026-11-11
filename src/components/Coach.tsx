"use client";

import { Icon, Mascot } from "@/components/ui";
import { LEVEL_NAMES, TECHNIQUES, nudgeOf, type Lesson } from "@/lib/coach";
import { feedback } from "@/lib/feedback";

const LEVEL_COLORS = { 1: "chip-sky", 2: "chip-sun", 3: "chip-grape", 4: "chip-mist" } as const;

/** How much of a step is showing: a nudge, the trick's name, or the full explanation. */
export type Stage = 0 | 1 | 2;

/**
 * Kubo's lesson card, docked at the bottom over the keypad so the board stays visible.
 * Each step starts as a gentle nudge; you ask for more only if you need it.
 */
export function CoachCard({ lesson, index, stage, progress, onMore, onShow, onNext, onPlace, onTry, onReveal, onClose }: {
  lesson: Lesson;
  index: number;
  stage: Stage;
  /** Your record per trick: found yourself after a nudge, or shown. */
  progress?: Record<string, { found: number; shown: number }>;
  onMore: () => void;
  onShow: () => void;
  onNext: () => void;
  onPlace: () => void;
  onTry: () => void;
  onReveal: () => void;
  onClose: () => void;
}) {
  const step = lesson.steps[index];
  const total = lesson.steps.length;
  const last = index === total - 1;
  const stuckHere = lesson.stuck && (!step || (last && stage === 2));
  const t = step ? TECHNIQUES[step.technique] : null;
  const tap = (fn: () => void) => () => { feedback.tap(); fn(); };

  return (
    <section className="coach-card" role="dialog" aria-label="Coach" aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Mascot size={44} />
        <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
          {!step ? (
            <span style={{ fontSize: 18, fontWeight: 900 }}>Hmm, a tough spot</span>
          ) : stage === 0 ? (
            <span style={{ fontSize: 18, fontWeight: 900 }}>Here&apos;s a hint</span>
          ) : (
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, fontWeight: 900 }}>{t!.name}</span>
              <span className={`chip ${LEVEL_COLORS[t!.level]}`} style={{ padding: "3px 8px", fontSize: 11 }}>{LEVEL_NAMES[t!.level].toUpperCase()}</span>
            </span>
          )}
          {step && total > 1 && <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>Step {index + 1} of {total}{lesson.stuck ? "" : ", then a number goes in"}</span>}
        </span>
        <button className="icon-btn" aria-label="Close coach" onClick={tap(onClose)}><Icon.Close size={14} /></button>
      </div>

      {step && stage === 0 && <p>{nudgeOf(step).text}</p>}
      {step && stage === 1 && (
        <>
          <p>{nudgeOf(step).text} There&apos;s a <b>{t!.name.toLowerCase()}</b> here.</p>
          {(progress?.[step.technique]?.found ?? 0) > 0 && (
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--lime-dark)" }}>You&apos;ve found {progress![step.technique].found} of these on your own. You can do this!</span>
          )}
          <details open><summary>How does a {t!.name.toLowerCase()} work?</summary><p>{t!.tip}</p></details>
        </>
      )}
      {step && stage === 2 && (
        <>
          <p>{step.text}</p>
          <details><summary>How does a {t!.name.toLowerCase()} work?</summary><p>{t!.tip}</p></details>
          {step.elim.length > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>I&apos;ve crossed these off in your notes.</span>}
        </>
      )}
      {stuckHere && (
        <p style={{ color: "var(--plum)" }}>
          {step ? "That's as far as my tricks go here. " : ""}The next move needs a harder trick than the ones I teach yet. Want me to reveal one cell so you can keep going?
        </p>
      )}

      {stuckHere ? (
        <div className="coach-btns">
          <button className="btn btn-white btn-sm" onClick={tap(onClose)}>I&apos;ll keep trying</button>
          <button className="btn btn-green btn-sm" onClick={tap(onReveal)}>Reveal a cell</button>
        </div>
      ) : stage === 0 ? (
        <div className="coach-btns">
          <button className="btn btn-white btn-sm" onClick={tap(onMore)}>Bigger hint</button>
          <button className="btn btn-green btn-sm" onClick={tap(onShow)}>Show me</button>
        </div>
      ) : stage === 1 ? (
        <div className="coach-btns">
          <button className="btn btn-white btn-sm" onClick={tap(onClose)}>I&apos;ll find it</button>
          <button className="btn btn-green btn-sm" onClick={tap(onShow)}>Show me</button>
        </div>
      ) : step?.place && last ? (
        <div className="coach-btns">
          <button className="btn btn-white btn-sm" onClick={tap(onTry)}>I&apos;ll place it</button>
          <button className="btn btn-green btn-sm" onClick={tap(onPlace)}>Place {step.place.digit}</button>
        </div>
      ) : (
        <button className="btn btn-green btn-sm" onClick={tap(onNext)}>Next step</button>
      )}
    </section>
  );
}
