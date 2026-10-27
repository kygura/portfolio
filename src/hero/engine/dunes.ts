/** Sheet · Dunes: the wasteland in a desert. Bleached dunes run out to a
 *  white horizon; towers stand half buried in them at hard leans (shards,
 *  splayed clusters, slant-cut blades, broken stacks, obelisks), a giant shard
 *  lies toppled across a crest, and a ring the size of a building stands up out
 *  of the sand. At the centre a monument of blades and shards leans together
 *  with seams lit in the accent. Stone hangs in the heat, islands float upside
 *  down overhead, and sand streams off the crests in the wind.
 *
 *  The palette is fixed (bone, ochre, washed-out sky); only the seams and the
 *  heat motes take the site accent.
 *  Tap the monument to wake its seams, the ring to turn it, the sun to flare it. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef } from "./psx";
import { createWaste } from "./wasteland";

const P = {
  zen: "#46628a",
  hor: "#ead8b8",
  fog: "#d9c3a0",
  glow: "#ffe2a8",
  sun: "#fffbee",
  sand: "#d8bc96",
  grain: "#f4e2c0",
};

const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uFog; uniform vec3 uGlow; uniform vec3 uSunDir; uniform float uFlare; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 c = mix(uHor, uZen, smoothstep(0.0, 0.32, h));
  float s = max(dot(d, uSunDir), 0.0);
  c += uGlow * (pow(s, 4.0) * 0.3 + pow(s, 30.0) * 0.5) * (1.0 + uFlare * 1.5);
  // A white band of heat haze sitting on the horizon.
  c = mix(c, vec3(1.0, 0.98, 0.93), exp(-abs(h) * 26.0) * 0.3);
  c = mix(c, uFog, smoothstep(0.02, -0.08, h));
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildDunes(kit: PsxKit): SceneDef {
  const { rnd, facet, tex, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(56, 16 / 9, 0.5, 3000);
  const FOG: [number, number] = [50, 560];
  const fog: [number, number] = [...FOG];

  const fogU = { value: new THREE.Color(P.fog) };
  const own = <M extends THREE.ShaderMaterial>(m: M) => {
    m.uniforms.uFogColor = fogU;
    return m;
  };
  const lit = { amb: "#9a8a80", sun: "#fff0d8" };
  const mSand = own(kit.psx({ map: tex.tSand, tint: P.sand, ...lit }));
  const mBone = own(kit.psx({ map: tex.tStone, tint: "#e6dcc8", ...lit }));
  const mDark = own(kit.psx({ map: tex.tPlain, tint: "#5e5466", ...lit }));
  const mGlass = own(kit.psx({ map: tex.tGlass, tint: "#c4c8c4", ...lit }));
  const mFar = own(kit.psx({ map: tex.tPlain, tint: "#a89a9c", fogAmt: 0.78, ...lit }));
  const mDebris = own(kit.psx({ map: tex.tStone, tint: "#c8b8a0", ...lit }));
  const mRust = own(kit.psx({ map: tex.tBark, tint: "#b0704e", ...lit }));
  const mSeam = own(kit.psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.3 }));
  const mCore = own(kit.psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.2 }));
  const W = createWaste(kit, { debris: mDebris, rust: mRust, seam: mSeam });
  const { between } = W;

  /* ---- sky ---- */
  const SUN = new THREE.Vector3(-420, 380, -1000);
  const sunDir = new THREE.Vector3();
  const skyU = {
    uZen: { value: new THREE.Color(P.zen) }, uHor: { value: new THREE.Color(P.hor) }, uFog: fogU,
    uGlow: { value: new THREE.Color(P.glow) }, uSunDir: { value: sunDir }, uFlare: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: skyU, vertexShader: SKY_V, fragmentShader: SKY_F }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const sun = kit.sunDisc(scene, SUN.x, SUN.y, SUN.z, 30, P.sun, P.glow);

  /* ---- dunes: long asymmetric crests across the wind, flattened round the monument ---- */
  const groundH = (x: number, z: number) => {
    const u = x * 0.021 + z * 0.006 + Math.sin(z * 0.013) * 1.3;
    const crest = Math.pow(0.5 + 0.5 * Math.sin(u), 2.2) * 9;
    const swell = 3 * Math.sin(x * 0.006 - z * 0.009) + 1.4 * Math.sin(z * 0.05 - x * 0.02);
    const r = Math.hypot(x, z), flat = THREE.MathUtils.smoothstep(r, 18, 70);
    return (crest + swell) * flat - 1;
  };
  {
    const geo = new THREE.PlaneGeometry(2400, 2400, 170, 170);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundH(x, z));
      uv.setXY(i, x * 0.07, z * 0.07);
    }
    kit.mesh(facet(geo, 0.6), mSand, scene);
  }

  /* ---- the waste in the sand ---- */
  const b = W.batch();
  const polar = (r0: number, r1: number): [number, number] => {
    const a = rnd() * Math.PI * 2, r = between(r0, r1);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  // Towers buried a tenth of their height, leaning hard.
  for (let i = 0; i < 64; i++) {
    const [x, z] = polar(125, 420), h = between(12, 70);
    W.spire(b, x, groundH(x, z) - h * 0.1, z, h, [mBone, mDark, mGlass], true, { lean: 3.5 });
  }
  for (let i = 0; i < 44; i++) {
    const [x, z] = polar(460, 820), h = between(40, 170);
    W.spire(b, x, groundH(x, z) - h * 0.1, z, h, [mFar], false, { lean: 2.5 });
  }
  for (let i = 0; i < 80; i++) {
    const [x, z] = polar(22, 230);
    // Keep the camera's walk clear.
    if (Math.abs(Math.hypot(x, z) - 112) > 9) W.junk(b, x, groundH(x, z), z, between(0.6, 2.4));
  }
  // A giant shard toppled across a crest, half sunk.
  const FX = 64, FZ = -58;
  b.add(W.shard(7, 78, 4), mBone, FX, groundH(FX, FZ) - 2, FZ, 0.2, 0.6, 1.42);
  for (let i = 0; i < 6; i++) {
    const [x, z] = polar(180, 520);
    b.add(W.island(between(6, 16)), mFar, x, between(70, 150), z, 0, rnd() * 3, 0);
  }
  b.flush(scene);

  // The monument: blades and shards leaning in on a tall central blade, its seams on their own material so they can wake.
  const MON = new THREE.Vector3(0, 0, 0), MON_H = 62;
  {
    const mb = W.batch();
    mb.add(W.blade(11, MON_H, 3.2, 26), mBone, 0, -4, 0, 0.04, 0.3, -0.12);
    mb.add(facet(new THREE.BoxGeometry(1.1, MON_H * 0.6, 3.6)).translate(1.6, MON_H * 0.4, 0), mCore, 0, -4, 0, 0.04, 0.3, -0.12);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.4, d = between(9, 16), h = between(18, 40), tilt = between(0.25, 0.5);
      mb.add(W.shard(between(1.8, 3), h, 3 + (i % 3)), i % 3 ? mBone : mDark, Math.cos(a) * d, -2, Math.sin(a) * d, -Math.sin(a) * tilt, 0, Math.cos(a) * tilt);
      if (i % 2) mb.add(facet(new THREE.BoxGeometry(0.4, h * 0.5, 0.4)).translate(0, h * 0.4, 0), mCore, Math.cos(a) * d, -2, Math.sin(a) * d, -Math.sin(a) * tilt, 0, Math.cos(a) * tilt);
    }
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, d = between(12, 24);
      W.junk(mb, Math.cos(a) * d, -0.6, Math.sin(a) * d, between(0.8, 2));
    }
    mb.flush(scene);
  }

  // The ring: standing up out of the sand, its own mesh so it can turn.
  const RX = -58, RZ = -36;
  const ring = kit.mesh(facet(new THREE.TorusGeometry(17, 1.7, 5, 22), 0.3), mBone, scene, RX, groundH(RX, RZ) + 9, RZ, 0, 0.9, 0);
  kit.mesh(facet(new THREE.TorusGeometry(17, 0.35, 3, 22)), mSeam, ring, 0, 0, 0);

  const hang = W.hanging(scene, 20, [mDebris, mDark, mRust], (s) => {
    const [x, z] = polar(18, 60);
    return [x, between(10, 34) + s, z];
  });

  /* ---- eggs ---- */
  let monT = -99, ringT = -99, sunT = -99, tNow = 0;
  const pivot = new THREE.Vector3(), tmp = new THREE.Vector3(), UP = THREE.Object3D.DEFAULT_UP;

  return {
    scene,
    cam,
    fog,
    fov: [56, 72],
    limits: { pitch: [-0.12, 0.55], zoom: [0.55, 2.2] },
    labels: [
      { name: "Monument", sub: "STILL WARM", at: (v) => { v.set(MON.x, MON_H + 6, MON.z); } },
      { name: "Ring", sub: "HALF BURIED", at: (v) => { v.set(RX, groundH(RX, RZ) + 30, RZ); } },
    ],
    eggs: [
      { id: "dunes-monument", r: 60, at: (v) => { v.set(0, MON_H * 0.55, 0); }, fire: (t) => { monT = t; } },
      { id: "dunes-ring", r: 44, at: (v) => { v.copy(ring.position); }, fire: (t) => { ringT = t; } },
      { id: "dunes-sun", r: 46, at: (v) => { v.copy(SUN); }, fire: (t) => { sunT = t; } },
    ],
    update(t) {
      tNow = t;
      hang(t);
      const em = t - monT, wake = pulse(em, 4);
      mCore.uniforms.uEmit.value = 0.7 + 0.25 * Math.sin(t * 1.3) + wake * 2.2;
      ring.rotation.y = 0.9 + t * 0.01 + burst(t - ringT, 2.4, 3.5);
      const es = t - sunT;
      sun.scale.setScalar(1 + 0.4 * pulse(es, 1.6));
      skyU.uFlare.value = pulse(es, 2.4);

      // A slow walk round the monument; zooming out lifts the eye over the dune field.
      const out = THREE.MathUtils.clamp((1 - view.zoom) / 0.45, 0, 1);
      const ang = 0.5 + Math.sin(t * 0.021) * 0.35 + view.yaw + view.px * 0.15;
      pivot.set(0, 20 + out * 20, 0);
      tmp.set(0, 4, 112).applyAxisAngle(UP, ang);
      cam.position.copy(pivot).add(tmp);
      cam.position.y -= view.py * 2;
      cam.lookAt(pivot);
      kit.orbit(cam, pivot);
      cam.position.y = Math.max(cam.position.y, groundH(cam.position.x, cam.position.z) + 3);
      const k = Math.max(1, 1 / view.zoom);
      fog[0] = FOG[0] * k;
      fog[1] = FOG[1] * k;
      sky.position.copy(cam.position);
      sunDir.copy(SUN).sub(cam.position).normalize();
      sun.lookAt(cam.position);
    },
    readout: () => [
      ["WIND", `${Math.round(38 + 6 * Math.sin(tNow * 0.3))} km/h`],
      ["TEMP", `${Math.round(51 + 2 * Math.sin(tNow * 0.05))}°C`],
      ["ELEV", `${Math.round(cam.position.y * 4 + 410)} m`],
      ["BRG", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
      ["WATER", "NONE"],
    ],
  };
}
