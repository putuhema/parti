"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import { CHARACTERS, type Character, type Hair, type Shirt } from "../../../convex/lib/faceoff/roster";
import { errorText } from "@/lib/errors";
import { feedback } from "@/lib/feedback";
import { useIdentity } from "@/lib/identity";

export type FaceView = NonNullable<FunctionReturnType<typeof api.faceoff.view>>;
export type FaceGameView = NonNullable<FaceView["game"]>;

export const GAME_NAME = "Face Off";
export const RULE = "You each hide one of 24 faces. Take turns asking yes/no questions: every face that doesn't fit flips down. Name their face to win, but guess wrong and you lose.";
export const BOT = "bot";

export function useNameOf(room: FaceView) {
  return (id?: string | null) => {
    if (id === BOT) return "Bot";
    const m = room.members.find((x) => x.id === id);
    return m?.isMe ? "You" : m?.name ?? "Friend";
  };
}

/** Send a move. Errors show as a short toast and a buzz. */
export function useAct(code: string) {
  const { token } = useIdentity();
  const act = useMutation(api.faceoff.act);
  const [toast, setToast] = useState<{ text: string; kind: "good" | "bad" | "info"; id: number } | null>(null);
  const say = (text: string, kind: "good" | "bad" | "info" = "info") => setToast({ text, kind, id: Date.now() + Math.random() });
  async function send(move: { kind: "ask"; q: string } | { kind: "guess"; char: number }) {
    try {
      await act({ token, code, move });
      return true;
    } catch (e) {
      feedback.wrong();
      say(errorText(e, "Not allowed"), "bad");
      return false;
    }
  }
  return { send, toast, say, clearToast: () => setToast(null) };
}

// ---------- Portraits ----------
const HAIR: Record<Hair, string> = { black: "#2D2A32", brown: "#7A4A2A", blonde: "#F2C94C", red: "#D2562A", white: "#ECEAE6", bald: "#7A4A2A" };
const SHIRT: Record<Shirt, { face: string; edge: string }> = {
  red: { face: "#FF4B4B", edge: "#EA2B2B" },
  blue: { face: "#1CB0F6", edge: "#1478A8" },
  green: { face: "#58CC02", edge: "#46A302" },
  yellow: { face: "#FFC800", edge: "#E5A800" },
};
const SKIN = ["#F6D3B3", "#E8B48E", "#C98E66", "#9C6644", "#F1C7A1", "#B97A56"];

/** Drawings that failed to load, so we stop asking for them. */
const missing = new Set<string>();

/**
 * One character. Shows the drawing from /faceoff/<id>.png when it exists,
 * otherwise a simple face built from the character's traits.
 */
export function Portrait({ index, size, style }: { index: number; size?: number | string; style?: CSSProperties }) {
  const c = CHARACTERS[index];
  const [failed, setFailed] = useState(() => missing.has(c.id));
  const [loaded, setLoaded] = useState(false);
  return (
    <span style={{ position: "relative", display: "block", width: size ?? "100%", aspectRatio: "1", ...style }}>
      {!loaded && <Placeholder c={c} index={index} />}
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/faceoff/${c.id}.png`}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => { missing.add(c.id); setFailed(true); }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0 }}
        />
      )}
    </span>
  );
}

function Placeholder({ c, index }: { c: Character; index: number }) {
  const hair = HAIR[c.hair];
  const skin = SKIN[index % SKIN.length];
  const shirt = SHIRT[c.shirt];
  const line = c.hair === "white" ? "#C9C5BF" : "none";
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
      {/* long hair falls behind the shoulders */}
      {c.longHair && c.hair !== "bald" && <path d="M26 44 Q24 80 34 86 H66 Q76 80 74 44z" fill={hair} stroke={line} strokeWidth="1.5" />}
      {/* shirt */}
      <path d="M14 100 Q16 76 36 72 H64 Q84 76 86 100z" fill={shirt.face} />
      <path d="M40 72 Q50 82 60 72" fill="none" stroke={shirt.edge} strokeWidth="3" strokeLinecap="round" />
      <rect x="44" y="62" width="12" height="12" rx="4" fill={skin} />
      {/* head + ears */}
      <circle cx="28" cy="48" r="5" fill={skin} />
      <circle cx="72" cy="48" r="5" fill={skin} />
      <ellipse cx="50" cy="46" rx="22" ry="24" fill={skin} />
      {c.earrings && <><circle cx="27" cy="55" r="2.8" fill="#FFC800" stroke="#E5A800" strokeWidth="1" /><circle cx="73" cy="55" r="2.8" fill="#FFC800" stroke="#E5A800" strokeWidth="1" /></>}
      {/* hair on top */}
      {c.hair !== "bald" && !c.hat && <path d="M27 44 Q26 20 50 20 Q74 20 73 44 Q66 32 50 31 Q34 32 27 44z" fill={hair} stroke={line} strokeWidth="1.5" />}
      {c.hair === "bald" && !c.hat && <path d="M38 28 Q44 24 50 24" stroke="#fff" strokeOpacity=".55" strokeWidth="3" fill="none" strokeLinecap="round" />}
      {c.hat && (
        <>
          {c.hair !== "bald" && <path d="M28 40 Q27 34 30 32 H70 Q73 34 72 40z" fill={hair} stroke={line} strokeWidth="1.5" />}
          <path d="M28 34 Q28 14 50 14 Q72 14 72 34z" fill="#4A3F55" />
          <rect x="22" y="31" width="56" height="6" rx="3" fill="#2F2838" />
        </>
      )}
      {/* eyes */}
      <circle cx="41" cy="47" r="2.6" fill="#3C3C3C" />
      <circle cx="59" cy="47" r="2.6" fill="#3C3C3C" />
      {c.glasses && (
        <g fill="none" stroke="#3C3C3C" strokeWidth="2.2">
          <circle cx="41" cy="47" r="6.5" />
          <circle cx="59" cy="47" r="6.5" />
          <path d="M47.5 47 H52.5" />
        </g>
      )}
      {c.freckles && (
        <g fill="#B5653A" opacity=".75">
          {[[36, 55], [40, 57], [34, 58], [64, 55], [60, 57], [66, 58]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.1" />)}
        </g>
      )}
      {/* beard or smile */}
      {c.beard ? (
        <>
          <path d="M30 52 Q32 72 50 74 Q68 72 70 52 Q64 62 50 62 Q36 62 30 52z" fill={HAIR[c.hair]} stroke={line} strokeWidth="1.5" />
          <path d="M44 62 Q50 66 56 62" stroke="#3C3C3C" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <path d="M43 59 Q50 65 57 59" stroke="#3C3C3C" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
