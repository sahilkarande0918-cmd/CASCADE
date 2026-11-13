// The palette for canvas, WebGL and MapLibre, which cannot read CSS variables.
// Mirrors :root in app/globals.css. Tints are mixed from these, never typed in.

export const P = {
  ink: '#1A0A22',
  plum: '#3B1450',
  dusk: '#B83A7A',
  coral: '#FF6B5B',
  ember: '#FF9A5A',
  peach: '#FFD3AE',
  cream: '#FFF4E8',
  signal: '#FF4B2B',
  lagoon: '#2EC4B6',
  amber: '#FFB020',
} as const;

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** `t` of the way from a to b, as hex. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function rgbArray(h: string): [number, number, number] {
  const [r, g, b] = rgb(h);
  return [r, g, b];
}
