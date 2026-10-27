/** Sheet · Frost: the wasteland frozen over. A sea locked in cracked ice runs
 *  out under a polar twilight; the spires here are ice, pushed up in pressure
 *  ridges and splayed clusters (shards, blades, needles), with the wreckage
 *  caught in the freeze around them: slabs, beams, a ring and a door frame
 *  standing out of the ice. At the centre a crown of ice shards grows round a
 *  dark blade with lit seams. Snow falls, stone hangs over the ice, islands
 *  float upside down, and an aurora hangs over all of it.
 *
 *  The palette is fixed (ice blue, polar dusk, aurora green and violet); only
 *  the seams and the drifting motes take the site accent.
 *  Tap the crown to wake its seams, the aurora to flare it, the moon to swell it. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef } from "./psx";
import { createWaste } from "./wasteland";

const P = {
  zen: "#0b1230",
  mid: "#27396a",
  hor: "#a2b8d2",
  fog: "#7c90ac",
  aur1: "#6af2c0",
  aur2: "#b48cff",
  moon: "#f2f6ff",
  moonGlow: "#a8c4ff",
  snow: "#eef4ff",
};

const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `
uniform vec3 uZen; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uFog; uniform vec3 uA1; uniform vec3 uA2; uniform vec3 uGlow; uniform vec3 uMoonDir;
uniform float uTime; uniform float uSurge; varying vec3 vDir;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.16, h));
  c = mix(c, uZen, smoothstep(0.14, 0.7, h));
  // Aurora: curtains folding round the sky, green at the hem, violet higher up.
  float lon = atan(d.z, d.x);
  float fold = sin(lon * 5.0 + sin(lon * 3.0 + uTime * 0.07) * 1.6 + uTime * 0.05);
  float hem = 0.22 + 0.06 * sin(lon * 7.0 + uTime * 0.11);
  float band = smoothstep(hem - 0.02, hem + 0.04, h) * exp(-max(h - hem, 0.0) * 5.0);
  float rays = 0.6 + 0.4 * sin(lon * 80.0 + uTime * 0.6 + fold * 3.0);
  float a = band * smoothstep(-0.3, 0.9, fold) * rays * (0.55 + uSurge * 1.4);
  c += mix(uA1, uA2, smoothstep(hem, hem + 0.25, h)) * a * 0.55;
  float m = max(dot(d, uMoonDir), 0.0);
  c += uGlow * pow(m, 30.0) * 0.4;
  vec3 q = floor(d * 160.0); float st = hash(q);
  c += vec3(step(0.996, st) * smoothstep(0.1, 0.5, h) * (0.5 + 0.5 * sin(uTime * 1.9 + st * 70.0))) * 0.8;
  c = mix(c, uFog, smoothstep(0.02, -0.06, h));
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildFrost(kit: PsxKit): SceneDef {
  const { U, rnd, facet, tex, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(56, 16 / 9, 0.5, 3000);
  const FOG: [number, number] = [40, 520];
  const fog: [number, number] = [...FOG];

  const fogU = { value: new THREE.Color(P.fog) };
  const own = <M extends THREE.ShaderMaterial>(m: M) => {
    m.uniforms.uFogColor = fogU;
    return m;
  };
  // Pale blue ice with a few long dark cracks, 32px like the kit's textures.
  const iceTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    if (!g) throw new Error("2d canvas unavailable");
    const img = g.createImageData(32, 32);
    const put = (x: number, y: number, r: number, gg: number, bb: number) => {
      const i = (((y + 32) % 32) * 32 + ((x + 32) % 32)) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
    };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const k = 0.88 + rnd() * 0.14;
      put(x, y, 196 * k, 220 * k, 236 * k);
    }
    for (let n = 0; n < 4; n++) {
      let x = Math.floor(rnd() * 32), y = Math.floor(rnd() * 32);
      for (let s = 0; s < 22; s++) {
        put(x, y, 96, 128, 160);
        x += Math.round(rnd() * 2 - 1) || 1;
        y += rnd() > 0.5 ? 1 : 0;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const lit = { amb: "#5a7098", sun: "#dcecff" };
  const mFloe = own(kit.psx({ map: iceTex, tint: "#e8f2ff", ...lit }));
  const mIce = own(kit.psx({ map: tex.tPlain, tint: "#d4e8f4", ...lit }));
  const mIce2 = own(kit.psx({ map: tex.tGlass, tint: "#b0cce0", ...lit }));
  const mIceDark = own(kit.psx({ map: tex.tPlain, tint: "#4c6a8c", ...lit }));
  const mFar = own(kit.psx({ map: tex.tPlain, tint: "#8aa2c0", fogAmt: 0.8, ...lit }));
  const mDebris = own(kit.psx({ map: tex.tStone, tint: "#98a2b2", ...lit }));
  const mRust = own(kit.psx({ map: tex.tBark, tint: "#8e6c66", ...lit }));
  const mSeam = own(kit.psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.3 }));
  const mCore = own(kit.psx({ map: tex.tPlain, tint: "#000000", emit: 1, fogAmt: 0.2 }));
  const W = createWaste(kit, { debris: mDebris, rust: mRust, seam: mSeam });
  const { between } = W;

  /* ---- sky, aurora and a low moon ---- */
  const MOON = new THREE.Vector3(-520, 210, -980);
  const moonDir = new THREE.Vector3();
  const skyU = {
    uZen: { value: new THREE.Color(P.zen) }, uMid: { value: new THREE.Color(P.mid) }, uHor: { value: new THREE.Color(P.hor) }, uFog: fogU,
    uA1: { value: new THREE.Color(P.aur1) }, uA2: { value: new THREE.Color(P.aur2) }, uGlow: { value: new THREE.Color(P.moonGlow) },
    uMoonDir: { value: moonDir }, uTime: U.uTime, uSurge: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: skyU, vertexShader: SKY_V, fragmentShader: SKY_F }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  const moon = kit.sunDisc(scene, MOON.x, MOON.y, MOON.z, 26, P.moon, P.moonGlow);

  /* ---- the frozen sea: a low swell caught in the ice, drifted snow on it ---- */
  const groundH = (x: number, z: number) =>
    0.5 * Math.sin(x * 0.04 + z * 0.02) + 0.35 * Math.sin(z * 0.07 - x * 0.03) + 0.15 * Math.sin(x * 0.2 + z * 0.17);
  {
    const geo = new THREE.PlaneGeometry(2400, 2400, 150, 150);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundH(x, z));
      uv.setXY(i, x * 0.05, z * 0.05);
    }
    kit.mesh(facet(geo, 0.3), mFloe, scene);
  }

  const b = W.batch();
  const ice = [mIce, mIce2, mIceDark];
  const polar = (r0: number, r1: number): [number, number] => {
    const a = rnd() * Math.PI * 2, r = between(r0, r1);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  // Pressure ridges: lines of ice shards pushed up along arcs across the floe.
  for (let ridge = 0; ridge < 9; ridge++) {
    const a0 = rnd() * Math.PI * 2, r0 = between(40, 260), len = between(60, 200), n = Math.floor(len / 7);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * (len / r0), r = r0 + Math.sin(i * 0.7) * 6, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(Math.hypot(x, z) - 96) < 10) continue;
      const h = between(3, 14) * (1 - Math.abs(i / n - 0.5));
      W.cluster(b, ice[i % 3], x, groundH(x, z) - 0.5, z, h + 2, (h + 2) * 0.12);
    }
  }
  for (let i = 0; i < 46; i++) {
    const [x, z] = polar(115, 420);
    W.spire(b, x, groundH(x, z) - 1, z, between(12, 60), ice, true, { sharp: true, lean: 1.8 });
  }
  for (let i = 0; i < 40; i++) {
    const [x, z] = polar(440, 820);
    W.spire(b, x, -2, z, between(40, 150), [mFar], false, { sharp: true });
  }
  // Wreckage caught in the freeze.
  for (let i = 0; i < 60; i++) {
    const [x, z] = polar(20, 240);
    if (Math.abs(Math.hypot(x, z) - 96) > 9) W.junk(b, x, groundH(x, z) - 0.3, z, between(0.6, 2.2));
  }
  for (let i = 0; i < 6; i++) {
    const [x, z] = polar(160, 460);
    b.add(W.island(between(6, 15)), mFar, x, between(70, 150), z, 0, rnd() * 3, 0);
  }
  b.flush(scene);

  // The crown: ice shards splayed round a dark blade, its seams on their own material so they can wake.
  const CROWN_H = 48;
  {
    const cb = W.batch();
    cb.add(W.blade(7, CROWN_H, 2.4, 18), mIceDark, 0, -2, 0, 0.03, 0.5, 0.05);
    cb.add(facet(new THREE.BoxGeometry(0.8, CROWN_H * 0.62, 2.8)).translate(1.2, CROWN_H * 0.42, 0), mCore, 0, -2, 0, 0.03, 0.5, 0.05);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rnd() * 0.3, d = between(5, 14), h = between(10, 34), tilt = between(0.2, 0.55);
      cb.add(W.shard(between(1.2, 2.6), h, 3 + (i % 3)), ice[i % 2], Math.cos(a) * d, -1, Math.sin(a) * d, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    }
    cb.flush(scene);
  }

  const hang = W.hanging(scene, 18, [mDebris, mIceDark, mRust], (s) => {
    const [x, z] = polar(16, 70);
    return [x, between(8, 32) + s, z];
  });

  /* ---- eggs ---- */
  let crownT = -99, auroraT = -99, moonT = -99, tNow = 0;
  const AURORA = new THREE.Vector3(0, 230, -700);
  const pivot = new THREE.Vector3(), tmp = new THREE.Vector3(), UP = THREE.Object3D.DEFAULT_UP;

  return {
    scene,
    cam,
    fog,
    fov: [56, 72],
    limits: { pitch: [-0.1, 0.55], zoom: [0.6, 2.2] },
    labels: [
      { name: "Crown", sub: "GROWING", at: (v) => { v.set(0, CROWN_H + 6, 0); } },
      { name: "Aurora", sub: "QUIET", at: (v) => { v.copy(AURORA); } },
    ],
    eggs: [
      { id: "frost-crown", r: 56, at: (v) => { v.set(0, CROWN_H * 0.5, 0); }, fire: (t) => { crownT = t; } },
      { id: "frost-aurora", r: 80, at: (v) => { tmp.copy(AURORA).sub(cam.position).normalize(); v.copy(cam.position).addScaledVector(tmp, 600); }, fire: (t) => { auroraT = t; } },
      { id: "frost-moon", r: 44, at: (v) => { v.copy(MOON); }, fire: (t) => { moonT = t; } },
    ],
    update(t) {
      tNow = t;
      hang(t);
      const ec = pulse(t - crownT, 4);
      mCore.uniforms.uEmit.value = 0.6 + 0.25 * Math.sin(t * 1.1) + ec * 2.4;
      skyU.uSurge.value = pulse(t - auroraT, 5);
      moon.scale.setScalar(1 + 0.45 * pulse(t - moonT, 1.8));

      // A slow walk round the crown, low over the ice.
      const ang = -0.4 + Math.sin(t * 0.018) * 0.4 + view.yaw + view.px * 0.15;
      pivot.set(0, 18, 0);
      tmp.set(0, -7, 96).applyAxisAngle(UP, ang);
      cam.position.copy(pivot).add(tmp);
      cam.position.y -= view.py * 2;
      cam.lookAt(pivot.x, pivot.y + 6, pivot.z);
      kit.orbit(cam, pivot);
      cam.position.y = Math.max(cam.position.y, groundH(cam.position.x, cam.position.z) + 2);
      const k = Math.max(1, 1 / view.zoom);
      fog[0] = FOG[0] * k;
      fog[1] = FOG[1] * k;
      sky.position.copy(cam.position);
      moonDir.copy(MOON).sub(cam.position).normalize();
      moon.lookAt(cam.position);
    },
    readout: () => [
      ["TEMP", `${Math.round(-41 + 2 * Math.sin(tNow * 0.07))}°C`],
      ["ICE", "3.2 m"],
      ["KP", `${(4 + 2 * pulse(tNow - auroraT, 5) + Math.sin(tNow * 0.05)).toFixed(1)}`],
      ["BRG", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
      ["SUN", "BELOW"],
    ],
  };
}
