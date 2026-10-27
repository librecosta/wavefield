import {
  BACKGROUND,
  SURFACE_WIDTH as W,
  SURFACE_HEIGHT as H,
  rowOpacity,
  foregroundLight,
  smoothstep,
  type WaveSettings,
} from "./surface";
import { ProjectedRow } from "./geometry";
const ROWS = 55,
  COLUMNS = 138,
  SAMPLES = 318;

export class WaveRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly glowCanvas = document.createElement("canvas");
  private readonly glowContext: CanvasRenderingContext2D;
  private readonly rearCanvas = document.createElement("canvas");
  private readonly rearContext: CanvasRenderingContext2D;
  private readonly xs = new Float32Array((ROWS + 1) * (SAMPLES + 1));
  private readonly ys = new Float32Array((ROWS + 1) * (SAMPLES + 1));
  private readonly rows = Array.from(
    { length: ROWS + 1 },
    (_, row) =>
      new ProjectedRow(
        row / ROWS,
        SAMPLES,
        this.xs,
        this.ys,
        row * (SAMPLES + 1),
      ),
  );
  private readonly glowPasses = [
    { row: new ProjectedRow(0.997, SAMPLES), width: 15, alpha: 0.25, blur: 4 },
    {
      row: new ProjectedRow(0.985, SAMPLES),
      width: 4.5,
      alpha: 0.33,
      blur: 1.8,
    },
    { row: new ProjectedRow(0.77, SAMPLES), width: 21, alpha: 0.1, blur: 6 },
    { row: new ProjectedRow(0.6, SAMPLES), width: 13, alpha: 0.09, blur: 4.5 },
    { row: new ProjectedRow(0.59, SAMPLES), width: 3, alpha: 0.035, blur: 1.4 },
  ];
  private lineGradient!: CanvasGradient;
  private foregroundGradients: CanvasGradient[] = [];
  private glowGradient!: CanvasGradient;
  private bottomFade!: CanvasGradient;
  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false }),
      glowCtx = this.glowCanvas.getContext("2d"),
      rearCtx = this.rearCanvas.getContext("2d");
    if (!ctx || !glowCtx || !rearCtx)
      throw new Error("Canvas 2D is not supported by this browser");
    this.context = ctx;
    this.glowContext = glowCtx;
    this.rearContext = rearCtx;
    this.glowCanvas.width = Math.ceil(W / 2);
    this.glowCanvas.height = Math.ceil(H / 2);
    this.rearCanvas.width = this.glowCanvas.width;
    this.rearCanvas.height = this.glowCanvas.height;
    this.resize(W, H, 1);
  }
  resize(width: number, height: number, dpr: number) {
    this.canvas.width = Math.max(1, Math.round(width * Math.min(dpr, 2)));
    this.canvas.height = Math.max(1, Math.round(height * Math.min(dpr, 2)));
    this.context.setTransform(
      this.canvas.width / W,
      0,
      0,
      this.canvas.height / H,
      0,
      0,
    );
    this.lineGradient = this.context.createLinearGradient(0, 0, W, 0);
    this.foregroundGradients = [];
    for (let row = 0; row <= Math.round(ROWS * 0.6); row++) {
      const gradient = this.context.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 64; i++) {
        const x = (i / 64) * W,
          fade = smoothstep(0, 45, x) * (1 - smoothstep(W - 90, W, x));
        gradient.addColorStop(
          i / 64,
          `rgba(57,126,198,${Math.min(1, foregroundLight(x, row / ROWS) * 1.5) * fade})`,
        );
      }
      this.foregroundGradients[row] = gradient;
    }
    for (const [at, alpha] of [
      [0, 0],
      [0.025, 0.45],
      [0.08, 1],
      [0.22, 0.95],
      [0.45, 0.75],
      [0.68, 0.9],
      [0.86, 0.8],
      [0.96, 0.4],
      [1, 0],
    ] as const)
      this.lineGradient.addColorStop(at, `rgba(57,126,198,${alpha})`);
    this.bottomFade = this.context.createLinearGradient(0, 184, 0, 230);
    this.bottomFade.addColorStop(0, "rgba(8,11,8,0)");
    this.bottomFade.addColorStop(0.55, "rgba(8,11,8,0.23)");
    this.bottomFade.addColorStop(1, "rgba(8,11,8,1)");
    this.glowContext.setTransform(0.5, 0, 0, 0.5, 0, 0);
    this.glowGradient = this.glowContext.createLinearGradient(0, 0, W, 0);
    for (const [at, alpha] of [
      [0, 0],
      [0.06, 0.95],
      [0.2, 0.8],
      [0.42, 0.2],
      [0.62, 0.25],
      [0.75, 0.55],
      [0.9, 0.27],
      [1, 0],
    ] as const)
      this.glowGradient.addColorStop(at, `rgba(42,105,177,${alpha})`);
  }
  draw(time: number, settings: WaveSettings): number {
    const start = performance.now(),
      ctx = this.context;
    const brightness = settings.brightness * 0.88;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, W, H);
    for (const row of this.rows) row.update(time, settings.amplitude);
    this.drawGlow(time, settings);
    ctx.globalAlpha = settings.glow * brightness;
    ctx.drawImage(this.glowCanvas, 0, 0, W, H);
    ctx.lineWidth = 0.65;
    ctx.strokeStyle = this.lineGradient;
    ctx.lineJoin = "round";
    for (let row = ROWS; row >= 0; row--) {
      const foreground = this.foregroundGradients[row];
      ctx.strokeStyle = foreground ?? this.lineGradient;
      ctx.globalAlpha = foreground
        ? brightness
        : rowOpacity(row / ROWS) * brightness * 0.25;
      ctx.beginPath();
      const offset = row * (SAMPLES + 1);
      ctx.moveTo(this.xs[offset], this.ys[offset]);
      for (let col = 1; col <= SAMPLES; col++)
        ctx.lineTo(this.xs[offset + col], this.ys[offset + col]);
      ctx.stroke();
    }
    // Secondary lines are much dimmer; bright grid squares would flatten the image.
    ctx.lineWidth = 0.43;
    for (let band = 0; band < 5; band++) {
      const from = Math.round((band * ROWS) / 5),
        to = Math.round(((band + 1) * ROWS) / 5),
        depth = (from + to) / 2 / ROWS;
      ctx.globalAlpha =
        brightness *
        (0.055 + 0.055 * Math.sin(depth * Math.PI)) *
        (1 - smoothstep(0.5, 1, depth) * 0.7) *
        smoothstep(0, 0.17, depth);
      ctx.beginPath();
      for (let col = 0; col <= COLUMNS; col++) {
        const sample = Math.round((col / COLUMNS) * SAMPLES);
        let index = from * (SAMPLES + 1) + sample;
        ctx.moveTo(this.xs[index], this.ys[index]);
        for (let row = from + 1; row <= to; row++) {
          index = row * (SAMPLES + 1) + sample;
          ctx.lineTo(this.xs[index], this.ys[index]);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.bottomFade;
    ctx.fillRect(0, 184, W, H - 184);
    return performance.now() - start;
  }
  private drawGlow(time: number, settings: WaveSettings) {
    const ctx = this.glowContext;
    ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    ctx.clearRect(0, 0, W + 2, H + 2);
    ctx.strokeStyle = this.glowGradient;
    ctx.lineJoin = "round";
    // Glow follows the same moving geometry; no image texture is used.
    for (const { row, width, alpha, blur } of this.glowPasses) {
      row.update(time, settings.amplitude);
      ctx.filter = `blur(${blur}px)`;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let sample = 0; sample <= SAMPLES; sample++) {
        const x = row.xs[sample],
          y = row.ys[sample];
        if (sample === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    const rear = this.rearContext;
    rear.setTransform(0.5, 0, 0, 0.5, 0, 0);
    rear.clearRect(0, 0, W + 2, H + 2);
    rear.strokeStyle = this.glowGradient;
    rear.lineWidth = 1.1;
    for (let row = Math.floor(ROWS * 0.57); row <= ROWS; row++) {
      rear.globalAlpha = 0.24 + 0.16 * smoothstep(0.57, 1, row / ROWS);
      const offset = row * (SAMPLES + 1);
      rear.beginPath();
      rear.moveTo(this.xs[offset], this.ys[offset]);
      for (let col = 1; col <= SAMPLES; col++)
        rear.lineTo(this.xs[offset + col], this.ys[offset + col]);
      rear.stroke();
    }
    ctx.filter = "blur(1.5px)";
    ctx.drawImage(this.rearCanvas, 0, 0, W, H);
    ctx.filter = "none";
  }
}
