"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { peersOf } from "../../convex/lib/sudoku";
import { feedback } from "@/lib/feedback";
import { Icon, type Paint } from "./ui";

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
  /** Extra line shown in the toast slot, e.g. "Maya placed a 6". */
  announce?: { id: string | number; text: string; kind?: ToastKind } | null;
  /** Coach overlay: what to highlight on the board for the current lesson step. */
  coach?: CoachMarks | null;
  /** A "Coach" button in the tools row. */
  coachTool?: { onClick: () => void; active: boolean };
  /** Move the selection to this cell (the id makes repeat requests count). */
  focusCell?: { cell: number; id: number } | null;
};

export type CoachMarks = {
  area: number[];
  focus: number[];
  clues: number[];
  target?: number;
  marks: Record<number, { show: number[]; strike: number[] }>;
};

type ToastKind = "combo" | "clear" | "bad" | "info";
type Undo = { cell: number; notes?: number[]; wrong?: string };

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
/** The board is rounded (16px with a 2px border), so its four corner cells are too. */
const CORNER_RADIUS: Record<number, "borderTopLeftRadius" | "borderTopRightRadius" | "borderBottomLeftRadius" | "borderBottomRightRadius"> = {
  0: "borderTopLeftRadius", 8: "borderTopRightRadius", 72: "borderBottomLeftRadius", 80: "borderBottomRightRadius",
};

export function Game({ puzzle, values, onPlace, digitColor, cursors, onSelect, hints, disabled, announce, coach, coachTool, focusCell }: Props) {
  const firstEmpty = useMemo(() => Math.max(0, values.indexOf("0")), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<number>(firstEmpty);
  const [notesMode, setNotesMode] = useState(false);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [wrong, setWrong] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<Record<number, string>>({});
  const [undo, setUndo] = useState<Undo[]>([]);
  const [anim, setAnim] = useState<{ cell: number; kind: "pop" | "shake"; id: number } | null>(null);
  const [sweep, setSweep] = useState<{ cells: Map<number, number>; id: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: ToastKind; id: number } | null>(null);
  const combo = useRef(0);
  const seq = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const showToast = useCallback((text: string, kind: ToastKind) => {
    const id = seq.current++;
    setToast({ text, kind, id });
    later(() => setToast((t) => (t?.id === id ? null : t)), 1400);
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
    (cell: number, r: PlaceResult) => {
      setAnim({ cell, kind: "pop", id: seq.current++ });
      combo.current += 1;
      const p = peersOf(cell);
      const cells = new Map<number, number>();
      let label = "";
      const add = (list: number[]) => list.forEach((j, k) => !cells.has(j) && cells.set(j, k));
      if (r.row) { add(p.row); label = "Row cleared!"; }
      if (r.col) { add(p.col); label = label ? "Double clear!" : "Column cleared!"; }
      if (r.box) { add(p.box); label = label ? (r.row && r.col ? "Triple clear!" : "Double clear!") : "Box cleared!"; }
      if (r.finished) feedback.win();
      else if (label) feedback.clear();
      else feedback.correct(combo.current);
      if (cells.size) {
        const id = seq.current++;
        setSweep({ cells, id });
        later(() => setSweep((s) => (s?.id === id ? null : s)), 1000);
      }
      if (!r.finished) {
        if (label) showToast(label, "clear");
        else if (combo.current >= 3) showToast(`Combo ×${combo.current}!`, "combo");
      }
    },
    [showToast],
  );

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
          celebrate(i, r);
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
          } else showToast("Oops! Not quite", "bad");
        }
      } catch (e) {
        showToast(e instanceof Error && e.message.includes("countdown") ? "Wait for GO!" : "Couldn't place that", "info");
      } finally {
        setPending((p) => { const n = { ...p }; delete n[i]; return n; });
      }
    },
    [disabled, locked, sel, puzzle, values, pending, notesMode, onPlace, celebrate, wrong, showToast],
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
    select(last.cell);
  }, [undo, select]);

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
      <div className="board-wrap">
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
              else if (coach.focus.includes(i)) cls.push("co-focus");
              else if (coach.clues.includes(i)) cls.push("co-clue");
              else if (coach.area.includes(i)) cls.push("co-area");
            }
            if (pending[i]) cls.push("pending");
            const sw = sweep?.cells.get(i);
            if (sw !== undefined) cls.push(sweep!.id % 2 ? "sweep" : "sweep2");
            const style: CSSProperties = {
              borderRight: c === 8 ? 0 : c % 3 === 2 ? "2px solid var(--line-2)" : "1px solid var(--line)",
              borderBottom: r === 8 ? 0 : r % 3 === 2 ? "2px solid var(--line-2)" : "1px solid var(--line)",
              // Corner cells follow the board's rounded corner, so their highlight does too.
              ...(CORNER_RADIUS[i] ? { [CORNER_RADIUS[i]]: 14 } : {}),
            };
            if (sw !== undefined) style.animationDelay = `${sw * 40}ms`;
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
                {cm ? (
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
              </button>
            );
          })}
        </div>
        {toast && (
          <div key={toast.id} className={`toast ${toast.kind}`} role="status">
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
          <button className={`tool ${coachTool.active ? "on" : ""}`} onClick={() => { feedback.unlock(); feedback.tap(); coachTool.onClick(); }} aria-pressed={coachTool.active} aria-label="Coach: explain the next move">
            <span className="face">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/mascot.png" alt="" width={20} height={25} /></span>
            <span className="name">COACH</span>
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
              key={d}
              className={`key ${notesMode ? "notes" : ""}`}
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
