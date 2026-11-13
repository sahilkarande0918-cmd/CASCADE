'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ASSUMPTION_META, DEFAULT_ASSUMPTIONS, SIM, type AssumptionKey, type Assumptions } from '@/lib/assumptions';
import { CITIES, type CityKey } from '@/lib/cities';
import { BACKUP, CAUSE_FLOOD, CAUSE_INPUT, CAUSE_MANUAL, DOWN, STEPS, type Fragility, type Plan } from '@/lib/engine/simulate';
import { SERVICES, type CityData, type CityNode, type Edge, type Intervention, type InterventionKind } from '@/lib/engine/types';
import { hhmm, INTERVENTION, KIND, SERVICE_LABEL } from '@/lib/labels';
import { MAX_STAGE, type AppState } from '@/lib/scenario';
import type { Run, Selection } from './Dashboard';

export type Mc = { runs: number; ttf: Float32Array; impact: Float64Array; key: string };
export type Compare = { results: { impact: number; ttf: Float64Array; lostHours: Float64Array }[]; key: string };

type Shared = {
  city: CityData | null;
  run: Run | null;
  mc: Mc | null;
  st: AppState;
  a: Assumptions;
  hours: number;
  update: (f: (s: AppState) => AppState) => void;
  setSel: (s: Selection) => void;
};

const PLAN_NAMES = ['A', 'B', 'C'];
const k1 = (x: number) => (x >= 100 ? Math.round(x).toLocaleString('en-US') : x.toFixed(1));

// ---- small building blocks --------------------------------------------------

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="shrink-0 rounded-3xl bg-cream/80 p-5 shadow-[0_10px_40px_-20px_color-mix(in_oklab,var(--ink)_30%,transparent)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const btn = 'inline-flex min-h-9 items-center justify-center rounded-full px-3 text-sm transition-colors disabled:opacity-40';
const btnPrimary = `${btn} bg-amber font-medium text-ink hover:bg-ember active:scale-[0.97]`;
const btnGhost = `${btn} bg-surface text-ink hover:bg-surface-2 active:scale-[0.97]`;

function Badge({ prov }: { prov: Edge['provenance'] }) {
  const c = prov === 'observed' ? 'bg-lagoon/25 text-lagoon-ink' : prov === 'user-set' ? 'bg-amber/30 text-amber-ink' : 'bg-dusk/15 text-dusk';
  return <span className={`rounded-full px-2 py-0.5 text-[13px] ${c}`}>{prov}</span>;
}

function useIndex(city: CityData | null) {
  return useMemo(() => new Map(city?.nodes.map((n, i) => [n.id, i]) ?? []), [city]);
}

/** How many nodes depend on each node, directly or through others. */
function useDownstream(city: CityData | null, edges: Edge[] | undefined) {
  return useMemo(() => {
    if (!city || !edges) return null;
    const out = new Map<string, string[]>();
    for (const e of edges) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
    return (id: string) => {
      const seen = new Set<string>([id]);
      const stack = [id];
      while (stack.length) for (const c of out.get(stack.pop()!) ?? []) if (!seen.has(c)) { seen.add(c); stack.push(c); }
      return seen.size - 1;
    };
  }, [city, edges]);
}

function mcStats(mc: Mc | null, n: number, i: number) {
  if (!mc) return null;
  const xs: number[] = [];
  for (let r = 0; r < mc.runs; r++) xs.push(mc.ttf[r * n + i]);
  xs.sort((x, y) => x - y);
  const q = (p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  return { p: xs.filter((x) => x < Infinity).length / xs.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), xs };
}

// ---- explainer --------------------------------------------------------------

// ---- left rail ---------------------------------------------------------------

export function ScenarioRail(props: Shared & {
  setCityKey: (k: CityKey) => void;
  mode: 'inspect' | 'fail'; setMode: (m: 'inspect' | 'fail') => void;
  showDeps: boolean; setShowDeps: (b: boolean) => void;
  onPrint: () => void;
}) {
  const { st, update, city, a, setCityKey, mode, setMode, showDeps, setShowDeps, onPrint } = props;
  const idx = useIndex(city);
  const [live, setLive] = useState<{ busy?: boolean; text?: string; error?: string }>({});
  const [copied, setCopied] = useState(false);

  const useLive = async () => {
    setLive({ busy: true });
    try {
      const r = await fetch(`/api/hazard?city=${st.city}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      if (d.ratio === null) {
        setLive({ text: `72 h rain ${d.rain72mm} mm. No river discharge forecast for this point, stage unchanged.` });
        return;
      }
      const stage = Math.min(MAX_STAGE, Math.max(0, Math.round(a['hazard.ratingK'] * Math.log2(Math.max(1, d.ratio)) * 10) / 10));
      update((s) => ({ ...s, stage }));
      setLive({ text: `Peak discharge ${d.dischargePeak} m³/s vs 30-day mean ${d.dischargeMean30} (×${d.ratio}); 72 h rain ${d.rain72mm} mm. Stage set to ${stage} m using the rating assumption.` });
    } catch (e) {
      setLive({ error: `Live forecast unavailable (${e instanceof Error ? e.message : 'error'}). Set the stage by hand.` });
    }
  };

  return (
    <>
      <Card title="City">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="City">
          {(Object.keys(CITIES) as CityKey[]).map((k) => (
            <button key={k} role="radio" aria-checked={st.city === k} onClick={() => setCityKey(k)}
              className={`${btn} ${st.city === k ? 'bg-amber font-medium text-ink' : 'bg-surface text-ink hover:bg-surface-2'}`}>
              {CITIES[k].name}
            </button>
          ))}
        </div>
        {city && <p className="mt-2 text-xs text-muted">{city.nodes.length} mapped nodes in a 10×10 km area, {city.country}. OSM data as of {city.generatedAt}.</p>}
      </Card>

      <Card title="Hazard · river flood">
        <label className="block text-sm" htmlFor="stage">Peak stage above drainage</label>
        <div className="mt-1 flex items-center gap-3">
          <input id="stage" type="range" min={0} max={MAX_STAGE} step={0.1} value={st.stage} className="w-full"
            onChange={(e) => update((s) => ({ ...s, stage: Number(e.target.value) }))} />
          <output htmlFor="stage" className="tabular w-14 text-right text-sm">{st.stage.toFixed(1)} m</output>
        </div>
        <p className="mt-1 text-xs text-muted">Rises to the peak over {a['hazard.riseHours']} h, then holds. Bathtub model on height above the nearest river, canal or coast.</p>
        <button className={`${btnGhost} mt-3 w-full`} onClick={useLive} disabled={live.busy}>
          {live.busy ? 'Fetching forecast…' : 'Use live forecast (Open-Meteo)'}
        </button>
        {(live.text || live.error) && <p className={`mt-2 text-xs ${live.error ? 'text-signal-ink' : 'text-muted'}`} role="status">{live.error ?? live.text}</p>}
      </Card>

      <Card title="Fail a node">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Map click mode">
          {(['inspect', 'fail'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={`${btn} ${mode === m ? (m === 'fail' ? 'bg-signal font-medium text-ink' : 'bg-amber font-medium text-ink') : 'bg-surface hover:bg-surface-2'}`}>
              {m === 'inspect' ? 'Inspect' : 'Fail on click'}
            </button>
          ))}
        </div>
        {st.failed.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {st.failed.map((id) => (
              <li key={id}>
                <button className="rounded-full border border-signal/60 px-2 py-1 text-xs text-signal-ink hover:bg-signal hover:text-ink"
                  onClick={() => update((s) => ({ ...s, failed: s.failed.filter((x) => x !== id) }))} aria-label={`Restore ${city?.nodes[idx.get(id) ?? -1]?.name ?? id}`}>
                  {city?.nodes[idx.get(id) ?? -1]?.name ?? id} ×
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-xs text-muted">Nothing failed by hand. Switch to fail mode and click any node.</p>}
      </Card>

      <Card title="Dependencies">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showDeps} onChange={(e) => setShowDeps(e.target.checked)} className="accent-coral" />
          Show dependency threads
        </label>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          <li className="flex items-center gap-2"><span className="h-0.5 w-6 bg-lagoon-ink" /> observed (traced in OSM)</li>
          <li className="flex items-center gap-2"><span className="h-0.5 w-6 bg-dusk" /> inferred (heuristic, with confidence)</li>
          <li className="flex items-center gap-2"><span className="h-0.5 w-6 bg-amber" /> user-set</li>
          <li className="flex items-center gap-2"><span className="h-0.5 w-6 bg-signal" /> supplier down</li>
        </ul>
        {props.run && <p className="mt-2 text-xs text-muted">{props.run.edges.length} dependencies; {props.run.edges.filter((e) => e.provenance === 'observed').length} observed. Click a thread to inspect it.</p>}
      </Card>

      <AssumptionEditor st={st} update={update} />

      <div className="grid grid-cols-2 gap-2">
        <button className={btnGhost} onClick={async () => {
          try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
        }}>{copied ? 'Link copied' : 'Copy share link'}</button>
        <button className={btnGhost} onClick={onPrint}>PDF brief</button>
      </div>
    </>
  );
}

function AssumptionEditor({ st, update }: Pick<Shared, 'st' | 'update'>) {
  const groups = useMemo(() => {
    const g = new Map<string, AssumptionKey[]>();
    (Object.keys(ASSUMPTION_META) as AssumptionKey[]).forEach((k) => (g.get(ASSUMPTION_META[k].group) ?? g.set(ASSUMPTION_META[k].group, []).get(ASSUMPTION_META[k].group)!).push(k));
    return [...g];
  }, []);
  const changed = Object.keys(st.a).length;
  return (
    <Card title="Assumptions" aside={changed ? (
      <button className="text-[13px] text-amber-ink hover:text-ink" onClick={() => update((s) => ({ ...s, a: {} }))}>Reset {changed}</button>
    ) : null}>
      <p className="mb-2 text-xs text-muted">Planning assumptions, not measurements. Edit any value and the simulation reruns.</p>
      {groups.map(([group, keys]) => (
        <details key={group} className="border-t border-ink/10 py-2">
          <summary className="cursor-pointer text-sm">{group}</summary>
          <div className="mt-2 space-y-2">
            {keys.map((k) => {
              const m = ASSUMPTION_META[k];
              const v = st.a[k] ?? DEFAULT_ASSUMPTIONS[k];
              return (
                <label key={k} className="flex items-center justify-between gap-2 text-xs" title={m.note}>
                  <span className={st.a[k] !== undefined ? 'text-amber-ink' : 'text-muted'}>{m.label}</span>
                  <span className="flex items-center gap-1">
                    <input type="number" min={0} step="any" value={v} aria-label={`${m.label} (${m.unit})`}
                      className="tabular w-20 rounded-md border border-ink/15 bg-cream px-2 py-1 text-right text-ink"
                      onChange={(e) => {
                        const x = Number(e.target.value);
                        if (!Number.isFinite(x) || x < 0) return;
                        update((s) => {
                          const a = { ...s.a };
                          if (x === DEFAULT_ASSUMPTIONS[k]) delete a[k]; else a[k] = x;
                          return { ...s, a };
                        });
                      }} />
                    <span className="w-8 text-muted">{m.unit}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </details>
      ))}
    </Card>
  );
}

// ---- scrubber ------------------------------------------------------------------

export function Scrubber({ t, setT, playing, setPlaying, hours, stage, run, city }: {
  t: number; setT: (t: number) => void; playing: boolean; setPlaying: (b: boolean) => void;
  hours: number; stage: number; run: Run | null; city: CityData | null;
}) {
  // Facilities down over time: the shape of the cascade.
  const curve = useMemo(() => {
    if (!run || !city) return '';
    const n = city.nodes.length, pts: string[] = [];
    let max = 1;
    const counts: number[] = [];
    for (let k = 0; k <= STEPS; k += 4) {
      let c = 0;
      for (let i = 0; i < n; i++) if (city.nodes[i].kind !== 'district' && run.result.state[k * n + i] === DOWN) c++;
      counts.push(c); max = Math.max(max, c);
    }
    counts.forEach((c, j) => pts.push(`${(j / (counts.length - 1)) * 100},${30 - (c / max) * 28}`));
    return `M0,30 L${pts.join(' L')} L100,30 Z`;
  }, [run, city]);

  return (
    <div className="bg-cream/85 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button className={`${btnPrimary} w-24`} onClick={() => { if (!playing && t >= STEPS) setT(0); setPlaying(!playing); }} aria-label={playing ? 'Pause playback' : 'Play cascade'}>
          {playing ? 'Pause' : t >= STEPS ? 'Replay' : 'Play'}
        </button>
        <div className="relative flex-1">
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 -top-1 h-7 w-full" aria-hidden>
            <path d={curve} fill="var(--signal)" opacity="0.25" />
          </svg>
          <input type="range" min={0} max={STEPS} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
            className="relative w-full" aria-label="Simulation time" aria-valuetext={`${hours} hours`} />
        </div>
        <div className="tabular w-28 text-right text-sm">
          T+{hhmm(hours)}<span className="block text-xs text-muted">stage {stage.toFixed(2)} m</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">72 hours in {SIM.stepHours * 60}-minute steps. Shaded: facilities down over time.</p>
    </div>
  );
}

// ---- inspector -------------------------------------------------------------------

export function Inspector(props: Shared & { sel: Selection; addIntervention: (i: Intervention) => void; editPlan: number }) {
  const { sel, run, city } = props;
  if (!city || !run) return null;
  if (sel.edge !== null && run.edges[sel.edge]) return <EdgeInspector {...props} e={run.edges[sel.edge]} />;
  if (sel.node !== null && city.nodes[sel.node]) return <NodeInspector {...props} i={sel.node} />;
  return null;
}

function EdgeInspector({ e, city, update, st, setSel }: Shared & { e: Edge }) {
  const idx = useIndex(city);
  const name = (id?: string) => (id ? city!.nodes[idx.get(id) ?? -1]?.name ?? id : '');
  const o = st.overrides[e.id];
  const set = (v: AppState['overrides'][string] | null) => update((s) => {
    const overrides = { ...s.overrides };
    if (v) overrides[e.id] = v; else delete overrides[e.id];
    return { ...s, overrides };
  });
  return (
    <Card title="Dependency" aside={<button className="text-[13px] text-muted hover:text-ink" onClick={() => setSel({ node: null, edge: null })}>Close</button>}>
      <p className="text-sm"><button className="underline decoration-ink/30 hover:text-dusk" onClick={() => setSel({ node: idx.get(e.from)!, edge: null })}>{name(e.from)}</button>
        <span className="text-muted"> supplies {SERVICE_LABEL[e.type].toLowerCase()} to </span>
        <button className="underline decoration-ink/30 hover:text-dusk" onClick={() => setSel({ node: idx.get(e.to)!, edge: null })}>{name(e.to)}</button></p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge prov={e.provenance} />
        <span className="tabular text-muted">confidence {e.confidence.toFixed(2)}</span>
        <span className="tabular text-muted">{e.logic.toUpperCase()} logic</span>
      </div>
      <p className="mt-2 text-xs text-muted">{e.note}</p>
      {e.alt && <p className="mt-1 text-xs text-muted">Monte Carlo alternative: {name(e.alt)}</p>}
      <div className="mt-3 space-y-2">
        <label className="flex items-center gap-2 text-xs">
          <span className="w-20 text-muted">Confidence</span>
          <input type="range" min={0} max={1} step={0.05} value={o?.confidence ?? e.confidence} className="flex-1"
            onChange={(ev) => set({ confidence: Number(ev.target.value) })} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => set({ confidence: 1 })}>Confirm</button>
          <button className={btnGhost} onClick={() => { set({ removed: true }); setSel({ node: null, edge: null }); }}>Remove dependency</button>
          {o && <button className={btnGhost} onClick={() => set(null)}>Reset</button>}
        </div>
      </div>
    </Card>
  );
}

function canIntervene(n: CityNode): InterventionKind[] {
  if (n.kind === 'district') return [];
  if (n.kind === 'bridge') return ['bridge'];
  const out: InterventionKind[] = ['harden'];
  if (n.kind === 'substation') out.push('mobile_substation');
  else if (n.kind !== 'water_tower') out.push('generator');
  return out;
}

function NodeInspector(props: Shared & { i: number; addIntervention: (i: Intervention) => void; editPlan: number }) {
  const { i, city, run, mc, a, st, hours, update, setSel, addIntervention, editPlan } = props;
  const c = city!, r = run!.result, n = c.nodes[i];
  const idx = useIndex(c);
  const down = useDownstream(c, run!.edges);
  const stats = mcStats(mc, c.nodes.length, i);
  const ttf = r.ttf[i];
  const failedNow = ttf <= hours;
  const stateNow = r.state[Math.round(hours / SIM.stepHours) * c.nodes.length + i];
  const depth = n.kind === 'bridge' ? a['bridge.clearance'] : (a as Record<string, number>)[`depth.${n.kind}`];
  const inputs = run!.edges.map((e, j) => ({ e, j })).filter(({ e }) => e.to === n.id);
  const [explain, setExplain] = useState<{ key: string; text?: string; source?: string; busy?: boolean; error?: string } | null>(null);

  const path = useMemo(() => {
    if (!Number.isFinite(ttf)) return [];
    const p = [i];
    let cur = i;
    while (r.cause[cur] === CAUSE_INPUT && r.causeEdge[cur] >= 0) {
      const nx = idx.get(run!.edges[r.causeEdge[cur]].from)!;
      if (p.includes(nx)) break;
      p.unshift(nx); cur = nx;
    }
    return p;
  }, [i, ttf, r, idx, run]);

  const how = (j: number, k: number) => {
    const x = c.nodes[j];
    if (r.cause[j] === CAUSE_FLOOD) return `floods (ground ${x.hand} m above drainage)`;
    if (r.cause[j] === CAUSE_MANUAL) return 'is failed by hand';
    const e = run!.edges[r.causeEdge[j]];
    const prev = c.nodes[path[k - 1]];
    const b = (a as Record<string, number>)[`backup.${x.kind}.${e.type}`] ?? 0;
    return `loses ${SERVICE_LABEL[e.type].toLowerCase()} from ${prev?.name ?? 'its supplier'}${b > 0 ? `, then its ${b} h backup runs out` : ''}`;
  };
  const traceKey = JSON.stringify([c.key, st.stage, path, Array.from(path, (j) => r.ttf[j])]);

  const askWhy = async () => {
    setExplain({ key: traceKey, busy: true });
    try {
      const body = { city: c.name, stage: st.stage, path: path.map((j, k) => ({ name: c.nodes[j].name, kind: KIND[c.nodes[j].kind].label, how: how(j, k), at: r.ttf[j] })) };
      const res = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setExplain({ key: traceKey, text: d.text, source: d.source });
    } catch (e) {
      setExplain({ key: traceKey, error: e instanceof Error ? e.message : 'failed' });
    }
  };

  const status = n.kind === 'district'
    ? (failedNow ? 'Losing services' : 'All services up')
    : stateNow === DOWN ? 'Down' : stateNow === BACKUP ? 'On backup' : 'Up';
  const tone = status === 'Down' || status === 'Losing services' ? 'text-signal-ink' : status === 'On backup' ? 'text-amber-ink' : 'text-lagoon-ink';

  return (
    <Card title={KIND[n.kind].label} aside={<button className="text-[13px] text-muted hover:text-ink" onClick={() => setSel({ node: null, edge: null })}>Close</button>}>
      <h3 className="font-display text-xl leading-tight">{n.name}</h3>
      <p className="mt-1 text-xs text-muted">
        <a className="underline decoration-ink/30 hover:text-dusk" href={`https://www.openstreetmap.org/${n.osm}`} target="_blank" rel="noreferrer">OSM {n.osm}</a>
        {' · '}ground {n.hand} m above drainage{depth !== undefined && n.kind !== 'district' ? ` · floods at stage ${(n.hand + depth).toFixed(1)} m` : ''}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-surface p-2"><dt className="text-[13px] text-muted">At T+{hhmm(hours)}</dt><dd className={tone}>{status}</dd></div>
        <div className="rounded-2xl bg-surface p-2"><dt className="text-[13px] text-muted">{n.kind === 'district' ? 'First service lost' : 'Time to failure'}</dt>
          <dd className="tabular">{Number.isFinite(ttf) ? `T+${hhmm(ttf)}` : 'Survives 72 h'}</dd></div>
        {stats && (
          <div className="col-span-2 rounded-2xl bg-surface p-2">
            <dt className="text-[13px] text-muted">Monte Carlo · {mc!.runs} runs</dt>
            <dd className="tabular text-xs text-muted">P(fail within 72 h) <span className="text-ink">{Math.round(stats.p * 100)}%</span>
              {stats.p > 0 && <> · p10 {fmtH(stats.p10)} · p50 {fmtH(stats.p50)} · p90 {fmtH(stats.p90)}</>}</dd>
            <FailCurve xs={stats.xs} />
          </div>
        )}
      </dl>

      {n.kind === 'district' && (
        <ul className="mt-3 space-y-1 text-xs">
          {SERVICES.map((s, j) => {
            const first = r.firstLoss[i * 4 + j], lost = r.lostHours[i * 4 + j];
            return (
              <li key={s} className="flex justify-between">
                <span className="text-muted">{SERVICE_LABEL[s]}</span>
                <span className={`tabular ${first <= hours ? 'text-signal-ink' : 'text-muted'}`}>{Number.isFinite(first) ? `lost T+${hhmm(first)} · ${lost} h out` : 'kept'}</span>
              </li>
            );
          })}
          <li className="pt-1 text-muted">Population {(n.pop ?? a['pop.district']).toLocaleString('en-US')} ({n.popSource === 'osm' ? 'OSM tag' : 'assumption'})</li>
        </ul>
      )}

      {path.length > 0 && failedNow && (
        <div className="mt-4">
          <h4 className="text-[13px] text-signal-ink">Why did this fail?</h4>
          <ol className="mt-2 space-y-2 border-l border-ink/50 pl-3 text-xs">
            {path.map((j, k) => (
              <li key={j}>
                <button className="text-left text-ink hover:text-dusk" onClick={() => setSel({ node: j, edge: null })}>{c.nodes[j].name}</button>
                <span className="text-muted"> {how(j, k)} </span>
                <span className="tabular text-signal-ink">T+{hhmm(r.ttf[j])}</span>
              </li>
            ))}
          </ol>
          <button className={`${btnGhost} mt-3`} onClick={askWhy} disabled={explain?.busy && explain.key === traceKey}>
            {explain?.busy && explain.key === traceKey ? 'Writing…' : 'Explain in plain English'}
          </button>
          {explain && explain.key === traceKey && (explain.text || explain.error) && (
            <div className="mt-2 rounded-2xl bg-surface p-3 text-sm" role="status">
              {explain.error ? <span className="text-signal-ink">Could not explain: {explain.error}</span> : (
                <>
                  <p>{explain.text}</p>
                  <p className="text-[13px] mt-2  text-muted">{explain.source === 'gemini' ? 'Narrated by Gemini from the engine output' : 'Template narration from the engine output'}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {inputs.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[13px] text-muted">Depends on</h4>
          <ul className="mt-1 space-y-1 text-xs">
            {inputs.map(({ e, j }) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <button className="truncate text-left hover:text-dusk" onClick={() => setSel({ node: null, edge: j })}>
                  {SERVICE_LABEL[e.type]} · {c.nodes[idx.get(e.from)!]?.name}
                </button>
                <Badge prov={e.provenance} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {down && n.kind !== 'district' && <p className="mt-2 text-xs text-muted">{down(n.id)} nodes depend on this, directly or through others.</p>}

      {n.kind !== 'district' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={st.failed.includes(n.id) ? btnGhost : `${btn} bg-signal text-ink`}
            onClick={() => update((s) => ({ ...s, failed: s.failed.includes(n.id) ? s.failed.filter((x) => x !== n.id) : [...s.failed, n.id] }))}>
            {st.failed.includes(n.id) ? 'Restore node' : 'Fail this node'}
          </button>
          {canIntervene(n).map((k) => (
            <button key={k} className={btnGhost} onClick={() => addIntervention({ kind: k, node: n.id })}>
              + {INTERVENTION[k].label} → plan {PLAN_NAMES[editPlan]}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

const fmtH = (h: number) => (Number.isFinite(h) ? `${hhmm(h)}` : '>72h');

function FailCurve({ xs }: { xs: number[] }) {
  const pts = Array.from({ length: 37 }, (_, j) => {
    const t = j * 2;
    const p = xs.filter((x) => x <= t).length / xs.length;
    return `${(t / 72) * 100},${28 - p * 26}`;
  });
  return (
    <svg viewBox="0 0 100 30" className="mt-2 h-10 w-full" role="img" aria-label="Probability of failure by time, 0 to 72 hours">
      <path d={`M0,28 L${pts.join(' L')}`} fill="none" stroke="var(--coral)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <line x1="0" x2="100" y1="28" y2="28" stroke="var(--color-muted)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---- impact ---------------------------------------------------------------------

export function ImpactPanel({ city, run, mc, a, hours, setSel }: Shared) {
  const data = useMemo(() => {
    if (!city || !run) return null;
    const r = run.result, n = city.nodes.length;
    const k = Math.round(hours / SIM.stepHours);
    let soFar = 0, down = 0, backup = 0, districts = 0;
    city.nodes.forEach((x, i) => {
      const s = r.state[k * n + i];
      if (x.kind === 'district') {
        let any = false;
        SERVICES.forEach((sv, j) => {
          const first = r.firstLoss[i * 4 + j];
          if (first <= hours) any = true;
          soFar += (a[`weight.${sv}`] * (x.pop ?? a['pop.district']) * Math.min(r.lostHours[i * 4 + j], Math.max(0, hours - first))) / 1000;
        });
        if (any) districts++;
      } else if (s === DOWN) down++;
      else if (s === BACKUP) backup++;
    });
    const hospitals = city.nodes.map((x, i) => ({ x, i })).filter(({ x, i }) => x.kind === 'hospital' && (Number.isFinite(r.ttf[i]) || r.state[k * n + i] === BACKUP))
      .sort((p, q) => r.ttf[p.i] - r.ttf[q.i]);
    const hoods = city.nodes.map((x, i) => ({ x, i, first: Math.min(...[0, 1, 2, 3].map((j) => r.firstLoss[i * 4 + j])) }))
      .filter((d) => d.x.kind === 'district' && Number.isFinite(d.first)).sort((p, q) => p.first - q.first);
    return { soFar, down, backup, districts, hospitals, hoods, k, n };
  }, [city, run, a, hours]);

  const band = useMemo(() => {
    if (!mc) return null;
    const xs = Array.from(mc.impact).sort((x, y) => x - y);
    return [xs[Math.floor(0.1 * xs.length)], xs[Math.floor(0.9 * (xs.length - 1))]];
  }, [mc]);

  if (!city || !run || !data) return <Card title="Impact"><p className="text-sm text-muted">Running the simulation…</p></Card>;
  const r = run.result;
  return (
    <Card title="Impact" aside={<span className="text-[13px] text-amber-ink">Simulated scenario</span>}>
      <p className="font-display text-4xl tabular">{k1(r.impact)}</p>
      <p className="text-xs text-muted">thousand person-hours of essential service lost over 72 h, weighted by criticality
        {band && <> · 80% band {k1(band[0])}–{k1(band[1])}</>}</p>
      <p className="mt-1 text-xs text-muted">{k1(data.soFar)} lost by T+{hhmm(hours)}. Formula on the method page.</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-surface p-2"><dd className="tabular text-lg text-signal-ink">{data.down}</dd><dt className="text-[13px]  text-muted">Facilities down</dt></div>
        <div className="rounded-2xl bg-surface p-2"><dd className="tabular text-lg text-amber-ink">{data.backup}</dd><dt className="text-[13px]  text-muted">On backup</dt></div>
        <div className="rounded-2xl bg-surface p-2"><dd className="tabular text-lg text-signal-ink">{data.districts}</dd><dt className="text-[13px]  text-muted">Areas hit</dt></div>
      </dl>

      <h3 className="text-[13px] mt-4 text-muted">Hospitals</h3>
      {data.hospitals.length === 0 ? <p className="mt-1 text-xs text-muted">No hospital loses an input in this scenario.</p> : (
        <ul className="mt-1 space-y-1 text-xs">
          {data.hospitals.slice(0, 8).map(({ x, i }) => {
            const s = r.state[data.k * data.n + i], t = r.ttf[i];
            const label = s === DOWN ? `down since T+${hhmm(t)}` : Number.isFinite(t) ? `backup ends in ${hhmm(t - hours)}` : 'on backup, lasts 72 h';
            return (
              <li key={x.id} className="flex justify-between gap-2">
                <button className="truncate text-left hover:text-dusk" onClick={() => setSel({ node: i, edge: null })}>{x.name}</button>
                <span className={`tabular shrink-0 ${s === DOWN ? 'text-signal-ink' : 'text-amber-ink'}`}>{label}</span>
              </li>
            );
          })}
          {data.hospitals.length > 8 && <li className="text-muted">and {data.hospitals.length - 8} more</li>}
        </ul>
      )}

      <h3 className="text-[13px] mt-4 text-muted">Neighbourhoods losing service</h3>
      {data.hoods.length === 0 ? <p className="mt-1 text-xs text-muted">None.</p> : (
        <ul className="mt-1 space-y-1 text-xs">
          {data.hoods.slice(0, 8).map(({ x, i, first }) => (
            <li key={x.id} className="flex justify-between gap-2">
              <button className="truncate text-left hover:text-dusk" onClick={() => setSel({ node: i, edge: null })}>{x.name}</button>
              <span className="tabular shrink-0 text-muted">
                {SERVICES.filter((_, j) => r.firstLoss[i * 4 + j] <= hours).map((s) => SERVICE_LABEL[s].split(' ')[0]).join(', ') || `from T+${hhmm(first)}`}
              </span>
            </li>
          ))}
          {data.hoods.length > 8 && <li className="text-muted">and {data.hoods.length - 8} more</li>}
        </ul>
      )}
    </Card>
  );
}

// ---- fragility ------------------------------------------------------------------

export function FragilityPanel({ city, frag, onRun, setSel }: Shared & { frag: { list: Fragility | null; busy: number | null }; onRun: () => void }) {
  const idx = useIndex(city);
  return (
    <Card title="Single points of failure" aside={
      <button className="text-[13px] text-signal-ink hover:text-ink disabled:opacity-40" onClick={onRun} disabled={frag.busy !== null || !city}>
        {frag.busy !== null ? `${Math.round(frag.busy * 100)}%` : frag.list ? 'Rerun' : 'Rank'}
      </button>}>
      {!frag.list && frag.busy === null && <p className="text-xs text-muted">Fails each supplier alone, on top of this scenario, and ranks them by extra impact.</p>}
      {frag.list && (
        <ol className="space-y-1 text-xs">
          {frag.list.map((f, j) => {
            const i = idx.get(f.node)!, x = city!.nodes[i];
            return (
              <li key={f.node} className="flex items-center justify-between gap-2">
                <button className="flex min-w-0 items-center gap-2 text-left hover:text-dusk" onClick={() => setSel({ node: i, edge: null })}>
                  <span className="tabular w-5 text-muted">{j + 1}</span>
                  <span className="truncate">{x?.name}</span>
                  <span className="text-muted">{KIND[x?.kind]?.letter}</span>
                </button>
                <span className="tabular shrink-0 text-signal-ink">+{k1(f.delta)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

// ---- plans ----------------------------------------------------------------------

function planSummary(city: CityData, r: Compare['results'][number]) {
  let lost = 0, hospitals = 0, areas = 0;
  city.nodes.forEach((x, i) => {
    if (!Number.isFinite(r.ttf[i])) return;
    if (x.kind === 'district') areas++; else lost++;
    if (x.kind === 'hospital') hospitals++;
  });
  return { lost, hospitals, areas };
}

export function PlansPanel({ city, st, update, cmp, editPlan, setEditPlan }: Shared & { cmp: Compare | null; editPlan: number; setEditPlan: (i: number) => void }) {
  const idx = useIndex(city);
  if (!city) return null;
  const base = cmp?.results[0];
  return (
    <Card title="Plan comparison">
      <p className="mb-3 text-xs text-muted">Build up to three plans from the inspector, or load one from the optimizer. Compared against the baseline with nothing done.</p>
      <div className="grid gap-2">
        {st.plans.map((p, j) => (
          <div key={j} className={`rounded-lg border p-2 ${editPlan === j ? 'border-amber bg-amber/15' : 'border-transparent'}`}>
            <div className="flex items-center justify-between">
              <button className="font-display text-lg" onClick={() => setEditPlan(j)} aria-pressed={editPlan === j} aria-label={`Edit plan ${PLAN_NAMES[j]}`}>{PLAN_NAMES[j]}</button>
              <button className={`text-[13px]  ${st.view === j ? 'text-lagoon-ink' : 'text-muted hover:text-ink'}`} disabled={!p.length}
                onClick={() => update((s) => ({ ...s, view: s.view === j ? -1 : j }))} aria-pressed={st.view === j}>
                {st.view === j ? 'On map' : 'Show'}
              </button>
            </div>
            <ul className="mt-1 space-y-1">
              {p.map((iv, k) => (
                <li key={k} className="flex items-start justify-between gap-1  leading-tight">
                  <span><span className="text-ink">{INTERVENTION[iv.kind].label}</span> {city.nodes[idx.get(iv.node) ?? -1]?.name ?? iv.node}</span>
                  <button className="text-muted hover:text-signal-ink" aria-label="Remove intervention"
                    onClick={() => update((s) => ({ ...s, plans: s.plans.map((q, m) => (m === j ? q.filter((_, z) => z !== k) : q)) }))}>×</button>
                </li>
              ))}
              {!p.length && <li className=" text-muted">Empty</li>}
            </ul>
          </div>
        ))}
      </div>
      {cmp && base && (
        <table className="mt-3 w-full text-xs">
          <thead><tr className="text-[13px]  text-muted"><th className="text-left font-normal">Plan</th><th className="text-right font-normal">Impact</th><th className="text-right font-normal">Δ</th><th className="text-right font-normal">Lost</th><th className="text-right font-normal">Areas</th></tr></thead>
          <tbody className="tabular">
            {cmp.results.map((r, j) => {
              if (j > 0 && !st.plans[j - 1].length) return null;
              const s = planSummary(city, r);
              const d = r.impact - base.impact;
              return (
                <tr key={j} className="border-t border-ink/10">
                  <td className="py-1">{j === 0 ? 'Baseline' : PLAN_NAMES[j - 1]}</td>
                  <td className="text-right">{k1(r.impact)}</td>
                  <td className={`text-right ${d < 0 ? 'text-lagoon-ink' : 'text-muted'}`}>{j === 0 ? '·' : `${d < 0 ? '' : '+'}${base.impact ? Math.round((d / base.impact) * 100) : 0}%`}</td>
                  <td className="text-right">{s.lost}</td>
                  <td className="text-right">{s.areas}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ---- optimizer -----------------------------------------------------------------

export function OptimizerPanel({ city, run, opt, busy, onRun, update }: Shared & {
  opt: { best: Plan[]; baseline: number; evaluated: number; k: number } | null; busy: number | null; onRun: (k: number) => void;
}) {
  const [k, setK] = useState(3);
  const idx = useIndex(city);
  const down = useDownstream(city, run?.edges);
  return (
    <Card title="Budgeted optimizer">
      <div className="flex items-center gap-2">
        <label className="text-sm" htmlFor="budget">Budget</label>
        <select id="budget" value={k} onChange={(e) => setK(Number(e.target.value))} className="rounded-md border border-ink/15 bg-cream px-2 py-1 text-sm">
          {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x} intervention{x > 1 ? 's' : ''}</option>)}
        </select>
        <button className={`${btnPrimary} ml-auto`} onClick={() => onRun(k)} disabled={busy !== null || !city}>
          {busy !== null ? `${Math.round(busy * 100)}%` : 'Find best plan'}
        </button>
      </div>
      {opt && city && (
        <>
          {opt.best.length === 0 && <p className="mt-3 text-xs text-muted">No intervention in the catalogue reduces impact in this scenario.</p>}
          <ol className="mt-3 space-y-3">
            {opt.best.map((p, j) => (
              <li key={j} className="rounded-2xl bg-surface p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-ink">Option {j + 1}</span>
                  <span className="tabular text-sm text-lagoon-ink">−{opt.baseline ? Math.round((-p.delta / opt.baseline) * 100) : 0}% · −{k1(-p.delta)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {p.interventions.map((iv) => {
                    const i = idx.get(iv.node)!, x = city.nodes[i];
                    const why = run ? reason(run, i, x) : '';
                    return <li key={iv.kind + iv.node}><span className="text-ink">{INTERVENTION[iv.kind].verb} {x?.name}</span><span className="text-muted">. {why}{down ? ` ${down(iv.node)} nodes depend on it.` : ''}</span></li>;
                  })}
                </ul>
                <div className="mt-2 flex gap-2">
                  {PLAN_NAMES.map((name, m) => (
                    <button key={name} className="text-[13px]  text-muted hover:text-ink"
                      onClick={() => update((s) => ({ ...s, plans: s.plans.map((q, z) => (z === m ? p.interventions : q)) }))}>Load as {name}</button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted">
            {opt.k <= 3 ? 'Exhaustive search over the 15 best single moves' : 'Greedy with lazy evaluation'}; {opt.evaluated} plans simulated. Impact deltas are simulated.
          </p>
        </>
      )}
    </Card>
  );
}

function reason(run: Run, i: number, x: CityNode | undefined) {
  if (!x) return '';
  const r = run.result, t = r.ttf[i];
  if (!Number.isFinite(t)) return 'Survives the baseline but helps others';
  if (r.cause[i] === CAUSE_FLOOD) return `Floods at T+${hhmm(t)} in the baseline.`;
  if (r.cause[i] === CAUSE_MANUAL) return 'Failed by hand in the baseline.';
  return `Fails at T+${hhmm(t)} in the baseline after losing an input.`;
}

// ---- print brief -----------------------------------------------------------------

export function Brief({ city, run, st, a, cmp, frag }: Shared & { cmp: Compare | null; frag: Fragility | null }) {
  const idx = useIndex(city);
  if (!city || !run) return <div className="hidden print:block" />;
  const r = run.result;
  const hospitals = city.nodes.map((x, i) => ({ x, i })).filter(({ x, i }) => x.kind === 'hospital' && Number.isFinite(r.ttf[i])).sort((p, q) => r.ttf[p.i] - r.ttf[q.i]).slice(0, 8);
  const changed = Object.keys(st.a) as AssumptionKey[];
  return (
    <div className="hidden bg-cream p-8 text-ink print:block">
      <p className="text-[13px]">CASCADE brief · Simulated scenario</p>
      <h1 className="font-display text-3xl">{city.name}: {st.stage} m river flood, 72 hours</h1>
      <p className="text-sm">Generated {new Date().toISOString().slice(0, 10)}. {st.failed.length} node(s) failed by hand. Not a forecast.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img id="brief-map" alt="Map at the current playback time" className="mt-3 max-h-72 w-full object-cover" />
      <h2 className="text-[13px] mt-4">Impact</h2>
      <p className="text-sm">{k1(r.impact)} thousand criticality-weighted person-hours of essential service lost over 72 h.
        {' '}{city.nodes.filter((x, i) => x.kind !== 'district' && Number.isFinite(r.ttf[i])).length} facilities fail.</p>
      <h2 className="text-[13px] mt-4">Hospitals that fail</h2>
      <ul className="text-sm">{hospitals.map(({ x, i }) => <li key={x.id}>{x.name}: T+{hhmm(r.ttf[i])}</li>)}{!hospitals.length && <li>None</li>}</ul>
      {frag && <><h2 className="text-[13px] mt-4">Top single points of failure</h2>
        <ol className="text-sm">{frag.slice(0, 5).map((f) => <li key={f.node}>{city.nodes[idx.get(f.node)!]?.name}: +{k1(f.delta)}</li>)}</ol></>}
      {cmp && <><h2 className="text-[13px] mt-4">Plans</h2>
        <ul className="text-sm">{cmp.results.map((x, j) => (j === 0 || st.plans[j - 1].length) ? <li key={j}>{j === 0 ? 'Baseline' : `Plan ${PLAN_NAMES[j - 1]} (${st.plans[j - 1].map((iv) => `${INTERVENTION[iv.kind].label} ${city.nodes[idx.get(iv.node)!]?.name}`).join('; ')})`}: {k1(x.impact)}</li> : null)}</ul></>}
      {changed.length > 0 && <><h2 className="text-[13px] mt-4">Assumptions changed from default</h2>
        <ul className="text-sm">{changed.map((k) => <li key={k}>{ASSUMPTION_META[k].label}: {a[k]} {ASSUMPTION_META[k].unit} (default {DEFAULT_ASSUMPTIONS[k]})</li>)}</ul></>}
      <p className="mt-6 text-xs">Simulated scenario. Assumptions editable. Dependencies are mostly inferred from geography. Data © OpenStreetMap contributors; elevation from AWS Terrain Tiles.</p>
    </div>
  );
}
