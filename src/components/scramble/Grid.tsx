"use client";

import { useRef, useState } from "react";
import { CELLS, MIN_LEN, ROUND_MS, SIZE, points, spell, touching } from "../../../convex/lib/scramble/board";
import { TimerBar, Toast } from "@/components/words/common";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";

export const tileText = (t: string) => (t === "qu" ? "Qu" : t.toUpperCase());

type Flash = { cells: number[]; kind: "good" | "bad"; id: number } | null;

/** A 4×4 grid you swipe across. Calls onWord with the traced cells when the finger lifts. */
export function SwipeGrid({ grid, disabled, onWord }: { grid: string[]; disabled?: boolean; onWord: (path: number[]) => Promise<boolean> }) {
  const [path, setPath] = useState<number[]>([]);
  const [flash, setFlash] = useState<Flash>(null);
  const live = useRef<number[]>([]);
  const box = useRef<HTMLDivElement>(null);

  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-hit]");
    if (!el || !box.current?.contains(el)) return -1;
    return Number(el.dataset.hit);
  };
  const set = (p: number[]) => { live.current = p; setPath(p); };

  function down(e: React.PointerEvent) {
    if (disabled) return;
    const c = cellAt(e.clientX, e.clientY);
    if (c < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    feedback.unlock();
    feedback.detent();
    setFlash(null);
    set([c]);
  }
  function move(e: React.PointerEvent) {
    const p = live.current;
    if (!p.length) return;
    const c = cellAt(e.clientX, e.clientY);
    if (c < 0 || c === p.at(-1)) return;
    if (c === p.at(-2)) { set(p.slice(0, -1)); return; } // slide back to undo a letter
    if (p.includes(c) || !touching(p.at(-1)!, c)) return;
    feedback.detent();
    set([...p, c]);
  }
  async function up() {
    const p = live.current;
    set([]);
    if (!p.length) return;
    const word = spell(grid, p) ?? "";
    if (word.length < MIN_LEN) return;
    const ok = await onWord(p);
    setFlash({ cells: p, kind: ok ? "good" : "bad", id: Date.now() });
  }

  const word = spell(grid, path) ?? (path.length === 1 ? grid[path[0]] : "");
  const center = (c: number) => [((c % SIZE) + 0.5) * (100 / SIZE), (Math.floor(c / SIZE) + 0.5) * (100 / SIZE)];
  const lit = new Set(path);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", width: "100%" }}>
      <div className={`sg-word${word.length >= MIN_LEN ? " ready" : ""}`} aria-live="polite">
        {word ? <>{word.toUpperCase()}{word.length >= MIN_LEN && <span className="sg-pts">+{points(word)}</span>}</> : <span style={{ opacity: 0.5 }}>Swipe across letters</span>}
      </div>
      <div ref={box} className={`sg-grid${disabled ? " off" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        role="grid" aria-label="Letter grid. Drag across touching letters to make a word.">
        <svg className="sg-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {path.length > 1 && <polyline points={path.map((c) => center(c).join(",")).join(" ")} />}
        </svg>
        {Array.from({ length: CELLS }, (_, c) => {
          const f = flash?.cells.includes(c) ? ` ${flash.kind}` : "";
          return (
            <div key={`${c}-${f ? flash!.id : 0}`} className={`sg-cell${lit.has(c) ? " on" : ""}${f}`}>
              <span data-hit={c} className="sg-hit">{tileText(grid[c])}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The play area: timer, grid and your words. Shared by rooms and the daily. */
export function GridPlay({ grid, endsAt, found, disabled, submit, header }: {
  grid: string[];
  endsAt: number;
  found: string[];
  disabled?: boolean;
  submit: (path: number[]) => Promise<{ word: string; pts: number }>;
  header?: React.ReactNode;
}) {
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const say = (text: string, kind: "good" | "bad" | "info") => setToast({ text, kind, id: Date.now() + Math.random() });
  const score = found.reduce((s, w) => s + points(w), 0);

  async function onWord(path: number[]) {
    try {
      const r = await submit(path);
      feedback.correct(Math.min(8, r.word.length - 2));
      say(`+${r.pts} ${r.word.toUpperCase()}`, "good");
      return true;
    } catch (e) {
      feedback.wrong();
      say(errorText(e, "Not a word"), "bad");
      return false;
    }
  }

  return (
    <>
      <TimerBar deadline={endsAt} total={ROUND_MS} />
      {header}
      <SwipeGrid grid={grid} disabled={disabled} onWord={onWord} />
      <section style={{ display: "flex", flexDirection: "column", gap: 6 }} aria-label="Your words">
        <span className="label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Your words · {found.length}</span>
          <span style={{ color: "var(--plum)" }}>{score} pts</span>
        </span>
        <div className="sg-found">
          {found.length === 0 && <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>Longer words score more: 8+ letters is 11 points.</span>}
          {[...found].reverse().map((w, i) => <span key={w} className={`sg-chip${i === 0 ? " pop" : ""}`}>{w.toUpperCase()}<b>{points(w)}</b></span>)}
        </div>
      </section>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}

/** Words nobody found, longest first. */
export function Missed({ words, total, title = "Best words nobody found" }: { words: string[]; total: number | null; title?: string }) {
  if (!words.length) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      <span className="label">{title}{total ? ` · grid had ${total}` : ""}</span>
      <div className="sg-found">
        {words.slice(0, 24).map((w) => <span key={w} className="sg-chip dim">{w.toUpperCase()}<b>{points(w)}</b></span>)}
      </div>
    </section>
  );
}
