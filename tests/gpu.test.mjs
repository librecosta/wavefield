import test from "node:test";
import assert from "node:assert/strict";
import { FrameClock } from "../src/wave/clock.ts";
import { RendererSession, boundedInitialization } from "../src/wave/renderer-session.ts";
import { GpuRenderer } from "../src/wave/gpu-renderer.ts";
import { DEFAULT_GPU_SETTINGS, TERRAIN_PERIOD, createTerrainLobes,
  terrainHeight, gpuMeshBudget, gpuViewport } from "../src/wave/gpu-terrain.ts";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test("original seeded terrain has nonuniform broad forms, finite smooth heights and a flat relief limit", () => {
  const lobes = createTerrainLobes();
  assert.deepEqual(lobes, createTerrainLobes());
  assert.notDeepEqual(lobes, createTerrainLobes(123));
  assert.equal(new Set(lobes.map(lobe => lobe.width)).size, 3);
  assert.equal(new Set(lobes.map(lobe => lobe.amplitude)).size, 3);
  let minimum = Infinity, maximum = -Infinity;
  for (let row = 0; row <= 20; row++) for (let col = 0; col <= 100; col++) {
    const u = col / 100, v = row / 20;
    for (const time of [0, 8, 19, 36, 48]) {
      const height = terrainHeight(u, v, time);
      assert.ok(Number.isFinite(height));
      assert.ok(Math.abs(terrainHeight(u + 1e-4, v, time) - height) < 0.002);
      assert.ok(Math.abs(terrainHeight(u, v + 1e-4, time) - height) < 0.002);
      close(terrainHeight(u, v, time, 0), 0);
      minimum = Math.min(minimum, height); maximum = Math.max(maximum, height);
    }
  }
  assert.ok(maximum - minimum > 0.5 && maximum - minimum < 1.4);
});

test("terrain loop preserves positions and velocities, with small continuous animation steps", () => {
  const dt = 1e-4;
  for (const [u, v] of [[0.1, 0.2], [0.5, 0.6], [0.83, 0.9]]) {
    close(terrainHeight(u, v, 0), terrainHeight(u, v, TERRAIN_PERIOD));
    const before = (terrainHeight(u, v, TERRAIN_PERIOD) - terrainHeight(u, v, TERRAIN_PERIOD - dt)) / dt;
    const after = (terrainHeight(u, v, dt) - terrainHeight(u, v, 0)) / dt;
    close(before, after, 1e-5);
    assert.ok(Math.abs(terrainHeight(u, v, 8 + 1 / 24) - terrainHeight(u, v, 8)) < 0.003);
  }
});

test("GPU mesh has a bounded responsive segment budget and texture sizing obeys DPR/device limits", () => {
  const narrow = gpuMeshBudget(390), desktop = gpuMeshBudget(1440);
  assert.ok(narrow.instanceCount < desktop.instanceCount && desktop.instanceCount < 10000);
  for (const width of [390, 960, 1440, 1891]) {
    const mesh = gpuMeshBudget(width);
    assert.equal(mesh.columns % mesh.crossStep, 0);
    assert.equal(mesh.mainCount, mesh.columns * (mesh.rows + 1));
    const size = gpuViewport(width, 576, 3, 8192);
    assert.equal(size.dpr, 1.5);
    assert.equal(size.pixelWidth, Math.round(width * 1.5));
    assert.ok(size.verticalScale >= 90 && size.verticalScale <= 172.8);
  }
  const limited = gpuViewport(20000, 600, 2, 4096);
  assert.equal(limited.pixelWidth, 4096);
  assert.ok(limited.pixelHeight <= 4096 && limited.dpr < 1);
  const empty = gpuViewport(0, 0, 0, 8192);
  assert.equal(empty.pixelWidth, 1); assert.equal(empty.pixelHeight, 1);
  const qa = gpuViewport(1891, 230, 1, 8192);
  // Fixed-height QA must retain depth instead of compressing rows into a blur band.
  assert.ok(qa.verticalScale > 100 && qa.verticalScale < 130);
});

test("cancelled sessions dispose late candidates and suppress stale ready/error callbacks", async () => {
  let disposed = 0, ready = 0, errors = 0;
  const candidate = deferred();
  const session = new RendererSession(() => errors++);
  const task = session.load(() => candidate.promise, () => ready++);
  session.dispose(); session.dispose();
  candidate.resolve({ dispose: () => disposed++ }); await task;
  assert.deepEqual([disposed, ready, errors], [1, 0, 0]);
  const rejection = deferred(), stale = new RendererSession(() => errors++);
  const staleTask = stale.load(() => rejection.promise, () => ready++);
  stale.dispose(); rejection.reject(new Error("late failure")); await staleTask;
  assert.equal(errors, 0);
});

test("session failure disposes exactly once and a timeout destroys a late device", async () => {
  let disposed = 0, errors = 0;
  const session = new RendererSession(() => errors++);
  await session.load(async () => ({ dispose: () => disposed++ }), () => {});
  session.fail(new Error("lost")); session.fail(new Error("again")); session.dispose();
  assert.deepEqual([disposed, errors], [1, 1]);
  const late = deferred();
  const bounded = boundedInitialization(late.promise, "Test adapter", 5, value => value.destroy());
  await assert.rejects(bounded, /timed out/);
  let destroyed = 0; late.resolve({ destroy: () => destroyed++ });
  await Promise.resolve();
  assert.equal(destroyed, 1);
});

// These doubles verify ownership, submission and blending contracts, not GPU visual quality.
// Actual WGSL compilation and image review are performed in a hardware-backed browser.
function fixture(options = {}) {
  const lost = deferred(), events = new Map();
  const calls = { destroyed: 0, bufferDestroyed: 0, unconfigured: 0, submitted: 0,
    requests: 0, pipelines: 0, buffers: 0 };
  const device = {
    limits: { maxTextureDimension2D: 4096 }, lost: lost.promise,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: name => events.delete(name),
    destroy: () => { calls.destroyed++; lost.resolve({ message: "Test device destroyed" }); },
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: options.messages || [] }) }),
    pushErrorScope: () => {}, popErrorScope: async () => options.validation || null,
    createRenderPipelineAsync: async descriptor => {
      calls.pipelines++;
      calls.pipeline = descriptor;
      if (options.pipelineFailure) throw new Error("Test pipeline failed");
      return { getBindGroupLayout: () => ({}) };
    },
    createBuffer: () => { calls.buffers++; return { destroy: () => calls.bufferDestroyed++ }; },
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginRenderPass: descriptor => {
        calls.pass = descriptor;
        return { setPipeline: () => {}, setBindGroup: () => {},
          draw: (...args) => { calls.draw = args; }, end: () => {} };
      }, finish: () => ({}),
    }),
    queue: { writeBuffer: (_buffer, _offset, uniforms) => { calls.uniforms = [...uniforms]; },
      submit: () => calls.submitted++ },
  };
  const context = { configure: config => { calls.config = config; }, unconfigure: () => calls.unconfigured++,
    getCurrentTexture: () => ({ createView: () => ({}) }) };
  const canvas = { width: 0, height: 0, getContext: type => {
    assert.equal(type, "webgpu"); return options.noContext ? null : context;
  } };
  const adapter = { info: { vendor: "test", architecture: "fixture", isFallbackAdapter: true },
    requestDevice: async () => {
      calls.requests++;
      if (options.deviceFailure) throw new Error("Test device denied");
      return options.devicePromise || device;
    } };
  const platform = { secure: options.secure !== false, gpu: options.unsupported ? undefined : {
    requestAdapter: async () => options.noAdapter ? null : adapter,
    getPreferredCanvasFormat: () => "bgra8unorm",
  } };
  return { canvas, device, calls, events, platform };
}
globalThis.GPUBufferUsage = { UNIFORM: 64, COPY_DST: 8 };

test("GPU draws transparent instanced quads with premultiplied blending and releases owned resources", async () => {
  const f = fixture(); let failures = 0;
  const renderer = await GpuRenderer.create(f.canvas, () => failures++, () => false, f.platform);
  renderer.resize(1440, 576, 2);
  const time = renderer.draw(56, DEFAULT_GPU_SETTINGS);
  assert.ok(Number.isFinite(time) && time >= 0);
  assert.equal(f.canvas.width, 2160); assert.equal(f.canvas.height, 864);
  assert.equal(f.calls.config.alphaMode, "premultiplied");
  assert.equal(f.calls.pipeline.primitive.topology, "triangle-list");
  assert.equal(f.calls.pipeline.depthStencil, undefined);
  assert.deepEqual(f.calls.pipeline.fragment.targets[0].blend.color,
    { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" });
  assert.deepEqual(f.calls.pass.colorAttachments[0].clearValue, { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(f.calls.pass.depthStencilAttachment, undefined);
  assert.deepEqual(f.calls.draw, [6, renderer.instanceCount]);
  assert.equal(f.calls.submitted, 1); assert.equal(f.calls.uniforms[2], 8);
  renderer.dispose(); renderer.dispose(); renderer.draw(9, DEFAULT_GPU_SETTINGS);
  await Promise.resolve();
  assert.deepEqual([f.calls.destroyed, f.calls.bufferDestroyed, f.calls.unconfigured, failures], [1, 1, 1, 0]);
  assert.equal(f.events.size, 0); assert.equal(f.calls.submitted, 1);
  assert.equal(f.canvas.width, 0); assert.equal(f.canvas.height, 0);
});

test("unsupported, insecure and null-adapter paths do not request a device", async () => {
  for (const options of [{ unsupported: true }, { secure: false }, { noAdapter: true }]) {
    const f = fixture(options);
    await assert.rejects(GpuRenderer.create(f.canvas, () => {}, () => false, f.platform),
      error => error.reason === "unsupported");
    assert.equal(f.calls.requests, 0);
  }
});

test("device rejection and context failure leave no owned device or buffer behind", async () => {
  const denied = fixture({ deviceFailure: true });
  await assert.rejects(GpuRenderer.create(denied.canvas, () => {}, () => false, denied.platform), /denied/);
  assert.equal(denied.calls.destroyed, 0); assert.equal(denied.calls.buffers, 0);
  const context = fixture({ noContext: true });
  await assert.rejects(GpuRenderer.create(context.canvas, () => {}, () => false, context.platform), /context/);
  assert.equal(context.calls.destroyed, 1); assert.equal(context.calls.buffers, 0);
});

test("resize changes backing size and instance budget while frames reuse the pipeline and buffer", async () => {
  const f = fixture();
  const renderer = await GpuRenderer.create(f.canvas, () => {}, () => false, f.platform);
  renderer.resize(1440, 576, 1);
  const desktopInstances = renderer.instanceCount;
  renderer.draw(8, DEFAULT_GPU_SETTINGS);
  renderer.resize(390, 422, 2);
  renderer.draw(8.1, DEFAULT_GPU_SETTINGS); renderer.draw(8.2, DEFAULT_GPU_SETTINGS);
  assert.ok(renderer.instanceCount < desktopInstances);
  assert.deepEqual([f.canvas.width, f.canvas.height], [585, 633]);
  assert.deepEqual(f.calls.draw, [6, renderer.instanceCount]);
  assert.deepEqual([f.calls.pipelines, f.calls.buffers, f.calls.submitted], [1, 1, 3]);
  renderer.dispose();
});

test("WGSL/pipeline validation failures clean up the partial renderer", async () => {
  for (const options of [{ messages: [{ type: "error", lineNum: 1, linePos: 2, message: "Test shader failed" }] },
    { pipelineFailure: true }, { validation: { message: "Test validation failed" } }]) {
    const f = fixture(options);
    await assert.rejects(GpuRenderer.create(f.canvas, () => {}, () => false, f.platform), /Test/);
    assert.equal(f.calls.destroyed, 1); assert.equal(f.calls.unconfigured, 1);
    assert.equal(f.events.size, 0);
  }
});

test("a device arriving after a backend switch is destroyed before context creation", async () => {
  const pending = deferred(), f = fixture({ devicePromise: pending.promise });
  let cancelled = false;
  const creation = GpuRenderer.create(f.canvas, () => {}, () => cancelled, f.platform);
  await Promise.resolve(); await Promise.resolve();
  cancelled = true; pending.resolve(f.device);
  await assert.rejects(creation, /cancelled/);
  assert.equal(f.calls.destroyed, 1); assert.equal(f.calls.unconfigured, 0);
});

test("device loss and uncaptured validation errors reach the active session once", async () => {
  for (const loseDevice of [true, false]) {
    const f = fixture(); let errors = 0;
    const session = new RendererSession(() => errors++);
    let renderer;
    await session.load(() => GpuRenderer.create(f.canvas, error => session.fail(error), () => session.cancelled, f.platform),
      value => { renderer = value; });
    if (loseDevice) renderer.simulateDeviceLoss();
    else f.events.get("uncapturederror")({ preventDefault: () => {}, error: { message: "Test validation" } });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(errors, 1); assert.equal(session.cancelled, true);
    assert.equal(f.calls.bufferDestroyed, 1); assert.equal(f.events.size, 0);
    session.dispose(); assert.equal(errors, 1);
  }
});

test("one clock preserves a frozen seek through backend suspension and caps actual submissions", () => {
  const clock = new FrameClock(0);
  clock.seek(8);
  assert.equal(clock.step(0, 0.7, false, true, 24), true);
  for (let switchIndex = 1; switchIndex <= 12; switchIndex++) {
    clock.suspend(); clock.invalidate();
    assert.equal(clock.step(switchIndex * 100, 0.7, false, true, 24), true);
    assert.equal(clock.elapsed, 8);
    assert.equal(clock.step(switchIndex * 100 + 50, 0.7, false, true, 24), false);
  }
  let draws = 0;
  for (let frame = 0; frame <= 1440; frame++) {
    if (clock.step(2000 + frame * 1000 / 144, 1, true, true, 24)) draws++;
  }
  assert.ok(draws <= 241 && draws >= 239);
  close(clock.elapsed, 18);
});
