import test from "node:test";
import assert from "node:assert/strict";
import { MembraneGeometry } from "../src/wave/geometry.ts";
import { Camera } from "../src/wave/camera.ts";
import { FrameClock } from "../src/wave/clock.ts";
import { WaveRenderer } from "../src/wave/renderer.ts";
import { DEFAULT_SETTINGS, LOOP_SECONDS, SURFACE_LENGTH, heightAt } from "../src/wave/surface.ts";

const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test("compiled world geometry matches the continuous surface and stays finite", () => {
  const mesh = new MembraneGeometry();
  for (const time of [0, 3.2, 11, 24, LOOP_SECONDS]) {
    for (const height of [0, 1, 1.6]) {
      mesh.update(time, height, 4.8, 0.035);
      for (let row = 0; row <= mesh.rows; row += 3) {
        for (let col = 0; col <= mesh.columns; col += 3) {
          const i = mesh.index(row, col) * 3;
          close(mesh.positions[i + 1], heightAt(col / mesh.columns, row / mesh.rows, time, height));
          for (let axis = 0; axis < 3; axis++) {
            assert.ok(Number.isFinite(mesh.positions[i + axis]));
            assert.ok(Number.isFinite(mesh.normals[i + axis]));
            assert.ok(Number.isFinite(mesh.lower[i + axis]));
          }
        }
      }
    }
  }
});

test("zero wave height is a flat 3D plane with positive depth, not a screen curve", () => {
  const mesh = new MembraneGeometry();
  mesh.update(0, 0, 6, 0);
  const initial = mesh.positions.slice();
  mesh.update(17, 0, 6, 0);
  assert.deepEqual(mesh.positions, initial);
  for (let i = 0; i < mesh.count * 3; i += 3) {
    assert.equal(mesh.positions[i + 1], 0);
    close(mesh.normals[i], 0); close(mesh.normals[i + 1], 1); close(mesh.normals[i + 2], 0);
  }
  close(mesh.positions[2], -3);
  close(mesh.positions[mesh.index(mesh.rows, 0) * 3 + 2], 3);
  assert.deepEqual(mesh.lower, mesh.positions);
});

test("analytic unit normals agree with finite-difference tangents and point upwards", () => {
  const mesh = new MembraneGeometry();
  const epsilon = 1e-5, time = 7, depth = 4.8, height = 1.6;
  mesh.update(time, height, depth, 0.1);
  for (let row = 0; row <= mesh.rows; row += 4) {
    for (let col = 0; col <= mesh.columns; col += 8) {
      const u = col / mesh.columns, v = row / mesh.rows, i = mesh.index(row, col) * 3;
      const hu = (heightAt(u + epsilon, v, time, height) - heightAt(u - epsilon, v, time, height)) / (2 * epsilon);
      const hv = (heightAt(u, v + epsilon, time, height) - heightAt(u, v - epsilon, time, height)) / (2 * epsilon);
      const nx = mesh.normals[i], ny = mesh.normals[i + 1], nz = mesh.normals[i + 2];
      close(Math.hypot(nx, ny, nz), 1);
      close(nx * SURFACE_LENGTH + ny * hu, 0, 2e-6);
      close(ny * hv + nz * depth, 0, 2e-6);
      assert.ok(ny > 0);
      const before = heightAt(u, v, time - epsilon, height);
      const after = heightAt(u, v, time + epsilon, height);
      assert.ok(Math.abs(after - before) < 0.0001);
    }
  }
});

test("thickness is a normal offset; zero thickness degenerates exactly", () => {
  const mesh = new MembraneGeometry(0.5), thickness = 0.08;
  mesh.update(4, 1, 4.8, thickness);
  for (let i = 0; i < mesh.count * 3; i += 3) {
    let squared = 0;
    for (let axis = 0; axis < 3; axis++) {
      const offset = mesh.positions[i + axis] - mesh.lower[i + axis];
      close(offset, thickness * mesh.normals[i + axis]);
      squared += offset * offset;
    }
    close(Math.sqrt(squared), thickness);
  }
  mesh.update(4, 1, 4.8, 0);
  assert.deepEqual(mesh.positions, mesh.lower);
});

test("density changes resolution without changing the world-space surface", () => {
  const mesh = new MembraneGeometry();
  mesh.update(0, 1, 4.8, 0.035);
  const dense = new MembraneGeometry(1.5);
  dense.update(0, 1, 4.8, 0.035);
  assert.ok(dense.count > mesh.count);
  for (const u of [0, 0.25, 0.5, 0.75, 1]) for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    const a = mesh.index(v * mesh.rows, u * mesh.columns) * 3;
    const b = dense.index(v * dense.rows, u * dense.columns) * 3;
    assert.deepEqual(mesh.positions.slice(a, a + 3), dense.positions.slice(b, b + 3));
    assert.deepEqual(mesh.normals.slice(a, a + 3), dense.normals.slice(b, b + 3));
  }
});

test("surface position, normal and velocity close continuously over the loop", () => {
  const mesh = new MembraneGeometry(0.5), epsilon = 1e-5;
  mesh.update(0, 1.6, 4.8, 0.1);
  const positions = mesh.positions.slice(), normals = mesh.normals.slice();
  mesh.update(LOOP_SECONDS, 1.6, 4.8, 0.1);
  assert.deepEqual(mesh.positions, positions);
  assert.deepEqual(mesh.normals, normals);
  for (const u of [0, 0.2, 0.5, 1]) for (const v of [0, 0.4, 1]) {
    const y = time => heightAt(u, v, time, 1.6);
    close((y(LOOP_SECONDS) - y(LOOP_SECONDS - epsilon)) / epsilon,
      (y(epsilon) - y(0)) / epsilon, 1e-5);
  }
});

function project(settings = DEFAULT_SETTINGS, width = 960, height = 384, waveHeight = 0) {
  const mesh = new MembraneGeometry(0.5), camera = new Camera();
  mesh.update(0, waveHeight, settings.surfaceDepth, settings.thickness);
  camera.configure(width, height, settings);
  const view = new Float32Array(mesh.count * 3), screen = new Float32Array(mesh.count * 2);
  camera.project(mesh.positions, view, screen);
  return { mesh, camera, view, screen };
}

test("orthographic camera has verified front/back ordering and horizontal monotonicity", () => {
  const { mesh, screen, view } = project();
  const far = mesh.index(0, 0), near = mesh.index(mesh.rows, 0);
  assert.ok(screen[near * 2 + 1] > screen[far * 2 + 1], "near edge must appear lower");
  assert.ok(view[near * 3 + 2] > view[far * 3 + 2], "near edge is closer to camera");
  for (let col = 0; col < mesh.columns; col++) {
    assert.ok(screen[(col + 1) * 2] > screen[col * 2]);
    close(screen[col * 2], screen[mesh.index(mesh.rows, col) * 2]);
  }
  assert.deepEqual(project().screen, screen);
});

test("Tilt and Depth change plane span, Zoom scales both axes, vertical position translates", () => {
  const base = project(), first = 0, last = base.mesh.index(base.mesh.rows, 0) * 2 + 1;
  const span = result => result.screen[last] - result.screen[first + 1];
  assert.ok(span(project({ ...DEFAULT_SETTINGS, cameraTilt: 32 })) > span(base) * 1.5);
  assert.ok(span(project({ ...DEFAULT_SETTINGS, surfaceDepth: 8 })) > span(base) * 1.5);
  const zoom = project({ ...DEFAULT_SETTINGS, cameraZoom: 1.3 });
  close(span(zoom) / span(base), 1.3);
  close((zoom.screen[2] - zoom.screen[0]) / (base.screen[2] - base.screen[0]), 1.3, 1e-4);
  const shifted = project({ ...DEFAULT_SETTINGS, verticalPosition: 0.2 });
  close(shifted.screen[1] - base.screen[1], (0.2 - DEFAULT_SETTINGS.verticalPosition) * 384, 1e-4);
  close(shifted.screen[0], base.screen[0]);
});

test("responsive camera preserves readable depth, isotropic scale and fixed QA reproducibility", () => {
  for (const [width, height] of [[1440, 576], [960, 384], [390, 422], [1891, 230]]) {
    const { mesh, screen, camera } = project(DEFAULT_SETTINGS, width, height);
    const planeSpan = screen[mesh.index(mesh.rows, 0) * 2 + 1] - screen[1];
    assert.ok(planeSpan > (width === 390 ? 100 : 70), `flat plane is too thin at ${width}px: ${planeSpan}`);
    const a = new Float32Array(3), b = new Float32Array(3), points = new Float32Array(4);
    camera.worldToView(0, 0, 0, a);
    camera.worldToView(1, 0, 0, b);
    camera.viewToScreen(a[0], a[1], points, 0);
    camera.viewToScreen(b[0], b[1], points, 2);
    close(points[2] - points[0], camera.scale, 1e-4);
  }
});

test("default QA camera contains the complete upper and lower membrane through the loop", () => {
  const mesh = new MembraneGeometry(), camera = new Camera();
  camera.configure(1891, 230, DEFAULT_SETTINGS);
  const view = new Float32Array(mesh.count * 3), screen = new Float32Array(mesh.count * 2);
  for (let time = 0; time < LOOP_SECONDS; time += 2) {
    mesh.update(time, 1, 4.8, 0.035);
    for (const positions of [mesh.positions, mesh.lower]) {
      camera.project(positions, view, screen);
      for (let node = 0; node < mesh.count; node++) {
        assert.ok(screen[node * 2] > 0 && screen[node * 2] < 1891);
        assert.ok(screen[node * 2 + 1] > 0 && screen[node * 2 + 1] < 230,
          `default QA frame clips at t=${time}, node=${node}`);
      }
    }
  }
});

test("actual draw caps hold at high RAF rates, including dirty paused updates", () => {
  for (const limit of [12, 24, 30]) for (const hz of [60, 120, 240]) {
    const clock = new FrameClock(), times = [];
    for (let frame = 0; frame < hz * 4; frame++) {
      const now = frame * 1000 / hz;
      if (clock.step(now, 1, true, true, limit)) times.push(now);
    }
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] + 1e-6 >= 1000 / limit);
    assert.ok(times.length <= limit * 4);
    close(clock.elapsed, (hz * 4 - 1) / hz);
  }
  const clock = new FrameClock();
  assert.equal(clock.step(0, 1, false, true, 24), true);
  for (let now = 1; now < 42; now++) {
    clock.invalidate();
    assert.equal(clock.step(now, 1, false, true, 24), false);
  }
  assert.equal(clock.step(42, 1, false, true, 24), true);
  assert.equal(clock.step(1000, 1, false, true, 24), false);
});

test("clock time is independent of draw cap and excludes pause / hidden / offscreen time", () => {
  const clock = new FrameClock(8);
  clock.step(0, 0.7, true, true, 12);
  clock.step(16, 0.7, true, true, 12);
  clock.step(1016, 0.7, true, true, 12);
  close(clock.elapsed, 8 + 1.016 * 0.7);
  const before = clock.elapsed;
  clock.suspend();
  assert.equal(clock.step(10000, 1, true, false, 24), false);
  clock.step(20000, 1, true, true, 24);
  close(clock.elapsed, before);
  clock.step(21000, 1, true, true, 24);
  close(clock.elapsed, before + 1);
  clock.step(22000, 1, false, true, 24);
  assert.equal(clock.step(24000, 1, false, true, 24), false);
  close(clock.elapsed, before + 1);
  clock.reset();
  close(clock.elapsed, 0);
  assert.equal(clock.step(30000, 1, false, true, 24), true);
  assert.equal(clock.step(31000, 1, false, true, 24), false);
});

test("renderer shares grid intersections, preserves CSS drawing at DPR 1/2, and releases canvases", () => {
  const canvases = [];
  const makeCanvas = () => {
    const commands = [], transforms = [], widths = [], strokes = [];
    let path = [];
    const context = {
      commands, transforms, widths, strokes,
      setTransform: (...args) => transforms.push(args),
      createLinearGradient: () => ({ stops: [], addColorStop(at, color) { this.stops.push([at, color]); } }),
      clearRect() {}, fillRect() {}, closePath() {}, fill() {}, drawImage() {},
      beginPath() { path = []; },
      stroke() { strokes.push({ style: this.strokeStyle, path: [...path] }); },
      moveTo(x, y) { commands.push(["move", x, y]); path.push([x, y]); },
      lineTo(x, y) { commands.push(["line", x, y]); path.push([x, y]); },
      set lineWidth(value) { widths.push(value); },
    };
    const canvas = { width: 0, height: 0, getContext: () => context, context };
    canvases.push(canvas);
    return canvas;
  };
  const previous = globalThis.document;
  globalThis.document = { createElement: makeCanvas };
  try {
    const canvas = makeCanvas(), renderer = new WaveRenderer(canvas);
    renderer.resize(960, 384, 1);
    renderer.draw(8, DEFAULT_SETTINGS);
    const commands = [...canvas.context.commands], widths = [...canvas.context.widths];
    const mesh = new MembraneGeometry(), camera = new Camera();
    mesh.update(8, 1, 4.8, 0.035);
    camera.configure(960, 384, DEFAULT_SETTINGS);
    const view = new Float32Array(mesh.count * 3), screen = new Float32Array(mesh.count * 2);
    camera.project(mesh.positions, view, screen);
    const node = mesh.index(12, 64), x = screen[node * 2], y = screen[node * 2 + 1];
    const containsNode = stroke => stroke.path.some(point => point[0] === x && point[1] === y);
    const color = stroke => typeof stroke.style === "object" ? stroke.style.stops[0][1] : "";
    assert.ok(canvas.context.strokes.some(stroke => color(stroke).startsWith("rgba(") &&
      !color(stroke).startsWith("rgba(60,115,154,") && containsNode(stroke)));
    assert.ok(canvas.context.strokes.some(stroke => color(stroke).startsWith("rgba(60,115,154,") && containsNode(stroke)));
    assert.equal(canvas.width, 960); assert.equal(canvas.height, 384);
    canvas.context.commands.length = canvas.context.widths.length = 0;
    renderer.resize(960, 384, 2);
    renderer.draw(8, DEFAULT_SETTINGS);
    assert.equal(canvas.width, 1920); assert.equal(canvas.height, 768);
    assert.deepEqual(canvas.context.transforms.at(-1), [2, 0, 0, 2, 0, 0]);
    assert.deepEqual(canvas.context.commands, commands);
    assert.deepEqual(canvas.context.widths, widths);
    assert.ok(commands.every(([, x, y]) => Number.isFinite(x) && Number.isFinite(y)));
    renderer.resize(960, 384, 3);
    assert.equal(renderer.dpr, 2);
    renderer.dispose();
    assert.ok(canvases.every(item => item.width === 0 && item.height === 0));
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
