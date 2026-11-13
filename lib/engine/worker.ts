// Runs the engine off the main thread. One request at a time; the client
// replaces the whole worker when a newer request makes the current one stale.

import type { Assumptions } from '../assumptions';
import { accessCutoffs, applyOverrides, inferEdges } from './infer';
import { fragility, monteCarlo, optimize, prepare, run } from './simulate';
import type { CityData, Edge, Intervention, Scenario } from './types';

export type Request =
  | { type: 'run'; city: string; scenario: Scenario; a: Assumptions }
  | { type: 'fragility'; city: string; scenario: Scenario; a: Assumptions }
  | { type: 'optimize'; city: string; scenario: Scenario; a: Assumptions; k: number }
  | { type: 'compare'; city: string; scenario: Scenario; a: Assumptions; plans: Intervention[][] };

const cities = new Map<string, Promise<CityData>>();
function load(key: string) {
  if (!cities.has(key)) cities.set(key, fetch(`/data/${key}.json`).then((r) => {
    if (!r.ok) throw new Error(`could not load city ${key} (${r.status})`);
    return r.json();
  }));
  return cities.get(key)!;
}

let edgeCache: { key: string; edges: Edge[] } | null = null;
function edgesFor(city: CityData, a: Assumptions) {
  const key = city.key + JSON.stringify(a);
  if (edgeCache?.key !== key) edgeCache = { key, edges: inferEdges(city, a) };
  return edgeCache.edges;
}

const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (ev: MessageEvent<Request>) => {
  const req = ev.data;
  try {
    const city = await load(req.city);
    const edges = edgesFor(city, req.a);
    const progress = (f: number) => post({ type: 'progress', f });

    if (req.type === 'run') {
      const p = prepare(city, req.scenario, req.a, edges);
      const r = run(p);
      post({ type: 'run', edges: p.edges, cutoff: p.cutoff, result: r }, [r.state.buffer]);
      // Uncertainty, in chunks so the UI can show progress.
      const runs = Math.max(1, Math.round(req.a['sim.runs']));
      const n = city.nodes.length;
      const ttf = new Float32Array(runs * n), impact = new Float64Array(runs);
      for (let done = 0; done < runs; done += 25) {
        const m = Math.min(25, runs - done);
        const mc = monteCarlo(p, m, 1 + done);
        ttf.set(mc.ttf, done * n);
        impact.set(mc.impact, done);
        progress((done + m) / runs);
      }
      post({ type: 'mc', runs, ttf, impact }, [ttf.buffer, impact.buffer]);
    } else if (req.type === 'fragility') {
      post({ type: 'fragility', list: fragility(city, req.scenario, req.a, edges, 10, progress) });
    } else if (req.type === 'optimize') {
      post({ type: 'optimize', ...optimize(city, req.scenario, req.a, edges, req.k, progress) });
    } else if (req.type === 'compare') {
      const base = applyOverrides(edges, req.scenario);
      const cut = accessCutoffs(city, base, req.scenario, req.a);
      const results = req.plans.map((plan) => {
        const s = { ...req.scenario, interventions: [...req.scenario.interventions, ...plan] };
        const r = run(prepare(city, s, req.a, edges, plan.some((x) => x.kind === 'bridge') ? undefined : cut), { record: false });
        return { impact: r.impact, ttf: r.ttf, lostHours: r.lostHours };
      });
      post({ type: 'compare', results });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
