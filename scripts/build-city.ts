// Builds public/data/<city>.json from open data. Run: npx tsx scripts/build-city.ts [key...]
//
// Sources: OpenStreetMap via Overpass (facilities, roads, rivers, power lines)
// and AWS open Terrain Tiles (Terrarium encoding) for elevation. Every response
// is cached under scripts/.cache, so re-running costs nothing.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { CityData, CityNode, Kind, RoadGraph } from '../lib/engine/types';

const CITIES: Record<string, { name: string; country: string; center: [number, number] }> = {
  pune: { name: 'Pune', country: 'India', center: [73.8567, 18.5204] },
  chennai: { name: 'Chennai', country: 'India', center: [80.255, 13.035] },
  valencia: { name: 'Valencia', country: 'Spain', center: [-0.375, 39.455] },
};
const HALF_KM = 5;
const Z = 13;
const CACHE = join(process.cwd(), 'scripts', '.cache');
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

type El = {
  type: 'node' | 'way' | 'relation'; id: number; tags?: Record<string, string>;
  lat?: number; lon?: number; center?: { lat: number; lon: number };
  nodes?: number[]; geometry?: ({ lat: number; lon: number } | null)[];
};
type Pt = { lng: number; lat: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cached(key: string, fetcher: () => Promise<Buffer>): Promise<Buffer> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, createHash('sha1').update(key).digest('hex').slice(0, 20));
  if (existsSync(file)) return readFileSync(file);
  const buf = await fetcher();
  writeFileSync(file, buf);
  return buf;
}

async function overpass(query: string): Promise<El[]> {
  const buf = await cached(query, async () => {
    let last: unknown;
    for (let i = 0; i < OVERPASS.length * 3; i++) {
      const url = OVERPASS[i % OVERPASS.length];
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'cascade-build/0.1', Accept: 'application/json' },
          signal: AbortSignal.timeout(240_000),
        });
        if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
        const buf = Buffer.from(await res.arrayBuffer());
        JSON.parse(buf.toString()); // reject HTML error pages before caching
        await sleep(1500);
        return buf;
      } catch (e) {
        last = e;
        console.warn(`  overpass ${new URL(url).host} failed: ${String(e).slice(0, 100)}`);
        await sleep(3000 + 5000 * Math.floor(i / OVERPASS.length));
      }
    }
    throw last;
  });
  return (JSON.parse(buf.toString()) as { elements: El[] }).elements;
}

// ---- elevation --------------------------------------------------------------

const tiles = new Map<string, PNG>();
async function loadTiles(bbox: number[]) {
  const [w, s, e, n] = bbox;
  const [x0, y0] = tileXY(w, n), [x1, y1] = tileXY(e, s);
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
      const buf = await cached(url, async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`terrarium ${res.status} ${url}`);
        return Buffer.from(await res.arrayBuffer());
      });
      tiles.set(`${x}/${y}`, PNG.sync.read(buf));
    }
  }
}
function tileXY(lng: number, lat: number): [number, number] {
  const n = 2 ** Z;
  const r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}
function px(gx: number, gy: number): number {
  const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256);
  const t = tiles.get(`${tx}/${ty}`);
  if (!t) return NaN;
  const i = ((gy - ty * 256) * 256 + (gx - tx * 256)) * 4;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}
/** Bilinear elevation in metres. */
function elev(lng: number, lat: number): number {
  const [tx, ty] = tileXY(lng, lat);
  const gx = tx * 256 - 0.5, gy = ty * 256 - 0.5;
  const x = Math.floor(gx), y = Math.floor(gy), fx = gx - x, fy = gy - y;
  return (px(x, y) * (1 - fx) + px(x + 1, y) * fx) * (1 - fy) + (px(x, y + 1) * (1 - fx) + px(x + 1, y + 1) * fx) * fy;
}
/** Lowest DEM value within about 40 m: a river's surface, not its bank. */
function lowElev(lng: number, lat: number): number {
  const [tx, ty] = tileXY(lng, lat);
  const gx = Math.floor(tx * 256), gy = Math.floor(ty * 256);
  let m = Infinity;
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) m = Math.min(m, px(gx + dx, gy + dy));
  return m;
}

// ---- geometry ---------------------------------------------------------------

function km(a: Pt, b: Pt) {
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(x, b.lat - a.lat) * 111.32;
}
function densify(pts: Pt[], stepKm: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const k = Math.max(1, Math.ceil(km(a, b) / stepKm));
    for (let j = 0; j < k; j++) out.push({ lng: a.lng + ((b.lng - a.lng) * j) / k, lat: a.lat + ((b.lat - a.lat) * j) / k });
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}
const geom = (el: El): Pt[] => (el.geometry ?? []).filter((g): g is { lat: number; lon: number } => !!g).map((g) => ({ lng: g.lon, lat: g.lat }));
const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
const r1 = (x: number) => Math.round(x * 10) / 10;

// ---- build ------------------------------------------------------------------

async function build(key: string) {
  const c = CITIES[key];
  const [lng, lat] = c.center;
  const dLat = HALF_KM / 111.32, dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const bbox: [number, number, number, number] = [r5(lng - dLng), r5(lat - dLat), r5(lng + dLng), r5(lat + dLat)];
  const bb = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
  console.log(`${c.name}: bbox ${bb}`);

  const facilities = await overpass(`[out:json][timeout:180];(
    nwr["power"="substation"](${bb});
    nwr["man_made"~"^(water_works|pumping_station|water_tower)$"](${bb});
    nwr["amenity"~"^(hospital|clinic|fuel)$"](${bb});
    nwr["social_facility"="shelter"](${bb});
    nwr["emergency"="assembly_point"](${bb});
    nwr["man_made"~"^(mast|tower|communications_tower)$"]["tower:type"="communication"](${bb});
    nwr["communication:mobile_phone"="yes"](${bb});
    node["place"~"^(suburb|neighbourhood|quarter)$"](${bb});
  );out center tags;`);
  const roads = await overpass(`[out:json][timeout:180];
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified)(_link)?$"](${bb});out body geom;`);
  const water = await overpass(`[out:json][timeout:180];(
    way["waterway"~"^(river|canal)$"](${bb});way["natural"="coastline"](${bb});
  );out body geom;`);
  const power = await overpass(`[out:json][timeout:180];way["power"~"^(line|minor_line|cable)$"](${bb});out body geom;`);
  console.log(`  osm: ${facilities.length} facilities, ${roads.length} roads, ${water.length} waterways, ${power.length} power lines`);

  await loadTiles([bbox[0] - 0.01, bbox[1] - 0.01, bbox[2] + 0.01, bbox[3] + 0.01]);

  // Drainage: rivers and canals at their DEM surface, the coast at sea level.
  const drains: { lng: number; lat: number; z: number }[] = [];
  for (const w of water) {
    const coast = w.tags?.natural === 'coastline';
    for (const p of densify(geom(w), 0.04)) drains.push({ ...p, z: coast ? 0 : lowElev(p.lng, p.lat) });
  }
  const minElev = (() => {
    let m = Infinity;
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) m = Math.min(m, elev(bbox[0] + ((bbox[2] - bbox[0]) * i) / 20, bbox[1] + ((bbox[3] - bbox[1]) * j) / 20));
    return m;
  })();
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const nearestDrain = (p: Pt) => {
    let best = Infinity, bi = -1;
    for (let i = 0; i < drains.length; i++) {
      const dx = (drains[i].lng - p.lng) * cosLat, dy = drains[i].lat - p.lat;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    return bi < 0 ? null : { d: drains[bi], km: Math.sqrt(best) * 111.32 };
  };
  const hand = (p: Pt) => {
    const z = elev(p.lng, p.lat);
    const d = nearestDrain(p);
    return Math.max(0, z - (d ? Math.min(z, d.d.z) : minElev));
  };

  // ---- facilities
  const nodes: CityNode[] = [];
  const kindOf = (t: Record<string, string>): Kind | null => {
    if (t.power === 'substation') return t.substation === 'minor_distribution' ? null : 'substation';
    if (t.man_made === 'water_works') return 'water_works';
    if (t.man_made === 'pumping_station') return /sewage|wastewater|drainage/.test(t.pumping_station ?? t.substance ?? '') ? null : 'pumping';
    if (t.man_made === 'water_tower') return 'water_tower';
    if (t.amenity === 'hospital') return 'hospital';
    if (t.amenity === 'clinic') return 'clinic';
    if (t.amenity === 'fuel') return 'fuel';
    if (t.social_facility === 'shelter' || t.emergency === 'assembly_point') return 'shelter';
    if (t['tower:type'] === 'communication' || t['communication:mobile_phone'] === 'yes') return 'telecom';
    if (t.place) return 'district';
    return null;
  };
  const LABEL: Record<Kind, string> = {
    substation: 'Substation', water_works: 'Water works', pumping: 'Pumping station', water_tower: 'Water tower',
    hospital: 'Hospital', clinic: 'Clinic', telecom: 'Telecom mast', fuel: 'Fuel station', shelter: 'Shelter',
    bridge: 'Bridge', district: 'District',
  };
  for (const el of facilities) {
    const t = el.tags ?? {};
    const kind = kindOf(t);
    const p = el.center ?? (el.lat != null ? { lat: el.lat, lon: el.lon! } : null);
    if (!kind || !p) continue;
    const pt = { lng: p.lon, lat: p.lat };
    if (pt.lng < bbox[0] || pt.lng > bbox[2] || pt.lat < bbox[1] || pt.lat > bbox[3]) continue;
    const name = t['name:en'] || t.name || '';
    // The same hospital is often mapped as both a building and a point.
    const dup = nodes.find((n) => n.kind === kind && km(n, pt) < 0.06);
    if (dup) { if (!dup.name.includes(' #') || !name) continue; nodes.splice(nodes.indexOf(dup), 1); }
    const popTag = Number((t.population ?? '').replace(/[ ,]/g, ''));
    nodes.push({
      id: `${kind[0]}${el.type[0]}${el.id}`, kind, name: name || `${LABEL[kind]} #${el.id % 10000}`,
      lng: r5(pt.lng), lat: r5(pt.lat), elev: r1(elev(pt.lng, pt.lat)), hand: r1(hand(pt)), road: -1,
      ...(kind === 'district' ? (popTag > 0 ? { pop: popTag, popSource: 'osm' as const } : { popSource: 'assumed' as const }) : {}),
      osm: `${el.type}/${el.id}`,
    });
  }

  // ---- roads: junction graph, bridges
  const uses = new Map<number, number>();
  for (const w of roads) for (const [i, id] of (w.nodes ?? []).entries()) {
    const end = i === 0 || i === w.nodes!.length - 1;
    uses.set(id, (uses.get(id) ?? 0) + (end ? 2 : 1));
  }
  const vIndex = new Map<number, number>();
  const road: RoadGraph = { v: [], e: [] };
  const bridgeOf = new Map<number, string>();
  for (const w of roads) {
    const t = w.tags ?? {};
    if (!t.bridge || t.bridge === 'no') continue;
    const g = geom(w);
    const mid = g[Math.floor(g.length / 2)];
    if (!mid) continue;
    const d = nearestDrain(mid);
    if (!d || d.km > 0.12) { bridgeOf.set(w.id, 'flyover'); continue; }
    const near = nodes.find((n) => n.kind === 'bridge' && km(n, mid) < 0.15);
    if (near) { bridgeOf.set(w.id, near.id); continue; }
    const id = `bw${w.id}`;
    nodes.push({
      id, kind: 'bridge', name: t.name ? `${t.name} bridge` : `Bridge on ${t.ref || t.highway} #${w.id % 10000}`,
      lng: r5(mid.lng), lat: r5(mid.lat), elev: r1(elev(mid.lng, mid.lat)), hand: r1(hand(mid)), road: -1, osm: `way/${w.id}`,
    });
    bridgeOf.set(w.id, id);
  }
  const junction = (id: number, p: Pt) => {
    let i = vIndex.get(id);
    if (i === undefined) { i = road.v.length; vIndex.set(id, i); road.v.push([r5(p.lng), r5(p.lat), r1(hand(p))]); }
    return i;
  };
  for (const w of roads) {
    const ids = w.nodes ?? [], g = geom(w);
    if (ids.length !== g.length || ids.length < 2) continue;
    let start = 0;
    for (let i = 1; i < ids.length; i++) {
      if (i < ids.length - 1 && (uses.get(ids[i]) ?? 0) < 2) continue;
      const interior = g.slice(start + 1, i);
      const minH = interior.length ? r1(Math.min(...interior.map(hand))) : null;
      const coords = g.slice(start, i + 1).flatMap((p) => [r5(p.lng), r5(p.lat)]);
      road.e.push([junction(ids[start], g[start]), junction(ids[i], g[i]), minH, bridgeOf.get(w.id) ?? null, coords]);
      start = i;
    }
  }
  for (const n of nodes) {
    let best = 2, bi = -1;
    road.v.forEach(([x, y], i) => { const d = km(n, { lng: x, lat: y }); if (d < best) { best = d; bi = i; } });
    n.road = bi;
  }

  // ---- observed power links: a mapped line with a substation at one end and a facility at the other.
  const observed: CityData['observed'] = [];
  const near = (p: Pt, pred: (n: CityNode) => boolean) => nodes.find((n) => pred(n) && km(n, p) < 0.08);
  for (const w of power) {
    const g = geom(w);
    if (g.length < 2) continue;
    for (const [a, b] of [[g[0], g[g.length - 1]], [g[g.length - 1], g[0]]]) {
      const sub = near(a, (n) => n.kind === 'substation');
      const fac = near(b, (n) => !['substation', 'district', 'bridge'].includes(n.kind));
      if (sub && fac && !observed.some((o) => o.to === fac.id)) {
        observed.push({ from: sub.id, to: fac.id, type: 'power', note: `OSM power line way/${w.id} runs from this substation to this facility.` });
      }
    }
  }

  // ---- hand grid for the flood overlay
  const nx = 128, ny = 128, h: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = { lng: bbox[0] + ((i + 0.5) * (bbox[2] - bbox[0])) / nx, lat: bbox[3] - ((j + 0.5) * (bbox[3] - bbox[1])) / ny };
    const v = hand(p);
    h.push(Number.isFinite(v) ? Math.round(v * 10) : -32768);
  }

  const out: CityData = {
    key, name: c.name, country: c.country, bbox, center: c.center, zoom: 12.6,
    generatedAt: new Date().toISOString().slice(0, 10), nodes, observed, road, grid: { bbox, nx, ny, h },
  };
  const counts = nodes.reduce<Record<string, number>>((m, n) => ((m[n.kind] = (m[n.kind] ?? 0) + 1), m), {});
  console.log(`  nodes`, counts, `observed links ${observed.length}, road ${road.v.length}v/${road.e.length}e, drains ${drains.length}`);
  const file = join(process.cwd(), 'public', 'data', `${key}.json`);
  writeFileSync(file, JSON.stringify(out));
  console.log(`  wrote ${file} (${(JSON.stringify(out).length / 1e6).toFixed(2)} MB)`);
}

(async () => {
  const keys = process.argv.slice(2);
  for (const k of keys.length ? keys : Object.keys(CITIES)) {
    if (!CITIES[k]) throw new Error(`unknown city ${k}`);
    await build(k);
  }
})();
