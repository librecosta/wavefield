export const SURFACE_WIDTH = 1891;
export const SURFACE_HEIGHT = 230;
export const BACKGROUND = "#080b08";
export const LOOP_SECONDS = 32;

export type WaveSettings = {
  speed: number;
  amplitude: number;
  brightness: number;
  glow: number;
};

export const DEFAULT_SETTINGS: WaveSettings = {
  speed: 0.7,
  amplitude: 1,
  brightness: 1,
  glow: 1,
};

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Analytic geometry and lighting: no image samples or traced control points.
function baseHeight(x: number, depth: number) {
  const u = x / SURFACE_WIDTH;
  const broad = Math.sin(u * Math.PI * 2 * 1.25 - depth * 0.8);
  const detail = Math.sin(u * Math.PI * 2 * 2.15 + depth * 1.1);
  return (
    SURFACE_HEIGHT * (0.99 - 0.67 * depth) +
    (8 + 28 * depth) * broad +
    (4 + 11 * depth) * detail
  );
}

export function foregroundLight(x: number, depth: number) {
  const u = x / SURFACE_WIDTH;
  const across = 0.7 + 0.3 * Math.sin(u * Math.PI * 2 * 1.4 + 0.7) ** 2;
  const depthLight =
    0.1 +
    0.4 * smoothstep(0, 0.2, depth) * (1 - 0.4 * smoothstep(0.45, 0.65, depth));
  return across * depthLight;
}

export function surfaceY(
  x: number,
  depth: number,
  time: number,
  amplitude: number,
): number {
  const phase = (time / LOOP_SECONDS) * Math.PI * 2;
  const u = x / SURFACE_WIDTH;
  const travel =
    32 * amplitude * (Math.sin(phase + depth * 1.9) - Math.sin(depth * 1.9));
  const bigWave =
    Math.sin(u * 8.1 - depth * 3.2 - phase) - Math.sin(u * 8.1 - depth * 3.2);
  const smallWave =
    Math.sin(u * 17.5 + depth * 4.4 - phase * 2) -
    Math.sin(u * 17.5 + depth * 4.4);
  const envelope = Math.sin(Math.PI * Math.max(0, Math.min(1, u))) ** 0.6;
  return (
    baseHeight(x + travel, depth) +
    amplitude * envelope * (bigWave * (3 + depth * 5) + smallWave * 1.5)
  );
}

export function surfaceX(u: number, depth: number) {
  return SURFACE_WIDTH * (0.5 + (u - 0.5) * (1.2 - depth * 0.14));
}

export function rowOpacity(depth: number) {
  const foreground =
    0.39 * smoothstep(0, 0.17, depth) * (1 - smoothstep(0.56, 0.8, depth));
  const crest = 0.11 * Math.exp(-(((depth - 0.54) / 0.085) ** 2));
  const distant = 0.055 + 0.06 * Math.exp(-(((depth - 0.99) / 0.05) ** 2));
  return (foreground + crest + distant) * smoothstep(0, 0.12, depth);
}
