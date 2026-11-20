/** Sheet · Study: a room at three in the morning, the one interior on the site.
 *  A desk under a rain-streaked window, a lamp in the accent colour making a
 *  pool of light on it, an old CRT scrolling a terminal, a tape deck turning
 *  over, a mug, a stack of books. A tall bookshelf stands to one side, and on
 *  top of it Bit, the stone automaton from the corner of the page, is asleep.
 *  Outside, rain falls past the window in front of a city of lit windows
 *  under a low, glowing sky.
 *
 *  The room keeps its own warm dark tones; the lamp light, the screen, the
 *  city glow and Bit's eye take the site accent.
 *  Tap the lamp to switch it off and on, the tape deck to rewind it, Bit to wake it. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef } from "./psx";

// The screen: lines of blocky text scroll up one at a time while the last line types out.
const CRT_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CRT_F = `
uniform float uTime; uniform vec3 uAccent; uniform float uBoot; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = (vUv - 0.07) / 0.86;
  vec3 bg = uAccent * 0.05 + vec3(0.012, 0.016, 0.014);
  vec3 c = bg;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    float rows = 13.0, cols = 30.0;
    float s = uTime * 1.4 + uBoot;
    float r = floor((1.0 - uv.y) * rows), col = floor(uv.x * cols);
    float L = r + floor(s);
    float ind = floor(h(vec2(L, 2.0)) * 3.0) * 2.0;
    float len = ind + 3.0 + floor(h(vec2(L, 1.0)) * (cols - 8.0));
    // The bottom line is still being typed.
    float typed = r == rows - 1.0 ? ind + floor(fract(s) * (len - ind + 1.0)) : len;
    float on = step(ind, col) * step(col, min(len, typed) - 1.0) * step(0.16, h(vec2(L * 3.1, col)));
    vec2 f = fract(vec2(uv.x * cols, (1.0 - uv.y) * rows));
    float px = floor(f.x * 4.0), py = floor(f.y * 6.0);
    float glyph = step(px, 2.0) * step(py, 4.0) * step(0.42, h(vec2(L * 31.0 + col, px * 7.0 + py)));
    float head = step(0.86, h(vec2(L, 5.0)));
    c += uAccent * on * glyph * (0.75 + 0.5 * head);
    // Cursor at the end of the line being typed.
    float cur = step(rows - 1.0, r) * step(typed, col) * step(col, typed) * step(0.5, fract(uTime * 1.8)) * step(py, 4.0);
    c += uAccent * cur;
  }
  c *= 0.82 + 0.18 * sin(vUv.y * 13.0 * 6.0 * 3.14159);
  vec2 e = vUv - 0.5;
  c *= 1.0 - dot(e, e) * 1.6;
  gl_FragColor = vec4(c, 1.0);
}`;

// Rain beyond the glass: short streaks that fall and wrap, drawn faint and additive.
const RAIN_V = `
uniform float uTime; uniform vec2 uSnap; attribute float aSeed; attribute float aEnd; varying float vEnd; varying float vDepth;
void main(){
  float y = 6.0 - mod(uTime * (9.0 + aSeed * 5.0) + aSeed * 97.0, 13.0) + aEnd * 0.5;
  vec4 mv = modelViewMatrix * vec4(position.x - aEnd * 0.06, y, position.z, 1.0);
  vec4 p = projectionMatrix * mv;
  p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;
  gl_Position = p; vEnd = aEnd; vDepth = -mv.z;
}`;
const RAIN_F = `uniform vec3 uFogColor; varying float vEnd; varying float vDepth;
void main(){ vec3 c = mix(vec3(0.42, 0.48, 0.54), uFogColor, 0.3) * (0.35 + 0.5 * vEnd) * (1.0 - smoothstep(4.0, 16.0, vDepth) * 0.6); gl_FragColor = vec4(c, 1.0); }`;

// The lamp's pool of light on the desk.
const POOL_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const POOL_F = `uniform vec3 uAccent; uniform float uLevel; varying vec2 vUv;
void main(){ float r = length(vUv - 0.5) * 2.0; float k = pow(1.0 - smoothstep(0.0, 1.0, r), 2.0);
  gl_FragColor = vec4(mix(vec3(1.0, 0.86, 0.62), uAccent, 0.4) * k * 0.42 * uLevel, 1.0); }`;

export function buildStudy(k: PsxKit): SceneDef {
  const { U, rnd, facet, wallUV, psx, view, tex } = k;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 420);
  scene.add(k.skyDome(0, 0.35, 0.9, 0.55));
  const { add, flush } = k.batcher();

  /* ---- materials: the room is lit by its own light, which the lamp egg dims ---- */
  const LDIR = { value: new THREE.Vector3(-0.35, 0.75, 0.55).normalize() };
  const lit: { m: THREE.ShaderMaterial; amb: THREE.Color; sun: THREE.Color }[] = [];
  const mk = (o: Parameters<typeof psx>[0]) => {
    const m = psx(o);
    m.uniforms.uLightDir = LDIR;
    lit.push({ m, amb: m.uniforms.uAmbient.value.clone(), sun: m.uniforms.uSun.value.clone() });
    return m;
  };
  const warm = { amb: "#4a4038", sun: "#c9b08c" };
  const mWall = mk({ map: tex.tPlain, tint: "#5c544a", uv: 2, ...warm });
  const mWall2 = mk({ map: tex.tPlain, tint: "#4a443d", uv: 2, ...warm });
  const mFloor = mk({ map: tex.tBark, tint: "#8a6e54", uv: 2, ...warm });
  const mRug = mk({ map: tex.tPlain, tint: "#5a3a34", uv: 3, ...warm });
  const mWood = mk({ map: tex.tBark, tint: "#a07e5e", uv: 3, ...warm });
  const mDark = mk({ map: tex.tPlain, tint: "#2a2826", ...warm });
  const mPlastic = mk({ map: tex.tPlain, tint: "#d4ccb6", uv: 4, ...warm });
  const mMetal = mk({ map: tex.tPlain, tint: "#3c3e3c", ...warm });
  const mStone = mk({ map: tex.tStone, tint: "#b4ae9c", uv: 3, ...warm });
  const mMoss = mk({ map: tex.tMoss, tint: "#ffffff", uv: 3, ...warm });
  const books = ["#7a3e34", "#3e5a52", "#b49a6a", "#4a4a62", "#8c7a5a", "#5e3a4a", "#c8bea4", "#3a4a3a"].map((tint) =>
    mk({ map: tex.tPlain, tint, uv: 4, ...warm }));
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) =>
    add(facet(new THREE.BoxGeometry(w, h, d)), m, x, y, z, 0, ry, 0);

  /* ---- the room: 8 wide, 3.2 high, a window in the back wall over the desk ---- */
  const W = 4, HT = 3.2, BACK = -3, FRONT = 3.2;
  const WX = 1.25, WY0 = 1.3, WY1 = 2.65;
  const plane = (w: number, h: number) => facet(new THREE.PlaneGeometry(w, h));
  add(plane(W * 2, FRONT - BACK).rotateX(-Math.PI / 2), mFloor, 0, 0, (BACK + FRONT) / 2);
  add(plane(W * 2, FRONT - BACK).rotateX(Math.PI / 2), mWall2, 0, HT, (BACK + FRONT) / 2);
  add(plane(W - WX, HT), mWall, -(W + WX) / 2, HT / 2, BACK);
  add(plane(W - WX, HT), mWall, (W + WX) / 2, HT / 2, BACK);
  add(plane(WX * 2, WY0), mWall, 0, WY0 / 2, BACK);
  add(plane(WX * 2, HT - WY1), mWall, 0, (HT + WY1) / 2, BACK);
  add(plane(FRONT - BACK, HT).rotateY(Math.PI / 2), mWall2, -W, HT / 2, (BACK + FRONT) / 2);
  add(plane(FRONT - BACK, HT).rotateY(-Math.PI / 2), mWall2, W, HT / 2, (BACK + FRONT) / 2);
  add(plane(W * 2, HT).rotateY(Math.PI), mWall2, 0, HT / 2, FRONT);
  box(W * 2, 0.12, 0.03, mWood, 0, 0.06, BACK + 0.02);
  // Window frame, sill and a cross of glazing bars.
  box(WX * 2 + 0.2, 0.06, 0.26, mWood, 0, WY0 - 0.03, BACK + 0.06);
  box(WX * 2 + 0.2, 0.08, 0.1, mWood, 0, WY1 + 0.04, BACK);
  box(0.08, WY1 - WY0, 0.1, mWood, -WX - 0.04, (WY0 + WY1) / 2, BACK);
  box(0.08, WY1 - WY0, 0.1, mWood, WX + 0.04, (WY0 + WY1) / 2, BACK);
  box(0.04, WY1 - WY0, 0.05, mWood, 0, (WY0 + WY1) / 2, BACK);
  box(WX * 2, 0.04, 0.05, mWood, 0, (WY0 + WY1) / 2, BACK);
  add(plane(3.2, 2.2).rotateX(-Math.PI / 2), mRug, 0.1, 0.005, -1.2);

  /* ---- desk and what is on it ---- */
  const DY = 0.76, DZ = -2.45;
  box(2.2, 0.06, 0.9, mWood, 0, DY, DZ);
  for (const x of [-1.04, 1.04]) for (const z of [DZ - 0.38, DZ + 0.38]) box(0.06, DY, 0.06, mWood, x, DY / 2, z);
  box(0.5, 0.42, 0.04, mWood, 0.8, DY - 0.24, DZ - 0.42);
  // CRT: beige case, dark bezel, the screen drawn by its own shader.
  const MX = -0.35, MZ = DZ - 0.1, MY = DY + 0.03 + 0.05;
  box(0.24, 0.05, 0.22, mPlastic, MX, MY - 0.025, MZ);
  box(0.56, 0.46, 0.44, mPlastic, MX, MY + 0.23, MZ - 0.02);
  box(0.36, 0.32, 0.12, mPlastic, MX, MY + 0.22, MZ - 0.28);
  box(0.48, 0.38, 0.01, mDark, MX, MY + 0.24, MZ + 0.2);
  const crtU = { uTime: U.uTime, uAccent: U.uAccent, uBoot: { value: rnd() * 40 } };
  const screen = new THREE.Mesh(plane(0.44, 0.34), new THREE.ShaderMaterial({ vertexShader: CRT_V, fragmentShader: CRT_F, uniforms: crtU }));
  screen.position.set(MX, MY + 0.24, MZ + 0.207);
  scene.add(screen);
  box(0.5, 0.03, 0.16, mPlastic, -0.3, DY + 0.045, DZ + 0.3);
  // Books, a mug.
  [[0.3, 0.05, 0.22, 0], [0.28, 0.04, 0.2, 0.15], [0.32, 0.06, 0.23, -0.1], [0.26, 0.04, 0.19, 0.3]].reduce((y, [w, h, d, r], i) => {
    box(w, h, d, books[i], -0.88, y + h / 2, DZ - 0.15, r);
    return y + h;
  }, DY + 0.03);
  add(facet(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8)), mPlastic, 0.82, DY + 0.08, DZ + 0.28);
  add(facet(new THREE.TorusGeometry(0.028, 0.008, 4, 8)), mPlastic, 0.87, DY + 0.085, DZ + 0.28, 0, 0, 0);

  // Tape deck under the lamp, two reels turning in its window.
  const TX = 0.32, TZ = DZ + 0.12, TY = DY + 0.03;
  box(0.4, 0.09, 0.26, mMetal, TX, TY + 0.045, TZ);
  box(0.24, 0.005, 0.11, mDark, TX, TY + 0.092, TZ - 0.02);
  const reelGeo = facet(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 10));
  const spokeGeo = facet(new THREE.BoxGeometry(0.075, 0.016, 0.01));
  const reels = [-0.065, 0.065].map((dx) => {
    const g = new THREE.Group();
    g.position.set(TX + dx, TY + 0.098, TZ - 0.02);
    scene.add(g);
    k.mesh(reelGeo, mDark, g);
    for (let i = 0; i < 3; i++) k.mesh(spokeGeo, mPlastic, g, 0, 0, 0, 0, (i * Math.PI) / 3, 0);
    return g;
  });

  // Anglepoise lamp: a base, two arms and a shade over the deck.
  const LB = new THREE.Vector3(0.78, DY + 0.03, DZ - 0.2);
  const elbow = new THREE.Vector3(0.7, DY + 0.5, DZ - 0.32), headP = new THREE.Vector3(0.4, DY + 0.58, DZ + 0.02);
  add(facet(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 8)), mMetal, LB.x, LB.y + 0.015, LB.z);
  const armGeo = facet(new THREE.BoxGeometry(0.02, 0.02, 1));
  for (const [a, b] of [[LB, elbow], [elbow, headP]] as const) {
    const arm = k.mesh(armGeo, mMetal, scene, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    arm.scale.z = a.distanceTo(b);
    arm.lookAt(b);
  }
  const mShade = mk({ map: tex.tPlain, tint: "#3c3e3c", side: THREE.DoubleSide, ...warm });
  k.mesh(facet(new THREE.ConeGeometry(0.12, 0.16, 8, 1, true)), mShade, scene, headP.x, headP.y, headP.z, 0, 0, 0.35);
  const bulbMat = psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0 });
  k.mesh(new THREE.IcosahedronGeometry(0.035, 0), bulbMat, scene, headP.x + 0.02, headP.y - 0.06, headP.z);
  const level = { value: 1 };
  const poolC = new THREE.Vector3(headP.x + 0.08, DY + 0.034, headP.z - 0.02);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    vertexShader: POOL_V, fragmentShader: POOL_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAccent: U.uAccent, uLevel: level },
  }));
  pool.position.copy(poolC);
  scene.add(pool);
  const beamMat = new THREE.MeshBasicMaterial({ color: "#ffdcae", transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamH = headP.y - 0.06 - poolC.y;
  k.mesh(new THREE.ConeGeometry(0.42, beamH, 16, 1, true), beamMat, scene, poolC.x - 0.04, poolC.y + beamH / 2, poolC.z);

  // Chair, seen from behind.
  box(0.46, 0.06, 0.44, mDark, -0.2, 0.46, -1.6);
  box(0.44, 0.42, 0.05, mDark, -0.2, 0.74, -1.36, 0);
  box(0.05, 0.4, 0.05, mMetal, -0.2, 0.22, -1.6);
  box(0.5, 0.03, 0.05, mMetal, -0.2, 0.02, -1.6);
  box(0.05, 0.03, 0.5, mMetal, -0.2, 0.02, -1.6);

  /* ---- bookshelf left of the window ---- */
  const SX = -2.65, SZ = BACK + 0.2, SW = 1.4, SH = 2.2;
  box(0.04, SH, 0.34, mWood, SX - SW / 2, SH / 2, SZ);
  box(0.04, SH, 0.34, mWood, SX + SW / 2, SH / 2, SZ);
  box(SW, 0.02, 0.34, mWood, SX, SH, SZ);
  box(SW, 0.02, 0.34, mDark, SX, SH / 2, SZ - 0.16);
  for (let s = 0; s < 4; s++) {
    const y = 0.08 + s * 0.53;
    box(SW, 0.03, 0.34, mWood, SX, y, SZ);
    let x = SX - SW / 2 + 0.05;
    while (x < SX + SW / 2 - 0.12) {
      const w = 0.035 + rnd() * 0.04, h = 0.26 + rnd() * 0.16, lean = rnd() > 0.92 ? 0.25 : 0;
      if (rnd() > 0.9) { x += 0.12; continue; }
      add(facet(new THREE.BoxGeometry(w, h, 0.22)), books[Math.floor(rnd() * books.length)], x + w / 2, y + 0.015 + h / 2, SZ + 0.02, 0, 0, lean);
      x += w + 0.004 + (lean ? 0.06 : 0);
    }
  }
  // A framed contour print right of the window.
  const pc = document.createElement("canvas");
  pc.width = pc.height = 64;
  const p2 = pc.getContext("2d");
  if (!p2) throw new Error("2d canvas unavailable");
  p2.fillStyle = "#1a2224";
  p2.fillRect(0, 0, 64, 64);
  p2.strokeStyle = "#cfc8b4";
  for (let r = 4; r < 34; r += 4) {
    p2.beginPath();
    p2.ellipse(30 + r * 0.15, 34 - r * 0.1, r, r * 0.8, 0.4, 0, Math.PI * 2);
    p2.stroke();
  }
  const pt = new THREE.CanvasTexture(pc);
  pt.magFilter = pt.minFilter = THREE.NearestFilter;
  pt.generateMipmaps = false;
  box(0.62, 0.78, 0.03, mWood, 2.5, 1.75, BACK + 0.02);
  const mPrint = mk({ map: pt, tint: "#ffffff", ...warm });
  k.mesh(plane(0.52, 0.68), mPrint, scene, 2.5, 1.75, BACK + 0.04);

  /* ---- Bit, asleep on top of the shelf ---- */
  const bit = new THREE.Group();
  bit.position.set(SX + 0.3, SH + 0.01, SZ + 0.04);
  bit.rotation.y = 0.35;
  scene.add(bit);
  const eyeMat = psx({ map: tex.tPlain, tint: "#000000", emit: 0.2, fogAmt: 0 });
  const runeMat = psx({ map: tex.tPlain, tint: "#1a1a18", emit: 0.1, fogAmt: 0 });
  const body = new THREE.Group(), headG = new THREE.Group();
  bit.add(body, headG);
  k.mesh(facet(new THREE.BoxGeometry(0.13, 0.12, 0.11)), mStone, body, 0, 0.06, 0);
  k.mesh(facet(new THREE.BoxGeometry(0.05, 0.05, 0.005)), runeMat, body, 0, 0.065, 0.056);
  headG.position.y = 0.15;
  k.mesh(facet(new THREE.BoxGeometry(0.22, 0.16, 0.17)), mStone, headG, 0, 0.08, 0);
  k.mesh(facet(new THREE.BoxGeometry(0.15, 0.05, 0.01)), mDark, headG, 0, 0.075, 0.086);
  k.mesh(facet(new THREE.BoxGeometry(0.05, 0.03, 0.01)), eyeMat, headG, 0, 0.075, 0.09);
  k.mesh(facet(new THREE.BoxGeometry(0.1, 0.02, 0.12)), mMoss, headG, -0.05, 0.165, -0.01);
  const ears = [-0.16, 0.16].map((x) => k.mesh(facet(new THREE.BoxGeometry(0.04, 0.05, 0.04)), mStone, headG, x, 0.08, 0));
  const hands = [-0.11, 0.11].map((x) => k.mesh(facet(new THREE.BoxGeometry(0.035, 0.035, 0.035)), mStone, bit, x, 0.05, 0.02));

  /* ---- outside: rain in front of a city of lit windows ---- */
  const N = 420;
  const rp = new Float32Array(N * 6), seed = new Float32Array(N * 2), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = (rnd() - 0.5) * 16, z = BACK - 0.6 - rnd() * 12, s = rnd();
    rp.set([x, 0, z, x, 0, z], i * 6);
    seed.set([s, s], i * 2);
    end.set([0, 1], i * 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  rg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  rg.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
  const rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
    vertexShader: RAIN_V, fragmentShader: RAIN_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uSnap: U.uSnap, uFogColor: U.uFogColor },
  }));
  rain.frustumCulled = false;
  scene.add(rain);
  const mCity = psx({ map: tex.tGlass, tint: "#8a909a", amb: "#4a5260", sun: "#4a5260", emit: 0.04, fogAmt: 0.7 });
  const beacons: THREE.Mesh[] = [];
  const beaconMat = psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.3 });
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - 0.5) * 120, z = -45 - rnd() * 60, w = 4 + rnd() * 8, d = 4 + rnd() * 6;
    const top = -4 + rnd() * (Math.abs(x) < 25 ? 12 : 8), h = top + 40;
    add(wallUV(facet(new THREE.BoxGeometry(w, h, d)), 0.25), mCity, x, top - h / 2, z, 0, rnd() * 0.4, 0);
    if (top > 4 && beacons.length < 4) beacons.push(k.mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), beaconMat, scene, x, top + 0.4, z));
  }
  flush(scene);

  /* ---- motion state ---- */
  const CAM = new THREE.Vector3(1.15, 1.45, 1.95), AIM = new THREE.Vector3(-0.15, 1.08, -2.4);
  let lastT = -1, lampOn = true, tLamp = -99, tTape = -99, tBit = -99, tapeRot = 0;
  const dimmed = new THREE.Color();

  return {
    scene, cam, idleFps: 30, fog: [10, 160], fov: [60, 74], limits: { pitch: [-0.35, 0.3], zoom: [0.8, 2], yaw: 0.6 },
    labels: [
      { name: "Desk", sub: "02:47", at: (v) => { v.set(0, DY + 0.8, DZ); } },
      { name: "Bit", sub: "asleep", at: (v) => { v.copy(bit.position).y += 0.5; } },
    ],
    eggs: [
      { id: "study-lamp", r: 30, at: (v) => { v.copy(headP); }, fire: (t) => { tLamp = t; lampOn = !lampOn; } },
      { id: "study-tape", r: 26, at: (v) => { v.set(TX, TY + 0.06, TZ); }, fire: (t) => { tTape = t; } },
      { id: "study-bit", r: 30, at: (v) => { v.copy(bit.position).y += 0.15; }, fire: (t) => { tBit = t; } },
    ],
    update(t) {
      const dt = lastT < 0 ? 1 : Math.max(0, Math.min(0.1, t - lastT));
      lastT = t;

      // The lamp: a quick flicker when it is switched, then an eased fade to its new level.
      const target = lampOn ? 1 : 0, flick = t - tLamp < 0.25 ? (Math.sin((t - tLamp) * 80) > 0 ? 1 : 0.4) : 1;
      level.value += (target - level.value) * Math.min(1, dt * 6);
      const L = level.value * flick, room = 0.22 + 0.78 * L;
      for (const { m, amb, sun } of lit) {
        m.uniforms.uAmbient.value.copy(dimmed.copy(amb).multiplyScalar(room));
        m.uniforms.uSun.value.copy(dimmed.copy(sun).multiplyScalar(L));
      }
      bulbMat.uniforms.uEmit.value = 0.15 + 1.2 * L;
      beamMat.opacity = 0.05 * L;
      level.value = Math.max(0, Math.min(1, level.value));

      // Tape: steady play, and a fast rewind after a tap.
      tapeRot += dt * 2.4;
      const rw = burst(t - tTape, 40, 2.4);
      reels.forEach((g, i) => { g.rotation.y = -(tapeRot * (i ? 0.8 : 1.25)) + rw * (i ? 1 : 1.4); });

      // Bit: breathing in its sleep, or awake for a few seconds after a tap.
      const awake = pulse(t - tBit, 5);
      const hop = pulse(t - tBit, 0.5);
      headG.rotation.x = 0.28 * (1 - awake) + Math.sin(t * 0.9) * 0.02;
      bit.position.y = SH + 0.01 + hop * 0.09 + Math.sin(t * 0.9) * 0.004;
      eyeMat.uniforms.uEmit.value = 0.12 + 0.06 * Math.sin(t * 0.9) + 1.3 * awake;
      runeMat.uniforms.uEmit.value = 0.08 + 0.7 * awake;
      ears.forEach((e, i) => { e.position.y = 0.08 + Math.sin(t * 1.3 + i * 2) * 0.008 + awake * 0.02; });
      hands.forEach((hd, i) => { hd.position.y = 0.05 + awake * (0.06 + Math.sin(t * 7 + i * 3) * 0.02); });

      beacons.forEach((b, i) => { b.visible = Math.sin(t * 2.2 + i * 1.7) > 0.6; });

      cam.position.set(CAM.x + Math.sin(t * 0.13) * 0.06 + view.px * 0.15, CAM.y + Math.sin(t * 0.21) * 0.025 - view.py * 0.1, CAM.z);
      cam.lookAt(AIM.x + view.px * 0.4, AIM.y - view.py * 0.3, AIM.z);
      k.look(cam);
    },
    readout() {
      const s = 2 * 3600 + 47 * 60 + Math.floor(lastT < 0 ? 0 : lastT);
      const tape = Math.floor((tapeRot / 2.4) % 2700);
      return [
        ["Time", `${k.pad(Math.floor(s / 3600) % 24)}:${k.pad(Math.floor(s / 60) % 60)}`],
        ["Lamp", lampOn ? "On" : "Off"],
        ["Tape", `A ${k.pad(Math.floor(tape / 60))}:${k.pad(tape % 60)}`],
        ["Rain", "4 mm/h"],
        ["Brg", `${k.pad(Math.round(k.bearing(cam)), 3)}°`],
      ];
    },
  };
}
