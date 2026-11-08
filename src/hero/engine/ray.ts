/**
 * The "early raytracer" look, shared by every scene that uses it: a smooth
 * gradient sky that runs from a saturated zenith down to a white haze at the
 * horizon, a mirror floor (glitter sea or checker tiles) over a y-flipped copy
 * of the world, chrome that reflects the sky, the floor and nearby spikes,
 * hard single-light flat shading and long shadows lying on the floor.
 *
 * Usage: `const R = createRay(kit, scene, palette)`, then build into
 * `R.world` (reflected) or `R.scene` (not reflected), using `R.both()` /
 * `R.add()` to put a thing and its reflection in at once. Call
 * `R.follow(cam)` at the end of `update()`.
 */
import * as THREE from "three";
import type { PsxKit } from "./psx";

export interface RayPalette {
  /** Sky, top to bottom. */
  zen: string;
  mid: string;
  low: string;
  hor: string;
  /** Distance haze; usually a touch darker than `hor`. */
  fog: string;
  /** Floor and chrome: light, dark and the deepest ink (shadows, veins). */
  ice: string;
  sea: string;
  ink: string;
  /** Key light direction (toward the light). Shadows fall the other way. */
  light?: [number, number, number];
}

export const SNAP = `p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;`;

/** Sky gradient plus value noise / fbm, for any shader that wants to match the dome. */
export const RAY_GLSL = `
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
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.07; a *= 0.5; } return s; }
`;

const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Below the horizon the dome mirrors itself, a touch darker, so the floor has a sky to reflect.
const SKY_F = `${RAY_GLSL}
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c = sky(abs(d.y));
  if (d.y < 0.0) c *= vec3(0.78, 0.88, 0.95);
  gl_FragColor = vec4(c, 1.0);
}`;

const CHROME_V = `
uniform vec2 uSnap; varying vec3 vN; varying vec3 vWP; varying vec3 vObj;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal); vWP = wp.xyz; vObj = position;
  vec4 p = projectionMatrix * viewMatrix * wp;
  ${SNAP}
  gl_Position = p;
}`;
/* Chrome: reflect the sky above, the floor below and up to eight spikes
   (cones/pyramids standing on the floor) in between, then swirl ink marble
   over it in object space so the pattern turns with the object. */
const CHROME_F = `${RAY_GLSL}
uniform vec3 uIce; uniform vec3 uSea; uniform vec3 uInk; uniform vec3 uTint; uniform vec3 uLight;
uniform float uFlash; uniform float uMarble; uniform float uScale; uniform float uChecker;
uniform vec4 uCones[8]; uniform int uNCones;
varying vec3 vN; varying vec3 vWP; varying vec3 vObj;
vec3 floorCol(vec3 p, vec3 r){
  if (uChecker > 0.0) {
    vec2 g = floor(p.xz / uChecker);
    return mix(uSea, uIce, mod(g.x + g.y, 2.0));
  }
  return mix(uSea, uIce, 0.55 + 0.35 * vnoise(vec3(p.xz * 0.05, 0.0)));
}
void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(vWP - cameraPosition);
  vec3 r = reflect(v, n);
  vec3 env;
  if (r.y > 0.0) env = sky(r.y);
  else {
    vec3 hit = vWP + r * (-vWP.y / min(r.y, -1e-3));
    env = mix(floorCol(hit, r), uHor, smoothstep(-0.12, 0.0, r.y));
  }
  float best = 1e9;
  for (int i = 0; i < 8; i++) {
    if (i >= uNCones) break;
    vec4 c = uCones[i];
    vec2 d = c.xy - vWP.xz;
    float rr = dot(r.xz, r.xz);
    if (rr < 1e-5) continue;
    float t = dot(d, r.xz) / rr;
    if (t <= 0.0 || t > best) continue;
    vec3 h = vWP + r * t;
    vec2 off = h.xz - c.xy;
    float lat = length(off);
    if (h.y > 0.0 && h.y < c.w && lat < c.z * (1.0 - h.y / c.w)) {
      best = t;
      float side = sign(d.x * off.y - d.y * off.x) * sign(uLight.x + 1e-4);
      env = side < 0.0 ? uIce * 1.05 : uInk * 1.2;
    }
  }
  vec3 q = normalize(vObj) * uScale;
  float w = fbm(q * 1.1 + fbm(q * 1.8 + 3.1) * 2.2);
  float band = 0.5 + 0.5 * sin(w * 16.0);
  float vein = smoothstep(0.03, 0.0, abs(fract(w * 5.0) - 0.5) - 0.46);
  vec3 c = env * uTint;
  c = mix(c, mix(uInk, uIce * 0.75, band * 0.7), smoothstep(0.26, 0.5, w) * uMarble);
  c = mix(c, uInk * 0.6, vein * uMarble * 0.45);
  float lam = max(dot(n, uLight), 0.0);
  c *= 0.28 + 1.0 * pow(lam, 0.65);
  float rim = pow(1.0 - max(dot(n, -v), 0.0), 3.0);
  c += uHor * rim * 0.35 * (0.4 + lam);
  c += pow(max(dot(r, uLight), 0.0), 60.0) * 0.9 + uFlash;
  gl_FragColor = vec4(c, 1.0);
}`;

const FLOOR_V = `
uniform vec2 uSnap; varying vec3 vWP; varying float vDepth;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
  vec4 mv = viewMatrix * wp; vec4 p = projectionMatrix * mv;
  ${SNAP}
  gl_Position = p; vDepth = -mv.z;
}`;
// Glitter sea or checker tiles over the mirror world; thinner (more reflective) at grazing angles.
const FLOOR_F = `${RAY_GLSL}
uniform vec3 uIce; uniform vec3 uSea; uniform vec3 uFog; uniform float uTime; uniform float uFogNear; uniform float uFogFar;
uniform float uChecker; uniform float uGloss; uniform float uFlow;
varying vec3 vWP; varying float vDepth;
void main(){
  vec3 c;
  float a;
  float graze = 1.0 - abs(normalize(cameraPosition - vWP).y);
  if (uChecker > 0.0) {
    vec2 g = floor(vWP.xz / uChecker);
    c = mix(uSea, uIce, mod(g.x + g.y, 2.0));
    c *= 0.9 + 0.2 * vnoise(vec3(floor(vWP.xz * 5.0), 0.0));
    a = mix(0.85, 0.45, smoothstep(0.7, 0.99, graze));
  } else {
    vec3 p = vec3(vWP.x * 0.9, uTime * 0.25 * uFlow, vWP.z * 2.4);
    float n = fbm(p) * 0.65 + vnoise(vec3(floor(vWP.xz * 7.0), floor(uTime * 5.0 * uFlow))) * 0.35;
    c = mix(uSea, uIce, smoothstep(0.35, 0.7, n));
    c = mix(c, vec3(0.95, 1.0, 1.0), step(0.86, n));
    a = mix(0.92, 0.42, smoothstep(0.75, 0.99, graze));
  }
  a = mix(a, 1.0, 1.0 - uGloss);
  float fg = smoothstep(uFogNear, uFogFar, vDepth);
  c = mix(c, uFog, fg);
  gl_FragColor = vec4(c, mix(a, 1.0, fg));
}`;

export interface FlatOpts {
  tint: string;
  /** Shadow side; dark and saturated for the look. */
  amb?: string;
  sun?: string;
  fogAmt?: number;
  /** Emission colour; drive `mat.uniforms.uEmit.value` (0..1+) to light it. */
  emit?: string;
  emitAmt?: number;
  map?: THREE.Texture;
  uv?: number;
}

export interface ChromeOpts {
  /** Multiplies the reflection, e.g. a gold or rose chrome. */
  tint?: string;
  /** 0 = clean mirror, 1 = heavy ink marble. */
  marble?: number;
  /** Marble frequency; scale with the object's size. */
  scale?: number;
  ink?: string;
  /** Spikes the chrome should show in its reflection: [x, z, base radius, height]. */
  cones?: [number, number, number, number][];
}

export interface FloorOpts {
  size?: number;
  fogNear?: number;
  fogFar?: number;
  /** Tile size for a checker floor; omit for the glitter sea. */
  checker?: number;
  /** 1 = full mirror at grazing angles, 0 = opaque. */
  gloss?: number;
  /** Glitter animation speed (sea only). */
  flow?: number;
  y?: number;
}

export function createRay(kit: PsxKit, scene: THREE.Scene, pal: RayPalette) {
  const col = (h: string) => ({ value: new THREE.Color(h) });
  const skyU = { uZen: col(pal.zen), uMid: col(pal.mid), uLow: col(pal.low), uHor: col(pal.hor) };
  const fogU = col(pal.fog);
  const iceU = col(pal.ice), seaU = col(pal.sea), inkU = col(pal.ink);
  const lightU = { value: new THREE.Vector3(...(pal.light ?? [0.72, 0.58, 0.4])).normalize() };
  const flashU = { value: 0 };
  const checkerU = { value: 0 };

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 24),
    new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { ...skyU }, vertexShader: SKY_V, fragmentShader: SKY_F }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  /* The world and its double: the mirror group is the same objects flipped through y = 0.
     The flip reaches normals through the model matrix and three flips the winding, so
     the same geometry and materials serve both. */
  const world = new THREE.Group();
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  scene.add(world, mirror);
  const both = <T extends THREE.Object3D>(make: () => T) => {
    const a = make(), b = make();
    world.add(a);
    mirror.add(b);
    return [a, b] as const;
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) =>
    both(() => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.scale.setScalar(s);
      return m;
    });

  const flat = (o: FlatOpts) => {
    const m = kit.psx({
      map: o.map ?? kit.tex.tPlain, tint: o.tint, amb: o.amb ?? "#0e1844", sun: o.sun ?? "#e8f4ff",
      fogAmt: o.fogAmt ?? 0.85, uv: o.uv, emit: o.emitAmt ?? 0,
    });
    m.uniforms.uFogColor = fogU;
    m.uniforms.uLightDir = lightU;
    m.uniforms.uAccent = col(o.emit ?? "#ffffff");
    return m;
  };

  const chrome = (o: ChromeOpts = {}) => {
    const cones = (o.cones ?? []).slice(0, 8);
    const arr = Array.from({ length: 8 }, (_, i) => new THREE.Vector4(...(cones[i] ?? [0, 0, 0, 0])));
    return new THREE.ShaderMaterial({
      uniforms: {
        ...skyU, uSnap: kit.U.uSnap, uIce: iceU, uSea: seaU, uInk: o.ink ? col(o.ink) : inkU, uLight: lightU, uFlash: flashU,
        uTint: col(o.tint ?? "#e4f0f4"), uMarble: { value: o.marble ?? 0.85 }, uScale: { value: o.scale ?? 1.6 },
        uChecker: checkerU, uCones: { value: arr }, uNCones: { value: cones.length },
      },
      vertexShader: CHROME_V,
      fragmentShader: CHROME_F,
    });
  };

  const floor = (o: FloorOpts = {}) => {
    const size = o.size ?? 900;
    checkerU.value = o.checker ?? 0;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...skyU, uSnap: kit.U.uSnap, uIce: iceU, uSea: seaU, uFog: fogU, uTime: kit.U.uTime,
          uFogNear: { value: o.fogNear ?? 60 }, uFogFar: { value: o.fogFar ?? 330 },
          uChecker: checkerU, uGloss: { value: o.gloss ?? 1 }, uFlow: { value: o.flow ?? 1 },
        },
        vertexShader: FLOOR_V,
        fragmentShader: FLOOR_F,
      }),
    );
    m.position.y = o.y ?? 0;
    m.renderOrder = 1;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };

  /** A long hard shadow from a footprint at (x, z), `w` wide, `len` long, lying away from the light. */
  const shadowMat = new Map<number, THREE.MeshBasicMaterial>();
  const shadow = (x: number, z: number, w: number, len: number, opacity = 0.5) => {
    const L = lightU.value, dx = -L.x, dz = -L.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x - uz * w, 0, z + ux * w), new THREE.Vector3(x + uz * w, 0, z - ux * w), new THREE.Vector3(x + ux * len, 0, z + uz * len),
    ]);
    const key = Math.round(opacity * 100);
    let mat = shadowMat.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: pal.ink, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
      shadowMat.set(key, mat);
    }
    const m = new THREE.Mesh(g, mat);
    m.position.y = 0.02;
    m.renderOrder = 2;
    scene.add(m);
    return m;
  };

  /** Additive glow, for beams and halos. */
  const glow = (color: string, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

  return {
    scene, world, mirror, sky, both, add, flat, chrome, floor, shadow, glow,
    uniforms: { sky: skyU, fog: fogU, light: lightU, flash: flashU, ice: iceU, sea: seaU, ink: inkU },
    /** Keep the dome centred on the camera; call at the end of update(). */
    follow(cam: THREE.Camera) {
      sky.position.copy(cam.position);
    },
  };
}

export type Ray = ReturnType<typeof createRay>;
