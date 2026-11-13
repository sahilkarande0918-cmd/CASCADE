'use client';

// The hero object: a 2 km square of central Pune cut out like an architect's
// scale model. Footprints are real OpenStreetMap buildings (heights from OSM
// where tagged, typical values otherwise, all exaggerated four times so they
// read at this size), the ground is Sentinel-2 imagery, the sides are a
// photoscanned rock face. Water rises where the engine says the ground floods,
// and the glass orbs are the real facilities in this square, each showing its
// simulated state. Clicking an orb fails it and reruns the real engine.

import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { DEFAULT_ASSUMPTIONS as A, SIM } from '@/lib/assumptions';
import { inferEdges } from '@/lib/engine/infer';
import { BACKUP, DOWN, prepare, run, STEPS } from '@/lib/engine/simulate';
import type { CityData } from '@/lib/engine/types';
import { mix, P, rgbArray } from '@/lib/palette';

export type ModelStatus = { hours: number; stage: number; down: number; failed: string | null };
type Block = { bbox: [number, number, number, number]; km: number; tagged: number; buildings: number[][] };

const S = 8; // side of the model in world units
const DEPTH = 1.5; // thickness of the cut
const HEIGHT_X = 4; // vertical exaggeration
const LOOP_S = 14;
const PEAK = 2;
const WATER = rgbArray(mix(P.lagoon, P.cream, 0.1));

const C = {
  up: new THREE.Color(P.ember),
  backup: new THREE.Color(P.amber),
  down: new THREE.Color(P.signal),
  building: new THREE.Color(mix(P.cream, P.peach, 0.15)),
  wet: new THREE.Color(mix(P.lagoon, P.cream, 0.45)),
};

type Model = {
  city: CityData;
  geo: THREE.BufferGeometry;
  /** Per building: first vertex, vertex count, hand (m) at its centroid. */
  spans: { start: number; count: number; hand: number }[];
  orbs: { i: number; x: number; y: number; z: number }[];
  water: FloodLayer;
};

/** Water over the block: height above drainage on a grid, painted for a given stage. */
class FloodLayer {
  readonly tex: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  constructor(private n: number, private hand: Float32Array) {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
  }
  draw(stage: number) {
    const img = this.ctx.createImageData(this.n, this.n);
    for (let j = 0; j < this.n * this.n; j++) {
      const depth = stage - this.hand[j];
      if (depth <= 0) continue;
      img.data.set([WATER[0], WATER[1], WATER[2], Math.round(170 + 80 * Math.min(1, depth / 1.5))], j * 4);
    }
    this.ctx.putImageData(img, 0, 0);
    this.tex.needsUpdate = true;
  }
}

function build(city: CityData, block: Block): Model {
  const unit = S / (block.km * 1000); // world units per metre
  const [bw, bs, be, bn] = block.bbox;
  const [cw, cs, ce, cn] = city.grid.bbox;
  const { nx, ny, h } = city.grid;
  // Height above drainage at a block-local position, bilinear on the city grid.
  const handAt = (x: number, z: number) => {
    const lng = bw + (x / S + 0.5) * (be - bw), lat = bs + (-z / S + 0.5) * (bn - bs);
    const gx = ((lng - cw) / (ce - cw)) * nx - 0.5, gy = ((cn - lat) / (cn - cs)) * ny - 0.5;
    const x0 = Math.max(0, Math.min(nx - 2, Math.floor(gx))), y0 = Math.max(0, Math.min(ny - 2, Math.floor(gy)));
    const fx = Math.min(1, Math.max(0, gx - x0)), fy = Math.min(1, Math.max(0, gy - y0));
    const v = (i: number, j: number) => { const q = h[j * nx + i]; return q === -32768 ? 50 : q / 10; };
    return (v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy;
  };

  const pos: number[] = [];
  const spans: Model['spans'] = [];
  for (const b of block.buildings) {
    const top = b[0] * unit * HEIGHT_X;
    const ring: THREE.Vector2[] = [];
    for (let k = 1; k < b.length; k += 2) ring.push(new THREE.Vector2(b[k] * unit, b[k + 1] * unit));
    if (THREE.ShapeUtils.isClockWise(ring)) ring.reverse();
    const start = pos.length / 3;
    for (const [a, c, d] of THREE.ShapeUtils.triangulateShape(ring, [])) {
      for (const q of [a, c, d]) pos.push(ring[q].x, top, -ring[q].y);
    }
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k], q = ring[(k + 1) % ring.length];
      pos.push(p.x, 0, -p.y, q.x, 0, -q.y, q.x, top, -q.y, p.x, 0, -p.y, q.x, top, -q.y, p.x, top, -p.y);
    }
    const cx = ring.reduce((s, v) => s + v.x, 0) / ring.length, cz = -ring.reduce((s, v) => s + v.y, 0) / ring.length;
    spans.push({ start, count: pos.length / 3 - start, hand: handAt(cx, cz) });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  geo.computeVertexNormals();

  const orbs: Model['orbs'] = [];
  city.nodes.forEach((nd, i) => {
    if (nd.kind === 'district' || nd.kind === 'bridge') return;
    const x = ((nd.lng - bw) / (be - bw) - 0.5) * S, z = -((nd.lat - bs) / (bn - bs) - 0.5) * S;
    if (Math.abs(x) > S / 2 - 0.15 || Math.abs(z) > S / 2 - 0.15) return;
    orbs.push({ i, x, y: 0.42, z });
  });

  const n = 96, hand = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) hand[j * n + i] = handAt(((i + 0.5) / n - 0.5) * S, ((j + 0.5) / n - 0.5) * S);
  return { city, geo, spans, orbs, water: new FloodLayer(n, hand) };
}

function Scene({ model, failed, onFail, onStatus, still }: {
  model: Model; failed: string | null; onFail: (id: string) => void; onStatus: (s: ModelStatus) => void; still: boolean;
}) {
  const loaded = useLoader(THREE.TextureLoader, ['/media/pune-block.jpg', '/media/rock-diff.jpg', '/media/rock-nor.jpg']);
  const [sat, rock, rockN] = useMemo(() => loaded.map((t, i) => {
    const c = t.clone();
    if (i < 2) c.colorSpace = THREE.SRGBColorSpace;
    if (i === 0) c.anisotropy = 8;
    else { c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(3, 0.6); }
    c.needsUpdate = true;
    return c;
  }), [loaded]);

  const fit = useThree((st) => Math.min(1, st.viewport.aspect / 1.45));
  const group = useRef<THREE.Group>(null);
  const shells = useRef<THREE.InstancedMesh>(null);
  const cores = useRef<THREE.InstancedMesh>(null);
  const last = useRef({ k: -1, report: 0 });
  const t0 = useRef(-1);



  const sim = useMemo(() => {
    const scenario = { stage: PEAK, failed: failed ? [failed] : [], interventions: [], edgeOverrides: {} };
    return run(prepare(model.city, scenario, A, inferEdges(model.city, A)));
  }, [model, failed]);
  useEffect(() => { t0.current = -1; last.current.k = -1; }, [sim]);

  useEffect(() => {
    const o = new THREE.Object3D();
    model.orbs.forEach((b, k) => {
      o.position.set(b.x, b.y, b.z);
      o.updateMatrix();
      shells.current!.setMatrixAt(k, o.matrix);
      cores.current!.setMatrixAt(k, o.matrix);
    });
    shells.current!.instanceMatrix.needsUpdate = true;
    cores.current!.instanceMatrix.needsUpdate = true;
  }, [model]);

  const sides = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ map: rock, normalMap: rockN, roughness: 1 });
    const top = new THREE.MeshStandardMaterial({ map: sat, roughness: 0.95 });
    const bottom = new THREE.MeshStandardMaterial({ color: mix(P.dusk, P.ink, 0.4), roughness: 1 });
    return [side, side, top, bottom, side, side];
  }, [rock, rockN, sat]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (t0.current < 0) t0.current = now;
    const phase = still ? 0.55 : ((now - t0.current) % (LOOP_S + 2)) / LOOP_S;
    const k = Math.min(STEPS, Math.round(Math.min(1, phase) * STEPS));
    if (group.current && !still) {
      group.current.rotation.y = Math.PI / 4 + Math.sin(now * 0.07) * 0.22 + state.pointer.x * 0.08;
      group.current.position.y = -2.75 + Math.sin(now * 0.55) * 0.05;
    }
    if (k === last.current.k) return;
    last.current.k = k;
    const hours = k * SIM.stepHours;
    const stage = PEAK * Math.min(1, hours / A['hazard.riseHours']);
    const n = model.city.nodes.length;

    model.water.draw(stage);

    const col = model.geo.getAttribute('color') as THREE.BufferAttribute;
    for (const sp of model.spans) {
      const c = stage > sp.hand ? C.wet : C.building;
      for (let v = sp.start; v < sp.start + sp.count; v++) col.setXYZ(v, c.r, c.g, c.b);
    }
    col.needsUpdate = true;

    model.orbs.forEach((o, j) => {
      const st = sim.state[k * n + o.i];
      cores.current!.setColorAt(j, st === DOWN ? C.down : st === BACKUP ? C.backup : C.up);
    });
    cores.current!.instanceColor!.needsUpdate = true;

    if (now - last.current.report > 0.2 || k === 0 || k === STEPS) {
      last.current.report = now;
      let down = 0;
      for (let i = 0; i < n; i++) if (model.city.nodes[i].kind !== 'district' && sim.state[k * n + i] === DOWN) down++;
      onStatus({ hours, stage, down, failed: failed ? model.city.nodes.find((x) => x.id === failed)?.name ?? null : null });
    }
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) onFail(model.city.nodes[model.orbs[e.instanceId].i].id);
  };

  return (
    <group ref={group} rotation={[0, Math.PI / 4, 0]} scale={fit} position={[0, -2.75, 0]}>
      <mesh position={[0, -DEPTH / 2, 0]} material={sides}>
        <boxGeometry args={[S, DEPTH, S]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <planeGeometry args={[S, S]} />
        <meshStandardMaterial map={model.water.tex} transparent depthWrite={false} roughness={0.08} metalness={0.15} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={model.geo}>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </mesh>
      <instancedMesh ref={shells} args={[undefined, undefined, model.orbs.length]} onClick={click}
        onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <sphereGeometry args={[0.07, 24, 16]} />
        <meshPhysicalMaterial transmission={1} roughness={0.05} thickness={0.3} ior={1.3} color={P.cream} transparent opacity={0.85} />
      </instancedMesh>
      <instancedMesh ref={cores} args={[undefined, undefined, model.orbs.length]}>
        <sphereGeometry args={[0.03, 12, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export default function CityModel({ onStatus }: { onStatus: (s: ModelStatus) => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    let live = true;
    Promise.all([fetch('/data/pune.json').then((r) => r.json()), fetch('/media/pune-block.json').then((r) => r.json())])
      .then(([c, b]: [CityData, Block]) => live && setModel(build(c, b)))
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!model) return null;
  return (
    <Canvas
      camera={{ position: [0, 3.9, 18.5], fov: 30 }}
      dpr={[1, 1.6]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', toneMappingExposure: 1.1 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.2, 0)}
      frameloop={still ? 'demand' : 'always'}
      aria-label="Scale model of 2 km of central Pune built from real map data. Click a glass orb to fail that facility."
    >
      <hemisphereLight args={[P.cream, mix(P.peach, P.dusk, 0.4), 1.4]} />
      <directionalLight position={[-6, 9, 5]} intensity={2.3} color={mix(P.cream, P.ember, 0.12)} />
      <directionalLight position={[6, 2, -5]} intensity={0.5} color={P.lagoon} />
      <Suspense fallback={null}>
        <Scene model={model} failed={failed} still={still} onStatus={onStatus}
          onFail={(id) => setFailed((f) => (f === id ? null : id))} />
      </Suspense>
    </Canvas>
  );
}
