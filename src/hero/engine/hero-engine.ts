/**
 * Hero engine: builds every sheet once, renders only the active one
 * (plus the outgoing one during a dither dissolve) into a quarter-resolution
 * target, then blits through a 15-bit quantize + Bayer dither pass.
 *
 * Loaded with a dynamic import from useHeroStage (home hero, /scenes), so three.js stays out of every
 * other route's bundle. The render loop only runs while there is something
 * to draw: it stops when the hero is offscreen, the tab is hidden, or motion
 * is paused and nothing is dirty.
 */
import * as THREE from "three";
import type { Accent } from "@/theme/accent";
import { createKit, type SceneDef, type PsxKit } from "./psx";
import { SHEETS, type SheetMeta } from "../sheets";
import { buildOcean } from "./ocean";
import { buildAstral } from "./astral";
import { buildRuins } from "./ruins";
import { buildDrift } from "./drift";
import { buildDunes } from "./dunes";
import { buildRift } from "./rift";
import { buildFrost } from "./frost";
import { buildSea } from "./sea";
import { buildField } from "./field";
import { buildMatrix } from "./matrix";
import { buildVoid } from "./void";
import { buildAbyss } from "./abyss";
import { buildCliff } from "./cliff";

const POST_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_F = `
uniform sampler2D tA; uniform sampler2D tB; uniform float uMix; uniform vec2 uLow; uniform float uLevels; varying vec2 vUv;
float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }
void main(){
  vec2 px = floor(vUv * uLow);
  vec2 uv = (px + 0.5) / uLow;
  vec3 c = texture2D(tA, uv).rgb;
  if (uMix < 1.0) {
    vec2 blk = floor(px / 3.0);
    float n = fract(sin(dot(blk, vec2(12.9898, 78.233))) * 43758.5453);
    float th = mix(b4(blk), n, 0.55);
    c = mix(texture2D(tB, uv).rgb, c, step(th, uMix * 1.02 - 0.01));
  }
  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.55;
  c = floor(c * uLevels + b4(px)) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}`;

export interface HeroEngineOptions {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  /** Optional: landmark labels are skipped when omitted. */
  labelLayer?: HTMLElement | null;
  readKeys: HTMLElement[];
  readVals: HTMLElement[];
  compass: SVGGElement | null;
  accent: Accent;
  sheet: number;
  motion: boolean;
  psx: boolean;
  reducedMotion: boolean;
  onContextLost: () => void;
  /** A tap landed on a hidden egg. `total` counts the eggs across every scene. */
  onEgg?: (egg: { id: string; total: number }) => void;
}

export interface HeroEngine {
  setAccent: (a: Accent) => void;
  setSheet: (i: number) => void;
  setPsx: (on: boolean) => void;
  setMotion: (on: boolean) => void;
  /** Step the camera: yaw/pitch in radians, zoom as a multiplier (>1 = closer). */
  nudge: (yaw: number, pitch: number, zoom?: number) => void;
  /** Ease the camera back to the scene's own path. */
  resetView: () => void;
  dispose: () => void;
}

export function createHeroEngine(o: HeroEngineOptions): HeroEngine {
  const { canvas, host } = o;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "low-power" });
  // Match r128 behaviour: no output conversion (built-in materials like the motes' PointsMaterial).
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const kit = createKit(o.accent);
  const { U } = kit;
  /* Only scenes enabled in sheets.ts are built, in tab order. */
  const BUILD: Record<SheetMeta["id"], (k: PsxKit) => SceneDef> = {
    cipher: () => buildVoid(), ocean: buildOcean, sea: buildSea, astral: buildAstral, ruins: buildRuins, drift: buildDrift, dunes: buildDunes, rift: buildRift, frost: buildFrost,
    field: buildField, matrix: buildMatrix, abyss: buildAbyss, cliff: buildCliff,
  };
  const SC: SceneDef[] = SHEETS.map((s) => BUILD[s.id](kit));
  const eggTotal = SC.reduce((n, s) => n + (s.eggs?.length ?? 0), 0);

  /* ---- post: two low-res targets, dissolve + dither/quantize blit ---- */
  const rtOpt = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false };
  const rtA = new THREE.WebGLRenderTarget(320, 180, rtOpt);
  const rtB = new THREE.WebGLRenderTarget(320, 180, rtOpt);
  const postMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tA: { value: rtA.texture }, tB: { value: rtB.texture }, uMix: { value: 1 },
      uLow: { value: new THREE.Vector2(320, 180) }, uLevels: { value: 31.0 },
    },
    vertexShader: POST_V,
    fragmentShader: POST_F,
  });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  quad.frustumCulled = false;
  postScene.add(quad);

  /* ---- state ---- */
  let motion = o.motion;
  let psxOn = o.psx;
  let cur = Math.max(0, Math.min(SC.length - 1, o.sheet));
  let prev = cur;
  let mixT = 1;
  let t = 18;
  let last = performance.now();
  let dirty = true;
  let visible = true;
  let frameN = 0;
  let raf = 0;
  let tpx = 0, tpy = 0;
  // Manual camera: targets are set by input, kit.view eases toward them.
  const view = kit.view;
  let yawT = 0, pitchT = 0, zoomT = 1;
  let yawV = 0, pitchV = 0;
  let drag: { id: number; x: number; y: number; sx: number; sy: number; own: boolean } | null = null;
  // Fingers down on the stage; two of them make a pinch (spread zooms, the midpoint orbits).
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; mx: number; my: number } | null = null;
  // After a pinch, the finger left behind does nothing until it lifts, so the view doesn't jump.
  let pinchHold = false;
  const clampView = () => {
    const lim = SC[cur].limits;
    if (lim.yaw !== undefined) yawT = Math.max(-lim.yaw, Math.min(lim.yaw, yawT));
    pitchT = Math.max(lim.pitch[0], Math.min(lim.pitch[1], pitchT));
    zoomT = Math.max(lim.zoom[0], Math.min(lim.zoom[1], zoomT));
  };
  const viewSettled = () =>
    !drag && !pinch && Math.abs(yawV) < 1e-4 && Math.abs(pitchV) < 1e-4 &&
    Math.abs(yawT - view.yaw) < 5e-4 && Math.abs(pitchT - view.pitch) < 5e-4 && Math.abs(zoomT - view.zoom) < 5e-4;
  let cssW = 1, cssH = 1, lw = 320, lh = 180;
  const tmp = new THREE.Vector3();
  // Pointer → world ray for scenes that take input; the scene turns it into a point on its own relief.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ptr = { x: 0, y: 0, in: false, moved: false };
  const setPtr = (e: PointerEvent, moved: boolean) => {
    const r = host.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    ptr.in = true;
    if (moved) ptr.moved = true;
  };
  const aimScene = (sc: SceneDef) => {
    if (!sc.pointer) return;
    if (ptr.in) {
      ndc.set(ptr.x, ptr.y);
      sc.cam.updateMatrixWorld();
      raycaster.setFromCamera(ndc, sc.cam);
    }
    sc.pointer.aim(ptr.in ? raycaster.ray : null, ptr.moved);
    ptr.moved = false;
  };

  /* ---- easter eggs: the nearest hidden target to a tap, within its screen radius ---- */
  const tryEgg = (e: PointerEvent) => {
    const sc = SC[cur];
    if (!sc.eggs?.length) return false;
    const r = host.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    sc.cam.updateMatrixWorld();
    let best: (typeof sc.eggs)[number] | null = null, bd = Infinity;
    for (const g of sc.eggs) {
      g.at(tmp);
      tmp.project(sc.cam);
      if (tmp.z > 1) continue;
      const d = Math.hypot(((tmp.x + 1) / 2) * r.width - mx, ((1 - tmp.y) / 2) * r.height - my);
      if (d <= (g.r ?? 30) && d < bd) { best = g; bd = d; }
    }
    if (!best) return false;
    best.fire(t);
    o.onEgg?.({ id: best.id, total: eggTotal });
    dirty = true;
    kick();
    return true;
  };

  /* ---- pinned labels ---- */
  let activeLabels: { l: SceneDef["labels"][number]; el: HTMLDivElement; em: HTMLElement }[] = [];
  const buildLabels = (sc: SceneDef) => {
    if (!o.labelLayer) return;
    const layer = o.labelLayer;
    layer.replaceChildren();
    activeLabels = sc.labels.map((l) => {
      const el = document.createElement("div");
      el.className = "lbl";
      const span = document.createElement("span");
      span.append(`${l.name} `);
      const em = document.createElement("em");
      em.textContent = l.sub;
      span.append(em);
      el.append(span);
      layer.append(el);
      return { l, el, em };
    });
  };
  const placeLabels = (sc: SceneDef) => {
    for (const L of activeLabels) {
      L.l.at(tmp);
      tmp.project(sc.cam);
      const vis = tmp.z < 1 && tmp.x > -0.95 && tmp.x < 0.8 && tmp.y > -0.25 && tmp.y < 0.85;
      L.el.style.opacity = vis ? "1" : "0";
      if (vis) L.el.style.transform = `translate(${Math.round(((tmp.x + 1) / 2) * cssW)}px,${Math.round(((1 - tmp.y) / 2) * cssH)}px)`;
      if (L.l.sub2 && (frameN % 10 === 0 || !L.em.textContent)) L.em.textContent = L.l.sub2();
    }
  };
  const readouts = (sc: SceneDef) => {
    const r = sc.readout();
    for (let i = 0; i < 5; i++) {
      if (o.readKeys[i]) o.readKeys[i].textContent = r[i][0];
      if (o.readVals[i]) o.readVals[i].textContent = r[i][1];
    }
    o.compass?.setAttribute("transform", `rotate(${(-kit.bearing(sc.cam)).toFixed(1)})`);
  };

  /* ---- sizing ---- */
  const setSnap = () => {
    if (psxOn) U.uSnap.value.set(lw * 0.5, lh * 0.5);
    else U.uSnap.value.set(1e5, 1e5);
  };
  const resize = () => {
    cssW = Math.max(1, host.clientWidth);
    cssH = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(cssW, cssH, false);
    for (const s of SC) {
      s.cam.aspect = cssW / cssH;
      s.cam.fov = s.cam.aspect < 1 ? s.fov[1] : s.fov[0];
      s.cam.updateProjectionMatrix();
    }
    lw = Math.max(200, Math.min(360, Math.round(cssW / 3.6)));
    lh = Math.max(120, Math.round((lw * cssH) / cssW));
    rtA.setSize(lw, lh);
    rtB.setSize(lw, lh);
    postMat.uniforms.uLow.value.set(lw, lh);
    setSnap();
    dirty = true;
    kick();
  };

  /* ---- render loop ---- */
  const apply = (sc: SceneDef) => {
    U.uFogNear.value = sc.fog[0];
    U.uFogFar.value = sc.fog[1];
  };
  const render = () => {
    const sc = SC[cur];
    if (psxOn) {
      if (mixT < 1) {
        const ps = SC[prev];
        apply(ps);
        renderer.setRenderTarget(rtB);
        renderer.render(ps.scene, ps.cam);
      }
      apply(sc);
      renderer.setRenderTarget(rtA);
      renderer.render(sc.scene, sc.cam);
      postMat.uniforms.uMix.value = mixT;
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    } else {
      apply(sc);
      renderer.setRenderTarget(null);
      renderer.render(sc.scene, sc.cam);
    }
  };
  const wants = () => visible && !document.hidden && (motion || dirty || mixT < 1 || !viewSettled() || Boolean(SC[cur].pointer?.busy()));
  function loop(now: number) {
    raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (motion) t += dt;
    if (mixT < 1) mixT = Math.min(1, mixT + dt / 0.7);
    kit.view.px += (tpx - kit.view.px) * 0.05;
    kit.view.py += (tpy - kit.view.py) * 0.05;
    if (!drag && !pinch && (yawV || pitchV)) {
      // Release inertia, frame-rate independent.
      yawT += yawV;
      pitchT += pitchV;
      const decay = Math.pow(0.9, dt * 60);
      yawV = Math.abs(yawV * decay) < 1e-4 ? 0 : yawV * decay;
      pitchV = Math.abs(pitchV * decay) < 1e-4 ? 0 : pitchV * decay;
    }
    clampView();
    const ease = 1 - Math.pow(1 - 0.16, dt * 60);
    view.yaw += (yawT - view.yaw) * ease;
    view.pitch += (pitchT - view.pitch) * ease;
    view.zoom += (zoomT - view.zoom) * ease;
    U.uTime.value = t;
    aimScene(SC[cur]);
    SC[cur].update(t);
    if (mixT < 1) SC[prev].update(t);
    render();
    placeLabels(SC[cur]);
    if (frameN++ % 6 === 0 || dirty) readouts(SC[cur]);
    dirty = false;
    if (wants()) raf = requestAnimationFrame(loop);
  }
  function kick() {
    if (raf || !wants()) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  /* ---- observers ---- */
  const onPointer = (e: PointerEvent) => {
    if (SC[cur].pointer) {
      // Touch only reports while a finger is down on the stage; the mouse hovers.
      if (e.pointerType === "touch" ? drag?.own : !interactive(e.target)) setPtr(e, true);
      else ptr.in = false;
      dirty = true;
      kick();
    }
    if (!motion || drag || pinch) return;
    const r = host.getBoundingClientRect();
    tpx = (e.clientX - r.left) / r.width - 0.5;
    tpy = (e.clientY - r.top) / r.height - 0.5;
  };
  /* Drag to orbit. Vertical pans stay with the page on touch (touch-action:
     pan-y), so a sideways swipe turns the scene and an up/down swipe scrolls. */
  const RAD_PER_PX = 0.0065;
  const interactive = (el: EventTarget | null) => el instanceof Element && el.closest("button, a, input, kbd, [data-no-orbit]");
  const pinchSpan = () => {
    const [a, b] = [...touches.values()];
    return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  const startPinch = () => {
    // A second finger turns whatever the first was doing into a pinch.
    if (drag?.own) SC[cur].pointer?.release(false);
    if (drag?.own) ptr.in = false;
    drag = null;
    yawV = pitchV = 0;
    pinch = pinchSpan();
    host.classList.add("is-dragging");
    dirty = true;
    kick();
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      if (interactive(e.target)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size > 1) {
        host.setPointerCapture(e.pointerId);
        if (touches.size === 2) startPinch();
        return;
      }
      if (pinchHold) return;
    }
    // Plain drags orbit in every scene. A scene with a pointer bridge gets Shift+drag
    // (the drag is its own) and taps; right-drag orbits there too.
    const rc = e.button === 2 && Boolean(SC[cur].pointer);
    if ((e.button !== 0 && !rc) || !e.isPrimary || interactive(e.target)) return;
    const sc = SC[cur], own = Boolean(sc.pointer) && e.shiftKey && !rc;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, own };
    yawV = pitchV = 0;
    tpx = tpy = 0;
    if (own) {
      setPtr(e, false);
      aimScene(sc);
      sc.pointer!.press();
    }
    host.setPointerCapture(e.pointerId);
    host.classList.add("is-dragging");
    kick();
  };
  const onDragMove = (e: PointerEvent) => {
    const tp = e.pointerType === "touch" ? touches.get(e.pointerId) : undefined;
    if (tp) { tp.x = e.clientX; tp.y = e.clientY; }
    if (pinch) {
      if (!tp) return;
      const n = pinchSpan();
      zoomT *= n.d / pinch.d;
      // Two fingers moving together orbit, so a touch screen can tilt as well as turn.
      const k = RAD_PER_PX / Math.sqrt(zoomT);
      yawT += (n.mx - pinch.mx) * k;
      pitchT += (n.my - pinch.my) * k;
      pinch = n;
      clampView();
      dirty = true;
      kick();
      return;
    }
    if (!drag || e.pointerId !== drag.id || drag.own) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    // Closer in = finer steering.
    const k = RAD_PER_PX / Math.sqrt(zoomT);
    yawT += dx * k;
    pitchT += dy * k;
    yawV = dx * k * 0.6;
    pitchV = dy * k * 0.6;
    clampView();
    dirty = true;
    kick();
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerType === "touch" && touches.delete(e.pointerId)) {
      if (pinch || pinchHold) {
        if (touches.size < 2) pinch = null;
        if (touches.size === 2) pinch = pinchSpan();
        pinchHold = touches.size > 0;
        if (!pinch) host.classList.remove("is-dragging");
        if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
        kick();
        return;
      }
    }
    if (!drag || e.pointerId !== drag.id) return;
    const tap = e.type === "pointerup" && e.button === 0 && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8;
    const egg = tap && tryEgg(e);
    if (tap && !egg && !drag.own && SC[cur].pointer) {
      // An orbiting scene still takes a tap as a press at the pointer.
      const sc = SC[cur];
      setPtr(e, false);
      aimScene(sc);
      sc.pointer!.press();
      sc.pointer!.release(true);
      if (e.pointerType === "touch") ptr.in = false;
      dirty = true;
    }
    if (drag.own) {
      const sc = SC[cur], up = e.type === "pointerup";
      if (up) { setPtr(e, false); aimScene(sc); }
      sc.pointer?.release(up && !egg && tap);
      if (e.pointerType === "touch") ptr.in = false;
      dirty = true;
    }
    drag = null;
    host.classList.remove("is-dragging");
    if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
    kick();
  };
  /* touch-action: pan-y hands vertical swipes to the page, and Safari can still start a
     page zoom or scroll on a two-finger gesture. Cancelling touches while two or more
     fingers are down keeps the pinch on the stage; one finger still scrolls. */
  const onTouch = (e: TouchEvent) => {
    if (e.touches.length > 1 && e.cancelable && !interactive(e.target)) e.preventDefault();
  };
  const onGesture = (e: Event) => e.preventDefault();
  // Ctrl/⌘ + wheel (also what a trackpad pinch sends) zooms; a plain wheel scrolls the page.
  const onWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey) || interactive(e.target)) return;
    e.preventDefault();
    zoomT *= Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0022));
    clampView();
    dirty = true;
    kick();
  };
  const onDouble = (e: MouseEvent) => {
    if (interactive(e.target)) return;
    api.resetView();
  };
  const onVisibility = () => {
    if (!document.hidden) { dirty = true; kick(); }
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    visible = false;
    o.onContextLost();
  };
  host.addEventListener("pointermove", onPointer);
  const onLeave = () => {
    ptr.in = false;
    dirty = true;
    kick();
  };
  host.addEventListener("pointerleave", onLeave);
  const onContext = (e: MouseEvent) => {
    if (SC[cur].pointer && !interactive(e.target)) e.preventDefault();
  };
  host.addEventListener("contextmenu", onContext);
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointermove", onDragMove);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onUp);
  host.addEventListener("wheel", onWheel, { passive: false });
  host.addEventListener("touchstart", onTouch, { passive: false });
  host.addEventListener("touchmove", onTouch, { passive: false });
  host.addEventListener("gesturestart", onGesture);
  host.addEventListener("dblclick", onDouble);
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  const io = new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible) { dirty = true; kick(); }
  });
  io.observe(host);
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  buildLabels(SC[cur]);
  resize();

  const api: HeroEngine = {
    setAccent(a) {
      U.uAccent.value.set(a.hex);
      U.uAccent2.value.set(a.deep);
      U.uFogColor.value.set(a.fog);
      U.uZen.value.set(a.zen);
      for (const s of SC) s.moteMat?.color.set(a.hex);
      dirty = true;
      kick();
    },
    setSheet(i) {
      i = ((i % SC.length) + SC.length) % SC.length;
      if (i === cur) return;
      SC[cur].pointer?.release(false);
      prev = cur;
      cur = i;
      ptr.moved = false;
      yawT = pitchT = yawV = pitchV = 0;
      zoomT = 1;
      mixT = psxOn && !o.reducedMotion ? 0 : 1;
      buildLabels(SC[cur]);
      dirty = true;
      kick();
    },
    setPsx(on) {
      psxOn = on;
      setSnap();
      dirty = true;
      kick();
    },
    setMotion(on) {
      motion = on;
      dirty = true;
      kick();
    },
    nudge(yaw, pitch, zoom = 1) {
      yawT += yaw;
      pitchT += pitch;
      zoomT *= zoom;
      clampView();
      dirty = true;
      kick();
    },
    resetView() {
      yawT = pitchT = yawV = pitchV = 0;
      zoomT = 1;
      dirty = true;
      kick();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("contextmenu", onContext);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onDragMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("touchstart", onTouch);
      host.removeEventListener("touchmove", onTouch);
      host.removeEventListener("gesturestart", onGesture);
      host.removeEventListener("dblclick", onDouble);
      host.classList.remove("is-dragging");
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      const geos = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      for (const s of [...SC.map((x) => x.scene), postScene]) {
        s.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.geometry) geos.add(m.geometry);
          if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
        });
      }
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      Object.values(kit.tex).forEach((tx) => tx.dispose());
      rtA.dispose();
      rtB.dispose();
      renderer.dispose();
      o.labelLayer?.replaceChildren();
    },
  };
  return api;
}
