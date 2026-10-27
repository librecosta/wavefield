import { BACKGROUND, smoothstep, type WaveSettings } from "./surface.ts";
import { MembraneGeometry } from "./geometry.ts";
import { Camera } from "./camera.ts";

export class WaveRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly glowCanvas = document.createElement("canvas");
  private readonly glowContext: CanvasRenderingContext2D;
  private readonly camera = new Camera();
  private geometry = new MembraneGeometry();
  private view = new Float32Array(this.geometry.count * 3);
  private screen = new Float32Array(this.geometry.count * 2);
  private lowerView = new Float32Array(this.geometry.count * 3);
  private lowerScreen = new Float32Array(this.geometry.count * 2);
  private diffuse = new Float32Array(this.geometry.count);
  private grazing = new Float32Array(this.geometry.count);
  private density = 1;
  private projectionDirty = true;
  private previous: WaveSettings | null = null;
  private mainGradients: CanvasGradient[] = [];
  private crossGradient!: CanvasGradient;
  private glowGradient!: CanvasGradient;
  width = 1;
  height = 1;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    const glow = this.glowCanvas.getContext("2d");
    if (!ctx || !glow) throw new Error("Canvas 2D is not supported by this browser");
    this.context = ctx;
    this.glowContext = glow;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = Math.max(1, Math.min(dpr, 2));
    this.canvas.width = Math.max(1, Math.round(width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(height * this.dpr));
    // All drawing coordinates and line widths below are CSS pixels.
    this.context.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    this.glowCanvas.width = Math.ceil(width / 2);
    this.glowCanvas.height = Math.ceil(height / 2);
    this.glowContext.setTransform(0.5, 0, 0, 0.5, 0, 0);
    this.projectionDirty = true;
  }

  private prepare(time: number, settings: WaveSettings) {
    if (this.density !== settings.gridDensity) {
      this.density = settings.gridDensity;
      this.geometry = new MembraneGeometry(this.density);
      this.view = new Float32Array(this.geometry.count * 3);
      this.screen = new Float32Array(this.geometry.count * 2);
      this.lowerView = new Float32Array(this.geometry.count * 3);
      this.lowerScreen = new Float32Array(this.geometry.count * 2);
      this.diffuse = new Float32Array(this.geometry.count);
      this.grazing = new Float32Array(this.geometry.count);
      this.projectionDirty = true;
    }
    const previous = this.previous;
    if (!previous || settings.cameraTilt !== previous.cameraTilt ||
      settings.cameraZoom !== previous.cameraZoom || settings.verticalPosition !== previous.verticalPosition) {
      this.projectionDirty = true;
    }
    const changed = this.geometry.update(time, settings.waveHeight, settings.surfaceDepth, settings.thickness);
    const cameraChanged = this.projectionDirty;
    if (changed || this.projectionDirty) {
      this.camera.configure(this.width, this.height, settings);
      this.camera.project(this.geometry.positions, this.view, this.screen);
      this.camera.project(this.geometry.lower, this.lowerView, this.lowerScreen);
      const normals = this.geometry.normals;
      for (let node = 0; node < this.geometry.count; node++) {
        const i = node * 3;
        this.diffuse[node] = Math.max(0, -0.2 * normals[i] + 0.86 * normals[i + 1] + 0.47 * normals[i + 2]);
        const facing = Math.abs(normals[i + 1] * this.camera.sinTilt + normals[i + 2] * this.camera.cosTilt);
        this.grazing[node] = (1 - Math.min(1, facing)) ** 5;
      }
      this.projectionDirty = false;
    }
    if (cameraChanged) {
      const left = this.screen[0], right = this.screen[this.geometry.columns * 2];
      const gradient = (ctx: CanvasRenderingContext2D, color: string) => {
        const result = ctx.createLinearGradient(0, 0, this.width, 0);
        const edge = Math.min(80, this.width * 0.12);
        for (let stop = 0; stop <= 40; stop++) {
          const x = this.width * stop / 40, u = (x - left) / (right - left);
          const alpha = smoothstep(0, edge, x) * (1 - smoothstep(this.width - edge, this.width, x)) *
            smoothstep(0, 0.06, u) * (1 - smoothstep(0.94, 1, u));
          result.addColorStop(stop / 40, `rgba(${color},${alpha})`);
        }
        return result;
      };
      this.mainGradients = ["74,135,181", "97,151,191", "119,166,201", "142,182,210", "164,198,220"]
        .map(color => gradient(this.context, color));
      this.crossGradient = gradient(this.context, "60,115,154");
      this.glowGradient = gradient(this.glowContext, "105,158,200");
    }
    this.previous = settings;
  }

  private edgeFade(node: number) {
    const x = this.screen[node * 2], edge = Math.min(80, this.width * 0.12);
    const u = (node % (this.geometry.columns + 1)) / this.geometry.columns;
    return smoothstep(0, edge, x) * (1 - smoothstep(this.width - edge, this.width, x)) *
      smoothstep(0, 0.06, u) * (1 - smoothstep(0.94, 1, u));
  }

  private line(ctx: CanvasRenderingContext2D, start: number, end: number, step: number) {
    ctx.beginPath();
    ctx.moveTo(this.screen[start * 2], this.screen[start * 2 + 1]);
    for (let node = start + step; node <= end; node += step) {
      ctx.lineTo(this.screen[node * 2], this.screen[node * 2 + 1]);
    }
    ctx.stroke();
  }

  private fillSurface(settings: WaveSettings) {
    if (settings.surfaceOpacity === 0) return;
    const ctx = this.context, mesh = this.geometry, s = this.screen;
    ctx.fillStyle = "#244b64";
    // Far-to-near strips, using ONLY nodes shared with both grid directions.
    // This is a shallow height-field painter, not a general visibility solver.
    for (let row = 0; row < mesh.rows; row += 2) {
      const nextRow = Math.min(mesh.rows, row + 2);
      for (let col = 0; col < mesh.columns; col += 4) {
        const a = mesh.index(row, col), b = mesh.index(row, col + 4);
        const c = mesh.index(nextRow, col + 4), d = mesh.index(nextRow, col);
        const middle = mesh.index(row, col + 2);
        if (s[b * 2] < 0 || s[a * 2] > this.width) continue;
        ctx.globalAlpha = Math.min(1, settings.surfaceOpacity * settings.brightness *
          (0.35 + this.diffuse[middle] * 0.65) * this.edgeFade(middle));
        ctx.beginPath();
        ctx.moveTo(s[a * 2], s[a * 2 + 1]);
        ctx.lineTo(s[b * 2], s[b * 2 + 1]);
        ctx.lineTo(s[c * 2], s[c * 2 + 1]);
        ctx.lineTo(s[d * 2], s[d * 2 + 1]);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawEdge(settings: WaveSettings) {
    if (settings.thickness === 0) return;
    const ctx = this.context, mesh = this.geometry, s = this.screen, lower = this.lowerScreen;
    // Only the near boundary has a front-facing side at this camera azimuth.
    // No second full grid is drawn on the underside.
    ctx.fillStyle = "#10212c";
    for (let col = 0; col < mesh.columns; col += 2) {
      const a = mesh.index(mesh.rows, col), b = a + 2;
      ctx.globalAlpha = Math.min(1, 0.8 * settings.brightness * this.edgeFade(a + 1));
      ctx.beginPath();
      ctx.moveTo(s[a * 2], s[a * 2 + 1]);
      ctx.lineTo(s[b * 2], s[b * 2 + 1]);
      ctx.lineTo(lower[b * 2], lower[b * 2 + 1]);
      ctx.lineTo(lower[a * 2], lower[a * 2 + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#31516a";
      ctx.lineWidth = 0.65;
      ctx.globalAlpha *= 0.42;
      ctx.beginPath();
      ctx.moveTo(lower[a * 2], lower[a * 2 + 1]);
      ctx.lineTo(lower[b * 2], lower[b * 2 + 1]);
      ctx.stroke();
    }
  }

  private drawGrid(settings: WaveSettings) {
    const ctx = this.context, mesh = this.geometry;
    const baseSpacing = settings.surfaceDepth * this.camera.sinTilt * this.camera.scale / mesh.rows;
    const targetSpacing = 1.8 / Math.sqrt(this.dpr);
    const stride = Math.min(16, 2 ** Math.max(0, Math.ceil(Math.log2(targetSpacing / baseSpacing))));
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.7;
    for (let row = 0; row <= mesh.rows; row += stride) {
      const v = row / mesh.rows;
      const depthFade = 0.35 + 0.65 * Math.sin(Math.PI * (0.1 + v * 0.8));
      for (let col = 0; col < mesh.columns; col += 2) {
        const first = mesh.index(row, col), middle = first + 1;
        const neighbor = mesh.index(row === mesh.rows ? Math.max(0, row - stride) : Math.min(mesh.rows, row + stride), col + 1);
        const spacing = Math.abs(this.screen[neighbor * 2 + 1] - this.screen[middle * 2 + 1]);
        const fade = smoothstep(0, 1.8 / this.dpr, spacing);
        const base = depthFade * (0.07 + 0.22 * this.diffuse[middle]);
        const rim = settings.rimLight * this.grazing[middle] * 0.33;
        const light = base + rim;
        // Quantized blue/silver mixing keeps local rim lighting to ONE stroke.
        ctx.strokeStyle = this.mainGradients[Math.round(4 * rim / light)];
        ctx.globalAlpha = Math.min(1, settings.brightness * fade * light);
        this.line(ctx, first, first + 2, 1);
      }
    }
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = this.crossGradient;
    for (let col = 0; col <= mesh.columns; col += 8) {
      for (let row = 0; row < mesh.rows; row += 4) {
        const first = mesh.index(row, col), last = mesh.index(Math.min(mesh.rows, row + 4), col);
        const middle = mesh.index(Math.min(mesh.rows, row + 2), col);
        ctx.globalAlpha = Math.min(1, settings.brightness *
          (0.045 + 0.08 * this.diffuse[middle]) * (0.65 + 0.35 * row / mesh.rows));
        this.line(ctx, first, last, mesh.columns + 1);
      }
    }
  }

  private drawGlow(settings: WaveSettings) {
    if (settings.glow === 0 || settings.rimLight === 0) return;
    const ctx = this.glowContext, mesh = this.geometry;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.filter = "blur(1.4px)";
    ctx.strokeStyle = this.glowGradient;
    ctx.lineWidth = 3.2;
    for (let band = 0; band < 3; band++) {
      const row = Math.round(mesh.rows * (0.25 + band * 0.375));
      for (let col = 0; col < mesh.columns; col += 8) {
        const start = mesh.index(row, col), middle = start + 4;
        ctx.globalAlpha = Math.min(1, settings.glow * settings.rimLight * settings.brightness *
          (0.05 + 0.55 * this.grazing[middle]));
        this.line(ctx, start, start + 8, 1);
      }
    }
    ctx.filter = "none";
    this.context.globalAlpha = 1;
    this.context.drawImage(this.glowCanvas, 0, 0, this.width, this.height);
  }

  draw(time: number, settings: WaveSettings): number {
    const started = performance.now(), ctx = this.context;
    this.prepare(time, settings);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawEdge(settings);
    this.fillSurface(settings);
    this.drawGrid(settings);
    this.drawGlow(settings);
    ctx.globalAlpha = 1;
    return performance.now() - started;
  }

  dispose() {
    this.glowCanvas.width = this.glowCanvas.height = 0;
    this.canvas.width = this.canvas.height = 0;
  }
}
