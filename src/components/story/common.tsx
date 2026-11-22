"use client";

import type { FunctionReturnType } from "convex/server";
import type { CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { STARTERS } from "../../../convex/lib/story/content";
import { isSecret, pieces, type Line } from "../../../convex/lib/story/rules";

export type StoryView = NonNullable<FunctionReturnType<typeof api.story.view>>;
export type StoryGameView = NonNullable<StoryView["game"]>;

export const GAME_NAME = "Sneaky Story";
export const RULE = "Write a story together, one line each. On your turn, pick a weird secret word and sneak it into your line. Your partner taps the word they think was the secret: spot it and they score, slip it past and you score. Every story lands on your Story Shelf.";

export const INK = ["#1478A8", "#BC2F6C"]; // seat colours: first writer blue, second pink
export const inkVar = (i: number) => ({ "--ink": INK[i % 2] }) as CSSProperties;

/** One line of the story, with its secret word marked (when known) and the reader's guess. */
export function LineText({ line, showSecret, onTap, picked }: { line: Pick<Line, "text" | "secret" | "guess" | "spotted">; showSecret?: boolean; onTap?: (w: number) => void; picked?: number | null }) {
  return (
    <>
      {pieces(line.text).map((p, i) => {
        if (p.word === null) return <span key={i}>{p.text}</span>;
        const secret = showSecret && !!line.secret && isSecret(p.text, line.secret);
        const guessed = line.guess === p.word;
        const cls = ["st-w", onTap ? "tap" : "", picked === p.word ? "picked" : "", secret ? (line.spotted ? "secret spotted" : "secret sneaked") : "", guessed && !secret && line.spotted === false ? "miss" : ""].filter(Boolean).join(" ");
        return onTap ? (
          <button key={i} type="button" className={cls} onClick={() => onTap(p.word!)}>{p.text}</button>
        ) : (
          <span key={i} className={cls}>{p.text}</span>
        );
      })}
    </>
  );
}

/** The whole story so far, on lined paper. */
export function StoryPaper({ starter, lines, players, names, meId, hideLast, className = "" }: {
  starter: number;
  lines: (Line | (Omit<Line, "guess"> & { guess?: number | null }))[];
  players: string[];
  names: Record<string, string>;
  meId: string;
  hideLast?: boolean;
  className?: string;
}) {
  const s = STARTERS[starter] ?? STARTERS[0];
  const shown = hideLast ? lines.slice(0, -1) : lines;
  return (
    <div className={`st-paper ${className}`}>
      <p className="st-starter"><span>{s.emoji}</span> {s.text}</p>
      {shown.map((l, i) => (
        <div key={i}>
          {l.twist && <p className="st-twist">⚡ {l.twist}</p>}
          <p className="st-line" style={inkVar(players.indexOf(l.by))}>
            <b>{l.by === meId ? "You" : names[l.by] ?? "Writer"}</b>
            <LineText line={{ ...l, guess: l.guess ?? null }} showSecret={l.spotted !== null} />
          </p>
        </div>
      ))}
    </div>
  );
}
