"use client";

// Tiny synthesized sounds (no audio files) + vibration where the phone supports it.

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = typeof localStorage !== "undefined" && localStorage.getItem("sudoku-party:muted") === "1";
} catch {}

function audio() {
  if (muted || typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.18) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function buzz(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {}
}

export const feedback = {
  /** Call from a tap so iOS lets us play sound later. */
  unlock() {
    audio();
  },
  isMuted: () => muted,
  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem("sudoku-party:muted", m ? "1" : "0");
    } catch {}
  },
  tap() {
    tone(660, 0, 0.05, "triangle", 0.06);
    buzz(6);
  },
  correct(combo = 1) {
    const lift = Math.min(combo, 8) * 30;
    tone(660 + lift, 0, 0.09, "triangle");
    tone(990 + lift, 0.06, 0.12, "triangle");
    buzz(12);
  },
  wrong() {
    tone(180, 0, 0.18, "square", 0.08);
    tone(140, 0.08, 0.2, "square", 0.08);
    buzz([40, 30, 40]);
  },
  clear() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.14, "triangle", 0.14));
    buzz([15, 30, 15]);
  },
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, "triangle", 0.16));
    buzz([30, 40, 30, 40, 80]);
  },
  tick() {
    tone(880, 0, 0.08, "sine", 0.12);
    buzz(10);
  },
  go() {
    tone(1320, 0, 0.25, "triangle", 0.18);
    buzz(30);
  },
  move() {
    tone(420, 0, 0.05, "triangle", 0.12);
    tone(300, 0.03, 0.06, "sine", 0.1);
    buzz(8);
  },
  capture() {
    tone(260, 0, 0.07, "square", 0.07);
    tone(520, 0.05, 0.09, "triangle", 0.12);
    buzz([14, 30, 14]);
  },
  check() {
    tone(880, 0, 0.08, "square", 0.06);
    tone(660, 0.09, 0.12, "square", 0.06);
    buzz([20, 40, 20]);
  },
  ping() {
    tone(1200, 0, 0.06, "sine", 0.07);
  },
};
