import type { InterventionKind, Kind, Service } from './engine/types';

export const KIND: Record<Kind, { label: string; letter: string }> = {
  substation: { label: 'Substation', letter: 'S' },
  water_works: { label: 'Water works', letter: 'W' },
  pumping: { label: 'Pumping station', letter: 'P' },
  water_tower: { label: 'Water tower', letter: 'T' },
  hospital: { label: 'Hospital', letter: 'H' },
  clinic: { label: 'Clinic', letter: 'C' },
  telecom: { label: 'Telecom mast', letter: 'M' },
  fuel: { label: 'Fuel station', letter: 'F' },
  shelter: { label: 'Shelter', letter: 'R' },
  bridge: { label: 'Bridge', letter: 'B' },
  district: { label: 'Neighbourhood', letter: 'N' },
};

export const SERVICE_LABEL: Record<Service, string> = { power: 'Power', water: 'Water', access: 'Hospital access', comms: 'Comms' };

export const INTERVENTION: Record<InterventionKind, { label: string; verb: string }> = {
  generator: { label: 'Generator', verb: 'Add a generator at' },
  harden: { label: 'Raise / harden', verb: 'Raise or harden' },
  bridge: { label: 'Repair bridge', verb: 'Repair and raise' },
  mobile_substation: { label: 'Mobile substation', verb: 'Send a mobile substation to' },
};

export function hhmm(h: number): string {
  if (!Number.isFinite(h)) return 'never';
  const whole = Math.floor(h), m = Math.round((h - whole) * 60);
  return m ? `${whole}h ${String(m).padStart(2, '0')}m` : `${whole}h`;
}
