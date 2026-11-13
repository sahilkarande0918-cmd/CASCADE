// The cascade engine.
//
// A discrete-event simulation in fixed 15-minute steps over 72 hours. At each
// step the water stage is known, so every node's flood state is known; nodes
// are then evaluated in dependency order. A node whose input is lost keeps
// working while the backup buffer for that input lasts (a generator, a battery,
// a tank), and fails the step the buffer runs out. The result is a
// time-to-failure for every node, not just a pass/fail map.
//
// Deterministic for a given scenario. Uncertainty comes from Monte Carlo over
// the peak stage and over which supplier an inferred edge really points at.

import { backupHours, SIM, type Assumptions } from '../assumptions';
import { accessCutoffs, applyOverrides } from './infer';
import { SERVICES, type CityData, type Edge, type Intervention, type Scenario } from './types';

export const STEPS = Math.round(SIM.horizonHours / SIM.stepHours);
const DT = SIM.stepHours;

/** Node state per step, for playback. */
export const UP = 0, DOWN = 1, BACKUP = 2;
/** Why a node first went down. */
export const CAUSE_FLOOD = 1, CAUSE_MANUAL = 2, CAUSE_INPUT = 3;

export type Prepared = {
  city: CityData;
  a: Assumptions;
  scenario: Scenario;
  edges: Edge[];
  /** Node index of each edge's supplier and consumer. */
  from: Int32Array;
  to: Int32Array;
  alt: Int32Array;
  svc: Uint8Array;
  isOr: Uint8Array;
  /** Highest stage at which an access edge is still passable; Infinity otherwise. */
  cutoff: Float64Array;
  /** Incoming edge indices per node. */
  inEdges: number[][];
  order: number[];
  cyclic: boolean;
  /** Per node: flood threshold (stage at which it is submerged), Infinity if none. */
  floodAt: Float64Array;
  manual: Uint8Array;
  /** Stage-independent restore time (mobile substation), Infinity if none. */
  restoreAt: Float64Array;
  /** Backup hours per node per service (node * 4 + service). */
  buffer: Float64Array;
  weight: Float64Array;
  pop: Float64Array;
  isDistrict: Uint8Array;
};

export function prepare(
  city: CityData,
  scenario: Scenario,
  a: Assumptions,
  baseEdges: Edge[],
  cutoffs?: Map<string, number>,
): Prepared {
  const n = city.nodes.length;
  const idx = new Map(city.nodes.map((x, i) => [x.id, i]));
  const edges = applyOverrides(baseEdges, scenario).filter((e) => idx.has(e.from) && idx.has(e.to));
  const cut = cutoffs ?? accessCutoffs(city, edges, scenario, a);

  const m = edges.length;
  const from = new Int32Array(m), to = new Int32Array(m), alt = new Int32Array(m);
  const svc = new Uint8Array(m), isOr = new Uint8Array(m), cutoff = new Float64Array(m);
  const inEdges: number[][] = Array.from({ length: n }, () => []);
  edges.forEach((e, i) => {
    from[i] = idx.get(e.from)!;
    to[i] = idx.get(e.to)!;
    alt[i] = e.alt !== undefined && idx.has(e.alt) ? idx.get(e.alt)! : -1;
    svc[i] = SERVICES.indexOf(e.type);
    isOr[i] = e.logic === 'or' ? 1 : 0;
    cutoff[i] = e.type === 'access' ? (cut.get(e.id) ?? -Infinity) : Infinity;
    inEdges[to[i]].push(i);
  });

  // Kahn's algorithm over real and alternative suppliers, so Monte Carlo's
  // swapped suppliers are still evaluated before their consumers.
  const indeg = new Int32Array(n);
  const outs: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < m; i++) {
    for (const s of [from[i], alt[i]]) if (s >= 0) { outs[s].push(to[i]); indeg[to[i]]++; }
  }
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) order.push(i);
  for (let h = 0; h < order.length; h++) for (const c of outs[order[h]]) if (--indeg[c] === 0) order.push(c);
  const cyclic = order.length < n;
  if (cyclic) for (let i = 0; i < n; i++) if (indeg[i] > 0) order.push(i);

  const by = (kind: Intervention['kind']) => new Set(scenario.interventions.filter((x) => x.kind === kind).map((x) => x.node));
  const gen = by('generator'), harden = by('harden'), bridge = by('bridge'), mobile = by('mobile_substation');
  const manualSet = new Set(scenario.failed);

  const floodAt = new Float64Array(n), manual = new Uint8Array(n), restoreAt = new Float64Array(n).fill(Infinity);
  const buffer = new Float64Array(n * 4), pop = new Float64Array(n), isDistrict = new Uint8Array(n);
  city.nodes.forEach((x, i) => {
    const raise = harden.has(x.id) || bridge.has(x.id) ? a['int.hardenMetres'] : 0;
    const depth = x.kind === 'bridge' ? a['bridge.clearance'] : (a as Record<string, number>)[`depth.${x.kind}`];
    floodAt[i] = depth === undefined ? Infinity : x.hand + depth + raise;
    // A repaired bridge is open again even if it was failed by hand.
    manual[i] = manualSet.has(x.id) && !bridge.has(x.id) ? 1 : 0;
    if (mobile.has(x.id)) restoreAt[i] = a['int.mobileDeployHours'];
    SERVICES.forEach((s, j) => {
      buffer[i * 4 + j] = backupHours(a, x.kind, s) + (s === 'power' && gen.has(x.id) ? a['int.generatorHours'] : 0);
    });
    if (x.kind === 'district') {
      isDistrict[i] = 1;
      pop[i] = x.pop ?? a['pop.district'];
    }
  });
  const weight = Float64Array.from(SERVICES, (s) => a[`weight.${s}`]);

  return { city, a, scenario, edges, from, to, alt, svc, isOr, cutoff, inEdges, order, cyclic, floodAt, manual, restoreAt, buffer, weight, pop, isDistrict };
}

export type RunResult = {
  /** First time (hours) each node went down; Infinity if it never did. Districts: any service lost. */
  ttf: Float64Array;
  /** (STEPS + 1) * n states: UP, DOWN or BACKUP. */
  state: Uint8Array;
  cause: Uint8Array;
  /** Edge that carried the failure in, for CAUSE_INPUT; -1 otherwise. */
  causeEdge: Int32Array;
  /** Per district per service: hours without it, and when it was first lost. */
  lostHours: Float64Array;
  firstLoss: Float64Array;
  /** Criticality-weighted thousand person-hours of essential service lost. */
  impact: number;
};

export type RunOptions = { peak?: number; supplier?: Int32Array; record?: boolean };

export function run(p: Prepared, opt: RunOptions = {}): RunResult {
  const n = p.city.nodes.length;
  const peak = opt.peak ?? p.scenario.stage;
  const supplier = opt.supplier ?? p.from;
  const record = opt.record ?? true;
  const rise = p.a['hazard.riseHours'];

  const up = new Uint8Array(n);
  const used = new Float64Array(n * 4);
  const lost = new Uint8Array(n * 4);
  const unmet = new Uint8Array(n * 4);
  const ttf = new Float64Array(n).fill(Infinity);
  const cause = new Uint8Array(n), causeEdge = new Int32Array(n).fill(-1);
  const lostHours = new Float64Array(n * 4), firstLoss = new Float64Array(n * 4).fill(Infinity);
  const state = new Uint8Array(record ? (STEPS + 1) * n : 0);
  const okType = new Uint8Array(4), orSeen = new Uint8Array(4), orOk = new Uint8Array(4), andBad = new Int32Array(4), orBad = new Int32Array(4);
  let impact = 0;

  for (let k = 0; k <= STEPS; k++) {
    const t = k * DT;
    const stage = rise > 0 ? peak * Math.min(1, t / rise) : peak;
    const passes = p.cyclic ? 4 : 1;
    for (let pass = 0; pass < passes; pass++) {
      for (const i of p.order) {
        const restored = t >= p.restoreAt[i];
        const flooded = !restored && stage >= p.floodAt[i];
        const manual = !restored && p.manual[i] === 1;
        if (flooded || manual) {
          up[i] = 0;
          if (pass === passes - 1 && ttf[i] === Infinity) { ttf[i] = t; cause[i] = manual ? CAUSE_MANUAL : CAUSE_FLOOD; }
          if (record && pass === passes - 1) state[k * n + i] = DOWN;
          for (let s = 0; s < 4; s++) { lost[i * 4 + s] = 0; unmet[i * 4 + s] = 0; }
          continue;
        }

        okType.fill(1); orSeen.fill(0); orOk.fill(0); andBad.fill(-1); orBad.fill(-1);
        for (const e of p.inEdges[i]) {
          const s = p.svc[e];
          const ok = up[supplier[e]] === 1 && stage < p.cutoff[e];
          if (p.isOr[e]) { orSeen[s] = 1; if (ok) orOk[s] = 1; else orBad[s] = e; }
          else if (!ok) { okType[s] = 0; andBad[s] = e; }
        }

        let alive = 1, onBackup = 0, killer = -1;
        for (let s = 0; s < 4; s++) {
          const sat = okType[s] === 1 && (orSeen[s] === 0 || orOk[s] === 1);
          lost[i * 4 + s] = 0;
          unmet[i * 4 + s] = sat ? 0 : 1;
          if (sat) continue;
          if (used[i * 4 + s] >= p.buffer[i * 4 + s]) {
            lost[i * 4 + s] = 1;
            alive = 0;
            if (killer < 0) killer = andBad[s] >= 0 ? andBad[s] : orBad[s];
          } else onBackup = 1;
        }
        // Districts are areas, not facilities: they lose services, they do not "go down" as a whole.
        up[i] = p.isDistrict[i] ? 1 : alive;
        if (pass !== passes - 1) continue;
        if (!alive && ttf[i] === Infinity) { ttf[i] = t; cause[i] = CAUSE_INPUT; causeEdge[i] = killer; }
        if (record) state[k * n + i] = alive ? (onBackup ? BACKUP : UP) : DOWN;
      }
    }

    // Book the loss, then drain the buffer of every input that is unmet this step.
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < 4; s++) {
        const j = i * 4 + s;
        if (lost[j]) {
          if (k < STEPS) {
            lostHours[j] += DT;
            if (p.isDistrict[i]) impact += (p.weight[s] * p.pop[i] * DT) / 1000;
          }
          if (firstLoss[j] === Infinity) firstLoss[j] = t;
        }
      }
    }
    for (let j = 0; j < n * 4; j++) if (unmet[j]) used[j] += DT;
  }
  return { ttf, state, cause, causeEdge, lostHours, firstLoss, impact };
}

// ---------------------------------------------------------------------------

/** Small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type MonteCarlo = { runs: number; ttf: Float32Array; impact: Float64Array };

export function monteCarlo(p: Prepared, runs: number, seed = 1): MonteCarlo {
  const n = p.city.nodes.length;
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const ttf = new Float32Array(runs * n);
  const impact = new Float64Array(runs);
  const sigma = p.a['hazard.stageSigma'];
  for (let r = 0; r < runs; r++) {
    const peak = Math.max(0, p.scenario.stage + sigma * gauss());
    const supplier = Int32Array.from(p.from);
    p.edges.forEach((e, i) => {
      if (p.alt[i] >= 0 && rand() > e.confidence) supplier[i] = p.alt[i];
    });
    const res = run(p, { peak, supplier, record: false });
    ttf.set(Float32Array.from(res.ttf), r * n);
    impact[r] = res.impact;
  }
  return { runs, ttf, impact };
}

/** Nodes worth testing: anything something else depends on, plus bridges. */
export function candidates(p: Prepared): number[] {
  const set = new Set<number>(p.from);
  p.city.nodes.forEach((x, i) => { if (x.kind === 'bridge') set.add(i); });
  return [...set].filter((i) => !p.isDistrict[i]);
}

export type Fragility = { node: string; delta: number; impact: number }[];

/** Top single points of failure: extra impact when each node alone is failed at t = 0. */
export function fragility(city: CityData, s: Scenario, a: Assumptions, edges: Edge[], top = 10, onProgress?: (f: number) => void): Fragility {
  const base = prepare(city, s, a, edges);
  const baseImpact = run(base, { record: false }).impact;
  const cand = candidates(base);
  const out: Fragility = [];
  cand.forEach((i, j) => {
    const id = city.nodes[i].id;
    if (s.failed.includes(id)) return;
    const sc = { ...s, failed: [...s.failed, id] };
    const q = city.nodes[i].kind === 'bridge' ? prepare(city, sc, a, edges) : withManual(base, i);
    const impact = run(q, { record: false }).impact;
    out.push({ node: id, delta: impact - baseImpact, impact });
    if (onProgress && j % 20 === 0) onProgress(j / cand.length);
  });
  return out.sort((x, y) => y.delta - x.delta).slice(0, top);
}

function withManual(p: Prepared, i: number): Prepared {
  const manual = Uint8Array.from(p.manual);
  manual[i] = 1;
  return { ...p, manual };
}

// ---------------------------------------------------------------------------
// Budgeted optimizer.

export type Plan = { interventions: Intervention[]; impact: number; delta: number };

/** Interventions that could plausibly help, given how the baseline played out. */
export function interventionCandidates(p: Prepared, base: RunResult): Intervention[] {
  const out: Intervention[] = [];
  p.city.nodes.forEach((x, i) => {
    if (p.isDistrict[i] || base.ttf[i] === Infinity) return;
    const id = x.id;
    if (x.kind === 'bridge') { out.push({ kind: 'bridge', node: id }); return; }
    if (base.cause[i] === CAUSE_FLOOD) out.push({ kind: 'harden', node: id });
    if (x.kind === 'substation') out.push({ kind: 'mobile_substation', node: id });
    const e = base.causeEdge[i];
    if (base.cause[i] === CAUSE_INPUT && e >= 0 && p.svc[e] === 0) out.push({ kind: 'generator', node: id });
  });
  return out;
}

export function optimize(
  city: CityData, s: Scenario, a: Assumptions, edges: Edge[], k: number,
  onProgress?: (f: number) => void,
): { best: Plan[]; baseline: number; evaluated: number } {
  const base = prepare(city, s, a, edges);
  const baseRun = run(base, { record: false });
  const baseline = baseRun.impact;
  const cands = interventionCandidates(base, baseRun);
  const baseCut = new Map(base.edges.map((e, i) => [e.id, base.cutoff[i]]));
  let evaluated = 0;

  const score = (plan: Intervention[]) => {
    evaluated++;
    const sc = { ...s, interventions: [...s.interventions, ...plan] };
    const touchesRoads = plan.some((x) => x.kind === 'bridge');
    return run(prepare(city, sc, a, edges, touchesRoads ? undefined : baseCut), { record: false }).impact;
  };

  // Single-intervention gains, which also seed the lazy greedy queue.
  const single = cands.map((c, j) => {
    if (onProgress && j % 10 === 0) onProgress((0.5 * j) / Math.max(1, cands.length));
    return { c, gain: baseline - score([c]) };
  }).filter((x) => x.gain > 1e-9).sort((x, y) => y.gain - x.gain);

  const mk = (plan: Intervention[], impact: number): Plan => ({ interventions: plan, impact, delta: impact - baseline });

  if (k <= 3) {
    // Exhaustive over the shortlist of the best single moves.
    const short = single.slice(0, 15).map((x) => x.c);
    const plans: Plan[] = [];
    const combos = (start: number, pick: Intervention[]) => {
      if (pick.length === Math.min(k, short.length)) { plans.push(mk(pick, score(pick))); return; }
      for (let i = start; i < short.length; i++) combos(i + 1, [...pick, short[i]]);
    };
    combos(0, []);
    onProgress?.(1);
    return { best: plans.sort((x, y) => x.impact - y.impact).slice(0, 3), baseline, evaluated };
  }

  // Lazy greedy (CELF): marginal gains only shrink as the plan grows, so a
  // stale gain is an upper bound and most candidates never need re-scoring.
  const plan: Intervention[] = [];
  let current = baseline;
  const heap = single.map((x) => ({ ...x, round: 0 }));
  const runnersUp: Intervention[] = [];
  for (let round = 1; round <= k && heap.length; round++) {
    for (;;) {
      heap.sort((x, y) => y.gain - x.gain);
      const top = heap[0];
      if (top.round === round) break;
      top.gain = current - score([...plan, top.c]);
      top.round = round;
    }
    const pick = heap.shift()!;
    if (pick.gain <= 1e-9) break;
    plan.push(pick.c);
    current -= pick.gain;
    if (round === k) runnersUp.push(...heap.slice(0, 2).map((x) => x.c));
    onProgress?.(0.5 + (0.5 * round) / k);
  }
  const best = [mk(plan, current)];
  for (const r of runnersUp) {
    const alt = [...plan.slice(0, -1), r];
    best.push(mk(alt, score(alt)));
  }
  return { best: best.sort((x, y) => x.impact - y.impact), baseline, evaluated };
}

/** The chain of node indices that took node `i` down, root cause first. */
export function trace(r: Pick<RunResult, 'cause' | 'causeEdge'>, from: ArrayLike<number>, i: number): number[] {
  const path = [i];
  const seen = new Set(path);
  let cur = i;
  while (r.cause[cur] === CAUSE_INPUT && r.causeEdge[cur] >= 0) {
    const next = from[r.causeEdge[cur]];
    if (seen.has(next)) break;
    seen.add(next);
    path.unshift(next);
    cur = next;
  }
  return path;
}
