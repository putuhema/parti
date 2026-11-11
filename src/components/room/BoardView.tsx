"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Paint } from "@/components/ui";
import { feedback } from "@/lib/feedback";
import type { RoomView } from "./types";

/**
 * A read-only Sudoku board. With `values` it shows someone's digits (spectating);
 * with only `mask` it shows which cells they've filled, but not the numbers (peeking).
 */
export function BoardView({ puzzle, values, mask, paint, last }: { puzzle: string; values?: string | null; mask?: string | null; paint: Paint; last?: number | null }) {
  return (
    <div className="bv" role="img" aria-label={values ? "Their board" : "Which cells they've filled"}>
      {Array.from({ length: 81 }, (_, i) => {
        const given = puzzle[i] !== "0";
        const theirs = !given && (values ? values[i] !== "0" : mask?.[i] === "1");
        const r = Math.floor(i / 9), c = i % 9;
        const cls = `bv-cell${c % 3 === 2 && c < 8 ? " br" : ""}${r % 3 === 2 && r < 8 ? " bb" : ""}${i === last ? " last" : ""}`;
        return (
          <span key={i} className={cls} style={theirs && !values ? { background: paint.face } : theirs ? { color: paint.ink, background: paint.soft } : undefined}>
            {given ? puzzle[i] : theirs && values ? values[i] : ""}
          </span>
        );
      })}
    </div>
  );
}

export const EMOJI = ["👏", "🔥", "😱", "😂", "💪"];

/** Quick reactions everyone in the room sees float up. Extra text buttons are for co-op. */
export function ReactionBar({ code, extra = [] }: { code: string; extra?: string[] }) {
  const react = useMutation(api.rooms.react);
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }} aria-label="Send a reaction">
      {[...extra, ...EMOJI].map((r) => (
        <button key={r} className="btn btn-white btn-sm" aria-label={`Send ${r}`}
          style={{ minHeight: 38, minWidth: 44, padding: "0 10px", fontSize: EMOJI.includes(r) ? 20 : 14, color: "var(--ink)" }}
          onClick={() => { feedback.tap(); void react({ code, text: r }); }}>
          {r}
        </button>
      ))}
    </div>
  );
}

/** Reactions from the room, floating up from the bottom. */
export function ReactionFloats({ room, paints }: { room: RoomView; paints: Map<string, Paint> }) {
  const [mountedAt] = useState(() => Date.now());
  const seen = useRef(new Set<string>());
  const [floats, setFloats] = useState<{ id: string; text: string; paint: Paint; left: number }[]>([]);
  useEffect(() => {
    for (const r of room.reactions) {
      if (seen.current.has(r.id) || r.at < mountedAt) continue;
      seen.current.add(r.id);
      const paint = paints.get(r.playerId) ?? paints.values().next().value!;
      const name = room.players.find((p) => p.id === r.playerId)?.name ?? "Someone";
      const f = { id: r.id, text: r.playerId === room.meId ? r.text : `${name}: ${r.text}`, paint, left: 10 + Math.random() * 50 };
      if (r.playerId !== room.meId) feedback.ping();
      setFloats((x) => [...x, f]);
      setTimeout(() => setFloats((x) => x.filter((y) => y.id !== f.id)), 2300);
    }
  }, [room.reactions]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {floats.map((f) => (
        <div key={f.id} className="reaction-float" style={{ left: `${f.left}%`, background: f.paint.face, boxShadow: `0 4px 0 ${f.paint.edge}` }}>{f.text}</div>
      ))}
    </>
  );
}
