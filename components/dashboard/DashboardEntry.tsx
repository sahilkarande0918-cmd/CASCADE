'use client';

import dynamic from 'next/dynamic';

// The dashboard reads its scenario from the URL hash and local storage, which
// only exist in the browser, so it renders on the client alone.
const Dashboard = dynamic(() => import('./Dashboard'), {
  ssr: false,
  loading: () => <p className="grid min-h-dvh place-items-center text-muted">Loading the simulator…</p>,
});

export default function DashboardEntry() {
  return <Dashboard />;
}
