/** Sheet · Orb: an early raytracer's still life. A chrome planet hangs over a
 *  lone pyramid on a glittering mirror sea that runs out to a white horizon
 *  under a deep ultramarine sky. Everything doubles in the water.
 *
 *  The palette is fixed (the render's, not the site accent): cobalt overhead,
 *  white haze at the horizon, ice-cyan on the lit faces and the sea.
 *  Tap the orb to set it spinning, the pyramid's apex to light it. */
import * as THREE from "three";
import { burst, pulse, type PsxKit, type SceneDef } from "./psx";

const P = {
  zen: "#0d1290",
  mid: "#2a43d6",
  low: "#7fa6ee",
  hor: "#eef6ff",
  fog: "#c9def4",
  ice: "#a8e6f0",
  sea: "#5a8cc4",
  ink: "#1a2a40",
};

const SNAP = `p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;`;

/* One sky function shared by the dome, the sea's reflection and the orb's chrome. */
const SKY = `
uniform vec3 uZen; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uHor;
vec3 sky(float y){
  y = max(y, 0.0);
  vec3 c = mix(uHor, uLow, smoothstep(0.0, 0.035, y));
  c = mix(c, uMid, smoothstep(0.03, 0.22, y));
  return mix(c, uZen, smoothstep(0.2, 0.75, y));
}
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.07; a *= 0.5; } return s; }
`;

const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Below the horizon the dome mirrors itself, a touch darker, so the sea has a sky to reflect.
const SKY_F = `${SKY}
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c = sky(abs(d.y));
  if (d.y < 0.0) c *= vec3(0.78, 0.88, 0.95);
  gl_FragColor = vec4(c, 1.0);
}`;

// Chrome marble: the sky and the sea reflected, swirled by domain-warped noise in the orb's own space.
const ORB_V = `
uniform vec2 uSnap; varying vec3 vN; varying vec3 vWP; varying vec3 vObj;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal); vWP = wp.xyz; vObj = position;
  vec4 p = projectionMatrix * viewMatrix * wp;
  ${SNAP}
  gl_Position = p;
}`;
const ORB_F = `${SKY}
uniform vec3 uIce; uniform vec3 uInk; uniform vec3 uLight; uniform float uFlash;
varying vec3 vN; varying vec3 vWP; varying vec3 vObj;
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(vWP - cameraPosition);
  vec3 r = reflect(v, n);
  vec3 env = r.y > 0.0 ? sky(r.y) : mix(uIce * 0.85, uHor, smoothstep(-0.25, 0.0, r.y)) * (0.75 + 0.4 * vnoise(r * 40.0));
  vec3 q = normalize(vObj) * 1.6;
  float w = fbm(q * 1.3 + fbm(q * 2.4) * 2.2);
  float band = 0.5 + 0.5 * sin(w * 14.0);
  vec3 c = mix(env * vec3(0.62, 0.8, 0.84), mix(uInk, uIce * 0.75, band * 0.7), smoothstep(0.26, 0.5, w) * 0.85);
  c = mix(c, vec3(0.92, 0.98, 1.0), smoothstep(0.86, 0.98, band) * 0.35);
  float lam = max(dot(n, uLight), 0.0);
  c *= 0.22 + 1.05 * pow(lam, 0.7);
  c += pow(max(dot(r, uLight), 0.0), 40.0) * 0.6 + uFlash;
  gl_FragColor = vec4(c, 1.0);
}`;

// Glitter sea: a speckled ice crust over the mirror, thinner (more reflective) at grazing angles.
const SEA_V = `
uniform vec2 uSnap; varying vec3 vWP; varying float vDepth;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
  vec4 mv = viewMatrix * wp; vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p; vDepth = -mv.z;
}`;
const SEA_F = `${SKY}
uniform vec3 uIce; uniform vec3 uSea; uniform vec3 uFog; uniform float uTime; uniform float uFogNear; uniform float uFogFar;
varying vec3 vWP; varying float vDepth;
void main(){
  vec3 p = vec3(vWP.x * 0.9, uTime * 0.25, vWP.z * 2.4);
  float n = fbm(p) * 0.65 + vnoise(vec3(floor(vWP.xz * 7.0), floor(uTime * 5.0))) * 0.35;
  vec3 c = mix(uSea, uIce, smoothstep(0.35, 0.7, n));
  c = mix(c, vec3(0.95, 1.0, 1.0), step(0.86, n));
  float graze = 1.0 - abs(normalize(cameraPosition - vWP).y);
  float a = mix(0.92, 0.42, smoothstep(0.75, 0.99, graze));
  float fg = smoothstep(uFogNear, uFogFar, vDepth);
  c = mix(c, uFog, fg);
  gl_FragColor = vec4(c, mix(a, 1.0, fg));
}`;

export function buildOrb(kit: PsxKit): SceneDef {
  const { rnd, view } = kit;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 520);

  const col = (h: string) => ({ value: new THREE.Color(h) });
  const skyU = { uZen: col(P.zen), uMid: col(P.mid), uLow: col(P.low), uHor: col(P.hor) };
  const fogU = col(P.fog);
  const lightU = { value: new THREE.Vector3(0.72, 0.58, 0.4).normalize() };
  const flashU = { value: 0 };

  const own = (m: THREE.ShaderMaterial) => {
    m.uniforms.uFogColor = fogU;
    m.uniforms.uLightDir = lightU;
    return m;
  };
  const mPyr = own(kit.psx({ map: kit.tex.tPlain, tint: "#cdf4fa", amb: "#0e1844", sun: "#c4f2ff", fogAmt: 0.85 }));
  const mPyrHot = own(kit.psx({ map: kit.tex.tPlain, tint: "#cdf4fa", amb: "#0e1844", sun: "#c4f2ff", fogAmt: 0.85, emit: 0 }));
  mPyrHot.uniforms.uAccent = col("#e8fcff");
  const mFar = own(kit.psx({ map: kit.tex.tPlain, tint: "#9cc8e8", amb: "#2a3c80", sun: "#a8d8f0", fogAmt: 1 }));

  /* ---- sky dome, mirrored below the horizon ---- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 24),
    new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { ...skyU }, vertexShader: SKY_V, fragmentShader: SKY_F }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  /* ---- the world and its double: the mirror group is the same objects flipped through y = 0 ---- */
  const world = new THREE.Group();
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  scene.add(world, mirror);
  const both = (make: () => THREE.Object3D) => {
    const a = make(), b = make();
    world.add(a);
    mirror.add(b);
    return [a, b] as const;
  };

  // Pyramid: four faces, an edge toward the camera so one face catches the light and one falls dark.
  const PZ = -26, PH = 6.8, PR = 1.9;
  const pyrGeo = kit.facet(new THREE.ConeGeometry(PR, PH, 4, 1, true));
  const capGeo = kit.facet(new THREE.ConeGeometry(PR * 0.16, PH * 0.16, 4, 1, true));
  const [pyrA, pyrB] = both(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(pyrGeo, mPyr));
    const cap = new THREE.Mesh(capGeo, mPyrHot);
    cap.position.y = PH / 2 - PH * 0.08 + 0.01;
    g.add(cap);
    return g;
  });
  for (const g of [pyrA, pyrB]) g.position.set(0, PH / 2, PZ);

  // Small pyramids far out, near the haze.
  for (let i = 0; i < 5; i++) {
    const x = (rnd() > 0.5 ? 1 : -1) * (40 + rnd() * 120), z = -150 - rnd() * 140, h = 4 + rnd() * 8;
    const geo = kit.facet(new THREE.ConeGeometry(h * 0.3, h, 4));
    both(() => {
      const m = new THREE.Mesh(geo, mFar);
      m.position.set(x, h / 2, z);
      m.rotation.y = rnd() * 0.6;
      return m;
    });
  }

  // The orb.
  const ORB = new THREE.Vector3(0, 17.2, -34), OR = 5.4;
  // The mirror group's flip reaches the normals through the model matrix, so one material serves both.
  const orbMat = new THREE.ShaderMaterial({
    uniforms: { ...skyU, uSnap: kit.U.uSnap, uIce: col(P.ice), uInk: col(P.ink), uLight: lightU, uFlash: flashU },
    vertexShader: ORB_V,
    fragmentShader: ORB_F,
  });
  const orbGeo = new THREE.SphereGeometry(OR, 28, 18);
  const orbA = new THREE.Mesh(orbGeo, orbMat);
  const orbB = new THREE.Mesh(orbGeo, orbMat);
  world.add(orbA);
  mirror.add(orbB);

  /* ---- sea: one sheet over the mirror world, plus the long shadows lying on it ---- */
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...skyU, uSnap: kit.U.uSnap, uIce: col(P.ice), uSea: col(P.sea), uFog: fogU, uTime: kit.U.uTime,
        uFogNear: { value: 60 }, uFogFar: { value: 330 },
      },
      vertexShader: SEA_V,
      fragmentShader: SEA_F,
    }),
  );
  sea.renderOrder = 1;
  sea.frustumCulled = false;
  scene.add(sea);

  // Shadows run away from the low sun, to the left.
  const shadow = (x: number, z: number, w: number, len: number, o: number) => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x + w, 0, z), new THREE.Vector3(x - w, 0, z + w * 0.6), new THREE.Vector3(x - len, 0, z - len * 0.18),
    ]);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: P.ink, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide }));
    m.position.y = 0.02;
    m.renderOrder = 2;
    scene.add(m);
  };
  shadow(0, PZ, PR * 1.3, 34, 0.55);
  shadow(-58, -120, 3, 70, 0.32);

  /* ---- apex beam for the egg ---- */
  const beamLen = Math.hypot(ORB.y - PH, ORB.z - PZ) - OR + 1;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.7, beamLen, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: "#e8fcff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const tilt = Math.atan2(ORB.z - PZ, ORB.y - PH);
  beam.position.set(0, PH + Math.cos(tilt) * beamLen / 2, PZ + Math.sin(tilt) * beamLen / 2);
  beam.rotation.x = tilt;
  beam.visible = false;
  scene.add(beam);

  let tSpin = -99, tApex = -99, spin = 0;
  const CAM = new THREE.Vector3(0, 2.7, 4);

  return {
    scene,
    cam,
    fog: [60, 330],
    fov: [50, 68],
    limits: { pitch: [-0.25, 0.35], zoom: [0.8, 2.4], yaw: 0.9 },
    labels: [
      { name: "Orb", sub: "chrome, held", at: (v) => { v.copy(orbA.position).x += OR + 1; } },
      { name: "Pyramid", sub: "true north", at: (v) => { v.set(PR + 1.5, PH + 0.5, PZ); } },
    ],
    eggs: [
      { id: "orb-spin", r: 50, at: (v) => { v.copy(orbA.position); }, fire: (t) => { tSpin = t; } },
      { id: "orb-apex", r: 28, at: (v) => { v.set(0, PH, PZ); }, fire: (t) => { tApex = t; } },
    ],
    update(t) {
      // Slow turn, plus an eased burst after a tap.
      spin = t * 0.08 + burst(t - tSpin, 6, 3);
      const y = ORB.y + Math.sin(t * 0.5) * 0.35;
      for (const o of [orbA, orbB]) {
        o.position.set(ORB.x, y, ORB.z);
        o.rotation.set(0.35, spin, 0.12);
      }
      const ea = pulse(t - tApex, 2.4);
      mPyrHot.uniforms.uEmit.value = ea * 1.4;
      beam.visible = ea > 0;
      (beam.material as THREE.MeshBasicMaterial).opacity = ea * 0.55;
      flashU.value = 0.25 * pulse(t - tApex - 0.6, 1.6);

      cam.position.set(CAM.x + Math.sin(t * 0.045) * 0.6 + view.px * 0.6, CAM.y + Math.sin(t * 0.3) * 0.04 - view.py * 0.3, CAM.z);
      cam.lookAt(view.px * 3, 9.6 - view.py * 3, PZ);
      kit.look(cam);
      sky.position.copy(cam.position);
    },
    readout() {
      const p = cam.position;
      return [
        ["Lat", kit.dms(64.1355 - p.z * 0.0001, "N", "S", 2)],
        ["Lon", kit.dms(-21.8954 + p.x * 0.00013, "E", "W", 3)],
        ["Elev", `${p.y.toFixed(1)} m`],
        ["Brg", `${kit.pad(Math.round(kit.bearing(cam)), 3)}°`],
        ["Grid", kit.gridRef(p.x, p.z, 40)],
      ];
    },
  };
}
