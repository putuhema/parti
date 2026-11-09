"use client";

// Your own drawn sprites. Put images in public/silat/sprites/ and list them in
// public/silat/sprites/sprites.json (see the README there). Anything not listed keeps the built-in art.
import { useEffect, useState, type ReactNode } from "react";

export type SpriteId = "hero" | "pawn" | "knight" | "bishop" | "rook" | "queen" | "king" | "boss";
export type Anim = "idle" | "kick" | "hit";

export interface Sheet {
  /** File name inside public/silat/sprites/. A horizontal strip: frames side by side, same size. */
  file: string;
  /** How many frames are in the strip (1 = a still picture). */
  frames?: number;
  /** Frames per second. */
  fps?: number;
}
export type Manifest = Partial<Record<SpriteId, Partial<Record<Anim, Sheet>>>>;

const DIR = "/silat/sprites";
let manifest: Manifest | null = null;
let loading: Promise<Manifest> | null = null;

/** Loads sprites.json once per page, and preloads every image in it so nothing flickers. */
function loadManifest(): Promise<Manifest> {
  loading ??= fetch(`${DIR}/sprites.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((m: Record<string, unknown>) => {
      const clean: Manifest = {};
      for (const [k, v] of Object.entries(m ?? {})) if (!k.startsWith("_") && v && typeof v === "object") clean[k as SpriteId] = v as Manifest[SpriteId];
      for (const anims of Object.values(clean)) for (const sh of Object.values(anims ?? {})) if (sh?.file) new Image().src = `${DIR}/${sh.file}`;
      manifest = clean;
      return clean;
    });
  return loading;
}

function useManifest(): Manifest | null {
  const [m, setM] = useState<Manifest | null>(manifest);
  useEffect(() => {
    if (m) return;
    let alive = true;
    void loadManifest().then((x) => { if (alive) setM(x); });
    return () => { alive = false; };
  }, [m]);
  return m;
}

/** Which sprite draws an enemy piece. */
export const spriteFor = (kind: string, boss?: string): SpriteId =>
  boss && kind === "k" ? "boss" : ({ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" } as const)[kind as "p"] ?? "pawn";

/** One sheet, playing. Loops for idle; plays once for kick and hit, then calls `onDone`. */
function SheetPlayer({ sheet, loop, onDone }: { sheet: Sheet; loop: boolean; onDone?: () => void }) {
  const frames = Math.max(1, sheet.frames ?? 1);
  const fps = sheet.fps ?? (loop ? 8 : 14);
  const moving = frames > 1;
  return (
    <span
      className="sl-sprite"
      onAnimationEnd={onDone}
      style={{
        backgroundImage: `url("${DIR}/${sheet.file}")`,
        backgroundSize: `${frames * 100}% 100%`,
        animation: moving ? `slsheet ${frames / fps}s steps(${frames}, jump-none) ${loop ? "infinite" : "1 forwards"}` : undefined,
      }}
    />
  );
}

/** Draws your sprite for `id` if sprites.json has one, else `fallback` (the built-in art).
 *  `play` + `nonce`: each new nonce plays that animation once (if drawn), then goes back to idle. */
export function Sprite({ id, play, nonce = 0, fallback }: { id: SpriteId; play?: Anim; nonce?: number; fallback: ReactNode }) {
  const m = useManifest();
  const [done, setDone] = useState<number | null>(null);
  const anims = m?.[id];
  const idle = anims?.idle;
  if (!idle) return <>{fallback}</>;
  const oneShot = play && play !== "idle" && nonce && done !== nonce ? anims?.[play] : undefined;
  return oneShot
    ? <SheetPlayer key={`${play}-${nonce}`} sheet={oneShot} loop={false} onDone={() => setDone(nonce)} />
    : <SheetPlayer key="idle" sheet={idle} loop />;
}
