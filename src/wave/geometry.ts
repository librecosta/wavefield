import { SURFACE_LENGTH, evaluateMode, writeSurfaceModes, writeTimeModes } from "./surface.ts";

/** x right, y up, z towards the viewer; v=0 is the far edge. */
export class MembraneGeometry {
  readonly columns: number;
  readonly rows: number;
  readonly count: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly lower: Float32Array;
  private readonly modes: Float64Array;
  private readonly timeModes = new Float64Array(4);
  private time = NaN;
  private height = NaN;
  private depth = NaN;
  private thickness = NaN;

  constructor(density = 1) {
    this.columns = Math.round((128 * density) / 8) * 8;
    this.rows = Math.round(40 * density);
    this.count = (this.columns + 1) * (this.rows + 1);
    this.positions = new Float32Array(this.count * 3);
    this.normals = new Float32Array(this.count * 3);
    this.lower = new Float32Array(this.count * 3);
    this.modes = new Float64Array(this.count * 12);
    for (let row = 0; row <= this.rows; row++) {
      for (let col = 0; col <= this.columns; col++) {
        writeSurfaceModes(col / this.columns, row / this.rows, this.modes, this.index(row, col) * 12);
      }
    }
  }

  /** Both line families and every material patch address these same nodes. */
  index(row: number, col: number) { return row * (this.columns + 1) + col; }

  update(time: number, height: number, depth: number, thickness: number): boolean {
    if ((time === this.time || height === 0) && height === this.height &&
      depth === this.depth && thickness === this.thickness) return false;
    this.time = time;
    this.height = height;
    this.depth = depth;
    this.thickness = thickness;
    writeTimeModes(time, this.timeModes);
    for (let row = 0; row <= this.rows; row++) {
      const z = depth * (row / this.rows - 0.5);
      for (let col = 0; col <= this.columns; col++) {
        const node = this.index(row, col), i = node * 3, mode = node * 12;
        const x = SURFACE_LENGTH * (col / this.columns - 0.5);
        const y = height === 0 ? 0 : height * evaluateMode(this.modes, mode, this.timeModes);
        const nx = height === 0 ? 0 : -height * evaluateMode(this.modes, mode + 4, this.timeModes) / SURFACE_LENGTH;
        const nz = height === 0 ? 0 : -height * evaluateMode(this.modes, mode + 8, this.timeModes) / depth;
        // Pv × Pu (rather than Pu × Pv) fixes all normals towards +Y.
        const inverseLength = 1 / Math.hypot(nx, 1, nz);
        this.positions[i] = x; this.positions[i + 1] = y; this.positions[i + 2] = z;
        this.normals[i] = nx * inverseLength;
        this.normals[i + 1] = inverseLength;
        this.normals[i + 2] = nz * inverseLength;
        for (let axis = 0; axis < 3; axis++) {
          this.lower[i + axis] = thickness === 0 ? this.positions[i + axis] :
            this.positions[i + axis] - thickness * this.normals[i + axis];
        }
      }
    }
    return true;
  }
}
