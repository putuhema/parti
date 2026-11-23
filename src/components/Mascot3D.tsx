"use client";

import { useEffect, useRef } from "react";
import { mountMascot3D, type MascotMood } from "@/lib/mascot3d";

export type { MascotMood };

/** Strip legacy 2D sticker bounce classes so the 3D skeletal rig owns all motion cleanly. */
function cleanClassName(className?: string): string | undefined {
  if (!className) return undefined;
  const filtered = className
    .split(/\s+/)
    .filter((c) => c && c !== "bob" && c !== "jump")
    .join(" ");
  return filtered || undefined;
}

/**
 * Rigged 3D Vinyl Toy Pum mascot backed solely by /models/pum.glb.
 * Uses the calm grounded `idle` animation by default and smoothly cross-fades emotions.
 */
export function Mascot3D({
  size = 72,
  mood = "idle",
  className,
}: {
  size?: number;
  mood?: MascotMood;
  className?: string;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<ReturnType<typeof mountMascot3D> | null>(null);

  const initialMood = useRef(mood);
  const initialSize = useRef(size);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const handle = mountMascot3D(canvas, {
      mood: initialMood.current,
      size: initialSize.current,
    });
    handleRef.current = handle;

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry) handle.setVisible(entry.isIntersecting);
        },
        { rootMargin: "40px" }
      );
      io.observe(wrap);
    }

    return () => {
      io?.disconnect();
      handle.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.setMood(mood);
  }, [mood]);

  useEffect(() => {
    handleRef.current?.setSize(size);
  }, [size]);

  return (
    <span
      ref={wrapRef}
      aria-hidden="true"
      className={cleanClassName(className)}
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </span>
  );
}
