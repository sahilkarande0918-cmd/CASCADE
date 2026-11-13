// Runs the engine on the Pune data and writes the figures the landing page
// shows, so every number there is a real simulated output, not copy.
// Run: npx tsx scripts/landing-facts.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_ASSUMPTIONS as A } from '../lib/assumptions';
import { CITIES } from '../lib/cities';
import { inferEdges } from '../lib/engine/infer';
import { CAUSE_FLOOD, CAUSE_MANUAL, fragility, optimize, prepare, run, trace } from '../lib/engine/simulate';
import type { CityData } from '../lib/engine/types';
import { INTERVENTION, KIND, SERVICE_LABEL } from '../lib/labels';

const city: CityData = JSON.parse(readFileSync('public/data/pune.json', 'utf8'));
const edges = inferEdges(city, A);
const stage = CITIES.pune.stage;
const scenario = { stage, failed: [], interventions: [], edgeOverrides: {} };
const p = prepare(city, scenario, A, edges);
const r = run(p);
const name = (i: number) => city.nodes[i].name;

const how = (i: number) => {
  if (r.cause[i] === CAUSE_FLOOD) return 'Floods';
  if (r.cause[i] === CAUSE_MANUAL) return 'Failed by hand';
  const e = p.edges[r.causeEdge[i]];
  return `Loses ${SERVICE_LABEL[e.type].toLowerCase()}`;
};

// The board: facilities in the order they fail, one per kind and cause, so
// both floods and knock-on failures behind their backups show.
const seen = new Set<string>();
const board = city.nodes
  .map((n, i) => ({ n, i }))
  .filter(({ n, i }) => n.kind !== 'district' && Number.isFinite(r.ttf[i]) && !/#\d+$/.test(n.name))
  .sort((a, b) => r.ttf[a.i] - r.ttf[b.i])
  .filter(({ n, i }) => {
    const key = `${n.kind}:${how(i)}`;
    if (seen.has(key) || seen.has(n.name)) return false;
    seen.add(key); seen.add(n.name);
    return true;
  })
  .slice(0, 9)
  .map(({ n, i }) => ({
    name: n.name, kind: KIND[n.kind].label, ttf: r.ttf[i], how: how(i),
    path: trace(r, p.from, i).map(name),
  }));

// One node failed by hand on a dry day: the purest cascade.
const frag = fragility(city, { ...scenario, stage: 0 }, A, edges, 1);
const root = city.nodes.findIndex((n) => n.id === frag[0].node);
const dry = run(prepare(city, { ...scenario, stage: 0, failed: [frag[0].node] }, A, edges));
const chain = city.nodes
  .map((n, i) => ({ n, i }))
  .filter(({ n, i }) => i !== root && n.kind !== 'district' && Number.isFinite(dry.ttf[i]))
  .sort((a, b) => dry.ttf[a.i] - dry.ttf[b.i]);
const byKind = Object.entries(chain.reduce<Record<string, number>>((m, { n }) => ((m[KIND[n.kind].label] = (m[KIND[n.kind].label] ?? 0) + 1), m), {}))
  .sort((a, b) => b[1] - a[1]);

const opt = optimize(city, scenario, A, edges, 3);
const best = opt.best[0];

const facts = {
  city: city.name,
  stage,
  nodes: city.nodes.length,
  edges: edges.length,
  observed: edges.filter((e) => e.provenance === 'observed').length,
  failed: city.nodes.filter((n, i) => n.kind !== 'district' && Number.isFinite(r.ttf[i])).length,
  hospitalsFailed: city.nodes.filter((n, i) => n.kind === 'hospital' && Number.isFinite(r.ttf[i])).length,
  impact: Math.round(r.impact),
  board,
  root: { name: name(root), kind: KIND[city.nodes[root].kind].label, downstream: chain.length, byKind,
    first: chain.filter(({ n }, j, all) => all.findIndex((x) => x.n.kind === n.kind) === j).slice(0, 4).map(({ n, i }) => ({ name: n.name, kind: KIND[n.kind].label, ttf: dry.ttf[i] })) },
  plan: {
    k: 3,
    cut: Math.round((-best.delta / opt.baseline) * 100),
    evaluated: opt.evaluated,
    steps: best.interventions.map((iv) => `${INTERVENTION[iv.kind].verb} ${name(city.nodes.findIndex((n) => n.id === iv.node))}`),
  },
};
writeFileSync('lib/landing-facts.json', JSON.stringify(facts, null, 2) + '\n');
console.log(JSON.stringify(facts, null, 2));
