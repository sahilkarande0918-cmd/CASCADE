// Every default the model relies on, in one place.
//
// None of these are measurements. They are planning assumptions chosen to be
// plausible and easy to argue with. The /method page lists them all and the
// dashboard lets anyone change them; results recompute from whatever is set.

type Meta = { value: number; label: string; unit: string; group: string; note: string };

const DEFS = {
  // Backup buffers: how long a node keeps working after an input is lost.
  'backup.hospital.power': { value: 48, label: 'Hospital generator fuel', unit: 'h', group: 'Backup buffers', note: 'On-site diesel stock before a resupply is needed.' },
  'backup.hospital.water': { value: 24, label: 'Hospital water storage', unit: 'h', group: 'Backup buffers', note: 'Rooftop and sump tanks.' },
  'backup.hospital.access': { value: 24, label: 'Hospital fuel resupply window', unit: 'h', group: 'Backup buffers', note: 'How long a hospital can go without a reachable working fuel station.' },
  'backup.hospital.comms': { value: 12, label: 'Hospital comms fallback', unit: 'h', group: 'Backup buffers', note: 'Landline and radio fallback before coordination breaks down.' },
  'backup.clinic.power': { value: 4, label: 'Clinic backup power', unit: 'h', group: 'Backup buffers', note: 'Small inverter or generator.' },
  'backup.clinic.water': { value: 8, label: 'Clinic water storage', unit: 'h', group: 'Backup buffers', note: '' },
  'backup.telecom.power': { value: 4, label: 'Mast battery', unit: 'h', group: 'Backup buffers', note: 'Battery bank at a mobile mast.' },
  'backup.water_tower.water': { value: 8, label: 'Water tower storage', unit: 'h', group: 'Backup buffers', note: 'Hours of normal draw held in an elevated tank.' },
  'backup.water_tower.power': { value: 999, label: 'Water tower power need', unit: 'h', group: 'Backup buffers', note: 'Gravity-fed: effectively no power dependency.' },
  'backup.pumping.power': { value: 0, label: 'Pumping station backup power', unit: 'h', group: 'Backup buffers', note: 'Assumes no on-site generator.' },
  'backup.water_works.power': { value: 2, label: 'Water works backup power', unit: 'h', group: 'Backup buffers', note: '' },
  'backup.fuel.power': { value: 0, label: 'Fuel station backup power', unit: 'h', group: 'Backup buffers', note: 'Pumps stop when power does.' },
  'backup.shelter.power': { value: 6, label: 'Shelter backup power', unit: 'h', group: 'Backup buffers', note: '' },
  'backup.shelter.water': { value: 12, label: 'Shelter water storage', unit: 'h', group: 'Backup buffers', note: '' },
  'backup.district.water': { value: 6, label: 'Household water storage', unit: 'h', group: 'Backup buffers', note: 'Typical overhead tank in a neighbourhood.' },
  'backup.district.comms': { value: 2, label: 'Phone battery', unit: 'h', group: 'Backup buffers', note: 'Before a district counts as without comms.' },

  // Flood thresholds: water depth at the node that takes it out.
  'depth.substation': { value: 0.3, label: 'Substation', unit: 'm', group: 'Flood depth that fails a node', note: 'Switchgear at ground level.' },
  'depth.water_works': { value: 0.5, label: 'Water works', unit: 'm', group: 'Flood depth that fails a node', note: '' },
  'depth.pumping': { value: 0.3, label: 'Pumping station', unit: 'm', group: 'Flood depth that fails a node', note: '' },
  'depth.water_tower': { value: 1.0, label: 'Water tower', unit: 'm', group: 'Flood depth that fails a node', note: 'Elevated tank, but valves sit at ground level.' },
  'depth.hospital': { value: 0.5, label: 'Hospital', unit: 'm', group: 'Flood depth that fails a node', note: 'Ground-floor plant rooms.' },
  'depth.clinic': { value: 0.3, label: 'Clinic', unit: 'm', group: 'Flood depth that fails a node', note: '' },
  'depth.telecom': { value: 0.5, label: 'Telecom mast', unit: 'm', group: 'Flood depth that fails a node', note: 'Equipment cabinet at the base.' },
  'depth.fuel': { value: 0.3, label: 'Fuel station', unit: 'm', group: 'Flood depth that fails a node', note: '' },
  'depth.shelter': { value: 0.5, label: 'Shelter', unit: 'm', group: 'Flood depth that fails a node', note: '' },
  'bridge.clearance': { value: 4, label: 'Bridge deck clearance', unit: 'm', group: 'Flood depth that fails a node', note: 'Height of a bridge deck above the ground under it.' },
  'road.passable': { value: 0.3, label: 'Passable road depth', unit: 'm', group: 'Flood depth that fails a node', note: 'Deeper than this and a road counts as blocked.' },

  // Inference: how dependencies are guessed when OSM does not record them.
  'radius.power': { value: 5, label: 'Substation service radius', unit: 'km', group: 'Dependency inference', note: 'A consumer is fed by its nearest substation within this distance.' },
  'radius.water': { value: 6, label: 'Water source service radius', unit: 'km', group: 'Dependency inference', note: 'Nearest tower first, else nearest pumping station or works.' },
  'radius.comms': { value: 2.5, label: 'Mast coverage radius', unit: 'km', group: 'Dependency inference', note: 'Any mast in range can serve (OR logic).' },
  'k.comms': { value: 3, label: 'Masts counted per consumer', unit: '', group: 'Dependency inference', note: '' },
  'k.hospital': { value: 2, label: 'Hospitals counted per district', unit: '', group: 'Dependency inference', note: 'A district has care if any of these is up and reachable.' },
  'k.fuel': { value: 2, label: 'Fuel stations counted per hospital', unit: '', group: 'Dependency inference', note: '' },

  // Impact.
  'weight.power': { value: 1, label: 'Power', unit: 'x', group: 'Criticality weights', note: '' },
  'weight.water': { value: 1, label: 'Water', unit: 'x', group: 'Criticality weights', note: '' },
  'weight.access': { value: 1.5, label: 'Access to a hospital', unit: 'x', group: 'Criticality weights', note: 'Weighted highest: losing it is the most direct risk to life.' },
  'weight.comms': { value: 0.5, label: 'Comms', unit: 'x', group: 'Criticality weights', note: '' },
  'pop.district': { value: 20000, label: 'District population when OSM has none', unit: 'people', group: 'Criticality weights', note: 'Used only where the OSM place has no population tag.' },

  // Hazard and simulation.
  'hazard.riseHours': { value: 6, label: 'Time to peak stage', unit: 'h', group: 'Hazard and simulation', note: 'Water rises linearly to the peak, then holds.' },
  'hazard.stageSigma': { value: 0.3, label: 'Stage uncertainty (1 sigma)', unit: 'm', group: 'Hazard and simulation', note: 'Spread of the peak stage across Monte Carlo runs.' },
  'hazard.ratingK': { value: 1.5, label: 'Live seed: metres per doubling of discharge', unit: 'm', group: 'Hazard and simulation', note: 'Turns a forecast discharge ratio into a stage. A rough rating curve, not a hydraulic model.' },
  'sim.runs': { value: 200, label: 'Monte Carlo runs', unit: '', group: 'Hazard and simulation', note: '' },

  // Interventions.
  'int.generatorHours': { value: 72, label: 'Added generator runtime', unit: 'h', group: 'Interventions', note: '' },
  'int.hardenMetres': { value: 1, label: 'Raise or harden by', unit: 'm', group: 'Interventions', note: 'Flood walls, raised plinth or relocated switchgear.' },
  'int.mobileDeployHours': { value: 12, label: 'Mobile substation arrives after', unit: 'h', group: 'Interventions', note: '' },
} satisfies Record<string, Meta>;

export type AssumptionKey = keyof typeof DEFS;
export type Assumptions = Record<AssumptionKey, number>;

export const ASSUMPTION_META: Record<AssumptionKey, Meta> = DEFS;

export const DEFAULT_ASSUMPTIONS = Object.fromEntries(
  Object.entries(DEFS).map(([k, m]) => [k, m.value]),
) as Assumptions;

/** Backup hours for a kind and service, 0 when none is assumed. */
export function backupHours(a: Assumptions, kind: string, type: string): number {
  return (a as Record<string, number>)[`backup.${kind}.${type}`] ?? 0;
}

export const SIM = { horizonHours: 72, stepHours: 0.25 } as const;
