import { TERRAIN_SHADER, TERRAIN_COMPUTE } from "./gpu-shaders.ts";
import { UNIFORM_FLOATS, writeUniforms, gpuMeshBudget, gpuUnavailableReason, gpuViewport, type TerrainSettings } from "./gpu-terrain.ts";
import { boundedInitialization } from "./renderer-session.ts";

export class GpuFailure extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) { super(message); this.reason = reason; }
}
type GpuPlatform = { secure: boolean; gpu?: GPU };

export class GpuRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly onFailure: (error: unknown) => void;
  private pipeline!: GPURenderPipeline;
  private sampler!: GPUComputePipeline;
  private buffer: GPUBuffer | null = null;
  private nodes: GPUBuffer | null = null;
  private bindGroup!: GPUBindGroup;
  private sampleGroup!: GPUBindGroup;
  private readonly uniforms = new Float32Array(UNIFORM_FLOATS);
  private budget = gpuMeshBudget(1);
  private disposed = false;
  private configured = false;
  readonly adapter: string;
  width = 1;
  height = 1;
  dpr = 1;

  private constructor(canvas: HTMLCanvasElement, context: GPUCanvasContext, device: GPUDevice,
    format: GPUTextureFormat, adapter: string, onFailure: (error: unknown) => void) {
    this.canvas = canvas; this.context = context; this.device = device;
    this.format = format; this.adapter = adapter; this.onFailure = onFailure;
    device.addEventListener("uncapturederror", this.handleError);
    void device.lost.then(info => {
      if (!this.disposed) this.onFailure(new GpuFailure("device lost", info.message || "The WebGPU device was lost."));
    });
  }

  static async create(canvas: HTMLCanvasElement, onFailure: (error: unknown) => void,
    cancelled: () => boolean, platform: GpuPlatform = { secure: globalThis.isSecureContext, gpu: navigator.gpu }) {
    const unavailable = gpuUnavailableReason(platform.secure, platform.gpu);
    if (unavailable) throw new GpuFailure("unsupported", unavailable);
    const gpu = platform.gpu!;
    let instance: GpuRenderer | null = null, device: GPUDevice | null = null;
    try {
      const adapter = await boundedInitialization(gpu.requestAdapter(), "GPU adapter request");
      if (!adapter) throw new GpuFailure("unsupported", "No WebGPU adapter is available.");
      if (cancelled()) throw new Error("Initialization cancelled.");
      device = await boundedInitialization(adapter.requestDevice(), "GPU device request", 8000, late => late.destroy());
      if (cancelled()) throw new Error("Initialization cancelled.");
      const context = canvas.getContext("webgpu");
      if (!context) throw new Error("A WebGPU canvas context could not be created.");
      const info = adapter.info;
      const description = [info.description || info.vendor, info.architecture].filter(Boolean).join(" · ") || "Adapter details unavailable";
      const kind = typeof info.isFallbackAdapter === "boolean"
        ? info.isFallbackAdapter ? "fallback/software adapter" : "non-fallback adapter"
        : "adapter type unavailable";
      instance = new GpuRenderer(canvas, context, device, gpu.getPreferredCanvasFormat(), `${description} (${kind})`, onFailure);
      const module = device.createShaderModule({ label: "Wavefield soft ribbons", code: TERRAIN_SHADER });
      const compute = device.createShaderModule({ label: "Wavefield shared terrain sampling", code: TERRAIN_COMPUTE });
      for (const shader of [compute, module]) {
        const compilation = await boundedInitialization(shader.getCompilationInfo(), "WGSL compilation");
        const errors = compilation.messages.filter(message => message.type === "error");
        if (errors.length) throw new Error(errors.map(error => `WGSL ${error.lineNum}:${error.linePos}: ${error.message}`).join(" "));
      }
      if (cancelled()) throw new Error("Initialization cancelled.");
      device.pushErrorScope("validation");
      instance.pipeline = await boundedInitialization(device.createRenderPipelineAsync({
        label: "Wavefield instanced soft grid",
        layout: "auto",
        vertex: { module, entryPoint: "vertexMain" },
        fragment: { module, entryPoint: "fragmentMain", targets: [{ format: instance.format, blend: {
          color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        } }] },
        primitive: { topology: "triangle-list", cullMode: "none" },
      }), "GPU pipeline creation");
      const validation = await boundedInitialization(device.popErrorScope(), "GPU validation");
      if (validation) throw new Error(validation.message);
      instance.sampler = await boundedInitialization(device.createComputePipelineAsync({
        label: "Wavefield analytic terrain nodes", layout: "auto", compute: { module: compute, entryPoint: "sampleNodes" },
      }), "GPU sampling pipeline");
      instance.buffer = device.createBuffer({ label: "Wavefield parameters", size: UNIFORM_FLOATS * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      // One maximum-sized shared-node allocation, reused across quality/size changes.
      instance.nodes = device.createBuffer({ label: "Wavefield shared height and slope", size: gpuMeshBudget(0, "reference").nodeCount * 16,
        usage: GPUBufferUsage.STORAGE });
      const entries = [{ binding: 0, resource: { buffer: instance.buffer } }, { binding: 1, resource: { buffer: instance.nodes } }];
      instance.bindGroup = device.createBindGroup({ layout: instance.pipeline.getBindGroupLayout(0), entries });
      instance.sampleGroup = device.createBindGroup({ layout: instance.sampler.getBindGroupLayout(0), entries });
      if (cancelled()) throw new Error("Initialization cancelled.");
      return instance;
    } catch (error) {
      if (instance) instance.dispose(); else device?.destroy();
      throw error;
    }
  }

  private handleError = (event: GPUUncapturedErrorEvent) => {
    event.preventDefault();
    if (!this.disposed) this.onFailure(new GpuFailure("validation error", event.error.message));
  };

  resize(width: number, height: number, dpr: number) {
    if (this.disposed) return;
    const size = gpuViewport(width, height, dpr, this.device.limits.maxTextureDimension2D);
    this.width = size.width; this.height = size.height; this.dpr = size.dpr;
    this.budget = gpuMeshBudget(width);
    if (this.configured && this.canvas.width === size.pixelWidth && this.canvas.height === size.pixelHeight) return;
    this.canvas.width = size.pixelWidth; this.canvas.height = size.pixelHeight;
    this.context.configure({ device: this.device, format: this.format, alphaMode: "premultiplied" });
    this.configured = true;
  }

  get instanceCount() { return this.budget.instanceCount; }

  draw(time: number, settings: TerrainSettings) {
    if (this.disposed || !this.buffer) return 0;
    const started = performance.now();
    this.budget = writeUniforms(this.uniforms, this.width, this.height, this.dpr, time, settings);
    this.device.queue.writeBuffer(this.buffer, 0, this.uniforms);
    const encoder = this.device.createCommandEncoder({ label: "Wavefield frame" });
    const compute = encoder.beginComputePass();
    compute.setPipeline(this.sampler); compute.setBindGroup(0, this.sampleGroup);
    compute.dispatchWorkgroups(Math.ceil(this.budget.nodeCount / 64)); compute.end();
    const pass = encoder.beginRenderPass({ colorAttachments: [{
      view: this.context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: "clear", storeOp: "store",
    }] });
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, this.budget.instanceCount); pass.end();
    this.device.queue.submit([encoder.finish()]);
    // This is CPU encoding/submission duration, never GPU completion time.
    return performance.now() - started;
  }

  simulateDeviceLoss() { if (!this.disposed) this.device.destroy(); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.device.removeEventListener("uncapturederror", this.handleError);
    this.buffer?.destroy(); this.buffer = null;
    this.nodes?.destroy(); this.nodes = null;
    this.context.unconfigure();
    this.device.destroy();
    this.canvas.width = this.canvas.height = 0;
  }
}
