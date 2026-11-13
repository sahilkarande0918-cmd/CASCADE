import type { Metadata } from 'next';
import DashboardEntry from '@/components/dashboard/DashboardEntry';

export const metadata: Metadata = { title: 'Dashboard · CASCADE' };

export default function Page() {
  return <DashboardEntry />;
}
