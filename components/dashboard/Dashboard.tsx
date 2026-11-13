'use client';

import dynamic from 'next/dynamic';
import NavPill from '@/components/NavPill';
import Sky from '@/components/Sky';
import { hhmm } from '@/lib/labels';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { SIM } from '@/lib/assumptions';
import { Lane } from '@/lib/engine/client';
import { STEPS, type Fragility, type Plan, type RunResult } from '@/lib/engine/simulate';
import type { CityData, Edge, Intervention, Scenario } from '@/lib/engine/types';
import { assumptionsOf, decode, encode, initialState, type AppState } from '@/lib/scenario';
import type { MapView } from './CascadeMap';
import {
  Brief, FragilityPanel, ImpactPanel, Inspector, OptimizerPanel, PlansPanel, ScenarioRail, Scrubber,
  type Mc, type Compare,
} from './Panels';

const CascadeMap = dynamic(() => import('./CascadeMap'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-muted">Loading map…</div>,
});

export type Run = { edges: Edge[]; cutoff: Float64Array; result: RunResult; key: string };
export type Selection = { node: number | null; edge: number | null };

export default function Dashboard() {
  // Client-only component: the hash (a shared link) wins, then the last session, then defaults.
  const [st, setSt] = useState<AppState>(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem('cascade:last'); } catch {}
    return decode(location.hash) ?? (saved ? decode(saved) : null) ?? initialState();
  });
  const [loaded, setLoaded] = useState<CityData | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [mc, setMc] = useState<Mc | null>(null);
  const [progress, setProgress] = useState(0);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [t, setT] = useState(STEPS);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Selection>({ node: null, edge: null });
  const [mode, setMode] = useState<'inspect' | 'fail'>('inspect');
  const [editPlan, setEditPlan] = useState(0);
  const [showDeps, setShowDeps] = useState(true);
  const [frag, setFrag] = useState<{ list: Fragility | null; busy: number | null }>({ list: null, busy: null });
  const [opt, setOpt] = useState<{ best: Plan[]; baseline: number; evaluated: number; k: number } | null>(null);
  const [optBusy, setOptBusy] = useState<number | null>(null);
  const [cmp, setCmp] = useState<Compare | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lanes = useRef<{ run: Lane; frag: Lane; opt: Lane; cmp: Lane } | null>(null);

  useEffect(() => {
    lanes.current = { run: new Lane(), frag: new Lane(), opt: new Lane(), cmp: new Lane() };
    const l = lanes.current;
    return () => Object.values(l).forEach((x) => x.dispose());
  }, []);

  useEffect(() => {
    const h = encode(st);
    history.replaceState(null, '', `#${h}`);
    try { localStorage.setItem('cascade:last', h); } catch {}
  }, [st]);

  // The city file for the current key; anything for another city is ignored below.
  useEffect(() => {
    let live = true;
    fetch(`/data/${st.city}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: CityData) => { if (live) { setLoaded(d); setCityError(null); } })
      .catch((e) => live && setCityError(String(e.message ?? e)));
    return () => { live = false; };
  }, [st.city]);
  const city = loaded?.key === st.city ? loaded : null;

  const a = useMemo(() => assumptionsOf(st), [st]);
  const scenario: Scenario = useMemo(() => ({
    stage: st.stage, failed: st.failed, edgeOverrides: st.overrides,
    interventions: st.view >= 0 ? st.plans[st.view] : [],
  }), [st]);
  const baseline: Scenario = useMemo(() => ({ ...scenario, interventions: [] }), [scenario]);
  const runKey = city ? JSON.stringify([city.key, scenario, a]) : '';

  // Deterministic run, then Monte Carlo, whenever the scenario changes.
  useEffect(() => {
    if (!city || !lanes.current) return;
    const id = setTimeout(() => {
      setProgress(0);
      setMc(null);
      lanes.current!.run.send({ type: 'run', city: city.key, scenario, a }, (msg) => {
        if (msg.type === 'run') { setRun({ edges: msg.edges, cutoff: msg.cutoff, result: msg.result, key: runKey }); setEngineError(null); }
        else if (msg.type === 'progress') setProgress(msg.f);
        else if (msg.type === 'mc') setMc({ runs: msg.runs, ttf: msg.ttf, impact: msg.impact, key: runKey });
        else if (msg.type === 'error') setEngineError(msg.message);
      });
    }, 120);
    return () => clearTimeout(id);
  }, [city, scenario, a, runKey]);

  // Plan comparison follows the plans.
  const planKey = JSON.stringify(st.plans);
  useEffect(() => {
    if (!city || !lanes.current) return;
    const plans = st.plans.filter((p) => p.length);
    if (!plans.length) return;
    const id = setTimeout(() => {
      lanes.current!.cmp.send({ type: 'compare', city: city.key, scenario: baseline, a, plans: [[], ...st.plans] }, (msg) => {
        if (msg.type === 'compare') setCmp({ results: msg.results, key: planKey });
      });
    }, 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, baseline, a, planKey]);

  // Playback.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      acc += now - last; last = now;
      const steps = Math.floor(acc / 55);
      if (steps) {
        acc -= steps * 55;
        setT((x) => {
          const n = Math.min(STEPS, x + steps);
          if (n === STEPS) setPlaying(false);
          return n;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const update = useCallback((f: (s: AppState) => AppState) => setSt((s) => f(s)), []);
  const setCityKey = (k: AppState['city']) => {
    setSt(initialState(k)); setT(STEPS); setRun(null); setMc(null);
    setFrag({ list: null, busy: null }); setOpt(null); setCmp(null); setSel({ node: null, edge: null });
  };

  const hours = t * SIM.stepHours;
  const stageNow = st.stage * Math.min(1, a['hazard.riseHours'] > 0 ? hours / a['hazard.riseHours'] : 1);
  const n = city?.nodes.length ?? 0;
  const fresh = run && city && run.result.ttf.length === n ? run : null;

  const view: MapView = useMemo(() => {
    const states = fresh ? fresh.result.state.subarray(t * n, (t + 1) * n) : null;
    const since = fresh ? Float32Array.from(fresh.result.ttf, (x) => (x <= hours ? hours - x : -1)) : null;
    const traceEdges = new Set<number>();
    if (fresh && sel.node !== null && fresh.result.ttf[sel.node] <= hours) {
      let cur = sel.node;
      const seen = new Set([cur]);
      while (fresh.result.cause[cur] === 3 && fresh.result.causeEdge[cur] >= 0) {
        const e = fresh.result.causeEdge[cur];
        traceEdges.add(e);
        const next = city!.nodes.findIndex((x) => x.id === fresh.edges[e].from);
        if (next < 0 || seen.has(next)) break;
        seen.add(next); cur = next;
      }
    }
    if (sel.edge !== null) traceEdges.add(sel.edge);
    const focusEdges = new Set<number>();
    if (fresh && sel.node !== null) {
      const id = city!.nodes[sel.node].id;
      fresh.edges.forEach((e, j) => { if (e.from === id || e.to === id) focusEdges.add(j); });
    }
    return {
      states, since, stage: stageNow, selected: sel.node ?? -1, traceEdges, focusEdges,
      failed: new Set(st.failed), planned: new Set(scenario.interventions.map((i) => i.node)), showDeps,
    };
  }, [fresh, t, n, hours, sel, stageNow, st.failed, scenario.interventions, showDeps, city]);

  const onNode = useCallback((i: number | null) => {
    if (i === null) { setSel({ node: null, edge: null }); return; }
    if (mode === 'fail' && city) {
      const id = city.nodes[i].id;
      if (city.nodes[i].kind === 'district') { setSel({ node: i, edge: null }); return; }
      update((s) => ({ ...s, failed: s.failed.includes(id) ? s.failed.filter((x) => x !== id) : [...s.failed, id] }));
    }
    setSel({ node: i, edge: null });
  }, [mode, city, update]);
  const onEdge = useCallback((i: number) => setSel({ node: null, edge: i }), []);

  const addIntervention = (iv: Intervention) =>
    update((s) => {
      const plans = s.plans.map((p, j) => (j === editPlan && !p.some((x) => x.kind === iv.kind && x.node === iv.node) ? [...p, iv].slice(0, 10) : p));
      return { ...s, plans };
    });

  const runFragility = () => {
    if (!city || !lanes.current) return;
    setFrag({ list: null, busy: 0 });
    lanes.current.frag.send({ type: 'fragility', city: city.key, scenario: baseline, a }, (msg) => {
      if (msg.type === 'progress') setFrag((f) => ({ ...f, busy: msg.f }));
      if (msg.type === 'fragility') setFrag({ list: msg.list, busy: null });
      if (msg.type === 'error') { setFrag({ list: null, busy: null }); setEngineError(msg.message); }
    });
  };
  const runOptimizer = (k: number) => {
    if (!city || !lanes.current) return;
    setOptBusy(0); setOpt(null);
    lanes.current.opt.send({ type: 'optimize', city: city.key, scenario: baseline, a, k }, (msg) => {
      if (msg.type === 'progress') setOptBusy(msg.f);
      if (msg.type === 'optimize') { setOpt({ best: msg.best, baseline: msg.baseline, evaluated: msg.evaluated, k }); setOptBusy(null); }
      if (msg.type === 'error') { setOptBusy(null); setEngineError(msg.message); }
    });
  };

  const shared = { city, run: fresh, mc: mc && mc.key === fresh?.key ? mc : null, st, a, hours, update, setSel };

  return (
    <div className="relative isolate flex min-h-dvh flex-col text-ink lg:h-dvh lg:overflow-hidden">
      <Sky fixed />
      <div className="px-4 pt-4 print:hidden">
        <NavPill action={{ href: '/method', label: 'Read the method' }} />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)_380px] print:hidden">
        <aside className="order-2 flex flex-col gap-4 lg:order-1 lg:overflow-y-auto lg:pr-1">
          <ScenarioRail
            {...shared}
            setCityKey={setCityKey}
            mode={mode} setMode={setMode}
            showDeps={showDeps} setShowDeps={setShowDeps}
            onPrint={() => {
              const img = mapRef.current?.getCanvas().toDataURL('image/png');
              const el = document.getElementById('brief-map') as HTMLImageElement | null;
              if (el && img) el.src = img;
              setTimeout(() => window.print(), 60);
            }}
          />
        </aside>

        <main className="order-1 flex min-h-[64vh] flex-col overflow-hidden rounded-3xl bg-cream/60 shadow-[0_20px_60px_-30px_color-mix(in_oklab,var(--ink)_40%,transparent)] lg:order-2 lg:min-h-0">
          <div className="relative flex-1">
            {city ? (
              <CascadeMap city={city} edges={fresh?.edges ?? []} a={a} view={view} onNode={onNode} onEdge={onEdge} onReady={(m) => (mapRef.current = m)} />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <p className="text-muted">{cityError ? `Could not load city data: ${cityError}` : 'Loading city data…'}</p>
              </div>
            )}
            <MapOverlay mode={mode} stage={stageNow} hours={hours} progress={mc ? 1 : progress} engineError={engineError} />
          </div>
          <Scrubber t={t} setT={setT} playing={playing} setPlaying={setPlaying} hours={hours} stage={stageNow} run={fresh} city={city} />
        </main>

        <aside className="order-3 flex flex-col gap-4 lg:overflow-y-auto lg:pl-1">
          {(sel.node !== null || sel.edge !== null) && (
            <Inspector {...shared} sel={sel} addIntervention={addIntervention} editPlan={editPlan} />
          )}
          <ImpactPanel {...shared} />
          <FragilityPanel {...shared} frag={frag} onRun={runFragility} />
          <PlansPanel {...shared} cmp={cmp && cmp.key === planKey && st.plans.some((p) => p.length) ? cmp : null} editPlan={editPlan} setEditPlan={setEditPlan} />
          <OptimizerPanel {...shared} opt={opt} busy={optBusy} onRun={runOptimizer} />
        </aside>
      </div>

      <Brief {...shared} cmp={cmp} frag={frag.list} />
    </div>
  );
}

function MapOverlay({ mode, stage, hours, progress, engineError }: { mode: string; stage: number; hours: number; progress: number; engineError: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
      <div className="rounded-2xl bg-cream/85 px-4 py-2 backdrop-blur">
        <p className="text-[13px] text-muted">Simulated scenario · T+{hhmm(hours)}</p>
        <p className="tabular text-[15px]">River {stage.toFixed(2)} m above drainage</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        {mode === 'fail' && <p className="rounded-full bg-signal px-4 py-2 text-[14px] text-ink">Fail mode: click a node to fail it</p>}
        {progress < 1 && <p className="rounded-full bg-cream/85 px-4 py-2 text-[14px] text-muted backdrop-blur">Monte Carlo {Math.round(progress * 100)}%</p>}
        {engineError && <p className="rounded-full bg-signal px-4 py-2 text-[14px] text-ink">Engine error: {engineError}</p>}
      </div>
    </div>
  );
}
