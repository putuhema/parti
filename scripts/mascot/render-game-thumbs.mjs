#!/usr/bin/env node
/**
 * Renders 17 cohesive 3D Toybox Vinyl game thumbnail illustrations (512x512 JPEG)
 * into public/games/<slug>.jpg using Three.js PBR + RoomEnvironment via local headless Chrome.
 *
 * Usage: node scripts/mascot/render-game-thumbs.mjs
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public/games");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

fs.mkdirSync(OUT_DIR, { recursive: true });

const SLUGS = [
  "faceoff",
  "scramble",
  "island",
  "chain",
  "bluff",
  "stack",
  "potato",
  "party",
  "emoji",
  "truth",
  "story",
  "brain",
  "heist",
  "sync",
  "sketch",
  "boom",
  "tiles",
];

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

// Shared Toybox Vinyl PBR material factory
const matVinyl = (color, roughness = 0.48, extra = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.38,
    ...extra,
  });

const matGloss = (color, roughness = 0.18, extra = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.04,
    clearcoat: 0.65,
    clearcoatRoughness: 0.14,
    ...extra,
  });

const C = {
  cream: 0xfaf0e2,
  creamWarm: 0xf4e4cf,
  plum: 0x3b2846,
  mango: 0xffb424,
  butter: 0xffd056,
  coral: 0xff5b74,
  sky: 0x2ca8ff,
  mint: 0x2ec772,
  iris: 0x9775ff,
  pink: 0xf05a9a,
  teal: 0x20ba9c,
  wood: 0xc27c3e,
  white: 0xffffff,
};

function makeBackdropTexture(topHex, botHex) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 512;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(256, 165, 25, 256, 260, 410);
  g.addColorStop(0, topHex);
  g.addColorStop(1, botHex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelTexture(bgHex, drawFn, size = 256) {
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, size, size);
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeScene(topHex, botHex) {
  const scene = new THREE.Scene();
  scene.background = makeBackdropTexture(topHex, botHex);
  scene.environment = envTex;
  scene.environmentIntensity = 0.65;

  const key = new THREE.DirectionalLight(0xfff9f0, 1.55);
  key.position.set(-3.2, 5.2, 4.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 16;
  const d = 3.2;
  key.shadow.camera.left = -d; key.shadow.camera.right = d;
  key.shadow.camera.top = d; key.shadow.camera.bottom = -d;
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffeed8, 0.55);
  fill.position.set(3.5, 1.8, 3.0);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xd9f2ff, 0.72);
  rim.position.set(0.4, 3.0, -4.0);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3b2846, 0.52));

  // Root lifted cleanly into the upper 68% of the square tile so bottom 32% stays clear for title
  const stage = new THREE.Group();
  stage.position.set(0, 0.34, 0);
  scene.add(stage);

  return { scene, stage };
}

function addShadows(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

// Reusable sculpted vinyl pieces
function makeDie(size = 0.62, bodyColor = C.cream, pipColor = C.plum) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 5, size * 0.2), matVinyl(bodyColor, 0.42));
  g.add(box);
  const pipGeo = new THREE.SphereGeometry(size * 0.088, 16, 12);
  const pipMat = matGloss(pipColor, 0.22);
  const off = size * 0.24;
  const f = size * 0.495;
  const addPip = (x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(pipGeo, pipMat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    g.add(m);
  };
  // Top (5)
  for (const [x, z] of [[-off,-off],[off,-off],[0,0],[-off,off],[off,off]]) addPip(x, f, z, 1, 0.45, 1);
  // Front (3)
  for (const [x, y] of [[-off,off],[0,0],[off,-off]]) addPip(x, y, f, 1, 1, 0.45);
  // Right (6)
  for (const [y, z] of [[-off,-off],[0,-off],[off,-off],[-off,off],[0,off],[off,off]]) addPip(f, y, z, 0.45, 1, 1);
  // Left (4)
  for (const [y, z] of [[-off,-off],[off,-off],[-off,off],[off,off]]) addPip(-f, y, z, 0.45, 1, 1);
  return g;
}

function makeStar(outerR = 0.2, innerR = 0.09, depth = 0.08, color = C.butter) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.45, bevelSize: depth * 0.35, bevelSegments: 4 });
  geo.center();
  return new THREE.Mesh(geo, matGloss(color, 0.24));
}

function makeSpark4(r = 0.14, color = C.butter) {
  const s = new THREE.Shape();
  s.moveTo(0, r);
  s.quadraticCurveTo(0, 0, r, 0);
  s.quadraticCurveTo(0, 0, 0, -r);
  s.quadraticCurveTo(0, 0, -r, 0);
  s.quadraticCurveTo(0, 0, 0, r);
  const geo = new THREE.ExtrudeGeometry(s, { depth: r * 0.22, bevelEnabled: true, bevelThickness: r * 0.14, bevelSize: r * 0.1, bevelSegments: 3 });
  geo.center();
  return new THREE.Mesh(geo, matGloss(color, 0.22));
}

function makeLetterTile(ch, bgHex, fgHex, subNum = "", w = 0.56, h = 0.56, d = 0.16) {
  const tex = makeLabelTexture(bgHex, (ctx, S) => {
    ctx.fillStyle = fgHex;
    ctx.font = "900 " + Math.round(S * 0.62) + "px 'Fredoka', 'Arial Rounded MT Bold', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ch, S * 0.5, S * 0.52);
    if (subNum) {
      ctx.font = "800 " + Math.round(S * 0.18) + "px system-ui, sans-serif";
      ctx.fillText(subNum, S * 0.80, S * 0.80);
    }
  });
  const baseMat = matVinyl(new THREE.Color(bgHex), 0.44);
  const frontMat = matVinyl(0xffffff, 0.42, { map: tex });
  const geo = new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h) * 0.2);
  // Apply crisp graphic plate right on front face
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, baseMat));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.84, h * 0.84), frontMat);
  face.position.z = d * 0.503;
  g.add(face);
  return g;
}

function makeHeart(scale = 0.5, color = C.coral) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.35);
  s.bezierCurveTo(0.55, 0.05, 0.72, 0.65, 0.32, 0.82);
  s.bezierCurveTo(0.10, 0.90, 0, 0.70, 0, 0.55);
  s.bezierCurveTo(0, 0.70, -0.10, 0.90, -0.32, 0.82);
  s.bezierCurveTo(-0.72, 0.65, -0.55, 0.05, 0, -0.35);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 6 });
  geo.center();
  const m = new THREE.Mesh(geo, matGloss(color, 0.22));
  m.scale.setScalar(scale);
  return m;
}

function makePencil(bodyColor = C.sky, len = 1.25) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, len, 20), matVinyl(bodyColor, 0.42));
  g.add(body);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.14, 20), matGloss(C.butter, 0.25));
  ferrule.position.y = len * 0.5 + 0.06;
  g.add(ferrule);
  const eraser = new THREE.Mesh(new THREE.SphereGeometry(0.10, 16, 12), matVinyl(C.coral, 0.55));
  eraser.position.y = len * 0.5 + 0.16;
  eraser.scale.set(1, 0.85, 1);
  g.add(eraser);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.28, 20), matVinyl(C.creamWarm, 0.55));
  cone.rotation.x = Math.PI;
  cone.position.y = -len * 0.5 - 0.14;
  g.add(cone);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.12, 16), matGloss(C.plum, 0.25));
  tip.rotation.x = Math.PI;
  tip.position.y = -len * 0.5 - 0.23;
  g.add(tip);
  return g;
}

function makeDiamond(r = 0.42, color = 0x5be2ff) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r, r * 0.42, 8), matGloss(color, 0.12, { transmission: 0.15 }));
  top.position.y = r * 0.21;
  const bot = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.95, 8), matGloss(color, 0.12));
  bot.rotation.x = Math.PI;
  bot.position.y = -r * 0.475;
  g.add(top, bot);
  return g;
}

// =====================================================================
// 17 Bespoke Toybox Vinyl 3D Game Dioramas
// =====================================================================
const BUILDERS = {
  faceoff() {
    const { scene, stage } = makeScene("#ff78b2", "#d83c7e");
    const makePortraitCard = (variant) => {
      const g = new THREE.Group();
      const bg = variant === "mystery" ? C.plum : C.cream;
      g.add(new THREE.Mesh(new RoundedBoxGeometry(0.86, 1.12, 0.15, 5, 0.12), matVinyl(bg, 0.44)));
      if (variant === "mystery") {
        const tex = makeLabelTexture("#3b2846", (ctx, S) => {
          ctx.fillStyle = "#ffbe3b";
          ctx.font = "900 170px 'Fredoka', system-ui, sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("?", S / 2, S / 2 + 6);
        });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.86), matVinyl(0xffffff, 0.4, { map: tex }));
        p.position.z = 0.078;
        g.add(p);
      } else {
        // Cute sculpted 3D vinyl character head popping off the card
        const headColor = variant === "glasses" ? 0xffe0c2 : 0xf4c29f;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 20), matVinyl(headColor, 0.52));
        head.position.set(0, 0.02, 0.14);
        head.scale.set(1.0, 1.04, 0.65);
        g.add(head);
        // Shoulders
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.14, 12, 16), matVinyl(variant === "glasses" ? C.sky : C.mango, 0.46));
        body.position.set(0, -0.34, 0.10);
        body.rotation.z = Math.PI / 2;
        body.scale.set(0.8, 1, 0.55);
        g.add(body);
        // Eyes
        for (const sx of [-0.085, 0.085]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 12), matGloss(C.plum, 0.14));
          eye.position.set(sx, 0.05, 0.30);
          g.add(eye);
        }
        // Cheeks
        for (const sx of [-0.145, 0.145]) {
          const ch = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 10), matVinyl(0xff8e99, 0.65));
          ch.position.set(sx, -0.02, 0.27);
          ch.scale.set(1.2, 0.75, 0.4);
          g.add(ch);
        }
        if (variant === "glasses") {
          // Cute round teal glasses + mango beanie
          for (const sx of [-0.085, 0.085]) {
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.016, 12, 24), matGloss(C.plum, 0.25));
            rim.position.set(sx, 0.05, 0.31);
            g.add(rim);
          }
          const hat = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), matVinyl(C.mango, 0.46));
          hat.position.set(0, 0.09, 0.14);
          hat.scale.set(1.03, 0.95, 0.7);
          g.add(hat);
        } else {
          // Cute curly hair puffs + tiny star
          for (const [hx, hy] of [[-0.18, 0.22], [0, 0.29], [0.18, 0.22]]) {
            const puff = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 14), matVinyl(C.plum, 0.5));
            puff.position.set(hx, hy, 0.15);
            g.add(puff);
          }
        }
      }
      return g;
    };

    const c1 = makePortraitCard("glasses");
    c1.position.set(-0.76, -0.04, -0.10); c1.rotation.set(0.08, 0.24, 0.15);
    const c2 = makePortraitCard("curly");
    c2.position.set(0.0, 0.12, 0.16); c2.rotation.set(0.04, -0.06, -0.03);
    const c3 = makePortraitCard("mystery");
    c3.position.set(0.76, -0.08, -0.06); c3.rotation.set(0.08, -0.26, -0.16);
    stage.add(c1, c2, c3);
    const sp = makeSpark4(0.14, C.butter); sp.position.set(0.95, 0.72, 0.25); stage.add(sp);
    return scene;
  },

  scramble() {
    const { scene, stage } = makeScene("#ffa63b", "#dd6d00");
    const tray = new THREE.Group();
    tray.scale.setScalar(0.78);
    tray.position.y = -0.06;
    tray.rotation.set(0.36, -0.28, -0.10);
    tray.add(new THREE.Mesh(new RoundedBoxGeometry(2.18, 2.18, 0.24, 6, 0.24), matVinyl(C.cream, 0.48)));
    const letters = ["W", "O", "R", "S", "D", "E", "T", "A", "L"];
    const hi = new Set([0, 1, 2, 4]);
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3), c = i % 3;
      const on = hi.has(i);
      const tile = makeLetterTile(letters[i], on ? "#ffbe3b" : "#ffffff", on ? "#4a2d00" : "#3b2846", "", 0.56, 0.56, 0.16);
      tile.position.set((c - 1) * 0.63, (1 - r) * 0.63, on ? 0.24 : 0.14);
      tray.add(tile);
    }
    // Glowing golden-white connector ribbon tucked neatly BETWEEN the raised W -> O -> R -> D tiles
    const pts = [
      new THREE.Vector3(-0.63, 0.63, 0.20),
      new THREE.Vector3(0.0, 0.63, 0.20),
      new THREE.Vector3(0.63, 0.63, 0.20),
      new THREE.Vector3(0.0, 0.0, 0.20),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const swipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.068, 14, false), matGloss(0xfff4c2, 0.15, { emissive: 0xffd25a, emissiveIntensity: 0.45 }));
    tray.add(swipe);
    const sp = makeSpark4(0.16, C.white); sp.position.set(1.18, 0.96, 0.28); tray.add(sp);
    stage.add(tray);
    return scene;
  },

  island() {
    const { scene, stage } = makeScene("#36d4b5", "#0f8c73");
    const grp = new THREE.Group();
    grp.scale.setScalar(0.84);
    grp.position.y = -0.14;
    grp.rotation.set(0.24, -0.22, 0);
    // Floating sandy island vinyl disc + tiny turquoise water ring
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.05, 0.18, 40), matGloss(0x52e0ff, 0.22));
    water.position.y = -0.34;
    grp.add(water);
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 1.04, 0.28, 36), matVinyl(0xfae2a8, 0.56));
    sand.position.y = -0.18;
    grp.add(sand);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.85, 28, 18), matVinyl(0xfbe8b8, 0.56));
    mound.scale.set(1.08, 0.32, 1.08);
    mound.position.y = -0.05;
    grp.add(mound);
    // Curved clay palm tree
    const trunkPts = [
      new THREE.Vector3(-0.34, 0.0, -0.12),
      new THREE.Vector3(-0.46, 0.45, -0.10),
      new THREE.Vector3(-0.32, 0.88, -0.04),
    ];
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trunkPts), 18, 0.095, 14, false), matVinyl(C.wood, 0.55));
    grp.add(trunk);
    // 5 chunky mint-green vinyl palm fronds
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.3;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), matVinyl(0x3ad67d, 0.44));
      leaf.scale.set(1.85, 0.28, 0.68);
      const pivot = new THREE.Group();
      pivot.position.set(-0.32, 0.90, -0.04);
      pivot.rotation.y = ang;
      leaf.position.set(0.32, -0.04, 0);
      leaf.rotation.z = -0.32;
      pivot.add(leaf);
      grp.add(pivot);
    }
    // Sparkling cyan gem + tilted die
    const gem = makeDiamond(0.30, 0x78e8ff);
    gem.position.set(0.46, 0.42, -0.06);
    gem.rotation.set(0.15, 0.4, -0.18);
    grp.add(gem);
    const die = makeDie(0.52, C.cream, C.plum);
    die.position.set(0.18, 0.22, 0.42);
    die.rotation.set(0.35, 0.55, -0.2);
    grp.add(die);
    const sp = makeSpark4(0.13, C.butter); sp.position.set(0.76, 0.78, 0.1); grp.add(sp);
    stage.add(grp);
    return scene;
  },

  chain() {
    const { scene, stage } = makeScene("#ff788e", "#d63854");
    const makePad = (drawFn) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new RoundedBoxGeometry(1.02, 1.02, 0.14, 5, 0.14), matVinyl(C.cream, 0.46)));
      const tex = makeLabelTexture("#fffaf2", drawFn);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), matVinyl(0xffffff, 0.48, { map: tex }));
      p.position.z = 0.073;
      g.add(p);
      return g;
    };
    // Cat doodle pad
    const p1 = makePad((ctx, S) => {
      ctx.strokeStyle = "#3b2846"; ctx.lineWidth = 14; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.arc(S * 0.5, S * 0.56, 62, 0, Math.PI * 2); ctx.stroke();
      // Cat ears
      ctx.beginPath(); ctx.moveTo(S*0.29, S*0.42); ctx.lineTo(S*0.26, S*0.20); ctx.lineTo(S*0.44, S*0.33); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(S*0.71, S*0.42); ctx.lineTo(S*0.74, S*0.20); ctx.lineTo(S*0.56, S*0.33); ctx.stroke();
      ctx.fillStyle = "#3b2846";
      ctx.beginPath(); ctx.arc(S*0.40, S*0.54, 10, 0, Math.PI*2); ctx.arc(S*0.60, S*0.54, 10, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(S*0.50, S*0.64, 12, 0, Math.PI); ctx.stroke();
    });
    p1.position.set(-0.62, 0.18, 0.02); p1.rotation.set(0.08, 0.22, 0.12);

    // Goofy potato doodle pad
    const p2 = makePad((ctx, S) => {
      ctx.fillStyle = "#e3b278"; ctx.strokeStyle = "#3b2846"; ctx.lineWidth = 13;
      ctx.beginPath(); ctx.ellipse(S*0.5, S*0.52, 68, 52, -0.25, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#3b2846";
      ctx.beginPath(); ctx.arc(S*0.41, S*0.48, 9, 0, Math.PI*2); ctx.arc(S*0.59, S*0.50, 9, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(S*0.50, S*0.58, 12, 0.1, Math.PI - 0.1); ctx.stroke();
    });
    p2.position.set(0.60, -0.10, 0.18); p2.rotation.set(0.08, -0.24, -0.12);

    // Chunky mango arrow linking them
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.36, 12, 16), matGloss(C.mango, 0.25));
    shaft.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 20), matGloss(C.mango, 0.25));
    head.rotation.z = -Math.PI / 2; head.position.x = 0.26;
    arrow.add(shaft, head);
    arrow.position.set(0.0, 0.36, 0.36); arrow.rotation.z = -0.25;

    const pencil = makePencil(C.sky, 1.0);
    pencil.position.set(-0.46, -0.46, 0.42); pencil.rotation.set(0.2, 0.3, -1.16);

    stage.add(p1, p2, arrow, pencil);
    return scene;
  },

  bluff() {
    const { scene, stage } = makeScene("#528bff", "#2452b3");
    // Tilted pirate vinyl leather dice cup
    const cup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.92, 32), matVinyl(0x7c4529, 0.52));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.065, 16, 36), matGloss(C.mango, 0.26));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.45;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.04, 12, 32), matGloss(C.mango, 0.26));
    band.rotation.x = Math.PI / 2; band.position.y = -0.05;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.43, 28), matVinyl(0x2a1612, 0.9));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.44;
    cup.add(body, rim, band, inner);
    cup.position.set(-0.46, 0.28, -0.08);
    cup.rotation.set(0.32, 0.25, -0.92);

    // Tumbling chunky vinyl dice
    const d1 = makeDie(0.56, C.cream, C.plum);
    d1.position.set(0.36, -0.04, 0.26); d1.rotation.set(0.45, 0.72, -0.28);
    const d2 = makeDie(0.48, C.butter, C.plum);
    d2.position.set(0.76, -0.34, 0.02); d2.rotation.set(-0.35, 0.45, 0.55);

    // Glossy coral exclamation badge ("LIAR!")
    const excl = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.28, 12, 16), matGloss(C.coral, 0.2));
    bar.position.y = 0.16;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 14), matGloss(C.coral, 0.2));
    dot.position.y = -0.18;
    excl.add(bar, dot);
    excl.position.set(0.76, 0.52, 0.22); excl.rotation.z = -0.18;

    stage.add(cup, d1, d2, excl);
    return scene;
  },

  stack() {
    const { scene, stage } = makeScene("#ffcb47", "#de8900");
    const tower = new THREE.Group();
    tower.rotation.set(0.36, -0.58, 0);
    const slabs = [
      { y: -0.60, w: 1.50, d: 1.50, x: 0.0, z: 0.0, col: C.cream },
      { y: -0.34, w: 1.36, d: 1.36, x: 0.06, z: -0.03, col: C.sky },
      { y: -0.08, w: 1.22, d: 1.22, x: -0.05, z: 0.05, col: C.mint },
      { y: 0.18, w: 1.08, d: 1.08, x: 0.08, z: 0.02, col: C.iris },
      { y: 0.44, w: 0.94, d: 0.94, x: -0.04, z: -0.04, col: C.coral },
      { y: 0.86, w: 0.82, d: 0.82, x: 0.18, z: -0.06, col: C.white }, // hovering top block!
    ];
    for (const s of slabs) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(s.w, 0.24, s.d, 5, 0.075), matVinyl(s.col, 0.42));
      m.position.set(s.x, s.y, s.z);
      if (s.y > 0.7) m.rotation.z = -0.06;
      tower.add(m);
    }
    const sp1 = makeSpark4(0.14, C.white); sp1.position.set(-0.72, 0.86, 0.4); tower.add(sp1);
    const sp2 = makeSpark4(0.11, C.coral); sp2.position.set(0.84, 0.65, 0.3); tower.add(sp2);
    stage.add(tower);
    return scene;
  },

  potato() {
    const { scene, stage } = makeScene("#ff893b", "#d44606");
    const bomb = new THREE.Group();
    bomb.rotation.set(0.10, -0.18, -0.14);
    // Plump glossy dark-plum vinyl bomb sphere with cute blush
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.76, 36, 28), matGloss(0x3a2a47, 0.22));
    bomb.add(sphere);
    // Cute wide eyes + rosy cheeks so it's a playful Toybox bomb!
    for (const sx of [-0.20, 0.20]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 14), matGloss(0xffffff, 0.15));
      eye.position.set(sx, 0.06, 0.72); eye.scale.set(1, 1.15, 0.55);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), matGloss(0x23162d, 0.1));
      pupil.position.set(sx, 0.07, 0.76);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), matVinyl(0xff6b7a, 0.65));
      cheek.position.set(sx * 1.6, -0.12, 0.67); cheek.scale.set(1.2, 0.7, 0.35);
      bomb.add(eye, pupil, cheek);
    }
    // Chunky golden collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.20, 24), matGloss(C.mango, 0.26));
    collar.position.y = 0.74;
    bomb.add(collar);
    // Curved cream fuse
    const fuseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.84, 0),
      new THREE.Vector3(0.16, 1.08, 0.06),
      new THREE.Vector3(0.46, 1.04, 0.12),
    ]);
    bomb.add(new THREE.Mesh(new THREE.TubeGeometry(fuseCurve, 20, 0.06, 14, false), matVinyl(C.cream, 0.65)));
    // Glowing star spark burst at fuse tip
    const spark = makeStar(0.32, 0.14, 0.09, 0xffe04a);
    spark.position.set(0.54, 1.02, 0.14);
    spark.material.emissive = new THREE.Color(0xffb424);
    spark.material.emissiveIntensity = 0.55;
    bomb.add(spark);
    const dot1 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), matGloss(0xfff5b8, 0.2, { emissive: 0xffd040, emissiveIntensity: 0.6 }));
    dot1.position.set(0.86, 1.18, 0.18);
    const dot2 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), matGloss(C.coral, 0.2));
    dot2.position.set(0.76, 0.74, 0.22);
    bomb.add(dot1, dot2);
    bomb.position.y = -0.14;
    stage.add(bomb);
    return scene;
  },

  party() {
    const { scene, stage } = makeScene("#9d66ff", "#5c22cc");
    const grid = new THREE.Group();
    grid.rotation.set(0.38, -0.30, -0.14);
    const colors = [C.coral, C.sky, C.mint, C.butter, C.mango, C.pink, C.cream, C.teal, C.white];
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3), c = i % 3;
      const isCenter = i === 4;
      const tile = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.52, 0.22, 4, 0.11), matVinyl(colors[i], 0.4));
      tile.position.set((c - 1) * 0.60, (1 - r) * 0.60, isCenter ? 0.18 : 0);
      grid.add(tile);
    }
    // Chunky golden lightning bolt bursting from center
    const boltShape = new THREE.Shape();
    boltShape.moveTo(0.12, 0.52);
    boltShape.lineTo(-0.32, -0.02);
    boltShape.lineTo(0.0, -0.02);
    boltShape.lineTo(-0.14, -0.52);
    boltShape.lineTo(0.32, 0.06);
    boltShape.lineTo(0.0, 0.06);
    boltShape.closePath();
    const boltGeo = new THREE.ExtrudeGeometry(boltShape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 4 });
    boltGeo.center();
    const bolt = new THREE.Mesh(boltGeo, matGloss(0xffe042, 0.2, { emissive: 0xffa800, emissiveIntensity: 0.25 }));
    bolt.position.set(0, 0.08, 0.52);
    grid.add(bolt);
    // Confetti orbs around
    for (const [x, y, z, col, rad] of [[-1.02, 0.72, 0.3, C.butter, 0.11], [1.05, 0.62, 0.25, C.coral, 0.10], [0.95, -0.68, 0.35, C.mint, 0.09], [-0.95, -0.65, 0.3, C.sky, 0.09]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 16, 14), matGloss(col, 0.25));
      m.position.set(x, y, z);
      grid.add(m);
    }
    stage.add(grid);
    return scene;
  },

  emoji() {
    const { scene, stage } = makeScene("#ffc145", "#d98200");
    // Big plump cream 3D speech bubble pillow
    const bubble = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.78, 1.02, 0.42, 6, 0.28), matVinyl(C.cream, 0.44));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.36, 16), matVinyl(C.cream, 0.44));
    tail.position.set(-0.54, -0.58, 0); tail.rotation.z = 2.65;
    bubble.add(body, tail);
    bubble.position.set(-0.08, 0.22, 0); bubble.rotation.set(0.12, -0.14, 0.06);

    // 3 cute mini 3D charms popping on the speech bubble: Crown, Sun-Star, Smiley Medallion
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 20), matGloss(C.mango, 0.24));
    face.position.set(-0.48, 0.0, 0.24); face.scale.set(1, 1, 0.65);
    for (const sx of [-0.075, 0.075]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), matGloss(C.plum, 0.15));
      e.position.set(-0.48 + sx, 0.04, 0.39);
      bubble.add(e);
    }
    bubble.add(face);

    const heart = makeHeart(0.36, C.coral);
    heart.position.set(0.02, -0.02, 0.28);
    bubble.add(heart);

    const star = makeStar(0.26, 0.12, 0.10, C.sky);
    star.position.set(0.52, 0.0, 0.26);
    bubble.add(star);

    // Second little turquoise reply bubble with "?"
    const reply = new THREE.Group();
    const rBody = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.56, 0.30, 5, 0.20), matVinyl(C.teal, 0.42));
    const qTex = makeLabelTexture("#20ba9c", (ctx, S) => {
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 180px 'Fredoka', system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("?", S / 2, S / 2 + 8);
    });
    const qPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), matVinyl(0xffffff, 0.4, { map: qTex }));
    qPlane.position.z = 0.154;
    reply.add(rBody, qPlane);
    reply.position.set(0.56, -0.46, 0.32); reply.rotation.set(0.10, -0.18, -0.08);

    stage.add(bubble, reply);
    return scene;
  },

  truth() {
    const { scene, stage } = makeScene("#b27dff", "#7138c2");
    const makeRowCard = (type, bgHex) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new RoundedBoxGeometry(1.76, 0.48, 0.16, 5, 0.12), matVinyl(new THREE.Color(bgHex), 0.44)));
      // Icon badge on left
      const badgeCol = type === "ok" ? C.mint : C.coral;
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 24), matGloss(badgeCol, 0.22));
      badge.rotation.x = Math.PI / 2; badge.position.set(-0.58, 0, 0.09);
      g.add(badge);
      if (type === "ok") {
        // White checkmark pill
        const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.06, 8, 12), matGloss(C.white, 0.2));
        a.position.set(-0.62, -0.02, 0.135); a.rotation.z = 0.72;
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.12, 8, 12), matGloss(C.white, 0.2));
        b.position.set(-0.55, 0.01, 0.135); b.rotation.z = -0.68;
        g.add(a, b);
      } else {
        // Bold white X mark
        for (const rz of [0.78, -0.78]) {
          const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.13, 8, 12), matGloss(C.white, 0.2));
          bar.position.set(-0.58, 0, 0.135); bar.rotation.z = rz;
          g.add(bar);
        }
      }
      // Sculpted text bar lines
      const barCol = type === "ok" ? 0xdacbb8 : 0xd99b26;
      const l1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.78, 10, 14), matVinyl(barCol, 0.5));
      l1.rotation.z = Math.PI / 2; l1.position.set(0.16, 0.06, 0.09);
      const l2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.50, 10, 14), matVinyl(barCol, 0.5));
      l2.rotation.z = Math.PI / 2; l2.position.set(0.02, -0.08, 0.09);
      g.add(l1, l2);
      return g;
    };
    const r1 = makeRowCard("ok", "#faf0e2"); r1.position.set(-0.08, 0.56, 0); r1.rotation.set(0.12, -0.16, 0.06);
    const r2 = makeRowCard("lie", "#ffcf52"); r2.position.set(0.12, 0.0, 0.22); r2.rotation.set(0.08, -0.10, -0.05);
    const r3 = makeRowCard("ok", "#faf0e2"); r3.position.set(-0.06, -0.56, 0.04); r3.rotation.set(0.12, -0.16, 0.04);
    stage.add(r1, r2, r3);
    const sp = makeSpark4(0.14, C.butter); sp.position.set(0.95, 0.56, 0.35); stage.add(sp);
    return scene;
  },

  story() {
    const { scene, stage } = makeScene("#db904c", "#91561f");
    const book = new THREE.Group();
    book.rotation.set(0.42, -0.26, -0.08);
    // Cozy open cream storybook with thick plum cover
    const cover = new THREE.Mesh(new RoundedBoxGeometry(1.92, 1.32, 0.16, 5, 0.08), matVinyl(C.plum, 0.5));
    cover.position.z = -0.06;
    const pL = new THREE.Mesh(new RoundedBoxGeometry(0.88, 1.18, 0.16, 5, 0.07), matVinyl(C.cream, 0.48));
    pL.position.set(-0.46, 0, 0.05); pL.rotation.y = 0.12;
    const pR = new THREE.Mesh(new RoundedBoxGeometry(0.88, 1.18, 0.16, 5, 0.07), matVinyl(C.cream, 0.48));
    pR.position.set(0.46, 0, 0.05); pR.rotation.y = -0.12;
    book.add(cover, pL, pR);
    // Sculpted story lines + golden highlighted secret word bar
    for (const [side, ys] of [[-0.46, [0.34, 0.14, -0.06, -0.26]], [0.46, [0.34, 0.14, -0.06, -0.26]]]) {
      ys.forEach((yy, idx) => {
        const isSecret = side > 0 && idx === 1;
        const bar = new THREE.Mesh(
          new THREE.CapsuleGeometry(isSecret ? 0.055 : 0.032, isSecret ? 0.48 : 0.44, 8, 12),
          matVinyl(isSecret ? C.mango : 0xd5c4b0, isSecret ? 0.32 : 0.55)
        );
        bar.rotation.z = Math.PI / 2;
        bar.position.set(side, yy, 0.15);
        book.add(bar);
      });
    }
    // Chunky teal magnifying glass hovering over the golden secret word
    const mag = new THREE.Group();
    const lensRim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.065, 16, 32), matGloss(C.teal, 0.25));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.29, 28), matGloss(0xbef2ff, 0.1, { transparent: true, opacity: 0.45 }));
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.44, 12, 16), matVinyl(C.plum, 0.42));
    handle.position.set(0.36, -0.36, 0); handle.rotation.z = 0.78;
    mag.add(lensRim, lens, handle);
    mag.position.set(0.46, 0.14, 0.48); mag.rotation.set(-0.22, 0.18, 0.12);
    book.add(mag);
    stage.add(book);
    return scene;
  },

  brain() {
    const { scene, stage } = makeScene("#3db5ff", "#0e74c4");
    // Two tilted fact flashcards with cute icons
    const makeCard = (drawFn) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new RoundedBoxGeometry(0.92, 1.16, 0.15, 5, 0.14), matVinyl(C.cream, 0.44)));
      const tex = makeLabelTexture("#fffaf2", drawFn);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.90), matVinyl(0xffffff, 0.44, { map: tex }));
      p.position.z = 0.078;
      g.add(p);
      return g;
    };
    const c1 = makeCard((ctx, S) => {
      // Cute ringed Saturn planet
      ctx.fillStyle = "#ff8c1a";
      ctx.beginPath(); ctx.arc(S*0.5, S*0.5, 48, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#ffd056"; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.ellipse(S*0.5, S*0.52, 86, 26, -0.3, 0, Math.PI*2); ctx.stroke();
    });
    c1.position.set(-0.56, 0.12, 0.04); c1.rotation.set(0.08, 0.24, 0.14);

    const c2 = makeCard((ctx, S) => {
      // Cute pink octopus silhouette
      ctx.fillStyle = "#f05a9a";
      ctx.beginPath(); ctx.arc(S*0.5, S*0.42, 48, 0, Math.PI*2); ctx.fill();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.roundRect(S*0.5 + i*22 - 8, S*0.52, 16, 52, 8); ctx.fill();
      }
      ctx.fillStyle = "#3b2846";
      ctx.beginPath(); ctx.arc(S*0.42, S*0.42, 8, 0, Math.PI*2); ctx.arc(S*0.58, S*0.42, 8, 0, Math.PI*2); ctx.fill();
    });
    c2.position.set(0.56, 0.04, 0.14); c2.rotation.set(0.08, -0.24, -0.14);

    // Glowing golden lightbulb hovering above
    const bulb = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 20), matGloss(0xffe04a, 0.18, { emissive: 0xffb21e, emissiveIntensity: 0.42 }));
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.20, 20), matVinyl(C.plum, 0.42));
    base.position.y = -0.32;
    bulb.add(glass, base);
    bulb.position.set(0, 0.62, 0.44);
    const sp1 = makeSpark4(0.12, C.white); sp1.position.set(-0.46, 0.78, 0.46);
    const sp2 = makeSpark4(0.12, C.butter); sp2.position.set(0.46, 0.76, 0.46);

    stage.add(c1, c2, bulb, sp1, sp2);
    return scene;
  },

  heist() {
    const { scene, stage } = makeScene("#5c4a94", "#281d4d");
    // Cream museum pedestal + sparkling cyan heist diamond
    const ped = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.56, 0.86, 5, 0.12), matVinyl(C.cream, 0.46));
    ped.position.set(0.36, -0.34, 0); ped.rotation.y = -0.32;
    const dia = makeDiamond(0.44, 0x62ebff);
    dia.material;
    dia.position.set(0.36, 0.38, 0.04); dia.rotation.set(0.12, 0.4, -0.08);

    // Translucent golden spotlight beam cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.76, 1.75, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe46b, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
    );
    cone.position.set(-0.18, 0.34, 0.16);
    cone.rotation.z = -1.32;

    // Chunky dark-plum vinyl flashlight on the left
    const torch = new THREE.Group();
    const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.68, 20), matVinyl(C.plum, 0.42));
    const tHead = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.22, 20), matGloss(C.mango, 0.26));
    tHead.position.y = 0.38;
    torch.add(tBody, tHead);
    torch.position.set(-0.88, 0.54, 0.24);
    torch.rotation.z = -1.32;

    // Cute miniature black vinyl cat burglar peeking from bottom-left
    const cat = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 20), matVinyl(0x231b2e, 0.45));
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 14), matVinyl(0x231b2e, 0.45));
    earL.position.set(-0.17, 0.24, 0); earL.rotation.z = 0.32;
    const earR = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 14), matVinyl(0x231b2e, 0.45));
    earR.position.set(0.17, 0.24, 0); earR.rotation.z = -0.32;
    for (const sx of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), matGloss(0xffd43b, 0.15, { emissive: 0xffc800, emissiveIntensity: 0.7 }));
      eye.position.set(sx, 0.02, 0.25);
      cat.add(eye);
    }
    cat.add(head, earL, earR);
    cat.position.set(-0.62, -0.34, 0.32); cat.rotation.y = 0.35;

    const sp = makeSpark4(0.15, C.white); sp.position.set(0.84, 0.72, 0.2);
    stage.add(ped, dia, cone, torch, cat, sp);
    return scene;
  },

  sync() {
    const { scene, stage } = makeScene("#ff75ae", "#c42d6b");
    const makeMatchCard = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new RoundedBoxGeometry(0.88, 1.14, 0.15, 5, 0.14), matVinyl(C.cream, 0.44)));
      const st = makeStar(0.28, 0.13, 0.08, C.mango);
      st.position.set(0, 0.02, 0.10);
      g.add(st);
      return g;
    };
    const c1 = makeMatchCard();
    c1.position.set(-0.56, 0.08, 0.04); c1.rotation.set(0.08, 0.22, 0.16);
    const c2 = makeMatchCard();
    c2.position.set(0.56, 0.08, 0.04); c2.rotation.set(0.08, -0.22, -0.16);
    const heart = makeHeart(0.58, C.coral);
    heart.position.set(0, -0.12, 0.36); heart.rotation.x = 0.1;
    const sp1 = makeSpark4(0.14, C.butter); sp1.position.set(-0.02, 0.76, 0.3);
    const sp2 = makeSpark4(0.10, C.white); sp2.position.set(0.42, 0.62, 0.32);
    stage.add(c1, c2, heart, sp1, sp2);
    return scene;
  },

  sketch() {
    const { scene, stage } = makeScene("#3ed1b1", "#168a72");
    const makeCanvas = (drawFn) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new RoundedBoxGeometry(1.04, 1.04, 0.14, 5, 0.14), matVinyl(C.cream, 0.44)));
      const tex = makeLabelTexture("#ffffff", drawFn);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), matVinyl(0xffffff, 0.48, { map: tex }));
      p.position.z = 0.074;
      g.add(p);
      return g;
    };
    const c1 = makeCanvas((ctx, S) => {
      ctx.strokeStyle = "#3b2846"; ctx.lineWidth = 14; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.arc(S*0.36, S*0.38, 42, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(S*0.52, S*0.80); ctx.lineTo(S*0.72, S*0.44); ctx.lineTo(S*0.88, S*0.80); ctx.closePath(); ctx.stroke();
    });
    c1.position.set(-0.48, 0.20, 0.0); c1.rotation.set(0.08, 0.22, 0.14);

    const c2 = makeCanvas((ctx, S) => {
      ctx.strokeStyle = "#1c9af2"; ctx.lineWidth = 14; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.arc(S*0.38, S*0.40, 40, 0.2, Math.PI*1.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(S*0.52, S*0.80); ctx.lineTo(S*0.70, S*0.46); ctx.lineTo(S*0.86, S*0.80); ctx.closePath(); ctx.stroke();
    });
    c2.position.set(0.46, -0.06, 0.18); c2.rotation.set(0.08, -0.22, -0.12);

    const brush = makePencil(C.mango, 1.25);
    brush.position.set(0.62, 0.56, 0.46); brush.rotation.set(0.15, -0.2, -0.68);
    stage.add(c1, c2, brush);
    return scene;
  },

  boom() {
    const { scene, stage } = makeScene("#ec5a52", "#a8241d");
    const board = new THREE.Group();
    board.rotation.set(0.44, -0.52, 0);
    // Cream tabletop board corner with vibrant property strips
    board.add(new THREE.Mesh(new RoundedBoxGeometry(1.92, 0.22, 1.92, 5, 0.10), matVinyl(C.cream, 0.46)));
    const strips = [
      { x: -0.56, z: -0.62, col: C.sky },
      { x: 0.0, z: -0.62, col: C.mango },
      { x: 0.56, z: -0.62, col: C.mint },
      { x: -0.62, z: 0.0, col: C.pink },
      { x: -0.62, z: 0.56, col: C.iris },
    ];
    for (const s of strips) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.06, 0.44, 3, 0.03), matVinyl(s.col, 0.4));
      m.position.set(s.x, 0.13, s.z);
      board.add(m);
    }
    // Cute chunky toy house (mint) + golden hotel tower
    const makeHouse = (w, h, d, bodyCol, roofCol) => {
      const g = new THREE.Group();
      const walls = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.06), matVinyl(bodyCol, 0.42));
      walls.position.y = h / 2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, h * 0.62, 4), matGloss(roofCol, 0.3));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = h + h * 0.24;
      g.add(walls, roof);
      return g;
    };
    const house = makeHouse(0.42, 0.36, 0.42, C.mint, C.cream);
    house.position.set(-0.34, 0.12, 0.22);
    const hotel = makeHouse(0.48, 0.66, 0.48, C.mango, C.coral);
    hotel.position.set(0.32, 0.12, -0.22);
    const die = makeDie(0.46, C.white, C.plum);
    die.position.set(0.36, 0.36, 0.44); die.rotation.set(0.25, 0.4, -0.15);
    board.add(house, hotel, die);
    stage.add(board);
    return scene;
  },

  tiles() {
    const { scene, stage } = makeScene("#2ac4a7", "#0d7d69");
    const grp = new THREE.Group();
    grp.scale.setScalar(0.84);
    grp.position.y = -0.08;
    grp.rotation.set(0.32, -0.32, -0.08);
    // Soft cream-mint board pad behind crossword tiles
    const pad = new THREE.Mesh(new RoundedBoxGeometry(2.18, 2.18, 0.18, 5, 0.24), matVinyl(0x138570, 0.52));
    pad.position.z = -0.12;
    grp.add(pad);
    // Crossed Scrabble-style warm butter-gold vinyl tiles: TOP across, WON down (sharing O)
    const cross = [
      { ch: "W", pt: "4", x: 0, y: 0.62, z: 0.08, hi: false },
      { ch: "T", pt: "1", x: -0.62, y: 0, z: 0.08, hi: false },
      { ch: "O", pt: "1", x: 0, y: 0, z: 0.16, hi: true },
      { ch: "P", pt: "3", x: 0.62, y: 0, z: 0.08, hi: false },
      { ch: "N", pt: "1", x: 0, y: -0.62, z: 0.08, hi: false },
    ];
    for (const t of cross) {
      const tile = makeLetterTile(t.ch, t.hi ? "#ffbe3b" : "#fae7be", "#3b2846", t.pt, 0.56, 0.56, 0.18);
      tile.position.set(t.x, t.y, t.z);
      grp.add(tile);
    }
    const sp = makeSpark4(0.14, C.butter); sp.position.set(0.76, 0.72, 0.28); grp.add(sp);
    stage.add(grp);
    return scene;
  },
};

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
camera.position.set(0, 0.45, 4.95);
camera.lookAt(0, 0.0, 0);

async function run() {
  for (const slug of Object.keys(BUILDERS)) {
    const scene = BUILDERS[slug]();
    addShadows(scene);
    renderer.render(scene, camera);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
    await fetch("/save/" + slug, { method: "POST", body: dataUrl });
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
      const b64 = body.replace(/^data:image\/jpeg;base64,/, "");
      const buf = Buffer.from(b64, "base64");
      const outFile = path.join(OUT_DIR, `${slug}.jpg`);
      fs.writeFileSync(outFile, buf);
      saved.push(`${slug}.jpg (${(buf.length / 1024).toFixed(1)} KB)`);
      res.writeHead(200);
      res.end("ok");
    });
    return;
  }
  if (req.method === "POST" && req.url === "/done") {
    res.writeHead(200);
    res.end("bye");
    console.log(`Rendered ${saved.length}/${SLUGS.length} 3D Toybox Vinyl thumbnails:\n  ${saved.join("\n  ")}`);
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
      "--virtual-time-budget=15000",
      url,
    ],
    { stdio: "ignore" }
  );
  setTimeout(() => {
    console.error("Timed out waiting for Chrome render");
    chromeProc?.kill("SIGKILL");
    server.close();
    process.exit(1);
  }, 30000);
});
