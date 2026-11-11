/**
 * Raja Silat in 3D: the fight board drawn with three.js and nothing but basic shapes.
 *
 * This is a "feel first" pass. Every piece is a few boxes, cones and spheres, so all the work goes
 * into how it moves: springs for knockback, squash and stretch, hit-stop, camera shake, a floor that
 * ripples under big hits, debris, shockwaves and pieces that really fly off the edge.
 *
 * The stage is plain imperative code (no React inside the frame loop). `sync` is given the same
 * props as the flat `SilatBoard` and works out what changed.
 */
import * as THREE from "three";
import { ATTACK_KINDS, FX_TEXT, SPECIAL_COLOR, SPECIAL_ICON, type Highlights } from "@/components/silat/SilatBoard";
import { LOOKS, type Biome, type Look } from "@/lib/silat/tower";
import { DIRS, TRAITS, chargeEnd, intentValid, isGuarded, moveDef, occupant, slamArea, specialDanger, unitHit, type Fight, type Fx, type Intent, type Kind, type Unit } from "@/lib/silat/rules";

// ---------- Feel: every number worth tuning lives here ----------

export const FEEL = {
  gravity: 30,
  /** Knockback: a stiff spring with a little overshoot, so a shoved piece "lands". */
  slide: { k: 240, c: 20, kick: 15 },
  /** Walking: a short hop. */
  hop: { time: 0.2, height: 0.42, knight: 0.95 },
  /** The hero's kick: wind up, snap forward, recover. `hit` is when the foot lands. */
  lunge: { time: 0.36, hit: 0.11, back: 0.24, reach: 0.86 },
  /** Squash and stretch (a bouncy spring on the piece's height). */
  squash: { k: 320, c: 13 },
  /** Lean (a spring on the piece's tilt). */
  tilt: { k: 150, c: 9 },
  /** Hit-stop in seconds: the whole board freezes for a blink on impact. */
  stop: { hit: 0.075, perDmg: 0.022, hero: 0.12, ko: 0.14, boom: 0.16 },
  /** After a knockout the world runs slow for a moment: [seconds, speed]. */
  slow: { time: 0.32, speed: 0.3 },
  /** Camera shake ("trauma", 0 to 1; the shake is its square). */
  shake: { hit: 0.3, perDmg: 0.1, hero: 0.6, ko: 0.62, boom: 0.95, slam: 0.75, decay: 2.1, move: 0.3, roll: 0.045 },
  /** The floor wave under big hits. */
  ripple: { speed: 7, hit: 0.07, ko: 0.14, boom: 0.3, slam: 0.34, land: 0.025 },
  /** Seconds between two effects of one batch (a chain reaction plays as a quick drum roll). */
  stagger: 0.06,
  /** `tilt` is degrees above the floor (90 = straight down) for a wide view; tall views look from higher up.
   *  `punch` is how far it pushes in on a hit, `kick` how hard it's knocked the way the blow went. */
  camera: { fov: 36, tilt: 47, punch: 0.13, kick: 0.5 },
  /** How big the pieces are on their squares (1 = a base 0.6 of a square wide). */
  scale: 1.28,
};

const MUD = [0xc9a27a, 0xb48a60];
const ENEMY = 0x51456b;
const HERO = 0xfff4e0;

export interface StageProps {
  fight: Fight;
  hl?: Highlights;
  preview?: Fight;
  fxKey: number;
  /** Pixels of the view covered by the HUD at the top and bottom: the board is fitted between them. */
  inset?: { top: number; bottom: number };
}

type Draw = Kind | "hero" | "batu" | "petasan";

interface Actor {
  key: string;
  draw: Draw;
  boss: boolean;
  root: THREE.Group;
  body: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  color: number;
  h: number;
  sq: number;
  // Where it wants to stand, and how it's getting there.
  tx: number; tz: number;
  vx: number; vz: number;
  hop: { fx: number; fz: number; t: number; h: number } | null;
  y: number; vy: number;
  // Springs.
  sy: number; svy: number;
  rx: number; rz: number; rvx: number; rvz: number;
  face: number;
  lunge: { dx: number; dz: number; t: number } | null;
  flash: number; flashColor: number;
  phase: number;
  spawn: number;
  fly: { vx: number; vy: number; vz: number; t: number } | null;
  dying: boolean;
  doomed: boolean;
  unit?: Unit;
  head?: HTMLDivElement;
  foot?: HTMLDivElement;
}

interface Particle { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; vx: number; vy: number; vz: number; t: number; life: number; grav: number; grow: number; spin: number; size: number }
interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; life: number; r0: number; r1: number }
interface Pin { el: HTMLElement; pos: THREE.Vector3; until?: number }

const esc = (t: string | number) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------- Pieces: a handful of primitives each ----------

function buildPiece(draw: Draw, o: { boss?: boolean; target?: boolean; ghost?: boolean } = {}) {
  const g = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const mat = (color: number, rough = 0.62) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05, transparent: !!o.ghost, opacity: o.ghost ? 0.38 : 1, depthWrite: !o.ghost });
    mats.push(m);
    return m;
  };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = !o.ghost;
    g.add(mesh);
    return mesh;
  };
  const cyl = (top: number, bottom: number, h: number, seg = 20) => new THREE.CylinderGeometry(top, bottom, h, seg);
  const eyes = (y: number, z: number, gap = 0.07, r = 0.035) => {
    const white = mat(0xffffff, 0.3);
    add(new THREE.SphereGeometry(r, 10, 8), white, -gap, y, z);
    add(new THREE.SphereGeometry(r, 10, 8), white, gap, y, z);
  };
  let h = 0.6;
  let color = ENEMY;

  if (draw === "batu") {
    color = 0x8b8f96;
    const m = mat(color, 0.95);
    m.flatShading = true;
    add(new THREE.DodecahedronGeometry(0.36, 0), m, 0, 0.32, 0).rotation.set(0.4, 0.7, 0.2);
    h = 0.66;
  } else if (draw === "petasan") {
    color = 0xe5383b;
    add(new THREE.BoxGeometry(0.56, 0.46, 0.56), mat(color), 0, 0.23, 0);
    add(new THREE.BoxGeometry(0.58, 0.1, 0.58), mat(0xffc800), 0, 0.25, 0);
    add(cyl(0.02, 0.02, 0.16, 6), mat(0x3c3c3c), 0.1, 0.54, 0.05).rotation.z = -0.4;
    add(new THREE.SphereGeometry(0.04, 8, 6), mat(0xff9600, 0.2), 0.13, 0.63, 0.05);
    h = 0.6;
  } else if (draw === "hero") {
    color = HERO;
    const cloth = mat(color);
    const red = mat(0xe5383b);
    add(cyl(0.3, 0.32, 0.07), mat(0xe5383b), 0, 0.035, 0);
    add(new THREE.CapsuleGeometry(0.17, 0.26, 6, 14), cloth, 0, 0.37, 0);
    add(new THREE.BoxGeometry(0.37, 0.07, 0.37), red, 0, 0.34, 0); // sash
    add(new THREE.SphereGeometry(0.155, 18, 14), mat(0xf2c39a), 0, 0.74, 0);
    add(new THREE.TorusGeometry(0.15, 0.03, 8, 20), red, 0, 0.78, 0).rotation.x = Math.PI / 2; // headband
    add(new THREE.BoxGeometry(0.05, 0.03, 0.2), red, 0.06, 0.76, -0.22).rotation.x = 0.5; // its tail
    const gold = mat(0xffc800, 0.35);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(new THREE.ConeGeometry(0.035, 0.1, 6), gold, Math.cos(a) * 0.09, 0.93, Math.sin(a) * 0.09);
    }
    eyes(0.76, 0.14, 0.06, 0.03);
    h = 1.0;
  } else {
    color = o.boss ? 0x7a1f2b : ENEMY;
    const dark = mat(color);
    const trim = mat(o.boss ? 0xffc800 : 0x8f80a8, 0.4);
    add(cyl(0.3, 0.33, 0.08), trim, 0, 0.04, 0);
    if (draw === "p") {
      add(cyl(0.12, 0.22, 0.3), dark, 0, 0.23, 0);
      add(new THREE.SphereGeometry(0.16, 16, 12), dark, 0, 0.5, 0);
      eyes(0.52, 0.14);
      h = 0.66;
    } else if (draw === "n") {
      add(new THREE.BoxGeometry(0.3, 0.42, 0.3), dark, 0, 0.29, -0.03);
      add(new THREE.BoxGeometry(0.22, 0.24, 0.42), dark, 0, 0.6, 0.08).rotation.x = 0.35;
      add(new THREE.ConeGeometry(0.05, 0.14, 4), dark, -0.07, 0.8, -0.04);
      add(new THREE.ConeGeometry(0.05, 0.14, 4), dark, 0.07, 0.8, -0.04);
      eyes(0.66, 0.2, 0.115);
      h = 0.86;
    } else if (draw === "b") {
      add(new THREE.ConeGeometry(0.23, 0.66, 20), dark, 0, 0.41, 0);
      add(new THREE.SphereGeometry(0.075, 12, 10), trim, 0, 0.78, 0);
      eyes(0.46, 0.14, 0.06);
      h = 0.86;
    } else if (draw === "r") {
      add(new THREE.BoxGeometry(0.44, 0.5, 0.44), dark, 0, 0.33, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.BoxGeometry(0.15, 0.13, 0.15), dark, x * 0.15, 0.64, z * 0.15);
      eyes(0.42, 0.225, 0.09);
      h = 0.72;
    } else if (draw === "q") {
      add(cyl(0.14, 0.25, 0.6), dark, 0, 0.38, 0);
      add(new THREE.TorusGeometry(0.16, 0.045, 8, 20), trim, 0, 0.7, 0).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.11, 14, 10), dark, 0, 0.8, 0);
      eyes(0.52, 0.17, 0.06);
      h = 0.94;
    } else {
      const crown = mat(0xffc800, 0.35);
      add(cyl(0.17, 0.26, 0.62), dark, 0, 0.39, 0);
      add(cyl(0.21, 0.17, 0.08), o.target || o.boss ? crown : trim, 0, 0.74, 0);
      add(new THREE.BoxGeometry(0.06, 0.24, 0.06), crown, 0, 0.9, 0);
      add(new THREE.BoxGeometry(0.18, 0.06, 0.06), crown, 0, 0.92, 0);
      eyes(0.54, 0.19, 0.07);
      h = 1.04;
    }
  }
  const s = (o.boss ? 1.15 : 1) * FEEL.scale;
  g.scale.setScalar(s);
  return { g, mats, h: h * s, color };
}

// ---------- The stage ----------

export class Stage {
  private host: HTMLElement;
  private layer: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private hurtEl: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FEEL.camera.fov, 1, 0.1, 100);
  private camPos = new THREE.Vector3();
  private camAim = new THREE.Vector3();
  private hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 1.15);
  private sun = new THREE.DirectionalLight(0xffffff, 2.1);
  private blast = new THREE.PointLight(0xffa040, 0, 9, 1.6);
  private boardG = new THREE.Group();
  private envG = new THREE.Group();
  private clouds: { g: THREE.Object3D; v: number }[] = [];
  private crowd: { mesh: THREE.InstancedMesh; at: { x: number; y: number; z: number; ph: number }[] } | null = null;
  private cheer = 0;
  private isle = 6;
  private markG = new THREE.Group();
  private ghostG = new THREE.Group();
  private actorG = new THREE.Group();
  private fxG = new THREE.Group();
  private tiles: THREE.Mesh[] = [];
  private tileMats: THREE.MeshStandardMaterial[] = [];
  private actors = new Map<string, Actor>();
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private ripples: { x: number; z: number; t0: number; amp: number }[] = [];
  private pins: Pin[] = [];
  private floats: Pin[] = [];
  private queue: { at: number; fn: () => void }[] = [];
  private pulses: { mesh: THREE.Mesh; kind: "tint" | "ring" | "dot" }[] = [];
  private dice: { mesh: THREE.Mesh; t: number; ok: boolean }[] = [];

  private p: StageProps | null = null;
  private prev: Fight | null = null;
  private n = 0;
  private sceneKey = "";
  private fxKey = -1;
  private t = 0;
  private last = 0;
  private freeze = 0;
  private trauma = 0;
  private punch = 0;
  private slow = 0;
  private kick = { x: 0, z: 0, vx: 0, vz: 0 };
  private inset = { top: 0, bottom: 0 };
  private hover: number | null = null;
  private w = 1;
  private h = 1;
  private raf = 0;
  private dead = false;
  private calm = false;
  private ro: ResizeObserver;
  private ray = new THREE.Raycaster();
  private v = new THREE.Vector3();

  // Shared shapes for particles and markers.
  private gBox = new THREE.BoxGeometry(1, 1, 1);
  private gPuff = new THREE.SphereGeometry(0.5, 8, 6);
  private gRing = new THREE.RingGeometry(0.86, 1, 48);
  private gQuad = new THREE.PlaneGeometry(0.94, 0.94);
  private gDisc = new THREE.CircleGeometry(0.19, 24);
  private gLoop = new THREE.RingGeometry(0.33, 0.43, 40);
  private gThin = new THREE.RingGeometry(0.4, 0.44, 40);
  private gDie = new THREE.IcosahedronGeometry(0.2, 0);
  private gArc = new THREE.TorusGeometry(0.5, 0.045, 6, 20, Math.PI * 0.9);

  constructor(host: HTMLElement, private on: { tap: (sq: number) => void; hover: (sq: number | null) => void }) {
    this.host = host;
    this.calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    const cv = this.renderer.domElement;
    cv.setAttribute("aria-hidden", "true");
    host.prepend(cv);

    this.layer = document.createElement("div");
    this.layer.className = "s3-layer";
    this.flashEl = document.createElement("div");
    this.flashEl.className = "s3-flash";
    this.hurtEl = document.createElement("div");
    this.hurtEl.className = "s3-hurt";
    host.append(this.layer, this.flashEl, this.hurtEl);

    this.sun.position.set(-4, 9, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.blast, this.envG, this.boardG, this.markG, this.ghostG, this.actorG, this.fxG);

    cv.addEventListener("click", this.onClick);
    cv.addEventListener("pointermove", this.onMove);
    cv.addEventListener("pointerleave", this.onLeave);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const cv = this.renderer.domElement;
    cv.removeEventListener("click", this.onClick);
    cv.removeEventListener("pointermove", this.onMove);
    cv.removeEventListener("pointerleave", this.onLeave);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
    });
    for (const g of [this.gBox, this.gPuff, this.gRing, this.gQuad, this.gDisc, this.gLoop, this.gThin, this.gDie, this.gArc]) g.dispose();
    this.renderer.dispose();
    cv.remove();
    this.layer.remove();
    this.flashEl.remove();
    this.hurtEl.remove();
  }

  // ---------- Geometry helpers ----------

  private x(sq: number) { return (sq % this.n) - (this.n - 1) / 2; }
  private z(sq: number) { return Math.floor(sq / this.n) - (this.n - 1) / 2; }

  /** How far the floor is pushed up at a point by the ripples passing through. */
  private ground(x: number, z: number) {
    let y = 0;
    for (const r of this.ripples) {
      const d = Math.hypot(x - r.x, z - r.z);
      const ph = (this.t - r.t0) * FEEL.ripple.speed - d;
      if (ph <= 0) continue;
      y += r.amp * Math.sin(ph * 4.2) * Math.exp(-ph * 1.9) * Math.exp(-d * 0.3);
    }
    return y;
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.fit();
  }

  /** Pull the camera back just far enough that the whole board (and the tallest piece on the far row)
   *  fits in the part of the view the HUD leaves free. */
  private fit() {
    if (!this.n) return;
    const half = this.n / 2 + 0.34;
    // The free band, in the camera's -1..1 screen space.
    const free = Math.max(120, this.h - this.inset.top - this.inset.bottom);
    const top = 1 - (2 * Math.min(this.inset.top, this.h - 120)) / this.h;
    const bot = top - (2 * free) / this.h;
    // A tall band is filled by looking from higher up; a wide one by a lower, more dramatic angle.
    const el = (Math.max(FEEL.camera.tilt, Math.min(62, 36 + 20 * (free / this.w))) * Math.PI) / 180;
    const pts = [[-half, 0, half], [half, 0, half], [-half, 0, -half], [half, 0, -half], [-half, 1.5, -half], [half, 1.5, -half]];
    const tan = Math.tan((FEEL.camera.fov * Math.PI) / 360);
    let aimZ = 0;
    let d = this.n * 2;
    const measure = (dist: number) => {
      this.camera.position.set(0, Math.sin(el) * dist, aimZ + Math.cos(el) * dist);
      this.camera.lookAt(0, 0, aimZ);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      let mx = 0, lo = 9, hi = -9;
      for (const [x, y, z] of pts) {
        this.v.set(x, y, z).project(this.camera);
        mx = Math.max(mx, Math.abs(this.v.x));
        lo = Math.min(lo, this.v.y);
        hi = Math.max(hi, this.v.y);
      }
      return { mx, lo, hi };
    };
    for (let pass = 0; pass < 6; pass++) {
      let a = 2, b = 90;
      for (let i = 0; i < 22; i++) {
        d = (a + b) / 2;
        const m = measure(d);
        if (m.mx > 0.985 || m.hi - m.lo > (top - bot) * 0.98) a = d; else b = d;
      }
      d = b;
      const m = measure(d);
      aimZ -= (((m.lo + m.hi) / 2 - (top + bot) / 2) * d * tan) / Math.sin(el);
    }
    measure(d);
    this.camPos.copy(this.camera.position);
    this.camAim.set(0, 0, aimZ);
  }

  private project(pos: THREE.Vector3, out: { x: number; y: number }) {
    this.v.copy(pos).project(this.camera);
    out.x = (this.v.x * 0.5 + 0.5) * this.w;
    out.y = (-this.v.y * 0.5 + 0.5) * this.h;
  }

  private pick(e: MouseEvent): number | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    // A tall piece covers the squares behind it: tapping its body means its square.
    const hit = this.ray.intersectObjects(this.actorG.children, true)[0];
    if (hit) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.actor) o = o.parent;
      const a = o?.userData.actor as Actor | undefined;
      if (a && !a.dying) return a.sq;
    }
    const pt = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), this.v);
    if (!pt) return null;
    const c = Math.round(pt.x + (this.n - 1) / 2), rr = Math.round(pt.z + (this.n - 1) / 2);
    return c < 0 || rr < 0 || c >= this.n || rr >= this.n ? null : rr * this.n + c;
  }

  private onClick = (e: MouseEvent) => {
    const sq = this.pick(e);
    if (sq !== null) this.on.tap(sq);
  };
  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const sq = this.pick(e);
    if (sq === this.hover) return;
    this.hover = sq;
    this.on.hover(sq);
  };
  private onLeave = () => {
    this.hover = null;
    this.on.hover(null);
  };

  private after(delay: number, fn: () => void) {
    this.queue.push({ at: this.t + delay, fn });
  }

  // ---------- Sync: what changed since last time ----------

  sync(p: StageProps) {
    if (this.dead) return;
    const s = p.fight;
    const first = !this.p;
    const batch = !first && p.fxKey !== this.fxKey;
    this.p = p;
    this.fxKey = p.fxKey;
    const ins = p.inset ?? { top: 0, bottom: 0 };
    if (ins.top !== this.inset.top || ins.bottom !== this.inset.bottom) { this.inset = ins; this.fit(); }
    const key = `${s.n}|${s.env?.biome ?? ""}|${s.env?.arena ? 1 : 0}|${s.env?.floor ?? 0}|${s.mud.join(",")}`;
    if (key !== this.sceneKey) {
      this.sceneKey = key;
      this.buildBoard(s);
    }
    this.reconcile(s, batch);
    this.buildMarkers();
    this.buildLabels();
    this.prev = s;
  }

  private buildBoard(s: Fight) {
    this.n = s.n;
    for (const t of this.tiles) t.geometry.dispose();
    for (const m of this.tileMats) m.dispose();
    this.boardG.clear();
    this.tiles = [];
    this.tileMats = [];
    const biome: Biome = s.env?.biome ?? "meadow";
    const look = LOOKS[biome];
    this.hemi.color.set(look.sky[1]);
    this.hemi.groundColor.set(look.grass);
    this.hemi.intensity = 1.15 * look.day;
    this.sun.color.set(look.sun);
    this.sun.intensity = 2.1 * look.day;
    this.host.style.background = `linear-gradient(${look.sky[0]}, ${look.sky[1]})`;
    const geo = new THREE.BoxGeometry(0.955, 0.3, 0.955);
    for (let sq = 0; sq < s.n * s.n; sq++) {
      const light = ((sq % s.n) + Math.floor(sq / s.n)) % 2 === 0;
      const mud = s.mud.includes(sq);
      const m = new THREE.MeshStandardMaterial({ color: mud ? MUD[light ? 0 : 1] : light ? look.tileA : look.tileB, roughness: mud ? 1 : 0.85 });
      const t = new THREE.Mesh(geo, m);
      t.position.set(this.x(sq), -0.15, this.z(sq));
      t.receiveShadow = true;
      t.userData.base = mud ? -0.2 : -0.15;
      this.tiles.push(t);
      this.tileMats.push(m);
      this.boardG.add(t);
    }
    // The board is a stone floor laid on the island.
    const slabM = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.rock).multiplyScalar(0.62), roughness: 0.9 });
    this.tileMats.push(slabM);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(s.n + 0.5, 0.4, s.n + 0.5), slabM);
    slab.position.y = -0.31;
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.boardG.add(slab);
    this.buildEnv(s, biome, look);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -(this.isle + 1);
    sc.right = sc.top = this.isle + 1;
    sc.near = 1;
    sc.far = 40;
    sc.updateProjectionMatrix();
    this.fit();
  }

  /** Everything around the board: the floating island it stands on, what grows and stands there, the
   *  tower you're climbing behind it, clouds, and for elite and guardian fights an arena full of people. */
  private buildEnv(s: Fight, biome: Biome, look: Look) {
    this.envG.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose();
    });
    this.envG.clear();
    this.clouds = [];
    this.crowd = null;
    const arena = !!s.env?.arena;
    // The same floor always looks the same.
    let seed = ((s.env?.floor ?? 1) * 9973 + s.n * 131) >>> 0;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const mats = new Map<string, THREE.MeshStandardMaterial>();
    const mat = (color: string | number, o: { flat?: boolean; glow?: number; rough?: number } = {}) => {
      const k = `${color}|${o.flat ? 1 : 0}|${o.glow ?? 0}`;
      let m = mats.get(k);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.9, flatShading: !!o.flat, emissive: o.glow ? new THREE.Color(color) : undefined, emissiveIntensity: o.glow ?? 0 });
        mats.set(k, m);
      }
      return m;
    };
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const half = s.n / 2;
    const top = -0.5; // the island's surface: the board's stone floor stands a little proud of it
    const R = half * 1.42 + (arena ? 4.6 : 2.6);
    this.isle = R;

    // The island: a grassy cap on a wedge of earth hanging in the sky.
    const leafC = new THREE.Color(look.leaf);
    const grassM = mat(look.grass);
    add(this.envG, new THREE.CylinderGeometry(R, R * 0.97, 0.5, 44), grassM, 0, top - 0.25, 0, false);
    add(this.envG, new THREE.ConeGeometry(R * 0.97, R * 1.25, 11), mat(look.dirt, { flat: true }), 0, top - 0.5 - R * 0.625, 0, false).rotation.x = Math.PI;
    for (let i = 0; i < 5; i++) {
      const a = rnd() * 6.28, d = R * (0.35 + rnd() * 0.45);
      add(this.envG, new THREE.DodecahedronGeometry(0.5 + rnd() * 0.7, 0), mat(look.dirt, { flat: true }), Math.cos(a) * d, top - 1.2 - rnd() * R * 0.5, Math.sin(a) * d, false);
    }

    // Things that stand on the island.
    const props: Record<string, (g: THREE.Group, k: number) => void> = {
      tree: (g, k) => {
        add(g, new THREE.CylinderGeometry(0.07 * k, 0.1 * k, 0.6 * k, 6), mat(0x7a5230), 0, 0.3 * k, 0);
        add(g, new THREE.IcosahedronGeometry(0.42 * k, 0), mat(look.leaf, { flat: true }), 0, 0.85 * k, 0);
        add(g, new THREE.IcosahedronGeometry(0.3 * k, 0), mat(`#${leafC.clone().multiplyScalar(1.12).getHexString()}`, { flat: true }), 0.12 * k, 1.2 * k, 0.05 * k);
      },
      pine: (g, k) => {
        add(g, new THREE.CylinderGeometry(0.06 * k, 0.09 * k, 0.4 * k, 6), mat(0x6a4a2c), 0, 0.2 * k, 0);
        for (let i = 0; i < 3; i++) add(g, new THREE.ConeGeometry((0.42 - i * 0.1) * k, 0.55 * k, 7), mat(biome === "frost" && i === 2 ? 0xffffff : look.leaf, { flat: true }), 0, (0.6 + i * 0.36) * k, 0);
      },
      rock: (g, k) => {
        add(g, new THREE.DodecahedronGeometry(0.34 * k, 0), mat(look.rock, { flat: true }), 0, 0.2 * k, 0).rotation.set(rnd() * 3, rnd() * 3, 0);
      },
      house: (g, k) => {
        add(g, new THREE.BoxGeometry(0.9 * k, 0.6 * k, 0.8 * k), mat(0xf0d9a8), 0, 0.3 * k, 0);
        add(g, new THREE.ConeGeometry(0.78 * k, 0.5 * k, 4), mat(biome === "frost" ? 0xdfeaf2 : 0xb5462f, { flat: true }), 0, 0.85 * k, 0).rotation.y = Math.PI / 4;
        add(g, new THREE.BoxGeometry(0.18 * k, 0.3 * k, 0.04), mat(0x6a3f24), 0, 0.15 * k, 0.4 * k, false);
      },
      cactus: (g, k) => {
        add(g, new THREE.CapsuleGeometry(0.1 * k, 0.6 * k, 4, 8), mat(look.leaf), 0, 0.45 * k, 0);
        add(g, new THREE.CapsuleGeometry(0.06 * k, 0.2 * k, 4, 8), mat(look.leaf), 0.2 * k, 0.55 * k, 0);
        add(g, new THREE.CapsuleGeometry(0.06 * k, 0.16 * k, 4, 8), mat(look.leaf), -0.19 * k, 0.4 * k, 0);
      },
      pillar: (g, k) => {
        add(g, new THREE.CylinderGeometry(0.16 * k, 0.18 * k, 1.3 * k, 10), mat(look.rock), 0, 0.65 * k, 0);
        add(g, new THREE.BoxGeometry(0.46 * k, 0.12 * k, 0.46 * k), mat(look.rock), 0, 1.36 * k, 0);
        add(g, new THREE.BoxGeometry(0.46 * k, 0.1 * k, 0.46 * k), mat(look.rock), 0, 0.05 * k, 0);
      },
      crystal: (g, k) => {
        add(g, new THREE.OctahedronGeometry(0.3 * k, 0), mat(look.leaf, { flat: true, glow: 0.9 }), 0, 0.42 * k, 0).scale.y = 1.7;
        add(g, new THREE.OctahedronGeometry(0.16 * k, 0), mat(look.leaf, { flat: true, glow: 0.9 }), 0.26 * k, 0.22 * k, 0.1 * k).scale.y = 1.6;
      },
      ember: (g, k) => {
        add(g, new THREE.DodecahedronGeometry(0.36 * k, 0), mat(look.rock, { flat: true }), 0, 0.22 * k, 0);
        add(g, new THREE.DodecahedronGeometry(0.16 * k, 0), mat(0xff7a2a, { flat: true, glow: 1.4 }), 0.05 * k, 0.5 * k, 0.04 * k);
      },
      puff: (g, k) => {
        for (const [x, y, r] of [[0, 0.25, 0.34], [0.34, 0.2, 0.26], [-0.32, 0.18, 0.24]]) add(g, new THREE.SphereGeometry(r * k, 10, 8), mat(0xffffff, { rough: 1 }), x * k, y * k, 0);
      },
      torch: (g, k) => {
        add(g, new THREE.CylinderGeometry(0.04 * k, 0.05 * k, 0.9 * k, 6), mat(0x3a2c2a), 0, 0.45 * k, 0);
        add(g, new THREE.SphereGeometry(0.11 * k, 8, 6), mat(0xffb040, { glow: 1.6 }), 0, 0.98 * k, 0, false);
      },
    };
    const MENU: Record<Biome, string[]> = {
      meadow: ["tree", "tree", "tree", "rock", "pine"],
      village: ["house", "house", "tree", "tree", "rock"],
      forest: ["pine", "pine", "pine", "tree", "rock"],
      sands: ["cactus", "cactus", "rock", "rock", "pillar"],
      keep: ["pillar", "pillar", "rock", "torch", "tree"],
      frost: ["pine", "pine", "rock", "rock", "house"],
      clouds: ["puff", "puff", "tree", "crystal", "pillar"],
      stars: ["crystal", "crystal", "pillar", "rock", "pine"],
      ember: ["ember", "ember", "rock", "torch", "pillar"],
      throne: ["pillar", "pillar", "torch", "torch", "crystal"],
    };
    const menu = MENU[biome];
    const clear = half + (arena ? 3.9 : 0.95); // keep the board (and the stands) free
    for (let i = 0, placed = 0; i < 90 && placed < (arena ? 12 : 26); i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * (R - 0.6);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (arena ? d < clear : Math.max(Math.abs(x), Math.abs(z)) < clear) continue;
      const near = z > half * 0.4; // toward the camera: keep it low so it never hides the board
      const kind = near ? (rnd() < 0.5 ? "rock" : menu[Math.floor(rnd() * menu.length)]) : menu[Math.floor(rnd() * menu.length)];
      const g = new THREE.Group();
      props[kind](g, (near ? 0.55 : 0.95) + rnd() * (near ? 0.25 : 0.75));
      g.position.set(x, top, z);
      g.rotation.y = kind === "house" ? (rnd() - 0.5) * 0.6 : rnd() * 6.28;
      this.envG.add(g);
      placed++;
    }
    // Flowers and tufts.
    const dots = new THREE.SphereGeometry(0.055, 6, 5);
    for (let i = 0; i < 40; i++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * (R - 0.3);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) < half + 0.4) continue;
      add(this.envG, dots, mat(["#ffffff", "#ffd84a", "#ff8fb0", look.leaf][Math.floor(rnd() * 4)]), x, top + 0.04, z, false);
    }

    // Elite and guardian fights: stands around the far side, packed with a crowd.
    if (arena) {
      const stone = mat(look.rock);
      const at: { x: number; y: number; z: number; ph: number }[] = [];
      for (let tier = 0; tier < 3; tier++) {
        const r = half * 1.42 + 1.0 + tier * 0.85, y = top + 0.3 + tier * 0.5;
        const count = Math.floor(r * 3.4);
        for (let i = 0; i <= count; i++) {
          const a = Math.PI * (1.02 + (0.96 * i) / count); // the far half of the ring
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          const seat = add(this.envG, new THREE.BoxGeometry(0.62, 0.3 + tier * 0.5, 0.8), stone, x, top + (0.3 + tier * 0.5) / 2, z);
          seat.rotation.y = -a + Math.PI / 2;
          at.push({ x, y: y + 0.16, z, ph: rnd() * 6.28 });
        }
      }
      const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.15, 0.18, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), at.length);
      const c = new THREE.Color();
      const shirts = [0xff4b4b, 0x1cb0f6, 0xffc800, 0x58cc02, 0xce82ff, 0xff9600, 0xffffff, 0xf2c39a];
      at.forEach((_, i) => people.setColorAt(i, c.set(shirts[Math.floor(rnd() * shirts.length)])));
      people.castShadow = true;
      this.envG.add(people);
      this.crowd = { mesh: people, at };
      // Banners on the top row.
      for (const side of [-1, 1]) {
        const g = new THREE.Group();
        props.pillar(g, 1.5);
        add(g, new THREE.BoxGeometry(0.06, 0.9, 0.7), mat(side < 0 ? 0xe5383b : 0x1cb0f6), 0, 1.5, 0.4);
        g.position.set(side * (half * 1.42 + 3.4), top, -0.4);
        this.envG.add(g);
      }
    }

    // Behind it all: the tower you're climbing, and a few more islands adrift.
    const brick = mat(look.brick, { rough: 1 });
    const tower = new THREE.Group();
    add(tower, new THREE.CylinderGeometry(3.2, 3.4, 60, 20), brick, 0, 0, 0, false);
    for (const y of [-6, 3, 12]) {
      add(tower, new THREE.CylinderGeometry(3.7, 3.7, 0.7, 20), brick, 0, y, 0, false);
      for (let i = 0; i < 12; i++) add(tower, new THREE.BoxGeometry(0.9, 0.7, 0.5), brick, Math.cos((i / 12) * 6.28) * 3.6, y + 0.7, Math.sin((i / 12) * 6.28) * 3.6, false).rotation.y = -(i / 12) * 6.28 + Math.PI / 2;
    }
    tower.position.set(-R * 0.55, 0, -(R + 13));
    this.envG.add(tower);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const r = 1.2 + rnd() * 1.3;
      add(g, new THREE.CylinderGeometry(r, r * 0.95, 0.3, 14), grassM, 0, 0, 0, false);
      add(g, new THREE.ConeGeometry(r * 0.95, r * 1.3, 7), mat(look.dirt, { flat: true }), 0, -0.15 - r * 0.65, 0, false).rotation.x = Math.PI;
      const p = new THREE.Group();
      props[menu[Math.floor(rnd() * menu.length)]](p, 1.1);
      p.position.y = 0.15;
      g.add(p);
      g.position.set((i % 2 ? 1 : -1) * (R + 2 + rnd() * 5), -1 + rnd() * 4, -(R * 0.3 + rnd() * (R + 8)));
      this.envG.add(g);
      this.clouds.push({ g, v: 0 });
    }
    const cloudM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: look.day < 0.9 ? 0.35 : 0.95 });
    mats.set("cloud", cloudM);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const k = 0.8 + rnd() * 1.4;
      for (const [x, y, r] of [[0, 0, 0.8], [0.9, -0.1, 0.6], [-0.9, -0.12, 0.55], [0.3, 0.35, 0.55]]) add(g, new THREE.SphereGeometry(r * k, 10, 8), cloudM, x * k, y * k, 0, false).scale.y = 0.7;
      g.position.set((rnd() - 0.5) * 44, i < 5 ? -3.5 - rnd() * 5 : 1 + rnd() * 6, i < 5 ? (rnd() - 0.5) * 18 : -(R + 3 + rnd() * 10));
      this.envG.add(g);
      this.clouds.push({ g, v: 0.15 + rnd() * 0.3 });
    }
  }

  private spawn(key: string, draw: Draw, sq: number, o: { boss?: boolean; target?: boolean }, pop: boolean): Actor {
    const b = buildPiece(draw, o);
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.add(b.g);
    root.add(body);
    root.position.set(this.x(sq), 0, this.z(sq));
    const a: Actor = {
      key, draw, boss: !!o.boss, root, body, mats: b.mats, color: b.color, h: b.h, sq,
      tx: this.x(sq), tz: this.z(sq), vx: 0, vz: 0, hop: null, y: 0, vy: 0,
      sy: 1, svy: 0, rx: 0, rz: 0, rvx: 0, rvz: 0,
      face: draw === "hero" ? Math.PI : 0, lunge: null, flash: 0, flashColor: 0xffffff,
      phase: Math.random() * 6.28, spawn: pop ? 0 : 1, fly: null, dying: false, doomed: false,
    };
    root.rotation.y = a.face;
    root.userData.actor = a;
    this.actorG.add(root);
    this.actors.set(key, a);
    if (draw !== "batu" && draw !== "petasan") {
      a.head = document.createElement("div");
      a.head.className = "s3-tag head";
      a.foot = document.createElement("div");
      a.foot.className = "s3-tag foot";
      this.layer.append(a.head, a.foot);
    }
    if (pop) { a.svy = 7; }
    return a;
  }

  private remove(a: Actor) {
    this.actors.delete(a.key);
    this.actorG.remove(a.root);
    a.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const m of a.mats) m.dispose();
    a.head?.remove();
    a.foot?.remove();
  }

  /** Send an actor to a square: `slide` is a shove (spring, dust), otherwise it hops there itself. */
  private go(a: Actor, sq: number, slide: boolean) {
    const tx = this.x(sq), tz = this.z(sq);
    a.sq = sq;
    if (slide) {
      a.hop = null;
      const dx = tx - a.root.position.x, dz = tz - a.root.position.z;
      const d = Math.hypot(dx, dz) || 1;
      // A kick of speed so it leaves at once, and it rocks back from the blow.
      a.vx += (dx / d) * FEEL.slide.kick;
      a.vz += (dz / d) * FEEL.slide.kick;
      a.rvx += (dz / d) * -13;
      a.rvz += (dx / d) * 13;
      a.svy -= 4;
    } else {
      const far = Math.hypot(tx - a.root.position.x, tz - a.root.position.z);
      a.hop = { fx: a.root.position.x, fz: a.root.position.z, t: 0, h: (a.draw === "n" ? FEEL.hop.knight : FEEL.hop.height) * Math.min(1.6, 0.7 + far * 0.3) };
      a.vx = a.vz = 0;
      a.svy = 5;
      a.face = Math.atan2(tx - a.root.position.x, tz - a.root.position.z);
    }
    a.tx = tx;
    a.tz = tz;
  }

  private reconcile(s: Fight, batch: boolean) {
    const fx = batch ? s.fx : [];
    const lunge = fx.find((f): f is Extract<Fx, { t: "lunge" }> => f.t === "lunge");
    // Which enemy just acted (during the enemy turn), so it can wind up before its hit lands.
    const prev = this.prev;
    const acted = batch && prev && prev.status === "enemy" && (s.enemyStep ?? 0) > (prev.enemyStep ?? 0) ? prev.intents[prev.enemyStep ?? 0] : undefined;
    const actor = acted ? this.actors.get(`u${acted.id}`) : undefined;
    let t0 = lunge ? FEEL.lunge.hit : 0;
    if (acted && actor && !this.calm) {
      if (acted.type === "slam" || (acted.type === "special" && moveDef(acted.move)?.kind === "slam")) {
        actor.vy = 3.4; // up, and the slam lands with the effects
        actor.svy = 6;
        t0 = 0.22;
      } else if (acted.type === "strike" || (acted.type === "special" && acted.target !== undefined && ["kick", "pounce"].includes(moveDef(acted.move)?.kind ?? ""))) {
        const to = acted.target!;
        const dx = this.x(to) - actor.root.position.x, dz = this.z(to) - actor.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.1 && s.units.find((u) => u.id === acted.id)?.sq === prev!.units.find((u) => u.id === acted.id)?.sq) {
          actor.lunge = { dx: dx / d, dz: dz / d, t: 0 };
          actor.face = Math.atan2(dx, dz);
          t0 = FEEL.lunge.hit;
        }
      }
    }
    // A shove (your attacks, explosions) slides; anything else walks.
    const shoved = !!lunge || fx.some((f) => f.t === "boom" || (f.t === "dmg" && !f.hero) || f.t === "ringout");

    // The hero.
    let hero = this.actors.get("hero");
    if (!hero) hero = this.spawn("hero", "hero", s.hero.sq, {}, false);
    if (hero.sq !== s.hero.sq) {
      // On the enemy's turn you only move when something knocks you there.
      if (batch) this.go(hero, s.hero.sq, prev?.status === "enemy" && !fx.some((f) => f.t === "dodge"));
      else this.place(hero, s.hero.sq);
    }
    if (lunge) {
      const [dx, dz] = DIRS[lunge.dir];
      const d = Math.hypot(dx, dz);
      hero.lunge = { dx: dx / d, dz: dz / d, t: 0 };
      hero.face = Math.atan2(dx, dz);
      // Throw the whole body into it.
      hero.rvx += (dz / d) * 16;
      hero.rvz += (dx / d) * -16;
      hero.svy += 6;
      this.after(FEEL.lunge.hit * 0.6, () => this.slash(hero!, dx / d, dz / d));
    }

    // Enemies.
    const seen = new Set<string>(["hero"]);
    for (const u of s.units) {
      const key = `u${u.id}`;
      seen.add(key);
      let a = this.actors.get(key);
      if (a && (a.draw !== u.kind || a.boss !== !!u.boss)) {
        // Promoted: swap the shape where it stands.
        this.remove(a);
        a = undefined;
      }
      if (!a) a = this.spawn(key, u.kind, u.sq, { boss: !!u.boss, target: u.target }, batch);
      a.unit = u;
      if (a.sq !== u.sq) {
        if (!batch) this.place(a, u.sq);
        else if (t0 > 0 && a !== actor) { const to = u.sq; a.sq = to; this.after(t0, () => this.go(a!, to, shoved)); }
        else this.go(a, u.sq, shoved && a !== actor);
      }
    }
    // Objects.
    for (const th of s.things) {
      const key = `t${th.id}`;
      seen.add(key);
      let a = this.actors.get(key);
      if (!a) a = this.spawn(key, th.kind, th.sq, {}, batch);
      if (a.sq !== th.sq) {
        if (!batch) this.place(a, th.sq);
        else { const to = th.sq; a.sq = to; this.after(t0, () => this.go(a!, to, true)); }
      }
    }
    // Whatever is gone: it leaves with its effect, not before.
    const gone = [...this.actors.values()].filter((a) => !seen.has(a.key) && !a.dying);
    const taken = new Set<number>();
    for (const a of gone) {
      const id = Number(a.key.slice(1));
      const mine = (f: Fx, k: number) => !taken.has(k) && (a.key[0] === "u"
        ? (f.t === "ko" || f.t === "ringout") && f.id === id
        : (f.t === "boom" && a.draw === "petasan") || (f.t === "ringout" && f.id === undefined));
      // Objects carry no id in their effect: take the one on its square, else the first that fits.
      let i = fx.findIndex((f, k) => mine(f, k) && f.sq === a.sq);
      if (i < 0) i = fx.findIndex(mine);
      if (i < 0) { this.remove(a); continue; }
      taken.add(i);
      a.dying = true;
      a.head?.remove();
      a.foot?.remove();
      a.head = a.foot = undefined;
      const end = fx[i].sq;
      if (end !== a.sq) this.after(t0, () => this.go(a, end, true));
      const f = fx[i];
      this.after(t0 + Math.min(i, 9) * FEEL.stagger, () => this.leave(a, f));
    }

    // The effects, in the order they happened.
    const stack = new Map<number, number>();
    fx.forEach((f, i) => {
      const k = stack.get(f.sq) ?? 0;
      stack.set(f.sq, k + 1);
      this.after((f.t === "lunge" ? 0 : t0) + Math.min(i, 9) * FEEL.stagger, () => this.play(f, k));
    });

    // The fight is over: the hero drops, or celebrates.
    if (s.status === "lost" && prev?.status !== "lost") this.after(t0 + 0.2, () => { hero!.rvx = 14; hero!.doomed = true; });
  }

  private place(a: Actor, sq: number) {
    a.sq = sq;
    a.tx = this.x(sq);
    a.tz = this.z(sq);
    a.hop = null;
    a.vx = a.vz = 0;
    a.root.position.set(a.tx, 0, a.tz);
  }

  /** The actor an effect on `sq` is about: where it stands now, else where it is on screen. */
  private at(sq: number, heroToo = false): Actor | undefined {
    let best: Actor | undefined;
    let bestD = 0.75;
    const x = this.x(sq), z = this.z(sq);
    for (const a of this.actors.values()) {
      if (a.fly || (!heroToo && a.key === "hero")) continue;
      if (a.sq === sq) return a;
      const d = Math.hypot(a.root.position.x - x, a.root.position.z - z);
      if (d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  // ---------- Effects ----------

  private shake(n: number) { if (!this.calm) { this.trauma = Math.min(1, this.trauma + n); this.punch = Math.max(this.punch, Math.min(1, n * 1.4)); } }
  private stop(n: number) { if (!this.calm) this.freeze = Math.max(this.freeze, n); }
  private ripple(sq: number, amp: number) {
    if (this.calm) return;
    this.ripples.push({ x: this.x(sq), z: this.z(sq), t0: this.t, amp });
    if (this.ripples.length > 6) this.ripples.shift();
  }
  private slowmo() { if (!this.calm) this.slow = FEEL.slow.time; }
  /** Knock the camera the way a blow went. */
  private jolt(dx: number, dz: number, n = 1) {
    if (this.calm) return;
    this.kick.vx += dx * FEEL.camera.kick * n * 14;
    this.kick.vz += dz * FEEL.camera.kick * n * 14;
  }
  /** The star of an impact: a white pop and streaks shooting out. */
  private spark(x: number, y: number, z: number, n = 1, color = 0xffffff) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new THREE.Mesh(this.gPuff, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.25);
    this.fxG.add(mesh);
    this.particles.push({ mesh, mat, size: 0.3 + 0.12 * n, vx: 0, vy: 0, vz: 0, t: 0, life: 0.13, grav: 0, grow: 2.4, spin: 0 });
    const count = 7 + n * 2;
    for (let i = 0; i < count && this.particles.length < 240; i++) {
      const m2 = new THREE.MeshBasicMaterial({ color, transparent: true });
      const st = new THREE.Mesh(this.gBox, m2);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5, up = (Math.random() - 0.2) * 0.9;
      const sp = 7 + Math.random() * 5 + n;
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = up * sp * 0.6;
      st.position.set(x, y, z);
      st.scale.set(0.035, 0.035, 0.42 + Math.random() * 0.3);
      st.lookAt(x + vx, y + vy, z + vz);
      this.fxG.add(st);
      this.particles.push({ mesh: st, mat: m2, size: 0, vx, vy, vz, t: 0, life: 0.12 + Math.random() * 0.08, grav: 0, grow: 0, spin: 0 });
    }
  }
  private flash(o: number, ms = 220) { if (!this.calm) this.flashEl.animate([{ opacity: o }, { opacity: 0 }], { duration: ms, easing: "ease-out" }); }

  private burst(x: number, y: number, z: number, color: number, count: number, speed: number, o: { size?: number; up?: number; life?: number; dir?: [number, number] } = {}) {
    for (let i = 0; i < count && this.particles.length < 220; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const mesh = new THREE.Mesh(this.gBox, mat);
      const size = (o.size ?? 0.09) * (0.6 + Math.random() * 0.9);
      mesh.scale.setScalar(size);
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const a = Math.random() * Math.PI * 2, sp = speed * (0.45 + Math.random() * 0.75);
      this.fxG.add(mesh);
      this.particles.push({
        mesh, mat, size,
        vx: Math.cos(a) * sp + (o.dir?.[0] ?? 0) * speed, vz: Math.sin(a) * sp + (o.dir?.[1] ?? 0) * speed,
        vy: (o.up ?? 4) * (0.5 + Math.random()),
        t: 0, life: (o.life ?? 0.7) * (0.7 + Math.random() * 0.6), grav: FEEL.gravity * 0.55, grow: 0, spin: 6 + Math.random() * 8,
      });
    }
  }

  private puff(x: number, z: number, count = 3, color = 0xffffff, y = 0.06) {
    for (let i = 0; i < count && this.particles.length < 220; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
      const mesh = new THREE.Mesh(this.gPuff, mat);
      const size = 0.12 + Math.random() * 0.1;
      mesh.scale.setScalar(size);
      mesh.position.set(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
      this.fxG.add(mesh);
      const a = Math.random() * 6.28;
      this.particles.push({ mesh, mat, size, vx: Math.cos(a) * 0.7, vz: Math.sin(a) * 0.7, vy: 0.5 + Math.random() * 0.5, t: 0, life: 0.35 + Math.random() * 0.25, grav: 0, grow: 1.8, spin: 0 });
    }
  }

  private ring(sq: number, color: number, r1 = 1.1, life = 0.45, r0 = 0.15) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.gRing, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.x(sq), 0.03, this.z(sq));
    mesh.scale.setScalar(r0);
    this.fxG.add(mesh);
    this.rings.push({ mesh, mat, t: 0, life, r0, r1 });
  }

  /** The white arc of the hero's kick. */
  private slash(hero: Actor, dx: number, dz: number) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(this.gArc, mat);
    mesh.position.set(hero.root.position.x + dx * 0.15, 0.42, hero.root.position.z + dz * 0.15);
    // Laid flat, with the middle of the arc pointing the way of the kick.
    mesh.rotation.order = "YXZ";
    mesh.rotation.set(-Math.PI / 2, Math.atan2(-dx, -dz) + Math.PI * 0.05, 0);
    mesh.scale.setScalar(0.55);
    this.fxG.add(mesh);
    this.rings.push({ mesh, mat, t: 0, life: 0.2, r0: 0.55, r1: 1.25 });
  }

  /** Words that pop out of a square. */
  private say(sq: number, text: string, color: string, k = 0, cls = "", lift = 0.9) {
    if (!text) return;
    const el = document.createElement("div");
    el.className = "s3-pin";
    el.innerHTML = `<span class="s3-float ${cls}" style="color:${color}">${esc(text)}</span>`;
    this.layer.append(el);
    this.floats.push({ el, pos: new THREE.Vector3(this.x(sq), lift + k * 0.34, this.z(sq)), until: this.t + 1.5 });
  }

  /** A piece leaves the board: knocked out in a shower of bits, or sent flying off the edge. */
  private leave(a: Actor, f: Fx) {
    if (!this.actors.has(a.key)) return;
    const p = a.root.position;
    if (f.t === "ringout") {
      const [dx, dz] = f.dir !== undefined ? DIRS[f.dir] : [0, -1];
      const d = Math.hypot(dx, dz) || 1;
      a.fly = { vx: (dx / d) * 8.5, vz: (dz / d) * 8.5, vy: 6.5, t: 0 };
      a.flash = 1;
      return;
    }
    if (f.t === "boom") {
      this.remove(a);
      return;
    }
    this.burst(p.x, a.h * 0.5, p.z, a.color, 16, 3.4, { size: 0.13, up: 5.5, life: 0.9 });
    this.burst(p.x, a.h * 0.5, p.z, 0xffffff, 6, 2.5, { size: 0.06 });
    this.remove(a);
  }

  private play(f: Fx, k: number) {
    if (this.dead) return;
    const S = FEEL.shake, T = FEEL.stop, R = FEEL.ripple;
    const x = this.x(f.sq), z = this.z(f.sq);
    const txt = FX_TEXT[f.t]?.(f);
    const big = f.t === "ko" || f.t === "ringout" || f.t === "fury" || f.t === "crit" || f.t === "boom" || f.t === "slam";
    if (txt && f.t !== "roll") this.say(f.sq, txt[0], txt[1], k, big ? "big" : f.t === "dmg" ? "dmg" : "");
    const hero = this.actors.get("hero")!;
    switch (f.t) {
      case "dmg": {
        const a = f.hero ? hero : this.at(f.sq);
        if (a) {
          a.flash = 1;
          a.flashColor = f.hero ? 0xff5a5a : 0xffffff;
          a.svy -= 9 + f.n * 2;
          // Rock away from whoever is closest to having done it: the hero, for enemies.
          const from = f.hero ? null : hero.root.position;
          const dx = from ? a.root.position.x - from.x : Math.random() - 0.5, dz = from ? a.root.position.z - from.z : 1;
          const d = Math.hypot(dx, dz) || 1;
          a.rvx += (dz / d) * (14 + f.n * 2);
          a.rvz += (dx / d) * -(14 + f.n * 2);
          this.jolt(dx / d, dz / d, f.hero ? 1.6 : 0.7 + f.n * 0.25);
          this.spark(a.root.position.x - (dx / d) * 0.25, a.h * 0.55, a.root.position.z - (dz / d) * 0.25, Math.min(4, f.n), f.hero ? 0xffb0b0 : 0xffffff);
          this.burst(x, 0.5, z, f.hero ? 0xff4b4b : 0xffc800, 6 + f.n * 3, 3.2, { size: 0.08, dir: [(dx / d) * 0.8, (dz / d) * 0.8] });
        } else this.burst(x, 0.5, z, 0xffc800, 6, 3, { size: 0.08 });
        if (!f.hero) this.flash(Math.min(0.3, 0.08 + f.n * 0.05), 140);
        this.shake(f.hero ? S.hero : S.hit + f.n * S.perDmg);
        this.stop(f.hero ? T.hero : T.hit + f.n * T.perDmg);
        this.ripple(f.sq, R.hit * Math.min(4, f.n));
        if (f.hero && !this.calm) this.hurtEl.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 520, easing: "ease-out" });
        break;
      }
      case "block": case "guard": case "parry": {
        const c = f.t === "parry" ? 0x58cc02 : 0x1cb0f6;
        this.ring(f.sq, c, 0.75, 0.35);
        this.burst(x, 0.5, z, c, 6, 2, { size: 0.06, up: 2.5 });
        const a = this.at(f.sq, true);
        if (a) { a.flash = 0.8; a.flashColor = c; a.svy += 3; }
        this.shake(0.12);
        break;
      }
      case "ko":
        this.cheer = 1;
        this.slowmo();
        this.spark(x, 0.5, z, 4, 0xfff0a0);
        this.ring(f.sq, 0xffc800, 1.5, 0.5);
        this.ring(f.sq, 0xffffff, 0.9, 0.3);
        this.shake(S.ko);
        this.stop(T.ko);
        this.ripple(f.sq, R.ko);
        this.flash(0.3);
        break;
      case "ringout":
        this.cheer = 1;
        this.slowmo();
        this.spark(x, 0.5, z, 4, 0xfff0a0);
        this.ring(f.sq, 0xffc800, 1.7, 0.55);
        this.puff(x, z, 5);
        this.shake(S.ko);
        this.stop(T.ko);
        this.flash(0.4);
        break;
      case "boom":
        this.slowmo();
        this.spark(x, 0.4, z, 6, 0xffe9a8);
        this.burst(x, 0.3, z, 0xff9600, 16, 5, { size: 0.14, up: 7, life: 0.9 });
        this.burst(x, 0.3, z, 0xffe14d, 12, 3.4, { size: 0.09, up: 5 });
        this.burst(x, 0.3, z, 0x3c3c3c, 8, 4, { size: 0.1, up: 6, life: 1 });
        this.puff(x, z, 8, 0xfff0c0, 0.3);
        this.ring(f.sq, 0xff9600, 2.2, 0.5);
        this.ring(f.sq, 0xffffff, 1.4, 0.3);
        this.blast.position.set(x, 1, z);
        this.blast.intensity = 60;
        this.shake(S.boom);
        this.stop(T.boom);
        this.ripple(f.sq, R.boom);
        this.flash(0.55, 260);
        break;
      case "slam":
        this.ring(f.sq, 0xff4b4b, 2.1, 0.55);
        this.ring(f.sq, 0xffffff, 1.3, 0.35);
        for (let i = 0; i < 8; i++) this.puff(x + Math.cos(i * 0.785) * 0.8, z + Math.sin(i * 0.785) * 0.8, 1, 0xe8dccb);
        this.shake(S.slam);
        this.stop(0.07);
        this.ripple(f.sq, R.slam);
        break;
      case "miss": case "stumble": {
        const a = this.at(f.sq);
        if (a) { a.rvz += 12; a.svy -= 3; }
        break;
      }
      case "dodge":
        hero.rvz += 14;
        hero.svy += 4;
        this.puff(x, z, 3);
        break;
      case "promote": case "summon": case "command": {
        this.ring(f.sq, 0xce82ff, 1.1, 0.5);
        this.burst(x, 0.4, z, 0xce82ff, 8, 2, { size: 0.06, up: 4 });
        const a = this.at(f.sq);
        if (a) { a.flash = 1; a.flashColor = 0xce82ff; a.svy += 5; }
        break;
      }
      case "castle":
        this.ring(f.sq, 0xffc800, 1.2, 0.5);
        break;
      case "react": {
        // A jab at you as you pass: the enemy on that square snaps toward you.
        const a = this.at(f.sq);
        if (a) {
          const dx = hero.root.position.x - a.root.position.x, dz = hero.root.position.z - a.root.position.z;
          const d = Math.hypot(dx, dz) || 1;
          a.lunge = { dx: dx / d, dz: dz / d, t: 0.04 };
          a.face = Math.atan2(dx, dz);
        }
        break;
      }
      case "gold":
        this.burst(x, 0.4, z, 0xffc800, Math.min(10, 3 + f.n), 1.6, { size: 0.08, up: 6.5, life: 0.9 });
        break;
      case "roll":
        this.roll(f.sq, f.n, f.ok === !!f.hero, k);
        break;
      case "fury": {
        const a = this.at(f.sq);
        if (a) { a.flash = 1.4; a.flashColor = 0xff2020; a.svy += 7; a.vy = 2.5; }
        this.ring(f.sq, 0xff4b4b, 1.4, 0.5);
        this.shake(0.3);
        break;
      }
      case "capture":
        this.ring(f.sq, 0x1cb0f6, 1.3, 0.45);
        this.shake(0.25);
        break;
      case "crit":
        this.ring(f.sq, 0xffc800, 1.9, 0.6);
        this.burst(x, 0.6, z, 0xffc800, 14, 3, { size: 0.07, up: 6 });
        this.flash(0.25);
        break;
      case "heal":
        this.burst(x, 0.2, z, 0x58cc02, 8, 0.6, { size: 0.06, up: 3.5, life: 0.9 });
        this.ring(f.sq, 0x58cc02, 0.8, 0.5);
        break;
      case "gate":
        if (f.open) { this.ring(f.sq, 0x58cc02, 1.6, 0.7); this.burst(x, 0.5, z, 0x58cc02, 12, 2.4, { up: 5 }); }
        break;
      case "lunge":
        this.puff(hero.root.position.x, hero.root.position.z, 2);
        break;
    }
  }

  /** A d20 tossed over the square: it tumbles, then shows what it rolled. */
  private roll(sq: number, n: number, good: boolean, k: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, flatShading: true });
    const mesh = new THREE.Mesh(this.gDie, mat);
    mesh.position.set(this.x(sq), 0.4, this.z(sq));
    mesh.castShadow = true;
    this.fxG.add(mesh);
    this.dice.push({ mesh, t: 0, ok: good });
    this.after(0.32, () => {
      mat.color.set(good ? 0x58cc02 : 0xff4b4b);
      this.say(sq, `${n}`, "#fff", k, "die", 1.36);
    });
  }

  // ---------- Markers on the floor (rebuilt whenever the props change) ----------

  private mark(geo: THREE.BufferGeometry, sq: number, color: number, opacity: number, y = 0.012, kind?: "tint" | "ring" | "dot") {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.x(sq), y, this.z(sq));
    mesh.userData.o = opacity;
    this.markG.add(mesh);
    if (kind) this.pulses.push({ mesh, kind });
    return mesh;
  }

  /** What the enemies are about to do (or would do after the combo being built). */
  private intents() {
    const p = this.p!;
    const s = p.fight;
    const q = p.preview ?? s;
    const live = q.status === "play" || q.status === "enemy" ? q.intents.filter((it, i) => intentValid(q, it) && (q.status !== "enemy" || i >= q.enemyStep)) : [];
    const badges = new Map<number, { ord: number; it: Intent; hit: number }>();
    const danger = new Map<number, number>();
    for (const it of live) {
      const u = q.units.find((x) => x.id === it.id)!;
      const m = it.type === "special" ? moveDef(it.move) : undefined;
      const hit = m ? (ATTACK_KINDS.has(m.kind) ? (m.damage !== undefined ? m.damage + (u.empower ?? 0) : unitHit(u)) : 0) : unitHit(u);
      badges.set(it.id, { ord: q.intents.indexOf(it) + 1, it, hit });
      const add = (sq: number) => danger.set(sq, (danger.get(sq) ?? 0) + hit);
      if (it.type === "special") { for (const sq of specialDanger(q, u, it)) if (!q.units.some((v) => v.sq === sq)) add(sq); continue; }
      if (it.type === "slam") { for (const sq of slamArea(q, it.center)) if (sq !== u.sq && !q.units.some((v) => v.sq === sq)) add(sq); continue; }
      const sq = it.type === "strike" ? it.target : it.type === "charge" ? chargeEnd(q, it) : null;
      if (sq !== null && sq !== undefined && (it.type === "strike" || occupant(q, sq))) add(sq);
    }
    return { badges, danger };
  }

  private buildMarkers() {
    const p = this.p!;
    const s = p.fight;
    const hl = p.hl ?? {};
    for (const o of [...this.markG.children, ...this.ghostG.children]) {
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        (m.material as THREE.Material).dispose();
        if (m.userData.own) m.geometry.dispose();
      });
    }
    this.markG.clear();
    this.ghostG.clear();
    this.pulses = [];
    const { danger } = this.intents();
    for (const sq of danger.keys()) this.mark(this.gQuad, sq, 0xff3b3b, 0.42, 0.012, "tint");
    for (const sq of hl.cover ?? []) this.mark(this.gQuad, sq, 0x1cb0f6, 0.28, 0.014);
    if (hl.inspect !== undefined) this.mark(this.gThin, hl.inspect, 0xffffff, 0.95, 0.02, "ring");
    for (const sq of hl.steps ?? []) this.mark(this.gDisc, sq, hl.danger?.get(sq) ? 0xff4b4b : 0x58cc02, 0.9, 0.02, "dot");
    const targets = new Set(hl.targets ?? []);
    for (const sq of targets) this.mark(this.gLoop, sq, 0xffc800, 1, 0.022, "ring");
    for (const sq of hl.captures ?? []) this.mark(this.gLoop, sq, 0x1cb0f6, 1, 0.022, "ring");
    if (hl.pending !== null && hl.pending !== undefined) this.mark(this.gQuad, hl.pending, 0xffc800, 0.5, 0.016);
    if (s.hop !== null && s.hop !== undefined) this.mark(this.gThin, s.hop, 0x58cc02, 0.9, 0.02, "ring");

    // The gate: two posts and a lintel on its square. Barred until the King drops the key.
    if (s.gate !== undefined) {
      const g = new THREE.Group();
      const c = s.gateOpen ? 0x58cc02 : 0x6b4a2f;
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, color = c) => {
        const m = new THREE.Mesh(this.gBox, new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: s.gateOpen ? 0x2f6e00 : 0, emissiveIntensity: 0.6 }));
        m.scale.set(w, h, d);
        m.position.set(x, y, z);
        m.castShadow = true;
        g.add(m);
      };
      box(0.1, 0.8, 0.1, -0.4, 0.4, 0.4);
      box(0.1, 0.8, 0.1, 0.4, 0.4, 0.4);
      box(0.96, 0.12, 0.14, 0, 0.84, 0.4);
      if (!s.gateOpen) for (const bx of [-0.2, 0, 0.2]) box(0.04, 0.74, 0.04, bx, 0.38, 0.4, 0x3c3c3c);
      g.position.set(this.x(s.gate), 0, this.z(s.gate));
      this.markG.add(g);
      if (s.gateOpen) this.mark(this.gQuad, s.gate, 0x58cc02, 0.45, 0.013, "tint");
    }

    // Preview: see-through copies where things will end up.
    const pv = p.preview;
    for (const a of this.actors.values()) a.doomed = a.key === "hero" ? s.status === "lost" : false;
    if (pv) {
      const ghost = (draw: Draw, sq: number, boss = false) => {
        const b = buildPiece(draw, { ghost: true, boss });
        b.g.traverse((c) => { c.userData.own = true; });
        b.g.position.set(this.x(sq), 0, this.z(sq));
        if (draw === "hero") b.g.rotation.y = Math.PI;
        this.ghostG.add(b.g);
      };
      for (const u of s.units) {
        const v = pv.units.find((x) => x.id === u.id);
        const a = this.actors.get(`u${u.id}`);
        if (!v) { if (a) a.doomed = true; continue; }
        if (v.sq !== u.sq) ghost(v.kind, v.sq, !!v.boss);
      }
      for (const t of s.things) {
        const v = pv.things.find((x) => x.id === t.id);
        const a = this.actors.get(`t${t.id}`);
        if (!v) { if (a) a.doomed = true; continue; }
        if (v.sq !== t.sq) ghost(t.kind, v.sq);
      }
      if (pv.hero.sq !== s.hero.sq) ghost("hero", pv.hero.sq);
    }
  }

  // ---------- Labels (plain HTML pinned to points in the scene) ----------

  private pin(sq: number, html: string, dx = 0, y = 0.02, dz = 0) {
    const el = document.createElement("div");
    el.className = "s3-pin";
    el.innerHTML = html;
    this.layer.append(el);
    this.pins.push({ el, pos: new THREE.Vector3(this.x(sq) + dx, y, this.z(sq) + dz) });
  }

  private buildLabels() {
    const p = this.p!;
    const s = p.fight;
    const hl = p.hl ?? {};
    for (const x of this.pins) x.el.remove();
    this.pins = [];
    const { badges, danger } = this.intents();
    const steps = new Set(hl.steps ?? []);
    const odds = hl.jab !== undefined ? `<i>${Math.round(hl.jab * 100)}%</i>` : "";

    // Board coordinates along the near and left edges.
    for (let i = 0; i < s.n; i++) {
      this.pin(i * s.n, `<span class="s3-coord">${s.n - i}</span>`, -0.66, -0.1);
      this.pin((s.n - 1) * s.n + i, `<span class="s3-coord">${"abcdefgh"[i]}</span>`, 0, -0.1, 0.66);
    }
    for (const [sq, n] of danger) if (!steps.has(sq)) this.pin(sq, `<span class="s3-num">${n}</span>`);
    for (const sq of steps) {
      const d = hl.danger?.get(sq);
      if (d) this.pin(sq, `<span class="s3-num risk">${d}${odds}</span>`);
    }
    for (const sq of hl.targets ?? []) {
      const d = hl.danger?.get(sq);
      if (d) this.pin(sq, `<span class="s3-num risk">-${d}${odds}</span>`);
    }
    for (const sq of hl.captures ?? []) this.pin(sq, `<span class="s3-chip" style="background:#1899d6">capture</span>`, 0, 0.02, 0.36);
    const byQ = new Map<number, number[]>();
    for (const c of hl.combo ?? []) byQ.set(c.sq, [...(byQ.get(c.sq) ?? []), c.n]);
    for (const [sq, ns] of byQ) this.pin(sq, `<span class="s3-chip q">${ns.join("·")}</span>`, -0.34, 0.02, -0.34);

    // Preview: what happens to each piece.
    const pv = p.preview;
    if (pv) {
      const tag = (sq: number, y: number, text: string, gone = false) => this.pin(sq, `<span class="s3-chip mark${gone ? " gone" : ""}">${text}</span>`, 0, y);
      for (const u of s.units) {
        const v = pv.units.find((x) => x.id === u.id);
        const top = (this.actors.get(`u${u.id}`)?.h ?? 0.8) + 0.5;
        if (!v) tag(u.sq, top, pv.fx.some((f) => f.t === "ringout" && f.id === u.id) ? "OFF" : "KO", true);
        else if (v.hp < u.hp) tag(u.sq, top, `-${u.hp - v.hp}`);
      }
      for (const t of s.things) if (!pv.things.some((x) => x.id === t.id)) tag(t.sq, 1, t.kind === "petasan" ? "BOOM" : "OFF", true);
      const hurt = s.hero.hp - pv.hero.hp;
      if (hurt > 0) tag(pv.hero.sq, 1.5, `-${hurt}`);
    }

    // Each enemy: what it will do over its head, its health at its feet.
    for (const a of this.actors.values()) {
      if (!a.head || !a.foot) continue;
      if (a.key === "hero") {
        const html = s.hero.block > 0 ? `<span class="s3-chip" style="background:#46a302">🛡 ${s.hero.block}</span>` : "";
        if (a.foot.innerHTML !== html) a.foot.innerHTML = html;
        continue;
      }
      const u = a.unit;
      if (!u) continue;
      const b = badges.get(u.id);
      let head = "";
      if (b) {
        const special = b.it.type === "special" ? moveDef(b.it.move) : undefined;
        const attack = b.it.type !== "move" && (!special || ATTACK_KINDS.has(special.kind));
        const icon = special ? `<path d="${SPECIAL_ICON[special.kind]}" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
          : b.it.type === "slam" ? `<path d="${SPECIAL_ICON.slam}" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`
          : b.it.type === "strike" ? `<path d="M5 1 V9 M1 5 H9" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`
          : `<path d="M5 9 V2 M2 4.5 L5 1.5 L8 4.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        head += `<span class="s3-chip intent" style="background:${attack ? "#ff4b4b" : special ? SPECIAL_COLOR[special.kind] : "#8c8c8c"}">${b.ord}<svg width="10" height="10" viewBox="0 0 10 10" style="transform:rotate(${this.angle(s, u, b.it)}deg)">${icon}</svg>${attack ? b.hit : ""}</span>`;
        // It turns to face what it's aiming at.
        const to = b.it.type === "strike" || (b.it.type === "special" && b.it.target !== undefined && ["kick", "pounce"].includes(special?.kind ?? "")) ? (b.it as { target: number }).target
          : b.it.type === "move" ? b.it.to : null;
        const dir = b.it.type === "charge" || (b.it.type === "special" && b.it.dir !== undefined) ? DIRS[(b.it as { dir: number }).dir] : null;
        if (!a.hop && !a.lunge) {
          if (dir) a.face = Math.atan2(dir[0], dir[1]);
          else if (to !== null && to !== u.sq) a.face = Math.atan2(this.x(to) - this.x(u.sq), this.z(to) - this.z(u.sq));
        }
      } else if (u.target) head += `<span class="s3-chip" style="background:#ffc800;color:#5c4200">★</span>`;
      if (u.empower) head += `<span class="s3-chip" style="background:#ce82ff">+${u.empower}</span>`;
      let foot = `<span class="s3-chip hp${u.boss ? " boss" : ""}">${u.hp}</span>`;
      if (u.block) foot += `<span class="s3-chip" style="background:#1899d6">${u.block}</span>`;
      if (isGuarded(s, u)) foot += `<span class="s3-chip" style="background:#1cb0f6" title="guarded">◆</span>`;
      if (u.traits?.length) foot += `<span class="s3-chip" style="background:#8a4fb5" title="${esc(u.traits.map((t) => `${TRAITS[t].name}: ${TRAITS[t].text}`).join("\n"))}">${esc(u.traits.map((t) => TRAITS[t].name[0]).join(""))}</span>`;
      if (a.head.innerHTML !== head) a.head.innerHTML = head;
      if (a.foot.innerHTML !== foot) a.foot.innerHTML = foot;
    }
  }

  private angle(s: Fight, u: { sq: number }, it: Intent) {
    const deg = (to: number) => Math.round((Math.atan2(this.z(to) - this.z(u.sq), this.x(to) - this.x(u.sq)) * 180) / Math.PI) + 90;
    if (it.type === "charge") return it.dir * 45;
    if (it.type === "slam") return 0;
    if (it.type === "special") {
      const kind = moveDef(it.move)?.kind;
      if (kind === "beam" && it.dir !== undefined) return it.dir * 45;
      if ((kind !== "kick" && kind !== "pounce") || it.target === undefined) return 0;
      return deg(it.target);
    }
    return deg(it.type === "move" ? it.to : it.target);
  }

  // ---------- The frame loop ----------

  private frame = (now: number) => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    const real = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // Hit-stop: the world holds still, the camera keeps shaking.
    let dt = real;
    if (this.freeze > 0) { this.freeze -= real; dt = 0; }
    else if (this.slow > 0) { this.slow -= real; dt *= FEEL.slow.speed; }
    this.t += dt;

    if (dt > 0) {
      for (let i = 0; i < this.queue.length; ) {
        if (this.queue[i].at <= this.t) { const q = this.queue.splice(i, 1)[0]; q.fn(); } else i++;
      }
      // Two half steps keep the stiff springs stable on slow frames.
      for (const a of [...this.actors.values()]) { this.step(a, dt / 2); this.step(a, dt / 2); }
      this.stepFx(dt);
    }
    for (const a of this.actors.values()) this.pose(a);

    // The floor.
    const lift = this.hover;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      t.position.y = t.userData.base + this.ground(t.position.x, t.position.z) + (i === lift ? 0.035 : 0);
    }
    // The sky drifts by; the crowd bobs, and jumps when something big happens.
    for (const c of this.clouds) {
      if (c.v) { c.g.position.x += c.v * real; if (c.g.position.x > 24) c.g.position.x = -24; }
      else c.g.position.y += Math.sin(now / 1400 + c.g.position.x) * 0.0012;
    }
    if (this.crowd) {
      this.cheer = Math.max(0, this.cheer - real * 0.9);
      const hype = Math.min(1, this.cheer + this.trauma);
      const m4 = new THREE.Matrix4();
      this.crowd.at.forEach((p, i) => {
        const jump = Math.abs(Math.sin(now / (150 - hype * 60) + p.ph));
        m4.makeTranslation(p.x, p.y + jump * (0.04 + hype * 0.38), p.z);
        this.crowd!.mesh.setMatrixAt(i, m4);
      });
      this.crowd.mesh.instanceMatrix.needsUpdate = true;
    }
    const pulse = Math.sin(now / 190);
    for (const m of this.pulses) {
      const mat = m.mesh.material as THREE.MeshBasicMaterial;
      if (m.kind === "tint") mat.opacity = m.mesh.userData.o * (0.78 + 0.22 * pulse);
      else m.mesh.scale.setScalar(m.kind === "dot" ? 1 + 0.1 * pulse : 1 + 0.05 * pulse);
    }

    // The camera: its resting place plus the shake.
    this.trauma = Math.max(0, this.trauma - real * FEEL.shake.decay);
    const k = this.trauma * this.trauma;
    const j = (seed: number) => Math.sin(now * 0.071 + seed * 12.9) * Math.sin(now * 0.113 + seed * 4.1);
    // A big hit pulls the camera in for a moment.
    this.punch *= Math.exp(-real * 6);
    const K = this.kick;
    K.vx += (-170 * K.x - 15 * K.vx) * real;
    K.vz += (-170 * K.z - 15 * K.vz) * real;
    K.x += K.vx * real;
    K.z += K.vz * real;
    const z = this.punch * FEEL.camera.punch;
    this.camera.position.set(
      this.camPos.x + K.x + (this.camAim.x - this.camPos.x) * z + j(1) * k * FEEL.shake.move,
      this.camPos.y + (this.camAim.y - this.camPos.y) * z + j(2) * k * FEEL.shake.move,
      this.camPos.z + K.z + (this.camAim.z - this.camPos.z) * z + j(3) * k * FEEL.shake.move * 0.5,
    );
    this.camera.lookAt(this.camAim.x + K.x * 0.6, 0, this.camAim.z + K.z * 0.6);
    this.camera.rotation.z += j(4) * k * FEEL.shake.roll;
    this.camera.updateMatrixWorld();
    this.blast.intensity *= Math.exp(-real * 9);

    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  };

  private step(a: Actor, dt: number) {
    const p = a.root.position;
    a.spawn = Math.min(1, a.spawn + dt * 5);
    if (a.fly) {
      // Off the edge: a spinning arc, then gone.
      a.fly.t += dt;
      a.fly.vy -= FEEL.gravity * 0.75 * dt;
      p.x += a.fly.vx * dt;
      p.z += a.fly.vz * dt;
      a.y += a.fly.vy * dt;
      a.rx += dt * 13;
      a.rz += dt * 7;
      if (a.fly.t > 1.3) this.remove(a);
      return;
    }
    if (a.hop) {
      a.hop.t += dt / FEEL.hop.time;
      const u = Math.min(1, a.hop.t);
      const e = u * u * (3 - 2 * u);
      p.x = a.hop.fx + (a.tx - a.hop.fx) * e;
      p.z = a.hop.fz + (a.tz - a.hop.fz) * e;
      a.y = Math.sin(u * Math.PI) * a.hop.h;
      if (u >= 1) {
        a.hop = null;
        a.y = 0;
        a.svy -= 7; // land: squash
        this.puff(p.x, p.z, 2);
        if (a.key === "hero" || a.boss) this.ripple(a.sq, FEEL.ripple.land * (a.boss ? 3 : 1));
      }
    } else {
      const ax = FEEL.slide.k * (a.tx - p.x) - FEEL.slide.c * a.vx;
      const az = FEEL.slide.k * (a.tz - p.z) - FEEL.slide.c * a.vz;
      a.vx += ax * dt;
      a.vz += az * dt;
      p.x += a.vx * dt;
      p.z += a.vz * dt;
      const sp = Math.hypot(a.vx, a.vz);
      if (sp > 4 && Math.random() < dt * 40) this.puff(p.x, p.z, 1);
      // Thrown into the air (a slam's jump, fury): fall back down.
      if (a.y > 0 || a.vy !== 0) {
        a.vy -= FEEL.gravity * dt;
        a.y += a.vy * dt;
        if (a.y <= 0) { a.y = 0; a.svy -= Math.min(10, -a.vy * 1.6); a.vy = 0; this.puff(p.x, p.z, 3); }
      }
    }
    // You won: the hero can't stand still.
    if (a.key === "hero" && this.p?.fight.status === "won" && !a.hop && a.y === 0 && a.vy === 0) { a.vy = 5; a.svy = 6; }
    if (a.lunge) {
      a.lunge.t += dt;
      if (a.lunge.t >= FEEL.lunge.time) a.lunge = null;
    }
    // Springs: height (squash) and tilt (lean).
    a.svy += (FEEL.squash.k * (1 - a.sy) - FEEL.squash.c * a.svy) * dt;
    a.sy = Math.max(0.45, Math.min(1.6, a.sy + a.svy * dt));
    a.rvx += (FEEL.tilt.k * ((a.doomed && a.key === "hero" ? 1.45 : 0) - a.rx) - FEEL.tilt.c * a.rvx) * dt;
    a.rvz += (FEEL.tilt.k * -a.rz - FEEL.tilt.c * a.rvz) * dt;
    a.rx += a.rvx * dt;
    a.rz += a.rvz * dt;
    a.flash = Math.max(0, a.flash - dt * 5.5);
  }

  /** Put the actor's springs and timers onto its meshes. */
  private pose(a: Actor) {
    const p = a.root.position;
    const idle = a.fly || a.draw === "batu" || a.draw === "petasan" ? 0 : Math.sin(this.t * (a.key === "hero" ? 3.2 : 2.2) + a.phase) * (a.key === "hero" ? 0.03 : 0.018);
    p.y = a.y + (a.fly ? 0 : Math.max(0, this.ground(p.x, p.z)));
    // Lunge: lean back, snap out, come home.
    let lx = 0, lz = 0;
    if (a.lunge) {
      const L = FEEL.lunge;
      const u = a.lunge.t;
      const reach = u < L.hit * 0.55 ? -L.back * (u / (L.hit * 0.55)) : u < L.hit ? -L.back + (L.reach + L.back) * ((u - L.hit * 0.55) / (L.hit * 0.45)) : L.reach * Math.pow(1 - (u - L.hit) / (L.time - L.hit), 2);
      lx = a.lunge.dx * reach;
      lz = a.lunge.dz * reach;
    }
    // Turn toward what it faces (the short way round).
    if (!a.fly) {
      let d = a.face - a.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.root.rotation.y += d * 0.22;
    }
    // The body lives in the root's turned space: bring world offsets and tilts into it.
    const c = Math.cos(a.root.rotation.y), sn = Math.sin(a.root.rotation.y);
    // Held in hit-stop, whatever was just struck rattles in place.
    const rattle = this.freeze > 0 && a.flash > 0.4 ? 0.11 : 0;
    a.body.position.set(lx * c - lz * sn + (Math.random() - 0.5) * rattle, 0, lx * sn + lz * c + (Math.random() - 0.5) * rattle);
    const sy = (a.sy + idle) * (0.3 + 0.7 * a.spawn);
    const sxz = (1 / Math.sqrt(Math.max(0.3, a.sy))) * (0.3 + 0.7 * a.spawn);
    a.body.scale.set(sxz, sy, sxz);
    // Lean into a slide.
    const leanX = a.rx + (a.hop ? 0 : a.vz * 0.035), leanZ = a.rz - (a.hop ? 0 : a.vx * 0.035);
    a.body.rotation.set(leanX * c + leanZ * sn, 0, -leanX * sn + leanZ * c);
    const doom = a.doomed && a.key !== "hero" ? 0.35 + 0.35 * Math.sin(this.t * 14) : 0;
    for (const m of a.mats) {
      m.emissive.set(doom > 0 && a.flash < doom ? 0xff3b3b : a.flashColor);
      m.emissiveIntensity = Math.max(doom, Math.min(1, a.flash) * 1.4);
    }
  }

  private stepFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.t += dt;
      const m = q.mesh;
      if (q.t >= q.life) {
        this.fxG.remove(m);
        q.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      q.vy -= q.grav * dt;
      m.position.x += q.vx * dt;
      m.position.y += q.vy * dt;
      m.position.z += q.vz * dt;
      const onBoard = Math.abs(m.position.x) < this.n / 2 + 0.25 && Math.abs(m.position.z) < this.n / 2 + 0.25;
      const floor = onBoard ? 0.04 : -0.46;
      if (q.grav && m.position.y < floor && m.position.y > floor - 0.5 && (onBoard || Math.hypot(m.position.x, m.position.z) < this.isle)) {
        // Bits bounce on the board and the grass around it (and fall past the island's edge).
        m.position.y = floor;
        q.vy = Math.abs(q.vy) * 0.42;
        q.vx *= 0.7;
        q.vz *= 0.7;
      }
      m.rotation.x += q.spin * dt;
      m.rotation.z += q.spin * 0.7 * dt;
      const u = q.t / q.life;
      if (!q.size) { q.mat.opacity = 1 - u; m.scale.z *= 1 - 3 * dt; }
      else if (q.grow) { m.scale.setScalar(q.size * (1 + q.grow * u)); q.mat.opacity = 0.55 * (1 - u); }
      else { m.scale.setScalar(q.size * (u > 0.7 ? (1 - u) / 0.3 : 1)); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const u = r.t / r.life;
      if (u >= 1) {
        this.fxG.remove(r.mesh);
        r.mat.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - u, 3);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      r.mat.opacity = 1 - u * u;
    }
    for (let i = this.dice.length - 1; i >= 0; i--) {
      const d = this.dice[i];
      d.t += dt;
      const u = Math.min(1, d.t / 0.32);
      d.mesh.position.y = 0.4 + Math.sin(u * Math.PI * 0.5) * 0.95;
      if (u < 1) { d.mesh.rotation.x += dt * 22; d.mesh.rotation.y += dt * 15; }
      const out = (d.t - 0.95) / 0.25;
      if (out > 0) d.mesh.scale.setScalar(Math.max(0.001, 1 - out));
      if (out >= 1) {
        this.fxG.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        this.dice.splice(i, 1);
      }
    }
    while (this.ripples.length && this.t - this.ripples[0].t0 > 2.2) this.ripples.shift();
  }

  private placeLabels() {
    const o = { x: 0, y: 0 };
    const put = (el: HTMLElement, pos: THREE.Vector3) => {
      this.project(pos, o);
      el.style.transform = `translate(${o.x.toFixed(1)}px,${o.y.toFixed(1)}px)`;
    };
    const v = new THREE.Vector3();
    for (const a of this.actors.values()) {
      if (!a.head || !a.foot) continue;
      const p = a.root.position;
      put(a.head, v.set(p.x, p.y + a.h * a.sy + 0.16, p.z));
      put(a.foot, v.set(p.x + 0.34, Math.max(0, p.y - a.y) + 0.02, p.z + 0.4));
    }
    for (const x of this.pins) put(x.el, x.pos);
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const x = this.floats[i];
      if (this.t > x.until!) { x.el.remove(); this.floats.splice(i, 1); } else put(x.el, x.pos);
    }
  }
}
