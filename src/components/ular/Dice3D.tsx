"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE_NS from "three";
import { feedback } from "@/lib/feedback";

export type Dice3DProps = {
  /** Which face (1–6) the die should land on / display. */
  face: number;
  /** Incrementing roll counter — every new number triggers a fresh 3D toss & spin. */
  spinId: number;
  /** True while this player can tap the die to roll. */
  canRoll: boolean;
  /** True while a roll mutation is in flight. */
  busy?: boolean;
  /** Whether the die overlay is currently visible (pauses WebGL rendering when hidden). */
  visible?: boolean;
  /** Player ink color for the impact glow / halo ring. */
  ink?: string;
  /** Called when the player taps the 3D die to roll. */
  onRoll?: () => void;
};

// Target Euler rotations that bring each die face squarely to +Z (toward the camera).
// Local die face layout (opposite faces sum to 7):
//   +Z = 1 (coral hero pip), -Z = 6 (golden pips), +Y = 2, -Y = 5, +X = 3, -X = 4
const FACE_EULERS: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [Math.PI / 2, 0, 0],
  3: [0, -Math.PI / 2, 0],
  4: [0, Math.PI / 2, 0],
  5: [-Math.PI / 2, 0, 0],
  6: [0, Math.PI, 0],
};

// Standard die pip offsets on a unit face plane (in [-0.3, +0.3])
const PIP_COORDS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.26, 0.26], [0.26, -0.26]],
  3: [[-0.26, 0.26], [0, 0], [0.26, -0.26]],
  4: [[-0.26, 0.26], [0.26, 0.26], [-0.26, -0.26], [0.26, -0.26]],
  5: [[-0.26, 0.26], [0.26, 0.26], [0, 0], [-0.26, -0.26], [0.26, -0.26]],
  6: [[-0.26, 0.28], [0.26, 0.28], [-0.26, 0], [0.26, 0], [-0.26, -0.28], [0.26, -0.28]],
};

const ROLL_DUR = 0.86; // seconds for toss + bounce 1 + bounce 2 + spring settle

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Center-stage interactive 3D Toybox Vinyl Die powered by Three.js PBR.
 * Features realistic 3-axis tumble physics, dual floor bounces with squash-and-stretch,
 * golden 3D impact sparkles, and crisp sculpted vinyl pips.
 */
export function Dice3D({ face, spinId, canRoll, busy = false, visible = true, ink = "#5E4A8C", onRoll }: Dice3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pressing, setPressing] = useState(false);
  const [landedBadge, setLandedBadge] = useState<{ id: number; face: number } | null>(null);

  const stateRef = useRef({
    face,
    spinId: 0,
    canRoll,
    busy,
    visible,
    pressing: false,
    ink,
    // Active spin kinematics
    spinning: false,
    t: 0,
    endEuler: [0, 0, 0] as [number, number, number],
    extraTurns: [2, 2, 1] as [number, number, number],
    landSoundPlayed: false,
    burstTriggered: false,
    ringAge: -1,
  });

  useEffect(() => {
    stateRef.current.canRoll = canRoll;
    stateRef.current.busy = busy;
    stateRef.current.visible = visible;
    stateRef.current.ink = ink;
  }, [canRoll, busy, visible, ink]);

  useEffect(() => {
    stateRef.current.pressing = pressing;
  }, [pressing]);

  // Trigger a fresh 3D spin whenever spinId increments
  useEffect(() => {
    if (spinId <= 0 || spinId === stateRef.current.spinId) return;
    const s = stateRef.current;
    s.spinId = spinId;
    s.face = face;
    const base = FACE_EULERS[face] ?? FACE_EULERS[1];
    // Pure face orientation on dieMeshGroup; parent dieTiltGroup provides the consistent hero angle
    s.endEuler = [base[0], base[1], base[2]];
    // Randomize multi-axis spin counts so every toss looks organic and different
    const dirX = Math.random() > 0.5 ? 1 : -1;
    const dirY = Math.random() > 0.5 ? 1 : -1;
    const turnsX = (2 + Math.floor(Math.random() * 2)) * dirX;
    const turnsY = (2 + Math.floor(Math.random() * 2)) * dirY;
    const turnsZ = Math.random() > 0.5 ? 1 : -1;
    s.extraTurns = [turnsX, turnsY, turnsZ];
    s.spinning = true;
    s.t = 0;
    s.landSoundPlayed = false;
    s.burstTriggered = false;
    s.ringAge = -1;

    if (prefersReducedMotion()) {
      // Snap cleanly on the next RAF tick without tumbling or synchronous setState in effect
      s.t = ROLL_DUR;
      s.landSoundPlayed = true;
      s.burstTriggered = true;
    } else {
      feedback.diceToss();
    }
  }, [spinId, face]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const [THREE, { RoundedBoxGeometry }, { RoomEnvironment }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/geometries/RoundedBoxGeometry.js"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
      ]);
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "default" });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.round(220 * dpr);
      renderer.setPixelRatio(1);
      renderer.setSize(px, px, false);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envRT = pmrem.fromScene(roomEnv, 0.04);
      roomEnv.dispose();
      pmrem.dispose();

      const scene = new THREE.Scene();
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.68;

      const key = new THREE.DirectionalLight(0xfff9ef, 1.55);
      key.position.set(-2.8, 4.8, 4.2);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xffe9cf, 0.55);
      fill.position.set(3.2, 1.4, 2.8);
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0xd9f2ff, 0.85);
      rim.position.set(0.4, 2.6, -3.6);
      scene.add(rim);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x3b2846, 0.52));

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
      camera.position.set(0, 0.52, 4.85);
      camera.lookAt(0, 0.05, 0);

      // Build chunky Toybox Vinyl 3D Die with real sculpted glossy pips
      // Hierarchy: dieRig (position & squash/stretch) -> dieTiltGroup (consistent camera-facing hero tilt) -> dieMeshGroup (pure face & spin rotation)
      const dieRig = new THREE.Group();
      const dieTiltGroup = new THREE.Group();
      const dieMeshGroup = new THREE.Group();
      dieTiltGroup.rotation.set(0.08, 0.18, 0);
      dieTiltGroup.add(dieMeshGroup);
      dieRig.add(dieTiltGroup);
      scene.add(dieRig);

      const S = 1.24;
      const bodyGeo = new RoundedBoxGeometry(S, S, S, 6, 0.24);
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: 0xfbf2e4,
        roughness: 0.36,
        metalness: 0.0,
        clearcoat: 0.32,
        clearcoatRoughness: 0.22,
      });
      dieMeshGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

      const pipGeo = new THREE.SphereGeometry(0.105, 18, 14);
      const bigPipGeo = new THREE.SphereGeometry(0.165, 22, 16);
      const plumPipMat = new THREE.MeshPhysicalMaterial({ color: 0x31223d, roughness: 0.16, clearcoat: 0.6 });
      const coralPipMat = new THREE.MeshPhysicalMaterial({ color: 0xe84d45, roughness: 0.16, clearcoat: 0.65 });
      const goldPipMat = new THREE.MeshPhysicalMaterial({ color: 0xf4a81d, roughness: 0.18, clearcoat: 0.65 });

      const faceHalf = S * 0.501;
      const addFacePips = (
        faceNum: number,
        normal: [number, number, number],
        uAxis: [number, number, number],
        vAxis: [number, number, number],
      ) => {
        const coords = PIP_COORDS[faceNum];
        const geo = faceNum === 1 ? bigPipGeo : pipGeo;
        const mat = faceNum === 1 ? coralPipMat : faceNum === 6 ? goldPipMat : plumPipMat;
        const scaleFlat: [number, number, number] = [
          normal[0] !== 0 ? 0.36 : 1,
          normal[1] !== 0 ? 0.36 : 1,
          normal[2] !== 0 ? 0.36 : 1,
        ];
        for (const [u, v] of coords) {
          const m = new THREE.Mesh(geo, mat);
          m.position.set(
            normal[0] * faceHalf + uAxis[0] * u * S + vAxis[0] * v * S,
            normal[1] * faceHalf + uAxis[1] * u * S + vAxis[1] * v * S,
            normal[2] * faceHalf + uAxis[2] * u * S + vAxis[2] * v * S,
          );
          m.scale.set(...scaleFlat);
          dieMeshGroup.add(m);
        }
      };

      // Matches FACE_EULERS exactly: +Z=1, -Z=6, +Y=2, -Y=5, +X=3, -X=4
      addFacePips(1, [0, 0, 1], [1, 0, 0], [0, 1, 0]);
      addFacePips(6, [0, 0, -1], [-1, 0, 0], [0, 1, 0]);
      addFacePips(2, [0, 1, 0], [1, 0, 0], [0, 0, -1]);
      addFacePips(5, [0, -1, 0], [1, 0, 0], [0, 0, 1]);
      addFacePips(3, [1, 0, 0], [0, 0, -1], [0, 1, 0]);
      addFacePips(4, [-1, 0, 0], [0, 0, 1], [0, 1, 0]);

      // Soft dynamic contact shadow disc underneath the die
      const shadowGeo = new THREE.CircleGeometry(0.92, 40);
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x231b1a, transparent: true, opacity: 0.24, depthWrite: false });
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -0.82;
      scene.add(shadow);

      // Expanding vinyl shockwave ring on first floor impact
      const ringGeo = new THREE.RingGeometry(0.62, 0.78, 36);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const impactRing = new THREE.Mesh(ringGeo, ringMat);
      impactRing.rotation.x = -Math.PI / 2;
      impactRing.position.y = -0.81;
      impactRing.visible = false;
      scene.add(impactRing);

      // 10 chunky 3D impact burst particles (golden / coral / sky orbs)
      const burstGroup = new THREE.Group();
      scene.add(burstGroup);
      const sparkCols = [0xffc83d, 0xff5b74, 0x34c2ff, 0x3ad67d, 0xfaf0e2];
      const sparkGeo = new THREE.OctahedronGeometry(0.095, 0);
      const sparkMats = sparkCols.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.2, clearcoat: 0.5 }));
      const sparks: { mesh: THREE_NS.Mesh; vx: number; vy: number; vz: number; age: number; alive: boolean }[] = [];
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(sparkGeo, sparkMats[i % sparkMats.length]);
        m.visible = false;
        burstGroup.add(m);
        sparks.push({ mesh: m, vx: 0, vy: 0, vz: 0, age: 0, alive: false });
      }

      const fireBurst = (isSix: boolean) => {
        stateRef.current.ringAge = 0;
        ringMat.color.setHex(isSix ? 0xffc83d : 0xfaf0e2);
        impactRing.visible = true;
        impactRing.scale.setScalar(0.8);
        ringMat.opacity = isSix ? 0.85 : 0.55;

        sparks.forEach((sp, i) => {
          const ang = (i / sparks.length) * Math.PI * 2 + Math.random() * 0.35;
          const speed = (isSix ? 2.5 : 1.75) + Math.random() * 0.8;
          sp.mesh.position.set(Math.cos(ang) * 0.35, -0.58, Math.sin(ang) * 0.35);
          sp.vx = Math.cos(ang) * speed;
          sp.vy = (isSix ? 2.4 : 1.7) + Math.random() * 1.1;
          sp.vz = Math.sin(ang) * speed;
          sp.age = 0;
          sp.alive = true;
          sp.mesh.visible = true;
          sp.mesh.scale.setScalar(isSix ? 1.25 : 0.95);
        });
      };

      // Initial pose
      const initBase = FACE_EULERS[stateRef.current.face] ?? FACE_EULERS[1];
      dieMeshGroup.rotation.set(initBase[0], initBase[1], initBase[2]);
      const ONE = new THREE.Vector3(1, 1, 1);

      let lastNow = performance.now();
      let idleT = 0;

      const tick = (now: number) => {
        if (disposed) return;
        const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
        lastNow = now;
        const s = stateRef.current;

        if (!s.visible && !s.spinning) {
          raf = requestAnimationFrame(tick);
          return;
        }
        idleT += dt;

        if (s.spinning) {
          s.t += dt;
          const u = Math.min(1, s.t / ROLL_DUR);

          // 3-phase vertical bounce arc: big toss (0..0.58), bounce 1 (0.58..0.82), bounce 2 (0.82..1.0)
          let y = 0;
          let sx = 1, sy = 1, sz = 1;
          if (u < 0.58) {
            const p = u / 0.58;
            y = Math.sin(p * Math.PI) * 1.22;
            const stretch = Math.abs(Math.cos(p * Math.PI)) * 0.08;
            sx = 1 - stretch * 0.5; sy = 1 + stretch; sz = 1 - stretch * 0.5;
          } else if (u < 0.82) {
            const p = (u - 0.58) / 0.24;
            y = Math.sin(p * Math.PI) * 0.36;
            const imp = Math.exp(-p * 9);
            sx = 1 + imp * 0.18; sy = 1 - imp * 0.20; sz = 1 + imp * 0.18;
            if (!s.landSoundPlayed) {
              s.landSoundPlayed = true;
              feedback.diceLand(s.face);
            }
            if (!s.burstTriggered) {
              s.burstTriggered = true;
              fireBurst(s.face === 6);
            }
          } else {
            const p = (u - 0.82) / 0.18;
            y = Math.sin(p * Math.PI) * 0.10;
            const imp = Math.exp(-p * 10);
            sx = 1 + imp * 0.09; sy = 1 - imp * 0.10; sz = 1 + imp * 0.09;
          }

          // Smooth ease-out rotation with playful spring wobble on landing
          const rotU = Math.min(1, u / 0.90);
          const ease = 1 - Math.pow(1 - rotU, 3.6);
          const settleWobble = u > 0.78 ? Math.sin((u - 0.78) * Math.PI * 6) * Math.exp(-(u - 0.78) * 14) * 0.12 : 0;

          const rx = s.endEuler[0] - (1 - ease) * s.extraTurns[0] * Math.PI * 2 + settleWobble;
          const ry = s.endEuler[1] - (1 - ease) * s.extraTurns[1] * Math.PI * 2;
          const rz = s.endEuler[2] - (1 - ease) * s.extraTurns[2] * Math.PI * 2 - settleWobble * 0.7;

          dieMeshGroup.rotation.set(rx, ry, rz);
          dieTiltGroup.rotation.set(0.08 + settleWobble * 0.4, 0.18, -settleWobble * 0.5);
          dieRig.position.y = -0.14 + y;
          dieRig.scale.set(sx, sy, sz);

          // Dynamic contact shadow tracks height
          const shScale = Math.max(0.42, 1 - y * 0.36);
          shadow.scale.setScalar(shScale);
          shadowMat.opacity = Math.max(0.06, 0.26 * shScale);

          if (u >= 1) {
            s.spinning = false;
            dieMeshGroup.rotation.set(s.endEuler[0], s.endEuler[1], s.endEuler[2]);
            dieTiltGroup.rotation.set(0.08, 0.18, 0);
            dieRig.position.y = -0.14;
            dieRig.scale.set(1, 1, 1);
            setLandedBadge({ id: s.spinId, face: s.face });
          }
        } else {
          // Idle state: inviting hover when it's your turn, optimistic wind-up while sending, calm hero settle otherwise
          if ((s.canRoll || s.busy) && !prefersReducedMotion()) {
            const hoverY = Math.sin(idleT * 2.8) * 0.085;
            const pressDrop = s.pressing ? -0.14 : s.busy ? 0.16 : 0;
            const targetScaleX = s.pressing ? 1.13 : s.busy ? 0.94 : 1;
            const targetScaleY = s.pressing ? 0.85 : s.busy ? 1.08 : 1;
            dieRig.position.y += (-0.04 + hoverY + pressDrop - dieRig.position.y) * Math.min(1, dt * 14);
            dieRig.scale.x += (targetScaleX - dieRig.scale.x) * Math.min(1, dt * 16);
            dieRig.scale.y += (targetScaleY - dieRig.scale.y) * Math.min(1, dt * 16);
            dieRig.scale.z = dieRig.scale.x;
            // Tempting slow turntable wobble inviting a tap, accelerating on press or launch
            dieTiltGroup.rotation.set(0.08, 0.18, 0);
            dieMeshGroup.rotation.y += dt * (s.busy ? 7.5 : s.pressing ? 2.6 : 0.78);
            dieMeshGroup.rotation.x = 0.32 + Math.sin(idleT * 1.9) * 0.16 + (s.busy ? dt * 4 : 0);
            dieMeshGroup.rotation.z = Math.cos(idleT * 1.5) * 0.10;
            const sh = 0.86 - (hoverY + pressDrop) * 0.35;
            shadow.scale.setScalar(Math.max(0.55, sh));
            shadowMat.opacity = 0.22;
          } else {
            // Resting on the rolled face with crisp consistent hero angle
            const base = FACE_EULERS[s.face] ?? FACE_EULERS[1];
            dieRig.position.y += (-0.14 - dieRig.position.y) * Math.min(1, dt * 10);
            dieRig.scale.lerp(ONE, Math.min(1, dt * 10));
            dieTiltGroup.rotation.set(0.08, 0.18, 0);
            dieMeshGroup.rotation.x += (base[0] - dieMeshGroup.rotation.x) * Math.min(1, dt * 10);
            dieMeshGroup.rotation.y += (base[1] - dieMeshGroup.rotation.y) * Math.min(1, dt * 10);
            dieMeshGroup.rotation.z += (base[2] - dieMeshGroup.rotation.z) * Math.min(1, dt * 10);
            shadow.scale.setScalar(1);
            shadowMat.opacity = 0.24;
          }
        }

        // Update expanding impact shockwave ring
        if (s.ringAge >= 0) {
          s.ringAge += dt;
          const ru = s.ringAge / 0.42;
          if (ru >= 1) {
            s.ringAge = -1;
            impactRing.visible = false;
          } else {
            impactRing.scale.setScalar(0.8 + ru * 1.75);
            ringMat.opacity = (1 - ru) * (1 - ru) * 0.75;
          }
        }

        // Update 3D burst sparkles
        for (const sp of sparks) {
          if (!sp.alive) continue;
          sp.age += dt;
          sp.vy -= 6.5 * dt;
          sp.mesh.position.x += sp.vx * dt;
          sp.mesh.position.y += sp.vy * dt;
          sp.mesh.position.z += sp.vz * dt;
          sp.mesh.rotation.x += dt * 7;
          sp.mesh.rotation.y += dt * 9;
          const life = Math.max(0, 1 - sp.age / 0.55);
          sp.mesh.scale.setScalar(life * 1.1);
          if (life <= 0) {
            sp.alive = false;
            sp.mesh.visible = false;
          }
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        bodyGeo.dispose();
        bodyMat.dispose();
        pipGeo.dispose();
        bigPipGeo.dispose();
        plumPipMat.dispose();
        coralPipMat.dispose();
        goldPipMat.dispose();
        shadowGeo.dispose();
        shadowMat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
        sparkGeo.dispose();
        sparkMats.forEach((m) => m.dispose());
        envRT.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  const handleRoll = () => {
    if (!canRoll || busy) return;
    setPressing(false);
    onRoll?.();
  };

  const showBadge = landedBadge && landedBadge.id === spinId && !canRoll;

  return (
    <div
      className={`ul-die3d${canRoll ? " ready" : ""}${pressing ? " press" : ""}`}
      style={{ "--die-ink": ink } as React.CSSProperties}
    >
      <button
        type="button"
        className="ul-die3d-hit"
        disabled={!canRoll || busy}
        aria-label={canRoll ? "Roll the 3D die" : `Die shows ${face}`}
        onPointerDown={() => { if (canRoll && !busy) { feedback.unlock(); feedback.detent(); setPressing(true); } }}
        onPointerUp={() => setPressing(false)}
        onPointerLeave={() => setPressing(false)}
        onPointerCancel={() => setPressing(false)}
        onClick={handleRoll}
      >
        <canvas ref={canvasRef} className="ul-die3d-canvas" />
      </button>
      {showBadge && (
        <span key={landedBadge.id} className={`ul-die3d-num${landedBadge.face === 6 ? " six" : ""}`}>
          {landedBadge.face === 6 ? "6! ✨" : landedBadge.face}
        </span>
      )}
    </div>
  );
}
