/** Sheet · Survey: a triangulation round at night. Open hill country under a
 *  starry sky with the graticule showing, a survey grid draped over the land
 *  in hairlines, and a trig pillar on each of six hilltops, tied together by
 *  dashed sight lines into a network. At the centre a theodolite on its
 *  tripod turns from station to station; while it holds on one, a sight line
 *  runs out to it in the accent and that pillar's cap answers.
 *
 *  Tap the theodolite to run a fast round of angles, a pillar to light the
 *  whole network, the moon to bring the graticule up. */
import * as THREE from "three";
import { pulse, type PsxKit, type SceneDef, type V3 } from "./psx";

/** Hilltop stations: x, z, height of the hill. Numbered T1–T6 clockwise from the north-west. */
const STATIONS: [number, number, number][] = [
  [-34, -30, 7],
  [18, -46, 9],
  [46, -12, 6],
  [30, 28, 5],
  [-22, 32, 6],
  [-52, 4, 5],
];
/** Seconds the instrument spends on each station: slewing, then holding. */
const DWELL = 4.2, SLEW = 0.35;
const SPAN = 90, SEG = 72;

function ground(x: number, z: number) {
  const roll = 1.2 * Math.sin(x * 0.07) + 1.0 * Math.sin(z * 0.06 + 1) + 0.6 * Math.sin((x + z) * 0.11) + 0.25 * Math.sin(x * 0.31 - z * 0.23);
  let hills = 0;
  for (const [sx, sz, h] of STATIONS) hills += h * Math.exp(-((x - sx) ** 2 + (z - sz) ** 2) / 140);
  // The ground flattens toward the instrument at the centre.
  const r = Math.hypot(x, z), flat = 0.2 + 0.8 * Math.min(1, Math.max(0, (r - 4) / 12));
  return (roll + hills) * flat;
}

export function buildSurvey(k: PsxKit): SceneDef {
  const { U, view, segs, psx, facet, lineMat } = k;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 420);
  const sky = k.skyDome(0.45, 1, 0.45, 0.35);
  const skyU = (sky.material as THREE.ShaderMaterial).uniforms;
  scene.add(sky);

  /* ---- the land: dark facets under a draped grid that follows the mesh's own edges ---- */
  const plane = new THREE.PlaneGeometry(SPAN * 2, SPAN * 2, SEG, SEG).rotateX(-Math.PI / 2);
  const pp = plane.attributes.position;
  for (let v = 0; v < pp.count; v++) pp.setY(v, ground(pp.getX(v), pp.getZ(v)));
  k.mesh(facet(plane), psx({ map: k.tex.tPlain, tint: "#4a5250", amb: "#2c3436", sun: "#7c7a6e", hypso: 0.5, uv: 6 }), scene);

  const cell = (SPAN * 2) / SEG, every = 3, lift = 0.06;
  const drape: V3[] = [];
  for (let a = 0; a <= SEG; a += every) {
    const fixed = -SPAN + a * cell;
    for (let b = 0; b < SEG; b++) {
      const s0 = -SPAN + b * cell, s1 = s0 + cell;
      drape.push(
        new THREE.Vector3(fixed, ground(fixed, s0) + lift, s0), new THREE.Vector3(fixed, ground(fixed, s1) + lift, s1),
        new THREE.Vector3(s0, ground(s0, fixed) + lift, fixed), new THREE.Vector3(s1, ground(s1, fixed) + lift, fixed),
      );
    }
  }
  scene.add(segs(drape, lineMat({ value: new THREE.Color("#66706a") }, 70)));

  /* ---- stations: a pillar on each hilltop with a cap that can light ---- */
  const pillarGeo = facet(new THREE.CylinderGeometry(0.38, 0.55, 1.7, 4));
  const capGeo = facet(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 4));
  const pillarMat = psx({ map: k.tex.tPlain, tint: "#e2dccb", amb: "#58605e", sun: "#a8a494" });
  const tops: THREE.Vector3[] = [];
  const caps: THREE.ShaderMaterial[] = [];
  for (const [sx, sz] of STATIONS) {
    const y = ground(sx, sz);
    k.mesh(pillarGeo, pillarMat, scene, sx, y + 0.8, sz, 0, Math.PI / 4, 0);
    const cap = psx({ map: k.tex.tPlain, tint: "#e2dccb", amb: "#58605e", sun: "#a8a494" });
    k.mesh(capGeo, cap, scene, sx, y + 1.75, sz, 0, Math.PI / 4, 0);
    caps.push(cap);
    tops.push(new THREE.Vector3(sx, y + 1.8, sz));
  }

  /* ---- theodolite: tripod, head and telescope at the centre ---- */
  const G0 = ground(0, 0), HEAD = new THREE.Vector3(0, G0 + 1.55, 0);
  const legMat = psx({ map: k.tex.tPlain, tint: "#8a7a62", amb: "#3a3c38" });
  const bodyMat = psx({ map: k.tex.tPlain, tint: "#d8d2c0", amb: "#4e5654" });
  const darkMat = psx({ map: k.tex.tPlain, tint: "#262a2a", amb: "#3a4244" });
  const legGeo = facet(new THREE.CylinderGeometry(0.035, 0.05, 1.7, 4));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4, fx = Math.cos(a) * 0.75, fz = Math.sin(a) * 0.75;
    const leg = k.mesh(legGeo, legMat, scene, fx / 2, G0 + 0.72, fz / 2);
    leg.lookAt(fx, G0, fz);
    leg.rotateX(Math.PI / 2);
  }
  k.mesh(facet(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 6)), darkMat, scene, 0, HEAD.y - 0.2, 0);
  const head = new THREE.Group();
  head.position.copy(HEAD);
  scene.add(head);
  k.mesh(facet(new THREE.BoxGeometry(0.34, 0.28, 0.24)), bodyMat, head, 0, 0, 0);
  k.mesh(facet(new THREE.BoxGeometry(0.06, 0.36, 0.2)), bodyMat, head, 0.2, 0.12, 0);
  k.mesh(facet(new THREE.BoxGeometry(0.06, 0.36, 0.2)), bodyMat, head, -0.2, 0.12, 0);
  const scope = new THREE.Group();
  scope.position.y = 0.22;
  head.add(scope);
  k.mesh(facet(new THREE.CylinderGeometry(0.075, 0.06, 0.62, 6)).rotateX(Math.PI / 2), darkMat, scope, 0, 0, 0);

  /* ---- the network: dashed sight lines, a ring through the hilltops and spokes to the centre ---- */
  const netCol = { value: new THREE.Color() };
  const netMat = lineMat(netCol, 160);
  const dashes: V3[] = [];
  const dash = (a: THREE.Vector3, b: THREE.Vector3) => {
    const d = a.distanceTo(b), n = Math.floor(d / 2);
    for (let i = 0; i < n; i++) dashes.push(a.clone().lerp(b, i / n), a.clone().lerp(b, (i + 0.6) / n));
  };
  tops.forEach((p, i) => { dash(p, tops[(i + 1) % tops.length]); dash(HEAD, p); });
  dash(tops[0], tops[3]);
  scene.add(segs(dashes, netMat));

  // The live sight line, from the telescope to the station being observed.
  const ray = new THREE.BufferGeometry().setFromPoints([HEAD.clone(), HEAD.clone()]);
  const rayLine = new THREE.LineSegments(ray, k.M.lAccent);
  rayLine.frustumCulled = false;
  scene.add(rayLine);

  /* ---- a low moon ---- */
  const MOON = new THREE.Vector3(-70, 48, -120);
  k.mesh(new THREE.IcosahedronGeometry(5, 1), k.M.moon, scene, MOON.x, MOON.y, MOON.z);

  const yawTo = tops.map((p) => Math.atan2(p.x - HEAD.x, p.z - HEAD.z));
  const pitchTo = tops.map((p) => Math.atan2(p.y - HEAD.y, Math.hypot(p.x - HEAD.x, p.z - HEAD.z)));
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const ease = (x: number) => x * x * (3 - 2 * x);
  const dir = new THREE.Vector3(), PIVOT = new THREE.Vector3(0, G0 + 2.4, 0);
  const rp = ray.attributes.position as THREE.BufferAttribute;

  // The round runs on its own clock, so the theodolite egg can speed it up.
  let clock = 0, lastT = -1, obs = 0, brg = 0;
  let tRound = -99, tNet = -99, tMoon = -99;

  return {
    scene, cam, idleFps: 30, fog: [30, 150], fov: [50, 66], limits: { pitch: [-0.45, 0.6], zoom: [0.6, 2.0] },
    labels: [
      { name: "Station", sub: "theodolite", at: (v) => { v.copy(HEAD).y += 1; } },
      { name: "T2", sub: "trig pillar", at: (v) => { v.copy(tops[1]).y += 1.5; } },
    ],
    eggs: [
      { id: "survey-theodolite", r: 34, at: (v) => { v.copy(HEAD); }, fire: (t) => { tRound = t; } },
      { id: "survey-pillar", r: 26, at: (v) => { v.copy(tops[obs === 1 ? 2 : 1]); }, fire: (t) => { tNet = t; } },
      { id: "survey-moon", r: 30, at: (v) => { v.copy(MOON); }, fire: (t) => { tMoon = t; } },
    ],
    update(t) {
      const dt = lastT < 0 ? 0 : Math.max(0, Math.min(0.1, t - lastT));
      lastT = t;
      clock += dt * (1 + 7 * pulse(t - tRound, 3.5));

      // Which station, and how far through slewing to it.
      const n = Math.floor(clock / DWELL);
      obs = n % tops.length;
      const prev = (obs + tops.length - 1) % tops.length;
      const f = ease(Math.min(1, (clock / DWELL - n) / SLEW));
      const yaw = yawTo[prev] + wrap(yawTo[obs] - yawTo[prev]) * f;
      head.rotation.y = yaw;
      scope.rotation.x = -(pitchTo[prev] + (pitchTo[obs] - pitchTo[prev]) * f);
      brg = ((yaw * 180) / Math.PI + 360) % 360;

      const held = f >= 1;
      rayLine.visible = held;
      if (held) {
        rp.setXYZ(0, HEAD.x, HEAD.y + 0.22, HEAD.z);
        rp.setXYZ(1, tops[obs].x, tops[obs].y, tops[obs].z);
        rp.needsUpdate = true;
      }
      const net = pulse(t - tNet, 2.6);
      netCol.value.copy(U.uAccent2.value).lerp(U.uAccent.value, 0.15 + 0.85 * net);
      caps.forEach((c, i) => {
        const hold = held && i === obs ? 0.55 + 0.45 * Math.sin(t * 6) : 0;
        c.uniforms.uEmit.value = Math.max(hold, net * 1.1);
      });
      skyU.uGrat.value = 0.45 + 1.4 * pulse(t - tMoon, 3.4);

      const a = 2.3 + t * 0.022 + view.px * 0.2 + view.yaw, r = 17;
      cam.position.set(Math.cos(a) * r, PIVOT.y + 4.2 + Math.sin(t * 0.09) * 0.6 - view.py * 3, Math.sin(a) * r);
      cam.lookAt(PIVOT.x, PIVOT.y + 1.5 - view.py * 2, PIVOT.z);
      k.orbit(cam, PIVOT);
    },
    readout() {
      cam.getWorldDirection(dir);
      const el = (Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI;
      const d = Math.floor(brg), m = Math.floor((brg - d) * 60);
      const dist = Math.hypot(tops[obs].x - HEAD.x, tops[obs].z - HEAD.z) * 25;
      return [
        ["Obs", `T${obs + 1}`],
        ["Hz", `${k.pad(d, 3)}°${k.pad(m)}′`],
        ["Dist", `${(dist / 1000).toFixed(2)} km`],
        ["Stns", `${tops.length + 1}`],
        ["Elev", `${el < 0 ? "−" : "+"}${k.pad(Math.abs(el).toFixed(1), 4)}°`],
      ];
    },
  };
}
