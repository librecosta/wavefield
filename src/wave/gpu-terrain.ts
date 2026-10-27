export const TERRAIN_PERIOD = 48;
export type GpuSettings = {
  relief: number; focusDepth: number; defocus: number;
  contrast: number; rimLight: number; opacity: number;
};
export const DEFAULT_GPU_SETTINGS: Readonly<GpuSettings> = Object.freeze({
  relief: 1, focusDepth: 0.64, defocus: 1.35,
  contrast: 1, rimLight: 0.7, opacity: 0.8,
});
export type TerrainLobe = {
  center: number; depth: number; width: number; amplitude: number;
  lean: number; bend: number; skew: number; phase: number;
};

/** Wavefield's own scene seed and ranges; unrelated to third-party shaders. */
export function createTerrainLobes(seed = 0x4c1f89e3): readonly TerrainLobe[] {
  let state = seed >>> 0 || 1;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  return [0.14, 0.49, 0.83].map(center => Object.freeze({
    center: center + (random() - 0.5) * 0.045,
    depth: 0.18 + random() * 0.66,
    width: 0.11 + random() * 0.08,
    amplitude: 0.44 + random() * 0.42,
    lean: (random() - 0.5) * 0.3,
    bend: 0.015 + random() * 0.045,
    skew: (random() - 0.5) * 0.5,
    phase: random() * Math.PI * 2,
  }));
}
export const TERRAIN_LOBES = createTerrainLobes();

/** CPU reference for the same continuous field encoded into our WGSL. */
export function terrainHeight(u: number, v: number, time: number, relief = 1,
  lobes: readonly TerrainLobe[] = TERRAIN_LOBES) {
  const phase = (time % TERRAIN_PERIOD) / TERRAIN_PERIOD * Math.PI * 2;
  let height = -0.24 - 0.05 * v;
  for (const lobe of lobes) {
    const center = lobe.center + lobe.lean * (v - 0.5) +
      lobe.bend * Math.sin(Math.PI * v + phase + lobe.phase);
    const q = (u - center) / lobe.width;
    const asymmetric = q / (1 + lobe.skew * Math.tanh(q));
    const depthEnvelope = 0.5 + 0.5 * Math.exp(-(((v - lobe.depth) / 0.55) ** 2));
    const breathing = 0.92 + 0.08 * Math.cos(phase + lobe.phase);
    height += lobe.amplitude * Math.exp(-asymmetric * asymmetric) * depthEnvelope * breathing;
  }
  const ripple = 0.026 * Math.sin(25 * u + 5 * v + phase) * Math.cos(7 * v - phase);
  return relief * (height + ripple);
}

export function gpuMeshBudget(width: number) {
  const columns = width < 560 ? 88 : width < 1200 ? 120 : 144;
  const rows = width < 560 ? 32 : width < 1200 ? 40 : 48;
  const crossStep = 4;
  const mainCount = columns * (rows + 1);
  return { columns, rows, crossStep, mainCount,
    instanceCount: mainCount + (columns / crossStep + 1) * rows };
}

export function gpuViewport(width: number, height: number, dpr: number, limit: number) {
  const safeWidth = Math.max(1, width), safeHeight = Math.max(1, height);
  const maximum = Math.max(1, Math.floor(limit));
  const ratio = Math.min(Math.max(1, dpr), 1.5, maximum / safeWidth, maximum / safeHeight);
  return { width: safeWidth, height: safeHeight, dpr: ratio,
    pixelWidth: Math.min(maximum, Math.max(1, Math.round(safeWidth * ratio))),
    pixelHeight: Math.min(maximum, Math.max(1, Math.round(safeHeight * ratio))),
    verticalScale: Math.min(safeHeight * 0.55, Math.max(90, safeWidth * 0.085)) };
}

export function gpuUnavailableReason(secure: boolean, gpu: unknown): string | null {
  if (!secure) return "WebGPU requires HTTPS or localhost.";
  if (!gpu) return "WebGPU is not available in this browser.";
  return null;
}
