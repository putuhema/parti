"use client";

// The parts that need the Rive runtime. Loaded on demand from RiveSprites, only while Rive is switched on.
import { useEffect } from "react";
import { Layout, Fit, useRive, useStateMachineInput } from "@rive-app/react-canvas";

const BASE = "/silat/rive";

export function HeroRive({ kick, hit, onFail }: { kick: number; hit: number; onFail: () => void }) {
  const { rive, RiveComponent } = useRive({
    src: `${BASE}/hero.riv`,
    stateMachines: "Hero",
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain }),
    onLoadError: onFail,
  });
  const kickIn = useStateMachineInput(rive, "Hero", "kick");
  const hitIn = useStateMachineInput(rive, "Hero", "hit");
  useEffect(() => { if (kick) kickIn?.fire(); }, [kick, kickIn]);
  useEffect(() => { if (hit) hitIn?.fire(); }, [hit, hitIn]);
  return <RiveComponent style={{ width: "100%", height: "100%" }} aria-hidden="true" />;
}

export function DiceRive({ onFail }: { onFail: () => void }) {
  const { RiveComponent } = useRive({
    src: `${BASE}/dice.riv`,
    stateMachines: "Dice",
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain }),
    onLoadError: onFail,
  });
  return <RiveComponent style={{ width: "100%", height: "100%" }} aria-hidden="true" />;
}
