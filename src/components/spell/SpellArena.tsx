"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { SpellEvent } from "../../../convex/lib/spell/rules";
import { SPELL_BY_ID, type SpellId } from "../../../convex/lib/spell/spells";
import { loadHandTracker, type HandTip, type LiveHandTracker } from "@/lib/handDetector";
import { recognizeRune, type Pt2 } from "@/lib/runeRecognizer";

type Props = {
  meId: string;
  canCast: boolean;
  myShield: number;
  myFrozen: boolean;
  overcharged: boolean;
  guideSpell: SpellId | null;
  latestEvent: SpellEvent | null;
  onCast: (spell: SpellId) => void;
};

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Callout = { id: number; text: string; color: string; outgoing: boolean };

/** Multi-layered Web Audio spell synthesizer! */
function playSpellSfx(spell: SpellId, incoming: boolean, overcharged: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.13, delay = 0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, now + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + delay + dur);
      g.gain.setValueAtTime(vol, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + delay);
      o.stop(now + delay + dur + 0.02);
    };

    if (spell === "fire") {
      tone("sawtooth", incoming ? 190 : 340, 52, 0.42, 0.15);
      tone("triangle", 620, 120, 0.28, 0.09, 0.05);
    } else if (spell === "lightning") {
      tone("square", 1180, 260, 0.11, 0.12);
      tone("sawtooth", 840, 160, 0.16, 0.1, 0.08);
      tone("square", 1400, 420, 0.14, 0.08, 0.14);
    } else if (spell === "frost") {
      tone("triangle", 1320, 660, 0.26, 0.11);
      tone("sine", 1760, 980, 0.34, 0.09, 0.06);
    } else if (spell === "shield") {
      tone("sine", 330, 660, 0.32, 0.12);
      tone("triangle", 495, 990, 0.36, 0.08, 0.04);
    } else {
      tone("sine", 523, 784, 0.24, 0.11);
      tone("sine", 659, 1046, 0.3, 0.09, 0.08);
    }
    if (overcharged) tone("sine", 880, 1760, 0.35, 0.08, 0.05);

    setTimeout(() => void ctx.close().catch(() => {}), 650);
  } catch {}
}

/** Soft chime when your traced rune locks onto a valid spell. */
function playRuneLockChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(740, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1110, ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.13);
    setTimeout(() => void ctx.close().catch(() => {}), 200);
  } catch {}
}

/** Animated trace guide coordinates (normalized 0..1) for each spell. */
const GUIDE_PATHS: Record<SpellId, Pt2[]> = {
  fire: [[0.26, 0.72], [0.5, 0.24], [0.74, 0.72]],
  lightning: [[0.28, 0.26], [0.7, 0.26], [0.3, 0.72], [0.72, 0.72]],
  frost: [[0.2, 0.5], [0.8, 0.5]],
  shield: Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    return [0.5 + Math.cos(a) * 0.24, 0.5 + Math.sin(a) * 0.28] as Pt2;
  }),
  heal: [[0.5, 0.22], [0.5, 0.78]],
};

type ActiveFx = {
  group: THREE.Group;
  velocities: THREE.Vector3[];
  born: number;
  life: number;
  kind: SpellId;
  outgoing: boolean;
  exploded?: boolean;
};

export function SpellArena({
  meId,
  canCast,
  myShield,
  myFrozen,
  overcharged,
  guideSpell,
  latestEvent,
  onCast,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const threeHostRef = useRef<HTMLDivElement | null>(null);
  const runeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [camReady, setCamReady] = useState(false);
  const [handStatus, setHandStatus] = useState<"loading" | "tracing" | "ready" | "none" | "off">("loading");
  const [previewSpell, setPreviewSpell] = useState<SpellId | null>(null);
  const [shake, setShake] = useState(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [callouts, setCallouts] = useState<Callout[]>([]);

  const traceRef = useRef<Pt2[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const smoothRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDownRef = useRef(false);
  const canCastRef = useRef(canCast);
  const onCastRef = useRef(onCast);
  const guideSpellRef = useRef<SpellId | null>(guideSpell);
  const myShieldRef = useRef(myShield);
  const previewSpellRef = useRef<SpellId | null>(null);
  const spawnFxRef = useRef<((spell: SpellId, outgoing: boolean, overcharged: boolean) => void) | null>(null);
  const lastEventIdRef = useRef<number>(0);

  useEffect(() => { canCastRef.current = canCast; }, [canCast]);
  useEffect(() => { onCastRef.current = onCast; }, [onCast]);
  useEffect(() => { guideSpellRef.current = guideSpell; }, [guideSpell]);
  useEffect(() => { myShieldRef.current = myShield; }, [myShield]);

  // React to new SpellEvents with 3D FX, flash, shake, floating callout & SFX!
  useEffect(() => {
    if (!latestEvent || latestEvent.id === lastEventIdRef.current) return;
    lastEventIdRef.current = latestEvent.id;
    const outgoing = latestEvent.by === meId;
    const def = SPELL_BY_ID[latestEvent.spell];

    spawnFxRef.current?.(latestEvent.spell, outgoing, latestEvent.overcharged);
    playSpellSfx(latestEvent.spell, !outgoing, latestEvent.overcharged);

    setFlashColor(def.color);
    const ft = setTimeout(() => setFlashColor(null), 220);

    let text = `${def.emoji} ${def.name}!`;
    if (latestEvent.shattered) text = `💥 -${latestEvent.damage} SHATTER!`;
    else if (latestEvent.pierced) text = `⚡ -${latestEvent.damage} SHIELD BROKEN!`;
    else if (latestEvent.damage > 0) text = `${def.emoji} -${latestEvent.damage} HP${latestEvent.overcharged ? " ✨" : ""}`;
    else if (latestEvent.healed > 0) text = `💚 +${latestEvent.healed} HP!`;
    else if (latestEvent.shielded > 0) text = `🛡️ +${latestEvent.shielded} SHIELD!`;
    else if (latestEvent.blocked > 0) text = `🛡️ BLOCKED ${latestEvent.blocked}!`;

    const c: Callout = { id: latestEvent.id, text, color: def.color, outgoing };
    setCallouts((prev) => [...prev.slice(-2), c]);
    const ct = setTimeout(() => setCallouts((prev) => prev.filter((x) => x.id !== c.id)), 1200);

    if (!outgoing && latestEvent.damage > 0) {
      setShake(true);
      const st = setTimeout(() => setShake(false), 340);
      return () => { clearTimeout(ft); clearTimeout(ct); clearTimeout(st); };
    }
    return () => { clearTimeout(ft); clearTimeout(ct); };
  }, [latestEvent, meId]);

  // 1. Webcam setup
  useEffect(() => {
    let alive = true;
    let stream: MediaStream | null = null;
    async function init() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setCamReady(true);
      } catch {
        if (alive) setCamReady(false);
      }
    }
    void init();
    return () => {
      alive = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 2. Upgraded Three.js 3D WebGL Arena
  useEffect(() => {
    const host = threeHostRef.current;
    if (!host) return;

    const width = host.clientWidth || 420;
    const height = host.clientHeight || 315;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 0, 7);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.innerHTML = "";
    host.appendChild(renderer.domElement);

    const light = new THREE.PointLight(0xffffff, 2.4, 30);
    light.position.set(0, 3, 6);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));

    // Dual counter-rotating arcane mandala rings
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.35 });
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.025, 10, 64), outerRingMat);
    outerRing.position.set(0, 0, -2.8);
    scene.add(outerRing);

    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xffde66, transparent: true, opacity: 0.25 });
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.02, 6, 6), innerRingMat);
    innerRing.position.set(0, 0, -2.6);
    scene.add(innerRing);

    // Persistent shimmering 3D shield aura when player has shield > 0
    const shieldAuraMat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
      wireframe: true,
      transparent: true,
      opacity: 0,
    });
    const shieldAura = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), shieldAuraMat);
    shieldAura.position.set(0, 0, 1.5);
    scene.add(shieldAura);

    const fxList: ActiveFx[] = [];

    const spawnBurst = (pos: THREE.Vector3, color: THREE.Color, glow: THREE.Color, count: number) => {
      const burstGroup = new THREE.Group();
      const vels: THREE.Vector3[] = [];
      // Shockwave ring
      const shock = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.05, 10, 32),
        new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.95 }),
      );
      shock.position.copy(pos);
      burstGroup.add(shock);
      vels.push(new THREE.Vector3(0, 0, 0));

      for (let i = 0; i < count; i++) {
        const p = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.11, 0),
          new THREE.MeshBasicMaterial({ color: i % 2 ? color : glow, transparent: true, opacity: 0.95 }),
        );
        p.position.copy(pos);
        burstGroup.add(p);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const spd = 0.08 + Math.random() * 0.14;
        vels.push(new THREE.Vector3(Math.sin(phi) * Math.cos(theta) * spd, Math.sin(phi) * Math.sin(theta) * spd, Math.cos(phi) * spd));
      }
      scene.add(burstGroup);
      fxList.push({ group: burstGroup, velocities: vels, born: performance.now(), life: 600, kind: "shield", outgoing: true, exploded: true });
    };

    const spawnFx = (spell: SpellId, outgoing: boolean, isOver: boolean) => {
      const def = SPELL_BY_ID[spell];
      const color = new THREE.Color(def.color);
      const glow = new THREE.Color(def.glow);
      const group = new THREE.Group();
      const velocities: THREE.Vector3[] = [];
      const scaleMult = isOver ? 1.35 : 1;

      if (spell === "lightning") {
        // Jagged 3D crackling lightning bolts!
        for (let b = 0; b < 4; b++) {
          const pts: THREE.Vector3[] = [];
          const segs = 9;
          for (let s = 0; s <= segs; s++) {
            const frac = s / segs;
            const z = outgoing ? 2.8 - frac * 7.5 : -4.7 + frac * 7.5;
            const jitter = s === 0 || s === segs ? 0 : 0.75 * scaleMult;
            pts.push(new THREE.Vector3((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, z));
          }
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: b % 2 ? color : glow, transparent: true, opacity: 1 }),
          );
          group.add(line);
          velocities.push(new THREE.Vector3(0, 0, 0));
        }
        spawnBurst(new THREE.Vector3(0, 0, outgoing ? -3.4 : 2.0), color, glow, 36);
      } else if (spell === "shield") {
        const dome = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.7 * scaleMult, 1),
          new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9 }),
        );
        dome.position.set(0, 0, outgoing ? 1.8 : -2.2);
        group.add(dome);
        velocities.push(new THREE.Vector3(0, 0, 0));
      } else if (spell === "heal") {
        for (let i = 0; i < 40; i++) {
          const m = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.13 * scaleMult, 0),
            new THREE.MeshBasicMaterial({ color: i % 2 ? color : glow, transparent: true, opacity: 0.95 }),
          );
          const a = (i / 40) * Math.PI * 4;
          m.position.set(Math.cos(a) * 1.5, -1.8 + (i / 40) * 1.4, outgoing ? 1.4 : -2.2);
          group.add(m);
          velocities.push(new THREE.Vector3(Math.cos(a) * 0.02, 0.075 + Math.random() * 0.04, 0));
        }
      } else {
        // Fireball or Frost Crystal Volley!
        const startZ = outgoing ? 2.5 : -4.4;
        const dirZ = outgoing ? -0.3 : 0.3;
        const coreGeo =
          spell === "frost"
            ? new THREE.OctahedronGeometry(0.55 * scaleMult, 0)
            : new THREE.SphereGeometry(0.52 * scaleMult, 18, 18);
        const core = new THREE.Mesh(
          coreGeo,
          new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 1.1, roughness: 0.15 }),
        );
        core.position.set(0, 0, startZ);
        group.add(core);
        velocities.push(new THREE.Vector3(0, 0, dirZ));

        for (let i = 0; i < 42; i++) {
          const p = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.1 * scaleMult, 0),
            new THREE.MeshBasicMaterial({ color: i % 2 ? color : glow, transparent: true, opacity: 0.95 }),
          );
          p.position.set((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, startZ);
          group.add(p);
          velocities.push(
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.08,
              (Math.random() - 0.5) * 0.08,
              dirZ * (0.72 + Math.random() * 0.5),
            ),
          );
        }
      }

      scene.add(group);
      fxList.push({ group, velocities, born: performance.now(), life: 880, kind: spell, outgoing });
    };

    spawnFxRef.current = spawnFx;

    let raf = 0;
    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      outerRing.rotation.z += 0.01;
      innerRing.rotation.z -= 0.015;
      outerRing.rotation.x = Math.sin(now * 0.0012) * 0.2;

      // Shift mandala color to match currently traced rune!
      const pv = previewSpellRef.current;
      outerRingMat.color.set(pv ? SPELL_BY_ID[pv].color : "#a78bfa");
      outerRingMat.opacity = pv ? 0.65 : 0.3;

      // Shimmering 3D shield aura while shielded
      const targetAuraOpacity = myShieldRef.current > 0 ? 0.22 + Math.sin(now * 0.005) * 0.08 : 0;
      shieldAuraMat.opacity += (targetAuraOpacity - shieldAuraMat.opacity) * 0.12;
      shieldAura.rotation.y += 0.006;

      for (let i = fxList.length - 1; i >= 0; i--) {
        const fx = fxList[i];
        const t = (now - fx.born) / fx.life;
        if (t >= 1) {
          scene.remove(fx.group);
          fxList.splice(i, 1);
          continue;
        }
        // Trigger supernova impact burst halfway through Fireball/Frost flight!
        if (!fx.exploded && (fx.kind === "fire" || fx.kind === "frost") && t > 0.45) {
          fx.exploded = true;
          const def = SPELL_BY_ID[fx.kind];
          spawnBurst(fx.group.children[0].position.clone(), new THREE.Color(def.color), new THREE.Color(def.glow), 38);
        }

        fx.group.children.forEach((child, idx) => {
          const v = fx.velocities[idx];
          if (v) child.position.add(v);
          child.rotation.x += 0.14;
          child.rotation.y += 0.16;
          if (fx.kind === "shield" && idx === 0) {
            const s = 0.8 + t * 2.2;
            child.scale.set(s, s, s);
          }
          const mat = (child as THREE.Mesh).material as THREE.Material & { opacity?: number };
          if (mat && "opacity" in mat) mat.opacity = Math.max(0, 1 - t * t);
        });
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      spawnFxRef.current = null;
      renderer.dispose();
    };
  }, []);

  // 3. HandLandmarker + Stardust Sparkles + Animated Rune Guide Loop
  useEffect(() => {
    let alive = true;
    let raf = 0;
    let tracker: LiveHandTracker | null = null;
    let lastDetect = 0;
    let cursor: HandTip | null = null;

    if (camReady) {
      setHandStatus("loading");
      void loadHandTracker().then((t) => {
        if (!alive) return;
        tracker = t;
        setHandStatus(t ? "none" : "off");
      });
    } else {
      setHandStatus("off");
    }

    const emitSparks = (nx: number, ny: number, color: string, count = 2) => {
      for (let i = 0; i < count; i++) {
        sparksRef.current.push({
          x: nx,
          y: ny,
          vx: (Math.random() - 0.5) * 0.008,
          vy: (Math.random() - 0.5) * 0.008 - 0.003,
          life: 1,
          color,
          size: 2.5 + Math.random() * 3.5,
        });
      }
      if (sparksRef.current.length > 90) sparksRef.current.splice(0, sparksRef.current.length - 90);
    };

    const updatePreview = (pts: Pt2[]) => {
      const m = pts.length >= 6 ? recognizeRune(pts) : null;
      const next = m?.spell ?? null;
      if (next !== previewSpellRef.current) {
        if (next) playRuneLockChime();
        previewSpellRef.current = next;
        setPreviewSpell(next);
      }
    };

    const commitTrace = () => {
      const pts = traceRef.current;
      traceRef.current = [];
      previewSpellRef.current = null;
      setPreviewSpell(null);
      if (!canCastRef.current || pts.length < 5) return;
      const match = recognizeRune(pts);
      if (match) onCastRef.current(match.spell);
    };

    const loop = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);

      const c = runeCanvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      if (camReady && tracker && videoRef.current && now - lastDetect >= 40) {
        lastDetect = now;
        const tip = tracker.detect(videoRef.current, now, true);
        if (tip) {
          const prev = smoothRef.current;
          const sx = prev ? prev.x * 0.45 + tip.x * 0.55 : tip.x;
          const sy = prev ? prev.y * 0.45 + tip.y * 0.55 : tip.y;
          smoothRef.current = { x: sx, y: sy };
          cursor = { ...tip, x: sx, y: sy };

          if (!pointerDownRef.current) {
            if (tip.drawing && canCastRef.current) {
              setHandStatus("tracing");
              const list = traceRef.current;
              const last = list[list.length - 1];
              if (!last || Math.hypot(sx - last[0], sy - last[1]) > 0.014) {
                list.push([sx, sy]);
                updatePreview(list);
                const col = previewSpellRef.current ? SPELL_BY_ID[previewSpellRef.current].color : "#FFDE66";
                emitSparks(sx, sy, col, 2);
              }
            } else {
              setHandStatus("ready");
              if (traceRef.current.length >= 5) commitTrace();
              else traceRef.current = [];
            }
          }
        } else {
          cursor = null;
          smoothRef.current = null;
          if (!pointerDownRef.current) {
            setHandStatus("none");
            if (traceRef.current.length >= 5) commitTrace();
            else traceRef.current = [];
          }
        }
      }

      ctx.clearRect(0, 0, c.width, c.height);

      // Optional animated trace guide when user toggles a rune hint!
      const gs = guideSpellRef.current;
      if (gs && traceRef.current.length === 0) {
        const gPts = GUIDE_PATHS[gs];
        const col = SPELL_BY_ID[gs].color;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 6;
        ctx.setLineDash([10, 10]);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(gPts[0][0] * c.width, gPts[0][1] * c.height);
        for (let i = 1; i < gPts.length; i++) ctx.lineTo(gPts[i][0] * c.width, gPts[i][1] * c.height);
        ctx.stroke();

        // Moving glowing dot showing trace direction
        const prog = ((now * 0.0007) % 1) * (gPts.length - 1);
        const idx = Math.floor(prog);
        const f = prog - idx;
        const a = gPts[idx];
        const b = gPts[Math.min(gPts.length - 1, idx + 1)];
        const gx = (a[0] + (b[0] - a[0]) * f) * c.width;
        const gy = (a[1] + (b[1] - a[1]) * f) * c.height;
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(gx, gy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Update & render stardust sparks
      for (let i = sparksRef.current.length - 1; i >= 0; i--) {
        const sp = sparksRef.current[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.life -= 0.035;
        if (sp.life <= 0) {
          sparksRef.current.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = sp.life;
        ctx.fillStyle = sp.color;
        ctx.shadowColor = sp.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(sp.x * c.width, sp.y * c.height, sp.size * sp.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw glowing rune trail (outer aura + hot white inner core!)
      const pts = traceRef.current;
      if (pts.length >= 2) {
        const col = previewSpellRef.current ? SPELL_BY_ID[previewSpellRef.current].color : "#FFDE66";
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 22;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(pts[0][0] * c.width, pts[0][1] * c.height);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * c.width, pts[i][1] * c.height);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.restore();
      }

      // Wand-tip orb
      if (cursor) {
        const px = cursor.x * c.width;
        const py = cursor.y * c.height;
        const active = cursor.drawing && canCastRef.current;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, active ? 12 : 8, 0, Math.PI * 2);
        ctx.fillStyle = active ? "#FFDE66" : "rgba(255,255,255,0.45)";
        if (active) {
          ctx.shadowColor = "#FFDE66";
          ctx.shadowBlur = 18;
        }
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [camReady]);

  function getNorm(e: React.PointerEvent<HTMLCanvasElement>): Pt2 {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  return (
    <div className={`sc-arena ${shake ? "shake" : ""} ${myFrozen ? "frozen" : ""} ${overcharged ? "overcharged" : ""}`}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="ps-video mirror"
        style={{ opacity: camReady ? 0.52 : 0 }}
      />
      <div ref={threeHostRef} className="sc-three-layer" />
      <canvas
        ref={runeCanvasRef}
        width={640}
        height={480}
        className="sc-rune-canvas"
        onPointerDown={(e) => {
          if (!canCast) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointerDownRef.current = true;
          traceRef.current = [getNorm(e)];
          previewSpellRef.current = null;
          setPreviewSpell(null);
        }}
        onPointerMove={(e) => {
          if (!pointerDownRef.current) return;
          const pt = getNorm(e);
          const list = traceRef.current;
          const last = list[list.length - 1];
          if (!last || Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.014) {
            list.push(pt);
            const m = list.length >= 6 ? recognizeRune(list) : null;
            const next = m?.spell ?? null;
            if (next !== previewSpellRef.current) {
              if (next) playRuneLockChime();
              previewSpellRef.current = next;
              setPreviewSpell(next);
            }
            const col = next ? SPELL_BY_ID[next].color : "#FFDE66";
            sparksRef.current.push({
              x: pt[0],
              y: pt[1],
              vx: (Math.random() - 0.5) * 0.008,
              vy: (Math.random() - 0.5) * 0.008 - 0.003,
              life: 1,
              color: col,
              size: 3 + Math.random() * 3,
            });
          }
        }}
        onPointerUp={() => {
          if (!pointerDownRef.current) return;
          pointerDownRef.current = false;
          const pts = traceRef.current;
          traceRef.current = [];
          previewSpellRef.current = null;
          setPreviewSpell(null);
          if (!canCast || pts.length < 5) return;
          const m = recognizeRune(pts);
          if (m) onCast(m.spell);
        }}
      />

      {/* Elemental impact screen flash */}
      {flashColor && <div className="sc-flash" style={{ background: flashColor }} />}

      {/* Floating damage / shatter / shield callouts */}
      <div className="sc-callouts" aria-live="polite">
        {callouts.map((c) => (
          <span key={c.id} className={`sc-callout ${c.outgoing ? "out" : "in"}`} style={{ borderColor: c.color }}>
            {c.text}
          </span>
        ))}
      </div>

      <div className="ps-cam-hud">
        <span className={`ps-ai-pill ${handStatus === "tracing" || previewSpell ? "hot" : ""}`}>
          {!canCast
            ? "⏳ Wand recharging…"
            : previewSpell
              ? `${SPELL_BY_ID[previewSpell].emoji} Release → ${SPELL_BY_ID[previewSpell].name}!`
              : overcharged
                ? "🌟 OVERCHARGED! Next spell +8!"
                : handStatus === "tracing"
                  ? "🪄 Tracing rune…"
                  : handStatus === "ready"
                    ? "☝️ Point 1 finger to trace"
                    : handStatus === "none"
                      ? "✋ Raise hand or drag rune"
                      : handStatus === "loading"
                        ? "Loading arcane tracker…"
                        : "🪄 Drag a rune to cast!"}
        </span>
      </div>
    </div>
  );
}
