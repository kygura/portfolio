/**
 * Shared PS1 pipeline pieces: uniforms, 32px nearest-filtered procedural
 * textures, the Gouraud/vertex-snap/affine-UV material, snapped line
 * material, sky dome and geometry helpers. One `PsxKit` is built per engine
 * and handed to every scene builder.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Accent } from "@/theme/accent";

// The scene was tuned against three r128, which had no colour management:
// hex colours went to the GPU untouched and nothing was converted on output.
// r152+ converts sRGB hex to linear on input and back on output, which would
// darken every ShaderMaterial uniform. Turn it off so colours match the mock.
THREE.ColorManagement.enabled = false;

export type V3 = THREE.Vector3;

export interface Uniforms {
  uTime: { value: number };
  uAccent: { value: THREE.Color };
  uAccent2: { value: THREE.Color };
  uSnap: { value: THREE.Vector2 };
  uFogColor: { value: THREE.Color };
  uZen: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uLightDir: { value: THREE.Vector3 };
}

export interface LabelDef {
  name: string;
  sub: string;
  at: (v: V3) => void;
  sub2?: () => string;
}

/** A hidden tap target. The engine projects `at` to the screen and fires the
 *  nearest egg within `r` CSS px of a tap; the scene animates its own reaction. */
export interface EggDef {
  id: string;
  at: (v: V3) => void;
  r?: number;
  /** Start the reaction at scene time `t`. */
  fire: (t: number) => void;
}

export interface SceneDef {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  /** Drawn straight to the canvas at full resolution: no low-res target, dither or dissolve. */
  clean?: boolean;
  fog: [number, number];
  fov: [number, number];
  /** Manual camera range: pitch in radians (+ = camera up / look up), zoom factor (+ = closer), yaw ± radians (omit = free). */
  limits: { pitch: [number, number]; zoom: [number, number]; yaw?: number };
  labels: LabelDef[];
  eggs?: EggDef[];
  moteMat?: THREE.PointsMaterial;
  /** Optional pointer bridge. Plain drags orbit like every scene and a tap presses it; Shift+drag hands the drag to the scene. */
  pointer?: {
    /** Pointer ray in world space, or null when it is away. `moved` is false while the cursor itself is still. */
    aim: (ray: THREE.Ray | null, moved: boolean) => void;
    press: () => void;
    /** `tap`: released close to where it was pressed. */
    release: (tap: boolean) => void;
    /** True while the scene still has something to animate on its own. */
    busy: () => boolean;
  };
  update: (t: number) => void;
  readout: () => [string, string][];
}

interface PsxOpts {
  map: THREE.Texture;
  tint?: string;
  moss?: number;
  uv?: number;
  side?: THREE.Side;
  amb?: string;
  sun?: string;
  fogAmt?: number;
  sweep?: number;
  hypso?: number;
  emit?: number;
}

const V = `
uniform vec2 uSnap; uniform vec3 uLightDir; uniform vec2 uUvScale; uniform vec3 uAmbient; uniform vec3 uSun;
varying vec3 vAff; varying vec3 vLight; varying float vDepth; varying vec3 vWP; varying float vUp;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vWP = wp.xyz; vUp = n.y;
  vec4 mv = viewMatrix * wp;
  vec4 p = projectionMatrix * mv;
  p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w;
  gl_Position = p;
  vLight = uAmbient + uSun * max(dot(n, uLightDir), 0.0);
  vAff = vec3(uv * uUvScale * p.w, p.w);
  vDepth = -mv.z;
}`;

const F = `
uniform sampler2D uMap; uniform sampler2D uMoss; uniform vec3 uTint; uniform float uMossAmt;
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uFogAmt;
uniform vec3 uAccent; uniform vec3 uAccent2; uniform float uSweep; uniform float uHypso; uniform float uTime; uniform float uEmit;
varying vec3 vAff; varying vec3 vLight; varying float vDepth; varying vec3 vWP; varying float vUp;
void main(){
  vec2 uv = vAff.xy / vAff.z;
  vec3 c = texture2D(uMap, uv).rgb * uTint;
  c = mix(c, c * mix(vec3(0.75), uAccent2 * 2.2, 0.35), uHypso * smoothstep(-4.0, 5.0, vWP.y));
  float m = smoothstep(0.35, 0.8, vUp) * uMossAmt;
  c = mix(c, texture2D(uMoss, vWP.xz * 0.35).rgb, m);
  c *= vLight;
  if (uSweep > 0.0) {
    float r = length(vWP.xz);
    float sw = smoothstep(1.4, 0.0, abs(r - mod(uTime * 3.2, 34.0)));
    c = mix(c, uAccent, sw * uSweep);
  }
  c += uAccent * uEmit;
  float fg = smoothstep(uFogNear, uFogFar, vDepth) * uFogAmt;
  gl_FragColor = vec4(mix(c, uFogColor, fg), 1.0);
}`;

const LV = `uniform vec2 uSnap; varying float vDepth; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vec4 p = projectionMatrix * mv; p.xy = floor(p.xy / p.w * uSnap + 0.5) / uSnap * p.w; gl_Position = p; vDepth = -mv.z; }`;
const LF = `uniform vec3 uColor; uniform vec3 uFogColor; uniform float uFade; varying float vDepth; void main(){ gl_FragColor = vec4(mix(uColor, uFogColor, clamp(vDepth / uFade, 0.0, 1.0) * 0.55), 1.0); }`;

const SKY_V = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = `
uniform float uTime; uniform vec3 uAccent; uniform vec3 uAccent2; uniform vec3 uFog; uniform vec3 uZen; uniform float uGrat; uniform float uStars; uniform float uGlow; uniform float uDark; varying vec3 vDir;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uFog, uZen, pow(h, 0.5));
  c = mix(c, uZen * 0.8, uDark);
  c += uAccent2 * exp(-h * 9.0) * 0.35 * uGlow;
  vec3 q = floor(d * 150.0); float s = hash(q);
  float star = step(0.9965, s) * smoothstep(0.02, 0.4, d.y + 0.25 * uGrat) * (0.55 + 0.45 * sin(uTime * 1.7 + s * 80.0));
  c += vec3(star) * 0.85 * uStars;
  float lon = atan(d.z, d.x) + uTime * 0.006; float lat = asin(clamp(d.y, -1.0, 1.0));
  float g = max(step(0.997, abs(cos(lon * 9.0))), step(0.997, abs(cos(lat * 14.0))));
  c = mix(c, uAccent, g * 0.14 * uGrat);
  gl_FragColor = vec4(c, 1.0);
}`;

export function createKit(accent: Accent) {
  let seed = 1337;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const U: Uniforms = {
    uTime: { value: 0 },
    uAccent: { value: new THREE.Color(accent.hex) },
    uAccent2: { value: new THREE.Color(accent.deep) },
    uSnap: { value: new THREE.Vector2(80, 45) },
    uFogColor: { value: new THREE.Color(accent.fog) },
    uZen: { value: new THREE.Color(accent.zen) },
    uFogNear: { value: 12 },
    uFogFar: { value: 50 },
    uLightDir: { value: new THREE.Vector3(-0.55, 0.75, 0.35).normalize() },
  };

  /* ---- procedural textures (32px, nearest) ---- */
  const tex = (size: number, paint: (d: Uint8ClampedArray, s: number) => void) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    if (!g) throw new Error("2d canvas unavailable");
    const img = g.createImageData(size, size);
    paint(img.data, size);
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const put = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) => {
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  };
  const tStone = tex(32, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      let k = 0.78 + rnd() * 0.34;
      const row = Math.floor(y / 8), off = (row % 2) * 6;
      if (y % 8 === 0 || (x + off) % 12 === 0) k *= 0.55;
      put(d, (y * s + x) * 4, 150 * k, 150 * k, 136 * k);
    }
  });
  const tMoss = tex(32, (d, s) => {
    for (let i = 0; i < s * s; i++) {
      const k = 0.55 + rnd() * 0.6;
      if (rnd() > 0.93) put(d, i * 4, 160, 168, 92); else put(d, i * 4, 72 * k, 104 * k, 52 * k);
    }
  });
  const tBark = tex(32, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const k = (x % 4 === 0 ? 0.6 : 0.9) * (0.8 + rnd() * 0.3);
      put(d, (y * s + x) * 4, 98 * k, 78 * k, 60 * k);
    }
  });
  const tLeaf = tex(32, (d, s) => {
    for (let i = 0; i < s * s; i++) {
      const k = 0.5 + rnd() * 0.7;
      if (rnd() > 0.95) put(d, i * 4, 120, 140, 90); else put(d, i * 4, 52 * k, 78 * k, 50 * k);
    }
  });
  const tGround = tex(32, (d, s) => {
    for (let i = 0; i < s * s; i++) {
      const k = 0.7 + rnd() * 0.4, f = rnd();
      if (f > 0.9) put(d, i * 4, 118, 128, 74);
      else if (f > 0.7) put(d, i * 4, 96 * k, 88 * k, 64 * k);
      else put(d, i * 4, 70 * k, 86 * k, 54 * k);
    }
  });
  const tWater = tex(32, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const k = 0.8 + rnd() * 0.25, crest = (y + Math.round(Math.sin(x * 0.4) * 2)) % 8 === 0 && rnd() > 0.35;
      if (crest) put(d, (y * s + x) * 4, 168, 196, 192); else put(d, (y * s + x) * 4, 70 * k, 118 * k, 128 * k);
    }
  });
  const tSand = tex(32, (d, s) => {
    for (let i = 0; i < s * s; i++) {
      const k = 0.82 + rnd() * 0.26;
      if (rnd() > 0.94) put(d, i * 4, 150, 140, 112); else put(d, i * 4, 206 * k, 190 * k, 148 * k);
    }
  });
  // Curtain-wall facade: 4px window grid, dark glass, a few lit panes.
  const tGlass = tex(32, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const frame = x % 4 === 0 || y % 4 === 0, k = 0.8 + rnd() * 0.3;
      const lit = !frame && ((Math.floor(x / 4) * 7 + Math.floor(y / 4) * 13) % 11 === 0);
      if (frame) put(d, (y * s + x) * 4, 176 * k, 180 * k, 172 * k);
      else if (lit) put(d, (y * s + x) * 4, 230, 206, 150);
      else put(d, (y * s + x) * 4, 58 * k, 78 * k, 92 * k);
    }
  });
  const tPlain = tex(16, (d, s) => {
    for (let i = 0; i < s * s; i++) {
      const k = 0.9 + rnd() * 0.12;
      put(d, i * 4, 200 * k, 200 * k, 196 * k);
    }
  });

  const psx = (o: PsxOpts) =>
    new THREE.ShaderMaterial({
      vertexShader: V,
      fragmentShader: F,
      side: o.side ?? THREE.FrontSide,
      uniforms: {
        uSnap: U.uSnap,
        uLightDir: U.uLightDir,
        uAmbient: { value: new THREE.Color(o.amb ?? "#5a6870") },
        uSun: { value: new THREE.Color(o.sun ?? "#d9ccb0") },
        uUvScale: { value: new THREE.Vector2(o.uv ?? 1, o.uv ?? 1) },
        uMap: { value: o.map },
        uMoss: { value: tMoss },
        uTint: { value: new THREE.Color(o.tint ?? "#ffffff") },
        uMossAmt: { value: o.moss ?? 0 },
        uFogColor: U.uFogColor,
        uFogNear: U.uFogNear,
        uFogFar: U.uFogFar,
        uFogAmt: { value: o.fogAmt ?? 1 },
        uAccent: U.uAccent,
        uAccent2: U.uAccent2,
        uSweep: { value: o.sweep ?? 0 },
        uHypso: { value: o.hypso ?? 0 },
        uTime: U.uTime,
        uEmit: { value: o.emit ?? 0 },
      },
    });

  const lineMat = (colorU: { value: THREE.Color }, fade = 90) =>
    new THREE.ShaderMaterial({
      vertexShader: LV,
      fragmentShader: LF,
      uniforms: { uSnap: U.uSnap, uColor: colorU, uFogColor: U.uFogColor, uFade: { value: fade } },
    });

  /* ---- geometry helpers ---- */
  const hash3 = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  // Jitter hashed from position, so coincident vertices move together and seams stay welded.
  const rough = (geo: THREE.BufferGeometry, amt: number) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const kx = Math.round(x * 100), ky = Math.round(y * 100), kz = Math.round(z * 100);
      p.setXYZ(
        i,
        x + (hash3(kx, ky, kz) - 0.5) * amt,
        y + (hash3(ky, kz, kx) - 0.5) * amt,
        z + (hash3(kz, kx, ky) - 0.5) * amt,
      );
    }
    return geo;
  };
  const facet = (geo: THREE.BufferGeometry, amt = 0) => {
    if (amt) rough(geo, amt);
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    return g;
  };
  // Planar UVs from local position, so window rows line up across every face of a facade.
  const wallUV = (g: THREE.BufferGeometry, s: number) => {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      const u = ay > 0.7 || az >= ax ? p.getX(i) : p.getZ(i);
      uv.setXY(i, u * s, (ay > 0.7 ? p.getZ(i) : p.getY(i)) * s);
    }
    return g;
  };
  const mesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    parent: THREE.Object3D,
    x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  // Static parts collected per material, then merged into one mesh each per parent.
  const batcher = () => {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
    const pv = new THREE.Vector3(), sv = new THREE.Vector3();
    return {
      add(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
        m4.compose(pv.set(x, y, z), q.setFromEuler(eu.set(rx, ry, rz)), sv.set(s, s, s));
        const list = batches.get(m) ?? [];
        list.push(geo.clone().applyMatrix4(m4));
        batches.set(m, list);
      },
      flush(parent: THREE.Object3D) {
        for (const [m, list] of batches) {
          const merged = mergeGeometries(list);
          if (merged) mesh(merged, m, parent);
        }
        batches.clear();
      },
    };
  };
  const segs = (pts: V3[], mat: THREE.Material) =>
    new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
  const circle = (r: number, n: number) => {
    const o: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      o.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return o;
  };
  const skyGeo = new THREE.SphereGeometry(200, 24, 16);
  const skyDome = (grat: number, stars: number, glow: number, dark = 0) => {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: U.uTime, uAccent: U.uAccent, uAccent2: U.uAccent2, uFog: U.uFogColor, uZen: U.uZen,
        uGrat: { value: grat }, uStars: { value: stars }, uGlow: { value: glow }, uDark: { value: dark },
      },
      vertexShader: SKY_V,
      fragmentShader: SKY_F,
    });
    const s = new THREE.Mesh(skyGeo, m);
    s.renderOrder = -1;
    return s;
  };
  // Flat sun disc with three additive halos; the caller turns it to face the camera each frame.
  const sunDisc = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, core: string, glow: string) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    g.add(new THREE.Mesh(new THREE.CircleGeometry(r, 14), new THREE.MeshBasicMaterial({ color: core })));
    [[1.55, 0.32], [2.6, 0.14], [5, 0.035]].forEach(([s, o], i) => {
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(r * s, 14),
        new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      halo.position.z = -0.5 - i * 0.5;
      g.add(halo);
    });
    return g;
  };

  // Additive glow disc for one-shot flashes; the caller faces it to the camera and drives `mat.opacity`.
  const flare = (parent: THREE.Object3D, x: number, y: number, z: number, r: number) => {
    const mat = new THREE.MeshBasicMaterial({ color: U.uAccent.value, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.visible = false;
    parent.add(g);
    [r, r * 2.4].forEach((rr, i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(rr, 12), mat);
      m.position.z = -i * 0.1;
      g.add(m);
    });
    return { g, mat };
  };

  /* ---- shared materials ---- */
  const M = {
    stone: psx({ map: tStone, tint: "#bdbaa8", moss: 0.8 }),
    stone2: psx({ map: tStone, tint: "#8f9288", moss: 0.95, uv: 1.5 }),
    head: psx({ map: tStone, tint: "#cdc7b2", moss: 0.85, uv: 2 }),
    socket: psx({ map: tStone, tint: "#262b29" }),
    bark: psx({ map: tBark, tint: "#a29280", moss: 0.4 }),
    leaf: [
      psx({ map: tLeaf, tint: "#8aa274", uv: 1.5 }),
      psx({ map: tLeaf, tint: "#6f8e68", uv: 1.5 }),
      psx({ map: tLeaf, tint: "#9aa478", uv: 1.5 }),
    ],
    moon: psx({ map: tStone, tint: "#dcd6c4", fogAmt: 0.15, amb: "#8e96a2", uv: 2 }),
    solid: psx({ map: tStone, tint: "#2c3438", fogAmt: 0.25, amb: "#38424a" }),
    glyph: psx({ map: tStone, tint: "#000000", emit: 1, fogAmt: 0.2 }),
    lAccent: lineMat(U.uAccent, 110),
    lBone: lineMat({ value: new THREE.Color("#d8d1bd") }, 110),
    lBoneDim: lineMat({ value: new THREE.Color("#9ea596") }, 120),
    lDeep: lineMat(U.uAccent2, 140),
  };

  /* ---- readout helpers ---- */
  const tmp = new THREE.Vector3();
  const pad = (n: number | string, w = 2) => String(n).padStart(w, "0");
  const dms = (v: number, pos: string, neg: string, dw: number) => {
    const s = v < 0 ? neg : pos;
    v = Math.abs(v);
    const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), sec = Math.floor((mf - m) * 60);
    return `${s} ${pad(d, dw)}°${pad(m)}′${pad(sec)}″`;
  };
  const bearing = (cam: THREE.Camera) => {
    cam.getWorldDirection(tmp);
    return ((Math.atan2(tmp.x, -tmp.z) * 180) / Math.PI + 360) % 360;
  };
  /* Manual camera. Orbit scenes add view.yaw to their own camera angle (so
     terrain height stays correct), then call orbit() after lookAt(): it
     tilts the camera about the pivot and dollies along the same ray. */
  const view = { px: 0, py: 0, yaw: 0, pitch: 0, zoom: 1 };
  const off = new THREE.Vector3(), axis = new THREE.Vector3(), qp = new THREE.Quaternion();
  const orbit = (cam: THREE.Camera, pivot: THREE.Vector3) => {
    off.copy(cam.position).sub(pivot);
    axis.set(off.z, 0, -off.x);
    if (axis.lengthSq() > 1e-8) {
      axis.normalize();
      qp.setFromAxisAngle(axis, -view.pitch);
      off.applyQuaternion(qp);
      cam.quaternion.premultiply(qp);
    }
    cam.position.copy(pivot).addScaledVector(off, 1 / view.zoom);
  };
  /* Standing camera: yaw about world up, pitch about its own right axis, zoom via lens. */
  const look = (cam: THREE.PerspectiveCamera) => {
    qp.setFromAxisAngle(axis.set(1, 0, 0), view.pitch);
    cam.quaternion.multiply(qp);
    qp.setFromAxisAngle(axis.set(0, 1, 0), view.yaw);
    cam.quaternion.premultiply(qp);
    if (cam.zoom !== view.zoom) {
      cam.zoom = view.zoom;
      cam.updateProjectionMatrix();
    }
  };
  const gridRef = (x: number, z: number, span: number) =>
    "ABCDEFGH".charAt(Math.max(0, Math.min(7, Math.floor((x + span) / (span / 4))))) +
    "-" +
    pad(Math.max(1, Math.min(9, Math.floor((z + span) / (span / 4)) + 1)));

  return {
    U, rnd,
    tex: { tStone, tMoss, tBark, tLeaf, tGround, tPlain, tWater, tSand, tGlass },
    psx, lineMat, facet, wallUV, mesh, batcher, segs, circle, skyDome, sunDisc, flare, M,
    view,
    orbit, look,
    pad, dms, bearing, gridRef,
  };
}

/** Spin-up that eases to rest: extra angle after `e` seconds of a burst starting at speed `v0` and stopping at `T`. */
export const burst = (e: number, v0: number, T: number) => (e <= 0 ? 0 : e < T ? v0 * (e - (e * e) / (2 * T)) : (v0 * T) / 2);
/** One-shot bump: 0 before the start and after `T`, a half sine between. */
export const pulse = (e: number, T: number) => (e > 0 && e < T ? Math.sin((Math.PI * e) / T) : 0);

export type PsxKit = ReturnType<typeof createKit>;
