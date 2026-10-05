// =====================================================================================
//  DINO RUSH · Bölüm 1: Kutuplar
//  three.js motoru, Quaternius animasyonlu dinozor modelleri (CC0), elle kurulmuş buz dünyası.
// =====================================================================================
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const hex = (h) => h;
const store = {
  get(k, d) { try { const v = localStorage.getItem("dinorush:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("dinorush:" + k, JSON.stringify(v)); } catch {} }
};

// ------------------------------------------------------------------ çizici, sahne, ışık
const canvas = $("c");
const isTouch = matchMedia("(pointer: coarse)").matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;

const scene = new THREE.Scene();
const FOG_COL = new THREE.Color("#cfe3f1");
scene.fog = new THREE.Fog(FOG_COL, 40, 330);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);
const world = new THREE.Group(); scene.add(world);

const hemi = new THREE.HemisphereLight("#dcefff", "#7a93ad", 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#ffe7c7", 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 16, bottom: -16, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-9, 22, 12);
function aimSun(x, z) { sun.target.position.set(x, 0, z); sun.position.set(x + SUN_OFF.x, SUN_OFF.y, z + SUN_OFF.z); }

// Gökyüzü: kutup akşamı, gradyan + kuzey ışıkları + yıldızlar
const SKY_U = { uTop: { value: new THREE.Color("#0f2d57") }, uMid: { value: new THREE.Color("#5f9bd0") }, uHor: { value: new THREE.Color("#e6f4ff") },
  uTime: { value: 0 }, uAur: { value: 1 } };
const skyMat = new THREE.ShaderMaterial({
  uniforms: SKY_U, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
  fragmentShader: `uniform vec3 uTop, uMid, uHor; uniform float uTime, uAur; varying vec3 vDir;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.22, h));
      col = mix(col, uTop, smoothstep(0.18, 0.75, h));
      col = mix(col, uHor * 0.95, smoothstep(0.0, -0.08, h));
      // kuzey ışıkları: yavaşça dalgalanan yeşil-turkuaz perdeler
      float az = atan(d.x, -d.z);
      float a = 0.0;
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float band = 0.30 + fk * 0.07 + sin(az * (2.0 + fk) + uTime * 0.12 + fk * 2.1) * 0.05;
        float curtain = smoothstep(0.09, 0.0, abs(h - band)) * smoothstep(band - 0.12, band, h);
        float rays = 0.55 + 0.45 * sin(az * 38.0 + fk * 3.0 + uTime * 0.5 + sin(az * 7.0 + uTime * 0.2) * 2.0);
        a += curtain * rays * (0.8 - fk * 0.2);
      }
      col += uAur * a * mix(vec3(0.15, 1.0, 0.65), vec3(0.45, 0.6, 1.0), smoothstep(0.3, 0.5, h)) * 0.42;
      // yıldızlar
      vec2 g = vec2(az * 60.0, h * 60.0); vec2 id = floor(g); float s = h21(id);
      float star = step(0.985, s) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * smoothstep(0.25, 0.6, h);
      col += star * (0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat);
sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

// Ortam yansıması: gökyüzünü küçük bir sahnede çizip buzun parlaması için kullan
{
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
  const warm = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1d8").multiplyScalar(6) }));
  warm.position.set(-4, 6, 5); envScene.add(warm);
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();
}

// ------------------------------------------------------------------ dokular (tuvalde üretilir)
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
function canvasTex(w, h, paint, { wrap = true, srgb = true } = {}) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d"); paint(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = MAX_ANISO;
  return t;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// Kesintisiz döşeme için: her şekli 9 kez kaydırarak çiz
function wrapDraw(w, h, x, y, fn) { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(x + dx, y + dy); }

const snowTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#f2f7fc"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 34, a = 0.05 + rnd() * 0.07;
    wrapDraw(w, h, x, y, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, `rgba(170,195,225,${a})`); gr.addColorStop(1, "rgba(170,195,225,0)"); g.fillStyle = gr; g.fillRect(X - r, Y - r, r * 2, r * 2); });
  }
  for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,.95)" : "rgba(190,225,255,.8)"; g.fillRect(rnd() * w, rnd() * h, 1.4, 1.4); }
});
snowTex.repeat.set(26, 40);

const ROAD_W = 7.0;
const roadTex = canvasTex(256, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, "#6fb6e2"); gr.addColorStop(0.1, "#a9ddfa"); gr.addColorStop(0.5, "#d3f1ff"); gr.addColorStop(0.9, "#a9ddfa"); gr.addColorStop(1, "#6fb6e2");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 50; i++) {
    const x = rnd() * w, y = rnd() * h, r = 14 + rnd() * 40;
    wrapDraw(w, h, x, y, (X, Y) => { const c = g.createRadialGradient(X, Y, 0, X, Y, r); const k = rnd() < 0.5;
      c.addColorStop(0, k ? "rgba(255,255,255,.22)" : "rgba(90,165,215,.16)"); c.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = c; g.fillRect(X - r, Y - r, r * 2, r * 2); });
  }
  // çatlaklar
  const crack = (col, lw, n) => { g.strokeStyle = col; g.lineWidth = lw; for (let i = 0; i < n; i++) {
    let x = 20 + rnd() * (w - 40), y = 30 + rnd() * (h - 60); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x = clamp(x + (rnd() - 0.5) * 40, 4, w - 4); y = clamp(y + (rnd() - 0.3) * 30, 4, h - 4); g.lineTo(x, y);
      if (rnd() < 0.3) { g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 24, y + rnd() * 16); g.moveTo(x, y); } }
    g.stroke(); } };
  crack("rgba(255,255,255,.7)", 1.3, 16); crack("rgba(50,125,185,.35)", 1, 12);
  // şerit çizgileri (kesik)
  for (const u of [0.5 - 1.15 / ROAD_W, 0.5 + 1.15 / ROAD_W]) {
    g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(u * w - 3, h * 0.2, 6, h * 0.6);
    g.fillStyle = "rgba(120,190,235,.6)"; g.fillRect(u * w - 4, h * 0.2, 1.5, h * 0.6);
  }
  for (let i = 0; i < 160; i++) { g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
});
roadTex.wrapS = THREE.ClampToEdgeWrapping; roadTex.repeat.set(1, 40);

const bermTex = snowTex.clone(); bermTex.repeat.set(2, 40); bermTex.needsUpdate = true;
const dotTex = canvasTex(64, 64, (g, w) => { const c = g.createRadialGradient(32, 32, 0, 32, 32, 30); c.addColorStop(0, "rgba(255,255,255,1)"); c.addColorStop(0.5, "rgba(255,255,255,.7)"); c.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = c; g.fillRect(0, 0, w, w); }, { wrap: false });
const holeTex = canvasTex(64, 256, (g, w, h) => {
  const c = g.createLinearGradient(0, 0, 0, h); c.addColorStop(0, "#5aa9e0"); c.addColorStop(0.12, "#0d2f57"); c.addColorStop(0.5, "#04142a"); c.addColorStop(0.88, "#0d2f57"); c.addColorStop(1, "#5aa9e0");
  g.fillStyle = c; g.fillRect(0, 0, w, h);
}, { wrap: false });
const wallInTex = canvasTex(64, 128, (g, w, h) => {
  const c = g.createLinearGradient(0, 0, 0, h); c.addColorStop(0, "#9fdcff"); c.addColorStop(0.35, "#2f7fc0"); c.addColorStop(1, "#04142a");
  g.fillStyle = c; g.fillRect(0, 0, w, h);
}, { wrap: false });

// ------------------------------------------------------------------ geometri yardımcıları
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** Parça: geometriyi dönüştür, köşe rengini ver (birleştirmeye hazır) */
function P(geo, color, t = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0); _q.setFromEuler(_e);
  _m4.compose(_v.set(t.x || 0, t.y || 0, t.z || 0), _q, _s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1));
  g.applyMatrix4(_m4);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
const merge = (parts) => mergeGeometries(parts, false);
/** Organik low-poly: köşeleri birleştirip rastgele it */
function jitter(geo, amt, sd = 1) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const hh = (x, y, z, o) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + sd * 13.1 + o) * 43758.5453; return s - Math.floor(s) - 0.5; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + hh(x, y, z, 1) * amt * 2, y + hh(x, y, z, 2) * amt * 2, z + hh(x, y, z, 3) * amt * 2);
  }
  g.computeVertexNormals();
  return g;
}
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = false; return m; }

const MAT = {
  vc: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 }),
  vcGloss: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.3, metalness: 0, envMapIntensity: 1.3 }),
  ice: new THREE.MeshStandardMaterial({ color: "#8fd3fb", roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.9, emissive: "#2f86cf", emissiveIntensity: 0.38, flatShading: true, envMapIntensity: 1.8 }),
  iceDeep: new THREE.MeshStandardMaterial({ color: "#5fb9ef", roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.9, emissive: "#1d63a3", emissiveIntensity: 0.35, flatShading: true, envMapIntensity: 1.7 }),
  gold: new THREE.MeshStandardMaterial({ color: "#ffcc3a", roughness: 0.18, metalness: 0.55, emissive: "#ff9800", emissiveIntensity: 0.55, flatShading: true }),
  snow: new THREE.MeshStandardMaterial({ color: "#e9f1f9", map: snowTex, roughness: 0.95, metalness: 0 })
};

// ------------------------------------------------------------------ sabit dünya: zemin, setler, dağlar
const ROAD_LEN = 320, ROAD_Z = 10 - ROAD_LEN / 2;
const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_LEN), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.18, metalness: 0.05, envMapIntensity: 1.25 }));
road.rotation.x = -Math.PI / 2; road.position.set(0, 0, ROAD_Z); road.receiveShadow = true; scene.add(road);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, ROAD_LEN), MAT.snow);
ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.03, ROAD_Z); ground.receiveShadow = true; scene.add(ground);
const bermMat = new THREE.MeshStandardMaterial({ color: "#f1f6fb", map: bermTex, roughness: 0.92 });
for (const sx of [-1, 1]) {
  const geo = new THREE.CylinderGeometry(0.75, 0.75, ROAD_LEN, 10, 1, true, 0, Math.PI);
  geo.rotateZ(Math.PI / 2); geo.rotateY(Math.PI / 2); // yarım silindir: kubbe yukarı, eksen z boyunca
  const b = new THREE.Mesh(geo, bermMat);
  b.scale.set(1, 0.55, 1); b.position.set(sx * (ROAD_W / 2 + 0.45), -0.02, ROAD_Z);
  b.receiveShadow = true; b.castShadow = false; scene.add(b);
}
function scrollGround(dist) {
  const o = (dist / 8) % 1;
  roadTex.offset.y = o; snowTex.offset.y = o; bermTex.offset.y = o;
}

// Uzak dağlar (sise karışır)
{
  const parts = [];
  const peaks = [[-70, -200, 58, 30], [-30, -230, 74, 38], [18, -215, 62, 30], [60, -195, 54, 32], [100, -235, 80, 42], [-115, -225, 76, 40], [150, -205, 60, 36], [-160, -190, 56, 34]];
  peaks.forEach(([x, z, h, w], i) => {
    const g = jitter(new THREE.ConeGeometry(w, h, 9, 4), 2.2, i + 3);
    // yüksekliğe göre renk: alt mavi-gri kaya, üst kar
    const ng = g.toNonIndexed(); const pos = ng.attributes.position, col = new Float32Array(pos.count * 3);
    const rock = new THREE.Color("#6f8aab"), snw = new THREE.Color("#f4f9ff");
    for (let k = 0; k < pos.count; k += 3) {
      const yAvg = (pos.getY(k) + pos.getY(k + 1) + pos.getY(k + 2)) / 3 / h + 0.5;
      const c = yAvg > 0.45 + Math.sin(k) * 0.06 ? snw : rock;
      for (let j = 0; j < 3; j++) { col[(k + j) * 3] = c.r; col[(k + j) * 3 + 1] = c.g; col[(k + j) * 3 + 2] = c.b; }
    }
    ng.setAttribute("color", new THREE.BufferAttribute(col, 3)); ng.deleteAttribute("normal"); ng.computeVertexNormals();
    ng.translate(x, h / 2 - 3, z);
    parts.push(ng);
  });
  const mtn = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  scene.add(mtn);
}

// ------------------------------------------------------------------ nesne fabrikaları (havuzlu)
const GEO = {};
function pineGeo(v) {
  const greens = v ? ["#2d6f58", "#378064", "#418f70"] : ["#285f4c", "#2f6d57", "#397b63"];
  const parts = [P(new THREE.CylinderGeometry(0.16, 0.24, 1.3, 6), "#6e4b33", { y: 0.65 })];
  for (let i = 0; i < 4; i++) {
    const y = 1.0 + i * 0.82, r = 1.45 - i * 0.29, h = 1.45;
    parts.push(P(jitter(new THREE.ConeGeometry(r, h, 8, 1), 0.07, i + v * 9), greens[i % 3], { y: y + h / 2, ry: i * 0.45 }));
    parts.push(P(jitter(new THREE.ConeGeometry(r * 0.74, h * 0.42, 8, 1), 0.05, i + 4 + v * 9), "#f6fbff", { y: y + h * 0.8, ry: i * 0.45 + 0.2 }));
  }
  return merge(parts);
}
GEO.pine0 = pineGeo(0); GEO.pine1 = pineGeo(1);
GEO.crystal = merge([
  P(jitter(new THREE.OctahedronGeometry(0.55, 0), 0.05, 1), "#fff", { y: 1.0, sy: 2.2 }),
  P(jitter(new THREE.OctahedronGeometry(0.4, 0), 0.05, 2), "#fff", { x: 0.45, y: 0.6, z: 0.15, rz: -0.45, sy: 1.9 }),
  P(jitter(new THREE.OctahedronGeometry(0.34, 0), 0.04, 3), "#fff", { x: -0.4, y: 0.5, z: -0.1, rz: 0.5, sy: 1.7 }),
  P(jitter(new THREE.OctahedronGeometry(0.28, 0), 0.04, 4), "#fff", { x: 0.05, y: 0.4, z: 0.42, rx: 0.5, sy: 1.6 })
]);
GEO.rock = merge([
  P(jitter(new THREE.IcosahedronGeometry(1, 1), 0.16, 5), "#8794a8", { y: 0.45, sx: 1.4, sy: 0.85, sz: 1.15 }),
  P(jitter(new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.4), 0.07, 6), "#f6fbff", { y: 0.62, sx: 1.25, sy: 0.55, sz: 1.0 })
]);
GEO.drift = P(jitter(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, 8), "#f4f9ff", { sx: 2.2, sy: 0.55, sz: 1.6 });
GEO.berry = merge([
  P(new THREE.IcosahedronGeometry(0.27, 1), "#ff2d5b", { x: -0.14 }),
  P(new THREE.IcosahedronGeometry(0.25, 1), "#d8143f", { x: 0.15, y: 0.02, z: 0.06 }),
  P(new THREE.IcosahedronGeometry(0.25, 1), "#ff4a70", { y: 0.2, z: -0.05 }),
  P(new THREE.ConeGeometry(0.2, 0.2, 5), "#3fcf6a", { y: 0.42, sz: 0.5 }),
  P(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 4), "#3b7a2a", { y: 0.52 })
]);
GEO.gold = new THREE.OctahedronGeometry(0.42, 0); GEO.gold.scale(1, 1.35, 1);
GEO.iceBlock = new RoundedBoxGeometry(1.7, 0.85, 1.3, 2, 0.12);
GEO.iceCap = P(new RoundedBoxGeometry(1.8, 0.16, 1.4, 1, 0.07), "#f6fbff");
GEO.wall = new RoundedBoxGeometry(2.15, 3.2, 1.0, 2, 0.14);
GEO.wallTop = merge([
  P(new RoundedBoxGeometry(2.25, 0.26, 1.1, 1, 0.1), "#f6fbff", { y: 3.25 }),
  P(jitter(new THREE.ConeGeometry(0.42, 0.7, 6), 0.05, 2), "#f6fbff", { x: -0.55, y: 3.6 }),
  P(jitter(new THREE.ConeGeometry(0.32, 0.5, 6), 0.05, 3), "#f6fbff", { x: 0.6, y: 3.5, z: 0.1 })
]);
GEO.wallShards = merge([
  P(jitter(new THREE.OctahedronGeometry(0.3, 0), 0.04, 9), "#fff", { x: 0.45, y: 3.55, sy: 2 }),
  P(jitter(new THREE.OctahedronGeometry(0.22, 0), 0.04, 10), "#fff", { x: -0.15, y: 3.5, z: -0.2, rz: 0.4, sy: 1.8 })
]);
GEO.arch = merge([
  P(new RoundedBoxGeometry(0.42, 2.6, 0.6, 1, 0.1), "#fff", { x: -1.05, y: 1.3 }),
  P(new RoundedBoxGeometry(0.42, 2.6, 0.6, 1, 0.1), "#fff", { x: 1.05, y: 1.3 }),
  P(new RoundedBoxGeometry(2.75, 0.5, 0.7, 1, 0.12), "#fff", { y: 2.45 }),
  ...[-0.75, -0.38, 0, 0.38, 0.75].map((x, i) => P(new THREE.ConeGeometry(0.13, 0.75 + (i % 2) * 0.22, 5), "#fff", { x, y: 2.2 - (0.75 + (i % 2) * 0.22) / 2, rx: Math.PI }))
]);
GEO.archCap = P(new RoundedBoxGeometry(2.85, 0.2, 0.8, 1, 0.08), "#f6fbff", { y: 2.78 });
GEO.lip = P(new THREE.CylinderGeometry(0.22, 0.22, 2.3, 8, 1, false), "#f4f9ff", { rz: Math.PI / 2, sy: 1, sz: 0.6 });

const BUFF_COL = {};
function iconTex(icon, ring) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.lineWidth = 9; g.strokeStyle = ring; g.stroke();
    g.font = `76px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(icon, 64, 70);
  }, { wrap: false });
}

const FACTORY = {
  pine0: () => mesh(GEO.pine0, MAT.vc),
  pine1: () => mesh(GEO.pine1, MAT.vc),
  crystal: () => mesh(GEO.crystal, MAT.ice),
  rock: () => mesh(GEO.rock, MAT.vc),
  drift: () => { const m = mesh(GEO.drift, MAT.vc, false); m.receiveShadow = true; return m; },
  food: () => mesh(GEO.berry, MAT.vcGloss),
  gold: () => mesh(GEO.gold, MAT.gold),
  ice: () => { const g = new THREE.Group(); const b = mesh(GEO.iceBlock, MAT.ice); b.position.y = 0.425; g.add(b, mesh(GEO.iceCap, MAT.vc)); g.children[1].position.y = 0.86; return g; },
  wall: () => { const g = new THREE.Group(); const w = mesh(GEO.wall, MAT.iceDeep); w.position.y = 1.6; g.add(w, mesh(GEO.wallTop, MAT.vc), mesh(GEO.wallShards, MAT.ice)); return g; },
  arch: () => { const g = new THREE.Group(); g.add(mesh(GEO.arch, MAT.iceDeep), mesh(GEO.archCap, MAT.vc)); return g; },
  gap: () => {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1), new THREE.MeshBasicMaterial({ map: holeTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.012; hole.name = "hole"; g.add(hole);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.6), new THREE.MeshBasicMaterial({ map: wallInTex }));
    wall.position.y = -1.3; wall.name = "inner"; g.add(wall);
    const l1 = mesh(GEO.lip, MAT.vc, false), l2 = mesh(GEO.lip, MAT.vc, false); l1.name = "lipA"; l2.name = "lipB"; g.add(l1, l2);
    return g;
  },
  mammoth: () => makeMammoth()
};
function buffFactory(kind) {
  return () => {
    const b = BUFFS[kind], col = new THREE.Color(b.col);
    const g = new THREE.Group();
    const gem = mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.3, flatShading: true }));
    gem.name = "gem"; g.add(gem);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 5, 14, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.4; beam.visible = false; g.add(beam);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(b.icon, b.col), depthWrite: false }));
    spr.scale.setScalar(0.95); spr.position.y = 1.35; spr.name = "icon"; g.add(spr);
    return g;
  };
}

/** Mamut: yüzü +z (oyuncuya doğru). Tüylü low-poly gövde, kıvrık dişler, sallanan hortum. */
function makeMammoth() {
  const fur = "#7c4a2b", fur2 = "#5b341d", fur3 = "#9b6338", tusk = "#fff0d2";
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skirt = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; skirt.push(P(new THREE.ConeGeometry(0.3, 1.0, 5), i % 2 ? fur2 : fur, { x: Math.cos(a) * 1.02, y: 1.35, z: Math.sin(a) * 1.4, rx: Math.PI, ry: a })); }
  body.add(mesh(merge([
    P(jitter(new THREE.SphereGeometry(1, 13, 9), 0.08, 3), fur, { y: 2.15, sx: 1.18, sy: 1.08, sz: 1.5 }),
    P(jitter(new THREE.SphereGeometry(1, 10, 7), 0.09, 4), fur2, { y: 3.05, z: 0.6, sx: 0.88, sy: 0.72, sz: 0.95 }),
    P(new THREE.ConeGeometry(0.13, 0.9, 5), fur2, { y: 2.3, z: -1.55, rx: -2.3 }),
    ...skirt
  ]), MAT.vc));
  const head = new THREE.Group(); head.position.set(0, 2.8, 1.6); body.add(head);
  const curve = (sx) => new THREE.CatmullRomCurve3([[0.34, -0.3, 0.45], [0.48, -0.8, 0.9], [0.44, -1.0, 1.45], [0.26, -0.78, 1.95], [0.08, -0.42, 2.05]].map(([x, y, z]) => new THREE.Vector3(x * sx, y, z)));
  head.add(mesh(merge([
    P(jitter(new THREE.SphereGeometry(0.86, 11, 8), 0.06, 7), fur, { sz: 0.92 }),
    P(jitter(new THREE.SphereGeometry(0.62, 9, 6), 0.06, 8), fur3, { y: 0.55, z: -0.05, sx: 0.9, sy: 0.72 }),
    P(new THREE.SphereGeometry(0.5, 8, 6), fur2, { x: 0.8, y: 0.05, z: -0.15, sx: 0.25, sy: 0.92, sz: 0.75 }),
    P(new THREE.SphereGeometry(0.5, 8, 6), fur2, { x: -0.8, y: 0.05, z: -0.15, sx: 0.25, sy: 0.92, sz: 0.75 }),
    P(new THREE.SphereGeometry(0.15, 10, 8), "#ffffff", { x: 0.37, y: 0.2, z: 0.68 }),
    P(new THREE.SphereGeometry(0.15, 10, 8), "#ffffff", { x: -0.37, y: 0.2, z: 0.68 }),
    P(new THREE.SphereGeometry(0.08, 8, 6), "#1a0c06", { x: 0.39, y: 0.17, z: 0.8 }),
    P(new THREE.SphereGeometry(0.08, 8, 6), "#1a0c06", { x: -0.39, y: 0.17, z: 0.8 }),
    P(new THREE.BoxGeometry(0.36, 0.09, 0.12), "#3a1f0e", { x: 0.36, y: 0.4, z: 0.72, rz: -0.38 }),
    P(new THREE.BoxGeometry(0.36, 0.09, 0.12), "#3a1f0e", { x: -0.36, y: 0.4, z: 0.72, rz: 0.38 }),
    P(new THREE.TubeGeometry(curve(1), 12, 0.095, 7), tusk),
    P(new THREE.TubeGeometry(curve(-1), 12, 0.095, 7), tusk)
  ]), MAT.vc));
  const trunk = [];
  let parent = new THREE.Group(); parent.position.set(0, -0.2, 0.72); head.add(parent);
  for (let k = 0; k < 6; k++) {
    const s = new THREE.Group(); s.position.y = k ? -0.34 : 0; parent.add(s);
    s.add(mesh(P(new THREE.CylinderGeometry(0.22 - k * 0.028, 0.25 - k * 0.028, 0.38, 7), k % 2 ? fur : fur2, { y: -0.17 }), MAT.vc));
    trunk.push(s); parent = s;
  }
  const legs = [];
  for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
    const L = new THREE.Group(); L.position.set(sx * 0.72, 1.55, sz * 0.85); body.add(L);
    L.add(mesh(merge([
      P(jitter(new THREE.CylinderGeometry(0.37, 0.31, 1.5, 8), 0.04, 9), fur, { y: -0.7 }),
      P(new THREE.ConeGeometry(0.48, 0.75, 7), fur2, { y: -0.3, rx: Math.PI }),
      P(new THREE.CylinderGeometry(0.34, 0.37, 0.18, 8), "#d8c6a6", { y: -1.45 })
    ]), MAT.vc));
    legs.push({ g: L, ph });
  }
  root.userData.parts = { body, head, trunk, legs };
  return root;
}
function animMammoth(m, p) {
  const u = m.userData.parts;
  u.body.position.y = Math.abs(Math.sin(p)) * 0.2;
  u.body.rotation.z = Math.sin(p) * 0.03;
  for (const l of u.legs) l.g.rotation.x = Math.sin(p + l.ph) * 0.55;
  u.trunk.forEach((s, k) => { s.rotation.x = 0.22 + Math.sin(p * 1.4 + k * 0.6) * 0.16; s.rotation.z = Math.sin(p * 0.8 + k) * 0.05; });
  u.head.rotation.x = -0.08 + Math.sin(p * 2) * 0.05;
}

// Bitiş: kıyı, bayraklı kapı, deniz ve buz kütleleri
const goal = new THREE.Group(); goal.visible = false; scene.add(goal);
{
  const wood = "#7a5233", cloth = "#ff6a1a";
  goal.add(mesh(merge([
    P(new THREE.CylinderGeometry(0.28, 0.32, 5, 7), wood, { x: -3.9, y: 2.5 }),
    P(new THREE.CylinderGeometry(0.28, 0.32, 5, 7), wood, { x: 3.9, y: 2.5 }),
    P(new THREE.BoxGeometry(8.6, 0.5, 0.5), wood, { y: 4.7 }),
    P(new THREE.BoxGeometry(5.4, 1.1, 0.12), "#ffb12e", { y: 4.0 }),
    P(new THREE.ConeGeometry(0.5, 0.7, 6), "#f6fbff", { x: -3.9, y: 5.25 }),
    P(new THREE.ConeGeometry(0.5, 0.7, 6), "#f6fbff", { x: 3.9, y: 5.25 })
  ]), MAT.vc));
  for (const sx of [-1, 1]) { const f = mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshStandardMaterial({ color: cloth, side: THREE.DoubleSide, roughness: 0.7 })); f.position.set(sx * 3.9 + 0.75, 4.1, 0); f.name = "flag"; goal.add(f); }
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 300), new THREE.MeshStandardMaterial({ color: "#2b86d3", roughness: 0.12, metalness: 0.1, envMapIntensity: 1.4 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.04, -154); sea.receiveShadow = true; goal.add(sea);
  for (let i = 0; i < 9; i++) {
    const fl = mesh(P(jitter(new THREE.CylinderGeometry(1, 1.15, 0.5, 7), 0.12, i), "#f4f9ff", { s: 1 }), MAT.vc);
    fl.position.set((rnd() - 0.5) * 50, 0.1, -10 - rnd() * 70); fl.scale.setScalar(1 + rnd() * 2.5); fl.rotation.y = rnd() * 6; fl.name = "floe"; goal.add(fl);
  }
}

// ------------------------------------------------------------------ parçacıklar
// Kar: kameranın çevresinde düşen yumuşak noktalar
const SNOW_N = 900;
const snowGeo = new THREE.BufferGeometry();
const snowArr = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) { snowArr[i * 3] = (rnd() - 0.5) * 50; snowArr[i * 3 + 1] = rnd() * 16; snowArr[i * 3 + 2] = -rnd() * 70 + 8; }
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowArr, 3));
const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: dotTex, size: 0.16, transparent: true, depthWrite: false, opacity: 0.95, color: "#ffffff" }));
snowPts.frustumCulled = false; scene.add(snowPts);
function updateSnow(dt, speed, cx) {
  const a = snowArr;
  for (let i = 0; i < SNOW_N; i++) {
    let y = a[i * 3 + 1] - dt * (1.4 + (i % 5) * 0.28);
    a[i * 3] += Math.sin(state.time * 0.7 + i) * dt * 0.5;
    a[i * 3 + 2] += dt * speed;
    if (y < 0 || a[i * 3 + 2] > 9) { y = 10 + rnd() * 6; a[i * 3] = cx + (rnd() - 0.5) * 50; if (a[i * 3 + 2] > 9) a[i * 3 + 2] -= 70; }
    a[i * 3 + 1] = y;
  }
  snowGeo.attributes.position.needsUpdate = true;
}

// Kırılma / toplama parçacıkları: tek InstancedMesh
const FX_N = 260;
const fxMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.4, emissive: "#ffffff", emissiveIntensity: 0.25 }), FX_N);
fxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fxMesh.frustumCulled = false; fxMesh.castShadow = false;
fxMesh.setColorAt(0, new THREE.Color()); scene.add(fxMesh);
const fxP = Array.from({ length: FX_N }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1, rot: 0, spin: 0, g: 1, follow: false }));
let fxNext = 0;
const _c = new THREE.Color(), _o = new THREE.Object3D();
function emit(n, pos, color, { speed = 5, up = 4, size = 1, life = 0.8, grav = 14, spread = 1, follow = true } = {}) {
  for (let i = 0; i < n; i++) {
    const idx = fxNext, f = fxP[idx]; fxNext = (fxNext + 1) % FX_N;
    f.life = f.max = life * (0.6 + rnd() * 0.6);
    f.p.set(pos.x + (rnd() - 0.5) * spread, pos.y + rnd() * 0.5 * spread, pos.z + (rnd() - 0.5) * spread);
    f.v.set((rnd() - 0.5) * speed, up * (0.4 + rnd()), (rnd() - 0.5) * speed);
    f.s = size * (0.6 + rnd() * 0.8); f.rot = rnd() * 6; f.spin = (rnd() - 0.5) * 14; f.g = grav; f.follow = follow;
    fxMesh.setColorAt(idx, _c.set(Array.isArray(color) ? color[i % color.length] : color));
  }
  fxMesh.instanceColor.needsUpdate = true;
}
function updateFx(dt, worldV) {
  for (let i = 0; i < FX_N; i++) {
    const f = fxP[i];
    if (f.life > 0) {
      f.life -= dt; f.v.y -= f.g * dt; f.p.addScaledVector(f.v, dt); if (f.follow) f.p.z += worldV * dt;
      if (f.p.y < 0.05) { f.p.y = 0.05; f.v.y *= -0.3; f.v.x *= 0.7; f.v.z *= 0.7; }
      f.rot += f.spin * dt;
      const k = Math.min(1, f.life / f.max * 2.5) * f.s;
      _o.position.copy(f.p); _o.rotation.set(f.rot, f.rot * 0.7, 0); _o.scale.setScalar(Math.max(0.001, k));
    } else { _o.position.set(0, -50, 0); _o.scale.setScalar(0.001); }
    _o.updateMatrix(); fxMesh.setMatrixAt(i, _o.matrix);
  }
  fxMesh.instanceMatrix.needsUpdate = true;
}

// Hız çizgileri (sprint / öfke)
const STREAK_N = 26;
const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 2.6), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), STREAK_N);
streaks.frustumCulled = false; scene.add(streaks);
const streakP = Array.from({ length: STREAK_N }, () => ({ x: (rnd() - 0.5) * 12, y: 0.4 + rnd() * 4, z: -rnd() * 40 }));

// Zırh balonu (kenarları parlayan)
const armorBubble = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color("#9fe0ff") }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uCol; uniform float uT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.2); float hex = 0.5 + 0.5 * sin(vN.y * 30. + uT * 3.); gl_FragColor = vec4(uCol, f * 0.5 + hex * 0.015); }`
}));
armorBubble.visible = false; scene.add(armorBubble);
const magnetRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: "#ff6fb1", transparent: true, opacity: 0.85 }));
magnetRing.rotation.x = -Math.PI / 2; magnetRing.visible = false; scene.add(magnetRing);


// ------------------------------------------------------------------ güçlendirmeler ve dinozor tanımları
const BUFFS = {
  sprint: { icon: "🚀", name: "Sprint+", col: "#ffd23f", dur: 0 },
  armor: { icon: "🛡️", name: "Zırh", col: "#d9d2c3", dur: 0 },
  jump: { icon: "🦘", name: "Süper zıplama", col: "#7dff9a", dur: 0 },
  rage: { icon: "🔥", name: "Öfke", col: "#ff5530", dur: 5 },
  slow: { icon: "⏳", name: "Zaman", col: "#58c6ff", dur: 3 },
  ghost: { icon: "👻", name: "Görünmez", col: "#e6e9ff", dur: 5 },
  magnet: { icon: "🧲", name: "Mıknatıs", col: "#ff6fb1", dur: 8 },
  life: { icon: "❤️", name: "Ekstra can", col: "#ff3d5a", dur: 0 }
};
const BUFF_KEYS = Object.keys(BUFFS);
const DINOS = {
  carno: {
    name: "Carnotaurus", short: "Başlangıç dinozoru", tag: "Sprint · güçlü, buz kırar", skin: hex("#d9542b"), belly: hex("#f6b27c"), dark: hex("#8f2c14"), horn: hex("#f7e6c4"),
    horns: true, crest: false, body: 1.0, neck: 1.0, leg: 1.0, tail: 1.0,
    stats: { Hız: 75, Güç: 85, Çeviklik: 45, Zıplama: 55 },
    ability: { key: "sprint", icon: "🚀", name: "SPRİNT", desc: "3 sn hızlı koşu, küçük engelleri kırar ve düşmandan kaçar. Sonra 1 sn yorulur, 5 sn'de yenilenir. Ağırdır: dönüşlerde kayar." },
    jumpV: 10.4, laneRate: 7, doubleJump: false
  },
  raptor: {
    name: "Velociraptor", short: "1. bölümü bitirince açılır", tag: "Pençe · en hızlı, çift zıplar", skin: hex("#2f8f7c"), belly: hex("#d6f2e4"), dark: hex("#175a4c"), horn: hex("#f2f2e6"),
    feather: hex("#f0b44c"), feather2: hex("#d9662b"),
    horns: false, crest: false, feathers: true, claw: true, fragile: true, body: 0.8, neck: 1.1, leg: 1.12, tail: 1.15,
    stats: { Hız: 95, Güç: 40, Çeviklik: 95, Zıplama: 90 },
    ability: { key: "claw", icon: "🐾", name: "PENÇE", desc: "En hızlısı. Çift zıplar, şerit değiştirmesi çok çevik. Düşman yaklaşınca düğme parlar: orak pençesiyle onu kaçır! Ama dayanıksızdır: mamut ya da duvara çarparsa koşu biter." },
    jumpV: 11.6, laneRate: 16, doubleJump: true, speedMul: 1.08
  }
};
const LOCKED_SOON = [
  { name: "Triceratops", short: "2. bölümden sonra", emoji: "🦕" },
  { name: "Stegosaurus", short: "3. bölümden sonra", emoji: "🦕" },
  { name: "T-Rex", short: "4. bölümden sonra", emoji: "🦖" }
];

// ------------------------------------------------------------------ dinozor modelleri (glTF)
const MODEL = {
  carno: {
    file: "../models/T-Rex.js", length: 3.5,
    colors: { Green: "#d24e28", LightGreen: "#f4c47e", LightYellow: "#fff4dc", Red: "#7a1d29", Black: "#2b1a12" },
    eye: 0.085, horns: true, smallArms: true
  },
  raptor: {
    file: "../models/Velociraptor.js", length: 3.2,
    colors: { Brown: "#2c8f7a", LightBrown: "#f0deb0", Black: "#f6f0e2" },
    eye: 0.08, feathers: true
  }
};
const gltfLoader = new GLTFLoader();
const DINO_OBJ = {};
const _up = new THREE.Vector3(0, 1, 0), _side = new THREE.Vector3(1, 0, 0);
const ray = new THREE.Raycaster();

function boneMap(root) { const m = {}; root.traverse((o) => { m[o.name] = o; }); return m; }
function wp(o) { return o.getWorldPosition(new THREE.Vector3()); }
/** Kemiğe, dünya konumu/yönü korunarak bir süs tak */
function attachAt(bone, obj, pos, dir) {
  scene.add(obj); obj.position.copy(pos);
  if (dir) obj.quaternion.setFromUnitVectors(_up, dir.clone().normalize());
  obj.updateMatrixWorld(true); bone.attach(obj);
}
function surfaceHit(meshes, origin, dir) {
  ray.set(origin, dir.clone().normalize()); ray.far = 5;
  const h = ray.intersectObjects(meshes, false);
  return h.length ? h[0].point : null;
}

async function loadDino(key, onProgress) {
  const M = MODEL[key];
  // Model, JS modülü içinde base64 GLB olarak gelir (ayrı dosya indirme / data: URI gerekmez)
  const { default: b64 } = await import(M.file);
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (onProgress) onProgress({ loaded: 1, total: 1 });
  const g = await new Promise((res, rej) => gltfLoader.parse(bytes.buffer, "", res, rej));
  const model = g.scene;
  const mats = [], skinned = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false; skinned.push(o);
    const conv = (mt) => { const nm = new THREE.MeshStandardMaterial({ color: M.colors[mt.name] || mt.color, roughness: 0.62, metalness: 0, flatShading: true }); nm.name = mt.name; mats.push(nm); return nm; };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  const mixer = new THREE.AnimationMixer(model);
  const clip = (re) => g.animations.find((a) => re.test(a.name));
  const actions = {};
  for (const [k, re] of Object.entries({ run: /_Run$/, jump: /_Jump$/, attack: /_Attack$/, idle: /_Idle$/, death: /_Death$/, walk: /_Walk$/ })) {
    const c = clip(re); if (c) actions[k] = mixer.clipAction(c);
  }
  // boyut: koşu pozunda gerçek (deri ile) sınırları ölç
  actions.run.play(); mixer.update(0.12); model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(M.length / size.z); model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model, true);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);

  const inner = new THREE.Group(); inner.add(model); inner.rotation.y = Math.PI; // model +z'ye bakar → koşu yönü -z
  const pivot = new THREE.Group(); pivot.add(inner);
  scene.add(pivot); pivot.updateMatrixWorld(true);

  const bones = boneMap(model);
  const head = bones.Head, headEnd = head.children[0];
  const H = wp(head), E = wp(headEnd), fwd = E.clone().sub(H).normalize();

  // Çizgi film gözleri: kafa yüzeyine ışınla yerleştir, kafa kemiğine bağla
  const eyeR = M.eye;
  const scl = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.25 });
  const pup = new THREE.MeshStandardMaterial({ color: "#120a06", roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  for (const sx of [-1, 1]) {
    const base = H.clone().addScaledVector(fwd, 0.13 * E.distanceTo(H)).addScaledVector(_up, eyeR * 0.75);
    const side = _side.clone().multiplyScalar(sx);
    const hit = surfaceHit(skinned, base.clone().addScaledVector(side, 1.5), side.clone().negate()) || base.clone().addScaledVector(side, eyeR * 2);
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 16, 12), scl); eye.add(ball);
    const p = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.58, 14, 10), pup);
    p.position.set(0, eyeR * 0.05, 0).addScaledVector(side, eyeR * 0.55).addScaledVector(new THREE.Vector3(0, 0, -1), eyeR * 0.3); eye.add(p);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.18, 8, 6), shine);
    sh.position.copy(p.position).addScaledVector(side, eyeR * 0.42).add(new THREE.Vector3(0, eyeR * 0.25, -eyeR * 0.12)); eye.add(sh);
    // kaş (sevimli ama kararlı)
    const brow = new THREE.Mesh(new THREE.BoxGeometry(eyeR * 0.5, eyeR * 0.28, eyeR * 2.0), new THREE.MeshStandardMaterial({ color: M.colors[key === "carno" ? "Green" : "Brown"], flatShading: true }));
    brow.position.set(sx * eyeR * 0.2, eyeR * 0.95, -eyeR * 0.1); brow.rotation.x = 0.25; eye.add(brow);
    eye.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    attachAt(head, eye, hit.addScaledVector(side, -eyeR * 0.35), null);
  }

  // Carnotaurus: gözlerin üstünde iki boynuz
  if (M.horns) {
    const hm = new THREE.MeshStandardMaterial({ color: "#f3e3c2", roughness: 0.5, flatShading: true });
    for (const sx of [-1, 1]) {
      const side = _side.clone().multiplyScalar(sx);
      const top = H.clone().addScaledVector(fwd, 0.02 * E.distanceTo(H)).addScaledVector(side, 0.11);
      const hit = surfaceHit(skinned, top.clone().addScaledVector(_up, 1.5), _up.clone().negate()) || top.clone().addScaledVector(_up, 0.15);
      const horn = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 7), hm); cone.position.y = 0.1; cone.castShadow = true; horn.add(cone);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.09, 6), hm); tip.position.set(0, 0.24, 0); tip.rotation.z = -sx * 0.45; horn.add(tip);
      attachAt(head, horn, hit.addScaledVector(_up, -0.03), side.clone().multiplyScalar(1.25).add(_up.clone().multiplyScalar(0.8)).add(new THREE.Vector3(0, 0, -0.1)));
    }
  }

  // Velociraptor: kafa ibiği, kol tüyleri, sırt ve kuyruk tüyleri
  if (M.feathers) {
    const fA = new THREE.MeshStandardMaterial({ color: "#f5a83a", roughness: 0.6, flatShading: true, side: THREE.DoubleSide });
    const fB = new THREE.MeshStandardMaterial({ color: "#e0582a", roughness: 0.6, flatShading: true, side: THREE.DoubleSide });
    const feather = (len, w, mat) => { const g2 = new THREE.Group(); const m = new THREE.Mesh(new THREE.ConeGeometry(w, len, 4), mat); m.scale.z = 0.35; m.position.y = len / 2; m.castShadow = true; g2.add(m); return g2; };
    const back = new THREE.Vector3(0, 0, 1);
    // ibik: kafanın üstünden geriye
    for (let i = 0; i < 5; i++) {
      const pnt = H.clone().addScaledVector(fwd, -0.05 * i).addScaledVector(_up, 0.02);
      const hit = surfaceHit(skinned, pnt.clone().addScaledVector(_up, 1.5), _up.clone().negate()) || pnt;
      attachAt(head, feather(0.32 - i * 0.03, 0.05, i % 2 ? fB : fA), hit, back.clone().multiplyScalar(1.1).add(_up.clone().multiplyScalar(0.9 - i * 0.1)));
    }
    // kollar: ön kol kemiğine yelpaze
    for (const nm of ["FrontLowLegL", "FrontLowLegR"]) {
      const b = bones[nm]; if (!b) continue;
      const bp = wp(b); const sx = bp.x > 0 ? 1 : -1;
      for (let i = 0; i < 3; i++) attachAt(b, feather(0.2 - i * 0.03, 0.04, i % 2 ? fB : fA), bp.clone().add(new THREE.Vector3(sx * 0.03, -0.03 * i, 0.02 * i)), new THREE.Vector3(sx * 0.5, 0.1, 1).normalize());
    }
    // sırt
    for (const [nm, n] of [["Shoulders", 3], ["Torso", 3], ["Hips", 2]]) {
      const b = bones[nm]; if (!b) continue; const bp = wp(b);
      for (let i = 0; i < n; i++) {
        const pnt = bp.clone().add(new THREE.Vector3(0, 0, i * 0.1));
        const hit = surfaceHit(skinned, pnt.clone().addScaledVector(_up, 1.5), _up.clone().negate()) || pnt;
        attachAt(b, feather(0.15, 0.04, i % 2 ? fB : fA), hit, new THREE.Vector3(0, 1, 1.1));
      }
    }
    // kuyruk ucu yelpazesi
    for (const nm of ["Tail4", "Tail5"]) {
      const b = bones[nm]; if (!b) continue; const bp = wp(b);
      for (const sx of [-1, 1]) attachAt(b, feather(nm === "Tail5" ? 0.26 : 0.2, 0.05, sx > 0 ? fA : fB), bp, new THREE.Vector3(sx * 0.9, 0.15, 1).normalize());
    }
    const tipB = bones.Tail5; if (tipB) attachAt(tipB, feather(0.3, 0.055, fA), wp(tipB.children[0] || tipB), new THREE.Vector3(0, 0.2, 1));
  }

  const armBones = M.smallArms ? ["FrontLegL", "FrontLegR"].map((n) => bones[n]).filter(Boolean) : [];
  pivot.visible = false;
  const d = { key, pivot, inner, model, mixer, actions, mats, bones, armBones, cur: null, curAction: null, lastAir: false, roarT: 3 };
  actions.run.stop();
  playAnim(d, "idle");
  DINO_OBJ[key] = d;
  return d;
}

function playAnim(d, name, { fade = 0.18, once = false, ts = 1, start = 0 } = {}) {
  const a = d.actions[name]; if (!a) return;
  if (d.cur === name && !once) { a.timeScale = ts; return; }
  a.reset(); a.enabled = true;
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
  a.timeScale = ts; a.time = start; a.setEffectiveWeight(1); a.play();
  if (d.curAction && d.curAction !== a) { d.curAction.fadeOut(fade); a.fadeIn(fade); }
  d.cur = name; d.curAction = a;
}
function tickDino(d, dt) {
  d.mixer.update(dt);
  for (const b of d.armBones) b.scale.setScalar(0.55); // Carnotaurus'un minicik kolları
}
function setDinoLook(d, { ghost = false, tint = null, k = 0 } = {}) {
  for (const m of d.mats) {
    if (m.transparent !== ghost) { m.transparent = ghost; m.needsUpdate = true; }
    m.opacity = ghost ? 0.45 : 1;
    if (tint) { m.emissive.set(tint); m.emissiveIntensity = k; } else m.emissiveIntensity = 0;
  }
}

// ------------------------------------------------------------------ ses
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let ac = null, muted = store.get("muted", false), musicTimer = null;
function audio() { if (!ac && AudioCtx) { try { ac = new AudioCtx(); } catch {} } if (ac && ac.state === "suspended") ac.resume(); return ac; }
function tone(freq, dur, type = "sine", vol = 0.15, slide = 0, delay = 0) {
  if (muted || !ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.2, freq = 800) {
  if (muted || !ac) return;
  const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  f.type = "lowpass"; f.frequency.value = freq; g.gain.value = vol; src.buffer = buf; src.connect(f).connect(g).connect(ac.destination); src.start();
}
const SFX = {
  jump: () => tone(420, 0.18, "square", 0.08, 380),
  land: () => noise(0.08, 0.12, 500),
  food: () => { tone(880, 0.09, "triangle", 0.12); tone(1320, 0.12, "triangle", 0.1, 0, 0.06); },
  gold: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.14, "triangle", 0.12, 0, i * 0.05)),
  buff: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "square", 0.07, 0, i * 0.07)),
  hit: () => { noise(0.3, 0.35, 400); tone(140, 0.3, "sawtooth", 0.15, -80); },
  smash: () => { noise(0.25, 0.3, 2400); tone(900, 0.2, "triangle", 0.08, -500); },
  sprint: () => { noise(0.5, 0.18, 1600); tone(300, 0.4, "sawtooth", 0.06, 500); },
  trumpet: () => { tone(230, 0.7, "sawtooth", 0.09, 160); tone(345, 0.7, "sawtooth", 0.06, 200, 0.05); },
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.25, "triangle", 0.13, 0, i * 0.13)),
  slide: () => noise(0.25, 0.1, 1200),
  roar: () => { noise(0.6, 0.12, 380); tone(110, 0.6, "sawtooth", 0.06, -40); }
};
function startMusic() {
  stopMusic();
  if (!ac) return;
  const scale = [392, 440, 523, 587, 659, 784, 880];
  let step = 0;
  musicTimer = setInterval(() => {
    if (muted || state.mode !== "run" || state.paused) return;
    const bass = [196, 196, 220, 174.6][Math.floor(step / 8) % 4];
    if (step % 4 === 0) tone(bass, 0.35, "triangle", 0.08);
    if (step % 2 === 0 || Math.random() < 0.3) tone(scale[(step * 3 + (step >> 2)) % scale.length], 0.16, "sine", 0.045);
    step++;
  }, 190);
}
function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; }
// ------------------------------------------------------------------ oyun durumu
const LANES = [-2.3, 0, 2.3];
const LEVEL = { length: 1500, checkpoints: [375, 750, 1125], baseSpeed: 15, maxSpeed: 21 };
const state = {
  mode: "menu", paused: false, time: 0,
  dinoKey: store.get("dino", "carno"),
  unlocked: store.get("unlocked", ["carno"]),
  best: store.get("best", { stars: 0 })
};
let run = null;

function newRun(fromDist = 0) {
  const def = DINOS[state.dinoKey];
  run = {
    def, dist: fromDist, speed: LEVEL.baseSpeed, lane: 1, x: 0, y: 0, vy: 0, air: false, airJumps: 0,
    slide: 0, phase: 0, hearts: 3, food: run && fromDist ? run.food : 0, foodSpawned: run && fromDist ? run.foodSpawned : 0,
    stumble: 0, chase: 0, invuln: 0, lean: 0,
    sprint: 0, tired: 0, cooldown: 0, sprintBonus: 0,
    buffs: { armor: 0, jump: 0, rage: 0, slow: 0, ghost: 0, magnet: 0 },
    objs: [], props: [], nextSpawn: fromDist + 30, nextProp: 0, finished: false, finishT: 0,
    checkpoint: fromDist, shake: 0, roar: 0
  };
  // başlangıç dekorları
  for (let z = -10; z > -140; z -= 6) spawnProps(z);
  run.nextProp = run.dist + 6;
}

/** Engel / yiyecek / güçlendirme nesneleri: z dünya konumu (oyuncu z=0; nesneler +z'ye doğru yaklaşır) */
function spawnPattern(zAhead) {
  const d = run.dist, diff = clamp(d / LEVEL.length, 0, 1);
  const r = Math.random();
  const free = [0, 1, 2];
  const take = (l) => free.splice(free.indexOf(l), 1);
  const objs = run.objs;
  const z = -zAhead;
  const mammothAhead = objs.some((o) => o.t === "mammoth" && !o.dead && o.z < 0);
  if (mammothAhead) {
    // karşıdan mamut gelirken yolu tıkama: sadece yiyecek dizisi
    const l = Math.floor(Math.random() * 3);
    for (let k = 0; k < 6; k++) addFood(l, z - k * 2.0, 0);
    run.nextSpawn = run.dist + lerp(24, 16, diff) + Math.random() * 5;
    return;
  }
  if (r < 0.2) {
    // tek buz bloğu + diğer şeritlerde yiyecek
    const l = Math.floor(Math.random() * 3); take(l);
    objs.push({ t: "ice", lane: l, z, h: 0.85 });
    // üstünden zıplama yayı
    for (let k = -2; k <= 2; k++) addFood(l, z + k * 1.6, 1.0 + (2.2 - Math.abs(k) * 0.8));
  } else if (r < 0.36) {
    // iki şeritte buz duvarı (şerit değiştir)
    const open = Math.floor(Math.random() * 3);
    for (const l of [0, 1, 2]) if (l !== open) objs.push({ t: "wall", lane: l, z, h: 3.2 });
    for (let k = 0; k < 5; k++) addFood(open, z + 6 - k * 2.2, 0);
  } else if (r < 0.5) {
    // sarkıtlı kemer (kay)
    const lanes = diff > 0.4 && Math.random() < 0.5 ? [0, 1, 2] : [Math.floor(Math.random() * 3)];
    for (const l of lanes) objs.push({ t: "arch", lane: l, z });
    const l2 = lanes.length === 3 ? 1 : lanes[0];
    for (let k = 0; k < 3; k++) addFood(l2, z + 2 - k * 2, -0.35);
  } else if (r < 0.62) {
    // yarık (zıpla)
    const lanes = Math.random() < 0.5 + diff * 0.3 ? [0, 1, 2] : [Math.floor(Math.random() * 3)];
    for (const l of lanes) objs.push({ t: "gap", lane: l, z, len: 3.4 });
    for (let k = -2; k <= 2; k++) addFood(lanes.length === 3 ? 1 : lanes[0], z + k * 1.5, 1.0 + (2.0 - Math.abs(k) * 0.7));
  } else if (r < 0.62 + 0.1 + diff * 0.08) {
    // karşıdan koşan mamut
    // bir duvarın tek açık şeridine mamut gönderme
    const openLanes = new Set();
    const rows = {};
    for (const o of objs) if (o.t === "wall" && !o.dead && o.z < 0) (rows[o.z] = rows[o.z] || []).push(o.lane);
    for (const zz in rows) [0, 1, 2].forEach((ln) => { if (!rows[zz].includes(ln)) openLanes.add(ln); });
    const okLanes = [0, 1, 2].filter((ln) => !openLanes.has(ln));
    if (!okLanes.length) { run.nextSpawn = run.dist + 8; return; }
    const l = okLanes[Math.floor(Math.random() * okLanes.length)];
    objs.push({ t: "mammoth", lane: l, z: z - 25, vz: 9, warned: false, p: Math.random() * 6 });
    for (const fl of [0, 1, 2]) if (fl !== l) for (let k = 0; k < 3; k++) addFood(fl, z + k * 2.5, 0);
  } else if (r < 0.9) {
    // yiyecek dizisi + bazen güçlendirme
    const l = Math.floor(Math.random() * 3);
    for (let k = 0; k < 7; k++) addFood(l, z - k * 2.0, 0, k === 6 && Math.random() < 0.18);
    if (Math.random() < 0.45) {
      const bl = (l + 1 + Math.floor(Math.random() * 2)) % 3;
      objs.push({ t: "buff", lane: bl, z: z - 6, kind: BUFF_KEYS[Math.floor(Math.random() * BUFF_KEYS.length)] });
    }
  } else {
    // karışık: buz bloğu + kemer
    const a = Math.floor(Math.random() * 3), b = (a + 1) % 3;
    objs.push({ t: "ice", lane: a, z, h: 0.85 }, { t: "arch", lane: b, z: z - 9 });
    addFood((a + 2) % 3, z, 0); addFood((a + 2) % 3, z - 3, 0); addFood((a + 2) % 3, z - 6, 0);
  }
  run.nextSpawn = run.dist + lerp(26, 17, diff) + Math.random() * 6;
}
function addFood(lane, z, y, gold = false) { run.objs.push({ t: "food", lane, z, y, gold }); run.foodSpawned += gold ? 5 : 1; }
function spawnProps(z) {
  for (const side of [-1, 1]) {
    const r = Math.random(), x = side * (6.5 + Math.random() * 7);
    const kind = r < 0.5 ? "pine" : r < 0.72 ? "crystal" : r < 0.9 ? "rock" : "none";
    if (kind !== "none") run.props.push({ kind, x, z: z + Math.random() * 4, s: 0.7 + Math.random() * 0.8, rot: Math.random() * 6 });
    if (Math.random() < 0.35) run.props.push({ kind: "pine", x: side * (16 + Math.random() * 10), z: z + Math.random() * 4, s: 1.1 + Math.random() * 0.9, rot: 0 });
  }
}
// ------------------------------------------------------------------ kontroller
const input = { queue: [] };
function act(a) { if (state.mode === "run" && !state.paused) input.queue.push(a); }
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowleft", "a"].includes(k)) act("left");
  else if (["arrowright", "d"].includes(k)) act("right");
  else if (["arrowup", "w", " "].includes(k)) act("jump");
  else if (["arrowdown", "s"].includes(k)) act("slide");
  else if (["shift", "e", "enter"].includes(k)) act("ability");
  else if (k === "escape" || k === "p") togglePause();
  else return;
  e.preventDefault();
});
let touch = null, lastTap = 0;
canvas.addEventListener("pointerdown", (e) => { audio(); touch = { x: e.clientX, y: e.clientY, t: performance.now(), done: false }; });
canvas.addEventListener("pointermove", (e) => {
  if (!touch || touch.done) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y, th = 28;
  if (Math.abs(dx) > th || Math.abs(dy) > th) {
    touch.done = true;
    if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? "right" : "left"); else act(dy < 0 ? "jump" : "slide");
  }
});
canvas.addEventListener("pointerup", () => {
  if (touch && !touch.done && performance.now() - touch.t < 250) {
    const now = performance.now();
    if (now - lastTap < 320) { act("ability"); lastTap = 0; } else lastTap = now;
  }
  touch = null;
});
// ------------------------------------------------------------------ güncelleme
function toast(text, ms = 1100) {
  const el = $("toast"); el.textContent = text; el.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), ms);
}
function flash() { const f = $("flash"); f.style.opacity = 1; setTimeout(() => (f.style.opacity = 0), 140); }

function useAbility() {
  const R = run, def = R.def;
  if (def.ability.key === "sprint") {
    if (R.cooldown > 0 || R.sprint > 0 || R.tired > 0) return;
    R.sprint = 3 + R.sprintBonus; R.sprintBonus = 0;
    SFX.sprint(); toast("SPRİNT!", 700);
  } else if (def.ability.key === "claw") {
    const tgt = clawTarget(R);
    if (R.cooldown > 0 || !tgt) return;
    tgt.dead = true; tgt.flee = true; fx("poof", tgt); R.cooldown = 3; R.clawAnim = 0.35; R.shake = 0.2;
    SFX.smash(); toast("PENÇE!", 700);
  }
}

/** Pençe yalnızca düşman aynı şeritte ve yakındayken kullanılabilir */
function clawTarget(R) {
  const L = laneOf(R.x);
  return R.objs.find((o) => o.t === "mammoth" && !o.dead && o.lane === L && o.z > -16 && o.z < -1.2);
}
function hit(o) {
  const R = run;
  if (R.invuln > 0 || R.finished) return;
  if (R.buffs.armor) { R.buffs.armor = 0; R.invuln = 1; toast("Zırh korudu!", 900); SFX.smash(); if (o) o.dead = true; return; }
  fx("hit", o); if (o && o.t !== "mammoth") fx("smash", o);
  const big = o && (o.t === "mammoth" || o.t === "wall");
  if (R.def.fragile && big) R.hearts = 0; else R.hearts--;
  R.invuln = 1.4; R.stumble = 0.8; R.chase = 1; R.shake = 0.4; flash(); SFX.hit();
  if (navigator.vibrate) try { navigator.vibrate(120); } catch {}
  if (R.hearts <= 0) { caught(); return; }
  toast(R.hearts === 1 ? "Mamutlar yaklaşıyor!" : "Dikkat!", 900);
}
function caught() {
  state.mode = "over"; stopMusic(); SFX.trumpet();
  const cp = Math.max(...LEVEL.checkpoints.filter((c) => c <= run.dist), 0);
  run.checkpoint = cp;
  $("over-p").textContent = cp > 0 ? `Son kontrol noktası: ${cp} m. Oradan devam edebilirsin.` : "Bir daha deneyelim, bu sefer mamutlardan kaçacaksın!";
  $("b-continue").hidden = cp === 0;
  show("scr-over"); $("hud").hidden = true;
}

function update(dt) {
  state.time += dt;
  const R = run;
  if (!R) return;
  const def = R.def;
  // zaman yavaşlatma dünyayı yavaşlatır
  const worldMul = R.buffs.slow > 0 ? 0.55 : 1;

  // eylemler
  while (input.queue.length) {
    const a = input.queue.shift();
    if (R.finished) continue;
    if (a === "left" && R.lane > 0) { R.lane--; R.lean = 1; }
    else if (a === "right" && R.lane < 2) { R.lane++; R.lean = -1; }
    else if (a === "jump") {
      if (!R.air) { R.vy = def.jumpV * (R.buffs.jump ? 1.55 : 1); R.buffs.jump = 0; R.air = true; R.slide = 0; R.airJumps = 0; SFX.jump(); }
      else if (def.doubleJump && R.airJumps < 1) { R.vy = def.jumpV * 0.9; R.airJumps++; SFX.jump(); }
    } else if (a === "slide") { if (R.air) R.vy = Math.min(R.vy, -14); R.slide = 0.75; SFX.slide(); }
    else if (a === "ability") useAbility();
  }

  // hız
  const prog = clamp(R.dist / LEVEL.length, 0, 1);
  let target = lerp(LEVEL.baseSpeed, LEVEL.maxSpeed, prog) * (def.speedMul || 1);
  if (R.sprint > 0) target *= 1.45;
  if (R.tired > 0) target *= 0.72;
  if (R.buffs.rage > 0) target *= 1.35;
  if (R.stumble > 0) target *= 0.55;
  if (R.finished) target = 0;
  R.speed = lerp(R.speed, target, 1 - Math.exp(-dt * (R.finished ? 2.5 : 4)));
  const v = R.speed * worldMul;
  R.dist += v * dt;

  // zamanlayıcılar
  if (R.sprint > 0) { R.sprint -= dt; if (R.sprint <= 0) { R.tired = 1; } }
  if (R.tired > 0) { R.tired -= dt; if (R.tired <= 0) R.cooldown = 5; }
  if (R.cooldown > 0) R.cooldown -= dt;
  for (const k of ["rage", "slow", "ghost", "magnet"]) if (R.buffs[k] > 0) R.buffs[k] = Math.max(0, R.buffs[k] - dt);
  R.invuln = Math.max(0, R.invuln - dt); R.stumble = Math.max(0, R.stumble - dt); R.shake = Math.max(0, R.shake - dt);
  R.chase = Math.max(0, R.chase - dt * (R.sprint > 0 ? 0.5 : 0.12));
  if (R.buffs.ghost > 0) R.chase = Math.max(0, R.chase - dt * 0.5);
  R.slide = Math.max(0, R.slide - dt);
  R.clawAnim = Math.max(0, (R.clawAnim || 0) - dt);

  // yatay: Carnotaurus kayarak ve geç döner
  const tx = LANES[R.lane];
  R.x += (tx - R.x) * (1 - Math.exp(-dt * def.laneRate));
  R.lean = lerp(R.lean, 0, 1 - Math.exp(-dt * 5));

  // dikey
  if (R.air) {
    R.vy -= 32 * dt; R.y += R.vy * dt;
    if (R.y <= 0) {
      const over = R.objs.some((o) => o.t === "gap" && Math.abs(o.z) < o.len / 2 && laneOf(R.x) === o.lane);
      if (!over) { R.y = 0; R.vy = 0; R.air = false; SFX.land(); }
    }
  } else {
    const over = R.objs.some((o) => o.t === "gap" && Math.abs(o.z) < o.len / 2 - 0.6 && laneOf(R.x) === o.lane);
    if (over && R.buffs.rage <= 0) { R.air = true; R.vy = -2; }
  }
  if (R.y < -1.2) { // yarığa düştü
    R.y = 0; R.vy = 0; R.air = false;
    R.objs.forEach((o) => { if (o.t === "gap" && Math.abs(o.z) < 8) o.dead = true; });
    hit(null);
  }
  R.phase += dt * (v * 0.62);

  // nesneleri ilerlet + çarpışma
  const myLane = laneOf(R.x), dinoH = R.slide > 0 ? 0.9 : 2.2, smash = R.buffs.rage > 0;
  for (const o of R.objs) {
    o.z += v * dt;
    if (o.t === "mammoth") {
      o.z += o.vz * worldMul * dt; o.p += dt * 7;
      if (!o.warned && o.z > -60) { o.warned = true; SFX.trumpet(); }
    }
    if (o.dead) continue;
    const near = Math.abs(o.z) < 1.0, sameLane = o.lane === myLane;
    switch (o.t) {
      case "food": {
        const mag = R.buffs.magnet > 0 && o.z > -7 && o.z < 1;
        if (mag) { o.lane = myLane; o.y = lerp(o.y, R.y, 0.2); }
        if ((near && sameLane && Math.abs(o.y - R.y) < 1.4) || (mag && o.z > -0.8)) {
          o.dead = true; fx("food", o); R.food += o.gold ? 5 : 1; (o.gold ? SFX.gold : SFX.food)();
        }
        break;
      }
      case "buff":
        if (near && sameLane && R.y < 2.5) { o.dead = true; applyBuff(o.kind); }
        break;
      case "ice":
        if (near && sameLane && R.y < o.h - 0.05) {
          if (smash || R.sprint > 0) { o.dead = true; fx("smash", o); SFX.smash(); R.shake = 0.15; }
          else { o.dead = true; hit(o); }
        }
        break;
      case "wall":
        if (Math.abs(o.z) < 0.9 && sameLane) {
          if (smash) { o.dead = true; fx("smash", o); SFX.smash(); R.shake = 0.25; } else { o.dead = true; hit(o); }
        }
        break;
      case "arch":
        if (Math.abs(o.z) < 0.7 && sameLane && dinoH > 1.2) { if (smash) { o.dead = true; fx("smash", o); SFX.smash(); } else { o.dead = true; hit(o); } }
        break;
      case "mammoth":
        if (Math.abs(o.z) < 1.6 && sameLane && !o.dead) {
          if (R.buffs.ghost > 0) break;
          if (smash) { o.dead = true; o.flee = true; fx("poof", o); SFX.smash(); } else { o.dead = true; hit(o); }
        }
        break;
    }
  }
  R.objs = R.objs.filter((o) => o.z < 12 && !(o.dead && o.t !== "mammoth"));
  // dekorlar
  for (const p of R.props) p.z += v * dt;
  R.props = R.props.filter((p) => p.z < 14);
  while (R.dist >= R.nextProp) { spawnProps(-140); R.nextProp += 6; }
  // yeni desen
  if (!R.finished && R.dist >= R.nextSpawn && R.dist < LEVEL.length - 60) spawnPattern(110);
  // kontrol noktası
  for (const c of LEVEL.checkpoints) if (R.checkpoint < c && R.dist >= c) { R.checkpoint = c; toast("KONTROL NOKTASI", 1000); }
  // bitiş
  if (!R.finished && R.dist >= LEVEL.length) { R.finished = true; R.finishT = 0; SFX.win(); setTimeout(win, 1600); }
  if (R.finished) R.finishT += dt;
}
const laneOf = (x) => (x < -1.15 ? 0 : x > 1.15 ? 2 : 1);

function applyBuff(k) {
  const R = run, b = BUFFS[k];
  SFX.buff(); fx("buff", k); toast(b.icon + " " + b.name.toLocaleUpperCase("tr-TR"), 1000);
  if (k === "life") R.hearts = Math.min(5, R.hearts + 1);
  else if (k === "sprint") { if (R.sprint > 0) R.sprint += 2; else R.sprintBonus = 2; R.cooldown = 0; R.tired = 0; }
  else if (k === "armor") R.buffs.armor = 1;
  else if (k === "jump") R.buffs.jump = 1;
  else R.buffs[k] = b.dur;
}

// ------------------------------------------------------------------ efekt kancaları (oyun mantığından çağrılır)
const _fp = new THREE.Vector3();
function objPos(o) { return _fp.set(o.rx ?? LANES[o.lane], (o.y || 0) + 0.8, o.z); }
function fx(type, o) {
  const R = run;
  switch (type) {
    case "food": emit(o.gold ? 12 : 5, objPos(o), o.gold ? ["#ffd23f", "#fff2a8", "#ff9f1a"] : ["#ff2d5b", "#ff8aa5", "#ffffff"], { speed: 3.5, up: 3, size: o.gold ? 0.55 : 0.4, life: 0.45, grav: 6, spread: 0.5 }); break;
    case "smash": emit(22, _fp.set(LANES[o.lane], 0.8, o.z), ["#bfeaff", "#ffffff", "#7fcdf7"], { speed: 9, up: 6, size: 1.4, life: 1.0, spread: 1.4 }); break;
    case "poof": emit(26, _fp.set(LANES[o.lane], 1.6, o.z), ["#ffffff", "#e8f4ff", "#9b6338"], { speed: 8, up: 5, size: 1.3, life: 0.9, spread: 2 }); break;
    case "hit": emit(16, _fp.set(R.x, 1.0 + R.y, 0), ["#ffffff", "#ffd0c0", "#ff6a4a"], { speed: 6, up: 5, size: 1, life: 0.7 }); break;
    case "buff": emit(24, _fp.set(R.x, 1.2 + R.y, -0.4), [BUFFS[o].col, "#ffffff"], { speed: 6, up: 5, size: 0.8, life: 0.8, grav: 4 }); break;
    case "land": emit(8, _fp.set(R.x, 0.1, 0.3), "#ffffff", { speed: 4, up: 1.4, size: 0.4, life: 0.4, grav: 5 }); break;
  }
}

// ------------------------------------------------------------------ nesne havuzu
const pools = new Map(), live = new Set();
let frameNo = 0;
function obtain(key, o) {
  if (o.mesh && o.mesh.userData.poolKey === key) { o.mesh.userData.seen = frameNo; return o.mesh; }
  let arr = pools.get(key); if (!arr) pools.set(key, (arr = []));
  const make = key.startsWith("buff:") ? buffFactory(key.slice(5)) : FACTORY[key];
  const m = arr.pop() || make();
  m.userData.poolKey = key; m.userData.seen = frameNo; m.visible = true;
  if (!m.parent) world.add(m);
  live.add(m); o.mesh = m; o.fresh = true;
  return m;
}
function sweep() {
  for (const m of live) if (m.userData.seen !== frameNo) { m.visible = false; live.delete(m); pools.get(m.userData.poolKey).push(m); }
}

function syncProps(props) {
  for (const p of props) {
    const key = p.kind === "pine" ? (p.v ??= rnd() < 0.5 ? 0 : 1, "pine" + p.v) : p.kind;
    const m = obtain(key, p);
    m.position.set(p.x, 0, p.z); m.rotation.y = p.rot; m.scale.setScalar(p.s);
  }
}

function syncObjects(R, t, dt) {
  for (const o of R.objs) {
    if (o.z < -170) continue;
    const lx = LANES[o.lane];
    switch (o.t) {
      case "food": {
        if (o.dead) break;
        const m = obtain(o.gold ? "gold" : "food", o);
        if (o.fresh) { o.rx = lx; o.fresh = false; }
        o.rx = damp(o.rx, lx, 14, dt);
        m.position.set(o.rx, o.y + 0.78 + Math.sin(t * 4 + o.z * 0.3) * 0.12, o.z);
        m.rotation.y = t * 2.2 + o.z * 0.2; m.scale.setScalar(1);
        break;
      }
      case "buff": {
        if (o.dead) break;
        const m = obtain("buff:" + o.kind, o);
        m.position.set(lx, 0, o.z);
        const gem = m.getObjectByName("gem"); gem.position.y = 1.0 + Math.sin(t * 3 + o.z) * 0.15; gem.rotation.y = t * 2;
        m.getObjectByName("icon").position.y = 2.15 + Math.sin(t * 3 + o.z) * 0.15;
        break;
      }
      case "ice": { const m = obtain("ice", o); m.position.set(lx, 0, o.z); m.rotation.y = 0.12 * ((o.lane % 2) * 2 - 1); break; }
      case "wall": { const m = obtain("wall", o); m.position.set(lx, 0, o.z); break; }
      case "arch": { const m = obtain("arch", o); m.position.set(lx, 0, o.z); break; }
      case "gap": {
        const m = obtain("gap", o); m.position.set(lx, 0, o.z);
        const L = o.len;
        m.getObjectByName("hole").scale.set(1, L, 1);
        m.getObjectByName("inner").position.set(0, -1.3, -L / 2 + 0.02);
        m.getObjectByName("lipA").position.set(0, 0.02, -L / 2 - 0.1);
        m.getObjectByName("lipB").position.set(0, 0.02, L / 2 + 0.1);
        break;
      }
      case "mammoth": {
        const m = obtain("mammoth", o);
        if (o.flee) o.fx = Math.min(1, (o.fx || 0) + dt * 2.2);
        const away = o.lane === 0 ? -1 : 1;
        const fxv = o.fx || 0;
        m.position.set(lx + fxv * away * 9, 0, o.z);
        m.rotation.set(0, fxv * away * 1.2, 0);
        m.scale.setScalar(0.95);
        animMammoth(m, o.p);
        break;
      }
    }
  }
}

// Kovalayan sürü (arkadan, iki yanda)
const herd = [makeMammoth(), makeMammoth()];
herd.forEach((m) => { m.rotation.y = Math.PI; m.visible = false; m.scale.setScalar(0.9); scene.add(m); });

// Menü dekoru: dinozorun çevresinde sabit bir kar sahnesi
const menuProps = [];
{
  const save = run; run = { props: menuProps };
  for (let z = 30; z > -150; z -= 6) spawnProps(z);
  run = save;
  for (let i = menuProps.length - 1; i >= 0; i--) { const p = menuProps[i]; if (Math.hypot(p.x, p.z) < 10.5) menuProps.splice(i, 1); }
  menuProps.push({ kind: "crystal", x: -4.6, z: -3.5, s: 1.3, rot: 0.3 }, { kind: "rock", x: 4.4, z: -2.6, s: 0.9, rot: 1.2 }, { kind: "drift", x: -3.2, z: 3.4, s: 1.0, rot: 0 }, { kind: "pine", x: 6.2, z: -6.5, s: 1.3, rot: 0 }, { kind: "crystal", x: 3.6, z: 4.2, s: 0.8, rot: 2 });
}

// ------------------------------------------------------------------ çizim
let camFov = 60, menuSpin = 0;
const camPos = new THREE.Vector3(0, 4, 8), camLook = new THREE.Vector3();
function activeDino() { return DINO_OBJ[state.dinoKey] || DINO_OBJ.carno; }
function resize() {
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
  camera.aspect = w / h;
}

function render(dt) {
  resize();
  frameNo++;
  const t = state.time;
  SKY_U.uTime.value = t;
  const portrait = camera.aspect < 0.8;
  for (const k in DINO_OBJ) DINO_OBJ[k].pivot.visible = false;
  const d = activeDino();
  if (d) d.pivot.visible = true;

  if (run && (state.mode === "run" || state.mode === "over" || state.mode === "win")) {
    const R = run;
    const playing = state.mode === "run" && !state.paused;
    const v = playing ? R.speed * (R.buffs.slow > 0 ? 0.55 : 1) : 0;
    scrollGround(R.dist);
    syncProps(R.props);
    syncObjects(R, t, dt);
    // bitiş
    const gz = -(LEVEL.length - R.dist);
    goal.visible = gz > -230 && gz < 40;
    if (goal.visible) {
      goal.position.z = gz;
      goal.children.forEach((c) => { if (c.name === "flag") c.rotation.y = Math.sin(t * 5 + c.position.x) * 0.25; if (c.name === "floe") c.position.y = 0.08 + Math.sin(t + c.position.x) * 0.05; });
    }
    // kovalayan sürü
    const showHerd = R.chase > 0.05 && R.buffs.ghost <= 0;
    herd.forEach((m, i) => {
      m.visible = showHerd;
      if (!showHerd) return;
      const sx = i ? 1 : -1, c = R.chase;
      m.position.set(sx * (3.7 + (1 - c) * 2.5), 0, 3.4 + (1 - c) * 7 + i * 1.3);
      animMammoth(m, t * 9 + i * 1.7);
    });

    // dinozor
    if (d) {
      const P = d.pivot;
      P.position.set(R.x, R.y, 0);
      P.rotation.set(0, -R.lean * 0.3, R.lean * (R.def.laneRate < 10 ? 0.22 : 0.12));
      const grow = 1 + clamp(R.food / 120, 0, 1) * 0.12;
      const slide = R.slide > 0 ? 1 : 0;
      d.inner.scale.set(grow, damp(d.inner.scale.y, grow * (slide ? 0.55 : 1), 18, dt), grow);
      d.inner.rotation.x = damp(d.inner.rotation.x, slide ? 0.12 : 0, 14, dt);
      // animasyon durumu
      if (state.mode === "over") { if (d.cur !== "death") playAnim(d, "death", { once: true, fade: 0.1 }); }
      else if (state.mode === "win" || R.finished) { if (d.cur !== "idle" && d.cur !== "attack") playAnim(d, "attack", { once: true, ts: 0.9 }); else if (d.cur === "attack" && !d.curAction.isRunning()) playAnim(d, "idle"); }
      else if (R.clawAnim > 0.3 && d.cur !== "attack") playAnim(d, "attack", { once: true, ts: 1.6, fade: 0.06 });
      else if (R.air && (!d.lastAir || R.vy > d.lastVy + 3)) {
        const air = Math.max(0.35, (2 * Math.max(R.vy, 6)) / 32), dur = d.actions.jump.getClip().duration;
        playAnim(d, "jump", { once: true, ts: (dur * 0.72) / air, start: dur * 0.18, fade: 0.08 });
      } else if (!R.air && (d.cur !== "run" || d.lastAir) && !(d.cur === "attack" && d.curAction.isRunning())) {
        if (d.lastAir) fx("land");
        playAnim(d, "run", { fade: 0.12 });
      }
      if (d.cur === "run") {
        const runDur = d.actions.run.getClip().duration;
        d.actions.run.timeScale = clamp((R.speed / (MODEL[d.key].length * 1.35)) * runDur, 0.8, 4.2) * (slide ? 0.7 : 1);
      }
      d.lastAir = R.air; d.lastVy = R.vy;
      tickDino(d, playing || state.mode !== "run" ? dt : 0);
      const blink = R.invuln > 0 && Math.floor(t * 14) % 2 === 0 && state.mode === "run";
      P.visible = !blink;
      setDinoLook(d, { ghost: R.buffs.ghost > 0, tint: R.buffs.rage > 0 ? "#ff3010" : R.sprint > 0 ? "#ff8a20" : null, k: R.buffs.rage > 0 ? 0.55 : 0.22 });
      // ayak tozları
      if (playing && !R.air && rnd() < dt * 14) emit(1, _fp.set(R.x + (rnd() - 0.5) * 0.6, 0.08, 0.9), "#eef7ff", { speed: 2, up: 1.2, size: 0.32, life: 0.4, grav: 4, spread: 0.3 });
      armorBubble.visible = !!R.buffs.armor;
      if (armorBubble.visible) { armorBubble.position.set(R.x, R.y + 0.95, 0); armorBubble.scale.set(1.45, 1.35, 2.2); armorBubble.material.uniforms.uT.value = t; }
      magnetRing.visible = R.buffs.magnet > 0;
      if (magnetRing.visible) { magnetRing.position.set(R.x, R.y + 0.08, 0); magnetRing.rotation.z = t * 3; magnetRing.scale.setScalar(1 + Math.sin(t * 6) * 0.06); }
    }
    // kamera
    const shake = R.shake > 0 ? (rnd() - 0.5) * R.shake * 0.7 : 0;
    const fast = R.sprint > 0 || R.buffs.rage > 0;
    camFov = damp(camFov, (portrait ? 68 : 56) + (fast ? 8 : 0), 5, dt);
    camPos.set(R.x * 0.6 + shake, 3.95 + R.y * 0.35, 7.3);
    camLook.set(R.x * 0.75, 1.35 + R.y * 0.3, -10);
    camera.position.copy(camPos); camera.lookAt(camLook);
    // hız çizgileri
    streaks.visible = fast && playing;
    if (streaks.visible) {
      streakP.forEach((s, i) => {
        s.z += v * dt * 1.6; if (s.z > 8) { s.z = -40 - rnd() * 10; s.x = (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 5); s.y = 0.3 + rnd() * 4; }
        _o.position.set(s.x + R.x * 0.5, s.y, s.z); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1 + v * 0.05); _o.updateMatrix(); streaks.setMatrixAt(i, _o.matrix);
      });
      streaks.instanceMatrix.needsUpdate = true;
    }
    aimSun(R.x, -6);
    updateSnow(dt, v * 0.4 + 0.5, R.x);
    updateFx(dt, v);
  } else {
    // menü: dinozor ortada, kamera yavaşça çevresinde döner
    scrollGround(0);
    syncProps(menuProps);
    goal.visible = false; herd.forEach((m) => (m.visible = false));
    armorBubble.visible = false; magnetRing.visible = false; streaks.visible = false;
    if (d) {
      d.pivot.position.set(0, 0, 0); d.pivot.rotation.set(0, 0, 0);
      d.inner.scale.set(1, 1, 1); d.inner.rotation.x = 0;
      setDinoLook(d, {});
      d.roarT -= dt;
      if (d.cur !== "idle" && d.cur !== "attack") playAnim(d, "idle");
      if (d.cur === "attack" && !d.curAction.isRunning()) playAnim(d, "idle", { fade: 0.35 });
      if (d.roarT <= 0) { d.roarT = 5 + rnd() * 3; playAnim(d, "attack", { once: true, ts: 0.85, fade: 0.25 }); SFX.roar?.(); }
      tickDino(d, dt);
    }
    menuSpin += dt * 0.22;
    const chars = !$("scr-chars").hidden;
    const r = portrait ? 6.6 : 5.6;
    const a = chars ? -0.9 + Math.sin(menuSpin * 0.7) * 0.25 : menuSpin - 0.6;
    camera.position.set(Math.sin(a) * r, chars ? 1.6 : 2.3, Math.cos(a) * r);
    camLook.set(0, chars ? 0.2 : 1.05, 0);
    camera.lookAt(camLook);
    camFov = damp(camFov, portrait ? 62 : 48, 4, dt);
    aimSun(0, -2);
    updateSnow(dt, 0.6, 0);
    updateFx(dt, 0);
  }
  camera.fov = camFov; camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  sweep();
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ gösterge
function updateHud() {
  if (!run || state.mode !== "run") return;
  const R = run;
  $("hearts").textContent = "❤️".repeat(Math.max(0, R.hearts)) + "🖤".repeat(Math.max(0, 3 - R.hearts));
  const p = clamp(R.dist / LEVEL.length, 0, 1);
  $("prog-fill").style.width = p * 100 + "%";
  $("prog-me").style.left = p * 100 + "%";
  $("food").textContent = R.food;
  // özel güç düğmesi
  const ab = $("b-ability"), def = R.def;
  let ready = 1;
  if (def.ability.key === "sprint") {
    if (R.sprint > 0) ready = R.sprint / 3; else if (R.tired > 0) ready = 0; else if (R.cooldown > 0) ready = 1 - R.cooldown / 5;
  } else if (R.cooldown > 0) ready = 1 - R.cooldown / 3;
  const clawOk = def.ability.key === "claw" && R.cooldown <= 0 && !!clawTarget(R);
  ab.style.setProperty("--p", Math.round(ready * 100) + "%");
  ab.classList.toggle("cool", def.ability.key === "claw" ? !clawOk : ready < 1 && !(R.sprint > 0));
  ab.classList.toggle("glow", clawOk);
  // aktif güçlendirmeler
  const chips = [];
  if (R.buffs.armor) chips.push(`<div class="buff">🛡️ Zırh hazır</div>`);
  if (R.buffs.jump) chips.push(`<div class="buff">🦘 Süper zıplama hazır</div>`);
  if (R.sprintBonus) chips.push(`<div class="buff">🚀 Sprint +2 sn</div>`);
  for (const k of ["rage", "slow", "ghost", "magnet"]) if (R.buffs[k] > 0)
    chips.push(`<div class="buff">${BUFFS[k].icon} ${BUFFS[k].name}<span class="bar"><i style="width:${(R.buffs[k] / BUFFS[k].dur) * 100}%"></i></span></div>`);
  const html = chips.join("");
  if ($("buffs").dataset.h !== html) { $("buffs").innerHTML = html; $("buffs").dataset.h = html; }
}

// ------------------------------------------------------------------ ekranlar
const SCREENS = ["scr-load", "scr-title", "scr-story", "scr-map", "scr-chars", "scr-pause", "scr-over", "scr-win"];
function show(id) { SCREENS.forEach((s) => ($(s).hidden = s !== id)); }

const STORY = [
  { art: "🌋", h: "Büyük deprem", p: "Bir sabah yer öyle sarsıldı ki koca bir kıta parçası koptu ve okyanusa doğru sürüklendi." },
  { art: "🧊", h: "Kutuplarda mahsur", p: "Yavru dinozorlar gözlerini açtığında kendilerini buzulların ortasında buldu. Aileleri çok uzaktaydı." },
  { art: "🦣", h: "Tehlikeli yol", p: "Mamutlar, dev timsahlar, yırtıcı sürüler… Eve giden yol kolay değil. Ama yalnız değilsin." },
  { art: "🏞️", h: "Görevin", p: "Yavruları beş zorlu bölgeden geçirip vadiye, ailelerine ulaştır. Her bölgede yeni bir dinozor arkadaş katılacak!" }
];
let storyI = 0;
function renderStory() {
  const s = STORY[storyI];
  $("story-art").textContent = s.art; $("story-h").textContent = s.h; $("story-p").textContent = s.p;
  $("story-dots").innerHTML = STORY.map((_, i) => `<i class="${i === storyI ? "on" : ""}"></i>`).join("");
  $("b-story-next").textContent = storyI === STORY.length - 1 ? "Haydi!" : "İleri";
}

const STAGES = [
  { n: 1, name: "Kutuplar", enemy: "Mamutlar", icon: "🧊", foe: "🦣" },
  { n: 2, name: "Bataklık", enemy: "Dev timsahlar", icon: "🌿", foe: "🐊" },
  { n: 3, name: "Volkanik Kayalar", enemy: "Didelphodon sürüleri", icon: "🌋", foe: "🦡" },
  { n: 4, name: "Orman", enemy: "Kılıç dişli kaplan", icon: "🌲", foe: "🐅" },
  { n: 5, name: "Vadi", enemy: "Quetzalcoatlus", icon: "🏞️", foe: "🦅" }
];
function renderMap() {
  const best = state.best.stars || 0;
  $("map").innerHTML = STAGES.map((s) => {
    const open = s.n === 1;
    return `<button class="stage ${open ? "open" : "locked"}" data-stage="${s.n}" ${open ? "" : "disabled"}>
      <span class="n">${open ? s.icon : "🔒"}</span>
      <span><b>${s.n}. ${s.name}</b><small>Düşman: ${s.foe} ${s.enemy}</small></span>
      <span class="st">${open ? (best ? "★".repeat(best) + "☆".repeat(3 - best) : "Başla ▸") : "Yakında"}</span></button>`;
  }).join("");
}
function renderChars() {
  const cards = Object.entries(DINOS).map(([k, d]) => {
    const locked = !state.unlocked.includes(k);
    return `<button class="char ${state.dinoKey === k ? "sel" : ""} ${locked ? "locked" : ""}" data-dino="${k}" ${locked ? "disabled" : ""}>
      <b>${locked ? "🔒 " : ""}${d.name}</b><small>${locked ? d.short : d.ability.icon + " " + d.tag}</small>
      ${Object.entries(d.stats).map(([n, v]) => `<div class="stat">${n}<i style="--v:${v}%"></i></div>`).join("")}</button>`;
  }).join("") + LOCKED_SOON.map((d) => `<div class="char locked mini"><b>🔒 ${d.name}</b><small>${d.short}</small></div>`).join("");
  $("chars").innerHTML = cards;
  const d = DINOS[state.dinoKey];
  $("char-desc").textContent = `${d.name}: ${d.ability.desc}`;
}

function startRun(fromDist = 0) {
  audio();
  newRun(fromDist);
  state.mode = "run"; state.paused = false;
  show(null); $("hud").hidden = false;
  const def = DINOS[state.dinoKey];
  $("ab-icon").textContent = def.ability.icon; $("ab-name").textContent = def.ability.name; $("hint-ab").textContent = def.ability.name.toLocaleLowerCase("tr-TR");
  $("prog").querySelectorAll(".cp").forEach((e) => e.remove());
  LEVEL.checkpoints.forEach((c) => { const e = document.createElement("span"); e.className = "cp"; e.style.left = (c / LEVEL.length) * 100 + "%"; $("prog").appendChild(e); });
  const hint = $("hint"); hint.style.opacity = 1; clearTimeout(startRun.h); startRun.h = setTimeout(() => (hint.style.opacity = 0), 6000);
  toast(fromDist ? "DEVAM!" : "KOŞ!", 900);
  startMusic();
}
function togglePause() {
  if (state.mode !== "run") return;
  state.paused = !state.paused;
  show(state.paused ? "scr-pause" : null);
}
function win() {
  if (state.mode !== "run") return;
  state.mode = "win"; stopMusic();
  const R = run, ratio = R.foodSpawned ? R.food / R.foodSpawned : 0;
  const stars = ratio >= 0.5 ? 3 : ratio >= 0.28 ? 2 : 1;
  $("win-stars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
  $("win-p").textContent = `${R.food} yiyecek topladın (%${Math.round(ratio * 100)}). Yavrular kıyıya vardı, sırada Bataklık var!`;
  state.best.stars = Math.max(state.best.stars || 0, stars); store.set("best", state.best);
  const un = $("win-unlock");
  if (!state.unlocked.includes("raptor")) {
    state.unlocked.push("raptor"); store.set("unlocked", state.unlocked);
    un.hidden = false; un.textContent = "🎉 Yeni dinozor açıldı: Velociraptor! En hızlısı, çift zıplar ve orak pençesiyle mamutları kaçırır.";
  } else un.hidden = true;
  $("hud").hidden = true; show("scr-win");
}

// düğmeler
$("b-play").onclick = () => { audio(); if (!store.get("storySeen", false)) { storyI = 0; renderStory(); show("scr-story"); } else { renderMap(); show("scr-map"); } };
$("b-story").onclick = () => { audio(); storyI = 0; renderStory(); show("scr-story"); };
$("b-story-next").onclick = () => { if (storyI < STORY.length - 1) { storyI++; renderStory(); } else { store.set("storySeen", true); renderMap(); show("scr-map"); } };
$("b-map-back").onclick = () => show("scr-title");
$("map").onclick = (e) => { const b = e.target.closest("[data-stage]"); if (b && b.dataset.stage === "1") { renderChars(); show("scr-chars"); } };
$("chars").onclick = (e) => { const b = e.target.closest("[data-dino]"); if (!b || b.disabled) return; state.dinoKey = b.dataset.dino; store.set("dino", state.dinoKey); renderChars(); const dd = DINO_OBJ[state.dinoKey]; if (dd) { dd.roarT = 0; } };
$("b-chars-back").onclick = () => { renderMap(); show("scr-map"); };
$("b-go").onclick = () => startRun(0);
$("b-pause").onclick = togglePause;
$("b-resume").onclick = togglePause;
$("b-quit").onclick = () => { state.mode = "menu"; state.paused = false; stopMusic(); $("hud").hidden = true; renderMap(); show("scr-map"); };
$("b-continue").onclick = () => startRun(run.checkpoint);
$("b-restart").onclick = () => startRun(0);
$("b-win-map").onclick = () => { state.mode = "menu"; renderMap(); show("scr-map"); };
$("b-win-again").onclick = () => startRun(0);
$("b-ability").addEventListener("pointerdown", (e) => { e.stopPropagation(); audio(); act("ability"); });
const muteBtn = $("b-mute");
const setMute = () => { muteBtn.textContent = muted ? "🔇" : "🔊"; };
muteBtn.onclick = () => { muted = !muted; store.set("muted", muted); setMute(); if (!muted) audio(); };
setMute();
addEventListener("visibilitychange", () => { if (document.hidden && state.mode === "run" && !state.paused) togglePause(); });

// ------------------------------------------------------------------ yükleme + ana döngü
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state.mode === "run" && !state.paused) { update(dt); updateHud(); }
  else state.time += dt;
  render(state.paused ? 0 : dt);
  requestAnimationFrame(frame);
}
(async () => {
  const bar = $("load-bar"), prog = { carno: 0, raptor: 0 };
  const upd = () => { bar.style.width = Math.round(((prog.carno + prog.raptor) / 2) * 100) + "%"; };
  try {
    await Promise.all(Object.keys(MODEL).map((k) => loadDino(k, (e) => { if (e.total) { prog[k] = e.loaded / e.total; upd(); } })));
  } catch (err) {
    console.error(err);
    $("load-msg").textContent = "Modeller yüklenemedi. Sayfayı yenilemeyi dene. (" + (err && err.message || err) + ")";
    return;
  }
  if (!DINOS[state.dinoKey] || !state.unlocked.includes(state.dinoKey)) state.dinoKey = "carno";
  renderer.compile(scene, camera);
  show("scr-title");
  requestAnimationFrame((n) => { last = n; frame(n); });
})();
window.__dino = { state, get run() { return run; }, act, startRun, update, laneOf, LANES, show, renderChars, renderMap, DINO_OBJ, render };
