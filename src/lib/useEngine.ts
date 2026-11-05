"use client";

import { useEffect, useRef } from "react";
import type { Move, Rules, State } from "../../convex/lib/chess";
import { think, type Goal } from "./engine";

type Ask = { state: State; rating: number; goal?: Goal; rules?: Rules };

/** Ask the engine for a move without freezing the page. Falls back to the main thread. */
export function useEngine() {
  const worker = useRef<Worker | null>(null);
  const waiting = useRef(new Map<number, (m: Move | null) => void>());
  const nextId = useRef(1);

  useEffect(() => {
    const pending = waiting.current;
    try {
      const w = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; move: Move | null }>) => {
        const done = pending.get(e.data.id);
        pending.delete(e.data.id);
        done?.(e.data.move);
      };
      w.onerror = () => { worker.current = null; };
      worker.current = w;
    } catch {
      worker.current = null;
    }
    return () => { worker.current?.terminate(); worker.current = null; pending.clear(); };
  }, []);

  return function ask(q: Ask): Promise<Move | null> {
    const w = worker.current;
    if (!w) return new Promise((res) => setTimeout(() => res(think(q.state, q).move), 0));
    const id = nextId.current++;
    return new Promise((res) => {
      waiting.current.set(id, res);
      w.postMessage({ id, ...q });
    });
  };
}
