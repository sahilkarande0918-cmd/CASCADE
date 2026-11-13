import Link from 'next/link';

export function Mark() {
  return (
    <span className="grid size-8 place-items-center rounded-full bg-amber" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="4" cy="11" r="2.2" fill="var(--ink)" />
        <circle cx="12" cy="5" r="2.2" fill="var(--ink)" opacity="0.35" />
        <path d="M5.6 9.6 10.4 6.4" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#cascade', label: 'The cascade' },
  { href: '/method', label: 'Method' },
];

export default function NavPill({ action = { href: '/dashboard', label: 'Open the simulator' } }: { action?: { href: string; label: string } }) {
  return (
    <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 rounded-full bg-cream/75 py-2 pl-3 pr-2 shadow-[0_8px_30px_-12px_color-mix(in_oklab,var(--ink)_25%,transparent)] backdrop-blur-xl">
      <Link href="/" className="flex items-center gap-2 text-[15px] font-medium">
        <Mark />
        Cascade
      </Link>
      <ul className="hidden items-center gap-8 text-[15px] text-ink/80 md:flex">
        {LINKS.map((l) => (
          <li key={l.href}><Link href={l.href} className="transition-colors hover:text-ink">{l.label}</Link></li>
        ))}
      </ul>
      <Link
        href={action.href}
        className="group inline-flex items-center gap-2 rounded-full bg-amber px-4 py-2 text-[15px] font-medium text-ink transition-transform active:scale-[0.97] hover:bg-ember"
      >
        {action.label}
        <span className="grid size-5 place-items-center rounded-full bg-ink/10 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden>↗</span>
      </Link>
    </nav>
  );
}
