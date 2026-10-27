import { LOOP_SECONDS, SURFACE_WIDTH, surfaceX, surfaceY } from "./surface.ts";

const TABLE_START = -512;
const TABLE_STEP = 2;
const TABLE_LENGTH = Math.ceil((SURFACE_WIDTH + 1024) / TABLE_STEP) + 1;

/** A projected row with its static geometry and spatial modes compiled once. */
export class ProjectedRow {
  readonly depth: number;
  readonly samples: number;
  private readonly offset: number;
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  private readonly baseline = new Float32Array(TABLE_LENGTH);
  private readonly indices: Float32Array;
  private readonly bigSin: Float32Array;
  private readonly bigCos: Float32Array;
  private readonly smallSin: Float32Array;
  private readonly smallCos: Float32Array;
  private readonly depthSin: number;
  private readonly depthCos: number;

  constructor(
    depth: number,
    samples: number,
    xs?: Float32Array,
    ys?: Float32Array,
    offset = 0,
  ) {
    this.depth = depth;
    this.samples = samples;
    this.offset = offset;
    this.xs = xs ?? new Float32Array(samples + 1);
    this.ys = ys ?? new Float32Array(samples + 1);
    this.indices = new Float32Array(samples + 1);
    this.bigSin = new Float32Array(samples + 1);
    this.bigCos = new Float32Array(samples + 1);
    this.smallSin = new Float32Array(samples + 1);
    this.smallCos = new Float32Array(samples + 1);
    this.depthSin = Math.sin(depth * 1.9);
    this.depthCos = Math.cos(depth * 1.9);
    for (let i = 0; i < TABLE_LENGTH; i++) {
      this.baseline[i] = surfaceY(TABLE_START + i * TABLE_STEP, depth, 0, 0);
    }
    for (let i = 0; i <= samples; i++) {
      const x = surfaceX(i / samples, depth);
      const u = x / SURFACE_WIDTH;
      const envelope = Math.sin(Math.PI * Math.max(0, Math.min(1, u))) ** 0.6;
      const big = u * 8.1 - depth * 3.2;
      const small = u * 17.5 + depth * 4.4;
      this.xs[offset + i] = x;
      this.indices[i] = (x - TABLE_START) / TABLE_STEP;
      this.bigSin[i] = envelope * (3 + depth * 5) * Math.sin(big);
      this.bigCos[i] = envelope * (3 + depth * 5) * Math.cos(big);
      this.smallSin[i] = envelope * 1.5 * Math.sin(small);
      this.smallCos[i] = envelope * 1.5 * Math.cos(small);
    }
  }

  update(time: number, amplitude: number) {
    const phase = (time / LOOP_SECONDS) * Math.PI * 2;
    const sin1 = Math.sin(phase),
      cos1 = Math.cos(phase) - 1;
    const sin2 = Math.sin(phase * 2),
      cos2 = Math.cos(phase * 2) - 1;
    const shift =
      (32 * amplitude * (sin1 * this.depthCos + cos1 * this.depthSin)) /
      TABLE_STEP;
    for (let i = 0; i <= this.samples; i++) {
      const index = this.indices[i] + shift;
      const lower = Math.floor(index),
        fraction = index - lower;
      const baseline =
        this.baseline[lower] * (1 - fraction) +
        this.baseline[lower + 1] * fraction;
      this.ys[this.offset + i] =
        baseline +
        amplitude *
          (this.bigSin[i] * cos1 -
            this.bigCos[i] * sin1 +
            this.smallSin[i] * cos2 -
            this.smallCos[i] * sin2);
    }
  }
}
