/**
 * Shared Three.js runtime for Vinyl Toy Pum (/models/pum.glb).
 *
 * Uses ONE offscreen WebGLRenderer + ONE cached GLB parse for the entire app,
 * blitting each visible <Mascot /> instance to its own lightweight 2D canvas.
 * This avoids mobile Safari WebGL context limits while supporting unlimited
 * simultaneous 3D mascots with smooth skeletal & facial emotion cross-fades.
 */

import type * as THREE_NS from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export type MascotMood = "idle" | "happy" | "joy" | "wow" | "think" | "sleepy" | "talk";

type ThreeBundle = {
  THREE: typeof THREE_NS;
  renderer: THREE_NS.WebGLRenderer;
  envMap: THREE_NS.Texture;
  gltf: GLTF;
  cloneScene: (src: THREE_NS.Object3D) => THREE_NS.Object3D;
};

type MascotHandle = {
  setMood: (mood: MascotMood) => void;
  setSize: (cssSize: number) => void;
  setVisible: (visible: boolean) => void;
  nudge: () => void;
  dispose: () => void;
};

interface ActiveInstance {
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  root: THREE_NS.Object3D;
  rigRoot: THREE_NS.Object3D | null;
  mixer: THREE_NS.AnimationMixer;
  actions: Partial<Record<MascotMood, THREE_NS.AnimationAction>>;
  mood: MascotMood;
  cssSize: number;
  visible: boolean;
  renderedOnce: boolean;
  needsStaticRender: boolean;
  yaw: number;
  pitch: number;
  nudgeTimer: number;
  onFirstFrame?: () => void;
}

const MODEL_URL = "/models/pum.glb";
const REDUCED_MOTION_SEEK: Record<MascotMood, number> = {
  idle: 0.4,
  happy: 0.3,
  joy: 0.35,
  wow: 0.2,
  think: 0.4,
  sleepy: 0.6,
  talk: 0.18,
};

let enginePromise: Promise<ThreeBundle> | null = null;
let engineFailed = false;
let rafId: number | null = null;
let lastFrameTime = 0;
let pointerX = 0;
let pointerY = 0;
let pointerBound = false;
let hiddenBound = false;
const instances = new Set<ActiveInstance>();

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function bindGlobalListeners() {
  if (typeof window === "undefined") return;
  if (!pointerBound) {
    pointerBound = true;
    window.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse") return;
        pointerX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
        pointerY = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      },
      { passive: true }
    );
  }
  if (!hiddenBound) {
    hiddenBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopLoop();
      } else {
        lastFrameTime = performance.now();
        ensureLoop();
      }
    });
  }
}

async function getEngine(): Promise<ThreeBundle> {
  if (engineFailed) throw new Error("WebGL unavailable");
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const [THREE, { GLTFLoader }, { RoomEnvironment }, SkeletonUtils] =
      await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
        import("three/examples/jsm/utils/SkeletonUtils.js"),
      ]);

    const offscreen = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({
      canvas: offscreen,
      antialias: true,
      alpha: true,
      powerPreference: "default",
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    offscreen.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      stopLoop();
    });
    offscreen.addEventListener("webglcontextrestored", () => {
      for (const inst of instances) inst.needsStaticRender = true;
      ensureLoop();
    });

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    roomEnv.dispose();
    pmrem.dispose();

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(MODEL_URL);

    return {
      THREE,
      renderer,
      envMap: envRT.texture,
      gltf,
      cloneScene: SkeletonUtils.clone,
    };
  })().catch((err) => {
    engineFailed = true;
    enginePromise = null;
    throw err;
  });

  return enginePromise;
}

function buildStudioScene(bundle: ThreeBundle) {
  const { THREE, envMap } = bundle;
  const scene = new THREE.Scene();
  scene.background = null;
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;

  const key = new THREE.DirectionalLight(0xfff8ef, 1.35);
  key.position.set(-2.5, 4.0, 3.8);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffe9d6, 0.55);
  fill.position.set(3.0, 1.5, 2.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xdff2ff, 0.72);
  rim.position.set(0.5, 2.8, -3.5);
  scene.add(rim);

  const amb = new THREE.HemisphereLight(0xfffaf2, 0xd8c3b0, 0.72);
  scene.add(amb);

  return scene;
}

function renderInstance(bundle: ThreeBundle, inst: ActiveInstance, dt: number, reduced: boolean) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.min(512, Math.max(96, Math.round(inst.cssSize * dpr)));

  if (inst.canvas.width !== px || inst.canvas.height !== px) {
    inst.canvas.width = px;
    inst.canvas.height = px;
  }

  const { renderer } = bundle;
  if (renderer.domElement.width !== px || renderer.domElement.height !== px) {
    renderer.setSize(px, px, false);
  }

  if (reduced) {
    const act = inst.actions[inst.mood] ?? inst.actions.idle ?? inst.actions.happy;
    if (act) {
      act.time = REDUCED_MOTION_SEEK[inst.mood] ?? 0.25;
    }
    inst.mixer.update(0);
    inst.needsStaticRender = false;
  } else {
    inst.mixer.update(dt);

    // Subtle pointer look-at & playful tap-bounce
    const targetYaw = pointerX * 0.22;
    const targetPitch = pointerY * 0.10;
    const damp = 1 - Math.exp(-dt * 6);
    inst.yaw += (targetYaw - inst.yaw) * damp;
    inst.pitch += (targetPitch - inst.pitch) * damp;

    if (inst.nudgeTimer > 0) {
      inst.nudgeTimer = Math.max(0, inst.nudgeTimer - dt);
    }
    const nudgePhase = inst.nudgeTimer > 0 ? Math.sin((inst.nudgeTimer / 0.36) * Math.PI) : 0;
    inst.root.rotation.y = inst.yaw;
    inst.root.rotation.x = inst.pitch;
    inst.root.position.y = nudgePhase * 0.16;
    const sx = 1 - nudgePhase * 0.08;
    const sy = 1 + nudgePhase * 0.11;
    inst.root.scale.set(sx, sy, sx);
  }

  renderer.render(inst.scene, inst.camera);
  inst.ctx2d.clearRect(0, 0, px, px);
  inst.ctx2d.drawImage(renderer.domElement, 0, 0, px, px);

  if (!inst.renderedOnce) {
    inst.renderedOnce = true;
    inst.onFirstFrame?.();
  }
}

let cachedBundle: ThreeBundle | null = null;

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function tick(now: number) {
  rafId = null;
  if (!cachedBundle || document.hidden || instances.size === 0) return;

  const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  const reduced = prefersReducedMotion();

  let anyActive = false;
  for (const inst of instances) {
    if (!inst.visible) continue;
    if (reduced && !inst.needsStaticRender) continue;
    renderInstance(cachedBundle, inst, dt, reduced);
    if (!reduced) anyActive = true;
  }

  if (anyActive) {
    rafId = requestAnimationFrame(tick);
  }
}

function ensureLoop() {
  if (rafId !== null || !cachedBundle || document.hidden) return;
  let anyNeed = false;
  const reduced = prefersReducedMotion();
  for (const inst of instances) {
    if (inst.visible && (!reduced || inst.needsStaticRender)) {
      anyNeed = true;
      break;
    }
  }
  if (!anyNeed) return;
  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

/**
 * Mount a rigged 3D Vinyl Toy Pum onto a 2D <canvas>.
 * Returns a synchronous handle; WebGL init & GLB loading run asynchronously once per session.
 */
export function mountMascot3D(
  canvas: HTMLCanvasElement,
  opts: {
    mood: MascotMood;
    size: number;
    onFirstFrame?: () => void;
    onError?: () => void;
  }
): MascotHandle {
  bindGlobalListeners();

  let disposed = false;
  let currentMood: MascotMood = opts.mood;
  let currentSize = opts.size;
  let currentVisible = true;
  let inst: ActiveInstance | null = null;

  const applyMood = (target: ActiveInstance, nextMood: MascotMood, immediate: boolean) => {
    if (target.mood === nextMood && !immediate) return;
    const prevAction = target.actions[target.mood];
    const nextAction = target.actions[nextMood] ?? target.actions.idle ?? target.actions.happy;
    target.mood = nextMood;
    if (!nextAction) return;

    if (immediate || !prevAction || prevAction === nextAction || prefersReducedMotion()) {
      Object.values(target.actions).forEach((a) => a?.stop());
      nextAction.reset().setEffectiveWeight(1).play();
      if (prefersReducedMotion()) {
        nextAction.time = REDUCED_MOTION_SEEK[nextMood] ?? 0.25;
      }
    } else {
      nextAction.reset().setEffectiveWeight(1).play();
      prevAction.crossFadeTo(nextAction, 0.26, false);
    }
    target.needsStaticRender = true;
    ensureLoop();
  };

  const attachBundle = (bundle: ThreeBundle) => {
    if (disposed) return;
    cachedBundle = bundle;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      opts.onError?.();
      return;
    }

    const scene = buildStudioScene(bundle);
    const camera = new bundle.THREE.PerspectiveCamera(34, 1, 0.1, 40);
    camera.position.set(0, 1.02, 3.48);
    camera.lookAt(0, 0.90, 0);

    const root = new bundle.THREE.Group();
    const cloned = bundle.cloneScene(bundle.gltf.scene);
    root.add(cloned);
    scene.add(root);

    const mixer = new bundle.THREE.AnimationMixer(cloned);
    const actions: Partial<Record<MascotMood, THREE_NS.AnimationAction>> = {};
    for (const clip of bundle.gltf.animations) {
      const name = clip.name as MascotMood;
      actions[name] = mixer.clipAction(clip);
    }

    inst = {
      canvas,
      ctx2d,
      scene,
      camera,
      root,
      rigRoot: cloned,
      mixer,
      actions,
      mood: currentMood,
      cssSize: currentSize,
      visible: currentVisible,
      renderedOnce: false,
      needsStaticRender: true,
      yaw: 0,
      pitch: 0,
      nudgeTimer: 0,
      onFirstFrame: opts.onFirstFrame,
    };

    applyMood(inst, currentMood, true);
    if (!prefersReducedMotion()) {
      inst.mixer.update(REDUCED_MOTION_SEEK[currentMood] ?? 0.2);
    }
    instances.add(inst);
    if (inst.visible) {
      renderInstance(bundle, inst, 0, prefersReducedMotion());
      ensureLoop();
    }
  };

  // Paint synchronously on the very first frame once cached, avoiding any flicker on route/state transitions.
  if (cachedBundle) {
    attachBundle(cachedBundle);
  } else {
    getEngine()
      .then(attachBundle)
      .catch(() => {
        if (!disposed) opts.onError?.();
      });
  }

  return {
    setMood(mood: MascotMood) {
      currentMood = mood;
      if (inst) applyMood(inst, mood, false);
    },
    setSize(cssSize: number) {
      currentSize = cssSize;
      if (inst) {
        inst.cssSize = cssSize;
        inst.needsStaticRender = true;
        ensureLoop();
      }
    },
    setVisible(visible: boolean) {
      currentVisible = visible;
      if (inst) {
        inst.visible = visible;
        if (visible) {
          inst.needsStaticRender = true;
          ensureLoop();
        }
      }
    },
    nudge() {
      if (inst && !prefersReducedMotion()) {
        inst.nudgeTimer = 0.36;
        ensureLoop();
      }
    },
    dispose() {
      disposed = true;
      if (inst) {
        inst.mixer.stopAllAction();
        instances.delete(inst);
        inst = null;
      }
      if (instances.size === 0) stopLoop();
    },
  };
}

// Start loading Three.js + /models/pum.glb as soon as the module is imported on the client.
if (typeof window !== "undefined") {
  void getEngine().catch(() => {});
}
