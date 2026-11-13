import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS as A } from '../assumptions';
import { accessCutoffs, inferEdges } from './infer';
import { CAUSE_FLOOD, CAUSE_INPUT, CAUSE_MANUAL, monteCarlo, optimize, prepare, rng, run, STEPS } from './simulate';
import type { CityData, CityNode, Edge, Kind, Scenario, Service } from './types';

const node = (id: string, kind: Kind, extra: Partial<CityNode> = {}): CityNode => ({
  id, kind, name: id, lng: 0, lat: 0, elev: 10, hand: 100, road: -1, osm: '', ...extra,
});
const edge = (from: string, to: string, type: Service, logic: 'and' | 'or' = 'and', extra: Partial<Edge> = {}): Edge => ({
  id: `${type}:${from}>${to}`, from, to, type, logic, provenance: 'inferred', confidence: 1, note: '', ...extra,
});
const city = (nodes: CityNode[], road: CityData['road'] = { v: [], e: [] }): CityData => ({
  key: 'toy', name: 'Toy', country: '', bbox: [0, 0, 1, 1], center: [0, 0], zoom: 12, generatedAt: '',
  nodes, observed: [], road, grid: { bbox: [0, 0, 1, 1], nx: 0, ny: 0, h: [] },
});
const scenario = (s: Partial<Scenario> = {}): Scenario => ({ stage: 0, failed: [], interventions: [], edgeOverrides: {}, ...s });
const ttfOf = (c: CityData, edges: Edge[], s: Scenario, id: string) =>
  run(prepare(c, s, A, edges)).ttf[c.nodes.findIndex((n) => n.id === id)];

describe('cascade engine', () => {
  it('propagates down a simple chain, respecting each buffer', () => {
    const c = city([node('S', 'substation'), node('P', 'pumping'), node('D', 'district')]);
    const edges = [edge('S', 'P', 'power'), edge('P', 'D', 'water')];
    const s = scenario({ failed: ['S'] });
    const r = run(prepare(c, s, A, edges));
    expect(r.ttf[0]).toBe(0);
    expect(r.cause[0]).toBe(CAUSE_MANUAL);
    expect(r.ttf[1]).toBe(0); // pumping station has no backup power
    expect(r.cause[1]).toBe(CAUSE_INPUT);
    expect(r.ttf[2]).toBe(A['backup.district.water']); // household tanks run dry
    expect(r.causeEdge[2]).toBe(1);
  });

  it('treats AND and OR differently', () => {
    const c = city([node('M1', 'telecom'), node('M2', 'telecom'), node('S1', 'substation'), node('S2', 'substation'), node('H', 'hospital')]);
    const or = [edge('M1', 'H', 'comms', 'or'), edge('M2', 'H', 'comms', 'or')];
    expect(ttfOf(c, or, scenario({ failed: ['M1'] }), 'H')).toBe(Infinity);
    expect(ttfOf(c, or, scenario({ failed: ['M1', 'M2'] }), 'H')).toBe(A['backup.hospital.comms']);
    const and = [edge('S1', 'H', 'power'), edge('S2', 'H', 'power')];
    expect(ttfOf(c, and, scenario({ failed: ['S1'] }), 'H')).toBe(A['backup.hospital.power']);
  });

  it('expires a backup buffer at the exact step', () => {
    const c = city([node('S', 'substation'), node('M', 'telecom')]);
    const e = [edge('S', 'M', 'power')];
    expect(ttfOf(c, e, scenario({ failed: ['S'] }), 'M')).toBe(4);
    const a = { ...A, 'backup.telecom.power': 4.1 };
    const r = run(prepare(c, scenario({ failed: ['S'] }), a, e));
    expect(r.ttf[1]).toBe(4.25); // first 15-minute step at or after 4.1 h
    expect(r.state[Math.round(4 / 0.25) * 2 + 1]).toBe(2); // still on battery at 4 h
  });

  it('floods nodes at their depth threshold and hardening raises it', () => {
    const c = city([node('S', 'substation', { hand: 1 })]);
    expect(ttfOf(c, [], scenario({ stage: 1.2 }), 'S')).toBe(Infinity);
    const r = run(prepare(c, scenario({ stage: 1.3 }), A, []));
    expect(r.cause[0]).toBe(CAUSE_FLOOD);
    // Rises linearly to 1.3 over 6 h; crosses 1.0 + 0.3 at exactly 6 h.
    expect(r.ttf[0]).toBe(6);
    expect(ttfOf(c, [], scenario({ stage: 1.3, interventions: [{ kind: 'harden', node: 'S' }] }), 'S')).toBe(Infinity);
  });

  it('cuts road access at the bottleneck of the best path', () => {
    // Two routes from H to D: one dips to hand 1, the other to hand 2 over a bridge-free road.
    const road: CityData['road'] = {
      v: [[0, 0, 5], [0, 0, 5], [0, 0, 1], [0, 0, 2]],
      e: [[0, 2, null, null, []], [2, 1, null, null, []], [0, 3, null, null, []], [3, 1, null, null, []]],
    };
    const c = city([node('H', 'hospital', { road: 0 }), node('D', 'district', { road: 1 })], road);
    const e = [edge('H', 'D', 'access', 'or')];
    const cut = accessCutoffs(c, e, scenario(), A);
    expect(cut.get(e[0].id)).toBeCloseTo(2 + A['road.passable']);
  });

  it('never gets worse when a backup is added', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rand = rng(seed);
      const kinds: Kind[] = ['substation', 'pumping', 'water_tower', 'telecom', 'hospital', 'clinic', 'district'];
      const nodes = Array.from({ length: 14 }, (_, i) => node(`n${i}`, kinds[i % kinds.length], { hand: rand() * 3 }));
      const edges: Edge[] = [];
      const types: Service[] = ['power', 'water', 'comms'];
      for (let i = 1; i < nodes.length; i++) {
        for (let j = 0; j < 2; j++) {
          const f = Math.floor(rand() * i);
          const e = edge(nodes[f].id, nodes[i].id, types[Math.floor(rand() * 3)], rand() < 0.5 ? 'and' : 'or');
          if (!edges.some((x) => x.id === e.id) && nodes[i].kind !== 'substation') edges.push(e);
        }
      }
      const c = city(nodes);
      const s = scenario({ stage: 1.5, failed: [nodes[0].id] });
      const base = run(prepare(c, s, A, edges));
      for (const target of nodes.filter((n) => n.kind !== 'district')) {
        const better = run(prepare(c, { ...s, interventions: [{ kind: 'generator', node: target.id }] }, A, edges));
        expect(better.impact).toBeLessThanOrEqual(base.impact + 1e-9);
        better.ttf.forEach((t, i) => expect(t).toBeGreaterThanOrEqual(base.ttf[i]));
      }
    }
  });

  it('is deterministic for a fixed seed', () => {
    const c = city([node('S1', 'substation', { hand: 0.5 }), node('S2', 'substation', { hand: 2 }), node('M', 'telecom'), node('D', 'district')]);
    const e = [edge('S1', 'M', 'power', 'and', { confidence: 0.6, alt: 'S2' }), edge('M', 'D', 'comms', 'or')];
    const p = prepare(c, scenario({ stage: 1 }), A, e);
    const a = monteCarlo(p, 50, 42), b = monteCarlo(p, 50, 42);
    expect(Array.from(a.ttf)).toEqual(Array.from(b.ttf));
    expect(Array.from(a.impact)).toEqual(Array.from(b.impact));
    // Some runs should take the alternative feeder and keep the mast up.
    const mast = Array.from({ length: 50 }, (_, r) => a.ttf[r * 4 + 2]);
    expect(mast.some((t) => t === Infinity)).toBe(true);
    expect(mast.some((t) => t < Infinity)).toBe(true);
  });

  it('finds the plan that removes the single point of failure', () => {
    const c = city([node('S', 'substation', { hand: 0.2 }), node('P', 'pumping'), node('D', 'district')]);
    const e = [edge('S', 'P', 'power'), edge('P', 'D', 'water')];
    const { best, baseline } = optimize(c, scenario({ stage: 1 }), A, e, 1);
    expect(baseline).toBeGreaterThan(0);
    expect(best[0].impact).toBe(0);
    expect(best[0].interventions[0].node).toMatch(/^(S|P)$/);
  });

  it('replays a golden scenario', () => {
    const nodes = [
      node('sub', 'substation', { hand: 0.8, lng: 0, lat: 0 }),
      node('sub2', 'substation', { hand: 4, lng: 0.05, lat: 0 }),
      node('pump', 'pumping', { hand: 3, lng: 0.01, lat: 0 }),
      node('tower', 'water_tower', { hand: 5, lng: 0.012, lat: 0 }),
      node('mast', 'telecom', { hand: 2, lng: 0.01, lat: 0.01 }),
      node('hosp', 'hospital', { hand: 1.5, lng: 0.02, lat: 0.01 }),
      node('d1', 'district', { lng: 0.015, lat: 0.005, pop: 10000, popSource: 'osm' }),
      node('d2', 'district', { lng: 0.04, lat: 0.005 }),
    ];
    const c = city(nodes);
    const edges = inferEdges(c, A);
    const r = run(prepare(c, scenario({ stage: 1.4 }), A, edges));
    const summary = Object.fromEntries(nodes.map((n, i) => [n.id, r.ttf[i]]));
    expect({ edges: edges.map((e) => e.id), ttf: summary, impact: Math.round(r.impact * 1000) / 1000 }).toMatchSnapshot();
    expect(r.state.length).toBe((STEPS + 1) * nodes.length);
  });
});
