/** Sheet · Drift: a dream, seen side-on. Far out on a still sea, a long train
 *  crosses the horizon on rails a hand's breadth under the surface. The sea is
 *  a mirror: everything above the waterline is drawn a second time, flipped
 *  through it, under a thin murk with slow ripple streaks. Sharp towers stand
 *  in it at every distance (shards, splayed clusters, slant-cut blades, broken
 *  stacks, obelisks), with half-sunk debris at their feet, rings, door frames
 *  and stairs to nowhere, and stone hanging in the air. Beyond the line,
 *  islands float upside down under a low sun that never sets.
 *
 *  The palette is fixed (dusk lilac and peach); only the seams in the towers
 *  and the drifting motes take the site accent.
 *  Tap the cab to sound the horn, a middle car to put its lights out, the tail
 *  lamp to swing it, the sun to flare it. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pulse, type PsxKit, type SceneDef } from "./psx";
import { createWaste, type WasteBatch } from "./wasteland";

const P = {
  zen: "#2c3566",
  mid: "#8a82ba",
  hor: "#f4d6c6",
  fog: "#e4c8ca",
  sun: "#fff7ea",
  sunGlow: "#ffc4a2",
  deep: "#323f68",
  foam: "#f6eeea",
  lamp: "#ffdfa6",
  tail: "#ff5c4c",
};

/** Train speed, m/s, and the line it runs on, far out from the eye. */
const V = 8;
const TZ = -140;

const NOISE = `
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }`;

// The sea mirrors the sky, so the dome below the horizon is the dome above it.
const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `
uniform vec3 uZen; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uSunDir; uniform float uFlare; uniform float uTime; varying vec3 vDir;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir); vec3 m = vec3(d.x, abs(d.y), d.z); float h = m.y;
  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.17, h));
  c = mix(c, uZen, smoothstep(0.15, 0.8, h));
  float s = max(dot(m, normalize(vec3(uSunDir.x, abs(uSunDir.y), uSunDir.z))), 0.0);
  c += uGlow * (pow(s, 5.0) * 0.26 + pow(s, 48.0) * 0.4) * (1.0 + uFlare * 1.6);
  c += uGlow * exp(-h * 34.0) * 0.16;
  vec3 q = floor(m * 140.0); float st = hash(q);
  c += vec3(step(0.9965, st) * smoothstep(0.3, 0.65, h) * (0.45 + 0.55 * sin(uTime * 1.3 + st * 60.0))) * 0.6;
  gl_FragColor = vec4(c, 1.0);
}`;

// The surface: a thin murk over the mirror world, thickening into haze toward the horizon,
// with ripple streaks, the sun's glitter, the train's foam and wake, and the headlamp's pool.
// Unsnapped: it is one quad, and snapping a vertex far behind the lens throws the whole plane.
const SEA_V = `
varying vec3 vWP; varying float vDepth;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv; vDepth = -mv.z; }`;
const SEA_F = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uFog; uniform vec3 uFoam; uniform vec3 uLamp; uniform vec3 uGlow;
uniform float uFogNear; uniform float uFogFar; uniform vec3 uTrain; uniform vec3 uHorn; uniform vec2 uSunXZ; uniform float uLampAmt;
varying vec3 vWP; varying float vDepth;
${NOISE}
void main(){
  vec2 w = vWP.xz + vec2(uTime * 0.6, 0.0);
  float fg = smoothstep(uFogNear, uFogFar, vDepth);
  vec3 c = mix(uDeep, uFog, fg);
  float a = mix(0.46, 1.0, fg);
  float nearK = 1.0 - smoothstep(25.0, 160.0, vDepth);

  // Ripple streaks: long lines across the view, wobbling as a slow swell passes under them.
  float wob = vn(vec2(w.x * 0.04, w.y * 0.25) + uTime * 0.04) * 2.2;
  float band = fract(w.y * 0.42 + wob + sin(w.x * 0.07 + uTime * 0.35) * 0.12);
  float streak = smoothstep(0.07, 0.0, abs(band - 0.5)) * (0.35 + 0.65 * vn(w * vec2(0.18, 1.0) + uTime * 0.08)) * nearK;
  c = mix(c, uFoam, streak * 0.3);
  a = max(a, streak * 0.45);

  // Glitter on the line from the eye to the sun.
  vec2 eye = cameraPosition.xz, dir = normalize(uSunXZ - eye), rel = vWP.xz - eye;
  float along = dot(rel, dir), perp = abs(rel.x * dir.y - rel.y * dir.x);
  float col = exp(-pow(perp / (0.8 + max(along, 0.0) * 0.07), 2.0)) * step(0.0, along);
  float spark = step(0.82, h2(floor(w * vec2(1.4, 3.0)) + floor(uTime * 5.0)));
  c += uGlow * col * (0.25 + spark * 0.9);
  a = max(a, col * spark * 0.8);

  // The train: churn along both sides, a widening V and a trail behind the last car.
  float side = abs(vWP.z - uTrain.z), behind = uTrain.x - vWP.x;
  vec2 tw = vec2(vWP.x - uTrain.x, vWP.z);
  float churn = smoothstep(0.35, 0.75, vn(tw * vec2(0.9, 2.6) + vec2(uTime * 4.0, uTime * 0.7)));
  float hull = step(uTrain.x, vWP.x) * step(vWP.x, uTrain.y + 0.8) * smoothstep(2.5, 1.35, side);
  float arm = step(0.0, behind) * smoothstep(0.45 + behind * 0.03, 0.0, abs(side - 1.4 - behind * 0.3)) * exp(-behind * 0.03);
  float trail = step(0.0, behind) * smoothstep(1.6, 0.3, side) * exp(-behind * 0.05);
  float foam = clamp(hull * 0.9 + arm + trail * 0.7, 0.0, 1.0) * churn;
  c = mix(c, uFoam, foam * 0.85);
  a = max(a, foam * 0.85);

  // Headlamp pool ahead of the cab.
  float ahead = vWP.x - uTrain.y;
  float pool = exp(-pow((ahead - 8.0) / 6.5, 2.0)) * exp(-side * side / 5.0) * step(0.0, ahead) * uLampAmt;
  c += uLamp * pool * 0.55;
  a = max(a, pool * 0.6);

  // Horn: rings running out over the water from the cab.
  if (uHorn.z > 0.0 && uHorn.z < 4.0) {
    float r = length(vWP.xz - uHorn.xy), k = 1.0 - uHorn.z / 4.0;
    float ring = smoothstep(1.2, 0.0, abs(r - uHorn.z * 16.0)) + smoothstep(1.2, 0.0, abs(r - (uHorn.z - 0.6) * 16.0)) * step(0.6, uHorn.z);
    c = mix(c, uFoam, ring * k * 0.7);
    a = max(a, ring * k * 0.7);
  }
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}`;

export function buildDrift(kit: PsxKit): SceneDef {
  const { U, rnd, facet, tex, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 3200);
  const fog: [number, number] = [30, 420];

  const fogU = { value: new THREE.Color(P.fog) };
  // Kit materials, re-pointed at this scene's own fog so the accent switch leaves the palette alone.
  const own = <M extends THREE.ShaderMaterial>(m: M) => {
    m.uniforms.uFogColor = fogU;
    return m;
  };
  // Unlit and a little over-bright: lamps, lit windows and the figures against them.
  const glow = <M extends THREE.ShaderMaterial>(m: M, k = 1.35) => {
    m.uniforms.uAmbient.value.setScalar(k);
    return own(m);
  };
  const lit = { amb: "#5a5880", sun: "#ffd8c6" };
  const mSpire = own(kit.psx({ map: tex.tStone, tint: "#7c7a9c", ...lit }));
  const mSpire2 = own(kit.psx({ map: tex.tPlain, tint: "#50527a", ...lit }));
  const mGlass = own(kit.psx({ map: tex.tGlass, tint: "#9aa4c6", ...lit }));
  const mFar = own(kit.psx({ map: tex.tPlain, tint: "#6c6690", fogAmt: 0.8, ...lit }));
  const mDebris = own(kit.psx({ map: tex.tStone, tint: "#aa9ea8", ...lit }));
  const mRust = own(kit.psx({ map: tex.tBark, tint: "#a06c5c", ...lit }));
  const mCloud = glow(kit.psx({ map: tex.tPlain, tint: "#f8e8ea", sun: "#000000", fogAmt: 0.45 }), 1.1);
  const mSeam = own(kit.psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.35 }));
  const tl = { amb: "#6c6478", sun: "#ffe2cc" };
  const mBody = own(kit.psx({ map: tex.tPlain, tint: "#8e3040", ...tl }));
  const mCream = own(kit.psx({ map: tex.tPlain, tint: "#f0e4cc", ...tl }));
  const mRoof = own(kit.psx({ map: tex.tPlain, tint: "#4c4460", ...tl }));
  const mIron = own(kit.psx({ map: tex.tPlain, tint: "#2c2a38", ...tl }));
  const mMetal = own(kit.psx({ map: tex.tPlain, tint: "#a6a2b4", ...tl }));
  const mWin = glow(kit.psx({ map: tex.tPlain, tint: P.lamp, sun: "#000000", fogAmt: 0.3 }));
  const mLamp = glow(kit.psx({ map: tex.tPlain, tint: P.lamp, sun: "#000000", fogAmt: 0.3 }), 1.6);
  const mPax = glow(kit.psx({ map: tex.tPlain, tint: "#1c1828", sun: "#000000", fogAmt: 0.3 }), 1);
  const mTail = glow(kit.psx({ map: tex.tPlain, tint: P.tail, sun: "#000000", fogAmt: 0.3 }), 1.4);
  const additive = (color: string, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  const W = createWaste(kit, { debris: mDebris, rust: mRust, seam: mSeam });
  const { between, box } = W;

  /* ---- sky: its own dome, wide enough for the horizon spires, following the camera ---- */
  const SUN = new THREE.Vector3(330, 64, -1280);
  const sunDir = new THREE.Vector3();
  const skyU = {
    uZen: { value: new THREE.Color(P.zen) }, uMid: { value: new THREE.Color(P.mid) }, uHor: { value: new THREE.Color(P.hor) },
    uGlow: { value: new THREE.Color(P.sunGlow) }, uSunDir: { value: sunDir }, uFlare: { value: 0 }, uTime: U.uTime,
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: skyU, vertexShader: SKY_V, fragmentShader: SKY_F }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // Everything above the waterline goes in `above`; a copy flipped through y = 0 is its reflection.
  const above = new THREE.Group();
  scene.add(above);
  const sun = kit.sunDisc(above, SUN.x, SUN.y, SUN.z, 38, P.sun, P.sunGlow);

  /* ---- the sea of spires, cut at the waterline ---- */
  {
    const b = W.batch(0);
    const sx = (half: number) => (rnd() - 0.5) * 2 * half;
    // Near: debris low in the water at the eye's feet.
    for (let i = 0; i < 10; i++) W.junk(b, sx(30), 0, between(-2, 20), between(0.3, 0.7));
    // Between the eye and the line: a few towers the train passes behind, and wreckage.
    for (let i = 0; i < 12; i++) W.spire(b, sx(130), 0, between(-24, -112), between(5, 24), [mSpire, mSpire2], true);
    for (let i = 0; i < 26; i++) W.junk(b, sx(130), 0, between(-6, -125), between(0.6, 1.8));
    // Beyond the line: a denser stand, low cloud between, small islands overhead.
    for (let i = 0; i < 42; i++) W.spire(b, sx(430), 0, between(-170, -330), between(18, 90), [mSpire, mSpire2, mGlass], true);
    for (let i = 0; i < 6; i++) b.add(W.cloud(between(30, 60)), mCloud, sx(400), between(8, 26), between(-200, -340));
    for (let i = 0; i < 5; i++) b.add(W.island(between(4, 9)), mSpire, sx(380), between(30, 80), between(-180, -300), 0, rnd() * 3, 0);
    // Horizon: tall hazed silhouettes, the high cloud and the big islands.
    for (let i = 0; i < 40; i++) W.spire(b, sx(960), 0, between(-420, -700), between(50, 200), [mFar], false);
    for (let i = 0; i < 12; i++) b.add(W.cloud(between(60, 160)), mCloud, sx(960), between(50, 200), between(-440, -700));
    for (let i = 0; i < 6; i++) b.add(W.island(between(14, 38)), mFar, sx(900), between(90, 240), between(-380, -620), 0, rnd() * 3, 0);
    b.flush(above);
  }
  const hang = W.hanging(above, 22, [mDebris, mSpire2, mRust], (s) => [(rnd() - 0.5) * 180, between(1.6, 10) + s, between(-10, -120)]);

  /* ---- the train: eight cars, cab leading to the right, running toward the sun ---- */
  const CAR = 11, GAP = 1, D = 2.6, N = 8, PITCH = CAR + GAP;
  const HALF = ((N - 1) / 2) * PITCH + CAR / 2 + D / 2;
  // The line wraps out of sight at both ends, even with the view turned all the way.
  const LOOP = 620;
  const train = new THREE.Group();
  train.position.z = TZ;
  above.add(train);
  const bodies: THREE.Group[] = [], axles: THREE.Mesh[] = [], pax: THREE.Mesh[] = [], bogX: number[] = [];
  const wheel = (z: number) => facet(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 8).rotateX(Math.PI / 2).translate(0, 0, z));
  const axleGeo = mergeGeometries([wheel(D / 2 - 0.22), wheel(-(D / 2 - 0.22)), facet(new THREE.CylinderGeometry(0.07, 0.07, D - 0.3, 4).rotateX(Math.PI / 2))])!;
  // One bar across each wheel face, so the turning reads up close.
  const spokeGeo = facet(new THREE.BoxGeometry(0.72, 0.08, D - 0.26));
  // Half-round end, bulging toward +x (dir 1) or -x (dir -1).
  const end = (b: WasteBatch, x: number, dir: number) => {
    const t0 = dir > 0 ? 0 : Math.PI, phi = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    b.add(facet(new THREE.CylinderGeometry(D / 2, D / 2, 1.25, 10, 1, false, t0, Math.PI)), mBody, x, 1.62, 0);
    b.add(facet(new THREE.CylinderGeometry(D / 2, D / 2, 1.35, 10, 1, false, t0, Math.PI)), mCream, x, 2.945, 0);
    b.add(facet(new THREE.SphereGeometry(D / 2, 10, 4, phi, Math.PI, 0, Math.PI / 2).scale(1, 0.38, 1)), mRoof, x, 3.62, 0);
  };
  let lanternPivot: THREE.Group | null = null;
  for (let i = 0; i < N; i++) {
    const cx = (i - (N - 1) / 2) * PITCH;
    const car = new THREE.Group();
    car.position.x = cx;
    train.add(car);
    const body = new THREE.Group();
    car.add(body);
    bodies.push(body);

    const b = W.batch(0);
    b.add(box(CAR, 1.25, D), mBody, 0, 1.62, 0);
    b.add(box(CAR + 0.02, 0.08, D + 0.02), mIron, 0, 2.27, 0);
    b.add(box(CAR, 1.35, D), mCream, 0, 2.945, 0);
    b.add(facet(new THREE.CylinderGeometry(D / 2, D / 2, CAR, 10, 1, false, Math.PI, Math.PI).rotateZ(-Math.PI / 2).scale(1, 0.38, 1)), mRoof, 0, 3.62, 0);
    b.add(box(CAR - 1.2, 0.35, D - 0.5), mIron, 0, 0.85, 0);
    for (const vx of [-2.6, 2.6]) b.add(box(1.2, 0.2, 0.7), mRoof, vx, 4.1, 0);
    if (i === 0) end(b, -CAR / 2, -1);
    if (i === N - 1) {
      end(b, CAR / 2, 1);
      b.add(box(0.14, 0.32, 0.55), mLamp, CAR / 2 + D / 2 + 0.02, 1.75, 0);
    }
    b.flush(body);

    // Windows go right through the body, so both sides are lit; some have a figure against the light.
    const wb = W.batch(0), pb = W.batch(0);
    for (let j = 0; j < 7; j++) {
      const wx = -CAR / 2 + 1.1 + (j * (CAR - 2.2)) / 6;
      wb.add(box(0.9, 0.8, D + 0.04), mWin, wx, 2.95, 0);
      if (rnd() < 0.55) {
        const px = wx + (rnd() - 0.5) * 0.3;
        pb.add(box(0.44, 0.44, D + 0.06), mPax, px, 2.77, 0);
        pb.add(box(0.28, 0.3, D + 0.07), mPax, px + (rnd() - 0.5) * 0.06, 3.13, 0);
      }
    }
    if (i === N - 1) wb.add(facet(new THREE.CylinderGeometry(D / 2 + 0.03, D / 2 + 0.03, 0.7, 10, 1, true, 0.5, Math.PI - 1)), mWin, CAR / 2, 3.0, 0);
    wb.flush(body);
    pax.push(...pb.flush(body));

    // Bogies hold the rails; the body rides a little above them.
    const fb = W.batch(0);
    for (const bx of [-(CAR / 2 - 2.1), CAR / 2 - 2.1]) {
      bogX.push(cx + bx);
      fb.add(box(2.4, 0.28, D - 0.1), mIron, bx, 0.62, 0);
      for (const ax of [-0.7, 0.7]) {
        const a = kit.mesh(axleGeo, mIron, car, bx + ax, 0.44, 0);
        kit.mesh(spokeGeo, mMetal, a);
        axles.push(a);
      }
    }
    fb.flush(car);

    if (i < N - 1) kit.mesh(box(GAP + 0.4, 2.2, 1.7), mIron, train, cx + PITCH / 2, 2.3, 0);
    if (i === 0) {
      lanternPivot = new THREE.Group();
      lanternPivot.position.set(-CAR / 2 - D / 2 - 0.12, 2.5, 0);
      body.add(lanternPivot);
      kit.mesh(box(0.06, 0.32, 0.06), mIron, lanternPivot, 0, -0.16, 0);
      kit.mesh(box(0.24, 0.3, 0.24), mTail, lanternPivot, 0, -0.45, 0);
    }
  }
  const lantern = lanternPivot!;

  /* ---- the reflection: a copy of everything above, flipped through the surface ---- */
  const below = above.clone();
  below.scale.y = -1;
  scene.add(below);
  const la: THREE.Object3D[] = [], lb: THREE.Object3D[] = [];
  above.traverse((o) => la.push(o));
  below.traverse((o) => lb.push(o));

  /* ---- not mirrored: the sea, the rails under it, the lamp's beam, spray and motes ---- */
  const seaU = {
    uTime: U.uTime, uDeep: { value: new THREE.Color(P.deep) }, uFog: fogU, uFoam: { value: new THREE.Color(P.foam) },
    uLamp: { value: new THREE.Color(P.lamp) }, uGlow: { value: new THREE.Color(P.sunGlow) }, uFogNear: U.uFogNear, uFogFar: U.uFogFar,
    uTrain: { value: new THREE.Vector3(-HALF, HALF, TZ) }, uHorn: { value: new THREE.Vector3(0, TZ, -9) },
    uSunXZ: { value: new THREE.Vector2(SUN.x, SUN.z) }, uLampAmt: { value: 1 },
  };
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: seaU, vertexShader: SEA_V, fragmentShader: SEA_F }),
  );
  sea.renderOrder = 1;
  sea.frustumCulled = false;
  scene.add(sea);

  {
    const rail = facet(new THREE.BoxGeometry(LOOP + 120, 0.07, 0.09, 180, 1, 1));
    for (const z of [-0.72, 0.72]) kit.mesh(rail, mIron, scene, 0, -0.12, TZ + z);
    const sb = kit.batcher(), sleeper = facet(new THREE.BoxGeometry(0.22, 0.05, 1.9));
    for (let x = -LOOP / 2 - 60; x < LOOP / 2 + 60; x += 1.2) sb.add(sleeper, Math.abs(x % 6) < 1.2 ? mRust : mIron, x, -0.2, TZ);
    sb.flush(scene);
  }

  const beamMat = additive(P.lamp, 0.1);
  const beam = kit.mesh(new THREE.ConeGeometry(1.5, 16, 10, 1, true).rotateZ(Math.PI / 2), beamMat, scene, 0, 1.75, TZ);
  beam.renderOrder = 2;
  const lampGlow = kit.flare(scene, 0, 1.75, TZ, 0.8);
  lampGlow.mat.color.set(P.lamp);
  lampGlow.g.visible = true;
  const tailGlow = kit.flare(scene, 0, 0, 0, 0.55);
  tailGlow.mat.color.set(P.tail);
  tailGlow.g.visible = true;
  for (const f of [lampGlow, tailGlow]) f.g.children.forEach((c) => { c.renderOrder = 2; });

  // Spray thrown off the wheels, drifting back along the hull.
  const NS = 128, sprayPos = new Float32Array(NS * 3), spraySeed = Array.from({ length: NS }, () => [rnd(), rnd(), rnd()]);
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute("position", new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: P.foam, size: 1.4, sizeAttenuation: false }));
  spray.frustumCulled = false;
  scene.add(spray);

  /* ---- eggs ---- */
  let hornT = -99, lightsT = -99, lanternT = -99, sunT = -99, tNow = 0;
  const lampOn = new THREE.Color(P.lamp), lampOff = new THREE.Color("#2a2638"), winTint = mWin.uniforms.uTint.value as THREE.Color;
  const onTrain = (v: THREE.Vector3, x: number, y: number) => v.set(train.position.x + x, y, TZ);
  const eggs: SceneDef["eggs"] = [
    { id: "drift-horn", r: 34, at: (v) => { onTrain(v, HALF - 5, 3); }, fire: (t) => { hornT = t; } },
    { id: "drift-lights", r: 30, at: (v) => { onTrain(v, -PITCH / 2, 3); }, fire: (t) => { lightsT = t; } },
    { id: "drift-lantern", r: 24, at: (v) => { lantern.getWorldPosition(v).y -= 0.45; }, fire: (t) => { lanternT = t; } },
    { id: "drift-sun", r: 50, at: (v) => { v.copy(SUN); }, fire: (t) => { sunT = t; } },
  ];

  const wrap = (v: number, s: number) => ((v % s) + s) % s;

  return {
    scene,
    cam,
    fog,
    fov: [50, 66],
    limits: { pitch: [-0.22, 0.3], zoom: [0.85, 3.2], yaw: 0.25 },
    labels: [
      { name: "Train", sub: `${N} CARS, NO STOPS`, at: (v) => { onTrain(v, HALF - 6, 6); } },
      { name: "Sun", sub: "NOT SETTING", at: (v) => { v.copy(SUN).y += 60; } },
    ],
    eggs,
    update(t) {
      tNow = t;
      hang(t);

      // The ride: the train runs the line and wraps out of sight; wheels turn at line speed,
      // each body rocks a little on its springs.
      const tx = wrap(V * t, LOOP) - LOOP / 2;
      train.position.x = tx;
      seaU.uTrain.value.set(tx - HALF, tx + HALF, TZ);
      const spin = -((V * t) / 0.42) % (Math.PI * 2);
      for (const a of axles) a.rotation.z = spin;
      bodies.forEach((b, i) => {
        b.position.y = 0.022 * (1 + Math.sin(t * 6.3 + i * 1.9));
        b.rotation.z = 0.003 * Math.sin(t * 2.1 + i * 2.4);
      });

      // Horn: two blasts of the lamp and rings out over the water.
      const eh = t - hornT, blast = pulse(eh, 0.5) + pulse(eh - 0.7, 0.5);
      seaU.uHorn.value.set(tx + HALF - 3, TZ, eh);
      lampGlow.g.position.set(tx + HALF + 0.25, 1.75, TZ);
      lampGlow.mat.opacity = 0.5 + 0.9 * blast;
      lampGlow.g.lookAt(cam.position);
      beam.position.x = tx + HALF + 8;
      beamMat.opacity = 0.12 + 0.22 * blast;
      seaU.uLampAmt.value = 1 + blast;

      // Lights: they flicker and go out; when they come back the seats are empty, for a while.
      const el = t - lightsT;
      let lamp = 1, seated = true;
      if (el > 0 && el < 5.5) {
        if (el < 0.7) lamp = Math.sin(el * 40) > 0 ? 1 : 0.15;
        else if (el < 2.2) lamp = 0.06;
        else seated = false;
      }
      winTint.lerpColors(lampOff, lampOn, lamp);
      for (const m of pax) m.visible = seated;

      // Tail lamp: swings on its hook and brightens.
      const et = t - lanternT;
      lantern.rotation.z = et > 0 && et < 7 ? Math.sin(et * 5.5) * 0.7 * Math.exp(-et * 0.7) : 0;
      lantern.updateWorldMatrix(true, false);
      tailGlow.g.position.set(0, -0.45, 0).applyMatrix4(lantern.matrixWorld);
      tailGlow.mat.opacity = 0.35 + 0.7 * pulse(et, 2.2);
      tailGlow.g.lookAt(cam.position);

      const es = t - sunT;
      sun.scale.setScalar(1 + 0.4 * pulse(es, 1.6));
      skyU.uFlare.value = pulse(es, 2.4);

      for (let i = 0; i < NS; i++) {
        const [a, b, c] = spraySeed[i];
        const ph = (t * (1.1 + a * 0.6) + b) % 1, bow = i < 16;
        const bx = bow ? HALF - 0.4 : bogX[i % bogX.length], side = Math.floor(i / bogX.length) % 2 ? 1 : -1;
        sprayPos[i * 3] = tx + bx + 0.5 - ph * (bow ? 3.5 : 2.2 + c * 1.5);
        sprayPos[i * 3 + 1] = 0.04 + Math.sin(ph * Math.PI) * (bow ? 0.3 + c * 0.7 : 0.15 + c * 0.45);
        sprayPos[i * 3 + 2] = TZ + side * (bow ? 0.3 + ph * (0.8 + a) : D / 2 - 0.1 + ph * (0.4 + a * 0.8));
      }
      sprayGeo.attributes.position.needsUpdate = true;

      // Standing at the water's edge, looking out at the line; drag turns the head, zoom is the lens.
      cam.position.set(Math.sin(t * 0.05) * 2 + view.px * 1.5, 3.4 - view.py * 0.4, 34);
      cam.lookAt(6 + view.px * 6 + Math.sin(t * 0.04) * 2, 4.6 - view.py * 3, TZ);
      kit.look(cam);
      sky.position.copy(cam.position);
      sea.position.set(cam.position.x, 0, cam.position.z);
      sunDir.copy(SUN).sub(cam.position).normalize();
      sun.lookAt(cam.position);

      for (let i = 1; i < la.length; i++) {
        const a = la[i], b = lb[i];
        b.position.copy(a.position);
        b.quaternion.copy(a.quaternion);
        b.scale.copy(a.scale);
        b.visible = a.visible;
      }
    },
    readout: () => [
      ["LINE", "OPEN SEA"],
      ["SPEED", `${Math.round(V * 3.6)} km/h`],
      ["DEPTH", `${(0.12 + 0.03 * Math.sin(tNow * 0.4)).toFixed(2)} m`],
      ["BRG", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
      ["TRAIN", Math.abs(train.position.x) < 200 ? "IN SIGHT" : "PAST"],
    ],
  };
}
