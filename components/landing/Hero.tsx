import Link from 'next/link';
import NavPill from '@/components/NavPill';
import Sky from '@/components/Sky';

// Real footage instead of a 3D model: water through the Obere Schleuse sluice
// in Thun (CC0, Nachtbold, Wikimedia Commons). One decoded video keeps the page
// smooth, and it shows the kind of infrastructure the simulator models. The
// headline and the frame drift at different speeds with the scroll (SmoothScroll).
export default function Hero() {
  return (
    <header className="relative isolate overflow-hidden pb-24">
      <Sky />
      <div className="relative z-20 px-4 pt-4 sm:px-6">
        <NavPill />
      </div>

      <div className="relative z-10 mx-auto mt-[7vh] flex max-w-4xl flex-col items-center px-5 text-center" data-speed="0.25">
        <p className="inline-flex items-center gap-2 rounded-full bg-cream/80 px-3 py-1 text-[14px]">
          <span className="size-2 rounded-full bg-amber" aria-hidden />
          Open map data, simulated scenarios
        </p>
        <h1 className="mt-5 text-[clamp(2.1rem,6.4vw,5.6rem)] text-ink">
          Watch a city fail.<br />Then plan around it.
        </h1>
        <p className="mt-5 max-w-xl text-[clamp(1.0625rem,1rem+0.25vw,1.1875rem)] text-ink/75">
          Fail one substation, pump or bridge and watch the outage travel through power, water, roads and comms, hour by hour, for 72 hours.
        </p>
        <Link href="/dashboard" className="group mt-7 inline-flex items-center gap-2 rounded-full bg-amber px-6 py-3 text-[16px] font-medium text-ink transition hover:bg-ember active:scale-[0.97]">
          Break a city
          <span className="grid size-6 place-items-center rounded-full bg-ink/10 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden>↗</span>
        </Link>
      </div>

      <figure className="relative z-10 mx-auto mt-14 w-[min(1120px,92vw)]" data-speed="-0.12">
        <div className="overflow-hidden rounded-[2rem] shadow-[0_50px_100px_-50px_color-mix(in_oklab,var(--ink)_55%,transparent)]">
          <video
            className="aspect-video w-full object-cover"
            src="/media/hero.mp4"
            poster="/media/hero-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Water rushing through the Obere Schleuse sluice gates in Thun"
          />
        </div>
        <figcaption className="mt-3 text-center text-[14px] text-ink/60">
          Water infrastructure is where cascades start. Footage: Obere Schleuse, Thun, by Nachtbold (CC0).
        </figcaption>
      </figure>
    </header>
  );
}
