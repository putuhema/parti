"use client";

import { Icon, Mascot } from "@/components/ui";
import { LEVEL_NAMES, TECHNIQUES, type Lesson } from "@/lib/coach";
import { feedback } from "@/lib/feedback";

const LEVEL_COLORS = { 1: "chip-sky", 2: "chip-sun", 3: "chip-grape", 4: "chip-mist" } as const;

/**
 * Kubo's lesson card, docked at the bottom over the keypad so the board stays visible.
 * Walks through any elimination steps, then the cell they unlock.
 */
export function CoachCard({ lesson, index, onNext, onPlace, onTry, onReveal, onClose }: {
  lesson: Lesson;
  index: number;
  onNext: () => void;
  onPlace: () => void;
  onTry: () => void;
  onReveal: () => void;
  onClose: () => void;
}) {
  const step = lesson.steps[index];
  const total = lesson.steps.length;
  const last = index === total - 1;
  const stuckHere = lesson.stuck && (!step || last);

  return (
    <section className="coach-card" role="dialog" aria-label="Coach" aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Mascot size={44} />
        <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
          {step ? (
            <>
              <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 18, fontWeight: 900 }}>{TECHNIQUES[step.technique].name}</span>
                <span className={`chip ${LEVEL_COLORS[TECHNIQUES[step.technique].level]}`} style={{ padding: "3px 8px", fontSize: 11 }}>
                  {LEVEL_NAMES[TECHNIQUES[step.technique].level].toUpperCase()}
                </span>
              </span>
              {total > 1 && <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>Step {index + 1} of {total}{lesson.stuck ? "" : ", then a number goes in"}</span>}
            </>
          ) : (
            <span style={{ fontSize: 18, fontWeight: 900 }}>Hmm, a tough spot</span>
          )}
        </span>
        <button className="icon-btn" aria-label="Close coach" onClick={() => { feedback.tap(); onClose(); }}><Icon.Close size={14} /></button>
      </div>

      {step && <p>{step.text}</p>}
      {step && (
        <details>
          <summary>How does a {TECHNIQUES[step.technique].name.toLowerCase()} work?</summary>
          <p>{TECHNIQUES[step.technique].tip}</p>
        </details>
      )}
      {stuckHere && (
        <p style={{ color: "var(--plum)" }}>
          {step ? "That's as far as my tricks go here. " : ""}The next move needs a harder trick than the ones I teach yet (like chains). Want me to reveal one cell so you can keep going?
        </p>
      )}

      {stuckHere ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button className="btn btn-green btn-sm" onClick={() => { feedback.tap(); onReveal(); }}>Reveal a cell</button>
          <button className="btn btn-white btn-sm" onClick={() => { feedback.tap(); onClose(); }}>I&apos;ll keep trying</button>
        </div>
      ) : step?.place && last ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button className="btn btn-white btn-sm" onClick={() => { feedback.tap(); onTry(); }}>I&apos;ll place it</button>
          <button className="btn btn-green btn-sm" onClick={() => { feedback.tap(); onPlace(); }}>Place {step.place.digit}</button>
        </div>
      ) : (
        <button className="btn btn-green btn-sm" onClick={() => { feedback.tap(); onNext(); }}>Next step</button>
      )}
    </section>
  );
}
