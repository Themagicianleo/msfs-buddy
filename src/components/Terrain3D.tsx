// Interactive 3D model of the ground around an airport: the elevation grid as
// a lit, shaded surface coloured by height above the field, with the runway,
// the 3° approach path and labelled peaks. Drag to rotate, pinch or scroll to
// zoom. three.js is loaded only when the view is first shown.

import { useEffect, useRef, useState } from 'react';
import { fmtFtM, nmKm } from '../lib/format';
import {
  APPROACH_NM, cacheTerrain3D, cachedTerrain3D, glidePathFt, loadTerrain3D, mToFt, terrainColor,
  type GeoFeature, type Terrain3D as Grid, type TerrainData,
} from '../lib/terrain';

const FT_PER_NM = 6076.12;
const EXAGGERATIONS = [1, 2, 3, 5] as const;

export function Terrain3D({ d, peaks }: { d: TerrainData; peaks: GeoFeature[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [error, setError] = useState('');
  const [exag, setExag] = useState<(typeof EXAGGERATIONS)[number]>(3);
  const [resetKey, setResetKey] = useState(0);

  // Only fetch and draw once the panel is on screen.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const cached = cachedTerrain3D(d.icao);
    if (cached && Math.abs(cached.center.lat - d.center.lat) < 1e-6 && Math.abs(cached.center.lon - d.center.lon) < 1e-6) {
      setGrid(cached);
      return;
    }
    let cancelled = false;
    setGrid(null);
    setError('');
    loadTerrain3D(d.icao, d.center)
      .then((g) => {
        if (cancelled) return;
        cacheTerrain3D(g);
        setGrid(g);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [visible, d.icao, d.center.lat, d.center.lon]);

  // Redraw only when what is shown changes (the peaks list is a new array on every render).
  const peaksKey = peaks.map((p) => `${p.name}@${p.lat},${p.lon}`).join('|');
  useEffect(() => {
    const el = box.current;
    if (!grid || !el) return;
    let disposed = false;
    let cleanup = () => {};
    draw(el, grid, d, peaks, exag)
      .then((c) => (disposed ? c() : (cleanup = c)))
      .catch(() => !disposed && setError('This browser can’t show 3D graphics (WebGL is off or unsupported).'));
    return () => {
      disposed = true;
      cleanup();
    };
    // peaks is covered by peaksKey
  }, [grid, d, peaksKey, exag, resetKey]);

  return (
    <div className="terrain3d">
      <div className="terrain3d-bar">
        <div className="tabs" role="group" aria-label="Height exaggeration">
          {EXAGGERATIONS.map((x) => (
            <button key={x} className={`tab ${exag === x ? 'active' : ''}`} onClick={() => setExag(x)}>{x}× height</button>
          ))}
        </div>
        <button className="btn btn-small" onClick={() => setResetKey((k) => k + 1)}>Reset view</button>
      </div>
      <div ref={box} className="terrain3d-view">
        {!grid && !error && <div className="terrain3d-msg">{visible ? 'Building the 3D terrain…' : ''}</div>}
        {error && <div className="terrain3d-msg">{error} The 2D map above still works.</div>}
      </div>
      <div className="muted small">
        Drag to rotate, pinch or scroll to zoom. {nmKm(2 * (grid?.halfNm ?? 16))} square, ground every {nmKm(1)}; heights ×{exag} so the relief is easier
        to read. Blue line: 3° approach path from {nmKm(APPROACH_NM)}. Same colours as the 2D map, with water in blue and snow on ground more than
        8,000 ft above the field.
      </div>
    </div>
  );
}

/** Build the scene in `el`; returns a function that removes it again. */
async function draw(el: HTMLElement, g: Grid, d: TerrainData, peaks: GeoFeature[], exag: number): Promise<() => void> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const { CSS2DRenderer, CSS2DObject } = await import('three/addons/renderers/CSS2DRenderer.js');

  const field = d.fieldElevFt;
  // Scene units: 1 = 1 nm. Heights relative to the field, exaggerated.
  const y = (ft: number) => ((ft - field) / FT_PER_NM) * exag;
  const size = 2 * g.halfNm;

  const scene = new THREE.Scene();
  const w = el.clientWidth || 600;
  const h = el.clientHeight || 420;
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
  camera.position.set(-22, 24, 34);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  el.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.setSize(w, h);
  labels.domElement.className = 'terrain3d-labels';
  el.appendChild(labels.domElement);

  // Lighting: soft sky light plus a low sun from the north-west, so the relief shows.
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a4a3a, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-20, 25, -15);
  scene.add(sun);

  // Ground: a plane with one vertex per grid point, north row first (−z), west to east (+x).
  const geo = new THREE.PlaneGeometry(size, size, g.n - 1, g.n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ft = g.heightsFt[i] ?? field;
    pos.setY(i, y(ft));
    const [r, gg, b] = terrainColor(ft, field);
    colors.set([r, gg, b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
  scene.add(ground);

  // A thin base under the terrain, like a model on a table.
  const minY = Math.min(...g.heightsFt.map(y)) - 0.3;
  const base = new THREE.Mesh(new THREE.BoxGeometry(size, 0.2, size), new THREE.MeshStandardMaterial({ color: 0x8e8e93, transparent: true, opacity: 0.35 }));
  base.position.y = minY;
  scene.add(base);

  // Bearing (true, clockwise from north) -> scene direction: north = −z, east = +x.
  const dir = (brg: number) => new THREE.Vector3(Math.sin((brg * Math.PI) / 180), 0, -Math.cos((brg * Math.PI) / 180));
  const at = (nm: number, brg: number, ft: number) => dir(brg).multiplyScalar(nm).setY(y(ft));

  // Runway and airport marker.
  if (d.runwayHdg !== null) {
    const rwy = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 1.8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 }));
    rwy.position.y = 0.03;
    rwy.rotation.y = -((d.runwayHdg * Math.PI) / 180);
    scene.add(rwy);
    // 3° approach path from 15 nm out down to the field.
    const pts = [];
    for (let nm = APPROACH_NM; nm >= 0; nm -= 0.5) pts.push(at(nm, (d.runwayHdg + 180) % 360, field + glidePathFt(nm)));
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.07, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x0a84ff, emissive: 0x0a4aa0, transparent: true, opacity: 0.9 }),
    );
    scene.add(tube);
  }
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666 }));
  pin.position.y = 0.2;
  scene.add(pin);

  const label = (text: string, cls: string, p: InstanceType<typeof THREE.Vector3>) => {
    const div = document.createElement('div');
    div.className = `t3d-label ${cls}`;
    div.textContent = text;
    const o = new CSS2DObject(div);
    o.position.copy(p);
    scene.add(o);
  };
  label(`${d.icao} ${fmtFtM(field)}`, 'apt', new THREE.Vector3(0, 0.9, 0));
  label('N', 'north', new THREE.Vector3(0, minY + 0.4, -g.halfNm - 1.2));

  // Peaks inside the model, with a small marker and their height.
  for (const p of peaks) {
    if (p.eleM === null || p.distNm > g.halfNm * 1.3) continue;
    const ft = mToFt(p.eleM);
    const v = at(p.distNm, p.brg, ft);
    if (Math.abs(v.x) > g.halfNm || Math.abs(v.z) > g.halfNm) continue;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x1c1c1e }));
    cone.position.copy(v).setY(v.y + 0.2);
    scene.add(cone);
    label(`${p.name} ${fmtFtM(Math.round(ft))}`, 'peak', v.clone().setY(v.y + 0.75));
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 6;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, 0, 0);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.6;
  const stopSpin = () => (controls.autoRotate = false);
  controls.addEventListener('start', stopSpin);

  const resize = () => {
    const ww = el.clientWidth;
    const hh = el.clientHeight;
    if (!ww || !hh) return;
    camera.aspect = ww / hh;
    camera.updateProjectionMatrix();
    renderer.setSize(ww, hh);
    labels.setSize(ww, hh);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let frame = 0;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  loop();

  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    controls.removeEventListener('start', stopSpin);
    controls.dispose();
    scene.traverse((o) => {
      const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } };
      m.geometry?.dispose();
      m.material?.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
    labels.domElement.remove();
  };
}
