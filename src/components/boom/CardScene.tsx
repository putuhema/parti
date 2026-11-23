"use client";

import { useEffect, useRef } from "react";
import type { Art } from "../../../convex/lib/boom/rules";
import { Actor, breathe, drawFigure, type Pose, type PoseName } from "./figure";

// A tiny looping stage play for each satire card: stick figures acting it out on the card.
// The drawer is the hero in their own colour; everyone else is a grey extra.

const W = 220, H = 124, GROUND = 108;
const INK = "#231B1A", BONE = "#F3EDE0", MUST = "#F4C64E", CORAL = "#E2574C", GREY = "#B9B0A6";

type Cast = { a: Actor; x: number; flip?: boolean; shirt?: string; scale?: number; y?: number };
type Scene = { cast: Cast[]; draw: (ctx: CanvasRenderingContext2D, t: number, cast: Cast[]) => void; front?: (ctx: CanvasRenderingContext2D, t: number, cast: Cast[]) => void };
type Steps = { pose: PoseName; d: number }[];

const looped = (steps: Steps, pose?: Pose) => {
  const a = new Actor(pose);
  a.loop(...steps.map((s) => ({ ...s, ez: "soft" as const })));
  return a;
};
const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
const box = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, r = 3) => {
  rr(ctx, x + 2, y + 2, w, h, r); ctx.fillStyle = INK; ctx.fill();
  rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
};
const label = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 9, col = INK) => {
  ctx.fillStyle = col; ctx.font = `900 ${size}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y);
};
/** A cartoon face (the candidate on every banner). */
const face = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, grin = true) => {
  ctx.fillStyle = "#E8C9A0"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK; ctx.fillRect(x - r * 0.85, y - r * 1.05, r * 1.7, r * 0.55);
  ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.1, 0, 7); ctx.arc(x + r * 0.35, y - r * 0.1, r * 0.1, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + r * 0.2, r * 0.45, 0.15 * Math.PI, (grin ? 0.85 : 0.15) * Math.PI); ctx.stroke();
};
const envelope = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  box(ctx, x - 6, y - 4, 12, 8, BONE, 1);
  ctx.beginPath(); ctx.moveTo(x - 6, y - 4); ctx.lineTo(x, y + 1); ctx.lineTo(x + 6, y - 4); ctx.stroke();
};
const handF = (c: Cast) => {
  const s = c.scale ?? 1, p = c.a.pose.hF;
  return { x: c.x + (c.flip ? -p[0] : p[0]) * s, y: (c.y ?? GROUND) + p[1] * s };
};
const zig = (ctx: CanvasRenderingContext2D, t: number) => {
  // a wobbly ground line
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = 4; x <= W - 4; x += 6) ctx.lineTo(x, GROUND + Math.sin(x * 0.37) * 0.6 + Math.sin(x * 1.7 + t * 0) * 0.3);
  ctx.stroke();
};

function scene(art: Art, hero: string): Scene {
  const me = (steps: Steps, x = 60, extra: Partial<Cast> = {}): Cast => ({ a: looped(steps), x, shirt: hero, ...extra });
  const npc = (steps: Steps, x: number, flip = true, extra: Partial<Cast> = {}): Cast => ({ a: looped(steps), x, flip, shirt: GREY, ...extra });
  switch (art) {
    case "baliho":
      return {
        cast: [me([{ pose: "proud", d: 0.5 }, { pose: "point", d: 0.35 }, { pose: "point", d: 0.6 }, { pose: "proud", d: 0.4 }], 46)],
        draw(ctx, t) {
          ctx.fillStyle = INK; ctx.fillRect(122, 62, 4, 46); ctx.fillRect(186, 62, 4, 46);
          const wob = Math.sin(t * 3) * 1.2;
          box(ctx, 106, 18 + wob, 100, 50, MUST, 4);
          face(ctx, 132, 43 + wob, 15);
          label(ctx, "PILIH", 176, 36 + wob, 11); label(ctx, "AKU!", 176, 50 + wob, 11, CORAL);
        },
      };
    case "pita":
      return {
        cast: [me([{ pose: "stand", d: 0.5 }, { pose: "snip", d: 0.25 }, { pose: "snip", d: 0.5 }, { pose: "cheer", d: 0.4 }, { pose: "cheer", d: 0.5 }], 70), npc([{ pose: "cheer", d: 0.3 }, { pose: "stand", d: 0.3 }], 170)],
        draw(ctx, t) {
          const cut = t % 2.1 > 0.75;
          ctx.fillStyle = INK; ctx.fillRect(96, 64, 3, 44); ctx.fillRect(146, 64, 3, 44);
          ctx.strokeStyle = CORAL; ctx.lineWidth = 4; ctx.beginPath();
          if (!cut) { ctx.moveTo(98, 70); ctx.quadraticCurveTo(122, 76, 147, 70); }
          else { const sag = Math.min(18, ((t % 2.1) - 0.75) * 40); ctx.moveTo(98, 70); ctx.lineTo(108, 70 + sag); ctx.moveTo(147, 70); ctx.lineTo(137, 70 + sag); }
          ctx.stroke();
          label(ctx, "PROYEK 80%", 122, 30, 9, CORAL);
        },
        front(ctx, _t, cast) {
          const h = handF(cast[0]);
          ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + 12, h.y - 3); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + 12, h.y + 3); ctx.stroke();
        },
      };
    case "orangdalam":
      return {
        cast: [me([{ pose: "give", d: 0.4 }, { pose: "give", d: 0.6 }, { pose: "cheer", d: 0.35 }, { pose: "cheer", d: 0.4 }], 76), npc([{ pose: "give", d: 0.4 }, { pose: "give", d: 0.9 }, { pose: "proud", d: 0.45 }], 132)],
        draw(ctx, t) {
          label(ctx, "PAMAN", 132, 26, 8, "#5A4A44");
          const k = (t % 1.75) / 1.75;
          const x = 120 - Math.min(1, k * 2.2) * 28;
          box(ctx, x - 10, 62, 20, 9, BONE, 1); label(ctx, "TENDER", x, 66.5, 5);
        },
      };
    case "meme":
    case "kaos":
      return {
        cast: [me([{ pose: "cheer", d: 0.35 }, { pose: "cheer", d: 0.5 }, { pose: "proud", d: 0.35 }], 110)],
        draw(ctx, t) {
          // Held up above the head, between the raised hands.
          const y = 2 + Math.sin(t * 4) * 2;
          box(ctx, 88, y, 44, 36, BONE, 6);
          face(ctx, 110, y + 18, 11);
          if (art === "meme") { label(ctx, "WKWK", 46, 40 + Math.sin(t * 5) * 3, 10, CORAL); label(ctx, "WKWK", 176, 52 - Math.sin(t * 5) * 3, 10, CORAL); }
          else label(ctx, "SISA 1000 PCS", 170, 40, 8, CORAL);
        },
      };
    case "tidur":
      return {
        cast: [me([{ pose: "sleep", d: 0.9 }, { pose: "sit", d: 0.25 }, { pose: "sleep", d: 0.6 }], 98)],
        draw(ctx, t) {
          box(ctx, 108, 76, 62, 8, "#C98A4B", 2); ctx.fillStyle = INK; ctx.fillRect(114, 84, 3, 24); ctx.fillRect(162, 84, 3, 24);
          ctx.fillRect(150, 62, 2, 14); ctx.beginPath(); ctx.arc(151, 60, 3, 0, 7); ctx.fill();
          label(ctx, "RAPAT PARIPURNA", 110, 18, 8, "#5A4A44");
          for (let i = 0; i < 3; i++) { const k = ((t * 0.7 + i / 3) % 1); ctx.globalAlpha = 1 - k; label(ctx, "Z", 112 + k * 30, 50 - k * 30, 8 + k * 6); ctx.globalAlpha = 1; }
        },
      };
    case "studibanding":
      return {
        cast: [me([{ pose: "walkA", d: 0.22 }, { pose: "walkB", d: 0.22 }], 0)],
        draw(ctx, t, cast) {
          cast[0].x = 20 + ((t * 40) % 200);
          const px = 240 - ((t * 70) % 300);
          ctx.fillStyle = BONE; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
          rr(ctx, px, 20, 40, 9, 5); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px + 16, 24); ctx.lineTo(px + 24, 12); ctx.lineTo(px + 28, 24); ctx.fill(); ctx.stroke();
        },
        front(ctx, _t, cast) {
          const h = handF(cast[0]);
          box(ctx, h.x - 6, h.y, 12, 9, CORAL, 2);
          ctx.fillStyle = MUST; ctx.beginPath(); ctx.arc(h.x + 9, h.y + 14, 2.5, 0, 7); ctx.fill();
        },
      };
    case "blusukan": {
      let stuck = false; // walk up to the puddle, step in, slump; then start the walk again
      return {
        cast: [me([{ pose: "walkA", d: 0.24 }, { pose: "walkB", d: 0.24 }], 0)],
        draw(ctx, t, cast) {
          const k = t % 3;
          const x = Math.min(130, 20 + k * 55);
          cast[0].x = x;
          if (x >= 130 && !stuck) { stuck = true; cast[0].a.set({ pose: "slump", d: 0.2 }); }
          else if (x < 130 && stuck) { stuck = false; cast[0].a.loop({ pose: "walkA", d: 0.24, ez: "soft" }, { pose: "walkB", d: 0.24, ez: "soft" }); }
          ctx.fillStyle = "#8B6B4A"; ctx.beginPath(); ctx.ellipse(140, GROUND - 1, 22, 4, 0, 0, 7); ctx.fill();
          if (x >= 130) for (let i = 0; i < 6; i++) { const q = Math.min(1, (k - 2.04) * 2); const a = Math.PI + (i / 5) * Math.PI; ctx.fillStyle = "#8B6B4A"; ctx.beginPath(); ctx.arc(140 + Math.cos(a) * 18 * q, GROUND - 4 + Math.sin(a) * 16 * q + 20 * q * q, 2.2, 0, 7); ctx.fill(); }
          label(ctx, "KONTEN", 182, 30, 9, CORAL);
          ctx.fillStyle = INK; rr(ctx, 172, 40, 20, 14, 3); ctx.fill(); ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(188, 43, 2, 0, 7); ctx.fill();
        },
      };
    }
    case "amplop":
    case "sponsor":
      return {
        cast: [me([{ pose: "give", d: 0.35 }, { pose: "cheer", d: 0.3 }, { pose: "give", d: 0.5 }], 60), npc([{ pose: "give", d: 0.4 }, { pose: "stand", d: 0.4 }], 140), npc([{ pose: "stand", d: 0.3 }, { pose: "give", d: 0.5 }], 180, true, { scale: 0.85 })],
        draw(ctx, t) {
          for (let i = 0; i < 2; i++) {
            const k = ((t * 0.8 + i * 0.5) % 1);
            const x = (i ? 166 : 128) - k * (i ? 96 : 58), y = 70 - Math.sin(k * Math.PI) * 26;
            if (art === "sponsor") { box(ctx, x - 7, y - 7, 14, 14, MUST, 6); label(ctx, "$", x, y, 9); } else envelope(ctx, x, y);
          }
        },
      };
    case "sembako":
      return {
        cast: [me([{ pose: "windup", d: 0.3 }, { pose: "throw", d: 0.15 }, { pose: "stand", d: 0.35 }], 50), npc([{ pose: "cheer", d: 0.4 }, { pose: "stand", d: 0.4 }], 150), npc([{ pose: "stand", d: 0.3 }, { pose: "cheer", d: 0.5 }], 186, true, { scale: 0.85 })],
        draw(ctx, t) {
          const k = (t % 0.8) / 0.8;
          const x = 64 + k * 96, y = 60 - Math.sin(k * Math.PI) * 34;
          box(ctx, x - 7, y - 8, 14, 14, BONE, 2); label(ctx, "BERAS", x, y - 1, 4);
        },
      };
    case "mangkrak": {
      let bonked = -1; // the loop number in which the brick last hit
      return {
        cast: [me([{ pose: "scratch", d: 0.5 }, { pose: "scratch", d: 0.8 }, { pose: "shrug", d: 0.4 }], 70)],
        draw(ctx, t, cast) {
          ctx.strokeStyle = INK; ctx.lineWidth = 2;
          for (const x of [120, 150, 180]) { ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, 34); ctx.stroke(); }
          for (const y of [50, 70, 90]) { ctx.beginPath(); ctx.moveTo(116, y); ctx.lineTo(184, y); ctx.stroke(); }
          box(ctx, 118, 90, 64, 18, "#D9CBB4", 1);
          label(ctx, "MANGKRAK", 150, 24, 9, CORAL);
          const k = t % 1.95;
          const by = Math.min(GROUND - 70, 10 + k * k * 120);
          box(ctx, 68, by, 10, 6, CORAL, 1);
          const lap = Math.floor(t / 1.95);
          if (k > 1.1 && bonked !== lap) { bonked = lap; cast[0].a.set({ pose: "crouch", d: 0.1 }, { pose: "scratch", d: 0.3 }); }
        },
      };
    }
    case "mobildinas":
      return {
        cast: [me([{ pose: "sit", d: 0.6 }, { pose: "cheer", d: 0.3 }, { pose: "sit", d: 0.4 }], 0, { y: GROUND - 14, scale: 0.62 })],
        // The cabin is drawn behind the figure and the body in front, so it rides inside the car.
        draw(ctx, t, cast) {
          const x = -40 + ((t * 70) % 300);
          cast[0].x = x + 30;
          box(ctx, x + 8, GROUND - 60, 44, 38, "#5A4A44", 8);
          ctx.fillStyle = "#CFE9F2"; ctx.fillRect(x + 13, GROUND - 55, 34, 27);
        },
        front(ctx, t) {
          const x = -40 + ((t * 70) % 300);
          box(ctx, x, GROUND - 26, 64, 18, INK, 6);
          ctx.fillStyle = BONE; ctx.fillRect(x + 4, GROUND - 22, 10, 4);
          label(ctx, "RI 1234", x + 34, GROUND - 15, 6, MUST);
          for (const wx of [x + 14, x + 50]) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(wx, GROUND - 6, 6, 0, 7); ctx.fill(); ctx.fillStyle = GREY; ctx.beginPath(); ctx.arc(wx, GROUND - 6, 2.5, 0, 7); ctx.fill(); }
        },
      };
    case "ott":
    case "audit":
      return {
        cast: [me([{ pose: "handsUp", d: 0.3 }, { pose: "handsUp", d: 0.5 }, { pose: "shrug", d: 0.3 }, { pose: "handsUp", d: 0.4 }], 96), npc([{ pose: "point", d: 0.4 }, { pose: "point", d: 0.5 }], 170)],
        draw(ctx, t) {
          const on = Math.floor(t * 6) % 2 === 0;
          ctx.fillStyle = on ? CORAL : "#69BFD6";
          ctx.beginPath(); ctx.arc(40, 30, 10, 0, 7); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
          ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(40, 30, 22, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
          if (t % 1.3 < 0.08) { ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(0, 0, W, H); }
          label(ctx, art === "ott" ? "OTT!" : "AUDIT", 150, 26, 12, CORAL);
        },
      };
    case "begal":
      // Two masked riders roar in on a motorbike; the hero puts their hands up.
      return {
        cast: [
          me([{ pose: "handsUp", d: 0.3 }, { pose: "handsUp", d: 0.6 }, { pose: "shrug", d: 0.3 }], 52),
          npc([{ pose: "sit", d: 0.5 }, { pose: "point", d: 0.4 }], 150, true, { y: GROUND - 16, scale: 0.8, shirt: INK }),
          npc([{ pose: "sit", d: 0.5 }, { pose: "sit", d: 0.4 }], 172, true, { y: GROUND - 16, scale: 0.8, shirt: INK }),
        ],
        draw(ctx, t, cast) {
          const x = 130 + Math.max(0, 60 - t * 120);
          cast[1].x = x + 22; cast[2].x = x + 42;
          for (let i = 0; i < 3; i++) { const k = (t * 1.6 + i / 3) % 1; ctx.globalAlpha = 0.5 * (1 - k); ctx.fillStyle = GREY; ctx.beginPath(); ctx.arc(x + 70 + k * 30, GROUND - 8 - k * 6, 4 + k * 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
          label(ctx, "SERAHKAN!", 160, 22, 11, CORAL);
        },
        front(ctx, t) {
          const x = 130 + Math.max(0, 60 - t * 120);
          box(ctx, x + 10, GROUND - 22, 52, 12, CORAL, 5);
          for (const wx of [x + 16, x + 56]) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(wx, GROUND - 6, 6, 0, 7); ctx.fill(); ctx.fillStyle = GREY; ctx.beginPath(); ctx.arc(wx, GROUND - 6, 2.5, 0, 7); ctx.fill(); }
        },
      };
    case "mancing":
      // Sitting on the pier with a rod; the bobber bobs on the water.
      return {
        cast: [me([{ pose: "sit", d: 0.8 }, { pose: "sit", d: 0.6 }], 56, { y: GROUND - 18 })],
        draw(ctx, t) {
          ctx.fillStyle = "#7CC8EC"; ctx.fillRect(0, GROUND - 4, W, H - GROUND + 4);
          for (let x = 10; x < W; x += 28) { ctx.strokeStyle = BONE; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + x) * 3, GROUND + 6, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
          box(ctx, 6, GROUND - 20, 84, 8, "#B98A5A", 2);
          ctx.fillStyle = INK; ctx.fillRect(20, GROUND - 12, 4, 16); ctx.fillRect(70, GROUND - 12, 4, 16);
          const bob = Math.sin(t * 3) * 2 + (t % 3 > 2.4 ? 5 : 0);
          ctx.strokeStyle = "#8A5A3A"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(66, GROUND - 52); ctx.lineTo(118, GROUND - 78); ctx.stroke();
          ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(118, GROUND - 78); ctx.quadraticCurveTo(150, GROUND - 40, 160, GROUND - 2 + bob); ctx.stroke();
          ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(160, GROUND - 2 + bob, 4, Math.PI, 0); ctx.fill(); ctx.fillStyle = BONE; ctx.beginPath(); ctx.arc(160, GROUND - 2 + bob, 4, 0, Math.PI); ctx.fill();
          if (t % 3 > 2.4) label(ctx, "!", 160, GROUND - 22, 16, CORAL);
        },
      };
    case "dompet":
      // A wallet on the road; the hero spots it, picks it up, and cheers.
      return {
        cast: [me([{ pose: "stand", d: 0.4 }, { pose: "point", d: 0.4 }, { pose: "crouch", d: 0.3 }, { pose: "cheer", d: 0.4 }, { pose: "cheer", d: 0.5 }], 96)],
        draw(ctx, t) {
          const k = t % 2.0;
          if (k < 1.1) box(ctx, 120, GROUND - 8, 16, 8, "#8A5A3A", 2);
          else for (let i = 0; i < 3; i++) { const y = GROUND - 60 - ((k - 1.1) * 40 + i * 9) % 30; box(ctx, 104 + i * 12, y, 8, 8, MUST, 4); }
        },
      };
    case "razia":
      // A checkpoint: cones, a stop sign, an officer with a hand out.
      return {
        cast: [me([{ pose: "shrug", d: 0.4 }, { pose: "give", d: 0.5 }, { pose: "stand", d: 0.4 }], 70), npc([{ pose: "give", d: 0.5 }, { pose: "point", d: 0.4 }], 150)],
        draw(ctx) {
          for (const x of [24, 112, 196]) { ctx.fillStyle = "#FF9A1F"; ctx.beginPath(); ctx.moveTo(x - 6, GROUND); ctx.lineTo(x, GROUND - 16); ctx.lineTo(x + 6, GROUND); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = BONE; ctx.fillRect(x - 3, GROUND - 9, 6, 3); }
          ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(180, GROUND); ctx.lineTo(180, GROUND - 60); ctx.stroke();
          ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(180, GROUND - 66, 12, 0, 7); ctx.fill(); ctx.stroke();
          label(ctx, "STOP", 180, GROUND - 66, 7, BONE);
          label(ctx, "RAZIA", 110, 20, 12, CORAL);
        },
      };
    case "macet":
      // Bumper to bumper. The hero gives up and sits on the kerb.
      return {
        cast: [me([{ pose: "scratch", d: 0.5 }, { pose: "sit", d: 0.6 }, { pose: "sit", d: 0.8 }, { pose: "sleep", d: 0.8 }], 36)],
        draw(ctx, t) {
          const cols = ["#69BFD6", CORAL, MUST, "#3FA77A"];
          for (let i = 0; i < 4; i++) {
            const x = 64 + i * 40 + Math.sin(t * 2 + i) * 0.6;
            box(ctx, x, GROUND - 22, 34, 14, cols[i], 5);
            ctx.fillStyle = "#CFE9F2"; ctx.fillRect(x + 8, GROUND - 30, 16, 8);
            ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 8, GROUND - 6, 4, 0, 7); ctx.arc(x + 27, GROUND - 6, 4, 0, 7); ctx.fill();
          }
          if (Math.floor(t * 2) % 2) label(ctx, "TIN TIN!", 150, 22, 10, CORAL);
          label(ctx, "MACET", 60, 22, 12);
        },
      };
    case "joget":
      return {
        cast: [me([{ pose: "danceA", d: 0.28 }, { pose: "danceB", d: 0.28 }], 110, { y: GROUND - 14 }), npc([{ pose: "cheer", d: 0.3 }, { pose: "stand", d: 0.3 }], 40, false, { scale: 0.8 }), npc([{ pose: "stand", d: 0.3 }, { pose: "cheer", d: 0.3 }], 186, true, { scale: 0.8 })],
        draw(ctx, t) {
          box(ctx, 70, GROUND - 14, 80, 14, MUST, 2);
          for (let i = 0; i < 3; i++) { const k = (t * 0.6 + i / 3) % 1; ctx.globalAlpha = 1 - k; label(ctx, "♪", 84 + i * 26, 40 - k * 24, 12); ctx.globalAlpha = 1; }
        },
      };
  }
}

/** Plays the scene for one card or wheel result. Remounts (via key) for each new card. */
export function CardScene({ art, hero }: { art: Art; hero: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sc = scene(art, hero);
    const dpr = window.devicePixelRatio || 1;
    el.width = W * dpr; el.height = H * dpr;
    let raf = 0, last = 0, t = 0;
    const paint = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      t += still ? 0 : dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      zig(ctx, t);
      sc.draw(ctx, t, sc.cast);
      for (const c of sc.cast) {
        if (!still) c.a.update(dt);
        drawFigure(ctx, breathe(c.a.pose, Math.sin(t * 3 + c.x) * 0.6), c.x, c.y ?? GROUND, { shirt: c.shirt ?? hero, flip: c.flip, scale: c.scale ?? 1 });
      }
      sc.front?.(ctx, t, sc.cast);
      if (!still) raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [art, hero]);
  return <canvas ref={ref} className="jn-scene" style={{ aspectRatio: `${W} / ${H}` }} aria-hidden="true" />;
}
