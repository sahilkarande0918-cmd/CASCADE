// The sky behind every page: a graded, looping cloud timelapse with mist
// settling at the bottom. Falls back to its poster frame under reduced motion.
// Footage: "2011-08-05 21-45-00-timelapse-clouds-seloncourt" by Thomas Bresson,
// CC BY 3.0, via Wikimedia Commons (cropped, colour graded, looped). See CREDITS.md.

export default function Sky({ fixed = false }: { fixed?: boolean }) {
  return (
    <div aria-hidden className={`${fixed ? 'fixed' : 'absolute'} inset-0 -z-10 overflow-hidden bg-surface bg-cover bg-center`} style={{ backgroundImage: 'url(/media/sky-poster.jpg)' }}>
      <video
        className="sky-video h-full w-full object-cover"
        src="/media/sky.mp4"
        poster="/media/sky-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: 'linear-gradient(to top, var(--cream) 0%, color-mix(in oklab, var(--cream) 55%, transparent) 45%, transparent 100%)' }}
      />
    </div>
  );
}
