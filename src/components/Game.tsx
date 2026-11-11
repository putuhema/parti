"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { peersOf } from "../../convex/lib/sudoku";
import { feedback } from "@/lib/feedback";
import { Confetti, Icon, type Paint } from "./ui";

export type PlaceResult = { correct: boolean; row: boolean; col: boolean; box: boolean; finished: boolean; lockMs?: number };

type Props = {
  puzzle: string;
  /** Confirmed board (givens + correct placements). */
  values: string;
  onPlace: (cell: number, digit: number) => Promise<PlaceResult>;
  /** Color for a placed digit (co-op shows who placed it). */
  digitColor?: (cell: number) => string | undefined;
  cursors?: { cell: number; name: string; paint: Paint }[];
  onSelect?: (cell: number) => void;
  hints?: { left: number; use: (cell: number) => Promise<PlaceResult> } | null;
  disabled?: boolean;
  /** The puzzle is solved (by you or, in co-op, a teammate): play the finish celebration. */
  solved?: boolean;
  /** A line under SOLVED!, e.g. "1st place!". */
  finishNote?: string;
  /** Extra line shown in the toast slot, e.g. "Maya placed a 6". */
  announce?: { id: string | number; text: string; kind?: ToastKind } | null;
  /** Coach overlay: what to highlight on the board for the current lesson step. */
  coach?: CoachMarks | null;
  /** A "Coach" button in the tools row. */
  coachTool?: { onClick: () => void; active: boolean; pulse?: boolean };
  /** Move the selection to this cell (the id makes repeat requests count). */
  focusCell?: { cell: number; id: number } | null;
  /**
   * The coach's deductions, written into the player's notes: `drop` digits are crossed off.
   * Cells without notes get the full list of what's still possible (`keep`).
   */
  notesPatch?: { id: number; cells: Record<number, { keep: number[]; drop: number[] }> } | null;
  /** Called when the player undoes a coach notes edit, with that edit's id. */
  onUndoPatch?: (id: number) => void;
  /** What to say about a wrong number that doesn't clash with anything you can see. */
  wrongTip?: (digit: number) => string;
};

export type CoachMarks = {
  area: number[];
  focus: number[];
  clues: number[];
  target?: number;
  marks: Record<number, { show: number[]; strike: number[] }>;
  /** Simple coloring: the two alternating colors of a chain. */
  colors?: { a: number[]; b: number[] };
  /** Chains: cells numbered in the order to follow. */
  order?: number[];
};

type ToastKind = "combo" | "clear" | "bad" | "info";
/** One undo step: a cell's wrong digit or notes, or (from the coach) several cells' notes at once. */
type Undo = { cell: number; notes?: number[]; wrong?: string; many?: Record<number, number[]>; patch?: number };

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
/** The board is rounded (16px with a 2px border), so its four corner cells are too. */
const CORNER_RADIUS: Record<number, "borderTopLeftRadius" | "borderTopRightRadius" | "borderBottomLeftRadius" | "borderBottomRightRadius"> = {
  0: "borderTopLeftRadius", 8: "borderTopRightRadius", 72: "borderBottomLeftRadius", 80: "borderBottomRightRadius",
};

export function Game({ puzzle, values, onPlace, digitColor, cursors, onSelect, hints, disabled, solved, finishNote, announce, coach, coachTool, focusCell, notesPatch, onUndoPatch, wrongTip }: Props) {
  const firstEmpty = useMemo(() => Math.max(0, values.indexOf("0")), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<number>(firstEmpty);
  const [notesMode, setNotesMode] = useState(false);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [wrong, setWrong] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<Record<number, string>>({});
  const [undo, setUndo] = useState<Undo[]>([]);
  const [anim, setAnim] = useState<{ cell: number; kind: "pop" | "shake"; id: number } | null>(null);
  /** Cells that show why a number was wrong (they flash briefly). */
  const [conflict, setConflict] = useState<{ cells: number[]; id: number } | null>(null);
  const [sweep, setSweep] = useState<{ cells: Map<number, number>; id: number; color?: string } | null>(null);
  /** Double and triple clears jolt the board. */
  const [jolt, setJolt] = useState(0);
  /** A number-pad key that just completed (all nine placed). */
  const [keyBurst, setKeyBurst] = useState<{ d: number; id: number } | null>(null);
  /** The finish celebration: a wave over the whole board and a SOLVED! stamp. */
  const [finished, setFinished] = useState(false);
  if (solved && !finished) setFinished(true);
  const [toast, setToast] = useState<{ text: string; kind: ToastKind; id: number; ms: number; low?: boolean } | null>(null);
  const combo = useRef(0);
  const seq = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  /** `low` puts the message under the board, when the cells it's about are near the top. */
  const showToast = useCallback((text: string, kind: ToastKind, low = false) => {
    const id = seq.current++;
    // Longer messages stay up long enough to read.
    const ms = Math.max(1400, text.length * 60);
    setToast({ text, kind, id, ms, low });
    later(() => setToast((t) => (t?.id === id ? null : t)), ms);
  }, []);

  useEffect(() => {
    if (announce) showToast(announce.text, announce.kind ?? "info");
  }, [announce?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jump the selection when asked (e.g. the coach points at a cell).
  const [seenFocus, setSeenFocus] = useState<number | null>(null);
  if (focusCell && focusCell.id !== seenFocus) {
    setSeenFocus(focusCell.id);
    setSel(focusCell.cell);
  }
  const [seenPatch, setSeenPatch] = useState<number | null>(null);
  if (notesPatch && notesPatch.id !== seenPatch) {
    setSeenPatch(notesPatch.id);
    // The coach's edit is one undo step that puts every touched cell's notes back.
    const touched = Object.keys(notesPatch.cells).map(Number);
    setUndo((u) => [...u, { cell: touched[0], many: Object.fromEntries(touched.map((c) => [c, notes[c] ?? []])), patch: notesPatch.id }]);
    setNotes((n) => {
      const next = { ...n };
      for (const [k, { keep, drop }] of Object.entries(notesPatch.cells)) {
        const cell = Number(k);
        next[cell] = n[cell]?.length ? n[cell].filter((d) => !drop.includes(d)) : keep;
      }
      return next;
    });
  }

  // Wrong digits and notes only show on empty cells, so a cell a teammate fills just hides them.
  const [locked, setLocked] = useState(false);

  const select = useCallback(
    (i: number) => {
      setSel(i);
      onSelect?.(i);
    },
    [onSelect],
  );

  const celebrate = useCallback(
    (cell: number, r: PlaceResult, digit?: number) => {
      setAnim({ cell, kind: "pop", id: seq.current++ });
      combo.current += 1;
      if (r.finished) { setFinished(true); return; }
      const p = peersOf(cell);
      const cells = new Map<number, number>();
      const groups: string[] = [];
      // Cells light up in a wave, spreading from the one you just placed.
      const add = (list: number[]) => list.forEach((j) => {
        const dist = Math.max(Math.abs(Math.floor(j / 9) - Math.floor(cell / 9)), Math.abs((j % 9) - (cell % 9)));
        if (!cells.has(j) || cells.get(j)! > dist) cells.set(j, dist);
      });
      if (r.row) { add(p.row); groups.push("ROW"); }
      if (r.col) { add(p.col); groups.push("COLUMN"); }
      if (r.box) { add(p.box); groups.push("BOX"); }
      const n = groups.length;
      if (n) {
        feedback.clear(n, combo.current);
        const id = seq.current++;
        setSweep({ cells, id });
        later(() => setSweep((s) => (s?.id === id ? null : s)), 1100);
        if (n >= 2) { setJolt(id); later(() => setJolt((j) => (j === id ? 0 : j)), 400); }
        showToast(n === 1 ? `${groups[0]}!` : n === 2 ? "DOUBLE!" : "TRIPLE!", "clear");
      } else feedback.correct(combo.current);
      // All nine of this number are now on the board.
      const allNine = digit !== undefined && [...values].filter((v) => v === String(digit)).length + 1 === 9;
      if (allNine) {
        const id = seq.current++;
        setKeyBurst({ d: digit!, id });
        later(() => setKeyBurst((k) => (k?.id === id ? null : k)), 900);
        if (!n) { feedback.digitDone(); showToast(`All ${digit}s done!`, "combo"); }
      } else if (!n && combo.current >= 3) showToast(`Combo ×${combo.current}!`, "combo");
    },
    [showToast, values],
  );

  // The celebration's sound plays once, when the finish begins.
  useEffect(() => { if (finished) feedback.solved(); }, [finished]);

  // Co-op: a teammate's number that completes a group lights it up in their color on your board.
  const [prevValues, setPrevValues] = useState(values);
  if (values !== prevValues) {
    setPrevValues(values);
    for (let i = 0; i < 81; i++) {
      if (prevValues[i] !== "0" || values[i] === "0" || pending[i] || anim?.cell === i) continue;
      const p = peersOf(i);
      const done = [p.row, p.col, p.box].filter((g) => [...g, i].every((j) => values[j] !== "0"));
      if (!done.length) continue;
      const cells = new Map<number, number>();
      done.flat().forEach((j) => cells.set(j, Math.max(Math.abs(Math.floor(j / 9) - Math.floor(i / 9)), Math.abs((j % 9) - (i % 9)))));
      cells.set(i, 0);
      // A negative id from the fill count: unique per board state, and never clashes with our own ids.
      setSweep({ cells, id: -[...values].filter((v) => v !== "0").length, color: digitColor?.(i) });
      break;
    }
  }

  const place = useCallback(
    async (d: number) => {
      if (disabled || locked) return;
      const i = sel;
      if (puzzle[i] !== "0" || values[i] !== "0" || pending[i]) return;
      feedback.unlock();
      if (notesMode) {
        feedback.tap();
        setNotes((n) => {
          const cur = n[i] ?? [];
          setUndo((u) => [...u, { cell: i, notes: cur }]);
          const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
          return { ...n, [i]: next };
        });
        return;
      }
      setPending((p) => ({ ...p, [i]: String(d) }));
      try {
        const r = await onPlace(i, d);
        if (r.correct) {
          setWrong((w) => { const n = { ...w }; delete n[i]; return n; });
          // Remove this digit from notes in peer cells.
          const p = peersOf(i);
          setNotes((n) => {
            const next = { ...n };
            delete next[i];
            for (const j of [...p.row, ...p.col, ...p.box]) if (next[j]?.includes(d)) next[j] = next[j].filter((x) => x !== d);
            return next;
          });
          celebrate(i, r, d);
        } else {
          setUndo((u) => [...u, { cell: i, wrong: wrong[i] }]);
          setWrong((w) => ({ ...w, [i]: String(d) }));
          setAnim({ cell: i, kind: "shake", id: seq.current++ });
          combo.current = 0;
          feedback.wrong();
          if (r.lockMs) {
            setLocked(true);
            later(() => setLocked(false), r.lockMs);
            showToast("Too many mistakes! Frozen for 3s", "bad");
          } else {
            // Say why: a clash you can see, or a number that's ruled out by logic.
            const p = peersOf(i);
            const clash = (["row", "col", "box"] as const)
              .map((k) => ({ k, cell: p[k].find((x) => values[x] === String(d)) }))
              .filter((x): x is { k: "row" | "col" | "box"; cell: number } => x.cell !== undefined);
            if (clash.length) {
              const id = seq.current++;
              setConflict({ cells: clash.map((c) => c.cell), id });
              later(() => setConflict((c) => (c?.id === id ? null : c)), 1800);
              const where = clash.map((c) => ({ row: "row", col: "column", box: "box" })[c.k]);
              const nearTop = [i, ...clash.map((c) => c.cell)].some((c) => c < 18);
              showToast(`There's already a ${d} in this ${where.length > 1 ? `${where.slice(0, -1).join(", ")} and ${where.at(-1)}` : where[0]}`, "bad", nearTop);
            } else showToast(wrongTip?.(d) ?? "Oops! Not quite", "bad", i < 18);
          }
        }
      } catch (e) {
        showToast(e instanceof Error && e.message.includes("countdown") ? "Wait for GO!" : "Couldn't place that", "info");
      } finally {
        setPending((p) => { const n = { ...p }; delete n[i]; return n; });
      }
    },
    [disabled, locked, sel, puzzle, values, pending, notesMode, onPlace, celebrate, wrong, showToast, wrongTip],
  );

  const erase = useCallback(() => {
    const i = sel;
    if (values[i] !== "0") return;
    if (!wrong[i] && !notes[i]?.length) return;
    feedback.tap();
    setUndo((u) => [...u, { cell: i, wrong: wrong[i], notes: notes[i] }]);
    setWrong((w) => { const n = { ...w }; delete n[i]; return n; });
    setNotes((n) => { const m = { ...n }; delete m[i]; return m; });
  }, [sel, values, wrong, notes]);

  const doUndo = useCallback(() => {
    const last = undo[undo.length - 1];
    if (!last) return;
    feedback.tap();
    setUndo((u) => u.slice(0, -1));
    if ("wrong" in last) setWrong((w) => { const n = { ...w }; if (last.wrong) n[last.cell] = last.wrong; else delete n[last.cell]; return n; });
    if ("notes" in last) setNotes((n) => ({ ...n, [last.cell]: last.notes ?? [] }));
    if (last.many) setNotes((n) => ({ ...n, ...last.many }));
    if (last.patch !== undefined) onUndoPatch?.(last.patch);
    select(last.cell);
  }, [undo, select, onUndoPatch]);

  const useHint = useCallback(async () => {
    if (!hints || hints.left <= 0 || disabled) return;
    const i = sel;
    if (puzzle[i] !== "0" || values[i] !== "0") {
      showToast("Pick an empty cell first", "info");
      return;
    }
    feedback.unlock();
    try {
      const r = await hints.use(i);
      celebrate(i, r);
    } catch {
      showToast("No hints left", "info");
    }
  }, [hints, disabled, sel, puzzle, values, celebrate, showToast]);

  // Keyboard support for desktop and hardware keyboards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const r = Math.floor(sel / 9), c = sel % 9;
      if (/^[1-9]$/.test(e.key)) void place(Number(e.key));
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
      else if (e.key === "ArrowUp") select(((r + 8) % 9) * 9 + c);
      else if (e.key === "ArrowDown") select(((r + 1) % 9) * 9 + c);
      else if (e.key === "ArrowLeft") select(r * 9 + ((c + 8) % 9));
      else if (e.key === "ArrowRight") select(r * 9 + ((c + 1) % 9));
      else if (e.key === "n" || e.key === "N") setNotesMode((m) => !m);
      else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) doUndo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, place, erase, select, doUndo]);

  const p = peersOf(sel);
  const peerSet = new Set([...p.row, ...p.col, ...p.box]);
  const selDigit = values[sel] !== "0" ? values[sel] : null;
  const cursorAt = new Map((cursors ?? []).map((c) => [c.cell, c]));
  const counts: Record<string, number> = {};
  for (const ch of values) if (ch !== "0") counts[ch] = (counts[ch] ?? 0) + 1;

  return (
    <>
      <div className={`board-wrap${jolt ? " jolt" : ""}`}>
        <div className="board" role="grid" aria-label="Sudoku board">
          {Array.from({ length: 81 }, (_, i) => {
            const r = Math.floor(i / 9), c = i % 9;
            const given = puzzle[i] !== "0";
            const v = values[i] !== "0" ? values[i] : pending[i] ?? wrong[i] ?? "";
            const isWrong = values[i] === "0" && !pending[i] && !!wrong[i];
            const cur = cursorAt.get(i);
            const cls = ["cell"];
            if (given) cls.push("given");
            if (i === sel && !(coach && coach.target === i)) cls.push("sel");
            else if (isWrong) cls.push("err");
            // While the coach is explaining, only its highlights show.
            else if (!coach && selDigit && values[i] === selDigit) cls.push("same");
            else if (!coach && peerSet.has(i)) cls.push("peer");
            if (isWrong && i === sel) cls.push("err");
            if (coach) {
              if (coach.target === i) cls.push("co-target");
              else if (coach.colors?.a.includes(i)) cls.push("co-blue");
              else if (coach.colors?.b.includes(i)) cls.push("co-green");
              else if (coach.focus.includes(i)) cls.push("co-focus");
              else if (coach.clues.includes(i)) cls.push("co-clue");
              else if (coach.area.includes(i)) cls.push("co-area");
            }
            if (pending[i]) cls.push("pending");
            if (conflict?.cells.includes(i)) cls.push("conflict");
            const sw = sweep?.cells.get(i);
            if (sw !== undefined) cls.push(sweep!.id % 2 ? "sweep" : "sweep2");
            if (finished) cls.push("finish-wave");
            const style: CSSProperties = {
              borderRight: c === 8 ? 0 : c % 3 === 2 ? "2px solid var(--line-2)" : "1px solid var(--line)",
              borderBottom: r === 8 ? 0 : r % 3 === 2 ? "2px solid var(--line-2)" : "1px solid var(--line)",
              // Corner cells follow the board's rounded corner, so their highlight does too.
              ...(CORNER_RADIUS[i] ? { [CORNER_RADIUS[i]]: 14 } : {}),
            };
            if (sw !== undefined) style.animationDelay = `${sw * 45}ms`;
            if (sw !== undefined && sweep?.color) (style as Record<string, string>)["--sweep"] = sweep.color;
            if (finished) style.animationDelay = `${(r + c) * 40}ms`;
            const dc = !given && values[i] !== "0" ? digitColor?.(i) : undefined;
            if (dc) style.color = dc;
            if (cur && i !== sel) {
              style.background = cur.paint.soft;
              style.boxShadow = `inset 0 0 0 3px ${cur.paint.face}`;
            }
            const n = values[i] === "0" && !v ? notes[i] : undefined;
            const cm = coach && values[i] === "0" && !v ? coach.marks[i] : undefined;
            const animCls = anim?.cell === i ? anim.kind : "";
            return (
              <button
                key={i}
                className={cls.join(" ")}
                style={style}
                onClick={() => { feedback.unlock(); select(i); }}
                aria-label={`Row ${r + 1} column ${c + 1}, ${v ? v : "empty"}${isWrong ? ", wrong" : ""}`}
                aria-selected={i === sel}
                role="gridcell"
              >
                {cm && coach?.order?.includes(i) ? (
                  // Chain cells: the two options, centered, so the step number doesn't cover one.
                  <span className="co-pair" aria-hidden="true">{cm.show.join(" ")}</span>
                ) : cm ? (
                  <span className="notes co-notes" aria-hidden="true">
                    {DIGITS.map((d) => <span key={d} className={cm.strike.includes(d) ? "strike" : ""}>{cm.show.includes(d) ? d : ""}</span>)}
                  </span>
                ) : n?.length ? (
                  <span className="notes" aria-hidden="true">
                    {DIGITS.map((d) => <span key={d}>{n.includes(d) ? d : ""}</span>)}
                  </span>
                ) : (
                  <span key={anim?.cell === i ? anim.id : 0} className={animCls}>{v}</span>
                )}
                {cur && (
                  <span className="cursor-tag" style={{ background: cur.paint.face }}>{cur.name}</span>
                )}
                {coach?.order?.includes(i) && <span className="co-order" aria-hidden="true">{coach.order.indexOf(i) + 1}</span>}
              </button>
            );
          })}
        </div>
        {finished && (
          <div className="solved-stamp" role="status" aria-live="assertive">
            <span className="solved-word">SOLVED!</span>
            {finishNote && <span className="solved-note">{finishNote}</span>}
          </div>
        )}
        {finished && <Confetti count={70} />}
        {toast && !finished && (
          <div key={toast.id} className={`toast ${toast.kind}${toast.low ? " low" : ""}`} role="status" style={{ animationDuration: `${toast.ms}ms`, fontSize: toast.text.length > 30 ? 15 : undefined }}>
            {(toast.kind === "combo" || toast.kind === "clear") && <Icon.Bolt size={18} color="#FFC800" />}
            {toast.text}
          </div>
        )}
      </div>

      <div className="tools">
        <button className="tool" onClick={doUndo} disabled={!undo.length} aria-label="Undo">
          <span className="face"><Icon.Undo /></span>
          <span className="name">UNDO</span>
        </button>
        <button className="tool" onClick={erase} aria-label="Erase">
          <span className="face"><Icon.Erase /></span>
          <span className="name">ERASE</span>
        </button>
        <button className={`tool ${notesMode ? "on" : ""}`} onClick={() => { feedback.tap(); setNotesMode((m) => !m); }} aria-pressed={notesMode} aria-label="Notes">
          <span className="face"><Icon.Pencil color={notesMode ? "#fff" : "#6F6F6F"} /></span>
          <span className="name">NOTES {notesMode ? "ON" : "OFF"}</span>
        </button>
        {coachTool && (
          <button className={`tool ${coachTool.active ? "on" : ""}${coachTool.pulse ? " pulse" : ""}`} onClick={() => { feedback.unlock(); feedback.tap(); coachTool.onClick(); }} aria-pressed={coachTool.active} aria-label="Coach: explain the next move">
            <span className="face">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/mascot.png" alt="" width={20} height={25} /></span>
            <span className="name">{coachTool.pulse ? "STUCK?" : "COACH"}</span>
          </button>
        )}
        {hints ? (
          <button className="tool" onClick={useHint} disabled={hints.left <= 0 || disabled} aria-label={`Hint, ${hints.left} left`}>
            <span className="face"><Icon.Bulb /><span className="badge">{hints.left}</span></span>
            <span className="name">HINT</span>
          </button>
        ) : (
          <button className="tool" disabled aria-label="Hints are off in this mode">
            <span className="face"><Icon.Bulb /></span>
            <span className="name">NO HINTS</span>
          </button>
        )}
      </div>

      <div className="numpad" aria-label="Number pad">
        {DIGITS.map((d) => {
          const left = 9 - (counts[String(d)] ?? 0);
          return (
            <button
              key={keyBurst?.d === d ? `burst-${keyBurst.id}` : d}
              className={`key ${notesMode ? "notes" : ""}${keyBurst?.d === d ? " burst" : ""}`}
              disabled={left <= 0 || disabled}
              onClick={() => void place(d)}
              aria-label={left <= 0 ? `${d} is complete` : `${notesMode ? "Note" : "Place"} ${d}, ${left} left`}
            >
              {d}
              <small>{left > 0 ? left : ""}</small>
            </button>
          );
        })}
        {locked && (
          <div className="lock" role="status"><Icon.Lock /> Frozen for a moment…</div>
        )}
      </div>
    </>
  );
}
