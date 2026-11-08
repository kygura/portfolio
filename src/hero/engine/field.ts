/** Sheet 05 · Field: a living relief, rendered like an early raytrace. A glossy
 *  faceted terrain in banded contours rises out of a checker mirror under an
 *  amber sky; where it dips below the floor the valleys turn to mirror pools.
 *  Chrome spheres sit on the peaks and ride whatever the ground does. A tap
 *  sends a pulse out through the bands, Shift+drag pulls the relief along with
 *  it, and the cursor lifts a swell and leaves a wake. Tap the benchmark sphere
 *  for a cascade of pulses. */
import * as THREE from "three";
import type { PsxKit, SceneDef } from "./psx";
import { createRay, RAY_GLSL, SNAP } from "./ray";

interface Pulse { x: number; z: number; age: number; seed: number }

const PAL = {
  zen: "#7a2406", mid: "#e8803a", low: "#f4c88e", hor: "#fff3dc", fog: "#f2dcb8",
  ice: "#dc8c4c", sea: "#8e3a12", ink: "#2a0c04", light: [0.8, 0.42, 0.42] as [number, number, number],
};
const BAND = 2.4; // contour band height (m)

// Hard-lit facets in alternating contour bands, with a sky glint for the gloss. The real
// relief keeps what is above the floor, its mirror copy what is below, so valleys read as pools.
const TV = `
uniform vec2 uSnap; varying vec3 vWP; varying vec3 vN; varying float vDepth;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * wp; vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p; vDepth = -mv.z;
}`;
const TF = `${RAY_GLSL}
uniform vec3 uLight; uniform vec3 uFog; uniform vec3 uLit; uniform vec3 uBand; uniform vec3 uDeep;
uniform float uFogNear; uniform float uFogFar; uniform float uSide; uniform float uFlash;
varying vec3 vWP; varying vec3 vN; varying float vDepth;
void main(){
  if (vWP.y * uSide < 0.0) discard;
  vec3 n = normalize(vN);
  float y = abs(vWP.y);
  vec3 base = mod(floor(y / ${BAND.toFixed(2)}), 2.0) < 0.5 ? uLit : uBand;
  float lam = max(dot(n, uLight), 0.0);
  vec3 c = mix(uDeep * (0.6 + 0.5 * base), base, smoothstep(0.12, 0.5, lam));
  vec3 v = normalize(vWP - cameraPosition);
  vec3 r = reflect(v, n);
  float fr = pow(1.0 - max(dot(n, -v), 0.0), 4.0);
  c = mix(c, sky(abs(r.y)), fr * 0.3);
  c += pow(max(dot(r, uLight), 0.0), 30.0) * 0.55 + uFlash;
  gl_FragColor = vec4(mix(c, uFog, smoothstep(uFogNear, uFogFar, vDepth)), 1.0);
}`;

const LV = `uniform vec2 uSnap; varying float vDepth; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vec4 p = projectionMatrix * mv; ${SNAP} gl_Position = p; vDepth = -mv.z; }`;
const LF = `uniform vec3 uColor; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; varying float vDepth; void main(){ gl_FragColor = vec4(mix(uColor, uFog, smoothstep(uFogNear, uFogFar, vDepth)), 1.0); }`;

export function buildField(k: PsxKit): SceneDef {
  const { U, view } = k;
  const PIVOT = new THREE.Vector3(0, 2, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1400);
  const R = createRay(k, scene, PAL);
  // The floor is finite; a fog-coloured skirt just under the horizon hides its far edge.
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(180, 180, 12, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: PAL.fog, side: THREE.BackSide, depthWrite: false }),
  );
  skirt.renderOrder = -0.5;
  scene.add(skirt);
  R.floor({ checker: 8, fogNear: 90, fogFar: 300, size: 2600 });

  // 96 m across: 1.5 m simulation cells, drawn as 3 m facets so they read at low res.
  const S = 96, N = 64, half = S / 2, cs = S / N, W = N + 1, FACET = 2;
  const hg = new Float32Array(W * W); // final heights
  const wh = new Float32Array(W * W); // wave displacement
  const wv = new Float32Array(W * W); // wave velocity
  const wx = new Float32Array(W * W); // drag warp (m)
  const wz = new Float32Array(W * W);
  const dmp = new Float32Array(W * W); // damping: heavier near the rim so waves don't bounce back
  const rim = new Float32Array(W * W); // relief scale: 1 inside, easing to 0 at the square edge so it meets the floor
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const X = -half + x * cs, Z = -half + y * cs;
    const r = Math.hypot(X, Z) / half;
    const e = Math.min(1, Math.max(0, (r - 0.7) / 0.3));
    dmp[y * W + x] = 0.9 + 4 * e * e * (3 - 2 * e);
    const f = Math.min(1, Math.max(0, (half - Math.max(Math.abs(X), Math.abs(Z))) / (half * 0.3)));
    rim[y * W + x] = f * f * (3 - 2 * f);
  }

  const ambient = (x: number, z: number, t: number) => {
    const u = x * 0.11, v = z * 0.11;
    return 1.8 * (0.9 + 1.7 * Math.sin(u * 1.1 + t * 0.05) * Math.cos(v * 0.9 - t * 0.04) + 1.2 * Math.sin((u + v) * 0.7 + 1.3 + t * 0.03) +
      4.2 * Math.exp(-((x - 8) * (x - 8) + (z + 6) * (z + 6)) * 0.012) - 2.4 * Math.exp(-((x + 10) * (x + 10) + (z - 9) * (z - 9)) * 0.018) +
      0.4 * Math.sin(u * 3.1 - v * 2.3 + t * 0.07));
  };
  const hAt = (x: number, z: number) => {
    const fx = (x + half) / cs, fz = (z + half) / cs;
    const ix = Math.max(0, Math.min(N - 1, Math.floor(fx))), iz = Math.max(0, Math.min(N - 1, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz)), i = iz * W + ix;
    return (hg[i] * (1 - tx) + hg[i + 1] * tx) * (1 - tz) + (hg[i + W] * (1 - tx) + hg[i + W + 1] * tx) * tz;
  };

  /* ---- relief: one faceted mesh, drawn in the world and again in the mirror ---- */
  const tg = new THREE.PlaneGeometry(S, S, N / FACET, N / FACET);
  tg.rotateX(-Math.PI / 2);
  const tgeo = tg.toNonIndexed();
  tg.dispose();
  const tpos = tgeo.attributes.position;
  const vmap = new Int32Array(tpos.count);
  for (let i = 0; i < tpos.count; i++) {
    vmap[i] = Math.round((tpos.getZ(i) + half) / cs) * W + Math.round((tpos.getX(i) + half) / cs);
  }
  const flash = { value: 0 };
  const terrainMat = (side: number) => new THREE.ShaderMaterial({
    vertexShader: TV, fragmentShader: TF,
    uniforms: {
      ...R.uniforms.sky, uSnap: U.uSnap, uLight: R.uniforms.light, uFog: R.uniforms.fog, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
      uLit: { value: new THREE.Color("#fdeccc") }, uBand: { value: new THREE.Color("#ec9a52") }, uDeep: { value: new THREE.Color("#6a1c04") },
      uSide: { value: side }, uFlash: flash,
    },
  });
  for (const [grp, side] of [[R.world, 1], [R.mirror, -1]] as const) {
    const m = new THREE.Mesh(tgeo, terrainMat(side));
    m.frustumCulled = false;
    grp.add(m);
  }

  const line = (color: string) => new THREE.ShaderMaterial({
    vertexShader: LV, fragmentShader: LF, transparent: true,
    uniforms: { uSnap: U.uSnap, uColor: { value: new THREE.Color(color) }, uFog: R.uniforms.fog, uFogNear: U.uFogNear, uFogFar: U.uFogFar },
  });
  const ringPos = new Float32Array(6 * (64 * 2 + 2) * 3);
  const retPos = new Float32Array((20 * 2 + 4) * 3);
  const lineBuf = (arr: Float32Array, mat: THREE.Material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    g.setDrawRange(0, 0);
    const l = new THREE.LineSegments(g, mat);
    l.frustumCulled = false;
    l.renderOrder = 3;
    scene.add(l);
    return g;
  };
  const gRing = lineBuf(ringPos, line("#fffaf0")), gRet = lineBuf(retPos, line("#2a0c04"));

  /* ---- chrome spheres on the peaks; the first is the benchmark ---- */
  const chrome = R.chrome({ marble: 0.25, scale: 2.2, tint: "#fff2e2", ink: "#3a1406" });
  const sphGeo = new THREE.SphereGeometry(1, 28, 20);
  const spheres = ([[8, -6, 2.6], [-20, 18, 1.6], [26, 20, 1.3], [-26, -22, 1.9]] as const).map(([x, z, r]) => ({
    x, z, r, pair: R.add(sphGeo, chrome, x, 0, z, 0, 0, 0, r),
  }));
  const trig = new THREE.Vector3(8, 0, -6);

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

    for (const s of spheres) {
      const y = Math.max(hAt(s.x, s.z), 0) + s.r * 0.9;
      s.pair[0].position.y = y;
      s.pair[1].position.y = y;
    }
    trig.y = spheres[0].pair[0].position.y;
  };

  const rh = (n: number) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
  const drawOverlays = () => {
    let n = 0;
    const put = (x: number, y: number, z: number) => { ringPos[n++] = x; ringPos[n++] = Math.max(y, 0); ringPos[n++] = z; };
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
    if (aimed && Math.abs(lift) > 0.03) {
      const rad = pressed ? 1.2 : 2;
      const rp = (x: number, y: number, z: number) => { retPos[n++] = x; retPos[n++] = Math.max(y, 0); retPos[n++] = z; };
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

  // easter egg: the benchmark answers with a cascade of pulses, and the chrome flares
  const cascade: { due: number; x: number; z: number }[] = [];
  let tFlare = -99;
  const busy = () =>
    cascade.length > 0 || pressed || pulses.length > 0 || waveE > 0.004 || warpE > 0.01 || Math.abs(lift) > 0.01 ||
    (aimed && Math.hypot(px - hx, pz - hz) > 0.05);

  /* ---- camera range ----
     Same controls as every scene (drag or two fingers orbit, pinch or Ctrl+wheel zooms).
     A low orbit that keeps the horizon and a band of sky in frame. */
  return {
    scene, cam, fog: [90, 300], fov: [50, 64], limits: { pitch: [-0.3, 0.45], zoom: [0.55, 1.8] },
    labels: [],
    eggs: [
      {
        id: "field-benchmark", r: 40,
        at: (v) => { v.copy(trig); },
        fire: (t) => {
          tFlare = t;
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

      const a = 0.6 + t * 0.025 + view.yaw, r = 60;
      cam.position.set(Math.cos(a) * r, 21 - view.py * 6, Math.sin(a) * r);
      cam.lookAt(0, 5, 0);
      k.orbit(cam, PIVOT);

      // Cursor: ease the swell toward the pointer; it dips under a press.
      if (aimed) {
        if (Math.abs(lift) < 0.02) { hx = px; hz = pz; }
        const e = 1 - Math.pow(1 - 0.3, dt * 60);
        hx += (px - hx) * e; hz += (pz - hz) * e;
      }
      const liftT = pressed ? -0.8 : aimed ? 0.8 : 0;
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

      const fl = Math.max(0, 1 - Math.abs(t - tFlare - 0.3) / 0.9);
      R.uniforms.flash.value = 0.5 * fl;
      flash.value = 0.12 * fl;
      for (const s of spheres) for (const o of s.pair) o.rotation.y = t * 0.2;
      R.follow(cam);
      skirt.position.set(cam.position.x, cam.position.y - 6, cam.position.z);
    },
    readout() {
      return [
        ["Scale", "1:2 500"],
        ["CI", `${BAND} m bands`],
        ["Relief", `${((hi - lo) * 10).toFixed(0)} m`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Pulses", String(pulses.length)],
      ];
    },
  };
}
