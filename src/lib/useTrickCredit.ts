"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import { explainMove, type TechniqueId } from "./coach";

/**
 * Credits the tricks behind each correct move you make yourself, so the Tricks screen
 * reflects how you really play. Saved in batches to keep writes low.
 */
export function useTrickCredit() {
  const record = useMutation(api.players.recordTricks);
  const buffer = useRef<TechniqueId[]>([]);
  const flush = useCallback(() => {
    if (!buffer.current.length) return;
    const found = buffer.current.splice(0, 400);
    void record({ found, shown: [] }).catch(() => {});
  }, [record]);
  useEffect(() => {
    const t = setInterval(flush, 15_000);
    return () => { clearInterval(t); flush(); };
  }, [flush]);
  /** Call after a correct placement, with the board as it was just before it. */
  return useCallback((before: string, cell: number, digit: number, known: Set<string> = new Set()) => {
    const tricks = explainMove(before, known, cell, digit);
    if (tricks) buffer.current.push(...tricks);
  }, []);
}
