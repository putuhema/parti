"use client";

import { useEffect, useRef, useState } from "react";
import { SilatBoard, type Highlights } from "@/components/silat/SilatBoard";
import { Stage } from "@/components/silat/stage3d";
import type { Fight } from "@/lib/silat/rules";

interface Props {
  fight: Fight;
  hl?: Highlights;
  /** What the board will look like after the combo being built: drawn as see-through copies. */
  preview?: Fight;
  onTap?: (sq: number) => void;
  onHover?: (sq: number | null) => void;
  fxKey: number;
  combo?: number;
  /** Pixels of the view the HUD covers at the top and bottom: the board is fitted between them. */
  inset?: { top: number; bottom: number };
  /** WebGL isn't available: the flat board is drawn instead. */
  onFlat?: () => void;
}

/** The fight board in 3D (three.js, basic shapes). Takes the same props as the flat `SilatBoard`,
 *  and falls back to it where WebGL isn't available. */
export function SilatBoard3D(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const latest = useRef(props);
  const [flat, setFlat] = useState(false);

  // Every render: hand the stage the newest props. It works out what changed.
  useEffect(() => {
    latest.current = props;
    stage.current?.sync(props);
  });

  useEffect(() => {
    if (!host.current) return;
    let st: Stage;
    try {
      st = new Stage(host.current, {
        tap: (sq) => latest.current.onTap?.(sq),
        hover: (sq) => latest.current.onHover?.(sq),
      });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL can only be tried after mount
      setFlat(true);
      latest.current.onFlat?.();
      return;
    }
    stage.current = st;
    st.sync(latest.current);
    return () => {
      stage.current = null;
      st.dispose();
    };
  }, []);

  if (flat) return <SilatBoard {...props} />;
  const { fight: s, combo = 0, fxKey, preview } = props;
  return (
    <div ref={host} className={`s3-stage${preview ? " preview" : ""}`} role="img" aria-label={`The fight board, ${s.n} by ${s.n}. Your combo and the battle log describe what happens.`}>
      {combo >= 3 && <div key={`c${fxKey}`} className="sl-combo">COMBO ×{combo}!</div>}
    </div>
  );
}
