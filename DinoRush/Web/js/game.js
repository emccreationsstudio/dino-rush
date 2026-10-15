// =====================================================================================
//  DINO RUSH RUNNER · Bölüm 1: Buzullar Arasında Mahsur · Bölüm 2: Bataklık Felaketi
//  three.js motoru; Harita 1 modelleri (Sunny, Raptor, mamut, kutup ayısı, engeller, bufflar) models/h1 içinde.
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 3)); // yüksek çözünürlük (iPhone 3x)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const FOG_COL = new THREE.Color("#d6ebfa");
scene.fog = new THREE.Fog(FOG_COL, 60, 420);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);
const world = new THREE.Group(); scene.add(world);

const hemi = new THREE.HemisphereLight("#e6f4ff", "#8fa8c2", 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#ffe7c7", 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 16, bottom: -16, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-9, 22, 12);
function aimSun(x, z) { sun.target.position.set(x, 0, z); sun.position.set(x + SUN_OFF.x, SUN_OFF.y, z + SUN_OFF.z); }

// Gökyüzü: dağ görseliyle uyumlu kutup gündüzü (kuzey ışıkları/yıldızlar uAur ile açılabilir)
const SKY_U = { uTop: { value: new THREE.Color("#1f78d6") }, uMid: { value: new THREE.Color("#5fb2ef") }, uHor: { value: new THREE.Color("#d8eeff") },
  uTime: { value: 0 }, uAur: { value: 0 } };
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
      col += uAur * star * (0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0));
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
  const geo = new THREE.CylinderGeometry(1.15, 1.15, ROAD_LEN, 14, 1, true, 0, Math.PI);
  geo.rotateZ(Math.PI / 2); geo.rotateY(Math.PI / 2); // yarım silindir: kubbe yukarı, eksen z boyunca
  const b = new THREE.Mesh(geo, bermMat);
  b.scale.set(1, 0.95, 1); b.position.set(sx * (ROAD_W / 2 + 0.8), -0.02, ROAD_Z);
  b.receiveShadow = true; b.castShadow = false; scene.add(b);
}
// Bölüm 1: yol kenarında kar yığınları — dinozor 3 şeridin dışına çıkamaz (görsel duvar)
const BANK_N = 34, BANK_SP = 6.5;
const bankMat = new THREE.MeshStandardMaterial({ color: "#f3f8fd", roughness: 0.9, metalness: 0 });
const snowBanks = new THREE.Group(); scene.add(snowBanks);
for (let i = 0; i < BANK_N; i++) for (const sx of [-1, 1]) {
  const sd = i * 2 + (sx > 0 ? 1 : 0) + 7;
  const m = mesh(jitter(new THREE.IcosahedronGeometry(1, 3), 0.16, sd), bankMat, false);
  const r = (k) => ((Math.sin(sd * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  m.scale.set(0.85 + r(1) * 0.35, 0.75 + r(2) * 0.7, 1.7 + r(3) * 1.4);
  m.position.set(sx * (ROAD_W / 2 + 0.55 + m.scale.x * 0.55 + r(4) * 0.25), 0.05, 0);
  m.rotation.y = (r(5) - 0.5) * 0.4; m.receiveShadow = true;
  m.userData.z0 = i * BANK_SP + r(6) * 2.5; snowBanks.add(m);
}
function scrollGround(dist) {
  snowBanks.visible = curTheme === 1;
  if (snowBanks.visible) for (const m of snowBanks.children) m.position.z = 14 - BANK_N * BANK_SP + ((m.userData.z0 + dist) % (BANK_N * BANK_SP));
  const o = (dist / 8) % 1, o2 = (dist / 16) % 1;
  roadTex.offset.y = o; snowTex.offset.y = o; bermTex.offset.y = o; if (roadTexLive) roadTexLive.offset.y = o2;
  if (curTheme === 2) { SW.roadTex.offset.y = o2; SW.waterTex.offset.y = o; SW.waterTex.offset.x = Math.sin(state.time * 0.3) * 0.02; SW.bankTex.offset.y = o; }
}

// Uzak dağlar: arkaplan_daglar görseli, kamerayı çevreleyen silindir bant (yüklemede kurulur)
const mtnBand = new THREE.Group(); scene.add(mtnBand);

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
// Çilek: parlak kırmızı gövde, sarı çekirdekler, yeşil yaprak tacı
{
  const prof = [[0, -0.3], [0.1, -0.26], [0.18, -0.15], [0.23, -0.02], [0.24, 0.08], [0.21, 0.17], [0.13, 0.24], [0, 0.26]].map(([x, y]) => new THREE.Vector2(x, y));
  const parts = [P(new THREE.LatheGeometry(prof, 14), "#e3172d")];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996, yy = -0.22 + (i / 26) * 0.4, r = 0.235 * Math.sin(Math.acos(clamp((yy - 0.0) / 0.3, -1, 1))) * 0.98 + 0.005;
    parts.push(P(new THREE.TetrahedronGeometry(0.018, 0), "#ffe36a", { x: Math.cos(a) * r, y: yy, z: Math.sin(a) * r }));
  }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(P(new THREE.ConeGeometry(0.06, 0.2, 4), "#2fae3c", { x: Math.cos(a) * 0.09, y: 0.27, z: Math.sin(a) * 0.09, rx: Math.sin(a) * 1.25, rz: -Math.cos(a) * 1.25 })); }
  parts.push(P(new THREE.CylinderGeometry(0.018, 0.022, 0.12, 5), "#3b7a2a", { y: 0.33 }));
  GEO.strawberry = merge(parts); GEO.strawberry.scale(1.35, 1.35, 1.35);
}
GEO.rockCap = P(jitter(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.07, 11), "#f7fbff", { sx: 0.92, sy: 0.32, sz: 0.95 });
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
// sarkıt kemeri: iki buz direk + üst kiriş (sarkıt modeli kirişin altından sarkar, alt ucu 1.15 m)
GEO.archFrame = merge([
  P(new RoundedBoxGeometry(0.34, 3.05, 0.6, 1, 0.1), "#fff", { x: -1.12, y: 1.52 }),
  P(new RoundedBoxGeometry(0.34, 3.05, 0.6, 1, 0.1), "#fff", { x: 1.12, y: 1.52 }),
  P(new RoundedBoxGeometry(2.7, 0.36, 0.8, 1, 0.12), "#fff", { y: 2.98 })
]);
GEO.archCap2 = merge([
  P(new RoundedBoxGeometry(2.85, 0.2, 0.9, 1, 0.08), "#f6fbff", { y: 3.24 }),
  P(jitter(new THREE.ConeGeometry(0.36, 0.55, 6), 0.05, 2), "#f6fbff", { x: -0.6, y: 3.5 }),
  P(jitter(new THREE.ConeGeometry(0.28, 0.42, 6), 0.05, 3), "#f6fbff", { x: 0.7, y: 3.45, z: 0.1 })
]);
// çığ bulutu: beyaz kar topakları + mavi rüzgar dilleri (taslaktaki görsele benzer)
GEO.avalCloud = merge([
  ...Array.from({ length: 16 }, (_, i) => P(jitter(new THREE.IcosahedronGeometry(0.7 + (i % 4) * 0.22, 1), 0.1, 90 + i), i % 3 ? "#ffffff" : "#e3f2ff", { x: (i % 4) * 0.55 - 0.8, y: 0.5 + Math.floor(i / 4) * 0.75, z: ((i * 7) % 5) * 0.45 - 0.9 })),
  ...Array.from({ length: 7 }, (_, i) => P(new THREE.ConeGeometry(0.28, 3.2 + (i % 3), 6), i % 2 ? "#5fb2ef" : "#9fd6fb", { x: 2.2 + (i % 3) * 0.4, y: 0.6 + i * 0.42, z: ((i * 3) % 4) * 0.4 - 0.6, rz: Math.PI / 2 + 0.15, sz: 0.4 })),
  ...Array.from({ length: 10 }, (_, i) => P(new THREE.OctahedronGeometry(0.16, 0), "#ffffff", { x: 1.2 + (i % 5) * 0.7, y: 0.4 + (i % 4) * 0.8, z: ((i * 5) % 3) * 0.5 - 0.5, sx: 1.8 }))
]);
GEO.avalPile = merge([
  ...Array.from({ length: 9 }, (_, i) => P(jitter(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.1, 120 + i), i % 2 ? "#eef6ff" : "#cfe6f8", { x: ((i % 3) - 1) * 0.6, z: (Math.floor(i / 3) - 1) * 1.6, sx: 0.95, sy: 1.6 - (i % 3 === 1 ? 0 : 0.5), sz: 1.25 })),
  ...Array.from({ length: 8 }, (_, i) => P(jitter(new THREE.OctahedronGeometry(0.35 + (i % 3) * 0.12, 0), 0.05, 140 + i), i % 2 ? "#8fd3fb" : "#5fb9ef", { x: ((i % 4) - 1.5) * 0.55, y: 0.9 + (i % 3) * 0.25, z: (i - 3.5) * 0.6, rx: i, ry: i * 2 })),
  ...Array.from({ length: 6 }, (_, i) => P(jitter(new THREE.SphereGeometry(0.45, 8, 5), 0.06, 160 + i), "#ffffff", { x: ((i % 3) - 1) * 0.9, y: 0.2, z: (i < 3 ? -1 : 1) * 2.6, sy: 0.6 }))
]);
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

// ------------------------------------------------------------------ Harita 1 modelleri (glTF, base64 JS modülleri: models/h1)
const H1 = {};
/** Buff türü → o türü veren yiyecek modelleri */
const BUFF_MODELS = {
  life: ["kalp", "kalp", "kalp", "buff_kertenkele", "buff_mango", "buff_tirtil"], // kalp en sık: yiyince +1 can
  armor: ["buff_kaplumbaga_kabugu", "buff_yumurta"],
  sprint: ["buff_biber", "buff_kus", "buff_simsek"],
  rage: ["buff_roket"], slow: ["buff_kum_saati"], magnet: ["buff_bal"], ghost: ["buff_mantar"], jump: ["buff_kanguru"],
  double: ["buff_x2"]
};
/** 1.9 m boyunda gelen buff modellerini diğerleriyle (0.75 m) eşitle */
const BUFF_SCALE = { buff_simsek: 0.5, buff_x2: 0.4, buff_kanguru: 0.4 };
const H1_FILES = ["sunny", "raptor", "mamut", "kutup_ayisi", "buz_kaya", "dal_kutuk", "sarkit", "buz_blok", "buz_plaka", "yarik_derin", "yarik_sulu",
  "kaygan_zemin", "cam_agaci", "yemek_et", "kaya", "buff_mor_meyve", "catlak_zemin", "dusen_sarkit", "mosasaurus", "yarik_su2", "yarik_kirik", "catlak_plaka", "ter_damla", "sel_dalga",
  "b_agac1", "b_agac2", "nilufer", "monstera", "camur", "timsah", "sivrisinek", ...new Set(Object.values(BUFF_MODELS).flat().filter((n) => n !== "kalp"))];
/** Parlak kırmızı 3D kalp (kodla üretilir): yiyince ekstra can */
let heartGeo = null;
const heartMat = new THREE.MeshStandardMaterial({ color: "#ff2d55", emissive: "#b0002e", emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.05, envMapIntensity: 1.6 });
function makeHeart() {
  if (!heartGeo) {
    const h = new THREE.Shape();
    h.moveTo(0, -0.35);
    h.bezierCurveTo(-0.08, -0.25, -0.38, -0.08, -0.38, 0.12);
    h.bezierCurveTo(-0.38, 0.3, -0.24, 0.38, -0.13, 0.38);
    h.bezierCurveTo(-0.04, 0.38, 0, 0.3, 0, 0.24);
    h.bezierCurveTo(0, 0.3, 0.04, 0.38, 0.13, 0.38);
    h.bezierCurveTo(0.24, 0.38, 0.38, 0.3, 0.38, 0.12);
    h.bezierCurveTo(0.38, -0.08, 0.08, -0.25, 0, -0.35);
    heartGeo = new THREE.ExtrudeGeometry(h, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 5, curveSegments: 18 });
    heartGeo.center();
  }
  const m = new THREE.Mesh(heartGeo, heartMat); m.castShadow = true;
  const g = new THREE.Group(); g.add(m); return g;
}
async function b64Bytes(file) {
  const { default: b64 } = await import(file);
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function loadH1(name) {
  const bytes = await b64Bytes(`../models/h1/${name}.js`);
  const g = await new Promise((res, rej) => gltfLoader.parse(bytes.buffer, "", res, rej));
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.25); }
  });
  H1[name] = g;
}
/** Yol: parlak buz fotoğrafı + kalın beyaz şerit çizgileri */
async function buildRoad() {
  const bytes = await b64Bytes("../models/h1/buz_yol.js");
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const t = canvasTex(1024, 4096, (g, w, h) => {
    // fotoğraf kesintisiz değil: alt yarıya aynalayarak çiz → dikişsiz döşenir
    g.drawImage(img, 0, 0, w, h / 2);
    g.save(); g.translate(0, h); g.scale(1, -1); g.drawImage(img, 0, 0, w, h / 2); g.restore();
    g.fillStyle = "rgba(200,235,255,.10)"; g.fillRect(0, 0, w, h);
    const edge = g.createLinearGradient(0, 0, w, 0); edge.addColorStop(0, "rgba(40,110,180,.35)"); edge.addColorStop(0.08, "rgba(40,110,180,0)"); edge.addColorStop(0.92, "rgba(40,110,180,0)"); edge.addColorStop(1, "rgba(40,110,180,.35)");
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
    for (const u of [0.5 - 1.15 / ROAD_W, 0.5 + 1.15 / ROAD_W]) {
      g.fillStyle = "rgba(255,255,255,.97)"; g.shadowColor = "rgba(255,255,255,.8)"; g.shadowBlur = 6;
      for (const y0 of [0.09, 0.59]) g.fillRect(u * w - 16, h * y0, 32, h * 0.25);
      g.shadowBlur = 0;
    }
  });
  t.wrapS = THREE.ClampToEdgeWrapping; t.repeat.set(1, 20);
  road.material.map = t; road.material.color.set("#ffffff"); road.material.roughness = 0.12; road.material.needsUpdate = true;
  roadTexLive = t;
}
let roadTexLive = null;
/** Dağ bandı: görseli kamerayı çevreleyen silindire sar, üst kenarı gökyüzüne erit */
async function buildMountains() {
  const bytes = await b64Bytes("../models/h1/daglar.js");
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.MirroredRepeatWrapping; tex.repeat.set(6, 1); tex.anisotropy = MAX_ANISO;
  const fade = canvasTex(4, 64, (g, w, h) => { const c = g.createLinearGradient(0, 0, 0, h); c.addColorStop(0, "#000"); c.addColorStop(0.3, "#fff"); c.addColorStop(1, "#fff"); g.fillStyle = c; g.fillRect(0, 0, w, h); }, { wrap: false, srgb: false });
  const R = 300, H = (2 * Math.PI * R) / 6 / (2048 / 563);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), new THREE.MeshBasicMaterial({ map: tex, alphaMap: fade, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  band.position.y = H / 2 - 22; band.renderOrder = -1; band.rotation.y = 0.6;
  mtnBand.add(band);
}
function staticClone(name, s = 1) {
  const g = new THREE.Group(), m = H1[name].scene.clone(true);
  m.scale.setScalar(s); g.add(m);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
/** İskeletli modeli kopyala (SkeletonUtils.clone eşdeğeri) */
function cloneSkinned(source) {
  const srcOf = new Map(), cloneOf = new Map(), clone = source.clone();
  (function par(a, b) { srcOf.set(b, a); cloneOf.set(a, b); for (let i = 0; i < a.children.length; i++) par(a.children[i], b.children[i]); })(source, clone);
  clone.traverse((n) => {
    if (!n.isSkinnedMesh) return;
    const s = srcOf.get(n);
    n.skeleton = s.skeleton.clone(); n.bindMatrix.copy(s.bindMatrix);
    n.skeleton.bones = s.skeleton.bones.map((b) => cloneOf.get(b));
    n.bind(n.skeleton, n.bindMatrix);
  });
  return clone;
}
/** Animasyonlu karakter (düşmanlar): kök grup + karıştırıcı + eylemler (adlar küçük harf) */
function makeActor(name, s) {
  const g = H1[name], model = cloneSkinned(g.scene);
  model.scale.setScalar(s);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const root = new THREE.Group(); root.add(model);
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const c of g.animations) actions[c.name.toLowerCase()] = mixer.clipAction(c);
  root.userData.actor = { mixer, actions, cur: null, curAction: null };
  return root;
}

// Delik sistemi (yarık, kırılan buz): yol düzlemini şablonla (stencil) delip altındaki modeli göster
const HOLE_A = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const HOLE_B = new THREE.ShaderMaterial({
  vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  // derinliği sıfırla (0.9997: 300 m'deki dağ bandının önünde kalır)
  fragmentShader: `void main(){ gl_FragColor = vec4(0.0); gl_FragDepth = 0.9997; }`,
  colorWrite: false, depthWrite: true, depthFunc: THREE.AlwaysDepth, stencilWrite: true, stencilRef: 1,
  stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp
});
function holeCutter(w, l) {
  const geo = new THREE.PlaneGeometry(w, l); geo.rotateX(-Math.PI / 2);
  const a = new THREE.Mesh(geo, HOLE_A), b = new THREE.Mesh(geo, HOLE_B);
  a.position.y = b.position.y = 0.006; a.renderOrder = 1; b.renderOrder = 2;
  const g = new THREE.Group(); g.add(a, b); return g;
}
const _inMats = new Map();
/** Deliğin içinde çizilecek parçalar. look: "deep" (koyu yarık duvarı), "thin" (altı görünen ince buz), "water" */
function inHole(obj, look) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.renderOrder = 3; o.castShadow = false;
    const lk = typeof look === "function" ? look(o) : look;
    const conv = (m) => {
      const key = m.uuid + (lk || "");
      let n = _inMats.get(key);
      if (!n) {
        n = m.clone(); Object.assign(n, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
        if (lk === "deep") { n.color.multiplyScalar(0.45); n.color.lerp(new THREE.Color("#0b3a6e"), 0.35); n.envMapIntensity = 0.4; }
        if (lk === "thin") { n.transparent = true; n.opacity = 0.42; n.depthWrite = false; n.color.lerp(new THREE.Color("#7cc8f5"), 0.4); n.roughness = 0.06; }
        if (lk === "thick") { n.transparent = true; n.opacity = 0.93; n.color.lerp(new THREE.Color("#ffffff"), 0.3); n.roughness = 0.2; }
        if (lk === "water") { n.transparent = false; n.color.set("#0e4f8f"); n.roughness = 0.05; n.envMapIntensity = 1.4; }
        _inMats.set(key, n);
      }
      return n;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return obj;
}
let slickMat = null;

const FACTORY = {
  pine0: () => staticClone("cam_agaci", 0.8),
  pine1: () => { const g = staticClone("cam_agaci", 0.7); g.children[0].rotation.y = 2.1; return g; },
  crystal: () => mesh(GEO.crystal, MAT.ice),
  // karlı kaya: kullanıcının kaya modeli + üstünde kar kapağı
  rock: () => { const g = staticClone("kaya", 1.25); g.children[0].position.y = 0.6; const cap = mesh(GEO.rockCap, MAT.vc); cap.position.y = 1.12; cap.scale.setScalar(1.05); cap.receiveShadow = true; g.add(cap); return g; },
  drift: () => { const m = mesh(GEO.drift, MAT.vc, false); m.receiveShadow = true; return m; },
  food: () => staticClone("yemek_et", 1.0),
  gold: () => mesh(GEO.gold, MAT.gold),
  ice: () => staticClone("buz_kaya"),
  log: () => staticClone("dal_kutuk"),
  wall: () => staticClone("buz_blok"),
  arch: () => { const g = new THREE.Group(); g.add(mesh(GEO.archFrame, MAT.iceDeep), mesh(GEO.archCap2, MAT.vc), staticClone("sarkit")); return g; },
  gap: () => {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1), new THREE.MeshBasicMaterial({ map: holeTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.012; hole.name = "hole"; g.add(hole);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.6), new THREE.MeshBasicMaterial({ map: wallInTex }));
    wall.position.y = -1.3; wall.name = "inner"; g.add(wall);
    const l1 = mesh(GEO.lip, MAT.vc, false), l2 = mesh(GEO.lip, MAT.vc, false); l1.name = "lipA"; l2.name = "lipB"; g.add(l1, l2);
    return g;
  },
  // üç şeridi kesen yarık: derin (düşünce can gider) ya da sulu
  crevasse: () => iceRift("yarik_kirik", false),
  crevasseW: () => iceRift("yarik_su2", true),
  // kırılan buz plakası: altı okyanus
  plate: () => {
    const g = new THREE.Group(); g.add(holeCutter(2.3, 3.0));
    const m = inHole(H1.buz_plaka.scene.clone(true), (o) => (o.name === "su_yuzeyi" ? "water" : o.name === "plaka_saglam" ? "thick" : "thin")); g.add(m);
    const pp = {}; m.traverse((o) => { if (o.name) pp[o.name] = o; });
    // çatlak plakanın üstüne belirgin çatlak buz zemini (yolun üstünde normal çizilir)
    // kullanıcının çatlak buz plakası modeli (gerçek kalınlığıyla, üst yüzü yoldan 4 cm yukarıda)
    const top = staticClone("catlak_plaka"); top.scale.set(2.3 / 1.84, 1.4, 3.0 / 1.9); top.position.y = -0.13;
    top.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 4; } });
    g.add(top); pp.catlakUst = top;
    g.userData.pp = pp;
    g.userData.pieces = Object.keys(pp).filter((n) => /^parca_\d+$/.test(n)).map((n) => ({ o: pp[n], base: pp[n].position.clone(), v: 0, spin: (rnd() - 0.5) * 3 }));
    return g;
  },
  slick: () => {
    const g = staticClone("kaygan_zemin");
    g.traverse((o) => {
      if (!o.isMesh) return;
      if (!slickMat) { slickMat = o.material.clone(); Object.assign(slickMat, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, roughness: 0.08, envMapIntensity: 1.6 }); }
      o.material = slickMat; o.castShadow = false; o.receiveShadow = true;
    });
    return g;
  },
  // gökten düşen buz sarkıtı + yerdeki uyarı halkası
  fall: () => {
    const g = new THREE.Group();
    const sh = staticClone("dusen_sarkit", 1.2); sh.name = "shard"; g.add(sh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 32), new THREE.MeshBasicMaterial({ color: "#ff3b2f", transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.name = "warn"; g.add(ring);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: "#0b2238", transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.015; shadow.name = "shadow"; g.add(shadow);
    return g;
  },
  mosa: () => staticClone("mosasaurus", 2.4),
  // çığ (yer tutucu: kullanıcının çığ modeli gelince değişecek): kar bulutu + çizgiler + yerdeki yığın + uyarı şeridi
  aval: () => {
    const g = new THREE.Group();
    const cloud = new THREE.Group(); cloud.name = "cloud"; g.add(cloud);
    cloud.add(mesh(GEO.avalCloud, MAT.vcGloss, false));
    const pile = mesh(GEO.avalPile, MAT.vc); pile.name = "pile"; pile.receiveShadow = true; g.add(pile);
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5.2), new THREE.MeshBasicMaterial({ color: "#ff3b2f", transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    warn.rotation.x = -Math.PI / 2; warn.position.y = 0.02; warn.name = "warn"; g.add(warn);
    return g;
  },
  "enemy:mamut": () => makeActor("mamut", 1.38),
  "enemy:ayi": () => makeActor("kutup_ayisi", 1.3)
};
/** Kullanıcının yarık modelleri: kenarları yolda buz kütlesi, ortası delik (derin ya da buzlu su) */
function iceRift(name, water) {
  const g = new THREE.Group(); g.add(holeCutter(8, 2.32));
  const inner = new THREE.Group();
  const bot = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.32), new THREE.MeshBasicMaterial({ color: water ? "#0e5a96" : "#04142a" }));
  bot.rotation.x = -Math.PI / 2; bot.position.y = water ? -0.55 : -3; inner.add(bot);
  for (const sz of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ map: wallInTex })); w.position.set(0, -1.5, sz * 1.16); w.rotation.y = sz > 0 ? Math.PI : 0; inner.add(w); }
  g.add(inHole(inner));
  // model: x ekseni boyunca kıyı-su-kıyı → yola dik çevir; z (genişlik) yolu kaplasın
  const m = staticClone(name); const c = m.children[0];
  c.rotation.y = Math.PI / 2; c.scale.set(3.0, 3.5, 8.8); m.position.y = -0.1;
  m.traverse((o) => { if (o.isMesh) { o.renderOrder = 4; o.castShadow = false; o.receiveShadow = true; } });
  g.add(m); return g;
}
function crevasse(name) {
  const g = new THREE.Group(); g.add(holeCutter(8, 2.32));
  const m = H1[name].scene.clone(true);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; if (/duvar|dip/.test(o.name)) inHole(o, "deep"); else if (/_su$/.test(o.name)) inHole(o, "water"); else if (/yuzen/.test(o.name)) inHole(o); } });
  g.add(m); return g;
}
function buffFactory(key) {
  return () => {
    const [kind, model] = key.split("|");
    const b = BUFFS[kind], col = new THREE.Color(b.col);
    const g = new THREE.Group(), gem = new THREE.Group(); gem.name = "gem";
    const m = model === "kalp" ? makeHeart() : staticClone(model, 1.35 * (BUFF_SCALE[model] || 1)); gem.add(m); g.add(gem);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 5, 14, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.6; g.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.name = "ring"; g.add(ring);
    return g;
  };
}
/** Düşman animasyonu: koşu / saldırı */
function animEnemy(m, name, dt, { once = false, ts = 1 } = {}) {
  const a = m.userData.actor;
  if (a.cur !== name) playAnim(a, name, { once, ts, fade: 0.15 });
  else if (!once) a.curAction.timeScale = ts;
  a.mixer.update(dt);
  if (m.userData.straighten) straightenHead(m);
}
// Kutup ayısı animasyonlarında baş/boyun yana dönük: her karede başı gövde yönüne (+z) çevir
const _hInv = new THREE.Matrix4(), _hA = new THREE.Vector3(), _hB = new THREE.Vector3(), _hQ = new THREE.Quaternion(), _hP = new THREE.Quaternion(), _hR = new THREE.Quaternion(), _hY = new THREE.Vector3(0, 1, 0);
function straightenHead(m) {
  const u = m.userData;
  if (!u.hb) { u.hb = {}; m.traverse((o) => { if (o.isBone) u.hb[o.name] = o; }); }
  const { neck, head } = u.hb; if (!neck || !head) return;
  // Modelde kafa yana (+x) dönük yontulmuş: boyun + kafayı model uzayında Y ekseni etrafında geri çevir
  m.updateMatrixWorld(true);
  m.getWorldQuaternion(_hR).invert();
  for (const [b, ang] of [[neck, BEAR_FIX[0]], [head, BEAR_FIX[1]]]) {
    b.parent.getWorldQuaternion(_hP); _hP.premultiply(_hR);
    _hQ.setFromAxisAngle(_hY, ang);
    b.quaternion.premultiply(_hP.clone().invert().multiply(_hQ).multiply(_hP));
    b.updateMatrixWorld(true);
  }
}
const BEAR_FIX = [-0.5, -0.45];

// Bitiş: kıyı, bayraklı kapı, deniz ve buz kütleleri
const goal = new THREE.Group(); goal.visible = false; scene.add(goal);
{
  // Bitiş kapısı (taslağa göre): taş sütunlar, lacivert "FİNAL · BİTİŞ ÇİZGİSİ" pankartı, mavi bayraklar, damalı şerit
  const stone = ["#8d939b", "#7a8089", "#a1a6ad"];
  // cap: sütun tepesi ve dibindeki kapak rengi (Bölüm 1 kar, Bölüm 2 yosun)
  const gateParts = (cap) => {
    const parts = [];
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 7; i++) parts.push(P(jitter(new RoundedBoxGeometry(1.25 - (i % 2) * 0.12, 0.82, 1.15, 1, 0.12), 0.05, i + (sx > 0 ? 9 : 0)), stone[i % 3], { x: sx * 4.6 + (i % 2 ? 0.05 : -0.05), y: 0.41 + i * 0.8, ry: (i % 3) * 0.12 }));
      parts.push(P(jitter(new THREE.SphereGeometry(0.85, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0.06, 4), cap, { x: sx * 4.6, y: 5.95, sy: 0.45 }));
      parts.push(P(jitter(new THREE.SphereGeometry(0.75, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0.06, 5), cap, { x: sx * 4.6, y: 0.0, sx: 1.2, sy: 0.35, sz: 1.1 }));
      for (let k = 0; k < 5; k++) parts.push(P(new THREE.ConeGeometry(0.22, 0.6, 4), k % 2 ? "#3f9c3a" : "#2f8030", { x: sx * (4.0 + k * 0.28), y: 5.75 + (k % 2) * 0.12, z: 0.62, rz: sx * (0.9 + k * 0.15), rx: 0.4 }));
    }
    parts.push(P(new RoundedBoxGeometry(9.6, 0.38, 0.5, 1, 0.1), "#7a4f2c", { y: 6.15 }), P(new RoundedBoxGeometry(9.6, 0.32, 0.5, 1, 0.1), "#6a4426", { y: 4.15 }));
    return merge(parts);
  };
  const gate1 = mesh(gateParts("#f7fbff"), MAT.vc), gate2 = mesh(gateParts("#5f9e3c"), MAT.vc);
  gate2.visible = false; goal.add(gate1, gate2);
  // pankart ve bayrak dokuları (font yüklenince çizilir)
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 2.0), new THREE.MeshBasicMaterial({ color: "#0d2c66", side: THREE.DoubleSide })); banner.position.set(0, 5.15, 0.27); goal.add(banner);
  const flags = [];
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6, 1, 6), new THREE.MeshStandardMaterial({ color: "#1d4fa8", side: THREE.DoubleSide, roughness: 0.6 })); f.position.set(sx * 4.6, 2.9, 0.62); f.name = "flag"; goal.add(f); flags.push(f); }
  // damalı yer çizgisi + kopacak damalı şerit
  const chk = canvasTex(256, 64, (g, w, h) => { const n = 16, m = 4; for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { g.fillStyle = (i + j) % 2 ? "#111" : "#fafafa"; g.fillRect(i * w / n, j * h / m, w / n + 1, h / m + 1); } });
  chk.wrapS = THREE.RepeatWrapping;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.0), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.012; line.material.map.repeat.set(2, 1); goal.add(line);
  const tapeTex = chk.clone(); tapeTex.needsUpdate = true; tapeTex.repeat.set(4, 1);
  const tape = new THREE.Group(); tape.name = "tape"; goal.add(tape);
  for (const sx of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(4.0, 0.32, 12, 1);
    const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setY(i, pos.getY(i) - 0.25 * (1 - Math.pow((x + 2 * sx) / 4, 2))); }
    const half = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tapeTex, side: THREE.DoubleSide, roughness: 0.6 }));
    const piv = new THREE.Group(); piv.position.set(sx * 4.0, 1.35, 0.1); half.position.x = -sx * 2.0; piv.add(half); piv.name = "tapeHalf"; piv.userData.sx = sx; tape.add(piv);
  }
  goal.userData.drawBanner = () => {
    const ct = canvasTex(2048, 488, (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#1b4fa8"); bg.addColorStop(1, "#0a2458"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
      for (const yy of [0, h - 46]) for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? "#101010" : "#f6f6f6"; g.fillRect(i * w / 64, yy + j * 23, w / 64 + 1, 23); }
      g.strokeStyle = "#f2c53a"; g.lineWidth = 10; g.strokeRect(10, 52, w - 20, h - 104);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = '80px "Titan TR"'; g.lineJoin = "round";
      g.lineWidth = 18; g.strokeStyle = "#3d1600"; g.strokeText("FİNAL", w / 2, 128);
      g.fillStyle = "#ffd23a"; g.fillText("FİNAL", w / 2, 128);
      g.font = '200px "Titan TR"';
      g.lineWidth = 34; g.strokeStyle = "#3d1600"; g.strokeText("BİTİŞ ÇİZGİSİ", w / 2, 300);
      const gr = g.createLinearGradient(0, 210, 0, 390); gr.addColorStop(0, "#fff6a0"); gr.addColorStop(0.45, "#ffcf2e"); gr.addColorStop(1, "#ff7a00");
      g.fillStyle = gr; g.fillText("BİTİŞ ÇİZGİSİ", w / 2, 300);
    }, { wrap: false });
    banner.material.map = ct; banner.material.color.set("#ffffff"); banner.material.needsUpdate = true;
    const ft = canvasTex(256, 512, (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, w, 0); bg.addColorStop(0, "#123d8c"); bg.addColorStop(0.5, "#2263c4"); bg.addColorStop(1, "#123d8c"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? "#111" : "#f5f5f5"; g.fillRect(i * w / 8, j * 24, w / 8 + 1, 24); }
      g.strokeStyle = "#f2c53a"; g.lineWidth = 10; g.strokeRect(14, 60, w - 28, h - 80);
      g.fillStyle = "#ffcf2e"; g.strokeStyle = "#5a2a00"; g.lineWidth = 6;
      for (const yy of [210, 320]) { g.beginPath(); g.moveTo(w / 2, yy - 70); g.lineTo(w / 2 + 70, yy + 20); g.lineTo(w / 2 + 28, yy); g.lineTo(w / 2, yy + 60); g.lineTo(w / 2 - 28, yy); g.lineTo(w / 2 - 70, yy + 20); g.closePath(); g.fill(); g.stroke(); }
    }, { wrap: false });
    for (const f of flags) { f.material.map = ft; f.material.color.set("#ffffff"); f.material.needsUpdate = true; }
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 300), new THREE.MeshStandardMaterial({ color: "#2b86d3", roughness: 0.12, metalness: 0.1, envMapIntensity: 1.4 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.04, -154); sea.receiveShadow = true; goal.add(sea);
  for (let i = 0; i < 9; i++) {
    const fl = mesh(P(jitter(new THREE.CylinderGeometry(1, 1.15, 0.5, 7), 0.12, i), "#f4f9ff", { s: 1 }), MAT.vc);
    fl.position.set((rnd() - 0.5) * 50, 0.1, -10 - rnd() * 70); fl.scale.setScalar(1 + rnd() * 2.5); fl.rotation.y = rnd() * 6; fl.name = "floe"; goal.add(fl);
  }
  goal.userData.setTheme = (n) => {
    gate1.visible = n === 1; gate2.visible = n === 2; sea.visible = n === 1;
    goal.children.forEach((c) => { if (c.name === "floe") c.visible = n === 1; });
  };
}

// =====================================================================================
//  BÖLÜM 2 · BATAKLIK FELAKETİ
//  Yer tutucu modeller: hepsi kodla üretilir. Kullanıcının Meshy modelleri gelince
//  FACTORY içindeki ilgili satır staticClone("model_adi") ile değiştirilecek.
// =====================================================================================
const SW = {};
// çamurlu patika
SW.roadTex = canvasTex(512, 1024, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, "#3f5a26"); gr.addColorStop(0.05, "#5e4a26"); gr.addColorStop(0.12, "#7d5c30"); gr.addColorStop(0.5, "#94703c"); gr.addColorStop(0.88, "#7d5c30"); gr.addColorStop(0.95, "#5e4a26"); gr.addColorStop(1, "#3f5a26");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) {
    const x = rnd() * w, y = rnd() * h, r = 14 + rnd() * 60, dark = rnd() < 0.55;
    wrapDraw(w, h, x, y, (X, Y) => { const c = g.createRadialGradient(X, Y, 0, X, Y, r);
      c.addColorStop(0, dark ? "rgba(60,38,16,.35)" : "rgba(196,156,96,.22)"); c.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = c; g.fillRect(X - r, Y - r, r * 2, r * 2); });
  }
  // küçük su birikintileri
  for (let i = 0; i < 9; i++) {
    const x = 60 + rnd() * (w - 120), y = rnd() * h, rx = 16 + rnd() * 26, ry = 26 + rnd() * 40;
    wrapDraw(w, h, x, y, (X, Y) => { g.fillStyle = "rgba(48,70,40,.55)"; g.beginPath(); g.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(170,220,200,.35)"; g.beginPath(); g.ellipse(X - rx * 0.3, Y - ry * 0.3, rx * 0.35, ry * 0.18, 0, 0, Math.PI * 2); g.fill(); });
  }
  // ayak izi gibi çukurlar, çakıllar
  for (let i = 0; i < 260; i++) { const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 3.5; g.fillStyle = rnd() < 0.5 ? "rgba(70,48,22,.6)" : "rgba(214,184,130,.55)"; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // kenarlarda çimen tutamları
  g.lineWidth = 2;
  for (let i = 0; i < 220; i++) {
    const side = rnd() < 0.5, x = side ? rnd() * w * 0.1 : w - rnd() * w * 0.1, y = rnd() * h;
    g.strokeStyle = ["#4f8f3a", "#6aa84a", "#3b7a2e"][i % 3]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 10, y - 8 - rnd() * 12); g.stroke();
  }
  // şerit çizgileri: kurumuş açık çamur + taşlar
  for (const u of [0.5 - 1.15 / ROAD_W, 0.5 + 1.15 / ROAD_W]) {
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = "rgba(226,196,140,.5)"; g.beginPath(); g.ellipse(u * w, y + 22, 4.5, 12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(150,150,140,.8)"; g.beginPath(); g.ellipse(u * w + (rnd() - 0.5) * 6, y + 48, 4.5, 3.5, 0, 0, Math.PI * 2); g.fill();
    }
  }
});
SW.roadTex.wrapS = THREE.ClampToEdgeWrapping; SW.roadTex.repeat.set(1, 20);
// turkuaz bataklık suyu
SW.waterTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#2f9c8c"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * w, y = rnd() * h, r = 12 + rnd() * 40, a = rnd() < 0.5;
    wrapDraw(w, h, x, y, (X, Y) => { const c = g.createRadialGradient(X, Y, 0, X, Y, r); c.addColorStop(0, a ? "rgba(30,90,70,.35)" : "rgba(120,200,170,.28)"); c.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = c; g.fillRect(X - r, Y - r, r * 2, r * 2); });
  }
  g.strokeStyle = "rgba(220,255,240,.35)"; g.lineWidth = 1.4;
  for (let i = 0; i < 40; i++) { const x = rnd() * w, y = rnd() * h, l = 6 + rnd() * 14; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 2, x + l, y); g.stroke(); }
  // su mercimeği
  for (let i = 0; i < 200; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(120,190,70,.75)" : "rgba(90,160,60,.6)"; const x = rnd() * w, y = rnd() * h; g.beginPath(); g.arc(x, y, 1 + rnd() * 1.6, 0, Math.PI * 2); g.fill(); }
});
SW.waterTex.repeat.set(26, 40);
SW.waterMat = new THREE.MeshStandardMaterial({ map: SW.waterTex, roughness: 0.12, metalness: 0.05, envMapIntensity: 1.1 });
// set kenarı: çimenli çamur
SW.bankTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#5c8f3a"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { const x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 30, m = rnd() < 0.4;
    wrapDraw(w, h, x, y, (X, Y) => { const c = g.createRadialGradient(X, Y, 0, X, Y, r); c.addColorStop(0, m ? "rgba(110,80,40,.5)" : "rgba(140,190,80,.4)"); c.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = c; g.fillRect(X - r, Y - r, r * 2, r * 2); }); }
  g.lineWidth = 1.5; for (let i = 0; i < 300; i++) { const x = rnd() * w, y = rnd() * h; g.strokeStyle = ["#3f7a2a", "#7fbf4f", "#2f6a24"][i % 3]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y - 5 - rnd() * 7); g.stroke(); }
});
SW.bankTex.repeat.set(2, 40);
SW.mudTex = canvasTex(256, 512, (g, w, h) => {
  // düzensiz koyu çamur birikintisi (kenarları saydam)
  g.save(); g.translate(w / 2, h / 2);
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2, rr = 1 - k * 0.18 + Math.sin(a * 3 + k) * 0.06 + Math.sin(a * 7 + k * 2) * 0.04; const x = Math.cos(a) * (w / 2 - 6) * rr, y = Math.sin(a) * (h / 2 - 6) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fillStyle = ["#6a4a24", "#4a3014", "#3a240e"][k]; g.fill();
  }
  g.restore();
  for (let i = 0; i < 14; i++) { const x = w * 0.25 + rnd() * w * 0.5, y = h * 0.15 + rnd() * h * 0.7; g.fillStyle = "rgba(255,240,210,.22)"; g.beginPath(); g.ellipse(x, y, 4 + rnd() * 8, 2 + rnd() * 3, 0, 0, Math.PI * 2); g.fill(); }
}, { wrap: false });
SW.mudMat = new THREE.MeshStandardMaterial({ map: SW.mudTex, transparent: true, depthWrite: false, roughness: 0.38, metalness: 0, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
SW.puddleTex = canvasTex(256, 256, (g, w, h) => {
  const c = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  c.addColorStop(0, "#1d5a52"); c.addColorStop(0.7, "#2c7f72"); c.addColorStop(0.86, "#4d6a34"); c.addColorStop(1, "rgba(77,106,52,0)");
  g.fillStyle = c; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) { g.fillStyle = "rgba(120,190,70,.8)"; const a = rnd() * 6.28, r = rnd() * w * 0.38; g.beginPath(); g.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 1.5 + rnd() * 2, 0, Math.PI * 2); g.fill(); }
}, { wrap: false });
SW.puddleMat = new THREE.MeshStandardMaterial({ map: SW.puddleTex, transparent: true, depthWrite: false, roughness: 0.06, envMapIntensity: 1.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
SW.ditchWater = new THREE.MeshStandardMaterial({ color: "#2a8f80", map: SW.waterTex, roughness: 0.08, envMapIntensity: 1.3 });
SW.ditchWall = new THREE.MeshStandardMaterial({ color: "#3a2812", roughness: 0.9 });
MAT.vcWet = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.42, metalness: 0, envMapIntensity: 1.1 });

// Bataklık ufku: sis içinde ağaç sıraları ve uzakta tüten yanardağ (kodla çizilir, kullanıcı görseli gelince değişecek)
const swampBand = new THREE.Group(); swampBand.visible = false; scene.add(swampBand);
{
  const tex = canvasTex(2048, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // yanardağ (ortada)
    const vx = w * 0.5, vb = h * 0.82;
    g.fillStyle = "rgba(255,170,90,.18)"; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(vx + (k - 2.5) * 22, h * 0.2 - k * 18, 40 + k * 14, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "rgba(110,100,110,.55)"; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(vx + Math.sin(k) * 30 + k * 10, h * 0.28 - k * 26, 30 + k * 10, 0, Math.PI * 2); g.fill(); }
    const vg = g.createLinearGradient(0, h * 0.3, 0, vb); vg.addColorStop(0, "#6e5a62"); vg.addColorStop(1, "#8e8a86");
    g.fillStyle = vg; g.beginPath(); g.moveTo(vx - 360, vb); g.lineTo(vx - 70, h * 0.36); g.lineTo(vx + 60, h * 0.35); g.lineTo(vx + 380, vb); g.closePath(); g.fill();
    g.strokeStyle = "#ff7a2a"; g.lineWidth = 7; g.beginPath(); g.moveTo(vx - 10, h * 0.36); g.lineTo(vx - 30, h * 0.48); g.lineTo(vx - 12, h * 0.58); g.stroke();
    g.fillStyle = "#ffb04a"; g.beginPath(); g.ellipse(vx - 5, h * 0.355, 66, 10, 0, 0, Math.PI * 2); g.fill();
    // ağaç sıraları (uzaktan yakına)
    const rows = [[0.62, "#9cb88c", 26, 0.12], [0.7, "#6f9a66", 34, 0.16], [0.78, "#4a7a46", 44, 0.2]];
    for (const [yb, col, rr, hv] of rows) {
      g.fillStyle = col;
      for (let x = -40; x < w + 40; x += rr * 0.9) {
        const th = h * (hv + rnd() * 0.08), cx = x + (rnd() - 0.5) * 10;
        wrapDraw(w, 0, cx, 0, (X) => {
          g.fillRect(X - 3, h * yb - th, 6, th);
          for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(X + (rnd() - 0.5) * rr, h * yb - th + (rnd() - 0.2) * rr * 0.6, rr * (0.55 + rnd() * 0.35), 0, Math.PI * 2); g.fill(); }
        });
      }
      g.fillRect(0, h * yb - 6, w, h - h * yb + 6);
    }
    // alçak sis
    const mist = g.createLinearGradient(0, h * 0.68, 0, h); mist.addColorStop(0, "rgba(232,230,166,0)"); mist.addColorStop(0.5, "rgba(232,230,166,.65)"); mist.addColorStop(1, "rgba(232,230,166,.95)");
    g.fillStyle = mist; g.fillRect(0, h * 0.6, w, h * 0.4);
  });
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const R = 300, H = (2 * Math.PI * R) / 3 / 4;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  band.position.y = H / 2 - 30; band.renderOrder = -1; // u=0.5 (yanardağ) tam karşıda
  swampBand.add(band);
}

// --- yer tutucu geometriler (köşe renkli, low-poly)
/** z boyunca öne doğru incelt (+z ucu tw kat, yükseklik th kat) */
function taper(geo, tw, th = 1) {
  geo.computeBoundingBox(); const bb = geo.boundingBox, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = (p.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z || 1); p.setX(i, p.getX(i) * lerp(1, tw, k)); p.setY(i, p.getY(i) * lerp(1, th, k)); }
  geo.computeVertexNormals(); return geo;
}
function mangroveGeo(v) {
  const bark = ["#5a4128", "#6b4c2e"][v], leaf = v ? ["#3f7d3a", "#4f8f3f", "#5fa04a"] : ["#356f35", "#43803c", "#5a9845"];
  const parts = [P(jitter(new THREE.CylinderGeometry(0.28, 0.42, 4.2, 7), 0.05, v + 1), bark, { y: 2.6 })];
  // kavisli kökler
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + v; parts.push(P(new THREE.CylinderGeometry(0.07, 0.11, 1.9, 5), bark, { x: Math.cos(a) * 0.55, y: 0.75, z: Math.sin(a) * 0.55, rx: Math.sin(a) * 0.55, rz: -Math.cos(a) * 0.55 })); }
  // dallar + taç
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + v; parts.push(P(new THREE.CylinderGeometry(0.07, 0.12, 1.6, 5), bark, { x: Math.cos(a) * 0.5, y: 4.4, z: Math.sin(a) * 0.5, rx: Math.sin(a) * 0.8, rz: -Math.cos(a) * 0.8 })); }
  const blobs = [[0, 5.6, 0, 1.7], [1.2, 5.1, 0.3, 1.2], [-1.1, 5.2, -0.4, 1.25], [0.2, 5.0, 1.1, 1.1], [-0.3, 5.1, -1.2, 1.1], [0.3, 6.4, -0.2, 1.1]];
  blobs.forEach(([x, y, z, r], i) => parts.push(P(jitter(new THREE.IcosahedronGeometry(r, 1), 0.12, i + v * 7), leaf[i % 3], { x, y, z, sy: 0.72 })));
  // sarkan yosun
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + v; parts.push(P(new THREE.ConeGeometry(0.08, 1.3 + (i % 3) * 0.4, 4), "#9cb65e", { x: Math.cos(a) * 1.4, y: 4.2 - (i % 3) * 0.2, z: Math.sin(a) * 1.4, rx: Math.PI })); }
  return merge(parts);
}
GEO.mangrove0 = mangroveGeo(0); GEO.mangrove1 = mangroveGeo(1);
GEO.cypress = merge([
  P(jitter(new THREE.CylinderGeometry(0.22, 0.75, 7.5, 7), 0.06, 3), "#6b5236", { y: 3.75 }),
  ...[0, 1, 2, 3].map((i) => P(jitter(new THREE.IcosahedronGeometry(1.0 - i * 0.15, 1), 0.1, i + 20), ["#4a7a3e", "#3f6f36", "#5a8a46"][i % 3], { x: (i % 2 ? 0.5 : -0.4), y: 5.4 + i * 0.9, z: (i % 2 ? -0.3 : 0.3), sy: 0.6 })),
  ...[0, 1, 2, 3, 4].map((i) => P(new THREE.ConeGeometry(0.07, 1.4, 4), "#a3b86a", { x: Math.cos(i * 1.3) * 0.9, y: 5.0 + (i % 2) * 0.6, z: Math.sin(i * 1.3) * 0.9, rx: Math.PI }))
]);
GEO.reeds = merge([
  ...Array.from({ length: 9 }, (_, i) => P(new THREE.CylinderGeometry(0.025, 0.04, 1.4 + (i % 4) * 0.35, 4), i % 2 ? "#6a9a3a" : "#82b04a", { x: Math.cos(i * 2.3) * 0.35, y: 0.7 + (i % 4) * 0.17, z: Math.sin(i * 2.3) * 0.35, rz: Math.cos(i) * 0.12 })),
  ...Array.from({ length: 4 }, (_, i) => P(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 6), "#6b3f1e", { x: Math.cos(i * 2.3 * 2) * 0.35, y: 1.6 + (i % 4) * 0.35, z: Math.sin(i * 2.3 * 2) * 0.35 })),
  ...Array.from({ length: 6 }, (_, i) => P(new THREE.ConeGeometry(0.08, 1.0, 3), "#5f9a38", { x: Math.cos(i * 1.1) * 0.25, y: 0.5, z: Math.sin(i * 1.1) * 0.25, rz: Math.cos(i * 1.1) * 0.35, rx: Math.sin(i * 1.1) * 0.35 }))
]);
GEO.lily = merge([
  ...[[0, 0, 0.75], [1.1, 0.5, 0.55], [-0.9, 0.7, 0.6], [0.4, -1.0, 0.5]].map(([x, z, r], i) => P(new THREE.CylinderGeometry(r, r, 0.04, 14, 1, false, 0.3, Math.PI * 1.8), i % 2 ? "#4f9a3a" : "#5fae44", { x, y: 0.03, z, ry: i * 1.7 })),
  ...Array.from({ length: 6 }, (_, i) => P(new THREE.ConeGeometry(0.1, 0.3, 4), "#ff8ab4", { x: 0.15 + Math.cos(i * 1.05) * 0.1, y: 0.18, z: 0.1 + Math.sin(i * 1.05) * 0.1, rz: Math.cos(i * 1.05) * 0.6, rx: -Math.sin(i * 1.05) * 0.6 })),
  P(new THREE.SphereGeometry(0.07, 6, 4), "#ffd23a", { x: 0.15, y: 0.2, z: 0.1 })
]);
GEO.stump = merge([
  P(jitter(new THREE.CylinderGeometry(0.55, 0.7, 1.0, 8), 0.06, 30), "#6b4a2a", { y: 0.5 }),
  P(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 8), "#c79a5e", { y: 1.01 }),
  P(jitter(new THREE.SphereGeometry(0.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.05, 31), "#5a9a3a", { y: 0.9, sx: 0.9, sy: 0.35, sz: 0.7, x: -0.1 }),
  P(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), "#ff8a2a", { x: 0.5, y: 0.45, z: 0.2, sy: 0.5 })
]);
// yosunlu kütük (zıpla): üst kenarı ~0.88 m
GEO.mlog = merge([
  P(jitter(new THREE.CylinderGeometry(0.42, 0.44, 2.1, 10), 0.03, 40), "#6b4a2a", { y: 0.42, rz: Math.PI / 2 }),
  P(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 10), "#d4a868", { x: 1.06, y: 0.42, rz: Math.PI / 2 }),
  P(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 10), "#d4a868", { x: -1.06, y: 0.42, rz: Math.PI / 2 }),
  P(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 10), "#a8763e", { x: 1.075, y: 0.42, rz: Math.PI / 2 }),
  P(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 10), "#a8763e", { x: -1.075, y: 0.42, rz: Math.PI / 2 }),
  P(jitter(new THREE.CylinderGeometry(0.45, 0.45, 1.7, 10, 1, true, -Math.PI / 2.4, Math.PI / 1.2), 0.04, 41), "#5fa03e", { y: 0.46, rz: Math.PI / 2, sx: 1.04, sz: 1.04 }),
  P(new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), "#ff8a2a", { x: 0.6, y: 0.8, z: 0.22, sy: 0.6 }),
  P(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), "#ffd23a", { x: -0.4, y: 0.82, z: 0.25, sy: 0.6 }),
  P(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 5), "#6b4a2a", { x: 0.3, y: 0.85, z: -0.1, rz: 0.6 })
]);
// sarkan dal + sarmaşık (kay): sarmaşıkların ucu ~1.25 m
GEO.vine = merge([
  P(jitter(new THREE.CylinderGeometry(0.2, 0.3, 3.5, 7), 0.04, 50), "#5a4128", { x: -1.2, y: 1.75 }),
  P(jitter(new THREE.CylinderGeometry(0.2, 0.3, 3.5, 7), 0.04, 51), "#5a4128", { x: 1.2, y: 1.75 }),
  P(jitter(new THREE.CylinderGeometry(0.2, 0.24, 2.9, 7), 0.03, 52), "#6b4c2e", { y: 2.85, rz: Math.PI / 2 }),
  ...Array.from({ length: 4 }, (_, i) => P(jitter(new THREE.IcosahedronGeometry(0.55, 1), 0.08, 53 + i), ["#3f7d3a", "#4f8f3f", "#5fa04a"][i % 3], { x: -1.2 + i * 0.8, y: 3.2, z: (i % 2 ? 0.2 : -0.2), sy: 0.6 })),
  ...Array.from({ length: 9 }, (_, i) => P(new THREE.CylinderGeometry(0.035, 0.035, 1.55 - (i % 3) * 0.12, 4), "#4f8f3a", { x: -1.0 + i * 0.25, y: 2.05 + (i % 3) * 0.06, z: (i % 2 ? 0.12 : -0.08) })),
  ...Array.from({ length: 18 }, (_, i) => P(new THREE.TetrahedronGeometry(0.11, 0), i % 2 ? "#6abf4a" : "#4fa03a", { x: -1.0 + (i % 9) * 0.25, y: 1.35 + Math.floor(i / 9) * 0.6 + (i % 3) * 0.08, z: (i % 2 ? 0.14 : -0.06), sx: 1.6, sz: 0.5 })),
  ...Array.from({ length: 4 }, (_, i) => P(new THREE.ConeGeometry(0.09, 0.2, 5), "#ff8ab4", { x: -0.85 + i * 0.6, y: 1.3, z: 0.12, rx: Math.PI }))
]);
// dev ağaç gövdesi (şerit değiştir)
GEO.trunk = merge([
  P(jitter(new THREE.CylinderGeometry(0.82, 1.0, 3.6, 10), 0.06, 60), "#5e4228", { y: 1.8 }),
  ...Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + 0.3; return P(jitter(new THREE.ConeGeometry(0.32, 1.4, 5), 0.04, 61 + i), "#6b4c2e", { x: Math.cos(a) * 0.9, y: 0.35, z: Math.sin(a) * 0.9, rx: Math.sin(a) * 1.2, rz: -Math.cos(a) * 1.2 }); }),
  P(jitter(new THREE.CylinderGeometry(0.84, 0.84, 1.6, 10, 1, true, 0.4, 2.4), 0.05, 68), "#5fa03e", { y: 1.4, sx: 1.03, sz: 1.03 }),
  ...[[0, 4.4, 0, 1.4], [0.9, 3.9, 0.4, 1.0], [-0.9, 4.0, -0.3, 1.05], [0.2, 4.0, -0.9, 0.9]].map(([x, y, z, r], i) => P(jitter(new THREE.IcosahedronGeometry(r, 1), 0.12, 70 + i), ["#3f7d3a", "#4f8f3f", "#5fa04a"][i % 3], { x, y, z, sy: 0.75 })),
  ...Array.from({ length: 5 }, (_, i) => P(new THREE.ConeGeometry(0.07, 1.1, 4), "#9cb65e", { x: Math.cos(i * 1.4) * 1.0, y: 3.3, z: 0.5 + Math.sin(i * 1.4) * 0.4, rx: Math.PI }))
]);
GEO.board = [0, 1].map((i) => P(new RoundedBoxGeometry(2.25, 0.12, 0.5, 1, 0.04), i ? "#9a6a3a" : "#a8763e"));
GEO.boardRot = [0, 1].map((i) => merge([P(new RoundedBoxGeometry(2.25, 0.12, 0.5, 1, 0.04), i ? "#5a4a34" : "#4f4232"),
  P(new THREE.BoxGeometry(0.5, 0.02, 0.3), "#5f9a3a", { x: -0.5 + i * 0.8, y: 0.065, z: 0.05 }), P(new THREE.BoxGeometry(0.04, 0.025, 0.42), "#1f1a12", { x: 0.3 - i * 0.6, y: 0.066 })]));
GEO.rail = merge([
  P(new THREE.CylinderGeometry(0.09, 0.1, 1.3, 6), "#6b4a2a", { z: -1.3, y: 0.35 }), P(new THREE.CylinderGeometry(0.09, 0.1, 1.3, 6), "#6b4a2a", { z: 1.3, y: 0.35 }),
  P(new THREE.CylinderGeometry(0.035, 0.035, 2.7, 5), "#c9a66b", { y: 0.95, rx: Math.PI / 2 })
]);

// --- timsah (yer tutucu): baş +z yönünde. Parçalar: gövde, kuyruk, kafa, alt çene
function crocParts(boss) {
  const G = boss ? "#46743a" : "#5a9a3e", D = boss ? "#2f5228" : "#3c7330", B = boss ? "#c2bb7e" : "#d6e08e", W = "#fffbe8", K = "#151515", M = "#ff7b8a";
  const body = [], tail = [], head = [], jaw = [];
  body.push(P(jitter(new THREE.SphereGeometry(1, 14, 9), 0.03, 1), G, { y: 0.44, sx: 0.62, sy: 0.34, sz: 1.1 }));
  body.push(P(new THREE.SphereGeometry(1, 12, 7), B, { y: 0.36, sx: 0.55, sy: 0.25, sz: 0.98 }));
  for (let i = -4; i <= 4; i++) for (const sx of [-1, 1]) body.push(P(new THREE.ConeGeometry(0.07, 0.17, 4), D, { x: sx * 0.17, y: 0.77 - Math.abs(i) * 0.014, z: i * 0.22 }));
  for (const [lx, lz] of [[1, 0.55], [-1, 0.55], [1, -0.6], [-1, -0.6]]) {
    body.push(P(new THREE.CylinderGeometry(0.11, 0.13, 0.42, 6), G, { x: lx * 0.6, y: 0.2, z: lz, rz: lx * 0.5 }));
    body.push(P(new THREE.SphereGeometry(0.15, 8, 5), D, { x: lx * 0.72, y: 0.04, z: lz + 0.08, sy: 0.4, sz: 1.3 }));
  }
  const tg = new THREE.ConeGeometry(0.36, 2.1, 8, 3); tg.rotateX(-Math.PI / 2); tg.translate(0, 0, -1.0);
  tail.push(P(tg, G, { sy: 0.72 }));
  for (let i = 0; i < 7; i++) tail.push(P(new THREE.ConeGeometry(0.06 - i * 0.005, 0.15, 4), D, { y: 0.24 - i * 0.032, z: -0.15 - i * 0.27 }));
  const up = new THREE.BoxGeometry(0.56, 0.24, 1.3, 1, 1, 3); up.translate(0, 0, 0.65); taper(up, 0.55, 0.75);
  head.push(P(up, G));
  head.push(P(new THREE.SphereGeometry(1, 10, 6), G, { y: 0.06, z: 0.12, sx: 0.32, sy: 0.2, sz: 0.36 }));
  for (const sx of [-1, 1]) {
    head.push(P(new THREE.SphereGeometry(0.12, 10, 7), D, { x: sx * 0.17, y: 0.2, z: 0.14 }));
    head.push(P(new THREE.SphereGeometry(0.1, 10, 7), W, { x: sx * 0.17, y: 0.24, z: 0.2 }));
    head.push(P(new THREE.SphereGeometry(0.05, 8, 5), K, { x: sx * 0.18, y: 0.27, z: 0.28 }));
    head.push(P(new THREE.SphereGeometry(0.045, 6, 4), D, { x: sx * 0.07, y: 0.09, z: 1.22 }));
    for (let i = 0; i < 7; i++) head.push(P(new THREE.ConeGeometry(0.035, 0.11, 4), W, { x: sx * (0.25 - i * 0.022), y: -0.15, z: 0.2 + i * 0.15, rx: Math.PI }));
  }
  head.push(P(new THREE.BoxGeometry(0.42, 0.02, 1.0), M, { y: -0.125, z: 0.62 }));
  const lo = new THREE.BoxGeometry(0.52, 0.14, 1.25, 1, 1, 3); lo.translate(0, 0, 0.62); taper(lo, 0.55, 0.8);
  jaw.push(P(lo, B));
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) jaw.push(P(new THREE.ConeGeometry(0.032, 0.1, 4), W, { x: sx * (0.22 - i * 0.02), y: 0.1, z: 0.25 + i * 0.15 }));
  jaw.push(P(new THREE.BoxGeometry(0.3, 0.03, 0.7), M, { y: 0.075, z: 0.5 }));
  return { body, tail, head, jaw };
}
const CROC_GEO = {};
function makeCroc(boss = false, s = 1) {
  const k = boss ? "b" : "n";
  if (!CROC_GEO[k]) { const p = crocParts(boss); CROC_GEO[k] = { body: merge(p.body), tail: merge(p.tail), head: merge(p.head), jaw: merge(p.jaw) }; }
  const G = CROC_GEO[k], root = new THREE.Group(), inner = new THREE.Group(); inner.scale.setScalar(s); root.add(inner);
  inner.add(mesh(G.body, MAT.vcWet));
  const tail = new THREE.Group(); tail.position.set(0, 0.44, -0.95); tail.add(mesh(G.tail, MAT.vcWet)); inner.add(tail);
  const head = new THREE.Group(); head.position.set(0, 0.46, 0.95); head.add(mesh(G.head, MAT.vcWet)); inner.add(head);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1, 0.02); jaw.add(mesh(G.jaw, MAT.vcWet)); head.add(jaw);
  root.userData.croc = { inner, tail, head, jaw };
  return root;
}
/** Kullanıcının timsah modeli (iskeletsiz): baş +z. poseCroc ile sallanma/atılma */
function makeCrocModel(s) {
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
  const m = H1.timsah.scene.clone(true); m.scale.setScalar(s); m.position.y = 0.19 * s; m.rotation.y = CROC_YAW;
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  inner.add(m);
  const dummy = () => new THREE.Group();
  root.userData.croc = { inner, tail: dummy(), head: dummy(), jaw: dummy(), model: true };
  return root;
}
const CROC_YAW = 0;
/** Timsah duruşu: open 0..1 (ağız), walk 0..1 (koşu sallanması) */
function poseCroc(m, t, { open = 0, walk = 0, sway = 1 } = {}) {
  const c = m.userData.croc;
  if (c.model) { c.inner.rotation.x = -open * 0.08; c.inner.rotation.y = Math.sin(t * (walk ? 10 : 3)) * (walk ? 0.1 : 0.05) * sway; c.inner.position.y = Math.abs(Math.sin(t * 10)) * 0.07 * walk; return; }
  c.jaw.rotation.x = open * 0.8; c.head.rotation.x = -open * 0.28;
  c.tail.rotation.y = Math.sin(t * (walk ? 10 : 3)) * 0.35 * sway;
  c.inner.rotation.y = Math.sin(t * 10) * 0.07 * walk; c.inner.position.y = Math.abs(Math.sin(t * 10)) * 0.07 * walk;
}
const setOrder = (o, n) => { o.traverse((c) => { if (c.isMesh) c.renderOrder = n; }); return o; };

Object.assign(FACTORY, {
  // kullanıcının bataklık modelleri: Elderwood ağacı, tropik ağaç, nilüfer yaprağı, monstera
  mangrove0: () => { const g = staticClone("b_agac1", 4.2); g.children[0].position.y = 0.885 * 4.2; return g; },
  mangrove1: () => { const g = staticClone("b_agac2", 3.6); g.children[0].position.y = 0.96 * 3.6; return g; },
  cypress: () => { const g = staticClone("b_agac1", 5.2); g.children[0].position.y = 0.885 * 5.2; g.children[0].rotation.y = 2.4; return g; },
  reeds: () => mesh(GEO.reeds, MAT.vc, false),
  lily: () => { const g = staticClone("nilufer", 1.1); g.children[0].position.y = 0.05; g.traverse((o) => { if (o.isMesh) o.castShadow = false; }); return g; },
  monstera: () => { const g = staticClone("monstera", 1.0); g.children[0].position.y = 0.8; g.children[0].rotation.x = -0.35; return g; },
  stump: () => mesh(GEO.stump, MAT.vc),
  mlog: () => mesh(GEO.mlog, MAT.vc),
  vine: () => mesh(GEO.vine, MAT.vc),
  trunk: () => mesh(GEO.trunk, MAT.vc),
  // çamur birikintisi: üstünde kabarcıklar
  mud: () => {
    const g = new THREE.Group();
    // kullanıcının bataklık çamur çukuru modeli, şeride yayılmış
    const pit = staticClone("camur"); pit.children[0].scale.set(2.4 / 1.9, 0.5, 5.2 / 1.9); pit.position.y = -0.06;
    pit.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } }); g.add(pit);
    const bub = [];
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), MAT.vcWet.clone()); b.material.vertexColors = false; b.material.color.set("#7a5a32");
      b.position.set((rnd() - 0.5) * 1.0, 0.14, (rnd() - 0.5) * 3.0); b.userData.ph = rnd() * 6; g.add(b); bub.push(b); }
    g.userData.bub = bub; return g;
  },
  // pusudaki timsah: su birikintisi + dalga halkaları + timsah
  croc: () => {
    const g = new THREE.Group();
    const pd = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.9), SW.puddleMat); pd.rotation.x = -Math.PI / 2; pd.position.y = 0.012; g.add(pd);
    for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 28), new THREE.MeshBasicMaterial({ color: "#e8fff6", transparent: true, opacity: 0.6, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.02; r.name = "rip" + i; g.add(r); }
    const c = makeCrocModel(1.55); c.name = "croc"; g.add(c);
    return g;
  },
  // çürük tahta köprü: altı bataklık suyu (bir şerit)
  plank: () => {
    const g = new THREE.Group(); g.add(holeCutter(2.3, 3.0));
    const inner = new THREE.Group();
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.0), SW.ditchWater); w.rotation.x = -Math.PI / 2; w.position.y = -0.55; inner.add(w);
    for (const sz of [-1, 1]) { const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.6), SW.ditchWall); wall.position.set(0, -0.28, sz * 1.5); wall.rotation.y = sz > 0 ? Math.PI : 0; inner.add(wall); }
    g.add(inHole(inner));
    const boards = [];
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(GEO.board[i % 2], MAT.vc); b.castShadow = true; b.receiveShadow = true; b.renderOrder = 4;
      const base = new THREE.Vector3((i % 2 ? 0.03 : -0.03), 0.06, -1.3 + i * 0.52); b.position.copy(base); g.add(b); boards.push({ o: b, base, ry: (i % 3 - 1) * 0.03, v: 0, spin: (rnd() - 0.5) * 4 }); }
    const rl = mesh(GEO.rail, MAT.vc); rl.position.x = -1.12; rl.name = "railL"; const rr = mesh(GEO.rail, MAT.vc); rr.position.x = 1.12; rr.name = "railR"; g.add(rl, rr);
    g.userData.boards = boards; return g;
  },
  // üç şeridi kesen bataklık hendeği (zıpla)
  ditch: () => {
    const g = new THREE.Group(); g.add(holeCutter(8, 2.32));
    const inner = new THREE.Group();
    const w = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.32), SW.ditchWater); w.rotation.x = -Math.PI / 2; w.position.y = -0.6; inner.add(w);
    for (const sz of [-1, 1]) { const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.7), SW.ditchWall); wall.position.set(0, -0.32, sz * 1.16); wall.rotation.y = sz > 0 ? Math.PI : 0; inner.add(wall); }
    g.add(inHole(inner));
    for (const sz of [-1, 1]) { const lip = mesh(P(jitter(new THREE.CylinderGeometry(0.2, 0.2, 7.6, 8), 0.04, 80 + sz), "#4f8f3a", { rz: Math.PI / 2, sy: 1, sz: 0.6 }), MAT.vc, false); lip.position.set(0, 0.02, sz * 1.25); g.add(lip); }
    for (const sx of [-1, 1]) { const r = mesh(GEO.reeds, MAT.vc, false); r.position.set(sx * 3.3, 0, 1.4); g.add(r); }
    return g;
  },
  // hendekten sıçrayan timsah
  crocJump: () => setOrder(makeCrocModel(1.5), 5),
  sarco: () => makeCrocModel(4.0)
});

// ------------------------------------------------------------------ parçacıklar
// Kar: kameranın çevresinde düşen yumuşak noktalar
const SNOW_N = 900;
const snowGeo = new THREE.BufferGeometry();
const snowArr = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) { snowArr[i * 3] = (rnd() - 0.5) * 50; snowArr[i * 3 + 1] = rnd() * 16; snowArr[i * 3 + 2] = -rnd() * 70 + 8; }
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowArr, 3));
const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: dotTex, size: 0.16, transparent: true, depthWrite: false, opacity: 0.95, color: "#ffffff" }));
snowPts.frustumCulled = false; scene.add(snowPts);
function updateSnow(dt, speed, cx, wind = 0) {
  const a = snowArr;
  for (let i = 0; i < SNOW_N; i++) {
    let y = a[i * 3 + 1] - dt * (1.4 + (i % 5) * 0.28);
    a[i * 3] += (Math.sin(state.time * 0.7 + i) * 0.5 + wind * 14) * dt;
    if (wind && Math.abs(a[i * 3] - cx) > 25) a[i * 3] -= Math.sign(a[i * 3] - cx) * 50;
    a[i * 3 + 2] += dt * speed;
    if (y < 0 || a[i * 3 + 2] > 9) { y = 10 + rnd() * 6; a[i * 3] = cx + (rnd() - 0.5) * 50; if (a[i * 3 + 2] > 9) a[i * 3 + 2] -= 70; }
    a[i * 3 + 1] = y;
  }
  snowGeo.attributes.position.needsUpdate = true;
}

// Tipi: rüzgârla savrulan uzun kar çizgileri (3B) + yerde akan kar sisi
const BLZ_N = 260;
const blzTex = canvasTex(128, 16, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); const v = g.createLinearGradient(0, 0, 0, h); }, { wrap: false });
const blz = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.05), new THREE.MeshBasicMaterial({ map: blzTex, transparent: true, opacity: 0, depthWrite: false, fog: false }), BLZ_N);
blz.frustumCulled = false; scene.add(blz);
const blzP = Array.from({ length: BLZ_N }, () => ({ x: (rnd() - 0.5) * 40, y: rnd() * 7, z: -rnd() * 45 + 6, l: 1.5 + rnd() * 4, v: 0.7 + rnd() * 0.8 }));
const driftTex = canvasTex(512, 256, (g, w, h) => {
  for (let i = 0; i < 70; i++) { const x = rnd() * w, y = rnd() * h, rw = 60 + rnd() * 200, rh = 6 + rnd() * 18;
    wrapDraw(w, h, x, y, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rw); gr.addColorStop(0, `rgba(255,255,255,${0.25 + rnd() * 0.35})`); gr.addColorStop(1, "rgba(255,255,255,0)"); g.save(); g.translate(X, Y); g.scale(1, rh / rw); g.translate(-X, -Y); g.fillStyle = gr; g.fillRect(X - rw, Y - rw, rw * 2, rw * 2); g.restore(); }); }
});
driftTex.repeat.set(3, 6);
const drifts = [0.08, 0.7].map((y, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 70), new THREE.MeshBasicMaterial({ map: i ? driftTex.clone() : driftTex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, y, -25); if (i) { m.material.map.needsUpdate = true; m.material.map.repeat.set(2, 4); } scene.add(m); return m; });
function updateBlizzard(dt, k, dir, v, cx) {
  blz.visible = k > 0.01; drifts.forEach((d) => (d.visible = k > 0.01));
  if (!blz.visible) return;
  blz.material.opacity = 0.85 * k;
  for (let i = 0; i < BLZ_N; i++) {
    const p = blzP[i];
    p.x += dir * dt * 26 * p.v; p.z += dt * (v * 0.6 + 4); p.y -= dt * 0.8;
    if (Math.abs(p.x - cx) > 22 || p.z > 8 || p.y < 0) { p.x = cx - dir * (14 + rnd() * 8); p.z = -rnd() * 45 + 4; p.y = rnd() * 7; }
    _o.position.set(p.x, p.y, p.z); _o.quaternion.copy(camera.quaternion); _o.rotateZ(-dir * 0.12); _o.scale.set(p.l, 1 + p.v, 1); _o.updateMatrix(); blz.setMatrixAt(i, _o.matrix);
  }
  blz.instanceMatrix.needsUpdate = true;
  drifts.forEach((d, i) => { d.material.opacity = (i ? 0.45 : 0.75) * k; d.material.map.offset.x -= dir * dt * (i ? 0.9 : 0.6); d.material.map.offset.y += dt * v * 0.012; d.position.x = cx; });
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

// Sivrisinek sürüsü (Bölüm 2): dinozorun önünde vızıldayan koyu noktalar
const BUG_N = 170;
const bugArr = new Float32Array(BUG_N * 3), bugGeo = new THREE.BufferGeometry();
bugGeo.setAttribute("position", new THREE.BufferAttribute(bugArr, 3));
const bugPts = new THREE.Points(bugGeo, new THREE.PointsMaterial({ map: dotTex, color: "#14170a", size: 0.11, transparent: true, depthWrite: false, opacity: 0 }));
bugPts.frustumCulled = false; bugPts.visible = false; scene.add(bugPts);
const bigBugs = [];
function updateBugs(k, t, cx, cy) {
  if (!bigBugs.length && H1.sivrisinek) for (let i = 0; i < 7; i++) { const m = staticClone("sivrisinek", 0.13); m.visible = false; scene.add(m); bigBugs.push(m); }
  bigBugs.forEach((m, i) => {
    m.visible = k > 0.05; if (!m.visible) return;
    const a = i * 0.9 + t * (1.4 + i * 0.13);
    m.position.set(cx + Math.sin(a) * (1.2 + (i % 3) * 0.6), cy + 1.6 + Math.sin(a * 1.7 + i) * 0.5 + (i % 2) * 0.4, 1.2 - (i % 4) * 0.9 + Math.cos(a * 1.3) * 0.6);
    m.rotation.set(0, a + Math.PI / 2, Math.sin(t * 40 + i) * 0.08);
    m.scale.setScalar(Math.min(1, k * 1.5));
  });
  bugPts.visible = k > 0.01; if (!bugPts.visible) return;
  bugPts.material.opacity = Math.min(1, k * 1.2);
  for (let i = 0; i < BUG_N; i++) {
    const a = i * 2.399;
    bugArr[i * 3] = cx + Math.sin(t * (3 + (i % 5)) + a) * (0.8 + (i % 7) * 0.45);
    bugArr[i * 3 + 1] = cy + 0.4 + Math.sin(t * (4 + (i % 3)) + a * 1.3) * 0.7 + (i % 4) * 0.35;
    bugArr[i * 3 + 2] = 1.0 - (i % 9) * 0.8 + Math.cos(t * (3.5 + (i % 4)) + a) * 0.7;
  }
  bugGeo.attributes.position.needsUpdate = true;
}

// Ter damlaları (kullanıcının damla modeli): soluklanırken kafadan sıçrar
const sweat = [];
function updateSweat(dt, on, x, y) {
  if (!sweat.length) { if (!H1.ter_damla) return; for (let i = 0; i < 10; i++) { const m = staticClone("ter_damla", 0.085); m.visible = false; scene.add(m); sweat.push({ m, life: 0, v: new THREE.Vector3(), side: 1 }); } }
  for (const sd of sweat) {
    if (sd.life <= 0) {
      if (on && rnd() < dt * 7) {
        sd.life = 0.85; sd.side = rnd() < 0.5 ? -1 : 1;
        sd.m.position.set(x + sd.side * (0.2 + rnd() * 0.25), y + 1.7 + rnd() * 0.3, 0.55);
        sd.v.set(sd.side * (0.9 + rnd() * 0.9), 1.4 + rnd() * 1.2, 0.5 + rnd() * 0.5); sd.m.visible = true;
      } else { sd.m.visible = false; continue; }
    }
    sd.life -= dt; sd.v.y -= 8 * dt; sd.m.position.addScaledVector(sd.v, dt);
    sd.m.rotation.set(0, 0, Math.atan2(sd.v.x, sd.v.y) * -1 + Math.PI);
    sd.m.scale.setScalar(Math.min(1, sd.life * 3));
  }
}

// Tema: 1 = buzul, 2 = bataklık (gökyüzü, sis, ışık, zemin, set, ufuk, parçacık rengi, bitiş kapısı)
const THEMES = {
  1: { top: "#1f78d6", mid: "#5fb2ef", hor: "#d8eeff", fog: "#d6ebfa", hs: "#e6f4ff", hg: "#8fa8c2", sun: "#ffe7c7", sunI: 2.6 },
  2: { top: "#3a8cc0", mid: "#8cc8b4", hor: "#ebe6a8", fog: "#d5dcaa", hs: "#f6f2cc", hg: "#4f6f3a", sun: "#fff0c4", sunI: 2.45 }
};
let curTheme = 1;
function applyTheme(n) {
  curTheme = n; const T = THEMES[n], sw = n === 2;
  SKY_U.uTop.value.set(T.top); SKY_U.uMid.value.set(T.mid); SKY_U.uHor.value.set(T.hor);
  FOG_COL.set(T.fog); scene.fog.color.copy(FOG_COL);
  hemi.color.set(T.hs); hemi.groundColor.set(T.hg); sun.color.set(T.sun); sun.intensity = T.sunI;
  mtnBand.visible = !sw; swampBand.visible = sw;
  road.material.map = sw ? SW.roadTex : (roadTexLive || roadTex); road.material.roughness = sw ? 0.55 : 0.12; road.material.envMapIntensity = sw ? 0.6 : 1.25; road.material.needsUpdate = true;
  ground.material = sw ? SW.waterMat : MAT.snow;
  bermMat.map = sw ? SW.bankTex : bermTex; bermMat.color.set(sw ? "#ffffff" : "#f1f6fb"); bermMat.needsUpdate = true;
  snowPts.material.color.set(sw ? "#f4f8a6" : "#ffffff"); snowPts.material.opacity = sw ? 0.75 : 0.95;
  goal.userData.setTheme(n);
}


// ------------------------------------------------------------------ güçlendirmeler ve dinozor tanımları
const BUFFS = {
  sprint: { icon: "🌶️", name: "Süper sprint x2", col: "#ffd23f", dur: 4 },
  armor: { icon: "🐢", name: "Kalkan", col: "#d9d2c3", dur: 0 },
  jump: { icon: "🦘", name: "Zıplama gücü", col: "#b07dff", dur: 10 },
  double: { icon: "⚡", name: "Yemek x2", col: "#ffcc22", dur: 10 },
  rage: { icon: "🚀", name: "Roket", col: "#ff5530", dur: 5 },
  slow: { icon: "⏳", name: "Zaman", col: "#58c6ff", dur: 3 },
  ghost: { icon: "🍄", name: "Görünmez", col: "#e6e9ff", dur: 5 },
  magnet: { icon: "🍯", name: "Bal mıknatısı", col: "#ffb12e", dur: 8 },
  life: { icon: "❤️", name: "Ekstra can", col: "#ff3d5a", dur: 0 }
};
const BUFF_KEYS = Object.keys(BUFFS);
/** Çantaya giren (istenen anda düğmeyle kullanılan) güçler. Can ve kalkan hemen etki eder. */
const INV_KEYS = ["sprint", "jump", "double", "rage", "slow", "ghost", "magnet"];
// Et = enerji: koştukça azalır, yedikçe artar. 25 altı yavaşlar, 5'te durup soluklanır
const MEAT = { start: 40, max: 60, perMeter: 1 / 16, slow: 25, stop: 5 };
const DINOS = {
  sunny: {
    name: "Carnotaurus", short: "İlk dinozorun", tag: "Sprint · neşeli, buz kırar", portrait: "img/p_carno.png",
    stats: { Hız: 75, Güç: 80, Çeviklik: 60, Zıplama: 60 },
    ability: { key: "sprint", icon: "🚀", name: "SPRİNT", desc: "3 sn hızlı koşu, küçük engelleri kırar ve düşmandan kaçar. Sonra 1 sn yorulur, 5 sn'de yenilenir." },
    jumpV: 10.6, laneRate: 9, doubleJump: false
  },
  raptor: {
    name: "Velociraptor", short: "1. bölümü bitirince açılır", tag: "Pençe · en hızlı, çift zıplar", portrait: "img/p_raptor.png",
    fragile: true,
    stats: { Hız: 95, Güç: 40, Çeviklik: 95, Zıplama: 90 },
    ability: { key: "claw", icon: "🐾", name: "PENÇE", desc: "En hızlısı. Çift zıplar, şerit değiştirmesi çok çevik. Düşman yaklaşınca düğme parlar: orak pençesiyle onu kaçır! Ama dayanıksızdır: mamut ya da duvara çarparsa koşu biter." },
    jumpV: 11.6, laneRate: 16, doubleJump: true, speedMul: 1.08
  }
};
const LOCKED_SOON = [
  { name: "Triceratops", short: "2. bölümden sonra", portrait: "img/p_trike.png" },
  { name: "Stegosaurus", short: "3. bölümden sonra", portrait: "img/p_stego.png" },
  { name: "T-Rex", short: "4. bölümden sonra", portrait: "img/p_trex.png" }
];

// ------------------------------------------------------------------ dinozor modelleri (glTF, Harita 1)
// Sunny ve Raptor: 1.7 m boy, yüzü +z. Animasyonlar: Run, Sprint, Jump, Slide, LaneLeft/Right, Hit, Caught, Win, Idle, Eat
// + Sunny: WakeUp, Slip, Shiver, FallWater · Raptor: DoubleJump, Slash, Wade
const MODEL = { sunny: { file: "sunny", scale: 1.0 }, raptor: { file: "raptor", scale: 1.0 } };
const gltfLoader = new GLTFLoader();
const DINO_OBJ = {};

function loadDino(key) {
  const M = MODEL[key], g = H1[M.file];
  const model = g.scene;
  const mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    const conv = (mt) => { const nm = mt.clone(); mats.push(nm); return nm; };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  model.scale.setScalar(M.scale);
  const mixer = new THREE.AnimationMixer(model), actions = {};
  for (const c of g.animations) actions[c.name.toLowerCase()] = mixer.clipAction(c);
  const inner = new THREE.Group(); inner.add(model); inner.rotation.y = Math.PI; // model +z'ye bakar → koşu yönü -z
  const pivot = new THREE.Group(); pivot.add(inner);
  scene.add(pivot); pivot.visible = false;
  const d = { key, pivot, inner, model, mixer, actions, mats, cur: null, curAction: null, lastAir: false, roarT: 3 };
  playAnim(d, "idle");
  DINO_OBJ[key] = d;
  return d;
}

function playAnim(d, name, { fade = 0.18, once = false, ts = 1, start = 0 } = {}) {
  const a = d.actions[name]; if (!a) return false;
  if (d.cur === name && !once) { a.timeScale = ts; return true; }
  a.reset(); a.enabled = true;
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
  a.timeScale = ts; a.time = start; a.setEffectiveWeight(1); a.play();
  if (d.curAction && d.curAction !== a) { d.curAction.fadeOut(fade); a.fadeIn(fade); }
  d.cur = name; d.curAction = a;
  return true;
}
const animBusy = (d) => d.curAction && d.curAction.loop === THREE.LoopOnce && d.curAction.isRunning();
function tickDino(d, dt) { d.mixer.update(dt); }
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
  roar: () => { noise(0.6, 0.12, 380); tone(110, 0.6, "sawtooth", 0.06, -40); },
  wind: () => { noise(1.8, 0.16, 650); noise(1.2, 0.08, 1800); },
  crack: () => { noise(0.18, 0.35, 3200); tone(1400, 0.12, "triangle", 0.08, -900); noise(0.4, 0.2, 900); },
  whistle: () => tone(1500, 0.8, "sine", 0.05, -1100),
  splash: () => { noise(0.6, 0.3, 1100); tone(300, 0.3, "sine", 0.08, -180); },
  squelch: () => { noise(0.35, 0.28, 320); tone(140, 0.25, "sine", 0.1, -70); },
  bite: () => { noise(0.12, 0.35, 1400); tone(95, 0.3, "square", 0.08, -40, 0.05); noise(0.15, 0.25, 600); },
  buzz: () => { tone(220, 1.4, "sawtooth", 0.025, 25); tone(233, 1.4, "sawtooth", 0.02, -20, 0.1); },
  aval: () => { noise(2.2, 0.32, 260); noise(1.6, 0.2, 900); tone(60, 2.0, "sawtooth", 0.07, -20); },
  boss: () => { noise(1.0, 0.18, 260); tone(70, 1.0, "sawtooth", 0.09, -25); tone(105, 0.8, "sawtooth", 0.06, -30, 0.15); }
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
const LEVELS = {
  1: { n: 1, length: 1500, checkpoints: [375, 750, 1125], baseSpeed: 15, maxSpeed: 21, intro: "img/bolum1_giris.jpg" },
  // Bataklık: 0-375 sulu bataklık · 375-750 timsah pususu · 750-1125 batan zemin + sivrisinek · 1125+ dev timsah takibi
  2: { n: 2, length: 1500, checkpoints: [375, 750, 1125], baseSpeed: 15, maxSpeed: 21.5, intro: "img/bolum2_giris.jpg", boss: 1125 }
};
const LEVEL = { ...LEVELS[1] };
// Zorluk: kolay (az engel, bol güç), orta, zor (bölüm ilerledikçe çok daha sıkı; sonda bol fırtına ve çığ)
const DIFFS = {
  kolay: { name: "KOLAY", icon: "🙂", gap: 1.45, enemy: 0.45, buff: 1.9, extraBuff: 0.4, hazard: 0.5, wind: 0.5, aval: 0.35, speed: 0.9, meat: 0.55, rescue: true, ramp: 0.03 },
  orta: { name: "ORTA", icon: "😎", gap: 1.0, enemy: 1.0, buff: 1.0, extraBuff: 0.1, hazard: 1.0, wind: 1.0, aval: 1.0, speed: 1.0, meat: 1.0, ramp: 0.08 },
  zor: { name: "ZOR", icon: "🔥", gap: 0.76, enemy: 1.7, buff: 0.75, extraBuff: 0.04, hazard: 1.6, wind: 1.9, aval: 2.2, speed: 1.08, meat: 1.2, ramp: 0.2, hard: true }
};
const DF = () => DIFFS[state.diff] || DIFFS.orta;
/** Bölge (0-3): her 375 m bir sonraki bölge; zorlukla birlikte yoğunluk artar */
const zoneOf = (d) => Math.min(3, Math.floor(d / 375));
const rampK = (d) => 1 + DF().ramp * zoneOf(d);
const INTRO_T = { sunny: 2.0, raptor: 1.2 };
const state = {
  mode: "menu", paused: false, time: 0, level: 1, diff: store.get("diff", "orta"),
  dinoKey: store.get("dino", "sunny") === "carno" ? "sunny" : store.get("dino", "sunny"),
  unlocked: [...new Set(store.get("unlocked", ["sunny"]).map((k) => (k === "carno" ? "sunny" : k)))],
  best: store.get("best", { stars: 0 })
};
let run = null;

function newRun(fromDist = 0) {
  const def = DINOS[state.dinoKey];
  run = {
    def, dist: fromDist, speed: LEVEL.baseSpeed, lane: 1, x: 0, y: 0, vy: 0, air: false, airJumps: 0,
    slide: 0, phase: 0, hearts: 3, food: run && fromDist ? run.food : 0, foodSpawned: run && fromDist ? run.foodSpawned : 0,
    meat: run && fromDist ? Math.max(run.meat, MEAT.slow + 5) : MEAT.start, rest: 0, restCount: 0, lastRestDist: -999, tiredOut: false,
    inv: run && fromDist ? { ...run.inv } : Object.fromEntries(INV_KEYS.map((k) => [k, 0])),
    stumble: 0, chase: 0, invuln: 0, lean: 0,
    sprint: 0, tired: 0, cooldown: 0, sprintBonus: 0,
    buffs: { armor: 0, jump: 0, rage: 0, slow: 0, ghost: 0, magnet: 0, double: 0, sprint: 0 },
    objs: [], props: [], nextSpawn: fromDist + 30, nextProp: 0, finished: false, finishT: 0,
    checkpoint: fromDist, shake: 0, roar: 0,
    intro: fromDist ? 0.6 : (INTRO_T[state.dinoKey] || 1.2), req: null, laneDir: "laneleft", hitAnim: 0, lastFoe: null, fellWater: false,
    wind: 0, nextWind: fromDist + (230 + Math.random() * 120) / DF().wind, onSlick: false, shiver: 0, frost: 0, frostWarned: false,
    level: LEVEL.n, flood: -1, inMud: false, mudSlow: 0, mudToasts: 0, bugs: 0, nextBugs: Math.max(fromDist + 60, 720) + Math.random() * 60, boss: false
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
  if (Math.random() < Math.min(0.3, (0.025 + 0.035 * zoneOf(d)) * DF().aval * (DF().hard ? rampK(d) : 1))) {
    // çığ: sağdan ya da soldan iner, o şeridi kar yığını kapatır
    const side = Math.random() < 0.5 ? -1 : 1, l = side < 0 ? 0 : 2;
    objs.push({ t: "aval", lane: l, side, z: z - 10, at: -1, landed: false });
    for (const fl of [0, 1, 2]) if (fl !== l) for (let k = 0; k < 3; k++) addFood(fl, z - 6 - k * 2.5, 0);
    run.nextSpawn = run.dist + (lerp(26, 17, diff) + Math.random() * 6) * DF().gap / rampK(d);
    return;
  }
  if (r < 0.17) {
    // tek engel (buz kaya ya da karlı kütük) + diğer şeritlerde yiyecek: zıpla
    const l = Math.floor(Math.random() * 3); take(l);
    if (Math.random() < Math.min(0.85, (0.3 + (diff > 0.75 ? 0.35 : 0)) * DF().hazard * rampK(d))) objs.push({ t: "fall", lane: l, z, h: 1.2, fallT: -1, landed: false });
    else {
      const v = Math.random() < 0.5 ? "ice" : "log";
      objs.push({ t: "ice", v, lane: l, z, h: 0.9 });
      // dalın (kütüğün) arkasında nadiren mor meyve: üstünden zıplayınca alınır
      if (v === "log" && Math.random() < 0.22) objs.push({ t: "buff", lane: l, z: z - 3, kind: "jump", model: "buff_mor_meyve" });
    }
    for (let k = -2; k <= 2; k++) addFood(l, z + k * 1.6, 1.0 + (2.2 - Math.abs(k) * 0.8));
  } else if (r < 0.31) {
    // iki şeritte buz blok (şerit değiştir)
    const open = Math.floor(Math.random() * 3);
    for (const l of [0, 1, 2]) if (l !== open) objs.push({ t: "wall", lane: l, z, h: 3.2 });
    for (let k = 0; k < 5; k++) addFood(open, z + 6 - k * 2.2, 0);
  } else if (r < 0.43) {
    // sarkıtlı kemer (kay)
    const lanes = diff > 0.4 && Math.random() < 0.5 ? [0, 1, 2] : [Math.floor(Math.random() * 3)];
    for (const l of lanes) objs.push({ t: "arch", lane: l, z });
    const l2 = lanes.length === 3 ? 1 : lanes[0];
    for (let k = 0; k < 3; k++) addFood(l2, z + 2 - k * 2, -0.35);
  } else if (r < 0.53) {
    // yarık (zıpla): ya tek şerit ya da üç şeridi kesen derin/sulu yarık
    if (Math.random() < 0.5 + diff * 0.3) {
      const water = Math.random() < 0.5;
      objs.push({ t: "gap", full: true, water, mosa: water && Math.random() < 0.7, mosaDir: Math.random() < 0.5 ? -1 : 1, lane: 1, z, len: 2.4 });
      for (let k = -2; k <= 2; k++) addFood(1, z + k * 1.5, 1.0 + (2.0 - Math.abs(k) * 0.7));
    } else {
      const l = Math.floor(Math.random() * 3);
      objs.push({ t: "gap", lane: l, z, len: 3.4 });
      for (let k = -2; k <= 2; k++) addFood(l, z + k * 1.5, 1.0 + (2.0 - Math.abs(k) * 0.7));
    }
  } else if (r < 0.61) {
    // ince buz plakaları: çatlak olanlar basınca kırılır, altı okyanus
    const safe = Math.floor(Math.random() * 3);
    const cracked = [0, 1, 2].filter((l) => l !== safe && (diff > 0.3 || Math.random() < 0.6));
    if (!cracked.length) cracked.push((safe + 1) % 3);
    for (const l of [0, 1, 2]) objs.push({ t: "plate", lane: l, z, len: 3.0, cracked: cracked.includes(l), broken: false });
    for (let k = 0; k < 3; k++) addFood(safe, z + 2.5 - k * 2.5, 0);
  } else if (r < 0.68) {
    // kaygan buz: üstündeyken şerit değiştirmek zor; ilerisinde engel
    const l = Math.floor(Math.random() * 3);
    objs.push({ t: "slick", lane: l, z: z - 3, len: 6 });
    if (diff > 0.25) objs.push({ t: "ice", v: Math.random() < 0.5 ? "ice" : "log", lane: l, z: z - 13, h: 0.9 });
    for (const fl of [0, 1, 2]) if (fl !== l) addFood(fl, z - 4, 0);
  } else if (r < 0.68 + clamp((0.1 + diff * 0.08) * DF().enemy * rampK(d), 0.03, 0.27)) {
    // karşıdan koşan mamut ya da kutup ayısı
    const openLanes = new Set();
    const rows = {};
    for (const o of objs) if (o.t === "wall" && !o.dead && o.z < 0) (rows[o.z] = rows[o.z] || []).push(o.lane);
    for (const zz in rows) [0, 1, 2].forEach((ln) => { if (!rows[zz].includes(ln)) openLanes.add(ln); });
    const okLanes = [0, 1, 2].filter((ln) => !openLanes.has(ln));
    if (!okLanes.length) { run.nextSpawn = run.dist + 8; return; }
    const l = okLanes[Math.floor(Math.random() * okLanes.length)];
    const kind = Math.random() < 0.55 ? "mamut" : "ayi";
    objs.push({ t: "mammoth", kind, lane: l, z: z - 25, vz: kind === "ayi" ? 11 : 9, warned: false, p: Math.random() * 6 });
    // zor: ileri bölgelerde ikinci düşman da gelir
    if (DF().hard && zoneOf(d) >= 2 && Math.random() < 0.5) {
      const l2 = okLanes.filter((q) => q !== l)[0];
      if (l2 != null) objs.push({ t: "mammoth", kind: kind === "ayi" ? "mamut" : "ayi", lane: l2, z: z - 42, vz: kind === "ayi" ? 9 : 11, warned: false, p: Math.random() * 6 });
    }
    for (const fl of [0, 1, 2]) if (fl !== l) for (let k = 0; k < 3; k++) addFood(fl, z + k * 2.5, 0);
  } else if (r < 0.92) {
    // yiyecek dizisi + bazen güçlendirme
    const l = Math.floor(Math.random() * 3);
    for (let k = 0; k < 7; k++) addFood(l, z - k * 2.0, 0, k === 6 && Math.random() < 0.18);
    if (Math.random() < Math.min(0.92, 0.45 * DF().buff)) {
      const bl = (l + 1 + Math.floor(Math.random() * 2)) % 3;
      const kind = BUFF_KEYS[Math.floor(Math.random() * BUFF_KEYS.length)], list = BUFF_MODELS[kind];
      objs.push({ t: "buff", lane: bl, z: z - 6, kind, model: list[Math.floor(Math.random() * list.length)] });
    }
  } else {
    // karışık: engel + kemer
    const a = Math.floor(Math.random() * 3), b = (a + 1) % 3;
    objs.push({ t: "ice", v: Math.random() < 0.5 ? "ice" : "log", lane: a, z, h: 0.9 }, { t: "arch", lane: b, z: z - 9 });
    addFood((a + 2) % 3, z, 0); addFood((a + 2) % 3, z - 3, 0); addFood((a + 2) % 3, z - 6, 0);
  }
  run.nextSpawn = run.dist + (lerp(26, 17, diff) + Math.random() * 6) * DF().gap / rampK(d);
  extraBuff(z);
}
/** Bölüm 2 desenleri. Bölüm ilerledikçe yeni tehlikeler eklenir. */
function spawnSwamp(zAhead) {
  const d = run.dist, diff = clamp(d / LEVEL.length, 0, 1), objs = run.objs, z = -zAhead;
  const sec = d < 375 ? 0 : d < 750 ? 1 : d < 1125 ? 2 : 3;
  const rl = () => Math.floor(Math.random() * 3);
  const other = (l) => (l + 1 + Math.floor(Math.random() * 2)) % 3;
  const W = [
    ["log", 1.0], ["trunk", 0.8], ["vine", 0.8], ["mud", sec === 0 ? 1.1 : 0.6], ["food", 0.9], ["mix", sec ? 0.6 : 0.3],
    ["croc", (sec === 0 ? (d > 180 ? 0.4 : 0) : sec === 1 ? 1.5 : 0.9) * DF().enemy * rampK(d)],
    ["bridge", (sec >= 2 ? 1.2 : sec === 1 && d > 600 ? 0.4 : 0) * DF().hazard],
    ["ditch", (sec >= 2 ? 0.8 : sec === 1 ? 0.35 : 0) * DF().hazard]
  ];
  let r = Math.random() * W.reduce((a, [, w]) => a + w, 0), pick = "food";
  for (const [k, w] of W) { if ((r -= w) < 0) { pick = k; break; } }
  switch (pick) {
    case "log": {
      // yosunlu kütük (zıpla); arkasında nadiren mor meyve
      const l = rl(); objs.push({ t: "ice", v: "mlog", lane: l, z, h: 0.9 });
      if (Math.random() < 0.22) objs.push({ t: "buff", lane: l, z: z - 3, kind: "jump", model: "buff_mor_meyve" });
      for (let k = -2; k <= 2; k++) addFood(l, z + k * 1.6, 1.0 + (2.2 - Math.abs(k) * 0.8));
      break;
    }
    case "trunk": {
      // iki şeritte dev ağaç gövdesi (şerit değiştir)
      const open = rl(); for (const l of [0, 1, 2]) if (l !== open) objs.push({ t: "wall", v: "trunk", lane: l, z, h: 3.2 });
      for (let k = 0; k < 5; k++) addFood(open, z + 6 - k * 2.2, 0);
      break;
    }
    case "vine": {
      // sarkan dal ve sarmaşık (kay)
      const lanes = diff > 0.35 && Math.random() < 0.5 ? [0, 1, 2] : [rl()];
      for (const l of lanes) objs.push({ t: "arch", v: "vine", lane: l, z });
      const l2 = lanes.length === 3 ? 1 : lanes[0];
      for (let k = 0; k < 3; k++) addFood(l2, z + 2 - k * 2, -0.35);
      break;
    }
    case "mud": {
      // çamur birikintisi: 2 sn yavaşlatır (bal yiyince etkilemez)
      const l = rl(), ls = diff > 0.3 && Math.random() < 0.5 ? [l, other(l)] : [l];
      for (const m of ls) objs.push({ t: "mud", lane: m, z: z - 2, len: 5 });
      if (diff > 0.2 && Math.random() < 0.5) objs.push({ t: "ice", v: "mlog", lane: ls[0], z: z - 12, h: 0.9 });
      const fl = [0, 1, 2].find((q) => !ls.includes(q));
      for (let k = 0; k < 4; k++) addFood(fl, z - k * 2.2, 0);
      if (Math.random() < 0.3) objs.push({ t: "buff", lane: fl, z: z - 11, kind: "magnet", model: "buff_bal" });
      break;
    }
    case "croc": {
      // su birikintisinde pusu: dalgalanma görünür, yaklaşınca timsah fırlar (zıpla ya da şerit değiştir)
      const l = rl(); objs.push({ t: "croc", lane: l, z, lunge: -1 });
      if (sec >= 2 && Math.random() < 0.5) objs.push({ t: "croc", lane: other(l), z: z - 14, lunge: -1 });
      for (const fl of [0, 1, 2]) if (fl !== l) for (let k = 0; k < 3; k++) addFood(fl, z + k * 2.5, 0);
      if (Math.random() < 0.15) objs.push({ t: "buff", lane: other(l), z: z - 8, kind: "armor", model: "buff_yumurta" });
      break;
    }
    case "bridge": {
      // tahta köprü: çürük tahtalar basınca kırılır, altı bataklık suyu
      const safe = rl();
      const rotten = [0, 1, 2].filter((q) => q !== safe && (diff > 0.55 || Math.random() < 0.65));
      if (!rotten.length) rotten.push(other(safe));
      for (const l of [0, 1, 2]) objs.push({ t: "plate", sw: true, lane: l, z, len: 3.0, cracked: rotten.includes(l), broken: false });
      for (let k = 0; k < 3; k++) addFood(safe, z + 2.5 - k * 2.5, 0);
      break;
    }
    case "ditch": {
      // üç şeridi kesen hendek; bazen içinden timsah sıçrar
      objs.push({ t: "gap", sw: true, full: true, water: true, mosa: Math.random() < 0.6, mosaDir: Math.random() < 0.5 ? -1 : 1, lane: 1, z, len: 2.4 });
      for (let k = -2; k <= 2; k++) addFood(1, z + k * 1.5, 1.0 + (2.0 - Math.abs(k) * 0.7));
      break;
    }
    case "mix": {
      const a = rl(), b = (a + 1) % 3;
      objs.push({ t: "ice", v: "mlog", lane: a, z, h: 0.9 }, { t: "arch", v: "vine", lane: b, z: z - 9 });
      addFood((a + 2) % 3, z, 0); addFood((a + 2) % 3, z - 3, 0); addFood((a + 2) % 3, z - 6, 0);
      break;
    }
    default: {
      const l = rl();
      for (let k = 0; k < 7; k++) addFood(l, z - k * 2.0, 0, k === 6 && Math.random() < 0.18);
      if (Math.random() < Math.min(0.92, 0.45 * DF().buff)) {
        const kind = BUFF_KEYS[Math.floor(Math.random() * BUFF_KEYS.length)], list = BUFF_MODELS[kind];
        objs.push({ t: "buff", lane: other(l), z: z - 6, kind, model: list[Math.floor(Math.random() * list.length)] });
      }
    }
  }
  run.nextSpawn = run.dist + (lerp(26, 17, diff) + Math.random() * 6) * DF().gap / rampK(d);
  extraBuff(z);
}
/** Zorluğa göre ekstra güç: kolayda sık sık yolda bir güç belirir */
function extraBuff(z) {
  if (Math.random() >= DF().extraBuff) return;
  const kind = BUFF_KEYS[Math.floor(Math.random() * BUFF_KEYS.length)], list = BUFF_MODELS[kind];
  run.objs.push({ t: "buff", lane: Math.floor(Math.random() * 3), z: z + 7, kind, model: list[Math.floor(Math.random() * list.length)] });
}
function addFood(lane, z, y, gold = false) { run.objs.push({ t: "food", lane, z, y, gold }); run.foodSpawned += gold ? 5 : 1; }
function spawnProps(z) {
  if (run.level === 2) {
    for (const side of [-1, 1]) {
      const r = Math.random(), x = side * (6.5 + Math.random() * 7);
      const kind = r < 0.42 ? "mangrove" : r < 0.58 ? "lily" : r < 0.72 ? "reeds" : r < 0.84 ? "monstera" : r < 0.92 ? "stump" : "cypress";
      run.props.push({ kind, x, z: z + Math.random() * 4, s: 0.7 + Math.random() * 0.6, rot: Math.random() * 6 });
      if (Math.random() < 0.3) run.props.push({ kind: "monstera", x: side * (4.9 + Math.random() * 0.8), z: z + Math.random() * 4, s: 0.8 + Math.random() * 0.5, rot: (side < 0 ? 0 : Math.PI) + (Math.random() - 0.5) });
      if (Math.random() < 0.55) run.props.push({ kind: "reeds", x: side * (4.7 + Math.random() * 0.8), z: z + Math.random() * 4, s: 0.6 + Math.random() * 0.5, rot: Math.random() * 6 });
      if (Math.random() < 0.7) run.props.push({ kind: Math.random() < 0.7 ? "mangrove" : "cypress", x: side * (14 + Math.random() * 8), z: z + Math.random() * 4, s: 0.9 + Math.random() * 0.6, rot: Math.random() * 6 });
      if (Math.random() < 0.6) run.props.push({ kind: Math.random() < 0.5 ? "mangrove" : "cypress", x: side * (24 + Math.random() * 14), z: z + Math.random() * 4, s: 1.1 + Math.random() * 0.8, rot: Math.random() * 6, far: true });
      if (Math.random() < 0.35) run.props.push({ kind: "lily", x: side * (9 + Math.random() * 12), z: z + Math.random() * 4, s: 0.8 + Math.random() * 0.8, rot: Math.random() * 6 });
    }
    return;
  }
  for (const side of [-1, 1]) {
    const r = Math.random(), x = side * (6.5 + Math.random() * 7);
    const kind = r < 0.55 ? "pine" : r < 0.66 ? "crystal" : r < 0.88 ? "rock" : "drift";
    if (kind !== "none") run.props.push({ kind, x, z: z + Math.random() * 4, s: 0.7 + Math.random() * 0.8, rot: Math.random() * 6 });
    if (Math.random() < 0.75) run.props.push({ kind: "pine", x: side * (14 + Math.random() * 8), z: z + Math.random() * 4, s: 1.0 + Math.random() * 0.8, rot: Math.random() * 6 });
    if (Math.random() < 0.6) run.props.push({ kind: "pine", x: side * (24 + Math.random() * 14), z: z + Math.random() * 4, s: 1.2 + Math.random() * 1.0, rot: Math.random() * 6, far: true });
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
  else if (/^[1-7]$/.test(k) && run) { const ks = INV_KEYS.filter((q) => run.inv[q] > 0); if (ks[+k - 1]) act("use:" + ks[+k - 1]); }
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
/** Düşman saldırısı: ekranda kısa kan sıçraması */
function bloodSplash() {
  const el = $("kan"), img = el.firstElementChild;
  img.style.transform = `translate(${(Math.random() - 0.5) * 30}vw, ${(Math.random() - 0.5) * 20}vh) rotate(${Math.random() * 70 - 35}deg) scale(${0.9 + Math.random() * 0.4})`;
  el.style.transition = "none"; el.style.opacity = 0.95; void el.offsetWidth;
  el.style.transition = "opacity 1.1s ease-in 0.15s"; el.style.opacity = 0;
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
    tgt.dead = true; tgt.flee = true; fx("poof", tgt); R.cooldown = 3; R.clawAnim = 0.35; R.req = "slash"; R.shake = 0.2;
    SFX.smash(); toast("PENÇE!", 700);
  }
}

/** Pençe yalnızca düşman aynı şeritte ve yakındayken kullanılabilir */
function clawTarget(R) {
  const L = laneOf(R.x);
  return R.objs.find((o) => (o.t === "mammoth" || (o.t === "croc" && !o.bit)) && !o.dead && o.lane === L && o.z > -16 && o.z < -1.2);
}
function hit(o) {
  const R = run;
  if (R.invuln > 0 || R.finished) return;
  if (R.buffs.armor) { R.buffs.armor = 0; R.invuln = 1; toast("Zırh korudu!", 900); SFX.smash(); if (o) o.dead = true; return; }
  fx("hit", o); if (o && o.t !== "mammoth") fx("smash", o);
  if (o && (o.t === "mammoth" || o.t === "croc")) { fx("blood"); bloodSplash(); }
  const big = o && (o.t === "mammoth" || o.t === "wall");
  if (R.def.fragile && big) R.hearts = 0; else R.hearts--;
  R.invuln = 1.4; R.stumble = 0.8; R.chase = 1; R.shake = 0.4; R.req = "hit"; flash(); SFX.hit();
  R.lastFoe = o && o.t === "mammoth" ? o.kind : o && o.t === "croc" ? "timsah" : null;
  if (navigator.vibrate) try { navigator.vibrate(120); } catch {}
  if (R.hearts <= 0) { caught(); return; }
  toast(R.hearts === 1 ? (LEVEL.n === 2 ? "Dev timsah yaklaşıyor!" : "Düşmanlar yaklaşıyor!") : "Dikkat!", 900);
}
function caught() {
  state.mode = "over"; stopMusic(); SFX.trumpet();
  const cp = Math.max(...LEVEL.checkpoints.filter((c) => c <= run.dist), 0);
  run.checkpoint = cp;
  const sw = LEVEL.n === 2;
  const msg = run.tiredOut ? (sw ? "Yoruldun, dev timsah yetişti!" : "Yoruldun, mamutlar yetişti!") : sw ? (run.fellWater ? "Bataklığa düştün!" : run.lastFoe === "timsah" ? "Timsah yakaladı!" : "Dev timsah yetişti!")
    : (run.fellWater ? "Buzlu suya düştün!" : run.lastFoe === "ayi" ? "Kutup ayısı yakaladı!" : "Mamutlar yetişti!");
  $("over-h").textContent = msg.toLocaleUpperCase("tr-TR");
  const mam = !sw && !run.fellWater && run.lastFoe !== "ayi";
  $("over-img").hidden = !mam; $("over-emoji").hidden = mam; $("over-emoji").textContent = run.fellWater ? (sw ? "💦" : "🌊") : sw ? "🐊" : "🐻‍❄️";
  $("over-p").textContent = cp > 0 ? `Son kontrol noktası: ${cp} m. Oradan devam edebilirsin.` : "Bir daha deneyelim, bu sefer kaçmayı başaracaksın!";
  $("b-continue").hidden = cp === 0;
  show("scr-over"); $("hud").hidden = true;
}

function update(dt) {
  state.time += dt;
  const R = run;
  if (!R) return;
  const def = R.def;
  // açılış: dinozor uyanır, sonra koşu başlar
  if (R.intro > 0) {
    R.intro -= dt; input.queue.length = 0; R.speed = 0;
    if (R.intro <= 0) { toast(R.dist ? "DEVAM!" : "KOŞ!", 900); R.speed = LEVEL.baseSpeed * 0.6; }
    return;
  }
  // zaman yavaşlatma dünyayı yavaşlatır
  const worldMul = R.buffs.slow > 0 ? 0.55 : 1;

  // eylemler
  while (input.queue.length) {
    const a = input.queue.shift();
    if (R.finished || R.rest > 0) continue;
    if (a === "left" || a === "right" || a === "jump") R.frost = Math.max(0, R.frost - 0.6);
    if (a === "left" && R.lane > 0) { R.lane--; R.lean = 1; if (!R.air) { R.laneDir = "laneleft"; R.req = "laneleft"; } }
    else if (a === "right" && R.lane < 2) { R.lane++; R.lean = -1; if (!R.air) { R.laneDir = "laneright"; R.req = "laneright"; } }
    else if (a === "jump") {
      if (!R.air) { R.vy = def.jumpV * (R.buffs.jump > 0 ? 1.3 : 1); R.air = true; R.slide = 0; R.airJumps = 0; R.meat = Math.max(0, R.meat - 0.25); SFX.jump(); }
      else if ((def.doubleJump || R.buffs.jump > 0) && R.airJumps < 1) { R.vy = def.jumpV * 0.9; R.airJumps++; SFX.jump(); }
    } else if (a === "slide") { if (R.air) R.vy = Math.min(R.vy, -14); R.slide = 0.75; SFX.slide(); }
    else if (a === "ability") useAbility();
    else if (a.startsWith("use:")) useItem(a.slice(4));
  }

  // hız
  const prog = clamp(R.dist / LEVEL.length, 0, 1);
  let target = lerp(LEVEL.baseSpeed, LEVEL.maxSpeed, prog) * (def.speedMul || 1) * DF().speed;
  if (R.sprint > 0) target *= 1.45;
  if (R.buffs.sprint > 0) target *= 1.9; // süper sprint: iki kat hızlı
  // enerji (et): azaldıkça yavaşlar, bitmek üzereyken durup soluklanır
  if (R.meat <= MEAT.slow && R.buffs.rage <= 0) target *= lerp(0.62, 0.9, clamp((R.meat - MEAT.stop) / (MEAT.slow - MEAT.stop), 0, 1));
  if (R.rest > 0) target = 0;
  if (R.tired > 0) target *= 0.72;
  if (R.buffs.rage > 0) target *= 1.35;
  if (R.stumble > 0) target *= 0.55;
  if (R.wind > 0) target *= 0.78; // tipi: yavaşlatır
  if (R.frost >= 1) target *= 0.8; // dondu: yavaşlar
  if (R.mudSlow > 0) target *= state.dinoKey === "raptor" ? 0.8 : 0.6; // çamur
  if (R.finished) target = 0;
  R.speed = lerp(R.speed, target, 1 - Math.exp(-dt * (R.finished ? 2.5 : R.rest > 0 ? 5 : 4)));
  const v = R.speed * worldMul;
  R.dist += v * dt;

  // et tüketimi: koşulan yola göre; sprintte çok daha hızlı, roketle bedava
  if (!R.finished && R.rest <= 0) {
    const mul = R.buffs.rage > 0 ? 0 : R.sprint > 0 ? 3 : R.buffs.sprint > 0 ? 2 : 1;
    R.meat = Math.max(0, R.meat - v * dt * MEAT.perMeter * mul * DF().meat);
    if (R.meat <= MEAT.slow && !R.slowWarned) { R.slowWarned = true; toast("🍖 ACIKTIN! ET YE", 1200); }
    if (R.meat > MEAT.slow + 3) R.slowWarned = false;
    if (R.meat <= MEAT.stop && !R.air) {
      // soluklanma: dur, ekrana dön, terle. Düşmanlar yetişir; kısa sürede ikinci kez olursa yakalanırsın
      if (R.dist - R.lastRestDist < 120 && !DF().rescue) { R.lastFoe = null; R.tiredOut = true; R.chase = 1; caught(); return; }
      R.rest = 2.6; R.restCount++; R.lastRestDist = R.dist; R.sprint = 0; R.buffs.sprint = 0; R.slide = 0; R.req = null;
      toast("YORULDUN! 😮‍💨", 1500);
    }
  }
  if (R.rest > 0) {
    R.rest -= dt; R.chase = Math.min(1, R.chase + dt * 0.35);
    if (R.rest <= 0) { R.meat = MEAT.stop + 8; R.speed = LEVEL.baseSpeed * 0.4; toast("HADİ! ET TOPLA!", 1000); }
  }
  // zamanlayıcılar
  if (R.sprint > 0) { R.sprint -= dt; if (R.sprint <= 0) { R.tired = 1; } }
  if (R.tired > 0) { R.tired -= dt; if (R.tired <= 0) R.cooldown = 5; }
  if (R.cooldown > 0) R.cooldown -= dt;
  for (const k of ["rage", "slow", "ghost", "magnet", "jump", "double", "sprint"]) if (R.buffs[k] > 0) R.buffs[k] = Math.max(0, R.buffs[k] - dt);
  R.invuln = Math.max(0, R.invuln - dt); R.stumble = Math.max(0, R.stumble - dt); R.shake = Math.max(0, R.shake - dt);
  if (R.rest <= 0) R.chase = Math.max(0, R.chase - dt * (R.sprint > 0 || R.buffs.sprint > 0 ? 0.5 : 0.12));
  if (R.buffs.ghost > 0) R.chase = Math.max(0, R.chase - dt * 0.5);
  R.slide = Math.max(0, R.slide - dt);
  R.clawAnim = Math.max(0, (R.clawAnim || 0) - dt);
  if (LEVEL.n === 1) {
    // tipi (rüzgar) olayları
    if (R.wind > 0) R.wind = Math.max(0, R.wind - dt);
    if (!R.finished && R.dist >= R.nextWind && R.dist < LEVEL.length - 80) startWind(R);
    // donma riski: uzun süre aynı şeritte, hareketsiz koşarsan ekran buğulanır (tipide daha hızlı)
    R.frost = clamp(R.frost + dt * (R.wind > 0 ? 0.16 : 0.085) - (R.sprint > 0 ? dt * 0.3 : 0), 0, 1.15);
    if (R.frost >= 1 && !R.frostWarned) { R.frostWarned = true; toast("🥶 DONUYORSUN! HAREKET ET", 1300); if (!R.air) R.req = "shiver"; }
    if (R.frost < 0.6) R.frostWarned = false;
  } else {
    // çamur: girince 2 sn yavaşlatır (bal yemişsen etkilemez)
    R.mudSlow = Math.max(0, R.mudSlow - dt);
    const wasMud = R.inMud;
    R.inMud = !R.air && R.objs.some((o) => o.t === "mud" && Math.abs(o.z) < o.len / 2 && laneOf(R.x) === o.lane);
    if (R.inMud && !wasMud) {
      SFX.squelch();
      if (R.buffs.magnet > 0) toast("🍯 BAL SAYESİNDE KAYMADIN", 900);
      else { R.mudSlow = 2; if (R.mudToasts++ < 3) toast("ÇAMUR! YAVAŞLADIN", 900); if (state.dinoKey !== "raptor") R.req = "slip"; }
    }
    if (R.inMud && rnd() < dt * 20) emit(1, _fp.set(R.x + (rnd() - 0.5) * 0.8, 0.1, 0.6), ["#5a3a1a", "#7a5a32"], { speed: 2.5, up: 2.5, size: 0.45, life: 0.5, grav: 12, spread: 0.3 });
    // sivrisinek sürüleri (750 m sonrası)
    if (R.bugs > 0) R.bugs = Math.max(0, R.bugs - dt);
    if (!R.finished && R.dist >= R.nextBugs && R.dist < LEVEL.length - 80) {
      R.bugs = 5.5; R.nextBugs = R.dist + 230 + Math.random() * 150; SFX.buzz(); toast("🦟 SİVRİSİNEK SÜRÜSÜ!", 1200);
    }
    // son bölüm: dev timsah arkadan kovalar
    if (!R.boss && R.dist >= LEVEL.boss && !R.finished) { R.boss = true; SFX.boss(); toast("🐊 DEV TİMSAH PEŞİNDE! KAÇ!", 1600); R.shake = 0.35; }
    if (R.boss && !R.finished) R.chase = Math.max(R.chase, R.mudSlow > 0 ? 0.85 : R.buffs.ghost > 0 ? 0 : 0.42);
  }
  // kaygan buz
  const wasSlick = R.onSlick;
  R.onSlick = !R.air && R.objs.some((o) => o.t === "slick" && Math.abs(o.z) < o.len / 2 && laneOf(R.x) === o.lane);
  if (R.onSlick && !wasSlick) { R.req = "slip"; SFX.slide(); }

  // yatay: Carnotaurus kayarak ve geç döner
  const tx = LANES[R.lane];
  R.x += (tx - R.x) * (1 - Math.exp(-dt * def.laneRate * (R.onSlick ? 0.3 : 1)));
  R.lean = lerp(R.lean, 0, 1 - Math.exp(-dt * 5));

  // dikey
  // altında boşluk var mı: yarık ya da kırılmış buz plakası
  const holeAt = (margin) => R.objs.find((o) => !o.passed && Math.abs(o.z) < o.len / 2 - margin &&
    ((o.t === "gap" && (o.full || laneOf(R.x) === o.lane)) || (o.t === "plate" && o.broken && laneOf(R.x) === o.lane)));
  if (R.air) {
    const py = R.y;
    R.vy -= 32 * dt; R.y += R.vy * dt;
    if (R.y <= 0 && py >= 0) {
      if (!holeAt(0)) { R.y = 0; R.vy = 0; R.air = false; SFX.land(); }
    }
  } else {
    if (holeAt(0.6) && R.buffs.rage <= 0) { R.air = true; R.vy = -2; }
  }
  if (R.y < -1.2) { // yarığa / suya düştü
    const water = R.objs.some((o) => !o.passed && Math.abs(o.z) < 8 && ((o.t === "gap" && o.water) || o.t === "plate"));
    R.y = 0; R.vy = 0; R.air = false;
    R.objs.forEach((o) => { if ((o.t === "gap" || o.t === "plate") && Math.abs(o.z) < 8) o.passed = true; });
    if (water) { fx("splash"); SFX.splash(); }
    R.fellWater = water;
    hit(null);
    if (R.hearts > 0) R.fellWater = false;
  }
  R.phase += dt * (v * 0.62);

  // nesneleri ilerlet + çarpışma
  const myLane = laneOf(R.x), dinoH = R.slide > 0 ? 0.9 : 2.2, smash = R.buffs.rage > 0;
  for (const o of R.objs) {
    o.z += v * dt;
    if (o.t === "mammoth") {
      o.z += o.vz * worldMul * dt; o.p += dt * 7;
      if (!o.warned && o.z > -60) {
        o.warned = true; SFX.trumpet();
        // bazı mamutlar kar fırtınası başlatır
        if (o.kind === "mamut" && R.wind <= 0 && Math.random() < 0.35 && R.dist < LEVEL.length - 80) startWind(R);
      }
    }
    if (o.dead) continue;
    const near = Math.abs(o.z) < 1.0, sameLane = o.lane === myLane;
    switch (o.t) {
      case "food": {
        const mag = R.buffs.magnet > 0 && o.z > -7 && o.z < 1;
        if (mag) { o.lane = myLane; o.y = lerp(o.y, R.y, 0.2); }
        if ((near && sameLane && Math.abs(o.y - R.y) < 1.4) || (mag && o.z > -0.8)) {
          o.dead = true; fx("food", o); const got = (o.gold ? 5 : 1) * (R.buffs.double > 0 ? 2 : 1);
          R.food += got; R.meat = Math.min(MEAT.max, R.meat + got); (o.gold ? SFX.gold : SFX.food)();
        }
        break;
      }
      case "buff":
        if (near && sameLane && R.y < 2.5) { o.dead = true; applyBuff(o.kind, o.model); }
        break;
      case "aval": {
        // çığ: ~2 sn önceden uyarı, sonra yamaçtan iner ve şeridi kapatır
        if (o.at < 0 && o.z > -42) { o.at = 0; SFX.aval(); R.shake = Math.max(R.shake, 0.25); toast(o.side < 0 ? "⚠️ ÇIĞ! SOLDAN" : "⚠️ ÇIĞ! SAĞDAN", 1300); }
        if (o.at >= 0 && !o.landed) {
          o.at += dt / 1.6;
          if (o.at >= 1) { o.landed = true; SFX.crack(); R.shake = Math.max(R.shake, 0.45); emit(40, _fp.set(LANES[o.lane], 0.8, o.z), ["#ffffff", "#e8f4ff", "#bfe3ff"], { speed: 9, up: 6, size: 1.3, life: 1.1, spread: 2.5 }); }
        }
        if (o.landed && sameLane && Math.abs(o.z) < 2.6 && R.y < 1.3) {
          if (smash) { o.dead = true; fx("poof", o); SFX.smash(); } else { o.dead = true; hit(o); }
        }
        break;
      }
      case "croc": {
        // pusudaki timsah: ~1 sn önceden fırlar
        if (o.lunge < 0 && o.z > -16) { o.lunge = 0; SFX.splash(); SFX.bite(); emit(18, _fp.set(LANES[o.lane], 0.3, o.z), ["#ffffff", "#bfe8c0", "#2f9c8c"], { speed: 4, up: 6, size: 0.8, life: 0.8, grav: 14, spread: 1.2 }); }
        if (o.lunge >= 0) o.lunge = Math.min(1, o.lunge + dt / 0.35);
        if (!o.bit && o.lunge > 0.25 && Math.abs(o.z) < 1.25 && sameLane) {
          if (R.buffs.ghost > 0) break;
          if (smash) { o.dead = true; fx("poof", o); SFX.smash(); }
          else if (R.y < 1.0) { o.bit = true; SFX.bite(); hit(o); }
        }
        break;
      }
      case "fall": {
        if (o.fallT < 0 && o.z > -34) { o.fallT = 0; SFX.whistle(); }
        if (o.fallT >= 0 && !o.landed) {
          o.fallT += dt / 0.9;
          if (o.fallT >= 1) {
            o.landed = true; fx("crack", o); SFX.crack(); R.shake = Math.max(R.shake, 0.18);
            if (Math.abs(o.z) < 1.4 && sameLane && R.buffs.rage <= 0) { o.dead = true; hit(o); }
          }
        } else if (o.landed && near && sameLane && R.y < o.h - 0.05) {
          if (smash || R.sprint > 0 || R.buffs.sprint > 0) { o.dead = true; fx("smash", o); SFX.smash(); R.shake = 0.15; }
          else { o.dead = true; hit(o); }
        }
        break;
      }
      case "plate":
        if (o.cracked && !o.broken && !R.air && sameLane && Math.abs(o.z) < 1.3) {
          o.broken = true; fx("crack", o); SFX.crack(); R.shake = 0.2;
          if (R.buffs.rage > 0) o.passed = true; // roketle hızla geçer
        }
        break;
      case "ice":
        if (near && sameLane && R.y < o.h - 0.05) {
          if (smash || R.sprint > 0 || R.buffs.sprint > 0) { o.dead = true; fx("smash", o); SFX.smash(); R.shake = 0.15; }
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
          if (smash) { o.dead = true; o.flee = true; fx("poof", o); SFX.smash(); } else { o.dead = true; o.attack = true; hit(o); }
        }
        break;
    }
  }
  R.objs = R.objs.filter((o) => o.z < 12 && !(o.dead && o.t !== "mammoth"));
  // dekorlar
  for (const p of R.props) p.z += v * dt;
  R.props = R.props.filter((p) => p.z < 14);
  if (R.dist - R.nextProp > 150) R.nextProp = R.dist;
  while (R.dist >= R.nextProp) { spawnProps(-140); R.nextProp += 6; }
  // yeni desen
  if (!R.finished && R.dist >= R.nextSpawn && R.dist < LEVEL.length - 60) (LEVEL.n === 2 ? spawnSwamp : spawnPattern)(110);
  // kontrol noktası
  for (const c of LEVEL.checkpoints) if (R.checkpoint < c && R.dist >= c) { R.checkpoint = c; toast("KONTROL NOKTASI", 1000); }
  // bitiş
  if (!R.finished && R.dist >= LEVEL.length) { R.finished = true; R.finishT = 0; SFX.win(); setTimeout(LEVEL.n === 1 ? startFlood : win, LEVEL.n === 1 ? 1500 : 1600); }
  if (R.flood >= 0) {
    R.flood += dt;
    if (R.flood > 1.6 && !R.floodRoar) { R.floodRoar = true; SFX.splash(); SFX.boss(); }
    if (R.flood >= FLOOD_T + 0.5 && !R.floodDone) { R.floodDone = true; SFX.splash(); win(); }
  }
  if (R.finished) R.finishT += dt;
}
// ------------------------------------------------------------------ Bölüm 1 → 2 sel geçişi
// Kullanıcı video hazırlarsa (Web/video/sel_gecis.mp4) o oynar; yoksa oyun içi dev dalga sahnesi.
const FLOOD_T = 4.2;
const floodVideo = document.createElement("video");
let floodVideoOK = false;
floodVideo.playsInline = true; floodVideo.setAttribute("playsinline", ""); floodVideo.preload = "metadata";
floodVideo.addEventListener("loadedmetadata", () => { floodVideoOK = true; });
floodVideo.addEventListener("error", () => { floodVideoOK = false; });
floodVideo.src = "video/sel_gecis.mp4";
function startFlood() {
  const R = run;
  if (state.mode !== "run" || !R) return;
  if (floodVideoOK) {
    const box = $("selvid"); box.hidden = false; box.appendChild(floodVideo);
    floodVideo.currentTime = 0; floodVideo.muted = muted;
    const done = () => { floodVideo.onended = null; box.onclick = null; floodVideo.pause(); box.hidden = true; $("sel").style.opacity = 1; win(); };
    floodVideo.onended = done; box.onclick = done;
    floodVideo.play().catch(() => { floodVideo.muted = true; floodVideo.play().catch(done); });
    return;
  }
  R.flood = 0; toast("🌊 SEL GELİYOR!", 1600); SFX.wind(); R.shake = 0.3;
}
const floodWave = new THREE.Group(); floodWave.visible = false; scene.add(floodWave);
{
  const wt = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#e9f8ff"); gr.addColorStop(0.18, "#5fc0ef"); gr.addColorStop(0.6, "#1f7fc6"); gr.addColorStop(1, "#0d4a86");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 3;
    for (let i = 0; i < 40; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y - 6, x + 30, y); g.stroke(); }
  });
  const mat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.1, metalness: 0.05, envMapIntensity: 1.4, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
  // kıvrılan dalga cephesi: çeyrek silindir + arkasında su kütlesi
  const curl = new THREE.CylinderGeometry(3.2, 3.2, 120, 24, 1, true, 0, Math.PI * 1.25); curl.rotateZ(Math.PI / 2);
  const c = new THREE.Mesh(curl, mat); c.position.set(0, 3.2, 0); c.rotation.x = -0.3; floodWave.add(c);
  const body = new THREE.Mesh(new THREE.BoxGeometry(120, 6.4, 60), mat); body.position.set(0, 3.2, -30); floodWave.add(body);
  const foam = [];
  for (let i = 0; i < 30; i++) {
    const f = mesh(P(jitter(new THREE.IcosahedronGeometry(1.1 + rnd() * 0.9, 1), 0.15, i), "#ffffff"), MAT.vcGloss, false);
    f.position.set(-58 + i * 4 + rnd() * 2, 6.2, 1.2 + rnd() * 1.5); floodWave.add(f); foam.push(f);
  }
  floodWave.userData = { foam, mat };
}
function buildFloodWave() {
  if (!H1.sel_dalga) return;
  floodWave.clear();
  for (let i = -3; i <= 3; i++) {
    const w = staticClone("sel_dalga", 5.0); w.position.set(i * 8.6, 4.4, (i % 2) * 1.5); w.children[0].rotation.y = (i % 2) * 0.25;
    w.traverse((o) => { if (o.isMesh) o.castShadow = false; }); floodWave.add(w);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(70, 8, 60), new THREE.MeshStandardMaterial({ color: "#2b86d3", roughness: 0.15, envMapIntensity: 1.3 }));
  back.position.set(0, 3, -32); floodWave.add(back);
  floodWave.userData = { foam: [], mat: null };
}
function startWind(R) {
  const last = DF().hard && zoneOf(R.dist) >= 3;
  R.wind = last ? 6 : 4.5; R.windDir = Math.random() < 0.5 ? -1 : 1;
  R.nextWind = R.dist + (260 + Math.random() * 220) / (DF().wind * (last ? 2.4 : DF().hard ? rampK(R.dist) : 1));
  toast("🌬️ TİPİ!", 1100); SFX.wind(); if (!R.air) R.req = "shiver";
}
const laneOf = (x) => (x < -1.15 ? 0 : x > 1.15 ? 2 : 1);

/** Çantadaki gücü kullan: süresi düğmeye basınca başlar */
function useItem(k) {
  const R = run, b = BUFFS[k];
  if (!R || !b || !(R.inv[k] > 0) || R.buffs[k] > 0) return;
  R.inv[k]--; R.buffs[k] = b.dur;
  SFX.buff(); fx("buff", k); toast(b.icon + " " + b.name.toLocaleUpperCase("tr-TR") + "!", 1000);
  if (k === "sprint") { SFX.sprint(); if (R.bugs > 0) { R.bugs = 0; setTimeout(() => toast("🦟 SİVRİSİNEKLER KAÇTI!", 1000), 700); } }
  if (k === "magnet" && LEVEL.n === 2) setTimeout(() => toast("🍯 ÇAMURDA YAVAŞLAMAZSIN", 1100), 700);
}
function applyBuff(k, model) {
  const R = run, b = BUFFS[k];
  SFX.buff(); fx("buff", k); toast(b.icon + " " + b.name.toLocaleUpperCase("tr-TR"), 1000);
  if (model === "buff_kus" && R.bugs > 0) { R.bugs = 0; setTimeout(() => toast("🐦 KUŞ SİVRİSİNEKLERİ KOVDU!", 1200), 600); }
  if (INV_KEYS.includes(k)) {
    R.inv[k] = Math.min(3, R.inv[k] + 1);
    toast(b.icon + " ÇANTAYA EKLENDİ", 1000); R.invPulse = k;
    return;
  }
  if (k === "life") { R.hearts = Math.min(5, R.hearts + 1); toast("❤️ +1 CAN", 1000); }
  else if (k === "armor") R.buffs.armor = 1;
  else R.buffs[k] = b.dur;
}

// ------------------------------------------------------------------ efekt kancaları (oyun mantığından çağrılır)
const _fp = new THREE.Vector3();
function objPos(o) { return _fp.set(o.rx ?? LANES[o.lane], (o.y || 0) + 0.8, o.z); }
function fx(type, o) {
  const R = run, sw = curTheme === 2;
  switch (type) {
    case "food": emit(o.gold ? 12 : 5, objPos(o), o.gold ? ["#ffd23f", "#fff2a8", "#ff9f1a"] : ["#b5562a", "#f2c49a", "#ffffff"], { speed: 3.5, up: 3, size: o.gold ? 0.55 : 0.4, life: 0.45, grav: 6, spread: 0.5 }); break;
    case "smash": emit(22, _fp.set(LANES[o.lane], 0.8, o.z), sw ? ["#7a5a2e", "#5fa03e", "#c79a5e"] : ["#bfeaff", "#ffffff", "#7fcdf7"], { speed: 9, up: 6, size: 1.4, life: 1.0, spread: 1.4 }); break;
    case "poof": emit(26, _fp.set(LANES[o.lane], sw ? 0.8 : 1.6, o.z), sw ? ["#ffffff", "#bfe8c0", "#5a9a3e"] : ["#ffffff", "#e8f4ff", "#9b6338"], { speed: 8, up: 5, size: 1.3, life: 0.9, spread: 2 }); break;
    case "hit": emit(16, _fp.set(R.x, 1.0 + R.y, 0), ["#ffffff", "#ffd0c0", "#ff6a4a"], { speed: 6, up: 5, size: 1, life: 0.7 }); break;
    case "buff": emit(24, _fp.set(R.x, 1.2 + R.y, -0.4), [BUFFS[o].col, "#ffffff"], { speed: 6, up: 5, size: 0.8, life: 0.8, grav: 4 }); break;
    case "blood": emit(22, _fp.set(R.x, 1.1 + R.y, 0), ["#b3001b", "#e0102f", "#7a0010"], { speed: 6, up: 5, size: 0.7, life: 0.8, grav: 16, spread: 0.6 }); break;
    case "splash": emit(30, _fp.set(R.x, 0.1, 0), sw ? ["#ffffff", "#bfe8c0", "#2f9c8c", "#5a3a1a"] : ["#ffffff", "#bfeaff", "#3d9be0"], { speed: 6, up: 8, size: 0.9, life: 0.9, grav: 16, spread: 1.2, follow: false }); break;
    case "crack": emit(18, _fp.set(LANES[o.lane], 0.1, o.z), sw ? ["#4f4232", "#9a6a3a", "#5f9a3a"] : ["#ffffff", "#cfefff", "#8fd3fb"], { speed: 5, up: 3, size: 0.8, life: 0.7, spread: 1.6 }); break;
    case "land": emit(8, _fp.set(R.x, 0.1, 0.3), sw ? "#8d6a38" : "#ffffff", { speed: 4, up: 1.4, size: 0.4, life: 0.4, grav: 5 }); break;
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
    const key = p.kind === "pine" || p.kind === "mangrove" ? (p.v ??= rnd() < 0.5 ? 0 : 1, p.kind + p.v) : p.kind;
    const m = obtain(key, p);
    m.position.set(p.x, 0, p.z); m.rotation.y = p.rot; m.scale.setScalar(p.s);
    if (p.far && !m.userData.noShadow) { m.userData.noShadow = true; m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); }
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
        const m = obtain("buff:" + o.kind + "|" + o.model, o);
        m.position.set(lx, 0, o.z);
        const gem = m.getObjectByName("gem"); gem.position.y = 1.05 + Math.sin(t * 3 + o.z) * 0.15; gem.rotation.y = t * 2;
        m.getObjectByName("ring").scale.setScalar(1 + Math.sin(t * 5 + o.z) * 0.12);
        break;
      }
      case "ice": { const m = obtain(o.v || "ice", o); m.position.set(lx, 0, o.z); m.rotation.y = o.v === "log" || o.v === "mlog" ? 0 : 0.12 * ((o.lane % 2) * 2 - 1); break; }
      case "mud": {
        const m = obtain("mud", o); m.position.set(lx, 0, o.z); m.scale.set(1, 1, o.len / 5);
        for (const b of m.userData.bub) { const k = ((t * 0.8 + b.userData.ph) % 1); b.scale.setScalar(k < 0.85 ? 0.4 + k : 0.01); }
        break;
      }
      case "croc": {
        if (o.dead) break;
        const m = obtain("croc", o); m.position.set(lx, 0, o.z);
        const c = m.getObjectByName("croc"), L = Math.max(0, o.lunge);
        // önce sadece gözler görünür, sonra fırlar ve ağzını şaklatır
        const e = 1 - Math.pow(1 - L, 3);
        c.position.set(0, lerp(-0.48, 0.02, e), lerp(0, 1.2, e));
        c.rotation.x = o.lunge >= 0 ? -Math.sin(Math.PI * Math.min(1, L * 1.4)) * 0.35 : 0;
        poseCroc(c, t + o.z, { open: o.lunge < 0 ? 0 : o.bit ? 0.1 : 0.5 + 0.5 * Math.abs(Math.sin(t * 9)), sway: o.lunge < 0 ? 0.4 : 1.2 });
        for (let i = 0; i < 2; i++) { const r = m.getObjectByName("rip" + i), k = ((t * 0.9 + i * 0.5) % 1); r.visible = o.lunge < 0; r.scale.setScalar(0.5 + k * 1.6); r.material.opacity = 0.6 * (1 - k); }
        break;
      }
      case "fall": {
        if (o.dead) break;
        const m = obtain("fall", o); m.position.set(lx, 0, o.z);
        const f = o.landed ? 1 : Math.max(0, o.fallT);
        const sh = m.getObjectByName("shard"); sh.position.y = o.landed ? 0.5 : lerp(16, 0.5, f * f); // model ortası 0: ucu ~0.6 m yere saplanır
        sh.rotation.set(0, o.lane * 1.3, o.landed ? 0.05 : 0);
        const warn = m.getObjectByName("warn"); warn.visible = !o.landed;
        warn.scale.setScalar(1 + Math.sin(t * 14) * 0.08); warn.material.opacity = 0.55 + 0.35 * Math.abs(Math.sin(t * 7));
        m.getObjectByName("shadow").scale.setScalar(o.landed ? 1.1 : 0.4 + f * 0.8);
        break;
      }
      case "slick": { const m = obtain("slick", o); m.position.set(lx, 0.002, o.z); break; }
      case "aval": {
        if (o.dead) break;
        const m = obtain("aval", o); m.position.set(lx, 0, o.z);
        const cl = m.getObjectByName("cloud"), pile = m.getObjectByName("pile"), warn = m.getObjectByName("warn");
        const k = clamp(o.at, 0, 1), e = k * k;
        warn.visible = o.at >= 0 && !o.landed; warn.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(t * 9));
        cl.visible = o.at >= 0 && (!o.landed || (o.fade = (o.fade || 0) + dt) < 0.6);
        cl.position.set(o.side * lerp(9, 0, e), lerp(8, 0.3, e), lerp(-3, 0, e)); cl.rotation.set(0, o.side > 0 ? 0 : Math.PI, -o.side * 0.15);
        cl.scale.setScalar(o.landed ? Math.max(0.01, 1 - o.fade / 0.6) * 1.3 : lerp(0.6, 1.3, k));
        pile.visible = o.landed; pile.scale.set(1, Math.min(1, (o.fade || 0) * 3 + 0.2), 1);
        break;
      }
      case "plate": {
        if (o.sw) {
          // çürük tahta köprü
          const m = obtain("plank", o); m.position.set(lx, 0, o.z);
          const u = m.userData, st = o.broken ? 2 : o.cracked ? 1 : 0;
          if (o.fresh || o.shown !== st) {
            o.fresh = false; o.shown = st;
            m.getObjectByName("railL").visible = o.lane === 0; m.getObjectByName("railR").visible = o.lane === 2;
            u.boards.forEach((b, i) => { b.o.geometry = o.cracked ? GEO.boardRot[i % 2] : GEO.board[i % 2]; b.o.position.copy(b.base); b.o.rotation.set(0, b.ry, 0); b.v = 0; b.o.visible = true; });
          }
          if (o.broken) for (const b of u.boards) {
            if (!b.o.visible) continue;
            b.v += 9 * dt; b.o.position.y -= b.v * dt; b.o.rotation.x += b.spin * dt; b.o.rotation.z += b.spin * 0.4 * dt;
            if (b.o.position.y < -1.3) b.o.visible = false;
          }
          break;
        }
        const m = obtain("plate", o); m.position.set(lx, 0, o.z);
        const u = m.userData;
        if (o.fresh || o.shown !== (o.broken ? 2 : o.cracked ? 1 : 0)) {
          o.fresh = false; o.shown = o.broken ? 2 : o.cracked ? 1 : 0;
          u.pp.plaka_saglam.visible = !o.cracked; u.pp.plaka_catlak.visible = false; u.pp.catlakUst.visible = o.cracked && !o.broken;
          for (const pc of u.pieces) { pc.o.visible = o.broken; pc.o.position.copy(pc.base); pc.o.rotation.set(0, 0, 0); pc.v = 0; }
        }
        if (o.broken) for (const pc of u.pieces) {
          pc.v += 7 * dt; pc.o.position.y = Math.max(pc.base.y - 1.2, pc.o.position.y - pc.v * dt);
          pc.o.rotation.x += pc.spin * dt; pc.o.rotation.z += pc.spin * 0.6 * dt;
        }
        break;
      }
      case "wall": { const m = obtain(o.v || "wall", o); m.position.set(lx, 0, o.z); if (o.v) m.rotation.y = o.lane * 1.7; break; }
      case "arch": { const m = obtain(o.v || "arch", o); m.position.set(lx, 0, o.z); break; }
      case "gap": {
        if (o.full) {
          const m = obtain(o.sw ? "ditch" : o.water ? "crevasseW" : "crevasse", o); m.position.set(0, 0, o.z);
          // Mosasaurus: sulu yarıktan sıçrayıp karşıya atlar
          if (o.mosa) {
            if (o.mosaT == null && o.z > -30 && state.mode === "run") { o.mosaT = 0; SFX.roar(); }
            if (o.mosaT != null && o.mosaT < 1) {
              o.mosaT = Math.min(1, o.mosaT + dt / 1.5);
              const mo = obtain(o.sw ? "crocJump" : "mosa", o.mosaObj || (o.mosaObj = {})), k = o.mosaT, dir = o.mosaDir;
              const wc = o.sw ? ["#ffffff", "#bfe8c0", "#2f9c8c"] : ["#ffffff", "#bfeaff", "#3d9be0"];
              mo.position.set(dir * lerp(-3.6, 3.6, k), o.sw ? -1.3 + Math.sin(Math.PI * k) * 3.4 : -1.8 + Math.sin(Math.PI * k) * 5.2, o.z);
              mo.rotation.set(0, dir * Math.PI / 2, 0); mo.rotateX(-Math.cos(Math.PI * k) * 0.9);
              if (o.sw) poseCroc(mo, t, { open: 0.4 + 0.6 * Math.abs(Math.sin(t * 8)), sway: 1.5 });
              if (!o.splash1 && k > 0.12) { o.splash1 = true; emit(26, _fp.set(dir * -2.6, 0.2, o.z), wc, { speed: 5, up: 7, size: 0.9, life: 0.9, grav: 14, spread: 1.4 }); }
              if (!o.splash2 && k > 0.88) { o.splash2 = true; emit(26, _fp.set(dir * 2.6, 0.2, o.z), wc, { speed: 5, up: 7, size: 0.9, life: 0.9, grav: 14, spread: 1.4 }); SFX.splash(); }
            }
          }
          break;
        }
        const m = obtain("gap", o); m.position.set(lx, 0, o.z);
        const L = o.len;
        m.getObjectByName("hole").scale.set(1, L, 1);
        m.getObjectByName("inner").position.set(0, -1.3, -L / 2 + 0.02);
        m.getObjectByName("lipA").position.set(0, 0.02, -L / 2 - 0.1);
        m.getObjectByName("lipB").position.set(0, 0.02, L / 2 + 0.1);
        break;
      }
      case "mammoth": {
        const m = obtain("enemy:" + (o.kind || "mamut"), o);
        if (o.flee) o.fx = Math.min(1, (o.fx || 0) + dt * 2.2);
        const away = o.lane === 0 ? -1 : 1;
        const fxv = o.fx || 0;
        m.position.set(lx + fxv * away * 9, 0, o.z);
        m.rotation.set(0, fxv * away * 1.2, 0);
        const atk = o.attack && !o.flee;
        animEnemy(m, atk ? (o.kind === "ayi" ? "attack" : "tuskattack") : "run", dt, { once: atk, ts: atk ? 1.3 : 1.25 });
        break;
      }
    }
  }
}

// Kovalayan sürü (arkadan, iki yanda): solda mamut, sağda kutup ayısı (yüklemede kurulur)
let herd = [];
// Bölüm 2: arkadan kovalayan dev Sarcosuchus (yüklemede kurulur)
let boss = null;

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
let camFov = 60, menuSpin = 0, camBoss = 0;
const camPos = new THREE.Vector3(0, 4, 8), camLook = new THREE.Vector3();
function activeDino() { return DINO_OBJ[state.dinoKey] || DINO_OBJ.sunny; }
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
  const inRun = run && (state.mode === "run" || state.mode === "over" || state.mode === "win");
  const wantTheme = inRun ? run.level || 1 : 1;
  if (wantTheme !== curTheme) applyTheme(wantTheme);
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
      goal.children.forEach((c) => {
        if (c.name === "flag") { const p = c.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(t * 4 + p.getY(i) * 2 + c.position.x) * 0.06 * (1.3 - p.getY(i) / 2.6)); p.needsUpdate = true; }
        if (c.name === "floe") c.position.y = 0.08 + Math.sin(t + c.position.x) * 0.05;
      });
      // dinozor geçince damalı şerit kopar
      const tp = goal.getObjectByName("tape"), broke = gz > -0.2;
      tp.children.forEach((h) => { h.rotation.y = damp(h.rotation.y, broke ? -h.userData.sx * 1.3 : 0, 4, dt); h.rotation.z = damp(h.rotation.z, broke ? h.userData.sx * 0.5 : 0, 3, dt); });
      if (broke && !R.confetti) { R.confetti = true; for (let k = 0; k < 6; k++) setTimeout(() => emit(40, _fp.set(R.x + (rnd() - 0.5) * 4, 4.5, -1), ["#ffd23a", "#2f7bff", "#ffffff", "#ff5a3a", "#3fd36a"], { speed: 7, up: 4, size: 0.7, life: 2.2, grav: 3, spread: 4, follow: false }), k * 180); }
    }
    // sel dalgası
    floodWave.visible = R.flood >= 0;
    if (floodWave.visible) {
      const k = clamp(R.flood / FLOOD_T, 0, 1), e = k * k * (3 - 2 * k);
      floodWave.position.set(0, 0, lerp(-110, 8, e));
      floodWave.scale.set(1, lerp(0.35, 1.15, Math.min(1, k * 1.6)), 1);
      floodWave.userData.foam.forEach((f, i) => { f.position.y = 6.2 + Math.sin(t * 6 + i) * 0.25; f.rotation.y = t * (i % 2 ? 1 : -1); });
      if (floodWave.userData.mat) floodWave.userData.mat.map.offset.y = -t * 0.6;
      floodWave.children.forEach((c, i) => { if (c.children[0]) c.children[0].position.y = Math.sin(t * 3 + i) * 0.04; });
      if (rnd() < dt * 40) emit(2, _fp.set((rnd() - 0.5) * 16, 5.5 * floodWave.scale.y, floodWave.position.z + 1), ["#ffffff", "#d6f1ff", "#7fc6f0"], { speed: 5, up: 5, size: 0.9, life: 0.8, grav: 10, spread: 2, follow: false });
      const near = clamp((floodWave.position.z + 20) / 22, 0, 1);
      $("sel").style.opacity = clamp((k - 0.82) / 0.12, 0, 1).toFixed(2);
      R.shake = Math.max(R.shake, 0.15 + near * 0.5);
    }
    // kovalayan sürü
    const showHerd = R.chase > 0.05 && R.buffs.ghost <= 0;
    const caughtNow = state.mode === "over" && !R.fellWater;
    const swamp = R.level === 2;
    if (boss) {
      boss.visible = swamp && (showHerd || caughtNow);
      if (boss.visible) {
        if (caughtNow) {
          // yakaladı: dev timsah ağzını açıp üstüne atılır
          boss.position.set(damp(boss.position.x, R.x, 6, dt), 0, damp(boss.position.z, 4.6, 5, dt));
          boss.rotation.set(0, Math.PI, 0);
          poseCroc(boss, t, { open: 0.6 + 0.4 * Math.abs(Math.sin(t * 6)), walk: 0.3 });
        } else {
          const c = R.chase;
          // kafa ucu ~1.6-4.8 m arkada: kovalama arttıkça ekranın altında ağzı belirir (kök = kafa + 5 m)
          boss.position.set(damp(boss.position.x, clamp(R.x - 1.4, -3, 3), 3, dt), 0, 1.1 + (1 - c) * 2.8 + 4.1);
          boss.rotation.set(0, Math.PI + 0.1, 0);
          poseCroc(boss, t, { open: 0.25 + 0.35 * Math.abs(Math.sin(t * 2.2)), walk: playing ? 1 : 0, sway: 1 });
        }
      }
    }
    herd.forEach((m, i) => {
      m.visible = !swamp && (showHerd || caughtNow);
      if (!m.visible) return;
      const sx = i ? 1 : -1, c = R.chase;
      if (caughtNow) {
        // yakaladılar: mamut arkadan şahlanıp basar, ayı yanından saldırır
        const me = i === (R.lastFoe === "ayi" ? 1 : 0);
        m.position.set(R.x + (me ? 0 : sx * 2.6), 0, me ? 3.6 : 3.2);
        const nm = me ? "attack" : m.userData.actor.actions.roar ? "roar" : "idle";
        animEnemy(m, nm, dt, { once: nm !== "idle" });
      } else {
        m.position.set(sx * (3.7 + (1 - c) * 2.5), 0, 3.4 + (1 - c) * 7 + i * 1.3);
        animEnemy(m, "run", playing ? dt : 0, { ts: 1.35 });
      }
    });

    // dinozor
    if (d) {
      const P = d.pivot;
      P.position.set(R.x, R.y, 0);
      // soluklanırken ekrana döner
      d.turn = damp(d.turn || 0, R.rest > 0 ? Math.PI : 0, 7, dt);
      P.rotation.set(0, -R.lean * 0.15 + d.turn, R.lean * 0.06);
      const grow = 1 + clamp(R.food / 160, 0, 1) * 0.12;
      d.inner.scale.setScalar(grow); d.inner.rotation.x = 0;
      if (R.rest > 0 && !d.actions.tired) { const br = Math.sin(t * 13) * 0.035; d.inner.scale.set(grow * (1 + br * 0.6), grow * (1 - br), grow * (1 + br * 0.6)); d.inner.rotation.x = 0.12; }
      // animasyon durumu
      const A = (n, o) => playAnim(d, n, o);
      const dur = (n) => d.actions[n].getClip().duration;
      if (state.mode === "over") { const n = R.fellWater && d.actions.fallwater ? "fallwater" : "caught"; if (d.cur !== n) A(n, { once: true, fade: 0.1 }); }
      else if (R.flood >= 0 && R.flood > 2.6) { const n = d.actions.fallwater ? "fallwater" : "hit"; if (d.cur !== n) A(n, { once: true, fade: 0.15 }); }
      else if (state.mode === "win" || R.finished) { if (d.cur !== "win") A("win", { fade: 0.25 }); }
      else if (R.rest > 0) { const n = d.actions.tired ? "tired" : "idle"; if (d.cur !== n) A(n, { fade: 0.25, ts: d.actions.tired ? 1 : 2.4 }); }
      else if (R.intro > 0) {
        if (d.actions.wakeup && !R.dist) { if (d.cur !== "wakeup") A("wakeup", { once: true, fade: 0.05, ts: dur("wakeup") / (INTRO_T[d.key] - 0.15) }); }
        else if (d.cur !== "idle") A("idle", { fade: 0.2 });
      } else {
        if (R.req) {
          const n = R.req; R.req = null;
          const ok = d.actions[n] && !(R.air && /^(lane|slip|shiver)/.test(n)) && !(R.slide > 0 && n !== "hit");
          if (ok) A(n, { once: true, fade: 0.07, ts: n.startsWith("lane") ? dur(n) / 0.42 : n === "slash" ? 1.4 : n === "hit" ? 1.3 : 1.1 });
        }
        if (R.air && (!d.lastAir || R.vy > d.lastVy + 3)) {
          const nm = d.lastAir && d.actions.doublejump ? "doublejump" : "jump";
          const air = Math.max(0.35, (2 * Math.max(R.vy, 6)) / 32);
          A(nm, { once: true, ts: dur(nm) / air, fade: 0.08 });
        } else if (!R.air) {
          if (d.lastAir) fx("land");
          if (R.slide > 0) { if (d.cur !== "slide") A("slide", { once: true, ts: dur("slide") / 0.75, fade: 0.08 }); }
          else if (!animBusy(d) || ["jump", "doublejump", "slide"].includes(d.cur)) {
            const wade = R.mudSlow > 0 && d.actions.wade;
            const nm = R.sprint > 0 || R.buffs.sprint > 0 || R.buffs.rage > 0 ? "sprint" : wade ? "wade" : "run";
            A(nm, { fade: 0.12, ts: clamp(R.speed / 16, 0.75, 1.5) * (R.onSlick ? 0.8 : 1) * (R.mudSlow > 0 && !wade ? 0.75 : 1) });
          }
        }
      }
      d.lastAir = R.air; d.lastVy = R.vy;
      tickDino(d, playing || state.mode !== "run" ? dt : 0);
      const blink = R.invuln > 0 && Math.floor(t * 14) % 2 === 0 && state.mode === "run";
      P.visible = !blink;
      setDinoLook(d, { ghost: R.buffs.ghost > 0, tint: R.buffs.rage > 0 ? "#ff3010" : R.sprint > 0 || R.buffs.sprint > 0 ? "#ff8a20" : null, k: R.buffs.rage > 0 ? 0.55 : 0.22 });
      // ayak tozları
      if (playing && !R.air && rnd() < dt * 14) emit(1, _fp.set(R.x + (rnd() - 0.5) * 0.6, 0.08, 0.9), swamp ? "#9a7a4a" : "#eef7ff", { speed: 2, up: 1.2, size: 0.32, life: 0.4, grav: 4, spread: 0.3 });
      updateSweat(dt, R.rest > 0 && state.mode === "run", R.x, R.y);
      armorBubble.visible = !!R.buffs.armor;
      if (armorBubble.visible) { armorBubble.position.set(R.x, R.y + 0.95, 0); armorBubble.scale.set(1.45, 1.35, 2.2); armorBubble.material.uniforms.uT.value = t; }
      magnetRing.visible = R.buffs.magnet > 0;
      if (magnetRing.visible) { magnetRing.position.set(R.x, R.y + 0.08, 0); magnetRing.rotation.z = t * 3; magnetRing.scale.setScalar(1 + Math.sin(t * 6) * 0.06); }
    }
    // kamera
    const shake = R.shake > 0 ? (rnd() - 0.5) * R.shake * 0.7 : 0;
    const fast = R.sprint > 0 || R.buffs.sprint > 0 || R.buffs.rage > 0;
    camFov = damp(camFov, (portrait ? 68 : 56) + (fast ? 8 : 0), 5, dt);
    if (state.mode === "over") {
      // yakalanma anı: yandan bakış
      camPos.lerp(_v.set(R.x + 7.5, 2.6, 2.2), 1 - Math.exp(-dt * 3)); camLook.lerp(_s.set(R.x, 1.2, 1.2), 1 - Math.exp(-dt * 3));
    } else if (R.flood >= 0) {
      // sel: kamera geri ve yukarı çekilir, dev dalga karşıdan gelir
      const k = clamp(R.flood / 1.2, 0, 1);
      camPos.lerp(_v.set(R.x * 0.5 + shake * 3, lerp(3.95, 8.6, k), lerp(7.3, 11.5, k)), 1 - Math.exp(-dt * 3));
      camLook.lerp(_s.set(0, 1.5, -30), 1 - Math.exp(-dt * 3));
    } else if (R.intro > 0 && !R.dist) {
      // açılış: önden yakın plan, sonra arkaya geç
      const k = clamp(R.intro / (INTRO_T[state.dinoKey] || 1.2), 0, 1);
      const e = k * k * (3 - 2 * k), ang = e * Math.PI * 0.92, rad = lerp(7.3, 4.6, e);
      camPos.set(R.x + Math.sin(ang) * rad, lerp(3.95, 1.7, e), Math.cos(ang) * rad);
      camLook.set(R.x, lerp(1.35, 0.95, e), lerp(-10, 0, Math.min(1, e * 1.6)));
    } else {
      // dev timsah takibinde kamera biraz geri/yukarı: arkadan gelen timsah görünsün
      camBoss = damp(camBoss, R.level === 2 && R.boss && !R.finished ? 1 : 0, 1.5, dt);
      camPos.set(R.x * 0.6 + shake, 3.95 + R.y * 0.35 + camBoss * 0.6, 7.3 + camBoss * 1.6);
      camLook.set(R.x * 0.75, 1.35 + R.y * 0.3, -10);
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
    // tipi görünümü: sis yaklaşır, ekran kenarları buzlanır
    const wk = R.wind > 0 ? Math.min(1, R.wind, 4.5 - R.wind + 0.2) : 0;
    // sivrisinek sürüsü: ekran kenarları kararır, görüş kısalır
    const bk = R.bugs > 0 ? Math.min(1, R.bugs, 5.5 - R.bugs + 0.2) : 0;
    const fk = Math.max(wk, bk * 0.6), fogNear = swamp ? 45 : 60, fogFar = swamp ? 330 : 420;
    scene.fog.near = damp(scene.fog.near, lerp(fogNear, 14, fk), 3, dt); scene.fog.far = damp(scene.fog.far, lerp(fogFar, 190, fk), 3, dt);
    $("sinek").style.opacity = bk.toFixed(2);
    updateBugs(bk, t, R.x, R.y);
    snowPts.material.size = 0.16 + wk * 0.22;
    scene.fog.color.copy(FOG_COL).lerp(_c.set("#eef6ff"), wk * 0.7);
    $("tipi").style.opacity = wk.toFixed(2); $("tipi").style.transform = (R.windDir || 1) > 0 ? "scaleX(-1)" : "none";
    updateBlizzard(dt, wk, R.windDir || 1, v, R.x);
    $("frost").style.opacity = clamp((R.frost - 0.45) / 0.55, 0, 1).toFixed(2);
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
    updateSnow(dt, v * 0.4 + 0.5, R.x, R.wind > 0 ? (R.windDir || 1) : 0);
    updateFx(dt, v);
  } else {
    // menü: dinozor ortada, kamera yavaşça çevresinde döner
    scrollGround(0);
    syncProps(menuProps);
    goal.visible = false; herd.forEach((m) => (m.visible = false)); if (boss) boss.visible = false;
    updateBugs(0, t, 0, 0); $("sinek").style.opacity = 0;
    scene.fog.near = 60; scene.fog.far = 420; $("tipi").style.opacity = 0; updateBlizzard(dt, 0, 1, 0, 0); $("frost").style.opacity = 0;
    armorBubble.visible = false; magnetRing.visible = false; streaks.visible = false;
    if (d) {
      d.pivot.position.set(0, 0, 0); d.pivot.rotation.set(0, 0, 0);
      d.inner.scale.set(1, 1, 1); d.inner.rotation.x = 0;
      setDinoLook(d, {});
      d.roarT -= dt;
      if (d.cur !== "idle" && d.cur !== "win" && d.cur !== "eat") playAnim(d, "idle");
      if ((d.cur === "win" || d.cur === "eat") && !d.curAction.isRunning()) playAnim(d, "idle", { fade: 0.35 });
      if (d.roarT <= 0) { d.roarT = 5 + rnd() * 3; playAnim(d, rnd() < 0.6 ? "win" : "eat", { once: true, fade: 0.25 }); }
      tickDino(d, dt);
    }
    menuSpin += dt * 0.22;
    const chars = !$("scr-chars").hidden;
    const r = chars && !portrait ? 8.6 : portrait ? 6.6 : 5.6;
    const a = chars ? -0.9 + Math.sin(menuSpin * 0.7) * 0.25 : menuSpin - 0.6;
    camera.position.set(Math.sin(a) * r, chars ? 1.6 : 2.3, Math.cos(a) * r);
    camLook.set(0, chars ? (portrait ? 1.0 : 0.95) : 1.05, 0);
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
  const hh = '<i class="h"></i>'.repeat(Math.max(0, R.hearts)) + '<i class="h off"></i>'.repeat(Math.max(0, 3 - R.hearts));
  if ($("hearts").dataset.h !== hh) { $("hearts").innerHTML = hh; $("hearts").dataset.h = hh; }
  const p = clamp(R.dist / LEVEL.length, 0, 1);
  $("prog-fill").style.width = p * 100 + "%";
  $("prog-me").style.left = p * 100 + "%";
  const mt = Math.ceil(R.meat);
  if ($("food").textContent !== String(mt)) $("food").textContent = mt;
  // ibre: işaretler tüpün %10.4 (dur) ve %42.9'unda (yavaşla) — et değeri parça parça eşlenir
  const m = clamp(R.meat, 0, MEAT.max);
  const ek = m <= MEAT.stop ? (m / MEAT.stop) * 0.104 : m <= MEAT.slow ? 0.104 + ((m - MEAT.stop) / (MEAT.slow - MEAT.stop)) * (0.429 - 0.104) : 0.429 + ((m - MEAT.slow) / (MEAT.max - MEAT.slow)) * (1 - 0.429);
  $("en-fill").style.height = (ek * 100).toFixed(1) + "%";
  const th = $("en-fill").parentNode.clientHeight + "px";
  if ($("energy").style.getPropertyValue("--th") !== th) $("energy").style.setProperty("--th", th);
  $("en-num").textContent = mt;
  const ec = "energy" + (R.meat <= MEAT.stop + 3 ? " crit" : R.meat <= MEAT.slow ? " low" : "");
  if ($("energy").className !== ec) $("energy").className = ec;
  // çanta düğmeleri
  const shown = INV_KEYS.filter((k) => R.inv[k] > 0 || R.buffs[k] > 0);
  const inv = shown.map((k) => {
    const on = R.buffs[k] > 0;
    return `<button class="item${on ? " on" : ""}${R.invPulse === k ? " new" : ""}" data-k="${k}" style="--c:${BUFFS[k].col}" aria-label="${BUFFS[k].name}"><span>${BUFFS[k].icon}</span>${R.inv[k] > 0 ? `<b>${R.inv[k]}</b>` : ""}</button>`;
  }).join("");
  if ($("inv").dataset.h !== inv) { $("inv").innerHTML = inv; $("inv").dataset.h = inv; if (R.invPulse) setTimeout(() => { if (run) run.invPulse = null; }, 900); }
  // süre halkası: düğmeyi yeniden çizmeden güncelle (dokunuş kaçmasın)
  for (const el of $("inv").children) { const k = el.dataset.k; el.style.setProperty("--p", (R.buffs[k] > 0 ? Math.round((R.buffs[k] / BUFFS[k].dur) * 100) : 100) + "%"); }
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
  if (R.buffs.armor) chips.push(`<div class="buff">🐢 Kalkan hazır</div>`);
  for (const k of ["rage", "slow", "ghost", "magnet", "jump", "double", "sprint"]) if (R.buffs[k] > 0)
    chips.push(`<div class="buff">${BUFFS[k].icon} ${BUFFS[k].name}<span class="bar"><i style="width:${(R.buffs[k] / BUFFS[k].dur) * 100}%"></i></span></div>`);
  const html = chips.join("");
  if ($("buffs").dataset.h !== html) { $("buffs").innerHTML = html; $("buffs").dataset.h = html; }
}

// ------------------------------------------------------------------ ekranlar
const SCREENS = ["scr-load", "scr-title", "scr-story", "scr-map", "scr-chars", "scr-pause", "scr-over", "scr-win", "scr-unlock"];
function show(id) { SCREENS.forEach((s) => ($(s).hidden = s !== id)); }

const STORY = [
  { img: "img/hikaye1.jpg", h: "Büyük deprem", p: "Bir sabah yer öyle sarsıldı ki koca bir kıta parçası koptu ve okyanusa doğru sürüklendi." },
  { img: "img/hikaye2.jpg", h: "KUTUPLARDA MAHSUR", ice: true, p: "Yavru dinozorlar gözlerini açtığında kendilerini buzulların ortasında buldu. Aileleri çok uzaktaydı." },
  { img: "img/hikaye3.jpg", h: "Tehlikeli yol", p: "Mamutlar, kutup ayıları, dev timsahlar, yırtıcı sürüler… Eve giden yol kolay değil. Ama yalnız değilsin." },
  { img: "img/hikaye4.jpg", h: "Görevin", p: "Yavruları beş zorlu bölgeden geçirip vadiye, ailelerine ulaştır. Her bölgede <span class=\"hl\">yeni bir dinozor arkadaş katılacak!</span>" }
];
let storyI = 0;
// resimleri önceden yükle
STORY.forEach((s) => { const i = new Image(); i.src = s.img; });
function renderStory() {
  const s = STORY[storyI];
  const im = $("story-img"); im.src = s.img; im.style.animation = "none"; void im.offsetWidth; im.style.animation = "";
  $("story-h").textContent = s.h; $("story-h").className = "fx" + (s.ice ? " buzlu" : "");
  $("story-p").innerHTML = s.p;
  $("story-dots").innerHTML = STORY.map((_, i) => `<i class="${i === storyI ? "on" : ""}"></i>`).join("");
  $("b-story-next").textContent = storyI === STORY.length - 1 ? "Haydi!" : "İleri";
}

const STAGES = [
  { n: 1, name: "Buzullar Arasında Mahsur", lab: "Düşman", foe: "🦣 🐻‍❄️", enemy: "Mamutlar ve kutup ayıları", art: "img/harita_b1.jpg" },
  { n: 2, name: "Bataklık Felaketi", lab: "Düşman", foe: "🐊", enemy: "Dev Sarcosuchus timsahları", art: "img/harita_b2.jpg" },
  { n: 3, name: "Lav Bölgesi", lab: "Tehlike", foe: "🔥", enemy: "Meteorlar, lav ve Megalania", art: "img/harita_b3.jpg" },
  { n: 4, name: "Yırtıcı Orman", lab: "Düşman", foe: "🐅 🦅", enemy: "Kılıç dişli kaplan ve yırtıcı kuşlar", art: "img/harita_b4.jpg" },
  { n: 5, name: "Dinozor Vadisi", lab: "Boss", foe: "🦏", enemy: "Elasmotherium", art: "img/harita_b5.jpg" }
];
function renderMap() {
  $("map").innerHTML = STAGES.map((s) => {
    const open = s.n <= 2; // Bölüm 2 test için açık
    const best = (s.n === 1 ? state.best.stars : state.best["s" + s.n]) || 0;
    const right = open ? (best ? `<span class="sts3">${[0, 1, 2].map((i) => `<span class="${i < best ? "" : "off"}">★</span>`).join("")}</span>` : `<span class="pill go">BAŞLA ▸</span>`) : `<span class="pill">🔒 YAKINDA</span>`;
    return `<button class="stage ${open ? "open" : "locked"}" data-stage="${s.n}" ${open ? "" : "disabled"}>
      <span class="art" style="background-image:url(${s.art})"></span>
      <span class="n">${open ? `<i>${s.n}</i>` : "🔒"}</span>
      <span class="txt"><b class="fx buzlu">${s.n}. ${s.name}</b><small>${s.lab}: ${s.foe} ${s.enemy}</small></span>
      <span class="st">${right}</span></button>`;
  }).join("");
}
function renderDiff() {
  $("diff").innerHTML = Object.entries(DIFFS).map(([k, d]) => `<button class="dpill ${state.diff === k ? "on" : ""}" data-diff="${k}">${d.icon} ${d.name}</button>`).join("");
}
function renderChars() {
  renderDiff();
  $("chars").innerHTML = Object.entries(DINOS).map(([k, d]) => {
    const locked = !state.unlocked.includes(k);
    return `<button class="char ${state.dinoKey === k ? "sel" : ""} ${locked ? "locked" : ""}" data-dino="${k}" ${locked ? "disabled" : ""}>
      <span class="pt"><img src="${d.portrait}" alt=""></span>
      <span><b class="fx ${state.dinoKey === k ? "" : "buzlu"}">${locked ? "🔒 " : ""}${d.name}</b><small>${locked ? d.short : d.ability.icon + " " + d.tag}</small></span>
      <span class="sts">${Object.entries(d.stats).map(([n, v]) => `<span class="stat">${n}<i style="--v:${v}%"></i></span>`).join("")}</span></button>`;
  }).join("");
  $("locked-row").innerHTML = LOCKED_SOON.map((d) => `<div class="char locked mini" title="${d.short}"><span class="pt"><img src="${d.portrait}" alt=""></span><b><span class="lock">🔒</span> ${d.name}</b></div>`).join("");
  const d = DINOS[state.dinoKey];
  $("char-desc").textContent = `${d.name}: ${d.ability.desc}`;
}
/** Oklarla açık dinozorlar arasında gez */
function stepDino(dir) {
  const keys = Object.keys(DINOS).filter((k) => state.unlocked.includes(k));
  const i = keys.indexOf(state.dinoKey);
  state.dinoKey = keys[(i + dir + keys.length) % keys.length]; store.set("dino", state.dinoKey);
  renderChars(); const dd = DINO_OBJ[state.dinoKey]; if (dd) dd.roarT = 0;
}

function startRun(fromDist = 0) {
  audio();
  Object.assign(LEVEL, LEVELS[state.level] || LEVELS[1]);
  document.body.dataset.lv = LEVEL.n; // gösterge teması (Bölüm 1: buz tasarımı)
  $("sel").style.opacity = 0; $("selvid").hidden = true; floodWave.visible = false;
  newRun(fromDist);
  state.mode = "run"; state.paused = false;
  show(null); $("hud").hidden = false;
  const def = DINOS[state.dinoKey];
  $("prog-me").innerHTML = `<img src="${def.portrait}" alt="">`;
  $("ab-icon").textContent = def.ability.icon; $("ab-name").textContent = def.ability.name; $("hint-ab").textContent = def.ability.name.toLocaleLowerCase("tr-TR");
  $("prog").querySelectorAll(".cp").forEach((e) => e.remove());
  LEVEL.checkpoints.forEach((c) => { const e = document.createElement("span"); e.className = "cp"; e.style.left = (c / LEVEL.length) * 100 + "%"; $("trk").appendChild(e); });
  const hint = $("hint"); hint.style.opacity = 1; clearTimeout(startRun.h); startRun.h = setTimeout(() => (hint.style.opacity = 0), 6000);
  if (!fromDist) {
    const it = $("intro"); it.hidden = false; it.style.opacity = 1;
    it.style.backgroundImage = `url(${LEVEL.intro})`; it.querySelector("img").src = LEVEL.intro;
    clearTimeout(startRun.i); startRun.i = setTimeout(() => { it.style.opacity = 0; startRun.i = setTimeout(() => (it.hidden = true), 650); }, 1300);
  }
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
  $("win-stars").innerHTML = [0, 1, 2].map((i) => `<span class="st ${i < stars ? "on" : ""}">★</span>`).join("");
  const sw = LEVEL.n === 2;
  floodWave.visible = false;
  $("b-win-next").hidden = !LEVELS[LEVEL.n + 1];
  $("win-p").textContent = `${R.food} et yedin (%${Math.round(ratio * 100)}). ` + (sw ? "Yavrular bataklığı geçti, sırada Lav Bölgesi var!" : (R.flood >= 0 || floodVideoOK ? "Dev sel yavruları bataklığa sürükledi! Sırada Bataklık Felaketi var." : "Yavrular kıyıya vardı, sırada Bataklık var!"));
  if (sw) state.best.s2 = Math.max(state.best.s2 || 0, stars); else state.best.stars = Math.max(state.best.stars || 0, stars);
  store.set("best", state.best);
  const un = $("win-unlock");
  if (sw) { un.hidden = false; un.textContent = "🦕 Triceratops yakında katılıyor! Modeli hazır olunca bu bölümün ödülü olacak."; }
  else un.hidden = true;
  $("hud").hidden = true;
  // Sıralı açılma: her bölüm sonunda sıradaki dinozor (Raptor → Triceratops → Stegosaurus → T-Rex)
  const nk = UNLOCK_ORDER[LEVEL.n - 1];
  if (nk && DINOS[nk] && !state.unlocked.includes(nk)) {
    state.unlocked.push(nk); store.set("unlocked", state.unlocked);
    showUnlock(nk, $("win-stars").innerHTML); return;
  }
  show("scr-win");
}
const UNLOCK_ORDER = ["raptor", "trike", "stego", "trex"];
/** "Yeni dinozor açıldı" ekranı. Web/video/acilis_<dino>.mp4 varsa önce o oynar, sonunda dinozor açılır. */
function showUnlock(k, starsHtml) {
  const d = DINOS[k], scr = $("scr-unlock"), st = $("un-stage"), vid = $("un-vid"), img = $("un-img");
  $("un-stars").innerHTML = starsHtml || "";
  img.src = d.portrait; $("un-name").textContent = d.name; $("un-p").textContent = d.ability.desc.split(". ").slice(0, 2).join(". ") + ".";
  scr.classList.remove("done"); st.classList.remove("on", "shake"); img.hidden = false; vid.hidden = true;
  show("scr-unlock");
  const reveal = () => {
    vid.hidden = true; img.hidden = false;
    st.classList.add("shake"); SFX.food();
    setTimeout(() => { st.classList.remove("shake"); st.classList.add("on"); SFX.win(); }, 700);
    setTimeout(() => scr.classList.add("done"), 1500);
  };
  // kullanıcının açılış animasyonu (hazır olunca)
  vid.onerror = null; vid.onended = null; vid.onloadeddata = null;
  let started = false;
  vid.onloadeddata = () => { if (started) return; started = true; img.hidden = true; vid.hidden = false; vid.muted = muted; vid.play().catch(() => { vid.muted = true; vid.play().catch(reveal); }); };
  vid.onended = reveal; vid.onerror = () => { if (!started) { started = true; setTimeout(reveal, 500); } };
  vid.src = "video/acilis_" + k + ".mp4"; vid.load();
  setTimeout(() => { if (!started) { started = true; reveal(); } }, 1200);
}

// düğmeler
$("b-play").onclick = () => { audio(); if (!store.get("storySeen", false)) { storyI = 0; renderStory(); show("scr-story"); } else { renderMap(); show("scr-map"); } };
$("b-story").onclick = () => { audio(); storyI = 0; renderStory(); show("scr-story"); };
$("b-story-next").onclick = () => { if (storyI < STORY.length - 1) { storyI++; renderStory(); } else { store.set("storySeen", true); renderMap(); show("scr-map"); } };
$("b-map-back").onclick = () => show("scr-title");
$("map").onclick = (e) => { const b = e.target.closest("[data-stage]"); if (b && !b.disabled && LEVELS[b.dataset.stage]) { state.level = +b.dataset.stage; renderChars(); show("scr-chars"); } };
$("chars").onclick = (e) => { const b = e.target.closest("[data-dino]"); if (!b || b.disabled) return; state.dinoKey = b.dataset.dino; store.set("dino", state.dinoKey); renderChars(); const dd = DINO_OBJ[state.dinoKey]; if (dd) { dd.roarT = 0; } };
$("diff").onclick = (e) => { const b = e.target.closest("[data-diff]"); if (!b) return; state.diff = b.dataset.diff; store.set("diff", state.diff); renderDiff(); };
$("b-prev").onclick = () => stepDino(-1);
$("b-next").onclick = () => stepDino(1);
$("b-chars-back").onclick = () => { renderMap(); show("scr-map"); };
$("b-go").onclick = () => startRun(0);
$("b-pause").onclick = togglePause;
$("b-resume").onclick = togglePause;
$("b-quit").onclick = () => { state.mode = "menu"; state.paused = false; stopMusic(); $("hud").hidden = true; renderMap(); show("scr-map"); };
$("b-continue").onclick = () => startRun(run.checkpoint);
$("b-restart").onclick = () => startRun(0);
$("b-win-map").onclick = () => { state.mode = "menu"; $("sel").style.opacity = 0; renderMap(); show("scr-map"); };
$("b-win-again").onclick = () => startRun(0);
$("b-win-next").onclick = () => { if (LEVELS[LEVEL.n + 1]) { state.level = LEVEL.n + 1; state.mode = "menu"; $("sel").style.opacity = 0; renderChars(); show("scr-chars"); } };
$("b-un-go").onclick = () => {
  const k = UNLOCK_ORDER[LEVEL.n - 1]; if (k && DINOS[k]) { state.dinoKey = k; store.set("dino", k); }
  state.level = LEVELS[LEVEL.n + 1] ? LEVEL.n + 1 : LEVEL.n; state.mode = "menu"; $("sel").style.opacity = 0;
  renderChars(); show("scr-chars"); const dd = DINO_OBJ[state.dinoKey]; if (dd) dd.roarT = 0;
};
$("b-ability").addEventListener("pointerdown", (e) => { e.stopPropagation(); audio(); act("ability"); });
$("inv").addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; e.stopPropagation(); e.preventDefault(); audio(); act("use:" + b.dataset.k); });
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
  const bar = $("load-bar"), total = H1_FILES.length + 1;
  let done = 0;
  const tick = () => { done++; bar.style.width = Math.round((done / total) * 100) + "%"; };
  try {
    await Promise.all([...H1_FILES.map((n) => loadH1(n).then(tick)), buildMountains().then(tick), buildRoad()]);
    try { await document.fonts.load('80px "Titan TR"'); } catch {}
    goal.userData.drawBanner();
    buildFloodWave();
    for (const k of Object.keys(MODEL)) loadDino(k);
    herd = [FACTORY["enemy:mamut"](), FACTORY["enemy:ayi"]()];
    herd.forEach((m) => { m.rotation.y = Math.PI; m.visible = false; scene.add(m); });
    boss = FACTORY.sarco(); boss.visible = false; scene.add(boss);
    // gölgelendiricileri önceden derle: her nesneden bir tane havuza koy
    const warm = ["food", "gold", "ice", "log", "wall", "arch", "gap", "crevasse", "crevasseW", "plate", "slick", "fall", "mosa", "aval", "enemy:mamut", "enemy:ayi", "pine0", "pine1", "crystal", "rock", "drift",
      ...Object.entries(BUFF_MODELS).flatMap(([k, list]) => list.map((m) => "buff:" + k + "|" + m)), "buff:jump|buff_mor_meyve",
      "mangrove0", "mangrove1", "cypress", "reeds", "lily", "stump", "mlog", "vine", "trunk", "mud", "croc", "plank", "ditch", "crocJump", "monstera"];
    const made = warm.map((k) => { const m = k.startsWith("buff:") ? buffFactory(k.slice(5))() : FACTORY[k](); m.userData.poolKey = k; m.position.set(0, -60, -20); world.add(m); return m; });
    for (const k in DINO_OBJ) DINO_OBJ[k].pivot.visible = true;
    renderer.compile(scene, camera);
    made.forEach((m) => { m.visible = false; const key = m.userData.poolKey; if (!pools.has(key)) pools.set(key, []); pools.get(key).push(m); });
  } catch (err) {
    console.error(err);
    $("load-msg").textContent = "Modeller yüklenemedi. Sayfayı yenilemeyi dene. (" + (err && err.message || err) + ")";
    return;
  }
  if (!DINOS[state.dinoKey] || !state.unlocked.includes(state.dinoKey)) state.dinoKey = "sunny";
  show("scr-title");
  requestAnimationFrame((n) => { last = n; frame(n); });
})();
// Parlak 3B başlık efekti: .fx öğelerinin yazısını data-t'ye kopyala (gölge/kontur katmanı için)
function fxSync() { document.querySelectorAll(".fx").forEach((e) => { if (e.dataset.t !== e.textContent) e.dataset.t = e.textContent; }); }
new MutationObserver(fxSync).observe(document.body, { subtree: true, childList: true, characterData: true });
fxSync();
window.__dino = { scene, camera, renderer, THREE, H1, win, state, get run() { return run; }, act, startRun, update, laneOf, LANES, show, renderChars, renderMap, DINO_OBJ, render, LEVEL, applyTheme, get boss() { return boss; } };
