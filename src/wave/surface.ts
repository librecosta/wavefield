export const BACKGROUND = "#080b08";
export const LOOP_SECONDS = 32;
export const SURFACE_LENGTH = 18;

export type WaveSettings = {
  waveHeight: number;
  surfaceDepth: number;
  thickness: number;
  cameraTilt: number;
  cameraZoom: number;
  verticalPosition: number;
  gridDensity: number;
  surfaceOpacity: number;
  rimLight: number;
  brightness: number;
  glow: number;
  speed: number;
  frameLimit: number;
};

export const DEFAULT_SETTINGS: Readonly<WaveSettings> = Object.freeze({
  waveHeight: 1,
  surfaceDepth: 4.8,
  thickness: 0.035,
  cameraTilt: 18,
  cameraZoom: 1,
  verticalPosition: 0.04,
  gridDensity: 1,
  surfaceOpacity: 0.035,
  rimLight: 0.65,
  brightness: 1,
  glow: 0.55,
  speed: 0.7,
  frameLimit: 24,
});

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Four time coefficients each for h, dh/du, dh/dv. No image-derived data. */
export function writeSurfaceModes(u: number, v: number, out: Float64Array, offset = 0) {
  const f1 = Math.PI * 2 * 1.25, f2 = Math.PI * 2 * 2.15, f3 = 17.5;
  const q1 = f1 * u - 1.6 * v;
  const q2 = f2 * u + 2.4 * v;
  const q3 = f3 * u + 4.4 * v;
  const s1 = Math.sin(q1), c1 = Math.cos(q1);
  const s2 = Math.sin(q2), c2 = Math.cos(q2);
  const s3 = Math.sin(q3), c3 = Math.cos(q3);
  const a = 0.7 + 0.3 * v;
  out[offset] = a * (0.46 * s1 + 0.19 * s2);
  out[offset + 1] = a * (-0.46 * c1 + 0.19 * c2);
  out[offset + 2] = a * 0.06 * s3;
  out[offset + 3] = -a * 0.06 * c3;
  out[offset + 4] = a * (0.46 * f1 * c1 + 0.19 * f2 * c2);
  out[offset + 5] = a * (0.46 * f1 * s1 - 0.19 * f2 * s2);
  out[offset + 6] = a * 0.06 * f3 * c3;
  out[offset + 7] = a * 0.06 * f3 * s3;
  out[offset + 8] = 0.3 * (0.46 * s1 + 0.19 * s2) + a * (-0.46 * 1.6 * c1 + 0.19 * 2.4 * c2);
  out[offset + 9] = 0.3 * (-0.46 * c1 + 0.19 * c2) + a * (-0.46 * 1.6 * s1 - 0.19 * 2.4 * s2);
  out[offset + 10] = 0.3 * 0.06 * s3 + a * 0.06 * 4.4 * c3;
  out[offset + 11] = -0.3 * 0.06 * c3 + a * 0.06 * 4.4 * s3;
}

export function writeTimeModes(time: number, out: Float64Array) {
  const phase = ((time % LOOP_SECONDS) / LOOP_SECONDS) * Math.PI * 2;
  out[0] = Math.cos(phase);
  out[1] = Math.sin(phase);
  out[2] = Math.cos(phase * 2);
  out[3] = Math.sin(phase * 2);
}

export function evaluateMode(modes: Float64Array, offset: number, time: Float64Array) {
  return modes[offset] * time[0] + modes[offset + 1] * time[1] +
    modes[offset + 2] * time[2] + modes[offset + 3] * time[3];
}

/** Direct continuous h(u,v,t), used independently to verify compiled geometry. */
export function heightAt(u: number, v: number, time: number, waveHeight: number) {
  const p = ((time % LOOP_SECONDS) / LOOP_SECONDS) * Math.PI * 2;
  return waveHeight * (0.7 + 0.3 * v) * (
    0.46 * Math.sin(Math.PI * 2 * 1.25 * u - 1.6 * v - p) +
    0.19 * Math.sin(Math.PI * 2 * 2.15 * u + 2.4 * v + p) +
    0.06 * Math.sin(17.5 * u + 4.4 * v - p * 2)
  );
}
