// Assets for the landing page's island: real satellite imagery of the Pune
// area and a photoscanned rock texture for its underside.
// Run: npx tsx scripts/build-hero.ts   (needs ffmpeg on PATH)
//
// Imagery: "Sentinel-2 cloudless 2016" by EOX IT Services GmbH, CC BY 4.0
// (contains modified Copernicus Sentinel data 2016), https://s2maps.eu
// Rock: Poly Haven "rock_face", CC0, https://polyhaven.com/a/rock_face

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const Z = 15;

const CACHE = join(process.cwd(), 'scripts', '.cache', 'hero');
const OUT = join(process.cwd(), 'public', 'media');
const UA = { 'User-Agent': 'cascade-build/0.1' };

async function get(url: string, file: string) {
  if (existsSync(file)) return;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const tile = (lng: number, lat: number, z = Z) => {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
};

// The hero block: 2 km of central Pune around the Mutha river.
const BLOCK_CENTER = [73.8545, 18.5205];
const BLOCK_KM = 2;

async function satellite(bbox: number[], Z: number, size: number, out: string) {
  const [w, s, e, n] = bbox;
  const [fx0, fy0] = tile(w, n, Z), [fx1, fy1] = tile(e, s, Z);
  const x0 = Math.floor(fx0), y0 = Math.floor(fy0), x1 = Math.floor(fx1), y1 = Math.floor(fy1);
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1;

  const inputs: string[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const f = join(CACHE, `s2-${Z}-${x}-${y}.jpg`);
    await get(`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${Z}/${y}/${x}.jpg`, f);
    inputs.push('-i', f);
  }
  const layout = Array.from({ length: cols * rows }, (_, i) => `${(i % cols) * 256}_${Math.floor(i / cols) * 256}`).join('|');
  const cx = Math.round((fx0 - x0) * 256), cy = Math.round((fy0 - y0) * 256);
  const cw = Math.round((fx1 - fx0) * 256), ch = Math.round((fy1 - fy0) * 256);
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', ...inputs,
    '-filter_complex', `xstack=inputs=${cols * rows}:layout=${layout},crop=${cw}:${ch}:${cx}:${cy},scale=${size}:${size}:flags=lanczos,eq=saturation=0.9:gamma=1.05`,
    '-frames:v', '1', '-q:v', '3', join(OUT, out),
  ]);
  console.log(`satellite: ${cols}x${rows} tiles at z${Z}, cropped ${cw}x${ch} -> public/media/${out}`);
}

async function overpass(query: string): Promise<{ elements: { id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] }> {
  const f = join(CACHE, `osm-${Buffer.from(query).toString('base64url').slice(-40)}.json`);
  if (!existsSync(f)) {
    for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
      try {
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(240_000) });
        if (!res.ok) throw new Error(String(res.status));
        writeFileSync(f, Buffer.from(await res.arrayBuffer()));
        break;
      } catch (e) { console.warn(`  overpass ${url} failed: ${e}`); }
    }
  }
  return JSON.parse(readFileSync(f, 'utf8'));
}

/** Height in metres: the OSM tag when there is one, else levels, else a typical value for the type. */
function heightOf(t: Record<string, string>, id: number): [number, boolean] {
  const num = (v?: string) => (v ? parseFloat(v) : NaN);
  const h = num(t.height) || num(t['building:height']);
  if (h > 0) return [h, true];
  const lv = num(t['building:levels']);
  if (lv > 0) return [lv * 3.2 + 1, true];
  const base: Record<string, number> = { house: 7, residential: 9, apartments: 18, commercial: 14, retail: 8, industrial: 9, hospital: 18, school: 10, temple: 10, church: 12, college: 14, university: 14, office: 18, hotel: 18 };
  const b = base[t.building] ?? 8;
  return [b * (0.75 + ((id * 2654435761) % 1000) / 2000), false];
}

(async () => {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const city = JSON.parse(readFileSync('public/data/pune.json', 'utf8'));
  await satellite(city.bbox, Z, 2048, 'pune-s2.jpg');

  const [clng, clat] = BLOCK_CENTER;
  const dLat = BLOCK_KM / 2 / 111.32, dLng = dLat / Math.cos((clat * Math.PI) / 180);
  const bbox = [clng - dLng, clat - dLat, clng + dLng, clat + dLat];
  await satellite(bbox, 17, 2048, 'pune-block.jpg');
  const osm = await overpass(`[out:json][timeout:180];way["building"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});out tags geom;`);
  const mx = (lng: number) => Math.round(((lng - bbox[0]) / (bbox[2] - bbox[0]) - 0.5) * BLOCK_KM * 1000);
  const mz = (lat: number) => Math.round(-((lat - bbox[1]) / (bbox[3] - bbox[1]) - 0.5) * BLOCK_KM * 1000);
  let tagged = 0;
  const buildings = osm.elements.flatMap((el) => {
    const g = el.geometry ?? [];
    if (g.length < 4) return [];
    const [h, real] = heightOf(el.tags ?? {}, el.id);
    if (real) tagged++;
    const ring = g.slice(0, -1).flatMap((p) => [mx(p.lon), mz(p.lat)]);
    if (ring.some((v) => Math.abs(v) > BLOCK_KM * 500)) return [];
    return [[Math.round(h), ...ring]];
  });
  writeFileSync(join(OUT, 'pune-block.json'), JSON.stringify({ bbox, km: BLOCK_KM, tagged, buildings }));
  console.log(`block: ${buildings.length} buildings (${tagged} with OSM height or levels) -> public/media/pune-block.json`);

  const files = await (await fetch('https://api.polyhaven.com/files/rock_face', { headers: UA })).json();
  await get(files.Diffuse['1k'].jpg.url, join(OUT, 'rock-diff.jpg'));
  await get(files.nor_gl['1k'].jpg.url, join(OUT, 'rock-nor.jpg'));
  console.log('rock: public/media/rock-diff.jpg, rock-nor.jpg');
})();
