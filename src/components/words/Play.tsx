"use client";

import { useEffect, useRef } from "react";
import { feedback } from "@/lib/feedback";
import { Countdown, DoneOverlay, Toast, resultText, useAct, useNameOf, wordMode, type WordsView } from "./common";
import { ChainMode, GuessMode, HangmanMode, PairMode, ScrambleMode } from "./modesVersus";
import { ChemistryMode, DontSayMode, EmojiMode, OddMode, SpyMode } from "./modesParty";

export type ModeProps = {
  room: WordsView;
  v: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  send: ReturnType<typeof useAct>["send"];
  say: ReturnType<typeof useAct>["say"];
  nameOf: (id?: string | null) => string;
};

export function WordsPlay({ room }: { room: WordsView }) {
  const g = room.game!;
  const { send, toast, say, clearToast } = useAct(room.code);
  const nameOf = useNameOf(room);
  const mode = wordMode(room.mode);

  // A little "ping" whenever something changes that you didn't do.
  const lastSeq = useRef(g.seq);
  useEffect(() => {
    if (g.seq !== lastSeq.current) {
      lastSeq.current = g.seq;
      feedback.ping();
    }
  }, [g.seq]);

  const props: ModeProps = { room, v: g.view, send, say, nameOf };
  const screens: Record<string, React.ComponentType<ModeProps>> = {
    chain: ChainMode, hangman: HangmanMode, guess: GuessMode, pair: PairMode, scramble: ScrambleMode,
    chemistry: ChemistryMode, dontsay: DontSayMode, spy: SpyMode, odd: OddMode, emoji: EmojiMode,
  };
  const Screen = screens[room.mode];
  const res = g.done ? resultText(room) : null;

  return (
    <main className="screen tight" style={{ position: "relative" }}>
      <Screen {...props} />
      <Toast toast={toast} onDone={clearToast} />
      {room.startAt && !g.done && <Countdown startAt={room.startAt} label={mode.coop ? "Team up!" : mode.en[0]} />}
      {res && <DoneOverlay room={room} {...res} />}
    </main>
  );
}
