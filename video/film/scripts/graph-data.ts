// Pulls a real piece of Pune's inferred dependency graph for the explainer's
// graph scene: one substation, what it feeds, and what those feed in turn.
// Run from the repo root: npx tsx video/film/scripts/graph-data.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_ASSUMPTIONS as A } from '../../../lib/assumptions';
import { inferEdges } from '../../../lib/engine/infer';
import type { CityData } from '../../../lib/engine/types';
import { KIND } from '../../../lib/labels';

const city: CityData = JSON.parse(readFileSync('public/data/pune.json', 'utf8'));
const edges = inferEdges(city, A);
const byId = new Map(city.nodes.map((n) => [n.id, n]));
const hub = city.nodes.find((n) => n.name === 'Sinhagad Road Substation (Parvati)')!;

const out = edges.filter((e) => e.from === hub.id && byId.get(e.to)!.kind !== 'district');
// One of each kind first, so the ring shows the variety of what a substation feeds.
const seen = new Set<string>();
const ring1 = [...out.filter((e) => { const k = byId.get(e.to)!.kind; return seen.has(k) ? false : (seen.add(k), true); }), ...out]
  // Skip unnamed places and OSM mis-tags (a furniture shop tagged as a hospital).
  .filter((e, i, all) => all.indexOf(e) === i && !/#\d+$|furniture/i.test(byId.get(e.to)!.name))
  .slice(0, 8);
const ring2 = ring1.flatMap((e) =>
  edges.filter((f) => f.from === e.to && byId.get(f.to)!.kind !== 'district' && !/furniture/i.test(byId.get(f.to)!.name) && f.to !== hub.id && !ring1.some((r) => r.to === f.to)).slice(0, 3).map((f) => ({ parent: e.to, e: f })),
).filter((x, i, all) => all.findIndex((y) => y.e.to === x.e.to) === i).slice(0, 8);

const label = (id: string) => ({ id, name: byId.get(id)!.name, kind: KIND[byId.get(id)!.kind].label });
writeFileSync('video/film/assets/graph.json', JSON.stringify({
  hub: label(hub.id),
  ring1: ring1.map((e) => ({ ...label(e.to), type: e.type, provenance: e.provenance, confidence: e.confidence })),
  ring2: ring2.map(({ parent, e }) => ({ ...label(e.to), parent, type: e.type, provenance: e.provenance, confidence: e.confidence })),
}, null, 2));
console.log(`hub ${hub.name}: ${ring1.length} + ${ring2.length} nodes`);
