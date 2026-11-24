#!/usr/bin/env node
/**
 * Renders 24 unique, expressive 3D Toybox Vinyl character portraits (512x512 PNG)
 * into public/faceoff/<id>.png using Three.js PBR + RoomEnvironment via local headless Chrome.
 *
 * Strictly enforces every gameplay trait in convex/lib/faceoff/roster.ts
 * (hair color, baldness, longHair, shirt color, glasses, hat, beard, earrings, freckles)
 * while giving every character distinct facial proportions, hairstyles, hat styles,
 * glasses shapes, expressions, skin tones, and poses!
 *
 * Usage: node scripts/mascot/render-faceoff-portraits.mjs
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public/faceoff");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

fs.mkdirSync(OUT_DIR, { recursive: true });

// Exact roster mirrored from convex/lib/faceoff/roster.ts
const ROWS = [
  ["Ayu", "black", "red", "G E L"],
  ["Budi", "black", "blue", "H B"],
  ["Citra", "brown", "green", "E F L"],
  ["Dewi", "blonde", "yellow", "G H L"],
  ["Eko", "bald", "red", "G B"],
  ["Fajar", "red", "blue", "F"],
  ["Gita", "white", "green", "H E L"],
  ["Hana", "black", "yellow", "F L"],
  ["Iwan", "brown", "red", "G B F"],
  ["Joko", "white", "blue", "G B"],
  ["Kiki", "red", "yellow", "H E F L"],
  ["Lala", "blonde", "green", "E"],
  ["Maya", "brown", "blue", "G L"],
  ["Nina", "black", "green", "H F"],
  ["Omar", "bald", "yellow", "H B E"],
  ["Putu", "black", "red", ""],
  ["Rina", "blonde", "blue", "E F L"],
  ["Sari", "red", "red", "G L"],
  ["Tono", "brown", "yellow", "H B"],
  ["Udin", "bald", "green", "F"],
  ["Vina", "white", "yellow", "G E"],
  ["Wayan", "blonde", "red", "H B"],
  ["Yogi", "black", "blue", "E"],
  ["Zara", "brown", "green", "G H E L"],
];

const CHARACTERS = ROWS.map(([name, hair, shirt, flags], index) => {
  const f = new Set(flags ? flags.split(" ") : []);
  return {
    index,
    id: name.toLowerCase(),
    name,
    hair,
    shirt,
    glasses: f.has("G"),
    hat: f.has("H"),
    beard: f.has("B"),
    earrings: f.has("E"),
    freckles: f.has("F"),
    longHair: f.has("L"),
    flags,
  };
});

const RENDER_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;background:#000">
<canvas id="c" width="512" height="512"></canvas>
<script type="importmap">
{
  "imports": {
    "three": "/three/build/three.module.js",
    "three/addons/": "/three/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const CHARACTERS = ${JSON.stringify(CHARACTERS)};

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(512, 512, false);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const matVinyl = (color, roughness = 0.46, extra = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.0,
    clearcoat: 0.14,
    clearcoatRoughness: 0.4,
    ...extra,
  });

const matGloss = (color, roughness = 0.16, extra = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.05,
    clearcoat: 0.65,
    clearcoatRoughness: 0.14,
    ...extra,
  });

const matMetal = (color, roughness = 0.22) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.78,
    clearcoat: 0.4,
  });

// High-contrast, unmistakable trait palettes (clearly readable even at 55px!)
const HAIR_COL = {
  black: 0x221d2a,
  brown: 0x7b4724,
  blonde: 0xf6c945,
  red: 0xd94e22,
  white: 0xf2f0ee,
  bald: 0x4b352a, // beard color for bald bearded characters (Eko, Omar)
};

const SHIRT_COL = {
  red: { main: 0xf03d4e, trim: 0xb92131 },
  blue: { main: 0x1d9bf0, trim: 0x0f6ab5 },
  green: { main: 0x24bc65, trim: 0x138544 },
  yellow: { main: 0xffc01e, trim: 0xd98f00 },
};

const SKINS = [0xf8d5b8, 0xe8b58f, 0xc98c62, 0x996140, 0xf2c49b, 0xb87852, 0xfce0c8, 0x7d4c32];
const BACKDROPS = [
  ["#fff6e6", "#f2dfbe"],
  ["#e8f6ff", "#c7e7ff"],
  ["#eefaf1", "#ccefd7"],
  ["#f5eeff", "#dfd0ff"],
  ["#fff0f4", "#ffd4e0"],
  ["#fff8e1", "#fae5a5"],
];
const HAT_COLS = [0x4c3b6b, 0x2e6f95, 0x8d4a6e, 0x3b6e5c, 0x5c4638, 0x7c54b8, 0x3a4e73, 0xb85340];
const GLASSES_COLS = [0x2a2033, 0x6b3a24, 0x1e4d7a, 0x8a2848, 0xd49c24, 0x265c4a];
const IRIS_COLS = [0x2d1f2e, 0x4b301c, 0x1d6ea8, 0x257850, 0x8c5618];

// Deterministic PRNG per character so traits + quirks are richly varied and repeatable
function makeRng(seed) {
  let s = (seed * 2654435761 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pick(arr, r) {
  return arr[Math.floor(r() * arr.length)];
}

function makeBackdrop(topHex, botHex) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 512;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(256, 200, 30, 256, 256, 360);
  g.addColorStop(0, topHex);
  g.addColorStop(1, botHex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // Subtle polka/halo ring
  ctx.beginPath();
  ctx.arc(256, 240, 195, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.30)";
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCharacter(c) {
  const r = makeRng(c.index + 17);
  // Pick a backdrop that contrasts strongly with hair & shirt
  let bgIdx = (c.index * 5 + 1) % BACKDROPS.length;
  if (c.hair === "white" && bgIdx === 0) bgIdx = 1;
  if (c.shirt === "yellow" && (bgIdx === 5 || bgIdx === 0)) bgIdx = 3;
  if (c.shirt === "blue" && bgIdx === 1) bgIdx = 0;
  if (c.shirt === "green" && bgIdx === 2) bgIdx = 4;
  if (c.shirt === "red" && bgIdx === 4) bgIdx = 1;
  const [bgTop, bgBot] = BACKDROPS[bgIdx];

  const scene = new THREE.Scene();
  scene.background = makeBackdrop(bgTop, bgBot);
  scene.environment = envTex;
  scene.environmentIntensity = 0.62;

  const key = new THREE.DirectionalLight(0xfff9f2, 1.5);
  key.position.set(-2.6, 4.4, 4.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffe8d2, 0.58);
  fill.position.set(3.2, 1.6, 3.0);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xd9f2ff, 0.78);
  rim.position.set(0.2, 2.8, -3.8);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a3556, 0.56));

  const root = new THREE.Group();
  root.position.set(0, -0.18, 0);
  // Playful subtle character head turn & tilt unique to each figure
  root.rotation.y = (r() - 0.5) * 0.34;
  root.rotation.z = (r() - 0.5) * 0.08;
  scene.add(root);

  let skinHex = SKINS[(c.index * 3 + Math.floor(r() * 2)) % SKINS.length];
  // Guarantee clear contrast between brown hair/beard and skin tone
  if (c.hair === "brown" && (skinHex === 0x996140 || skinHex === 0x7d4c32 || skinHex === 0xb87852)) {
    skinHex = 0xf2c49b;
  }
  const skinMat = matVinyl(skinHex, 0.44);
  const hairCol = c.hair === "white" ? 0xe8eaf2 : HAIR_COL[c.hair];
  const hairMat = matVinyl(hairCol, c.hair === "white" ? 0.38 : 0.48);
  const shirtPalette = SHIRT_COL[c.shirt];
  const shirtMat = matVinyl(shirtPalette.main, 0.46);
  const trimMat = matVinyl(shirtPalette.trim, 0.42);

  // ---- Unique character proportions ----
  const headW = 0.90 + r() * 0.14;   // 0.90..1.04
  const headH = 0.96 + r() * 0.14;   // 0.96..1.10
  const headD = 0.88 + r() * 0.10;
  const faceShape = c.index % 4;     // 0 round, 1 oval, 2 squarish, 3 cute chubby-cheek
  const shirtStyle = c.index % 4;    // 0 crew collar, 1 v-neck/polo, 2 hoodie collar, 3 striped/pocket
  const eyeStyle = c.index % 5;      // 0 classic glossy, 1 big sparkle, 2 cheeky wink, 3 cool lidded, 4 happy squint
  const mouthStyle = (c.index * 3 + 1) % 5; // 0 big grin, 1 warm smile, 2 smirk, 3 open laugh, 4 cute 'o'
  const noseStyle = c.index % 3;     // 0 button, 1 round, 2 sculpted
  const hairVariant = c.index % 4;   // 4 distinct short styles & 4 distinct long styles!
  const hatStyle = c.index % 4;      // 0 beanie, 1 baseball cap, 2 beret, 3 bucket/fedora
  const glassesStyle = c.index % 3;  // 0 round, 1 chunky square, 2 cat-eye
  const beardStyle = c.index % 3;    // 0 full rounded beard, 1 goatee + mustache, 2 boxy beard + mustache
  const earringStyle = c.index % 3;  // 0 gold hoops, 1 bright pearl drops, 2 star studs

  // ================= 1. TORSO & SHIRT =================
  const torso = new THREE.Group();
  torso.position.y = -0.92;
  root.add(torso);

  const shoulderGeo = new THREE.SphereGeometry(0.92, 32, 24);
  const shoulders = new THREE.Mesh(shoulderGeo, shirtMat);
  shoulders.scale.set(1.06, 0.78, 0.68);
  shoulders.position.y = -0.22;
  torso.add(shoulders);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.48, 22), skinMat);
  neck.position.y = 0.36;
  torso.add(neck);

  // Shirt collar / unique neckline details (always preserving clear shirt color)
  if (shirtStyle === 0) {
    const col = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.075, 14, 28), trimMat);
    col.rotation.x = Math.PI / 2;
    col.position.set(0, 0.26, 0.04);
    torso.add(col);
  } else if (shirtStyle === 1) {
    // Crisp white inner tee + collar lapels
    const tee = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), matVinyl(0xfffdf8, 0.5));
    tee.scale.set(1.1, 0.7, 0.6);
    tee.position.set(0, 0.22, 0.26);
    const lapL = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.16, 0.12, 3, 0.04), trimMat);
    lapL.position.set(-0.24, 0.24, 0.28); lapL.rotation.set(0.2, 0.3, -0.35);
    const lapR = lapL.clone(); lapR.position.x = 0.24; lapR.rotation.set(0.2, -0.3, 0.35);
    torso.add(tee, lapL, lapR);
  } else if (shirtStyle === 2) {
    // Cozy hoodie collar + drawstrings
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.12, 16, 28), trimMat);
    hood.rotation.x = Math.PI / 2 + 0.18;
    hood.position.set(0, 0.22, -0.02);
    const sGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.34, 10);
    const sMat = matVinyl(0xfffdf8, 0.5);
    const sL = new THREE.Mesh(sGeo, sMat); sL.position.set(-0.14, 0.02, 0.52);
    const sR = new THREE.Mesh(sGeo, sMat); sR.position.set(0.14, 0.02, 0.52);
    torso.add(hood, sL, sR);
  } else {
    // Ribbed sweater stripe + cute gold button
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.06, 12, 32), trimMat);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, -0.14, 0.04);
    const col = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.065, 14, 24), trimMat);
    col.rotation.x = Math.PI / 2;
    col.position.set(0, 0.26, 0.04);
    torso.add(band, col);
  }

  // ================= 2. HEAD & EARS =================
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.16;
  root.add(headGroup);

  let headMesh;
  if (faceShape === 2) {
    headMesh = new THREE.Mesh(new RoundedBoxGeometry(1.42 * headW, 1.54 * headH, 1.38 * headD, 7, 0.52), skinMat);
  } else {
    headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.84, 36, 28), skinMat);
    headMesh.scale.set(headW, headH, headD);
    if (faceShape === 3) {
      // Soft chubby cheeks
      const cheekGeo = new THREE.SphereGeometry(0.32, 20, 16);
      const cL = new THREE.Mesh(cheekGeo, skinMat); cL.position.set(-0.52 * headW, -0.18, 0.34);
      const cR = cL.clone(); cR.position.x = 0.52 * headW;
      headGroup.add(cL, cR);
    }
  }
  headGroup.add(headMesh);

  // Ears (slightly forward so earrings always sparkle clearly even with long hair)
  const earX = (faceShape === 2 ? 0.72 : 0.80) * headW;
  const earGeo = new THREE.SphereGeometry(0.19, 20, 16);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.scale.set(0.62, 1.08, 0.78);
  earL.position.set(-earX, -0.04, 0.06);
  const earR = earL.clone();
  earR.position.x = earX;
  headGroup.add(earL, earR);

  // ================= 3. EARRINGS (E) — super clear & chunky in front of hair =================
  if (c.earrings) {
    const goldMat = matMetal(0xffc93c, 0.16);
    const pearlMat = matGloss(0xfff6f0, 0.10);
    const coralMat = matGloss(0xff4d6d, 0.16);
    for (const side of [-1, 1]) {
      const ex = side * (earX + 0.09);
      const ez = c.longHair ? 0.24 : 0.12;
      if (earringStyle === 0) {
        // Bold golden vinyl hoops
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.042, 12, 24), goldMat);
        hoop.position.set(ex, -0.24, ez);
        hoop.rotation.y = side * 0.22;
        headGroup.add(hoop);
      } else if (earringStyle === 1) {
        // Gold stud + chunky pearl drop
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), goldMat);
        stud.position.set(ex, -0.15, ez);
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), pearlMat);
        drop.position.set(ex, -0.31, ez);
        headGroup.add(stud, drop);
      } else {
        // Sparkling gold + coral drop earrings
        const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), goldMat);
        top.position.set(ex, -0.22, ez);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), coralMat);
        gem.position.set(ex, -0.36, ez);
        headGroup.add(top, gem);
      }
    }
  }

  // ================= 4. HAIR (bald / short / long + high bangs that NEVER cover eyes!) =================
  const hairTopY = (faceShape === 2 ? 0.74 : 0.78) * headH;
  if (c.hair === "bald") {
    if (!c.hat) {
      const shine = new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 }),
      );
      shine.scale.set(1.25, 0.25, 0.7);
      shine.position.set(-0.24, hairTopY - 0.04, 0.34);
      shine.rotation.set(0.45, 0.2, 0.35);
      headGroup.add(shine);
    }
  } else {
    // --- LONG HAIR flowing cleanly behind & beside shoulders ---
    if (c.longHair) {
      const backHair = new THREE.Mesh(new RoundedBoxGeometry(1.86 * headW, 1.92, 0.88, 6, 0.42), hairMat);
      backHair.position.set(0, -0.44, -0.44);
      headGroup.add(backHair);

      for (const side of [-1, 1]) {
        if (hairVariant % 2 === 0) {
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * (earX + 0.04), 0.56, -0.10),
            new THREE.Vector3(side * (earX + 0.18), 0.06, -0.12),
            new THREE.Vector3(side * (earX + 0.14), -0.58, -0.04),
            new THREE.Vector3(side * (earX + 0.22), -1.10, -0.02),
          ]);
          const lock = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.22, 14, false), hairMat);
          headGroup.add(lock);
        } else {
          for (let b = 0; b < 4; b++) {
            const puff = new THREE.Mesh(new THREE.SphereGeometry(0.24 - b * 0.012, 18, 14), hairMat);
            puff.position.set(side * (earX + 0.14 + (b % 2) * 0.05), 0.26 - b * 0.38, -0.08 + b * 0.02);
            headGroup.add(puff);
          }
        }
      }
    }

    // --- CROWN & BANGS (tilted back so eyes & brows stay 100% open & bright!) ---
    if (!c.hat) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.86, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.44), hairMat);
      cap.scale.set(headW * 1.03, headH * 1.02, headD * 1.04);
      cap.position.set(0, 0.14, -0.05);
      cap.rotation.x = -0.26;
      headGroup.add(cap);

      if (hairVariant === 0) {
        // High swoopy side-swept Toybox vinyl bangs (clear of brows!)
        const bang1 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 16), hairMat);
        bang1.scale.set(1.42, 0.46, 0.78);
        bang1.position.set(-0.22, hairTopY - 0.08, 0.36);
        bang1.rotation.z = -0.18;
        const bang2 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), hairMat);
        bang2.scale.set(1.18, 0.44, 0.74);
        bang2.position.set(0.36, hairTopY - 0.12, 0.34);
        bang2.rotation.z = 0.22;
        headGroup.add(bang1, bang2);
      } else if (hairVariant === 1) {
        // Fluffy curly cloud crown sitting proudly on top!
        for (let i = 0; i < 7; i++) {
          const a = -1.25 + (i / 6) * 2.5;
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.25 + (i % 2) * 0.05, 18, 14), hairMat);
          puff.position.set(Math.sin(a) * 0.64 * headW, hairTopY + 0.04 + Math.cos(a) * 0.12, Math.cos(a) * 0.34 - 0.04);
          headGroup.add(puff);
        }
      } else if (hairVariant === 2) {
        // Playful tall quiff + top bun / tuft
        const quiff = new THREE.Mesh(new THREE.SphereGeometry(0.38, 22, 16), hairMat);
        quiff.scale.set(1.28, 0.68, 1.02);
        quiff.position.set(-0.04, hairTopY + 0.12, 0.22);
        quiff.rotation.set(-0.20, 0.08, 0.14);
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), hairMat);
        tuft.position.set(0.28, hairTopY + 0.16, 0.16);
        headGroup.add(quiff, tuft);
      } else {
        // High neat bangs + cute twin buns if longHair
        const fringe = new THREE.Mesh(new RoundedBoxGeometry(1.18 * headW, 0.22, 0.46, 4, 0.10), hairMat);
        fringe.position.set(0, hairTopY - 0.10, 0.40);
        headGroup.add(fringe);
        if (c.longHair) {
          for (const side of [-1, 1]) {
            const bun = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), hairMat);
            bun.position.set(side * 0.66, hairTopY + 0.14, -0.06);
            headGroup.add(bun);
          }
        }
      }
    } else {
      // Wearing a hat: visible hair fringe peeking cleanly ABOVE the brows + sideburns!
      const peek = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), hairMat);
      peek.scale.set(1.65 * headW, 0.40, 0.72);
      peek.position.set(0, hairTopY - 0.16, 0.38);
      headGroup.add(peek);
      for (const side of [-1, 1]) {
        const sb = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), hairMat);
        sb.scale.set(0.72, 1.32, 0.85);
        sb.position.set(side * (earX - 0.02), 0.22, 0.14);
        headGroup.add(sb);
      }
    }
  }

  // ================= 5. HAT (H) — 4 playful Toybox styles sitting cleanly high =================
  if (c.hat) {
    const hatCol = HAT_COLS[c.index % HAT_COLS.length];
    const hatMat = matVinyl(hatCol, 0.44);
    const hatAcc = matGloss(0xffbe3b, 0.26);
    const hatG = new THREE.Group();
    hatG.position.set(0, hairTopY + 0.04, -0.02);
    hatG.rotation.z = (r() - 0.5) * 0.12;
    headGroup.add(hatG);

    if (hatStyle === 0) {
      // Cozy ribbed beanie with pom-pom!
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.84 * headW, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), hatMat);
      dome.position.y = -0.14;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.80 * headW, 0.13, 14, 32), matVinyl(hatCol, 0.52));
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.12;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), hatAcc);
      pom.position.y = 0.72 * headW;
      hatG.add(dome, cuff, pom);
    } else if (hatStyle === 1) {
      // Sporty baseball cap with crisp bold front visor!
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.82 * headW, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.50), hatMat);
      crown.position.y = -0.12;
      const visor = new THREE.Mesh(new RoundedBoxGeometry(1.18 * headW, 0.09, 0.72, 4, 0.04), matVinyl(0x2d2438, 0.36));
      visor.position.set(0, -0.11, 0.56);
      visor.rotation.x = 0.12;
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), hatAcc);
      btn.position.y = 0.68 * headW;
      hatG.add(crown, visor, btn);
    } else if (hatStyle === 2) {
      // Artistic tilted French beret with stem
      const beret = new THREE.Mesh(new THREE.SphereGeometry(0.90 * headW, 28, 20), hatMat);
      beret.scale.set(1.10, 0.40, 1.04);
      beret.position.set(0.10, 0.16, -0.02);
      beret.rotation.z = -0.20;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.18, 10), hatMat);
      stem.position.set(0.16, 0.48, -0.02);
      stem.rotation.z = -0.20;
      hatG.add(beret, stem);
    } else {
      // Stylish wide-brim explorer / sun hat with gold band
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.16 * headW, 1.22 * headW, 0.09, 36), hatMat);
      brim.position.y = -0.08;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.64 * headW, 0.78 * headW, 0.58, 32), hatMat);
      crown.position.y = 0.24;
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.77 * headW, 0.79 * headW, 0.12, 32), hatAcc);
      ribbon.position.y = 0.02;
      hatG.add(brim, crown, ribbon);
    }
  }

  // ================= 6. FACE FEATURES (Eyes, Brows, Nose, Blush, Freckles, Mouth, Beard, Glasses) =================
  const faceZ = (faceShape === 2 ? 0.69 : 0.78) * headD;
  const eyeY = 0.05;
  const eyeX = 0.30 * headW;

  // Soft vinyl cheek blush
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7b89, transparent: true, opacity: 0.30 });
  for (const side of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), blushMat);
    bl.scale.set(1.1, 0.65, 0.3);
    bl.position.set(side * (eyeX + 0.14), -0.16, faceZ - 0.10);
    headGroup.add(bl);
  }

  // Eyes (5 distinct charming Toybox Vinyl eye personalities!)
  const whiteMat = matGloss(0xffffff, 0.10);
  const irisMat = matGloss(IRIS_COLS[c.index % IRIS_COLS.length], 0.12);
  const darkMat = matGloss(0x1f1724, 0.08);

  for (const side of [-1, 1]) {
    const isWink = eyeStyle === 2 && side === 1;
    const isHappyArc = eyeStyle === 4;
    if (isWink || isHappyArc) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.032, 10, 18, Math.PI), darkMat);
      arc.position.set(side * eyeX, eyeY - 0.02, faceZ + 0.01);
      headGroup.add(arc);
    } else {
      const rEye = eyeStyle === 1 ? 0.145 : 0.125;
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(rEye, 20, 16), whiteMat);
      sclera.scale.set(1, 1.06, 0.62);
      sclera.position.set(side * eyeX, eyeY, faceZ - 0.02);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(rEye * 0.68, 18, 14), irisMat);
      iris.scale.set(1, 1.04, 0.55);
      iris.position.set(side * eyeX, eyeY, faceZ + rEye * 0.36);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(rEye * 0.42, 14, 10), darkMat);
      pupil.position.set(side * eyeX, eyeY, faceZ + rEye * 0.60);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(rEye * 0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(side * eyeX - 0.035, eyeY + 0.042, faceZ + rEye * 0.80);
      headGroup.add(sclera, iris, pupil, glint);

      if (eyeStyle === 3) {
        // Cool half-eyelid
        const lid = new THREE.Mesh(new THREE.SphereGeometry(rEye * 1.06, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), skinMat);
        lid.position.set(side * eyeX, eyeY + 0.02, faceZ - 0.01);
        headGroup.add(lid);
      }
    }

    // Expressive eyebrows
    const browCol = c.hair === "bald" ? 0x4b352a : HAIR_COL[c.hair];
    const browMat = matVinyl(browCol, 0.5);
    const brow = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.065, 0.06, 3, 0.028), browMat);
    brow.position.set(side * eyeX, eyeY + 0.23, faceZ - 0.02);
    brow.rotation.z = side * (eyeStyle === 3 ? -0.06 : 0.14);
    headGroup.add(brow);
  }

  // Unique nose
  const noseMat = matVinyl(new THREE.Color(skinHex).multiplyScalar(0.93), 0.42);
  if (noseStyle === 0) {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 12), noseMat);
    nose.position.set(0, -0.08, faceZ + 0.08);
    headGroup.add(nose);
  } else if (noseStyle === 1) {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), noseMat);
    nose.scale.set(1.15, 0.85, 0.95);
    nose.position.set(0, -0.10, faceZ + 0.09);
    headGroup.add(nose);
  } else {
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.20, 14), noseMat);
    nose.rotation.x = Math.PI * 0.42;
    nose.position.set(0, -0.08, faceZ + 0.10);
    headGroup.add(nose);
  }

  // ================= 7. FRECKLES (F) — crisp & super visible across cheeks & nose =================
  if (c.freckles) {
    const frekMat = matVinyl(0x8c441e, 0.55);
    const frekGeo = new THREE.SphereGeometry(0.032, 10, 8);
    const pts = [
      [-0.44, -0.12], [-0.36, -0.17], [-0.48, -0.21], [-0.29, -0.13],
      [0.44, -0.12],  [0.36, -0.17],  [0.48, -0.21],  [0.29, -0.13],
      [-0.08, -0.04], [0.08, -0.04],
    ];
    for (const [fx, fy] of pts) {
      const f = new THREE.Mesh(frekGeo, frekMat);
      const zCurve = Math.sqrt(Math.max(0.2, 1 - (fx * fx) / (headW * headW) - (fy * fy) / (headH * headH)));
      f.position.set(fx * headW, fy, zCurve * faceZ + 0.02);
      headGroup.add(f);
    }
  }

  // ================= 8. BEARD (B) — bold sculpted vinyl beard strictly below nose/cheeks =================
  if (c.beard) {
    const beardMat = matVinyl(hairCol, 0.5);
    if (beardStyle === 0) {
      // Full lush rounded vinyl beard wrapping lower jaw cleanly below eyes & nose
      const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.84, 28, 20, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), beardMat);
      jaw.scale.set(headW * 1.03, headH * 1.04, headD * 1.05);
      jaw.position.set(0, -0.06, 0.06);
      headGroup.add(jaw);
    } else if (beardStyle === 1) {
      // Sculpted goatee + chunky handlebar mustache
      const chin = new THREE.Mesh(new THREE.SphereGeometry(0.40, 22, 16), beardMat);
      chin.scale.set(1.15, 0.92, 0.85);
      chin.position.set(0, -0.54, faceZ - 0.14);
      headGroup.add(chin);
    } else {
      // Bold boxy beard wrapping jaw + chin
      const box = new THREE.Mesh(new RoundedBoxGeometry(1.32 * headW, 0.56, 0.92, 5, 0.24), beardMat);
      box.position.set(0, -0.52, 0.18);
      headGroup.add(box);
    }
    // Chunky sculpted mustache on every bearded character so beard reads unmistakably at 55px!
    for (const side of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), beardMat);
      st.scale.set(1.42, 0.58, 0.70);
      st.position.set(side * 0.17, -0.23, faceZ + 0.06);
      st.rotation.z = side * -0.26;
      headGroup.add(st);
    }
  }

  // ================= 9. MOUTH / EXPRESSION =================
  const mouthY = c.beard ? -0.34 : -0.31;
  const mouthZ = faceZ + (c.beard ? 0.08 : 0.02);
  const mouthMat = matGloss(0x522130, 0.25);

  if (mouthStyle === 0 || mouthStyle === 3) {
    // Joyful open grin with bright white teeth!
    const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), mouthMat);
    cavity.scale.set(1.3, 0.85, 0.45);
    cavity.position.set(0, mouthY, mouthZ - 0.02);
    const teeth = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.09, 0.08, 3, 0.03), whiteMat);
    teeth.position.set(0, mouthY + 0.06, mouthZ + 0.03);
    headGroup.add(cavity, teeth);
  } else if (mouthStyle === 2) {
    // Mischievous cheeky smirk
    const smirk = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 20, Math.PI * 0.78), mouthMat);
    smirk.rotation.z = Math.PI + 0.28;
    smirk.position.set(0.04, mouthY + 0.06, mouthZ);
    headGroup.add(smirk);
  } else if (mouthStyle === 4 && !c.beard) {
    // Surprised / whistling cute 'O'
    const o = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.032, 12, 20), mouthMat);
    o.position.set(0, mouthY, mouthZ + 0.02);
    headGroup.add(o);
  } else {
    // Classic warm friendly smile
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.036, 10, 20, Math.PI * 0.88), mouthMat);
    smile.rotation.z = Math.PI + 0.18;
    smile.position.set(0, mouthY + 0.08, mouthZ);
    headGroup.add(smile);
  }

  // ================= 10. GLASSES (G) — 3 unmistakable chunky frame styles =================
  if (c.glasses) {
    const frameMat = matGloss(GLASSES_COLS[c.index % GLASSES_COLS.length], 0.18);
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff5ff,
      roughness: 0.08,
      transparent: true,
      opacity: 0.34,
      clearcoat: 1.0,
    });
    const gz = faceZ + 0.14;
    for (const side of [-1, 1]) {
      const gx = side * eyeX;
      if (glassesStyle === 0) {
        // Big round scholar frames
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.042, 14, 28), frameMat);
        rim.position.set(gx, eyeY, gz);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.20, 24), lensMat);
        lens.position.set(gx, eyeY, gz - 0.01);
        headGroup.add(rim, lens);
      } else if (glassesStyle === 1) {
        // Chunky rounded-square hipster frames
        const top = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.07, 0.07, 3, 0.025), frameMat);
        top.position.set(gx, eyeY + 0.18, gz);
        const bot = top.clone(); bot.position.y = eyeY - 0.18;
        const out = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.42, 0.07, 3, 0.025), frameMat);
        out.position.set(gx + side * 0.20, eyeY, gz);
        const inn = out.clone(); inn.position.x = gx - side * 0.20;
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.32), lensMat);
        lens.position.set(gx, eyeY, gz - 0.01);
        headGroup.add(top, bot, out, inn, lens);
      } else {
        // Playful tilted oval / cat-eye frames
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.044, 14, 28), frameMat);
        rim.scale.set(1.12, 0.86, 1);
        rim.rotation.z = side * 0.18;
        rim.position.set(gx, eyeY + 0.01, gz);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24), lensMat);
        lens.scale.set(1.1, 0.84, 1);
        lens.rotation.z = side * 0.18;
        lens.position.set(gx, eyeY + 0.01, gz - 0.01);
        headGroup.add(rim, lens);
      }
      // Side temple arms going back toward ears
      const arm = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.05, 0.72, 2, 0.02), frameMat);
      arm.position.set(side * (eyeX + 0.24), eyeY + 0.02, gz - 0.36);
      headGroup.add(arm);
    }
    // Bridge
    const bridge = new THREE.Mesh(new RoundedBoxGeometry(eyeX * 0.9, 0.06, 0.06, 2, 0.02), frameMat);
    bridge.position.set(0, eyeY + 0.03, gz);
    headGroup.add(bridge);
  }

  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return scene;
}

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
camera.position.set(0, 0.12, 4.95);
camera.lookAt(0, 0.02, 0);

async function run() {
  for (const c of CHARACTERS) {
    const scene = buildCharacter(c);
    renderer.render(scene, camera);
    const dataUrl = canvas.toDataURL("image/png");
    await fetch("/save/" + c.id, { method: "POST", body: dataUrl });
  }
  await fetch("/done", { method: "POST" });
}
run().catch(async (e) => {
  await fetch("/err", { method: "POST", body: String(e?.stack || e) });
});
</script>
</body>
</html>`;

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

const saved = [];
let chromeProc = null;

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(RENDER_HTML);
    return;
  }
  if (req.url.startsWith("/three/")) {
    const rel = req.url.slice("/three/".length);
    const file = path.join(ROOT, "node_modules/three", rel);
    if (fs.existsSync(file)) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  if (req.method === "POST" && req.url.startsWith("/save/")) {
    const slug = req.url.slice("/save/".length);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const b64 = body.replace(/^data:image\/png;base64,/, "");
      const buf = Buffer.from(b64, "base64");
      const outFile = path.join(OUT_DIR, `${slug}.png`);
      fs.writeFileSync(outFile, buf);
      saved.push(`${slug}.png (${(buf.length / 1024).toFixed(1)} KB)`);
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }
  if (req.method === "POST" && req.url === "/done") {
    res.writeHead(200);
    res.end("bye");
    console.log(`Rendered ${saved.length}/${CHARACTERS.length} Face Off 3D Toybox Vinyl portraits:\n  ${saved.join("\n  ")}`);
    chromeProc?.kill("SIGTERM");
    server.close();
    process.exit(0);
    return;
  }
  if (req.method === "POST" && req.url === "/err") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      console.error("Renderer error:", body);
      res.writeHead(500);
      res.end("err");
      chromeProc?.kill("SIGTERM");
      server.close();
      process.exit(1);
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;
  chromeProc = spawn(
    CHROME,
    [
      "--headless=new",
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=metal",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      "--disable-gpu-sandbox",
      "--virtual-time-budget=25000",
      url,
    ],
    { stdio: "ignore" }
  );
  setTimeout(() => {
    console.error("Timed out waiting for Chrome render");
    chromeProc?.kill("SIGKILL");
    server.close();
    process.exit(1);
  }, 40000);
});
