/** Sheet 06 · Matrix: an early raytrace in phosphor. Streams of procedural
 *  glyphs rain down around a turning chrome tesseract, over a black and green
 *  checker mirror that carries both, under a sky that runs from black at the
 *  zenith to a pale mint horizon. A ticked ring and a survey grid lie on the
 *  floor as clean lines. Tap the core to tumble it, the first stream for déjà
 *  vu, the ring to spin it. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef, type V3 } from "./psx";
import { createRay, SNAP } from "./ray";

// One quad per glyph cell, turned about world up to face the camera. Which glyph a cell
// shows and how lit it is both come from the stream's clock, so the CPU never touches it.
const GV = `
uniform vec2 uSnap; uniform float uRain; uniform vec2 uCell;
attribute vec2 aCorner; attribute vec4 aStream; attribute vec3 aMeta;
varying vec2 vUv; varying float vDepth; varying vec3 vCell;
void main(){
  // aStream: x, top y, z, falling speed (rows/s). aMeta: row, rows in stream, stream seed.
  // Built in local space; the mirror copy's model matrix flips it through the floor.
  vec3 base = vec3(aStream.x, aStream.y - aMeta.x * uCell.y, aStream.z);
  vec3 d = cameraPosition - base;
  vec3 right = normalize(vec3(d.z, 0.0, -d.x) + 1e-5);
  vec3 wp = base + right * aCorner.x * uCell.x + vec3(0.0, aCorner.y * uCell.y, 0.0);
  vec4 mv = viewMatrix * modelMatrix * vec4(wp, 1.0);
  vec4 p = projectionMatrix * mv;
  p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;
  gl_Position = p;
  vUv = aCorner + 0.5;
  vDepth = -mv.z;
  vCell = vec3(aMeta.x, aMeta.z, aMeta.y + floor(aMeta.y * 0.6));
  float span = vCell.z;
  vCell.z = mod(uRain * aStream.w + aMeta.z * span, span);
}`;
const GF = `
uniform sampler2D uAtlas; uniform vec3 uHead; uniform vec3 uTail; uniform float uRain; uniform float uFogNear; uniform float uFogFar; uniform float uGlitch;
varying vec2 vUv; varying float vDepth; varying vec3 vCell;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  float row = vCell.x, seed = vCell.y, head = vCell.z;
  float dist = head - row, trail = 9.0 + floor(seed * 13.0);
  if (dist < 0.0 || dist > trail) discard;
  float k = 1.0 - dist / trail;
  // Most cells hold their glyph for a while; the head and a few others churn.
  float rate = dist < 1.0 ? 14.0 : 0.6 + step(0.85, h(vec3(seed, row, 3.0))) * 7.0;
  float g = floor(h(vec3(seed * 91.0, row, floor(uRain * rate + seed * 17.0))) * 64.0);
  g = mix(g, floor(h(vec3(row, seed, floor(uRain * 30.0))) * 64.0), uGlitch * step(0.7, h(vec3(row, seed, 9.0))));
  vec2 uv = (vec2(mod(g, 8.0), floor(g / 8.0)) + vec2(vUv.x, 1.0 - vUv.y)) / 8.0;
  float on = texture2D(uAtlas, uv).r;
  if (on < 0.5) discard;
  vec3 c = mix(uTail, uHead, smoothstep(0.15, 0.85, k)) * (0.25 + 0.75 * k);
  c = mix(c, vec3(0.85, 1.0, 0.9), step(dist, 1.0));
  c *= 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(c, 1.0);
}`;

// Snapped floor lines that fade into the horizon haze.
const LV = `uniform vec2 uSnap; varying float vDepth; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vec4 p = projectionMatrix * mv; ${SNAP} gl_Position = p; vDepth = -mv.z; }`;
const LF = `uniform vec3 uColor; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; varying float vDepth; void main(){ gl_FragColor = vec4(mix(uColor, uFog, smoothstep(uFogNear, uFogFar, vDepth)), 1.0); }`;

const PAL = {
  zen: "#000300", mid: "#06401a", low: "#30d862", hor: "#dcffe8", fog: "#9ee8b6",
  ice: "#0e3e1e", sea: "#010603", ink: "#000000", light: [0.55, 0.62, 0.55] as [number, number, number],
};

export function buildMatrix(k: PsxKit): SceneDef {
  const { U, rnd, view, segs, circle } = k;
  const PIVOT = new THREE.Vector3(0, 8.5, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 600);
  const R = createRay(k, scene, PAL);
  R.floor({ checker: 4, fogNear: 40, fogFar: 160, size: 1100 });
  // The floor is finite; a haze-coloured skirt just under the horizon hides its far edge.
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(180, 180, 12, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: PAL.fog, side: THREE.BackSide, depthWrite: false }),
  );
  skirt.renderOrder = -0.5;
  scene.add(skirt);

  /* ---- glyph atlas: 64 random 5x7 bitmaps, mirrored now and then so they read as script ---- */
  const AT = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = AT;
  const g2 = cv.getContext("2d");
  if (!g2) throw new Error("2d canvas unavailable");
  const img = g2.createImageData(AT, AT);
  for (let gi = 0; gi < 64; gi++) {
    const ox = (gi % 8) * 8 + 1, oy = Math.floor(gi / 8) * 8;
    const mirror = rnd() > 0.55;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
      const sx = mirror && x > 2 ? 4 - x : x;
      // Hashed from (glyph, row, column); mirrored glyphs read their right half off the left.
      const s = Math.sin(gi * 127.1 + y * 311.7 + sx * 74.7) * 43758.5453;
      const on = s - Math.floor(s) > (y === 0 || y === 6 ? 0.62 : 0.5);
      const i = ((oy + y) * AT + ox + x) * 4;
      const v = on ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g2.putImageData(img, 0, 0);
  const atlas = new THREE.CanvasTexture(cv);
  atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  // Canvas rows run top-down; keep them that way so the atlas maths stays simple.
  atlas.flipY = false;

  /* ---- rain: streams scattered over a disc, kept clear of the core ---- */
  const rain = { value: 0 };
  const glitch = { value: 0 };
  const CW = 0.85, CH = 1.05;
  type Stream = { x: number; top: number; z: number; speed: number; rows: number; seed: number };
  const streams: Stream[] = [];
  // Stream 0 sits where the eye lands first; the déjà vu egg hangs off it.
  streams.push({ x: 7, top: 19, z: 9, speed: 6, rows: 18, seed: 0.37 });
  while (streams.length < 170) {
    const a = rnd() * Math.PI * 2, r = 9 + Math.pow(rnd(), 0.7) * 46;
    const rows = 12 + Math.floor(rnd() * 18);
    streams.push({
      x: Math.cos(a) * r, z: Math.sin(a) * r, rows,
      top: rows * CH + rnd() * 6 - 1,
      speed: 3 + rnd() * 7,
      seed: rnd(),
    });
  }
  const cells = streams.reduce((n, s) => n + s.rows, 0);
  const corner = new Float32Array(cells * 8), strm = new Float32Array(cells * 16), meta = new Float32Array(cells * 12);
  const idx = new Uint32Array(cells * 6);
  let c = 0;
  const QC = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
  for (const s of streams) {
    for (let j = 0; j < s.rows; j++, c++) {
      for (let v = 0; v < 4; v++) {
        const q = c * 4 + v;
        corner.set([QC[v * 2], QC[v * 2 + 1]], q * 2);
        strm.set([s.x, s.top, s.z, s.speed], q * 4);
        meta.set([j, s.rows, s.seed], q * 3);
      }
      idx.set([c * 4, c * 4 + 1, c * 4 + 2, c * 4, c * 4 + 2, c * 4 + 3], c * 6);
    }
  }
  const rg = new THREE.BufferGeometry();
  // Positions are rebuilt in the shader; this only gives three a vertex count and bounds.
  rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cells * 12), 3));
  rg.setAttribute("aCorner", new THREE.BufferAttribute(corner, 2));
  rg.setAttribute("aStream", new THREE.BufferAttribute(strm, 4));
  rg.setAttribute("aMeta", new THREE.BufferAttribute(meta, 3));
  rg.setIndex(new THREE.BufferAttribute(idx, 1));
  // Additive, so the glyphs glow over the sky and their reflection fades out rather than to black.
  const rainMat = new THREE.ShaderMaterial({
    vertexShader: GV,
    fragmentShader: GF,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSnap: U.uSnap, uHead: { value: new THREE.Color("#5cff86") }, uTail: { value: new THREE.Color("#0a6a26") },
      uFogNear: U.uFogNear, uFogFar: U.uFogFar,
      uAtlas: { value: atlas }, uRain: rain, uGlitch: glitch, uCell: { value: new THREE.Vector2(CW, CH) },
    },
  });
  R.both(() => {
    const m = new THREE.Mesh(rg, rainMat);
    m.frustumCulled = false;
    m.renderOrder = 2;
    return m;
  });

  const line = (color: string) =>
    new THREE.ShaderMaterial({
      vertexShader: LV,
      fragmentShader: LF,
      transparent: true,
      uniforms: { uSnap: U.uSnap, uColor: { value: new THREE.Color(color) }, uFog: R.uniforms.fog, uFogNear: U.uFogNear, uFogFar: U.uFogFar },
    });
  const lBright = line("#c8ffd8"), lDeep = line("#5cff86"), lDim = line("#1c8a3e");

  /* ---- floor: survey grid and a ticked ring under the core ---- */
  const grid: V3[] = [];
  for (let gx = -48; gx <= 48; gx += 8) {
    grid.push(new THREE.Vector3(gx, 0.03, -48), new THREE.Vector3(gx, 0.03, 48), new THREE.Vector3(-48, 0.03, gx), new THREE.Vector3(48, 0.03, gx));
  }
  // Drawn after the translucent floor so they stay clean lines on top of it.
  const gridSegs = segs(grid, lDim);
  scene.add(gridSegs);
  const ring = new THREE.Group();
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  scene.add(ring);
  ring.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle(5.5, 96)), lDeep));
  ring.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circle(4.2, 64)), lDeep));
  const ticks: V3[] = [];
  for (let dg = 0; dg < 360; dg += 10) {
    const r2 = (dg * Math.PI) / 180, len = dg % 90 === 0 ? 1.2 : 0.45;
    ticks.push(new THREE.Vector3(Math.cos(r2) * 5.5, Math.sin(r2) * 5.5, 0), new THREE.Vector3(Math.cos(r2) * (5.5 + len), Math.sin(r2) * (5.5 + len), 0));
  }
  const tickSegs = segs(ticks, lBright);
  ring.add(tickSegs);
  for (const o of [gridSegs, ...ring.children]) o.renderOrder = 3;

  /* ---- core: a tesseract turned through two 4D planes and projected down each frame ---- */
  const V4: number[][] = [];
  for (let i = 0; i < 16; i++) V4.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  const E4: [number, number][] = [];
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) if (!(i & (1 << b))) E4.push([i, i | (1 << b)]);
  // Edge-lit phosphor rods with a ball at each corner, in the world and in the mirror.
  const rod = R.flat({ tint: "#eafff0", amb: "#2a9a50", sun: "#f0fff4", emit: "#b8ffcc", emitAmt: 0.45, fogAmt: 0.3 });
  const rodGeo = k.facet(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)), ballGeo = k.facet(new THREE.IcosahedronGeometry(1, 1));
  const tess = R.both(() => {
    const g = new THREE.Group();
    g.position.copy(PIVOT);
    E4.forEach(() => g.add(new THREE.Mesh(rodGeo, rod)));
    V4.forEach(() => g.add(new THREE.Mesh(ballGeo, rod)));
    return g;
  });
  const P3 = V4.map(() => new THREE.Vector3());
  const UP = new THREE.Vector3(0, 1, 0), ed = new THREE.Vector3();
  const project = (a1: number, a2: number, s: number) => {
    const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    V4.forEach(([x, y, z, w], i) => {
      const x1 = x * c1 - w * s1, w1 = x * s1 + w * c1;
      const y1 = y * c2 - w1 * s2, w2 = y * s2 + w1 * c2;
      const f = s / (3 - w2);
      P3[i].set(x1 * f, y1 * f, z * f);
    });
    for (const g of tess) {
      E4.forEach(([a, b], e) => {
        const m = g.children[e];
        ed.subVectors(P3[b], P3[a]);
        m.position.addVectors(P3[a], P3[b]).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(UP, ed.clone().normalize());
        m.scale.set(0.2, ed.length(), 0.2);
      });
      P3.forEach((p, i) => {
        const m = g.children[E4.length + i];
        m.position.copy(p);
        m.scale.setScalar(0.45);
      });
    }
  };

  const dir = new THREE.Vector3();
  const hex = () => Math.floor(rnd() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
  let addr = hex(), addrTick = 0;
  // easter eggs: start times
  let tCore = -99, tDeja = -99, tRing = -99;

  return {
    scene, cam, fog: [30, 110], fov: [60, 72], limits: { pitch: [-0.6, 0.85], zoom: [0.5, 1.8] },
    labels: [
      { name: "Core", sub: "tesseract · 8 cells", at: (v) => { v.copy(PIVOT); v.y += 4.6; } },
      {
        name: "Rain", sub: `${streams.length} streams`,
        at: (v) => { v.set(streams[0].x, streams[0].top + 1, streams[0].z); },
        sub2: () => `0x${addr}`,
      },
    ],
    eggs: [
      {
        id: "matrix-core", r: 44,
        at: (v) => { v.copy(PIVOT); },
        fire: (t) => { tCore = t; },
      },
      {
        id: "matrix-deja", r: 30,
        at: (v) => { v.set(streams[0].x, streams[0].top - 6, streams[0].z); },
        fire: (t) => { tDeja = t; },
      },
      {
        id: "matrix-ring", r: 36,
        at: (v) => { v.set(0, 0, 6); },
        fire: (t) => { tRing = t; },
      },
    ],
    update(t) {
      const a = 0.9 + t * 0.025 + view.px * 0.2 + view.yaw, r = 28;
      cam.position.set(Math.cos(a) * r, Math.max(0.8, 5.5 + Math.sin(t * 0.08) * 1 - view.py * 4), Math.sin(a) * r);
      cam.lookAt(PIVOT.x, PIVOT.y - 2.5 - view.py * 2, PIVOT.z);
      k.orbit(cam, PIVOT);
      // Déjà vu: the rain stalls, runs back a beat, then carries on.
      const ed = t - tDeja;
      rain.value = t - (ed > 0 ? (ed < 1.2 ? ed : ed < 2 ? 1.2 + (ed - 1.2) * 1.5 : 2.4) : 0);
      glitch.value = pulse(ed, 2);
      const ec = burst(t - tCore, 6, 3);
      project(t * 0.31 + ec, t * 0.17 + ec * 0.6, 5.6 * (1 + 0.25 * pulse(t - tCore, 1.2)));
      for (const g of tess) {
        g.rotation.y = t * 0.08;
        g.position.y = PIVOT.y + Math.sin(t * 0.4) * 0.3;
      }
      R.uniforms.flash.value = 0.35 * pulse(t - tCore, 1.2);
      ring.rotation.z = t * 0.03 + burst(t - tRing, 4, 3);
      if (Math.floor(t * 4) !== addrTick) { addrTick = Math.floor(t * 4); addr = hex(); }
      R.follow(cam);
      skirt.position.set(cam.position.x, cam.position.y - 6, cam.position.z);
    },
    readout() {
      cam.getWorldDirection(dir);
      const el = (Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI;
      return [
        ["Sig", `0x${addr}`],
        ["Strm", `${streams.length}`],
        ["Cells", `${cells}`],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
        ["Elev", `${el < 0 ? "−" : "+"}${k.pad(Math.abs(el).toFixed(1), 4)}°`],
      ];
    },
  };
}
