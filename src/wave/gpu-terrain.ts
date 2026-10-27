/** Independent implementation of the mathematical observations in Issue #2.
 * The default numeric preset was derived from the public article initializer. */
export type Hill = { x: number; z: number; amplitude: number; width: number };
export type Quality = "adaptive" | "reference";
export type TerrainSettings = {
  hills: readonly Hill[]; phase: number; relief: number; span: number;
  focus: number; softness: number; lineSize: number;
  mainAlpha: number; crossAlpha: number; rim: number; opacity: number;
  framing: number; vertical: number; quality: Quality;
  speed: number; frameLimit: number; entrance: boolean;
};
export const HILL_ASPECTS = [1.35, 1.11, 1.4, 1.35] as const;
export const DETAIL_WAVES = [
  { x: 3.2, z: 2.3, amplitude: 0.035, rate: 1 },
  { x: 6.1, z: -4.7, amplitude: 0.015, rate: -0.8 },
  { x: 0.85, z: 1.2, amplitude: 0.1, rate: -1 },
] as const;
// Numeric scene data derived for slug "react-particle-orb" (2026-10-28).
// The reference initializer itself is not copied into this repository.
export const ARTICLE_PHASE = 3592.92236328125;
export const STUDY_HILLS: readonly Hill[] = Object.freeze([
  { x: -1.7411905527114868, z: 2.163837194442749, amplitude: 0.9189984202384949, width: 0.676218569278717 },
  { x: 2.3478200435638428, z: 1.3123552799224854, amplitude: 0.6052551865577698, width: 0.7366002798080444 },
  { x: 1.2220312356948853, z: -1.3832910060882568, amplitude: 1.080142855644226, width: 0.5502471327781677 },
  { x: 4.71652364730835, z: -1.653043508529663, amplitude: 1.0638912916183472, width: 0.5765623450279236 },
].map(hill => Object.freeze(hill)));
export const DEFAULT_SETTINGS: Readonly<TerrainSettings> = Object.freeze({
  hills: STUDY_HILLS, phase: ARTICLE_PHASE, relief: 1, span: 1,
  focus: 0.58, softness: 1, lineSize: 1.25,
  mainAlpha: 0.72, crossAlpha: 0.14, rim: 1, opacity: 1,
  framing: 1, vertical: 0, quality: "adaptive", speed: 1, frameLimit: 24, entrance: false,
});

export function seededHills(seed: number): readonly Hill[] {
  let word = seed >>> 0;
  const random = () => {
    word = (word + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(word ^ (word >>> 15), word | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return STUDY_HILLS.map(hill => ({ x: hill.x + (random() - 0.5) * 1.1,
    z: hill.z + (random() - 0.5) * 1.5, amplitude: hill.amplitude * (0.8 + random() * 0.4),
    width: hill.width * (0.85 + random() * 0.3) }));
}

export function smoothstep(a: number, b: number, value: number) {
  const x = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** The four measured drift families, with no forced 48-second loop. */
export function hillCenter(hill: Hill, index: number, phase: number) {
  const shifts = [
    [0.32 * Math.sin(phase), 0.25 * Math.cos(phase * 0.8)],
    [0.38 * Math.cos(phase * 0.7), 0.35 * Math.sin(phase * 0.9)],
    [0.30 * Math.sin(phase * 0.6), 0],
    [0, 0.25 * Math.cos(phase)],
  ];
  return { x: hill.x + shifts[index][0], z: hill.z + shifts[index][1] };
}

/** CPU oracle in world coordinates. GPU uses the same parameters/analytic derivatives. */
export function terrainSample(x: number, z: number, time: number, settings = DEFAULT_SETTINGS) {
  const phase = 0.075 * (time + settings.phase);
  let height = 0, dx = 0, dz = 0;
  settings.hills.forEach((hill, index) => {
    const center = hillCenter(hill, index, phase);
    const wx = hill.width / settings.span, wz = wx * HILL_ASPECTS[index];
    const ox = x - center.x, oz = z - center.z;
    const contribution = hill.amplitude * Math.exp(-(ox * ox * wx * wx + oz * oz * wz * wz));
    height += contribution; dx -= 2 * contribution * ox * wx * wx; dz -= 2 * contribution * oz * wz * wz;
  });
  for (const wave of DETAIL_WAVES) {
    const angle = wave.x * x + wave.z * z + phase * wave.rate;
    height += wave.amplitude * Math.sin(angle);
    const derivative = wave.amplitude * Math.cos(angle);
    dx += derivative * wave.x; dz += derivative * wave.z;
  }
  return { height: height * settings.relief, dx: dx * settings.relief, dz: dz * settings.relief };
}

export function focusWeight(depth: number, focus = 0.58) {
  return 1 - smoothstep(0.07, 0.38, Math.abs(depth - focus));
}
export function lineOptics(depth: number, settings = DEFAULT_SETTINGS) {
  const focus = focusWeight(depth, settings.focus);
  const sigma = settings.lineSize * (0.32 + 2.16 * (1 - focus) * settings.softness);
  const energy = Math.min(1, 0.34 * settings.lineSize / sigma);
  return { focus, sigma, energy };
}

export function gpuViewport(width: number, height: number, dpr: number, limit: number) {
  const w = Math.max(1, width), h = Math.max(1, height), maximum = Math.max(1, Math.floor(limit));
  const ratio = Math.min(Math.max(1, dpr), 1.5, maximum / w, maximum / h);
  return { width: w, height: h, dpr: ratio,
    pixelWidth: Math.min(maximum, Math.max(1, Math.round(w * ratio))),
    pixelHeight: Math.min(maximum, Math.max(1, Math.round(h * ratio))) };
}
export function sceneField(width: number, height: number, settings = DEFAULT_SETTINGS) {
  return { x: width * 0.5, y: height * (0.5 + settings.vertical),
    halfWidth: width * 0.5 * settings.framing, halfHeight: height * 0.5 * settings.framing };
}
export function projectPoint(u: number, v: number, height: number, field: ReturnType<typeof sceneField>) {
  const perspective = 0.65 + 0.8 * v;
  const horizontal = Math.max(field.halfWidth, 2.2 * field.halfHeight);
  const crop = 1 - field.halfWidth / horizontal;
  return { x: field.x + (((u - 0.5) * 12 / 5) * perspective - crop * 0.3) * horizontal,
    y: field.y + (-0.5 + 2 * v - 0.68 * height * perspective) * field.halfHeight };
}
export function gpuMeshBudget(width: number, quality: Quality = "adaptive") {
  const reduced = quality === "adaptive" && width < 560;
  const columns = reduced ? 128 : 192, rows = reduced ? 96 : 112;
  return { columns, rows, nodeCount: (columns + 1) * (rows + 1), instanceCount: 2 * columns * rows };
}
export function gpuUnavailableReason(secure: boolean, gpu: unknown): string | null {
  if (!secure) return "WebGPU requires HTTPS or localhost.";
  if (!gpu) return "WebGPU is not available in this browser.";
  return null;
}

export const UNIFORM_FLOATS = 52;
export function writeUniforms(out: Float32Array, width: number, height: number, dpr: number,
  time: number, settings: TerrainSettings) {
  const field = sceneField(width, height, settings), mesh = gpuMeshBudget(width, settings.quality);
  const phase = 0.075 * (time + settings.phase);
  out.set([width, height, phase, dpr, field.x, field.y, field.halfWidth, field.halfHeight,
    mesh.columns, mesh.rows, mesh.nodeCount, 0,
    settings.focus, settings.lineSize, settings.softness, settings.rim,
    settings.mainAlpha, settings.crossAlpha, settings.opacity, settings.entrance ? smoothstep(0, 1.2, time) : 1,
    settings.relief, settings.span, 0, 0,
    0.24427, 0.59749, 1, 0, 0.92757, 0.92224, 0.89912, 0]);
  settings.hills.forEach((hill, index) => {
    const center = hillCenter(hill, index, phase);
    out.set([center.x, center.z, hill.amplitude, hill.width], 32 + index * 4);
  });
  out.set(HILL_ASPECTS, 48);
  return mesh;
}
