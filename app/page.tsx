import Link from 'next/link';
import Board from '@/components/landing/Board';
import Hero from '@/components/landing/Hero';
import SmoothScroll from '@/components/landing/SmoothScroll';
import Sky from '@/components/Sky';
import Reveal from '@/components/landing/Reveal';
import facts from '@/lib/landing-facts.json';
import { hhmm } from '@/lib/labels';

const fmt = (n: number) => n.toLocaleString('en-US');

export default function Home() {
  const [tower, clinic, hospital] = facts.root.first;
  return (
    <main className="bg-cream">
      <SmoothScroll />
      <Hero />

      <section id="explainer" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Reveal>
          <h2 className="rise text-[clamp(2rem,1.3rem+3.2vw,4rem)]">Cascade in 60 seconds.</h2>
          <p className="rise mt-4 max-w-2xl text-ink/80">How one failure spreads through a real city, and how to plan around it. Every number in it is a simulated output for Pune.</p>
          <div className="rise mt-10 overflow-hidden rounded-[2rem] bg-ink shadow-[0_50px_100px_-50px_color-mix(in_oklab,var(--ink)_55%,transparent)]">
            <video className="aspect-video w-full" src="/video/cascade-explainer.mp4" poster="/video/cascade-explainer-poster.jpg" controls playsInline preload="none" aria-label="Cascade, 60-second explainer">
              <track kind="captions" src="/video/cascade-explainer.vtt" srcLang="en" label="English" />
            </video>
          </div>
        </Reveal>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 py-28 md:py-40">
        <Reveal className="grid gap-12 md:grid-cols-[5fr_7fr] md:gap-20">
          <div className="md:sticky md:top-28 md:self-start">
            <h2 className="rise text-[clamp(2rem,1.3rem+3.2vw,4rem)]">One map, four moves.</h2>
            <p className="rise mt-5 max-w-md text-ink/80">
              Cascade reads a city from OpenStreetMap, guesses what feeds what, floods it, and times every failure. Each guess is marked as one.
            </p>
          </div>
          <ol className="flex flex-col gap-4">
            <li className="rise rounded-3xl bg-surface p-7">
              <h3 className="text-[26px]">The graph</h3>
              <p className="mt-2 text-ink/80">
                {fmt(facts.nodes)} mapped places in central {facts.city}, joined by {fmt(facts.edges)} dependencies. {facts.observed} is traced from an OSM power line; the rest are inferred from distance and labelled with a confidence.
              </p>
            </li>
            <li className="rise rounded-3xl bg-surface p-7">
              <h3 className="text-[26px]">The hazard</h3>
              <p className="mt-2 text-ink/80">
                The river rises over six hours. Anything whose ground sits lower than the water, measured from elevation tiles, goes under. Roads close the same way.
              </p>
            </li>
            <li className="rise rounded-3xl bg-surface-2 p-7">
              <h3 className="text-[26px]">The cascade</h3>
              <p className="mt-2 text-ink/80">
                Fail {facts.root.name} on a dry day and {fmt(facts.root.downstream)} facilities follow, each when its own backup runs out:
              </p>
              <ul className="tabular mt-4 grid gap-2 text-[16px]" data-ui>
                {[tower, clinic, hospital].filter(Boolean).map((x) => (
                  <li key={x.name} className="flex justify-between gap-4 rounded-xl bg-cream px-4 py-3">
                    <span>{x.name.startsWith(x.kind) ? x.name : `${x.kind}: ${x.name}`}</span>
                    <span className="text-signal-ink">T+{hhmm(x.ttf)}</span>
                  </li>
                ))}
              </ul>
            </li>
            <li className="rise rounded-3xl bg-amber p-7">
              <h3 className="text-[26px]">The plan</h3>
              <p className="mt-2 text-ink/85">
                Given three interventions, the optimizer tested {facts.plan.evaluated} plans and cut simulated impact by {facts.plan.cut}%:
              </p>
              <ul className="mt-3 list-disc pl-5 text-ink/85">
                {facts.plan.steps.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </li>
          </ol>
        </Reveal>
      </section>

      <section id="cascade" className="bg-surface px-5 py-28 md:py-40">
        <Reveal className="mx-auto max-w-6xl">
          <h2 className="rise max-w-3xl text-[clamp(2rem,1.3rem+3.2vw,4rem)]">The first hours in {facts.city}.</h2>
          <p className="rise mt-5 max-w-2xl text-ink/80">
            A simulated {facts.stage} m flood: {fmt(facts.failed)} facilities fail within 72 hours, {fmt(facts.hospitalsFailed)} of them hospitals. Here is the order they go in, and why.
          </p>
          <div className="rise mt-12"><Board /></div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-28 text-center md:py-40">
        <Reveal>
          <p className="rise text-[clamp(1.5rem,1.1rem+1.4vw,2.25rem)] leading-snug">
            Every figure on this page is simulated from open map data. Guessed links say so, and every assumption is yours to change.
          </p>
          <Link href="/method" className="rise mt-8 inline-block text-[17px] underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
            Read the method and its limits
          </Link>
        </Reveal>
      </section>

      <section className="px-4 pb-4">
        <div className="relative isolate overflow-hidden rounded-[2rem] px-6 py-24 md:px-16 md:py-32">
          <Sky />
          <Reveal className="relative max-w-3xl">
            <h2 className="rise text-[clamp(2.4rem,1.4rem+4.6vw,5.5rem)]">Break a city.</h2>
            <p className="rise mt-5 max-w-xl text-ink/80">
              Pick Pune, Chennai or Valencia, set the river, fail what you like, and compare up to three plans. It runs in your browser; nothing to install.
            </p>
            <Link href="/dashboard" className="rise group mt-8 inline-flex items-center gap-2 rounded-full bg-amber px-6 py-3 text-[16px] font-medium text-ink transition hover:bg-ember active:scale-[0.97]">
              Open the simulator
              <span className="grid size-6 place-items-center rounded-full bg-ink/10 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden>↗</span>
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="grid grid-cols-1 gap-2 px-6 py-8 text-[15px] text-muted md:grid-cols-[1fr_auto_1fr] md:items-center">
        <span>Cascade · infrastructure cascade simulator</span>
        <span className="flex gap-6 text-ink">
          <Link href="/dashboard">Simulator</Link>
          <Link href="/method">Method</Link>
          <a href="https://github.com/sahilkarande0918-cmd/CASCADE">Source</a>
        </span>
        <span className="md:text-right">Map data © OpenStreetMap contributors · sky footage CC BY 3.0, <Link href="/method#credits" className="underline">credits</Link></span>
      </footer>
    </main>
  );
}
