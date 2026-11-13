import type { Metadata } from 'next';
import Link from 'next/link';
import NavPill from '@/components/NavPill';
import Sky from '@/components/Sky';
import { ASSUMPTION_META, type AssumptionKey } from '@/lib/assumptions';
import { CITIES } from '@/lib/cities';
import block from '@/public/media/pune-block.json';

export const metadata: Metadata = { title: 'Method · Cascade' };

const groups = (() => {
  const g = new Map<string, AssumptionKey[]>();
  for (const k of Object.keys(ASSUMPTION_META) as AssumptionKey[]) {
    const name = ASSUMPTION_META[k].group;
    g.set(name, [...(g.get(name) ?? []), k]);
  }
  return [...g];
})();

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-6 py-14 md:grid-cols-[4fr_8fr] md:gap-16">
      <h2 className="text-[clamp(1.75rem,1.2rem+1.8vw,2.6rem)]">{title}</h2>
      <div className="space-y-4 text-ink/85">{children}</div>
    </section>
  );
}

export default function Method() {
  return (
    <div className="relative isolate">
      <div className="relative isolate h-[46vh] min-h-[320px] overflow-hidden">
        <Sky />
        <div className="px-4 pt-4"><NavPill /></div>
        <div className="mx-auto mt-[9vh] max-w-5xl px-5">
          <h1 className="text-[clamp(1.9rem,1.2rem+4vw,5rem)]">How Cascade works,<br />and where it doesn’t.</h1>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-5 pb-24">
        <p className="max-w-3xl pt-10 text-[clamp(1.125rem,1rem+0.5vw,1.4rem)] leading-snug">
          Cascade is a planning sketch, not a forecast. It shows how failures could travel through a city’s infrastructure,
          given open map data and a set of assumptions you can see and change. Every number it shows is a simulated scenario.
        </p>

        <Section title="Data">
          <p>
            <strong className="font-medium">Infrastructure and roads:</strong> OpenStreetMap, via the Overpass API, for a 10 × 10 km area of{' '}
            {Object.values(CITIES).map((c) => c.name).join(', ')}: substations, water works, pumping stations, water towers, hospitals,
            clinics, telecom masts, fuel stations, shelters, bridges, neighbourhoods, major roads, rivers, canals, coastline and power lines.
          </p>
          <p><strong className="font-medium">Elevation:</strong> AWS open Terrain Tiles (Terrarium encoding, zoom 13). These are surface models; buildings and trees can lift the ground they report.</p>
          <p><strong className="font-medium">Live hazard seed:</strong> Open-Meteo’s forecast API (72-hour rainfall) and Flood API (GloFAS river discharge). Optional; the simulator works without it.</p>
          <p><strong className="font-medium">Explanations:</strong> optional Gemini free tier, which only narrates a failure chain the engine already computed. Without a key, a fixed template says the same thing.</p>
        </Section>

        <Section title="The model">
          <p><strong className="font-medium">Graph.</strong> Nodes are mapped facilities and neighbourhoods. Edges are dependencies of four kinds: power, water, hospital access and comms.</p>
          <p><strong className="font-medium">Hazard.</strong> A river flood as a bathtub model on height above the nearest mapped drainage (river, canal or coast). The stage rises linearly to its peak, then holds. A node fails when the water at it is deeper than its threshold; a road closes when it is deeper than the passable depth; a bridge fails above its deck clearance.</p>
          <p><strong className="font-medium">Cascade.</strong> A discrete-event simulation in 15-minute steps over 72 hours. A node keeps working while its inputs are met, or while the backup buffer for a lost input lasts (a generator, a battery, a tank), and fails the step the buffer runs out. AND edges must all be met; OR edges need any one supplier.</p>
          <p><strong className="font-medium">Road access.</strong> For each access dependency, the engine finds the route whose lowest point is highest (a bottleneck path). Access is lost when the water rises above that point.</p>
          <p><strong className="font-medium">Uncertainty.</strong> Monte Carlo over the peak stage and over which supplier an inferred edge really points at, giving the probability each node fails within 72 hours.</p>
          <p><strong className="font-medium">Optimizer.</strong> For a budget of up to three interventions, exhaustive search over the 15 best single moves. Above three, greedy search with lazy evaluation.</p>
          <p><strong className="font-medium">Tests.</strong> Unit tests cover a simple chain, AND versus OR logic, buffer expiry at the exact step, flood thresholds, bottleneck road access, that adding a backup never makes an outcome worse, determinism with a fixed seed and a golden replay.</p>
        </Section>

        <Section title="Impact">
          <p className="rounded-2xl bg-surface p-5 text-[17px]">
            Impact = Σ over neighbourhoods d, services s of w<sub>s</sub> × population<sub>d</sub> × hours<sub>d,s</sub> without service ÷ 1000
          </p>
          <p>
            The result is thousands of criticality-weighted person-hours of essential service lost over 72 hours. Services are power, water,
            access to a working hospital, and comms. Weights and the population used where OSM has none are assumptions, listed below.
          </p>
        </Section>

        <Section title="Provenance">
          <ul className="space-y-3">
            <li><span className="mr-2 rounded-full bg-lagoon/25 px-2 py-0.5 text-[14px] text-lagoon-ink">observed</span>Traced in OpenStreetMap: a mapped power line runs from the substation to the facility.</li>
            <li><span className="mr-2 rounded-full bg-dusk/15 px-2 py-0.5 text-[14px] text-dusk">inferred</span>Guessed from geography: the nearest supplier within a service radius, with a confidence. Most edges are inferred, because OSM rarely records what feeds what.</li>
            <li><span className="mr-2 rounded-full bg-amber/30 px-2 py-0.5 text-[14px] text-amber-ink">user-set</span>Confirmed, re-weighted or removed by you in the dashboard.</li>
          </ul>
        </Section>

        <Section title="Assumptions">
          <p>Every one of these is a planning assumption, not a measurement. Each can be changed in the dashboard and results recompute.</p>
          {groups.map(([name, keys]) => (
            <div key={name}>
              <h3 className="mt-6 text-[20px]">{name}</h3>
              <table className="mt-2 w-full text-[15px]">
                <tbody>
                  {keys.map((k) => (
                    <tr key={k} className="align-top odd:bg-surface/60">
                      <td className="px-3 py-2">{ASSUMPTION_META[k].label}{ASSUMPTION_META[k].note && <span className="block text-[14px] text-muted">{ASSUMPTION_META[k].note}</span>}</td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-right">{ASSUMPTION_META[k].value} {ASSUMPTION_META[k].unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Section>

        <Section title="Limits">
          <ul className="list-disc space-y-2 pl-5">
            <li>The bathtub model ignores flow, timing along the river, drainage capacity, embankments and rainfall run-off. Height above the <em>nearest</em> drainage is a straight-line approximation, not a flow path.</li>
            <li>The elevation data is coarse (tens of metres) and is a surface model, so river banks and built-up ground can be misread by metres.</li>
            <li>Most dependencies are inferred. Real feeder networks, water mains and mast backhaul are not public. Treat every inferred edge as a hypothesis.</li>
            <li>Backup durations, thresholds and weights are generic defaults, not facility surveys.</li>
            <li>OSM coverage varies: Pune has 8 mapped substations and 2 telecom masts in the area, so single substations look more critical than they may be.</li>
            <li>Restoration is modelled only for the mobile-substation intervention; repair crews and failover switching are not modelled.</li>
            <li>The landing page’s scale model uses OSM building footprints; only {block.tagged} of {block.buildings.length.toLocaleString('en-US')} have a mapped height, the rest use typical heights for their type, and all are exaggerated four times.</li>
          </ul>
        </Section>

        <Section id="credits" title="Credits">
          <ul className="space-y-2">
            <li>Map data © OpenStreetMap contributors (ODbL). Basemap tiles: OpenFreeMap.</li>
            <li>Elevation: AWS open Terrain Tiles (Mapzen terrain, derived from SRTM and other public sources).</li>
            <li>Satellite imagery: “Sentinel-2 cloudless 2016” by EOX IT Services GmbH, CC BY 4.0, contains modified Copernicus Sentinel data 2016.</li>
            <li>Sky footage: “2011-08-05 21-45-00-timelapse-clouds-seloncourt” by Thomas Bresson, CC BY 3.0, via Wikimedia Commons; cropped, colour graded and looped.</li>
            <li>Rock texture: “Rock Face” from Poly Haven, CC0.</li>
            <li>Weather and river discharge: Open-Meteo (CC BY 4.0), GloFAS via the Copernicus Emergency Management Service.</li>
            <li>Explainer video: footage by Marsupium (CC0), Nachtbold (CC0) and “City skyline (time lapse)” (CC BY 3.0) via Wikimedia Commons; music “Ambient Documentary Build up” by tyops (CC BY 4.0) and sound effects by Joao_Janz (CC0) via Freesound; voiceover generated with Gnani Vachana. Full list in CREDITS.md.</li>
          </ul>
          <p className="pt-4"><Link href="/dashboard" className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">Open the simulator</Link></p>
        </Section>
      </main>
    </div>
  );
}
