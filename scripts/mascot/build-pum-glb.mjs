#!/usr/bin/env node
/**
 * Procedural 3D Vinyl Toy Pum (.glb) generator for pums party.
 *
 * Outputs a spec-compliant glTF 2.0 binary (.glb) containing:
 *   - Smooth SDF-sculpted matte vinyl body (rounded torso + 4 top scallops + 2 stubby legs)
 *     with baked airbrushed rosy cheeks and soft crease AO via linear vertex colors
 *   - Hierarchical 8-joint skeleton (Root, Body, Leg_L, Leg_R, Crest, Arm_L, Arm_R, HeadFace)
 *   - Sculpted vinyl flippers rigged to Arm_L / Arm_R shoulders
 *   - Expressive facial meshes (Eyes, Catchlights, Beak, MouthInner, Tongue) with named
 *     Morph Targets (Shape Keys / Blendshapes) for smooth emotion blending:
 *       Eyes/Catchlights: joy, wow, blink, determined, sleepy
 *       Beak/MouthInner/Tongue: joy, wow, talk, smirk
 *   - 6 ready-to-play animation clips: happy, joy, wow, think, wave, idle
 *
 * Usage: node scripts/mascot/build-pum-glb.mjs [outputPath]
 */

import fs from "node:fs";
import path from "node:path";

const OUT_PATH =
  process.argv[2] ||
  path.resolve(process.cwd(), "public/models/pum.glb");

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const hexToLinear = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
};

function eulerXYZToQuat(rx, ry, rz) {
  const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}

// ---------------------------------------------------------------------------
// SDF primitives for Vinyl Toy Pum's seamless matte-vinyl body
// ---------------------------------------------------------------------------
function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx;
  const qy = Math.abs(y) - by;
  const qz = Math.abs(z) - bz;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  return (
    Math.hypot(ox, oy, oz) +
    Math.min(Math.max(qx, qy, qz), 0) -
    r
  );
}

function sdCapsuleY(x, y, z, cx, y0, y1, cz, r) {
  const cy = clamp(y, y0, y1);
  return Math.hypot(x - cx, y - cy, z - cz) - r;
}

function sdRoundedCylinder(x, y, z, cx, cy, cz, radius, halfHeight, cornerR) {
  const dx = Math.hypot(x - cx, z - cz) - (radius - cornerR);
  const dy = Math.abs(y - cy) - (halfHeight - cornerR);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - cornerR;
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Exact Vinyl Toy Pum seamless body SDF (Y-up, soles resting at y = 0.0).
 * Proportions carefully matched to mascot-happy.png:
 *   - Width:  ~1.22 (x in [-0.61, +0.61])
 *   - Depth:  ~0.88 (z in [-0.44, +0.44])
 *   - Height: ~1.80 (y in [0.00, 1.80])
 */
function bodySDF(x, y, z) {
  // Subtle plush vinyl belly plumpness & gentle taper toward top
  const belly = 0.022 * Math.exp(-Math.pow((y - 0.84) / 0.42, 2));
  const torso =
    sdRoundBox(x, y - 0.96, z, 0.295, 0.34, 0.135, 0.30) - belly;

  // 4 pillowy rounded scallops clustered neatly along top crown
  const bumpXs = [-0.295, -0.098, 0.098, 0.295];
  let bumps = 1e9;
  for (let i = 0; i < 4; i++) {
    const bx = bumpXs[i];
    // Slight arc so outer two bumps sit a hair lower like the vinyl render
    const topY = i === 0 || i === 3 ? 1.665 : 1.68;
    const d = sdCapsuleY(x, y, z, bx, 1.47, topY, 0.0, 0.112);
    bumps = Math.min(bumps, d);
  }
  let d = smin(torso, bumps, 0.070);

  // 2 chunky stubby vinyl legs with soft flat-rounded soles touching y = 0
  const legL = sdRoundedCylinder(x, y, z, -0.275, 0.22, 0.0, 0.205, 0.22, 0.068);
  const legR = sdRoundedCylinder(x, y, z, 0.275, 0.22, 0.0, 0.205, 0.22, 0.068);
  const legs = Math.min(legL, legR);
  d = smin(d, legs, 0.068);

  return d;
}

function bodyGrad(x, y, z) {
  const e = 0.0015;
  const gx = bodySDF(x + e, y, z) - bodySDF(x - e, y, z);
  const gy = bodySDF(x, y + e, z) - bodySDF(x, y - e, z);
  const gz = bodySDF(x, y, z + e) - bodySDF(x, y, z - e);
  const len = Math.hypot(gx, gy, gz) || 1;
  return [gx / len, gy / len, gz / len];
}

// ---------------------------------------------------------------------------
// Surface Nets iso-surface extractor + Taubin smoothing + Newton SDF projection
// ---------------------------------------------------------------------------
function extractBodyMesh() {
  const nx = 56, ny = 72, nz = 42;
  const minX = -0.78, maxX = 0.78;
  const minY = -0.10, maxY = 1.92;
  const minZ = -0.58, maxZ = 0.58;
  const dx = (maxX - minX) / (nx - 1);
  const dy = (maxY - minY) / (ny - 1);
  const dz = (maxZ - minZ) / (nz - 1);

  const strideY = nx;
  const strideZ = nx * ny;
  const field = new Float32Array(nx * ny * nz);

  for (let k = 0; k < nz; k++) {
    const z = minZ + k * dz;
    for (let j = 0; j < ny; j++) {
      const y = minY + j * dy;
      const row = k * strideZ + j * strideY;
      for (let i = 0; i < nx; i++) {
        field[row + i] = bodySDF(minX + i * dx, y, z);
      }
    }
  }

  // Cube corners & edges
  const cornerOff = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  const cellToVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cStrideY = nx - 1;
  const cStrideZ = (nx - 1) * (ny - 1);
  const positions = [];

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        const vals = new Float32Array(8);
        for (let c = 0; c < 8; c++) {
          const [ox, oy, oz] = cornerOff[c];
          const v = field[(k + oz) * strideZ + (j + oy) * strideY + (i + ox)];
          vals[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (let e = 0; e < 12; e++) {
          const [a, b] = edges[e];
          const va = vals[a], vb = vals[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const ca = cornerOff[a], cb = cornerOff[b];
          sx += lerp(ca[0], cb[0], t);
          sy += lerp(ca[1], cb[1], t);
          sz += lerp(ca[2], cb[2], t);
          cnt++;
        }
        const inv = 1 / cnt;
        const vx = minX + (i + sx * inv) * dx;
        const vy = minY + (j + sy * inv) * dy;
        const vz = minZ + (k + sz * inv) * dz;

        const vid = positions.length / 3;
        positions.push(vx, vy, vz);
        cellToVert[k * cStrideZ + j * cStrideY + i] = vid;
      }
    }
  }

  const indices = [];
  const pushQuad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) {
      indices.push(a, c, b, a, d, c);
    } else {
      indices.push(a, b, c, a, c, d);
    }
  };

  // Emit quads for each interior sign-changing grid edge along X, Y, Z
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v0 = field[k * strideZ + j * strideY + i];
        const inside0 = v0 < 0;

        // Edge along +X: (i,j,k) -> (i+1,j,k), surrounded by 4 cells in (j-1..j, k-1..k)
        if (i < nx - 1) {
          const v1 = field[k * strideZ + j * strideY + (i + 1)];
          if ((v1 < 0) !== inside0) {
            const c00 = cellToVert[(k - 1) * cStrideZ + (j - 1) * cStrideY + i];
            const c10 = cellToVert[(k - 1) * cStrideZ + j * cStrideY + i];
            const c11 = cellToVert[k * cStrideZ + j * cStrideY + i];
            const c01 = cellToVert[k * cStrideZ + (j - 1) * cStrideY + i];
            pushQuad(c00, c10, c11, c01, !inside0);
          }
        }
        // Edge along +Y
        if (j < ny - 1) {
          const v1 = field[k * strideZ + (j + 1) * strideY + i];
          if ((v1 < 0) !== inside0) {
            const c00 = cellToVert[(k - 1) * cStrideZ + j * cStrideY + (i - 1)];
            const c10 = cellToVert[k * cStrideZ + j * cStrideY + (i - 1)];
            const c11 = cellToVert[k * cStrideZ + j * cStrideY + i];
            const c01 = cellToVert[(k - 1) * cStrideZ + j * cStrideY + i];
            pushQuad(c00, c10, c11, c01, !inside0);
          }
        }
        // Edge along +Z
        if (k < nz - 1) {
          const v1 = field[(k + 1) * strideZ + j * strideY + i];
          if ((v1 < 0) !== inside0) {
            const c00 = cellToVert[k * cStrideZ + (j - 1) * cStrideY + (i - 1)];
            const c10 = cellToVert[k * cStrideZ + (j - 1) * cStrideY + i];
            const c11 = cellToVert[k * cStrideZ + j * cStrideY + i];
            const c01 = cellToVert[k * cStrideZ + j * cStrideY + (i - 1)];
            pushQuad(c00, c10, c11, c01, !inside0);
          }
        }
      }
    }
  }

  const vCount = positions.length / 3;
  const pos = new Float32Array(positions);

  // Build adjacency for Taubin smoothing
  const neighbors = Array.from({ length: vCount }, () => []);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    neighbors[a].push(b, c);
    neighbors[b].push(a, c);
    neighbors[c].push(a, b);
  }
  const uniqNeighbors = neighbors.map((arr) => Array.from(new Set(arr)));

  const tmp = new Float32Array(pos.length);
  const laplacianStep = (factor) => {
    for (let i = 0; i < vCount; i++) {
      const nb = uniqNeighbors[i];
      if (!nb.length) {
        tmp[i * 3] = pos[i * 3];
        tmp[i * 3 + 1] = pos[i * 3 + 1];
        tmp[i * 3 + 2] = pos[i * 3 + 2];
        continue;
      }
      let ax = 0, ay = 0, az = 0;
      for (let m = 0; m < nb.length; m++) {
        const j = nb[m] * 3;
        ax += pos[j]; ay += pos[j + 1]; az += pos[j + 2];
      }
      const inv = 1 / nb.length;
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      tmp[i * 3] = px + factor * (ax * inv - px);
      tmp[i * 3 + 1] = py + factor * (ay * inv - py);
      tmp[i * 3 + 2] = pz + factor * (az * inv - pz);
    }
    pos.set(tmp);
  };

  // Taubin smooth + exact Newton projection back onto SDF = 0
  for (let iter = 0; iter < 12; iter++) {
    laplacianStep(0.46);
    laplacianStep(-0.48);
  }
  for (let proj = 0; proj < 3; proj++) {
    for (let i = 0; i < vCount; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const f = bodySDF(x, y, z);
      const [gx, gy, gz] = bodyGrad(x, y, z);
      pos[i * 3] = x - f * gx;
      pos[i * 3 + 1] = y - f * gy;
      pos[i * 3 + 2] = z - f * gz;
    }
  }
  // Gentle final tangential relax + reproject for glass-smooth shading
  for (let k = 0; k < 2; k++) {
    laplacianStep(0.28);
    for (let i = 0; i < vCount; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const f = bodySDF(x, y, z);
      const [gx, gy, gz] = bodyGrad(x, y, z);
      pos[i * 3] = x - f * gx;
      pos[i * 3 + 1] = y - f * gy;
      pos[i * 3 + 2] = z - f * gz;
    }
  }

  // Exact analytical normals + baked linear vertex colors (cream + rosy cheeks + soft crease AO)
  // + smooth skeletal weights (Body=1, Leg_L=2, Leg_R=3, Crest=4)
  const normals = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const joints = new Uint16Array(vCount * 4);
  const weights = new Float32Array(vCount * 4);

  const creamLin = hexToLinear("#f7ecdc");
  const cheekLin = hexToLinear("#f28f6e");
  const aoTint = hexToLinear("#d8c2ab");

  // Verify triangle winding against outward SDF gradient and flip if needed
  let outwardDotSum = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3, ib = indices[t + 1] * 3, ic = indices[t + 2] * 3;
    const ux = pos[ib] - pos[ia], uy = pos[ib + 1] - pos[ia + 1], uz = pos[ib + 2] - pos[ia + 2];
    const vx = pos[ic] - pos[ia], vy = pos[ic + 1] - pos[ia + 1], vz = pos[ic + 2] - pos[ia + 2];
    const nxT = uy * vz - uz * vy;
    const nyT = uz * vx - ux * vz;
    const nzT = ux * vy - uy * vx;
    const cx = (pos[ia] + pos[ib] + pos[ic]) / 3;
    const cy = (pos[ia + 1] + pos[ib + 1] + pos[ic + 1]) / 3;
    const cz = (pos[ia + 2] + pos[ib + 2] + pos[ic + 2]) / 3;
    const [gx, gy, gz] = bodyGrad(cx, cy, cz);
    outwardDotSum += nxT * gx + nyT * gy + nzT * gz;
  }
  if (outwardDotSum < 0) {
    for (let t = 0; t < indices.length; t += 3) {
      const tmpI = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = tmpI;
    }
  }

  for (let i = 0; i < vCount; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const [gx, gy, gz] = bodyGrad(x, y, z);
    normals[i * 3] = gx;
    normals[i * 3 + 1] = gy;
    normals[i * 3 + 2] = gz;

    // Soft SDF ambient occlusion probe along normal
    const d1 = bodySDF(x + gx * 0.045, y + gy * 0.045, z + gz * 0.045);
    const d2 = bodySDF(x + gx * 0.11, y + gy * 0.11, z + gz * 0.11);
    const ao = clamp(0.5 * (d1 / 0.045) + 0.5 * (d2 / 0.11), 0.35, 1.0);
    const aoBlend = (1 - ao) * 0.52;

    // Airbrushed rosy peach cheeks on front (+Z) below outer corners of beak
    const frontMask = smoothstep(0.18, 0.36, z);
    const dxL = (x + 0.34) / 0.16;
    const dxR = (x - 0.34) / 0.16;
    const dyC = (y - 0.785) / 0.12;
    const cheek =
      frontMask *
      Math.max(
        Math.exp(-(dxL * dxL + dyC * dyC)),
        Math.exp(-(dxR * dxR + dyC * dyC))
      ) *
      0.52;

    for (let c = 0; c < 3; c++) {
      let col = lerp(creamLin[c], aoTint[c], aoBlend);
      col = lerp(col, cheekLin[c], cheek);
      colors[i * 3 + c] = col;
    }

    // Smooth skin weights: Body(1), Leg_L(2), Leg_R(3), Crest(4)
    const legZone = 1 - smoothstep(0.24, 0.44, y);
    const wLegL = legZone * (1 - smoothstep(-0.08, 0.08, x));
    const wLegR = legZone * smoothstep(-0.08, 0.08, x);
    const wCrest = smoothstep(1.48, 1.62, y) * 0.85;
    let wBody = Math.max(0, 1 - wLegL - wLegR - wCrest);
    const wSum = wBody + wLegL + wLegR + wCrest || 1;

    joints[i * 4 + 0] = 1; // Body
    joints[i * 4 + 1] = 2; // Leg_L
    joints[i * 4 + 2] = 3; // Leg_R
    joints[i * 4 + 3] = 4; // Crest

    weights[i * 4 + 0] = wBody / wSum;
    weights[i * 4 + 1] = wLegL / wSum;
    weights[i * 4 + 2] = wLegR / wSum;
    weights[i * 4 + 3] = wCrest / wSum;
  }

  return {
    positions: pos,
    normals,
    colors,
    joints,
    weights,
    indices: new Uint32Array(indices),
  };
}

// ---------------------------------------------------------------------------
// Sculpted Flipper Arm Mesh (local space: shoulder pivot at origin, arm extends along +X or -X)
// ---------------------------------------------------------------------------
function buildFlipperMesh(side) {
  // side = -1 for Arm_L (extends -X), +1 for Arm_R (extends +X)
  const segU = 22; // along arm length
  const segV = 20; // around circumference
  const len = 0.44;

  const positions = [];
  const normals = [];
  const indices = [];

  // Teardrop plump vinyl flipper profile along t in [0, 1]
  // Slightly inset past pivot (-0.05) so shoulder never shows a seam during wide rotations
  const profile = (t) => {
    const s = Math.sin(Math.PI * t);
    const taper = lerp(0.86, 1.15, Math.pow(t, 0.65));
    const rx = 0.118 * Math.pow(s, 0.50) * taper;
    const rz = 0.106 * Math.pow(s, 0.50) * taper;
    const x = side * (-0.05 + t * (len + 0.05));
    const y = 0.025 * t * t;
    return { x, y, rx, rz };
  };

  for (let iu = 0; iu <= segU; iu++) {
    const t = iu / segU;
    const p = profile(t);
    const dt = 0.002;
    const p0 = profile(Math.max(0, t - dt));
    const p1 = profile(Math.min(1, t + dt));
    const tx = p1.x - p0.x, ty = p1.y - p0.y;
    const drx = p1.rx - p0.rx, drz = p1.rz - p0.rz;

    for (let iv = 0; iv <= segV; iv++) {
      const phi = (iv / segV) * Math.PI * 2;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const px = p.x;
      const py = p.y + p.rx * cp;
      const pz = p.rz * sp;
      positions.push(px, py, pz);

      if (iu === 0) {
        normals.push(-side, 0, 0);
      } else if (iu === segU) {
        normals.push(side, 0, 0);
      } else {
        // Tangent along u and v
        const dux = tx;
        const duy = ty + drx * cp;
        const duz = drz * sp;
        const dvx = 0;
        const dvy = -p.rx * sp;
        const dvz = p.rz * cp;
        // Normal = cross(du, dv) * side
        let nx = (duy * dvz - duz * dvy) * side;
        let ny = (duz * dvx - dux * dvz) * side;
        let nz = (dux * dvy - duy * dvx) * side;
        const l = Math.hypot(nx, ny, nz) || 1;
        normals.push(nx / l, ny / l, nz / l);
      }
    }
  }

  const ring = segV + 1;
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = iu * ring + iv;
      const b = (iu + 1) * ring + iv;
      const c = (iu + 1) * ring + (iv + 1);
      const d = iu * ring + (iv + 1);
      if (side > 0) {
        indices.push(a, c, b, a, d, c);
      } else {
        indices.push(a, b, c, a, c, d);
      }
    }
  }
  const posArr = new Float32Array(positions);
  const idxArr = new Uint16Array(indices);
  // Guarantee outward winding relative to flipper centroid
  let volCheck = 0;
  const cx = side * (len * 0.45);
  for (let t = 0; t < idxArr.length; t += 3) {
    const ia = idxArr[t] * 3, ib = idxArr[t + 1] * 3, ic = idxArr[t + 2] * 3;
    const ux = posArr[ib] - posArr[ia], uy = posArr[ib + 1] - posArr[ia + 1], uz = posArr[ib + 2] - posArr[ia + 2];
    const vx = posArr[ic] - posArr[ia], vy = posArr[ic + 1] - posArr[ia + 1], vz = posArr[ic + 2] - posArr[ia + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    volCheck += nx * (posArr[ia] - cx) + ny * posArr[ia + 1] + nz * posArr[ia + 2];
  }
  if (volCheck < 0) {
    for (let t = 0; t < idxArr.length; t += 3) {
      const tmp = idxArr[t + 1]; idxArr[t + 1] = idxArr[t + 2]; idxArr[t + 2] = tmp;
    }
  }
  const smoothNorms = computeVertexNormals(posArr, idxArr);

  return {
    positions: posArr,
    normals: smoothNorms,
    indices: idxArr,
  };
}

// ---------------------------------------------------------------------------
// Compute smooth vertex normals for indexed mesh (used by morphable face meshes)
// ---------------------------------------------------------------------------
function computeVertexNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const ux = positions[ib] - ax, uy = positions[ib + 1] - ay, uz = positions[ib + 2] - az;
    const vx = positions[ic] - ax, vy = positions[ic + 1] - ay, vz = positions[ic + 2] - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
  }
  return normals;
}

// ---------------------------------------------------------------------------
// Expressive Morph-Target Eyes (paired glossy dark-plum vinyl tubes)
//   Base: happy vertical pill eyes (mascot-happy.png)
//   Morphs: joy (^ ^), wow (O O), blink (- -), determined, sleepy
// ---------------------------------------------------------------------------
function buildEyesMesh() {
  const segU = 24;
  const segV = 16;
  const eyeSides = [-1, 1];

  const evalEyesPositions = (mode) => {
    const out = [];
    for (const side of eyeSides) {
      const baseCx = side * 0.145;
      const baseCy = 1.155;
      const baseCz = 0.422;

      const evalSpine = (s) => {
        // s in [-1, 1]
        if (mode === "happy") {
          return {
            cx: baseCx,
            cy: baseCy + s * 0.044,
            cz: baseCz,
            rx: 0.052,
            ry: 0.052,
            rz: 0.036,
          };
        }
        if (mode === "joy") {
          // Upturned happy arc (^ ^) matching mascot-joy.png
          const ang = lerp(Math.PI * 0.92, Math.PI * 0.08, (s + 1) * 0.5);
          const arcR = 0.092;
          return {
            cx: side * 0.165 + Math.cos(ang) * arcR,
            cy: baseCy - 0.01 + Math.sin(ang) * arcR * 0.88,
            cz: baseCz + 0.005,
            rx: 0.026,
            ry: 0.026,
            rz: 0.024,
          };
        }
        if (mode === "wow") {
          // Wider, rounder surprised bead eyes matching mascot-wow.png
          return {
            cx: side * 0.155,
            cy: baseCy + 0.012 + s * 0.010,
            cz: baseCz + 0.008,
            rx: 0.072,
            ry: 0.072,
            rz: 0.042,
          };
        }
        if (mode === "blink") {
          // Cute closed horizontal smiling line
          return {
            cx: baseCx + s * 0.068,
            cy: baseCy - 0.01 + (1 - s * s) * 0.012,
            cz: baseCz + 0.004,
            rx: 0.016,
            ry: 0.016,
            rz: 0.020,
          };
        }
        if (mode === "determined") {
          // Playful competitive brow tilt
          const tilt = -side * 0.022 * s;
          return {
            cx: baseCx + tilt,
            cy: baseCy + s * 0.038,
            cz: baseCz + 0.004,
            rx: 0.052,
            ry: 0.046,
            rz: 0.036,
          };
        }
        // sleepy
        return {
          cx: baseCx + s * 0.052,
          cy: baseCy - 0.018 - (1 - s * s) * 0.018,
          cz: baseCz + 0.004,
          rx: 0.022,
          ry: 0.022,
          rz: 0.022,
        };
      };

      // Parametric closed capsule/tube with hemispherical endcaps
      for (let iu = 0; iu <= segU; iu++) {
        const u = iu / segU; // 0..1
        // Reserve 4 rings at each end for smooth hemisphere caps
        let s, capScale, capOffset;
        const capFrac = 0.20;
        if (u < capFrac) {
          const a = (u / capFrac) * (Math.PI * 0.5);
          s = -1;
          capScale = Math.sin(a);
          capOffset = -Math.cos(a);
        } else if (u > 1 - capFrac) {
          const a = ((1 - u) / capFrac) * (Math.PI * 0.5);
          s = 1;
          capScale = Math.sin(a);
          capOffset = Math.cos(a);
        } else {
          s = lerp(-1, 1, (u - capFrac) / (1 - 2 * capFrac));
          capScale = 1;
          capOffset = 0;
        }

        const p = evalSpine(s);
        const pPrev = evalSpine(clamp(s - 0.02, -1, 1));
        const pNext = evalSpine(clamp(s + 0.02, -1, 1));
        let tx = pNext.cx - pPrev.cx;
        let ty = pNext.cy - pPrev.cy;
        const tl = Math.hypot(tx, ty);
        if (tl < 1e-6) { tx = 0; ty = 1; } else { tx /= tl; ty /= tl; }
        // In-plane perpendicular (XY) and Z axis
        const nx = -ty, ny = tx;

        for (let iv = 0; iv <= segV; iv++) {
          const phi = (iv / segV) * Math.PI * 2;
          const cp = Math.cos(phi), sp = Math.sin(phi);
          const offT = capOffset * p.rx;
          const radXY = capScale * p.rx;
          const radZ = capScale * p.rz;

          const px = p.cx + tx * offT + nx * (radXY * cp);
          const py = p.cy + ty * offT + ny * (radXY * cp);
          const pz = p.cz + radZ * sp;
          out.push(px, py, pz);
        }
      }
    }
    return new Float32Array(out);
  };

  const indices = [];
  const ring = segV + 1;
  const vertsPerEye = (segU + 1) * ring;
  for (let e = 0; e < 2; e++) {
    const base = e * vertsPerEye;
    for (let iu = 0; iu < segU; iu++) {
      for (let iv = 0; iv < segV; iv++) {
        const a = base + iu * ring + iv;
        const b = base + (iu + 1) * ring + iv;
        const c = base + (iu + 1) * ring + (iv + 1);
        const d = base + iu * ring + (iv + 1);
        indices.push(a, b, c, a, c, d);
      }
    }
  }
  const idx = new Uint16Array(indices);
  const basePos = evalEyesPositions("happy");
  // Guarantee outward winding for Eyes (check signed volume relative to eye centers)
  let eyeDot = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 3, ib = idx[t + 1] * 3, ic = idx[t + 2] * 3;
    const ux = basePos[ib] - basePos[ia], uy = basePos[ib + 1] - basePos[ia + 1], uz = basePos[ib + 2] - basePos[ia + 2];
    const vx = basePos[ic] - basePos[ia], vy = basePos[ic + 1] - basePos[ia + 1], vz = basePos[ic + 2] - basePos[ia + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ecx = basePos[ia] < 0 ? -0.145 : 0.145;
    eyeDot += nx * (basePos[ia] - ecx) + ny * (basePos[ia + 1] - 1.155) + nz * (basePos[ia + 2] - 0.422);
  }
  if (eyeDot < 0) {
    for (let t = 0; t < idx.length; t += 3) {
      const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp;
    }
  }
  const baseNorm = computeVertexNormals(basePos, idx);

  const morphNames = ["joy", "wow", "blink", "determined", "sleepy"];
  const targets = morphNames.map((name) => {
    const p = evalEyesPositions(name);
    const delta = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) delta[i] = p[i] - basePos[i];
    return { name, delta };
  });

  return { positions: basePos, normals: baseNorm, indices: idx, targets };
}

// ---------------------------------------------------------------------------
// Glossy Eye Catchlights (matches mascot-wow.png bright sparkle dots, hides cleanly on joy/blink)
// ---------------------------------------------------------------------------
function buildCatchlightsMesh() {
  const segLat = 8, segLon = 12;
  const evalPos = (mode) => {
    const out = [];
    for (const side of [-1, 1]) {
      // Primary + secondary sparkle beads on each eye
      const specs =
        mode === "wow"
          ? [
              { x: side * 0.155 - 0.022, y: 1.192, z: 0.464, r: 0.022 },
              { x: side * 0.155 + 0.020, y: 1.138, z: 0.462, r: 0.011 },
            ]
          : mode === "happy" || mode === "determined"
          ? [
              { x: side * 0.145 - 0.015, y: 1.186, z: 0.453, r: 0.014 },
              { x: side * 0.145 + 0.012, y: 1.135, z: 0.440, r: 0.0005 },
            ]
          : [
              // Tucked cleanly inside eye during joy / blink / sleepy
              { x: side * 0.15, y: 1.15, z: 0.40, r: 0.0005 },
              { x: side * 0.15, y: 1.15, z: 0.40, r: 0.0005 },
            ];

      for (const s of specs) {
        for (let la = 0; la <= segLat; la++) {
          const theta = (la / segLat) * Math.PI;
          const st = Math.sin(theta), ct = Math.cos(theta);
          for (let lo = 0; lo <= segLon; lo++) {
            const phi = (lo / segLon) * Math.PI * 2;
            out.push(
              s.x + s.r * st * Math.cos(phi),
              s.y + s.r * ct,
              s.z + s.r * 0.5 * st * Math.sin(phi)
            );
          }
        }
      }
    }
    return new Float32Array(out);
  };

  const indices = [];
  const ring = segLon + 1;
  const perSphere = (segLat + 1) * ring;
  for (let s = 0; s < 4; s++) {
    const base = s * perSphere;
    for (let la = 0; la < segLat; la++) {
      for (let lo = 0; lo < segLon; lo++) {
        const a = base + la * ring + lo;
        const b = base + (la + 1) * ring + lo;
        const c = base + (la + 1) * ring + (lo + 1);
        const d = base + la * ring + (lo + 1);
        indices.push(a, c, b, a, d, c);
      }
    }
  }
  const idx = new Uint16Array(indices);
  const basePos = evalPos("happy");
  const baseNorm = computeVertexNormals(basePos, idx);
  const morphNames = ["joy", "wow", "blink", "determined", "sleepy"];
  const targets = morphNames.map((name) => {
    const p = evalPos(name);
    const delta = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) delta[i] = p[i] - basePos[i];
    return { name, delta };
  });
  return { positions: basePos, normals: baseNorm, indices: idx, targets };
}

// ---------------------------------------------------------------------------
// Expressive Morph-Target Duck Beak (continuous lip-torus surface)
//   Base: happy plump wide oval duck bill (mascot-happy.png)
//   Morphs: joy (wide joyful open grin), wow (surprised centered "o"), talk, smirk
// ---------------------------------------------------------------------------
function buildBeakMesh() {
  const segU = 56; // around mouth perimeter theta in [0, 2*PI)
  const segV = 24; // around lip tube cross-section phi in [0, 2*PI)

  const evalBeakPos = (mode) => {
    const out = [];
    const baseY = 0.94;
    const baseZ = 0.448;

    for (let iu = 0; iu <= segU; iu++) {
      const theta = (iu / segU) * Math.PI * 2;
      const ct = Math.cos(theta); // +1 right corner, -1 left corner
      const st = Math.sin(theta); // +1 upper lip, -1 lower lip
      const isUpper = st >= 0;
      const centerWeight = Math.pow(Math.abs(st), 1.25);

      let rx = 0.375;
      let cx, cy, cz, tubeR, tubeZ;

      if (mode === "happy") {
        // Plump wide closed oval duck bill (upper & lower rims fuse into one smooth pillow)
        rx = 0.375;
        cx = rx * ct;
        const smileCurve = 0.008 * ct * ct;
        cy = baseY + smileCurve + st * 0.018;
        cz = baseZ + 0.068 * (1 - 0.85 * ct * ct);
        tubeR = lerp(0.044, 0.088, Math.pow(Math.abs(st), 0.55));
        tubeZ = lerp(0.042, 0.086, Math.pow(Math.abs(st), 0.55));
      } else if (mode === "joy") {
        // Big joyful wide open smiling duck bill (mascot-joy.png!)
        rx = 0.365;
        cx = rx * ct;
        if (isUpper) {
          cy = baseY + 0.032 + st * 0.056;
          tubeR = lerp(0.038, 0.054, Math.abs(st));
        } else {
          cy = baseY + 0.032 + st * 0.172;
          tubeR = lerp(0.038, 0.058, Math.abs(st));
        }
        cz = baseZ + 0.076 * (1 - 0.78 * ct * ct);
        tubeZ = tubeR * 1.22;
      } else if (mode === "wow") {
        // Wide vinyl duck bill parted in the middle into a cute oval "o" gasp (mascot-wow.png!)
        rx = 0.375;
        cx = rx * ct;
        const oGate = Math.pow(Math.abs(st), 2.8);
        cy = baseY + st * (0.024 + 0.056 * oGate);
        cz = baseZ + 0.074 * (1 - 0.82 * ct * ct);
        tubeR = lerp(0.038, 0.064, Math.pow(Math.abs(st), 0.65));
        tubeZ = tubeR * 1.18;
      } else if (mode === "talk") {
        rx = 0.36;
        cx = rx * ct;
        cy = baseY + (isUpper ? st * 0.056 : st * 0.102);
        cz = baseZ + 0.074 * (1 - 0.80 * ct * ct);
        tubeR = lerp(0.036, 0.056, Math.abs(st));
        tubeZ = tubeR * 1.16;
      } else {
        // smirk: cute cheeky tilted smile for thinking/confident poses
        rx = 0.365;
        cx = rx * ct + 0.014;
        const asym = 0.036 * ct + 0.020 * ct * ct;
        cy = baseY + asym + st * 0.032;
        cz = baseZ + 0.068 * (1 - 0.85 * ct * ct);
        tubeR = lerp(0.036, 0.068, Math.pow(Math.abs(st), 0.65));
        tubeZ = tubeR * 1.12;
      }

      const ox = ct;
      const oy = st;
      const ol = Math.hypot(ox, oy) || 1;
      const rdx = ox / ol, rdy = oy / ol;

      for (let iv = 0; iv <= segV; iv++) {
        const phi = (iv / segV) * Math.PI * 2;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);

        const inScale = mode === "happy" && cp < 0 ? 0.90 : 1.0;
        const rLocal = tubeR * inScale;

        const px = cx + rdx * rLocal * cp * (0.45 + 0.55 * centerWeight);
        const py = cy + rdy * rLocal * cp;
        const pz = cz + tubeZ * sp;
        out.push(px, py, pz);
      }
    }
    return new Float32Array(out);
  };

  const indices = [];
  const ring = segV + 1;
  for (let iu = 0; iu < segU; iu++) {
    for (let iv = 0; iv < segV; iv++) {
      const a = iu * ring + iv;
      const b = (iu + 1) * ring + iv;
      const c = (iu + 1) * ring + (iv + 1);
      const d = iu * ring + (iv + 1);
      indices.push(a, b, c, a, c, d);
    }
  }
  const idx = new Uint16Array(indices);
  const basePos = evalBeakPos("happy");
  // Guarantee outward normals on the front of the beak (dot with +Z where pz > maxZ - 0.02)
  let maxZ = -Infinity;
  for (let i = 2; i < basePos.length; i += 3) if (basePos[i] > maxZ) maxZ = basePos[i];
  let frontDot = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 3, ib = idx[t + 1] * 3, ic = idx[t + 2] * 3;
    const avgZ = (basePos[ia + 2] + basePos[ib + 2] + basePos[ic + 2]) / 3;
    if (avgZ < maxZ - 0.03) continue;
    const ux = basePos[ib] - basePos[ia], uy = basePos[ib + 1] - basePos[ia + 1], uz = basePos[ib + 2] - basePos[ia + 2];
    const vx = basePos[ic] - basePos[ia], vy = basePos[ic + 1] - basePos[ia + 1], vz = basePos[ic + 2] - basePos[ia + 2];
    const nz = ux * vy - uy * vx;
    frontDot += nz;
  }
  if (frontDot < 0) {
    for (let t = 0; t < idx.length; t += 3) {
      const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp;
    }
  }
  const baseNorm = computeVertexNormals(basePos, idx);

  const morphNames = ["joy", "wow", "talk", "smirk"];
  const targets = morphNames.map((name) => {
    const p = evalBeakPos(name);
    const delta = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) delta[i] = p[i] - basePos[i];
    return { name, delta };
  });

  return { positions: basePos, normals: baseNorm, indices: idx, targets };
}

// ---------------------------------------------------------------------------
// Inner Mouth Cavity & Plump Coral Tongue (morph cleanly to match Beak!)
// ---------------------------------------------------------------------------
function buildMouthInnerMesh() {
  const segLat = 12, segLon = 18;
  const evalPos = (mode) => {
    const out = [];
    const cfg =
      mode === "joy"
        ? { y: 0.915, z: 0.470, rx: 0.28, ry: 0.112, rz: 0.036 }
        : mode === "wow"
        ? { y: 0.940, z: 0.486, rx: 0.118, ry: 0.048, rz: 0.032 }
        : mode === "talk"
        ? { y: 0.924, z: 0.474, rx: 0.21, ry: 0.072, rz: 0.030 }
        : { y: 0.940, z: 0.422, rx: 0.035, ry: 0.010, rz: 0.008 }; // tucked safely inside beak

    for (let la = 0; la <= segLat; la++) {
      const theta = (la / segLat) * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta);
      for (let lo = 0; lo <= segLon; lo++) {
        const phi = (lo / segLon) * Math.PI * 2;
        out.push(
          cfg.rx * st * Math.cos(phi),
          cfg.y + cfg.ry * ct,
          cfg.z + cfg.rz * st * Math.sin(phi)
        );
      }
    }
    return new Float32Array(out);
  };

  const indices = [];
  const ring = segLon + 1;
  for (let la = 0; la < segLat; la++) {
    for (let lo = 0; lo < segLon; lo++) {
      const a = la * ring + lo;
      const b = (la + 1) * ring + lo;
      const c = (la + 1) * ring + (lo + 1);
      const d = la * ring + (lo + 1);
      indices.push(a, c, b, a, d, c);
    }
  }
  const idx = new Uint16Array(indices);
  const basePos = evalPos("happy");
  const joyCheck = evalPos("joy");
  // Ensure outward normals on MouthInner (+Z on front half)
  let mDot = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 3, ib = idx[t + 1] * 3, ic = idx[t + 2] * 3;
    const ux = joyCheck[ib] - joyCheck[ia], uy = joyCheck[ib + 1] - joyCheck[ia + 1], uz = joyCheck[ib + 2] - joyCheck[ia + 2];
    const vx = joyCheck[ic] - joyCheck[ia], vy = joyCheck[ic + 1] - joyCheck[ia + 1], vz = joyCheck[ic + 2] - joyCheck[ia + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    mDot += nx * joyCheck[ia] + ny * (joyCheck[ia + 1] - 0.915) + nz * (joyCheck[ia + 2] - 0.470);
  }
  if (mDot < 0) {
    for (let t = 0; t < idx.length; t += 3) {
      const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp;
    }
  }
  const baseNorm = computeVertexNormals(basePos, idx);
  const morphNames = ["joy", "wow", "talk", "smirk"];
  const targets = morphNames.map((name) => {
    const p = evalPos(name);
    const delta = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) delta[i] = p[i] - basePos[i];
    return { name, delta };
  });
  return { positions: basePos, normals: baseNorm, indices: idx, targets };
}

function buildTongueMesh() {
  const segLat = 12, segLon = 20;
  const evalPos = (mode) => {
    const out = [];
    const cfg =
      mode === "joy"
        ? { y: 0.858, z: 0.502, rx: 0.120, ry: 0.046, rz: 0.046 }
        : mode === "talk"
        ? { y: 0.882, z: 0.492, rx: 0.085, ry: 0.032, rz: 0.034 }
        : { y: 0.935, z: 0.418, rx: 0.010, ry: 0.006, rz: 0.006 }; // hidden inside closed beak / wow

    for (let la = 0; la <= segLat; la++) {
      const theta = (la / segLat) * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta);
      for (let lo = 0; lo <= segLon; lo++) {
        const phi = (lo / segLon) * Math.PI * 2;
        const cp = Math.cos(phi);
        // Cute tiny central tongue dimple along top
        const dimple = ct > 0 ? 1 - 0.14 * Math.exp(-Math.pow(cp / 0.28, 2)) : 1;
        out.push(
          cfg.rx * st * cp,
          cfg.y + cfg.ry * ct * dimple,
          cfg.z + cfg.rz * st * Math.sin(phi)
        );
      }
    }
    return new Float32Array(out);
  };

  const indices = [];
  const ring = segLon + 1;
  for (let la = 0; la < segLat; la++) {
    for (let lo = 0; lo < segLon; lo++) {
      const a = la * ring + lo;
      const b = (la + 1) * ring + lo;
      const c = (la + 1) * ring + (lo + 1);
      const d = la * ring + (lo + 1);
      indices.push(a, c, b, a, d, c);
    }
  }
  const idx = new Uint16Array(indices);
  const basePos = evalPos("happy");
  const joyCheck = evalPos("joy");
  // Ensure outward normals on MouthInner (+Z on front half)
  let mDot = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 3, ib = idx[t + 1] * 3, ic = idx[t + 2] * 3;
    const ux = joyCheck[ib] - joyCheck[ia], uy = joyCheck[ib + 1] - joyCheck[ia + 1], uz = joyCheck[ib + 2] - joyCheck[ia + 2];
    const vx = joyCheck[ic] - joyCheck[ia], vy = joyCheck[ic + 1] - joyCheck[ia + 1], vz = joyCheck[ic + 2] - joyCheck[ia + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    mDot += nx * joyCheck[ia] + ny * (joyCheck[ia + 1] - 0.915) + nz * (joyCheck[ia + 2] - 0.470);
  }
  if (mDot < 0) {
    for (let t = 0; t < idx.length; t += 3) {
      const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp;
    }
  }
  const baseNorm = computeVertexNormals(basePos, idx);
  const morphNames = ["joy", "wow", "talk", "smirk"];
  const targets = morphNames.map((name) => {
    const p = evalPos(name);
    const delta = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) delta[i] = p[i] - basePos[i];
    return { name, delta };
  });
  return { positions: basePos, normals: baseNorm, indices: idx, targets };
}

// ---------------------------------------------------------------------------
// Minimal spec-compliant glTF 2.0 binary (.glb) builder
// ---------------------------------------------------------------------------
class GlbBuilder {
  constructor() {
    this.chunks = [];
    this.byteLength = 0;
    this.bufferViews = [];
    this.accessors = [];
    this.materials = [];
    this.meshes = [];
    this.nodes = [];
    this.skins = [];
    this.animations = [];
  }

  _pad4() {
    const rem = this.byteLength & 3;
    if (rem) {
      const pad = 4 - rem;
      this.chunks.push(Buffer.alloc(pad));
      this.byteLength += pad;
    }
  }

  addBufferView(typedArray, target) {
    this._pad4();
    const buf = Buffer.from(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength
    );
    const bv = {
      buffer: 0,
      byteOffset: this.byteLength,
      byteLength: buf.byteLength,
    };
    if (target) bv.target = target;
    this.chunks.push(buf);
    this.byteLength += buf.byteLength;
    const idx = this.bufferViews.length;
    this.bufferViews.push(bv);
    return idx;
  }

  addAccessor(typedArray, componentType, type, target, includeMinMax = false) {
    const bv = this.addBufferView(typedArray, target);
    const compCount =
      type === "SCALAR" ? 1 : type === "VEC2" ? 2 : type === "VEC3" ? 3 : type === "VEC4" ? 4 : 16;
    const count = typedArray.length / compCount;
    const acc = {
      bufferView: bv,
      componentType,
      count,
      type,
    };
    if (includeMinMax) {
      const min = new Array(compCount).fill(Infinity);
      const max = new Array(compCount).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < compCount; c++) {
          const v = typedArray[i * compCount + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      acc.min = min;
      acc.max = max;
    }
    const idx = this.accessors.length;
    this.accessors.push(acc);
    return idx;
  }

  addMesh(name, geom, materialIdx) {
    const ARRAY_BUFFER = 34962;
    const ELEMENT_ARRAY_BUFFER = 34963;
    const FLOAT = 5126;
    const UNSIGNED_SHORT = 5123;
    const UNSIGNED_INT = 5125;

    const attributes = {
      POSITION: this.addAccessor(geom.positions, FLOAT, "VEC3", ARRAY_BUFFER, true),
      NORMAL: this.addAccessor(geom.normals, FLOAT, "VEC3", ARRAY_BUFFER, false),
    };
    if (geom.colors) {
      attributes.COLOR_0 = this.addAccessor(geom.colors, FLOAT, "VEC3", ARRAY_BUFFER, false);
    }
    if (geom.joints) {
      attributes.JOINTS_0 = this.addAccessor(geom.joints, UNSIGNED_SHORT, "VEC4", ARRAY_BUFFER, false);
      attributes.WEIGHTS_0 = this.addAccessor(geom.weights, FLOAT, "VEC4", ARRAY_BUFFER, false);
    }

    const idxType = geom.indices instanceof Uint32Array ? UNSIGNED_INT : UNSIGNED_SHORT;
    const indicesAcc = this.addAccessor(geom.indices, idxType, "SCALAR", ELEMENT_ARRAY_BUFFER, false);

    const prim = {
      attributes,
      indices: indicesAcc,
      material: materialIdx,
    };

    const mesh = { name, primitives: [prim] };
    if (geom.targets && geom.targets.length) {
      prim.targets = geom.targets.map((t) => ({
        POSITION: this.addAccessor(t.delta, FLOAT, "VEC3", ARRAY_BUFFER, true),
      }));
      mesh.weights = geom.targets.map(() => 0);
      mesh.extras = { targetNames: geom.targets.map((t) => t.name) };
    }

    const idx = this.meshes.length;
    this.meshes.push(mesh);
    return idx;
  }

  addAnimation(name, tracks) {
    const FLOAT = 5126;
    const samplers = [];
    const channels = [];
    for (const tr of tracks) {
      const timeArr = new Float32Array(tr.times);
      const valArr = new Float32Array(tr.values);
      const input = this.addAccessor(timeArr, FLOAT, "SCALAR", 0, true);
      const output = this.addAccessor(valArr, FLOAT, tr.type, 0, false);
      const samplerIdx = samplers.length;
      samplers.push({ input, output, interpolation: tr.interpolation || "LINEAR" });
      channels.push({
        sampler: samplerIdx,
        target: { node: tr.node, path: tr.path },
      });
    }
    this.animations.push({ name, channels, samplers });
  }

  toGLB() {
    this._pad4();
    const binBuf = Buffer.concat(this.chunks);
    const gltf = {
      asset: {
        version: "2.0",
        generator: "pums-party Vinyl Toy Pum 3D Builder",
      },
      scene: 0,
      scenes: [{ name: "VinylToyPum", nodes: [0] }],
      nodes: this.nodes,
      materials: this.materials,
      meshes: this.meshes,
      skins: this.skins,
      animations: this.animations,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: binBuf.byteLength }],
    };

    let jsonBuf = Buffer.from(JSON.stringify(gltf), "utf8");
    const jsonPad = (4 - (jsonBuf.byteLength & 3)) & 3;
    if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

    const totalLen = 12 + 8 + jsonBuf.byteLength + 8 + binBuf.byteLength;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // "glTF"
    header.writeUInt32LE(2, 4);          // version 2
    header.writeUInt32LE(totalLen, 8);

    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonBuf.byteLength, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binBuf.byteLength, 0);
    binHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

    return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]);
  }
}

// ---------------------------------------------------------------------------
// Assemble rigged Vinyl Toy Pum
// ---------------------------------------------------------------------------
console.log("Sculpting Vinyl Toy Pum SDF body...");
const bodyGeom = extractBodyMesh();
const armLGeom = buildFlipperMesh(-1);
const armRGeom = buildFlipperMesh(+1);
const eyesGeom = buildEyesMesh();
const catchGeom = buildCatchlightsMesh();
const beakGeom = buildBeakMesh();
const mouthInnerGeom = buildMouthInnerMesh();
const tongueGeom = buildTongueMesh();

const gb = new GlbBuilder();

// PBR Materials tuned for soft-touch collectible designer vinyl toy
const matBody = gb.materials.length;
gb.materials.push({
  name: "VinylCreamBody",
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1], // Multiplied by baked linear vertex colors (cream + cheeks + AO)
    metallicFactor: 0.0,
    roughnessFactor: 0.72,
  },
});

const matFlipper = gb.materials.length;
gb.materials.push({
  name: "VinylCreamFlipper",
  pbrMetallicRoughness: {
    baseColorFactor: [...hexToLinear("#f7ecdc"), 1],
    metallicFactor: 0.0,
    roughnessFactor: 0.72,
  },
});

const matEyes = gb.materials.length;
gb.materials.push({
  name: "GlossyPlumEyes",
  pbrMetallicRoughness: {
    baseColorFactor: [...hexToLinear("#38253f"), 1],
    metallicFactor: 0.04,
    roughnessFactor: 0.14,
  },
});

const matCatchlight = gb.materials.length;
gb.materials.push({
  name: "EyeCatchlight",
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 1],
    metallicFactor: 0.0,
    roughnessFactor: 0.1,
  },
  emissiveFactor: [0.85, 0.85, 0.85],
});

const matBeak = gb.materials.length;
gb.materials.push({
  name: "SatinMangoBeak",
  pbrMetallicRoughness: {
    baseColorFactor: [...hexToLinear("#f7a616"), 1],
    metallicFactor: 0.0,
    roughnessFactor: 0.32,
  },
});

const matMouthInner = gb.materials.length;
gb.materials.push({
  name: "MouthInterior",
  pbrMetallicRoughness: {
    baseColorFactor: [...hexToLinear("#96381b"), 1],
    metallicFactor: 0.0,
    roughnessFactor: 0.88,
  },
});

const matTongue = gb.materials.length;
gb.materials.push({
  name: "CoralTongue",
  pbrMetallicRoughness: {
    baseColorFactor: [...hexToLinear("#f46d52"), 1],
    metallicFactor: 0.0,
    roughnessFactor: 0.36,
  },
});

const meshBody = gb.addMesh("Pum_Body", bodyGeom, matBody);
const meshArmL = gb.addMesh("Pum_Arm_L", armLGeom, matFlipper);
const meshArmR = gb.addMesh("Pum_Arm_R", armRGeom, matFlipper);
const meshEyes = gb.addMesh("Pum_Eyes", eyesGeom, matEyes);
const meshCatch = gb.addMesh("Pum_EyeCatchlights", catchGeom, matCatchlight);
const meshBeak = gb.addMesh("Pum_Beak", beakGeom, matBeak);
const meshMouthInner = gb.addMesh("Pum_MouthInner", mouthInnerGeom, matMouthInner);
const meshTongue = gb.addMesh("Pum_Tongue", tongueGeom, matTongue);

// Joint world positions (bind pose)
const jointRestWorld = [
  [0, 0, 0],            // 0: Root
  [0, 0.42, 0],         // 1: Body
  [-0.275, 0.34, 0],    // 2: Leg_L
  [0.275, 0.34, 0],     // 3: Leg_R
  [0, 1.54, 0],         // 4: Crest
  [-0.54, 0.79, 0.03],  // 5: Arm_L
  [0.54, 0.79, 0.03],   // 6: Arm_R
  [0, 0.96, 0],         // 7: HeadFace
];

// Nodes:
// 0: Pum_RigRoot (Root joint)
//   1: Body (joint)
//     2: Leg_L (joint)
//     3: Leg_R (joint)
//     4: Crest (joint)
//     5: Arm_L (joint + meshArmL)
//     6: Arm_R (joint + meshArmR)
//     7: HeadFace (joint)
//       8: Eyes (meshEyes, offset -HeadFace so vertices align in bind pose!)
//       9: EyeCatchlights (meshCatch)
//      10: Beak (meshBeak)
//      11: MouthInner (meshMouthInner)
//      12: Tongue (meshTongue)
//  13: BodyMesh (skinned mesh using Skin 0)
const rel = (child, parent) => [
  jointRestWorld[child][0] - jointRestWorld[parent][0],
  jointRestWorld[child][1] - jointRestWorld[parent][1],
  jointRestWorld[child][2] - jointRestWorld[parent][2],
];

const faceOffset = [-jointRestWorld[7][0], -jointRestWorld[7][1], -jointRestWorld[7][2]];

gb.nodes = [
  /* 0 */ { name: "Root", translation: jointRestWorld[0], children: [1, 13] },
  /* 1 */ { name: "Body", translation: rel(1, 0), children: [2, 3, 4, 5, 6, 7] },
  /* 2 */ { name: "Leg_L", translation: rel(2, 1) },
  /* 3 */ { name: "Leg_R", translation: rel(3, 1) },
  /* 4 */ { name: "Crest", translation: rel(4, 1) },
  /* 5 */ { name: "Arm_L", translation: rel(5, 1), mesh: meshArmL },
  /* 6 */ { name: "Arm_R", translation: rel(6, 1), mesh: meshArmR },
  /* 7 */ { name: "HeadFace", translation: rel(7, 1), children: [8, 9, 10, 11, 12] },
  /* 8 */ { name: "Eyes", translation: faceOffset, mesh: meshEyes },
  /* 9 */ { name: "EyeCatchlights", translation: faceOffset, mesh: meshCatch },
  /* 10 */ { name: "Beak", translation: faceOffset, mesh: meshBeak },
  /* 11 */ { name: "MouthInner", translation: faceOffset, mesh: meshMouthInner },
  /* 12 */ { name: "Tongue", translation: faceOffset, mesh: meshTongue },
  /* 13 */ { name: "BodyMesh", mesh: meshBody, skin: 0 },
];

// Inverse bind matrices for the 8 joints (column-major pure translation inverses)
const ibm = new Float32Array(jointRestWorld.length * 16);
for (let j = 0; j < jointRestWorld.length; j++) {
  const [wx, wy, wz] = jointRestWorld[j];
  const o = j * 16;
  ibm[o + 0] = 1; ibm[o + 5] = 1; ibm[o + 10] = 1; ibm[o + 15] = 1;
  ibm[o + 12] = -wx; ibm[o + 13] = -wy; ibm[o + 14] = -wz;
}
const ibmAcc = gb.addAccessor(ibm, 5126, "MAT4", 0, false);

gb.skins.push({
  name: "PumSkeleton",
  inverseBindMatrices: ibmAcc,
  skeleton: 0,
  joints: [0, 1, 2, 3, 4, 5, 6, 7],
});

// ---------------------------------------------------------------------------
// Emotion & Pose Animation Clips
// Eye morph order:   [joy, wow, blink, determined, sleepy] (len 5)
// Beak/Mouth/Tongue: [joy, wow, talk, smirk]               (len 4)
// ---------------------------------------------------------------------------
const bodyRest = rel(1, 0);

// 0) IDLE (calm, grounded breathing + subtle arm sway + natural blink — zero jumping)
{
  const times = [0, 0.75, 1.5, 2.25, 2.8, 2.9, 3.0];
  const bodyPos = [], bodyScale = [], bodyRot = [], armLRot = [], armRRot = [], eyeW = [], beakW = [];
  for (const t of times) {
    const b = Math.sin((t / 3.0) * Math.PI * 2);
    const sway = Math.sin((t / 3.0) * Math.PI * 2 + 0.6);
    bodyPos.push(bodyRest[0], bodyRest[1] + b * 0.008, bodyRest[2]);
    bodyScale.push(1 - b * 0.010, 1 + b * 0.014, 1 - b * 0.010);
    bodyRot.push(...eulerXYZToQuat(0, sway * 0.04, sway * 0.018));
    // Both flippers softly resting down-outward with subtle breathing sway
    armLRot.push(...eulerXYZToQuat(0, 0, 1.08 + b * 0.04));
    armRRot.push(...eulerXYZToQuat(0, 0, -1.08 - b * 0.04));
    const blink = t === 2.9 ? 1 : 0;
    eyeW.push(0, 0, blink, 0, 0);
    beakW.push(0, 0, 0, 0);
  }
  gb.addAnimation("idle", [
    { node: 1, path: "translation", type: "VEC3", times, values: bodyPos },
    { node: 1, path: "scale", type: "VEC3", times, values: bodyScale },
    { node: 1, path: "rotation", type: "VEC4", times, values: bodyRot },
    { node: 5, path: "rotation", type: "VEC4", times, values: armLRot },
    { node: 6, path: "rotation", type: "VEC4", times, values: armRRot },
    { node: 8, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 9, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 10, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 11, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 12, path: "weights", type: "SCALAR", times, values: beakW },
  ]);
}

// 1) HAPPY (grounded friendly greeting: calm breathe + gentle right-hand wave + blink)
{
  const times = [0, 0.6, 1.2, 1.8, 2.2, 2.3, 2.4, 2.6];
  const bodyPos = [], bodyScale = [], armLRot = [], armRRot = [], eyeW = [], beakW = [];
  for (const t of times) {
    const b = Math.sin((t / 2.6) * Math.PI * 2);
    bodyPos.push(bodyRest[0], bodyRest[1] + b * 0.008, bodyRest[2]);
    bodyScale.push(1 - b * 0.010, 1 + b * 0.014, 1 - b * 0.010);
    armLRot.push(...eulerXYZToQuat(0, 0, 1.06 + b * 0.04));
    const wave = Math.sin((t / 2.6) * Math.PI * 4) * 0.16;
    armRRot.push(...eulerXYZToQuat(0, 0, 0.70 + wave));
    const blink = t === 2.3 ? 1 : 0;
    eyeW.push(0, 0, blink, 0, 0);
    beakW.push(0, 0, 0, 0);
  }
  gb.addAnimation("happy", [
    { node: 1, path: "translation", type: "VEC3", times, values: bodyPos },
    { node: 1, path: "scale", type: "VEC3", times, values: bodyScale },
    { node: 5, path: "rotation", type: "VEC4", times, values: armLRot },
    { node: 6, path: "rotation", type: "VEC4", times, values: armRRot },
    { node: 8, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 9, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 10, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 11, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 12, path: "weights", type: "SCALAR", times, values: beakW },
  ]);
}

// 2) JOY (grounded joyful celebration: happy sway + both flippers high + ^ ^ eyes + wide grin + coral tongue)
{
  const times = [0, 0.35, 0.7, 1.05, 1.4];
  const bodyScale = [], bodyRot = [], armLRot = [], armRRot = [], crestScale = [], eyeW = [], beakW = [];
  for (const t of times) {
    const pulse = Math.abs(Math.sin((t / 1.4) * Math.PI * 2));
    const sway = Math.sin((t / 1.4) * Math.PI * 2);
    bodyScale.push(1 - pulse * 0.025, 1 + pulse * 0.035, 1 - pulse * 0.025);
    bodyRot.push(...eulerXYZToQuat(0, sway * 0.06, sway * 0.065));
    armLRot.push(...eulerXYZToQuat(0, 0, -0.78 - pulse * 0.16));
    armRRot.push(...eulerXYZToQuat(0, 0, 0.78 + pulse * 0.16));
    crestScale.push(1, 1 + pulse * 0.05, 1);
    eyeW.push(1, 0, 0, 0, 0);
    beakW.push(1, 0, 0, 0);
  }
  gb.addAnimation("joy", [
    { node: 1, path: "scale", type: "VEC3", times, values: bodyScale },
    { node: 1, path: "rotation", type: "VEC4", times, values: bodyRot },
    { node: 4, path: "scale", type: "VEC3", times, values: crestScale },
    { node: 5, path: "rotation", type: "VEC4", times, values: armLRot },
    { node: 6, path: "rotation", type: "VEC4", times, values: armRRot },
    { node: 8, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 9, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 10, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 11, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 12, path: "weights", type: "SCALAR", times, values: beakW },
  ]);
}

// 3) WOW (grounded surprised / oops: gentle startled pulse + flippers curled up to cheeks + wide O O eyes + "o" gasp)
{
  const times = [0, 0.35, 0.7, 1.05, 1.4];
  const bodyScale = [], bodyRot = [], armLRot = [], armRRot = [], eyeW = [], beakW = [];
  for (const t of times) {
    const pulse = Math.sin((t / 1.4) * Math.PI * 2);
    bodyScale.push(1 - pulse * 0.015, 1 + pulse * 0.022, 1 - pulse * 0.015);
    bodyRot.push(...eulerXYZToQuat(0, 0, 0.035 * pulse));
    // Both flippers raised & angled FORWARD beside cheeks like mascot-wow.png
    // (+Y rotates -X toward +Z; -Y rotates +X toward +Z)
    armLRot.push(...eulerXYZToQuat(0.15, 0.96, -0.74 - 0.05 * pulse));
    armRRot.push(...eulerXYZToQuat(0.15, -0.96, 0.74 + 0.05 * pulse));
    eyeW.push(0, 1, 0, 0, 0);
    beakW.push(0, 1, 0, 0);
  }
  gb.addAnimation("wow", [
    { node: 1, path: "scale", type: "VEC3", times, values: bodyScale },
    { node: 1, path: "rotation", type: "VEC4", times, values: bodyRot },
    { node: 5, path: "rotation", type: "VEC4", times, values: armLRot },
    { node: 6, path: "rotation", type: "VEC4", times, values: armRRot },
    { node: 8, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 9, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 10, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 11, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 12, path: "weights", type: "SCALAR", times, values: beakW },
  ]);
}

// 4) THINK (curious head tilt + cheeky smirk + right flipper curled near chin — great for Coach/hints)
{
  const times = [0, 0.8, 1.6];
  const bodyRot = [], armLRot = [], armRRot = [], eyeW = [], beakW = [];
  for (const t of times) {
    const s = Math.sin((t / 1.6) * Math.PI * 2);
    bodyRot.push(...eulerXYZToQuat(0.04, 0.08 + s * 0.04, -0.09 + s * 0.02));
    armLRot.push(...eulerXYZToQuat(0, 0, 1.08));
    armRRot.push(...eulerXYZToQuat(0.25, -0.75, 0.62 + s * 0.05));
    eyeW.push(0, 0, 0, 0.8, 0);
    beakW.push(0, 0, 0, 1);
  }
  gb.addAnimation("think", [
    { node: 1, path: "rotation", type: "VEC4", times, values: bodyRot },
    { node: 5, path: "rotation", type: "VEC4", times, values: armLRot },
    { node: 6, path: "rotation", type: "VEC4", times, values: armRRot },
    { node: 8, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 9, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 10, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 11, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 12, path: "weights", type: "SCALAR", times, values: beakW },
  ]);
}

// 5) SLEEPY (cozy waiting / drowsy sway + sleepy eyes)
{
  const times = [0, 1.2, 2.4];
  const bodyPos = [], bodyRot = [], armLRot = [], armRRot = [], eyeW = [], beakW = [];
  for (const t of times) {
    const s = Math.sin((t / 2.4) * Math.PI * 2);
    bodyPos.push(bodyRest[0], bodyRest[1] - 0.015 + s * 0.012, bodyRest[2]);
    bodyRot.push(...eulerXYZToQuat(0.05, 0, s * 0.045));
    armLRot.push(...eulerXYZToQuat(0, 0, 1.18));
    armRRot.push(...eulerXYZToQuat(0, 0, -1.18));
    eyeW.push(0, 0, 0, 0, 1);
    beakW.push(0, 0, 0.12 + 0.08 * s, 0);
  }
  gb.addAnimation("sleepy", [
    { node: 1, path: "translation", type: "VEC3", times, values: bodyPos },
    { node: 1, path: "rotation", type: "VEC4", times, values: bodyRot },
    { node: 5, path: "rotation", type: "VEC4", times, values: armLRot },
    { node: 6, path: "rotation", type: "VEC4", times, values: armRRot },
    { node: 8, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 9, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 10, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 11, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 12, path: "weights", type: "SCALAR", times, values: beakW },
  ]);
}

// 6) TALK (lively quacking/explaining animation for Coach tips & onboarding)
{
  const times = [0, 0.18, 0.36, 0.54, 0.72, 0.90];
  const bodyScale = [], armLRot = [], armRRot = [], eyeW = [], beakW = [];
  const opens = [0, 0.9, 0.15, 1.0, 0.25, 0];
  for (let i = 0; i < times.length; i++) {
    const o = opens[i];
    bodyScale.push(1 - o * 0.02, 1 + o * 0.03, 1 - o * 0.02);
    armLRot.push(...eulerXYZToQuat(0, 0, 0.95 - o * 0.25));
    armRRot.push(...eulerXYZToQuat(0, 0, 0.55 + o * 0.3));
    eyeW.push(0, 0, 0, 0, 0);
    beakW.push(0, 0, o, 0);
  }
  gb.addAnimation("talk", [
    { node: 1, path: "scale", type: "VEC3", times, values: bodyScale },
    { node: 5, path: "rotation", type: "VEC4", times, values: armLRot },
    { node: 6, path: "rotation", type: "VEC4", times, values: armRRot },
    { node: 8, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 9, path: "weights", type: "SCALAR", times, values: eyeW },
    { node: 10, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 11, path: "weights", type: "SCALAR", times, values: beakW },
    { node: 12, path: "weights", type: "SCALAR", times, values: beakW },
  ]);
}

const glb = gb.toGLB();
fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, glb);
console.log(
  `Wrote ${OUT_PATH} (${(glb.byteLength / 1024).toFixed(1)} KB, body verts=${bodyGeom.positions.length / 3}, body tris=${bodyGeom.indices.length / 3}, joints=${gb.skins[0].joints.length}, animations=${gb.animations.map((a) => a.name).join(", ")})`
);
