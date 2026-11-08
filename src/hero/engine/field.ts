/** Sheet 05 · Field: a living relief. Contours, a draped survey grid and a
 *  wave simulation share one height field. A tap sends a pulse out from the
 *  source, a drag drags the ambient fabric (contours and grid) along with it,
 *  and the cursor lifts a faint swell and leaves a wake. Kept deliberately quiet. */
import * as THREE from "three";
import type { PsxKit, SceneDef } from "./psx";

// Marching-squares edge pairs per cell case (edges: 0 top, 1 right, 2 bottom, 3 left).
export const MS: Record<number, [number, number][]> = {
  1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[0, 1], [3, 2]], 6: [[0, 2]], 7: [[0, 3]],
  8: [[0, 3]], 9: [[0, 2]], 10: [[0, 3], [2, 1]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]],
};

interface Pulse { x: number; z: number; age: number; seed: number }

export function buildField(k: PsxKit): SceneDef {
  const { mesh, psx, M, tex, view } = k;
  const PIVOT = new THREE.Vector3(0, -1.5, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
  const sky = k.skyDome(0, 0.35, 0.6);
  scene.add(sky);

  // 144 m across, 1.5 m cells, 6 m survey grid. Wide enough that the edge stays out of frame.
  const S = 144, N = 96, half = S / 2, cs = S / N, W = N + 1, GS = 4;
  const hg = new Float32Array(W * W); // final heights
  const wh = new Float32Array(W * W); // wave displacement
  const wv = new Float32Array(W * W); // wave velocity
  const wx = new Float32Array(W * W); // drag warp (m)
  const wz = new Float32Array(W * W);
  const dmp = new Float32Array(W * W); // damping: heavier near the rim so waves don't bounce back
  const rim = new Float32Array(W * W); // relief scale: 1 inside, easing to 0 at the square edge so it meets the plain
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const X = -half + x * cs, Z = -half + y * cs;
    const r = Math.hypot(X, Z) / half;
    const e = Math.min(1, Math.max(0, (r - 0.7) / 0.3));
    dmp[y * W + x] = 0.9 + 4 * e * e * (3 - 2 * e);
    const f = Math.min(1, Math.max(0, (half - Math.max(Math.abs(X), Math.abs(Z))) / (half * 0.22)));
    rim[y * W + x] = f * f * (3 - 2 * f);
  }

  const ambient = (x: number, z: number, t: number) => {
    const u = x * 0.11, v = z * 0.11;
    return 1.7 * Math.sin(u * 1.1 + t * 0.05) * Math.cos(v * 0.9 - t * 0.04) + 1.2 * Math.sin((u + v) * 0.7 + 1.3 + t * 0.03) +
      3.2 * Math.exp(-((x - 8) * (x - 8) + (z + 6) * (z + 6)) * 0.012) - 2.4 * Math.exp(-((x + 10) * (x + 10) + (z - 9) * (z - 9)) * 0.018) +
      0.4 * Math.sin(u * 3.1 - v * 2.3 + t * 0.07);
  };
  const hAt = (x: number, z: number) => {
    const fx = (x + half) / cs, fz = (z + half) / cs;
    const ix = Math.max(0, Math.min(N - 1, Math.floor(fx))), iz = Math.max(0, Math.min(N - 1, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz)), i = iz * W + ix;
    return (hg[i] * (1 - tx) + hg[i + 1] * tx) * (1 - tz) + (hg[i + W] * (1 - tx) + hg[i + W + 1] * tx) * tz;
  };

  const tg = new THREE.PlaneGeometry(S, S, N, N);
  tg.rotateX(-Math.PI / 2);
  const tgeo = tg.toNonIndexed();
  tg.dispose();
  const tpos = tgeo.attributes.position;
  const vmap = new Int32Array(tpos.count);
  for (let i = 0; i < tpos.count; i++) {
    vmap[i] = Math.round((tpos.getZ(i) + half) / cs) * W + Math.round((tpos.getX(i) + half) / cs);
  }
  const terrain = mesh(tgeo, psx({ map: tex.tPlain, tint: "#56696a", uv: 1, hypso: 1, amb: "#3e4a52", sun: "#c9c2ae" }), scene);
  terrain.frustumCulled = false;
  // The plain: the relief settles to zero at its edge and carries on as flat ground into
  // the fog, so the camera can pull back and tilt low without finding the end of the map.
  const plainShape = new THREE.Shape([
    new THREE.Vector2(-480, -480), new THREE.Vector2(480, -480), new THREE.Vector2(480, 480), new THREE.Vector2(-480, 480),
  ]);
  plainShape.holes.push(new THREE.Path([
    new THREE.Vector2(-half, -half), new THREE.Vector2(-half, half), new THREE.Vector2(half, half), new THREE.Vector2(half, -half),
  ]));
  const plainGeo = new THREE.ShapeGeometry(plainShape);
  plainGeo.rotateX(-Math.PI / 2);
  mesh(plainGeo, terrain.material as THREE.Material, scene);

  const LV0 = -10, LSTEP = 0.75, NLV = 32;
  const minPos = new Float32Array(N * N * 4 * 8 * 3);
  const idxPos = new Float32Array(N * N * 4 * 4 * 3);
  const gridPos = new Float32Array((Math.floor(N / GS) + 1) * N * 12);
  const ringPos = new Float32Array(6 * (64 * 2 + 2) * 3);
  const retPos = new Float32Array((20 * 2 + 4) * 3);
  const lineBuf = (arr: Float32Array, mat: THREE.Material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    g.setDrawRange(0, 0);
    const l = new THREE.LineSegments(g, mat);
    l.frustumCulled = false;
    scene.add(l);
    return g;
  };
  const gMin = lineBuf(minPos, M.lBoneDim), gIdx = lineBuf(idxPos, M.lAccent), gGrid = lineBuf(gridPos, M.lDeep);
  const gRing = lineBuf(ringPos, M.lAccent), gRet = lineBuf(retPos, M.lBone);

  const cnt = [0, 0];
  const edge = (out: Float32Array, ci: number, e: number, x: number, y: number, a: number, b: number, c: number, d: number, l: number) => {
    const n = cnt[ci];
    if (n + 3 > out.length) return;
    let tt: number, qx: number, qy: number;
    if (e === 0) { tt = (l - a) / (b - a); qx = x + tt; qy = y; }
    else if (e === 1) { tt = (l - b) / (c - b); qx = x + 1; qy = y + tt; }
    else if (e === 2) { tt = (l - d) / (c - d); qx = x + tt; qy = y + 1; }
    else { tt = (l - a) / (d - a); qx = x; qy = y + tt; }
    out[n] = -half + qx * cs; out[n + 1] = l + 0.12; out[n + 2] = -half + qy * cs;
    cnt[ci] = n + 3;
  };

  /* ---- pointer state ---- */
  const pulses: Pulse[] = [];
  const LIFE = 3.4, SPEED = 9, MAXP = 6;
  let seedN = 1;
  let aimed = false, px = 0, pz = 0, lx = 0, lz = 0, mvx = 0, mvz = 0;
  let pressed = false, hx = 0, hz = 0, lift = 0;
  let waveE = 0, warpE = 0;
  const hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Ray onto the relief: a few plane intersections converge on the surface.
  const pick = (ray: THREE.Ray) => {
    let y = 0;
    for (let i = 0; i < 3; i++) {
      plane.constant = -y;
      if (!ray.intersectPlane(plane, hit)) return false;
      y = hAt(hit.x, hit.z);
    }
    return Math.abs(hit.x) < half - 3 && Math.abs(hit.z) < half - 3;
  };
  const bump = (arr: Float32Array, cx: number, cz: number, rad: number, sigma: number, amt: number) => {
    const x0 = Math.max(0, Math.floor((cx - rad + half) / cs)), x1 = Math.min(N, Math.ceil((cx + rad + half) / cs));
    const z0 = Math.max(0, Math.floor((cz - rad + half) / cs)), z1 = Math.min(N, Math.ceil((cz + rad + half) / cs));
    const k2 = 1 / (2 * sigma * sigma);
    for (let y = z0; y <= z1; y++) for (let x = x0; x <= x1; x++) {
      const dx = -half + x * cs - cx, dz = -half + y * cs - cz;
      arr[y * W + x] += amt * Math.exp(-(dx * dx + dz * dz) * k2);
    }
  };
  const drag = (cx: number, cz: number, dx: number, dz: number) => {
    const rad = 11, sigma = 3.6, k2 = 1 / (2 * sigma * sigma);
    const x0 = Math.max(0, Math.floor((cx - rad + half) / cs)), x1 = Math.min(N, Math.ceil((cx + rad + half) / cs));
    const z0 = Math.max(0, Math.floor((cz - rad + half) / cs)), z1 = Math.min(N, Math.ceil((cz + rad + half) / cs));
    for (let y = z0; y <= z1; y++) for (let x = x0; x <= x1; x++) {
      const ox = -half + x * cs - cx, oz = -half + y * cs - cz, i = y * W + x;
      const g = Math.exp(-(ox * ox + oz * oz) * k2) * 0.6;
      wx[i] += dx * g; wz[i] += dz * g;
      const m = Math.hypot(wx[i], wz[i]);
      if (m > 7) { wx[i] *= 7 / m; wz[i] *= 7 / m; }
    }
  };
  const spawn = (x: number, z: number) => {
    if (pulses.length >= MAXP) pulses.shift();
    pulses.push({ x, z, age: 0, seed: seedN++ * 17.31 });
    bump(wh, x, z, 9, 1.8, 4.5);
  };

  /* ---- simulation ---- */
  let acc = 0, lastNow = performance.now(), lastT = -1;
  const C2 = (SPEED * SPEED) / (cs * cs), STEP = 1 / 60;
  const stepWave = () => {
    for (let y = 1; y < N; y++) for (let x = 1; x < N; x++) {
      const i = y * W + x;
      const lap = wh[i - 1] + wh[i + 1] + wh[i - W] + wh[i + W] - 4 * wh[i];
      wv[i] += (C2 * lap - dmp[i] * wv[i] - 0.3 * wh[i]) * STEP;
    }
    for (let i = 0; i < wh.length; i++) wh[i] += wv[i] * STEP;
  };

  const trig = new THREE.Vector3(8, 0, -6);
  const trigM = mesh(new THREE.ConeGeometry(0.42, 0.85, 3), M.glyph, scene, trig.x, 0, trig.z);
  let lo = 0, hi = 0;

  const rebuild = (t: number) => {
    lo = 1e9; hi = -1e9;
    const hr2 = 144, hk = 1 / (2 * 3.2 * 3.2);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, X = -half + x * cs, Z = -half + y * cs;
      let h = ambient(X - wx[i], Z - wz[i], t) + wh[i];
      if (lift !== 0) {
        const dx = X - hx, dz = Z - hz, r2 = dx * dx + dz * dz;
        if (r2 < hr2) h += lift * Math.exp(-r2 * hk);
      }
      h *= rim[i];
      hg[i] = h;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    for (let i = 0; i < tpos.count; i++) tpos.setY(i, hg[vmap[i]]);
    tpos.needsUpdate = true;
    tgeo.computeVertexNormals();

    cnt[0] = 0; cnt[1] = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = hg[y * W + x], b = hg[y * W + x + 1], c = hg[(y + 1) * W + x + 1], d = hg[(y + 1) * W + x];
      const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d);
      const k0 = Math.max(0, Math.ceil((mn - LV0) / LSTEP)), k1 = Math.min(NLV - 1, Math.floor((mx - LV0) / LSTEP));
      for (let lv = k0; lv <= k1; lv++) {
        const l = LV0 + lv * LSTEP, isIdx = lv % 4 === 0, out = isIdx ? idxPos : minPos, ci = isIdx ? 1 : 0;
        const s = MS[(a > l ? 8 : 0) | (b > l ? 4 : 0) | (c > l ? 2 : 0) | (d > l ? 1 : 0)];
        if (!s) continue;
        for (let i = 0; i < s.length; i++) {
          edge(out, ci, s[i][0], x, y, a, b, c, d, l);
          edge(out, ci, s[i][1], x, y, a, b, c, d, l);
        }
      }
    }
    gMin.setDrawRange(0, cnt[0] / 3); gMin.attributes.position.needsUpdate = true;
    gIdx.setDrawRange(0, cnt[1] / 3); gIdx.attributes.position.needsUpdate = true;

    // The survey grid rides the warp, so a drag visibly stretches the fabric.
    let n = 0;
    const gv = (ix: number, iz: number) => {
      const i = iz * W + ix;
      gridPos[n++] = -half + ix * cs + wx[i]; gridPos[n++] = hg[i] + 0.14; gridPos[n++] = -half + iz * cs + wz[i];
    };
    for (let gl = 0; gl <= N; gl += GS) for (let sg = 0; sg < N; sg++) {
      gv(gl, sg); gv(gl, sg + 1);
      gv(sg, gl); gv(sg + 1, gl);
    }
    gGrid.setDrawRange(0, n / 3); gGrid.attributes.position.needsUpdate = true;

    trig.y = hAt(trig.x, trig.z) + 0.55;
    trigM.position.y = trig.y;
  };

  const rh = (n: number) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
  const drawOverlays = () => {
    let n = 0;
    const put = (x: number, y: number, z: number) => { ringPos[n++] = x; ringPos[n++] = y; ringPos[n++] = z; };
    for (const p of pulses) {
      const r = SPEED * p.age, keep = 1 - p.age / LIFE;
      for (let i = 0; i < 64; i++) {
        if (rh(i * 7.13 + p.seed) > keep) continue;
        const a0 = (i / 64) * Math.PI * 2, a1 = ((i + 1) / 64) * Math.PI * 2;
        const x0 = p.x + Math.cos(a0) * r, z0 = p.z + Math.sin(a0) * r, x1 = p.x + Math.cos(a1) * r, z1 = p.z + Math.sin(a1) * r;
        if (Math.abs(x0) > half - 1 || Math.abs(z0) > half - 1 || Math.abs(x1) > half - 1 || Math.abs(z1) > half - 1) continue;
        put(x0, hAt(x0, z0) + 0.35, z0);
        put(x1, hAt(x1, z1) + 0.35, z1);
      }
      const y0 = hAt(p.x, p.z);
      put(p.x, y0, p.z);
      put(p.x, y0 + 0.4 + 3.2 * keep, p.z);
    }
    gRing.setDrawRange(0, n / 3);
    gRing.attributes.position.needsUpdate = true;

    n = 0;
    const show = aimed && Math.abs(lift) > 0.03;
    if (show) {
      const rad = pressed ? 0.9 : 1.5;
      const rp = (x: number, y: number, z: number) => { retPos[n++] = x; retPos[n++] = y; retPos[n++] = z; };
      for (let i = 0; i < 20; i++) {
        const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2;
        const x0 = hx + Math.cos(a0) * rad, z0 = hz + Math.sin(a0) * rad, x1 = hx + Math.cos(a1) * rad, z1 = hz + Math.sin(a1) * rad;
        rp(x0, hAt(x0, z0) + 0.3, z0);
        rp(x1, hAt(x1, z1) + 0.3, z1);
      }
    }
    gRet.setDrawRange(0, n / 3);
    gRet.attributes.position.needsUpdate = true;
  };

  // easter egg: the benchmark answers with a cascade of pulses
  const cascade: { due: number; x: number; z: number }[] = [];
  const busy = () =>
    cascade.length > 0 || pressed || pulses.length > 0 || waveE > 0.004 || warpE > 0.01 || Math.abs(lift) > 0.01 ||
    (aimed && Math.hypot(px - hx, pz - hz) > 0.05);

  /* ---- camera range ----
     Same controls as every scene (drag or two fingers orbit, pinch or Ctrl+wheel zooms).
     The plain around the relief fills the frame at any of these settings, so the range
     only has to stop short of skimming the ground or pulling the relief into a speck. */
  return {
    scene, cam, fog: [55, 150], fov: [50, 64], limits: { pitch: [-0.4, 0.5], zoom: [0.55, 1.8] },
    labels: [],
    eggs: [
      {
        id: "field-benchmark", r: 40,
        at: (v) => { v.copy(trig); },
        fire: () => {
          const now = performance.now();
          [[0, 0, 0], [220, 9, 0], [440, 0, 9], [660, -9, 0], [880, 0, -9]].forEach(([d, dx, dz]) =>
            cascade.push({ due: now + d, x: trig.x + dx, z: trig.z + dz }));
        },
      },
    ],
    pointer: {
      aim(ray, moved) {
        const ok = ray ? pick(ray) : false;
        if (ok) {
          px = hit.x; pz = hit.z;
          if (aimed && moved) { mvx = px - lx; mvz = pz - lz; }
          lx = px; lz = pz;
        }
        aimed = ok;
      },
      press() { pressed = true; },
      release(tap) {
        if (pressed && aimed && tap) spawn(px, pz);
        pressed = false;
      },
      busy,
    },
    update(t) {
      const now = performance.now();
      const dt = Math.max(0, Math.min(0.05, (now - lastNow) / 1000));
      lastNow = now;

      const a = 0.6 + t * 0.025 + view.yaw, r = 22;
      cam.position.set(Math.cos(a) * r, 34 - view.py * 4, Math.sin(a) * r);
      cam.lookAt(0, -1.5, 0);
      k.orbit(cam, PIVOT);
      sky.position.copy(cam.position);

      // Cursor: ease the swell toward the pointer; it dips under a press.
      if (aimed) {
        if (Math.abs(lift) < 0.02) { hx = px; hz = pz; }
        const e = 1 - Math.pow(1 - 0.3, dt * 60);
        hx += (px - hx) * e; hz += (pz - hz) * e;
      }
      const liftT = pressed ? -0.5 : aimed ? 0.35 : 0;
      lift += (liftT - lift) * (1 - Math.pow(1 - 0.12, dt * 60));
      if (!aimed && Math.abs(lift) < 0.01) lift = 0;

      // Movement leaves a wake; a held drag also pulls the fabric along.
      if (dt > 0 && (mvx || mvz)) {
        const speed = Math.hypot(mvx, mvz) / dt;
        if (speed > 2) {
          bump(wv, px, pz, 6, 1.5, -(pressed ? 5 : 2.5) * Math.min(speed, 30) / 30);
        }
        if (pressed) drag(px, pz, mvx, mvz);
      }
      mvx = mvz = 0;

      for (let i = cascade.length - 1; i >= 0; i--) {
        if (cascade[i].due > now) continue;
        spawn(cascade[i].x, cascade[i].z);
        cascade.splice(i, 1);
      }

      // Warp relaxes back; pulses age out.
      const f = Math.exp(-dt / 2.4);
      let we = 0;
      for (let i = 0; i < wx.length; i++) {
        wx[i] *= f; wz[i] *= f;
        const m = Math.abs(wx[i]) + Math.abs(wz[i]);
        if (m > we) we = m;
      }
      warpE = we;
      if (we < 0.01) { wx.fill(0); wz.fill(0); warpE = 0; }
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].age += dt;
        if (pulses[i].age > LIFE) pulses.splice(i, 1);
      }

      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 3) { stepWave(); acc -= STEP; steps++; }
      if (acc > STEP) acc = 0;
      let e = 0;
      for (let i = 0; i < wh.length; i++) {
        const m = Math.abs(wh[i]) + Math.abs(wv[i]) * 0.1;
        if (m > e) e = m;
      }
      waveE = e;
      if (e < 0.004) { wh.fill(0); wv.fill(0); waveE = 0; }

      if (busy() || Math.abs(t - lastT) > 0.06 || lastT < 0) {
        rebuild(t);
        lastT = t;
      }
      drawOverlays();
    },
    readout() {
      return [
        ["Scale", "1:2 500"],
        ["CI", "0.5 m · index 2.5 m"],
        ["Relief", `${((hi - lo) * 10).toFixed(0)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Pulses", String(pulses.length)],
      ];
    },
  };
}
