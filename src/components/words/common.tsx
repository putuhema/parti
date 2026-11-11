"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { Avatar, Confetti, Icon, Mascot, Sheet, roomPaints, type Paint } from "@/components/ui";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useNow } from "@/lib/hooks";

export type WordsView = NonNullable<FunctionReturnType<typeof api.wordsView.view>>;
export type WordsGame = NonNullable<WordsView["game"]>;
export type WMode = WordsView["mode"];

export type ModeMeta = { id: WMode; en: [string, string]; id_: [string, string]; face: string; edge: string; soft: string; ink: string; icon: string; coop?: boolean; rule: string };
export const WORD_MODES: ModeMeta[] = [
  { id: "chain", en: ["Word Chain", "Write five linked words. Guess theirs."], id_: ["Rantai Kata", "Tebak kata berikutnya."], face: "#1CB0F6", edge: "#1899D6", soft: "#DDF4FF", ink: "#1478A8", icon: "M9 15 l6 -6 M10 6 l1.5 -1.5 a4 4 0 0 1 5.7 5.7 L15.5 12 M8.5 12 L6.8 13.7 a4 4 0 0 0 5.7 5.7 L14 18", rule: "Write five linked words for your friend (or use a ready-made chain), then guess theirs. Right guess: keep going. Wrong guess or a pass opens a letter and it's their turn. Fewer open letters, more points." },
  { id: "hangman", en: ["Hangman Duel", "Crack their word first."], id_: ["Duel Tebak Huruf", "Tebak kata lawan duluan."], face: "#FF4B4B", edge: "#EA2B2B", soft: "#FFDFE0", ink: "#B81F1F", icon: "M12 3 a6 6 0 0 1 6 6 c0 4 -3.5 7 -6 7 s-6 -3 -6 -7 a6 6 0 0 1 6 -6z M12 16 l-1.2 2 h2.4z M12 18 c0 2 -2 2 -2 4", rule: "Each of you picks a secret word. Guess letters in your friend's word. A wrong letter pops one of your 6 balloons. First to crack it wins." },
  { id: "pair", en: ["Letter Pair", "You pick the start, they pick the end."], id_: ["Pasangan Huruf", "Kamu awal, lawan akhir."], face: "#FFC800", edge: "#E5A800", soft: "#FFF4CC", ink: "#7A5800", icon: "M4 18 L8 6 L12 18 M5.5 14 h5 M15 6 v12 M15 12 l5 -6 M16.5 10.5 L20 18", rule: "One of you picks the first letter, the other picks the last. Race to type a real word that fits. First +3, second +1." },
  { id: "chemistry", en: ["Chemistry", "Think the same word."], id_: ["Sehati", "Pikirkan kata yang sama."], face: "#FF86D0", edge: "#E06BB5", soft: "#FFE3F4", ink: "#A3247A", icon: "M3 5 h9 v7 h-5 l-3 3 v-3 h-1z M12 9 h9 v7 h-1 v3 l-3 -3 h-5z", coop: true, rule: "Finish the phrase secretly. If you both say the same thing (in English or Indonesian), it's a match!" },
  { id: "dontsay", en: ["Don’t Say It", "Dodge the secret banned word."], id_: ["Jangan Sebut", "Hindari kata terlarang rahasia."], face: "#FF9600", edge: "#E08600", soft: "#FFF0DB", ink: "#9A5200", icon: "M4 5 h16 v10 h-9 l-4 4 v-4 h-3z M8 8 l8 5", rule: "Name something in the category. One popular answer is a secret banned word: say it and you lose a heart. No repeats, and categories shrink each round. Last one standing wins." },
  { id: "guess", en: ["Guess My Word", "Ask letters, crack the secret."], id_: ["Tebak Kataku", "Tanya huruf, tebak rahasia."], face: "#1CC6B4", edge: "#14A394", soft: "#D6FAF6", ink: "#0B6B61", icon: "M10 4 a6 6 0 1 0 0 12 a6 6 0 1 0 0-12z M14.5 14.5 L20 20", rule: "Pick secret words. On your turn, ask about one letter: you learn if it's in their word, and they learn if it's in yours. First to guess wins." },
  { id: "spy", en: ["Spy Word", "One-word clues, find the words."], id_: ["Kata Rahasia", "Satu kata petunjuk."], face: "#2B70C9", edge: "#1F57A0", soft: "#E3EEFC", ink: "#1F57A0", icon: "M3 12 C6 7 9 5 12 5 s6 2 9 7 c-3 5 -6 7 -9 7 s-6 -2 -9 -7z M12 9 a3 3 0 1 0 0 6 a3 3 0 1 0 0-6z", coop: true, rule: "Team up: give one-word clues so your friend finds their 3 secret words on the grid. 3 misses and you lose." },
  { id: "odd", en: ["Odd One Out", "Spot the word that doesn’t fit."], id_: ["Yang Beda", "Cari kata yang beda."], face: "#58CC02", edge: "#46A302", soft: "#D7FFB8", ink: "#2F6E00", icon: "M5 5 h5 v5 h-5z M14 5 h5 v5 h-5z M5 14 h5 v5 h-5z M16.5 14 a2.5 2.5 0 1 0 0.01 0z", rule: "Take turns making a set of 4 words where one doesn't belong. Spot the odd one, then name the link." },
  { id: "scramble", en: ["Scrambled Sprint", "Unscramble it, fastest wins."], id_: ["Acak Kata", "Susun huruf, tercepat menang."], face: "#D9489F", edge: "#B2347F", soft: "#FFE8F5", ink: "#B2347F", icon: "M3 7 h4 l10 10 h4 M3 17 h4 l3-3 M14 10 l3-3 h4 M18 4 l3 3 -3 3 M18 14 l3 3 -3 3", rule: "Same jumbled letters for everyone. Find the big word and every hidden word inside. 2 to 4 players." },
  { id: "emoji", en: ["Emoji Riddle", "Describe it with emoji only."], id_: ["Teka-teki Emoji", "Jelaskan pakai emoji."], face: "#9069FF", edge: "#6F4BDB", soft: "#EEE8FF", ink: "#5B3CC4", icon: "M12 3 a9 9 0 1 0 0 18 a9 9 0 1 0 0-18z M9 10 h.01 M15 10 h.01 M8.5 14.5 q3.5 3 7 0", coop: true, rule: "Describe a secret word using only emoji. Your friend guesses. Fewer emoji, more points. Swap every round." },
];
export const wordMode = (id: string) => WORD_MODES.find((m) => m.id === id) ?? WORD_MODES[0];

export function ModeChip({ mode, size = 36 }: { mode: ModeMeta; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: size / 3, background: mode.face, boxShadow: `0 3px 0 ${mode.edge}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" aria-hidden="true"><path d={mode.icon} stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

/** Send a move. Errors show as a short toast and a buzz. */
export function useAct(code: string) {
  const act = useMutation(api.words.act);
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const say = (text: string, kind: "good" | "bad" | "info" = "info") => setToast({ text, kind, id: Date.now() + Math.random() });
  async function send(action: string, args: { text?: string; n?: number; list?: string[] } = {}) {
    try {
      return (await act({ code, action, ...args })) as Record<string, unknown> | null;
    } catch (e) {
      feedback.wrong();
      say(errorText(e, "Not allowed"), "bad");
      return null;
    }
  }
  return { send, toast, say, clearToast: () => setToast(null) };
}

export function Toast({ toast, onDone }: { toast: { text: string; kind: string; id: number } | null; onDone: () => void }) {
  if (!toast) return null;
  const style = toast.kind === "bad" ? { background: "var(--cherry)", color: "#fff", boxShadow: "0 4px 0 var(--cherry-edge)" } : toast.kind === "good" ? { background: "var(--lime)", color: "var(--lime-ink)", boxShadow: "0 4px 0 var(--lime-edge)" } : { background: "#fff", color: "var(--ink)", border: "2px solid var(--line)", boxShadow: "0 4px 0 var(--line)" };
  return <div key={toast.id} className="wtoast" style={style} onAnimationEnd={onDone} role="status">{toast.text}</div>;
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
/** On-screen keyboard. `state` colors keys: good / bad / used. */
export function Keyboard({ onKey, onEnter, onDelete, state = {}, disabled, enterLabel = "↵" }: { onKey: (l: string) => void; onEnter?: () => void; onDelete?: () => void; state?: Record<string, "good" | "bad" | "used">; disabled?: boolean; enterLabel?: string }) {
  return (
    <section className="wkb" aria-label="Keyboard">
      {ROWS.map((r, ri) => (
        <div key={r} className="wkb-row" style={{ gridTemplateColumns: ri === 2 && (onEnter || onDelete) ? `1.5fr repeat(7, minmax(0, 1fr)) 1.5fr` : `repeat(${r.length}, minmax(0, 1fr))`, padding: ri === 1 ? "0 16px" : ri === 2 && !(onEnter || onDelete) ? "0 46px" : 0 }}>
          {ri === 2 && onDelete && <button type="button" className="wkey" aria-label="Delete" disabled={disabled} onClick={() => { feedback.tap(); onDelete(); }}>{"⌫"}</button>}
          {ri === 2 && !onDelete && onEnter && <span />}
          {r.split("").map((l) => (
            <button key={l} type="button" className={`wkey${state[l] ? " " + state[l] : ""}`} aria-label={l.toUpperCase()} disabled={disabled || state[l] === "used" || state[l] === "bad" || state[l] === "good"} onClick={() => { feedback.tap(); onKey(l); }}>
              {l.toUpperCase()}
            </button>
          ))}
          {ri === 2 && onEnter && <button type="button" className="wkey enter" aria-label="Enter" disabled={disabled} onClick={() => onEnter()}>{enterLabel}</button>}
          {ri === 2 && !onEnter && onDelete && <span />}
        </div>
      ))}
    </section>
  );
}

/** Letter tiles for a word with "_" for hidden letters. */
export function Tiles({ text, size = 36, tone = "plain", typed = "" }: { text: string; size?: number; tone?: "plain" | "me" | "them" | "given" | "done" | "dim"; typed?: string }) {
  let k = 0;
  const tones: Record<string, [string, string, string]> = {
    plain: ["#fff", "#AFAFAF", "var(--ink)"], me: ["var(--sky-soft)", "var(--sky-line)", "var(--sky-edge)"], them: ["#FFF0DB", "#FFC880", "#9A5200"],
    given: ["var(--grape-soft)", "#DDB3FF", "var(--grape-ink)"], done: ["#D7FFB8", "#A5ED6E", "#2F6E00"], dim: ["#F7F7F7", "#EDEDED", "#AFAFAF"],
  };
  const [bg, edge, ink] = tones[tone];
  return (
    <span className="wtiles" role="img" aria-label={text.replace(/_/g, " blank ")}>
      {text.split("").map((ch, i) => {
        if (ch === " ") return <span key={i} style={{ width: size * 0.4 }} />;
        const typedCh = ch === "_" ? typed[k++] ?? "" : "";
        const show = ch === "_" ? typedCh : ch;
        const blank = ch === "_" && !typedCh;
        return (
          <span key={i} className={`wtile${typedCh ? " pop" : ""}`} style={{ width: size, height: size * 1.12, fontSize: size * 0.55, background: blank ? "#fff" : typedCh ? "#fff" : bg, color: typedCh ? "var(--sky-btn)" : ink, boxShadow: blank ? "none" : `0 3px 0 ${typedCh ? "var(--sky-line)" : edge}`, border: blank ? "2px dashed #CFCFCF" : typedCh ? "2px solid var(--sky)" : 0 }}>
            {show.toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}

/** Live score line for 2–4 players. */
export function ScoreBar({ room, highlight, label }: { room: WordsView; highlight?: string; label?: (id: string) => ReactNode }) {
  const g = room.game!;
  const paints = roomPaints(room.members);
  return (
    <section style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(g.players.length, 4)}, minmax(0, 1fr))`, gap: 8 }} aria-label="Scores">
      {g.players.map((id) => {
        const m = room.members.find((x) => x.id === id);
        const paint: Paint = paints.get(id) ?? paints.values().next().value!;
        const on = highlight === id;
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 16, border: `2px solid ${on ? paint.face : "var(--line)"}`, boxShadow: on ? `0 0 0 3px ${paint.soft}` : "none", minWidth: 0 }}>
            <Avatar name={m?.name ?? "?"} paint={paint} size={30} />
            <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m?.isMe ? "You" : m?.name ?? "Left"}</span>
              {label && <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".04em", color: paint.ink }}>{label(id)}</span>}
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: paint.ink }}>{g.scores[id] ?? 0}</span>
          </div>
        );
      })}
    </section>
  );
}

/** Seconds left until the round deadline, as a shrinking bar. */
export function TimerBar({ deadline, total }: { deadline?: number | null; total: number }) {
  const now = useNow(250);
  if (!deadline) return null;
  const left = Math.max(0, deadline - now);
  const secs = Math.ceil(left / 1000);
  const pct = Math.min(100, (left / total) * 100);
  const low = secs <= 5;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }} aria-label={`${secs} seconds left`}>
      <span className="bar" style={{ flex: 1, height: 12 }}><span style={{ width: `${pct}%`, background: low ? "var(--cherry)" : "var(--sun)", transition: "width 250ms linear" }} /></span>
      <span style={{ minWidth: 34, textAlign: "right", fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: low ? "var(--cherry-edge)" : "var(--muted)" }}>{secs}s</span>
    </div>
  );
}

export function useNameOf(room: WordsView) {
  return (id?: string | null) => {
    const m = room.members.find((x) => x.id === id);
    return m?.isMe ? "You" : m?.name ?? "Friend";
  };
}

/** Header with leave button and the mode chip. */
export function WordsHeader({ room, right }: { room: WordsView; right?: ReactNode }) {
  const router = useRouter();
  const leave = useMutation(api.words.leave);
  const [ask, setAsk] = useState(false);
  const mode = wordMode(room.mode);
  const langLabel = room.lang === "mix" ? "EN + ID" : room.lang.toUpperCase();
  const go = async () => { await leave({ code: room.code }).catch(() => {}); router.push("/words"); };
  return (
    <>
      <header className="topbar" style={{ gap: 8 }}>
        <button className="icon-btn" aria-label="Leave game" onClick={() => { feedback.tap(); if (room.game?.done || !room.game?.isPlayer) void go(); else setAsk(true); }}><Icon.Close /></button>
        <span className="chip" style={{ background: mode.soft, color: mode.ink }}>{mode.en[0].toUpperCase()} · {langLabel}</span>
        <span className="grow" />
        {right}
      </header>
      <Sheet open={ask} onClose={() => setAsk(false)} label="Leave game">
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, textAlign: "center" }}>Leave this game?</h2>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>The game ends for everyone.</p>
        <button className="btn btn-green" onClick={() => setAsk(false)}>Keep playing</button>
        <button className="btn btn-white" style={{ color: "var(--cherry-edge)" }} onClick={go}>Leave</button>
      </Sheet>
    </>
  );
}

export function Countdown({ startAt, label }: { startAt: number; label: string }) {
  const now = useNow(100);
  const left = Math.ceil((startAt - now) / 1000);
  const last = useRef(-1);
  useEffect(() => {
    if (left !== last.current) {
      last.current = left;
      if (left > 0 && left <= 3) feedback.tick();
      if (left === 0) feedback.go();
    }
  }, [left]);
  if (left <= 0) return null;
  return (
    <div className="overlay" role="status" aria-live="assertive">
      <span className="label">{label}</span>
      <span key={left} className="countdown">{left}</span>
    </div>
  );
}

/** End of game screen with rematch. */
export function DoneOverlay({ room, title, sub, happy }: { room: WordsView; title: string; sub: string; happy: boolean }) {
  const router = useRouter();
  const rematch = useMutation(api.words.rematch);
  const leave = useMutation(api.words.leave);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (happy) feedback.win(); else feedback.wrong();
  }, [happy]);
  return (
    <div className="overlay">
      {happy && <Confetti />}
      <Mascot size={110} mood={happy ? "joy" : "wow"} className={happy ? "jump" : undefined} />
      <h2 style={{ margin: 0, fontSize: 34, fontWeight: 900, textAlign: "center", color: happy ? "var(--lime-dark)" : "var(--tangerine-ink)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{sub}</p>
      {room.isHost ? (
        <button className="btn btn-green" onClick={() => { feedback.tap(); void rematch({ code: room.code }); }}>Play again</button>
      ) : (
        <p className="wait" style={{ margin: 0, fontWeight: 900, color: "var(--muted)" }}>Waiting for the host…</p>
      )}
      <button className="btn btn-white" onClick={async () => { await leave({ code: room.code }).catch(() => {}); router.push("/words"); }}>Back home</button>
    </div>
  );
}

/** Standard result text for competitive modes. */
export function resultText(room: WordsView): { title: string; sub: string; happy: boolean } {
  const g = room.game!;
  const d = g.done!;
  const name = nameFn(room);
  const scores = g.players.map((p) => `${name(p)} ${g.scores[p] ?? 0}`).join(" · ");
  if (d.coop) return { title: d.success ? "Great teamwork!" : "Nice try!", sub: scores, happy: !!d.success };
  if (d.text === "left") return { title: "Your friend left", sub: "You win this one.", happy: true };
  if (d.winners.length === 0 || d.winners.length === g.players.length) return { title: "It's a tie!", sub: scores, happy: true };
  const iWon = d.winners.includes(room.meId);
  return { title: iWon ? "You win!" : `${name(d.winners[0])} wins`, sub: scores, happy: iWon };
}
function nameFn(room: WordsView) {
  return (id: string) => {
    const m = room.members.find((x) => x.id === id);
    return m?.isMe ? "You" : m?.name ?? "Friend";
  };
}

/** A big text input plus send button, for word answers. */
export function AnswerBox({ value, onChange, onSubmit, placeholder, disabled, button = "Send" }: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; disabled?: boolean; button?: string }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(); }} style={{ display: "flex", gap: 8 }}>
      <input
        className="input"
        style={{ flex: 1, minWidth: 0, fontSize: 20, letterSpacing: ".04em", textTransform: "uppercase", background: "#fff" }}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z ]/g, "").slice(0, 24))}
        placeholder={placeholder}
        aria-label={placeholder}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        disabled={disabled}
      />
      <button className="btn btn-green" style={{ width: 96, minHeight: 56 }} disabled={disabled || !value.trim()}>{button}</button>
    </form>
  );
}
