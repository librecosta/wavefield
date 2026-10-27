import test from "node:test";
import assert from "node:assert/strict";
import { ProjectedRow } from "../src/wave/geometry.ts";
import { LOOP_SECONDS, surfaceY } from "../src/wave/surface.ts";

test("compiled geometry preserves the exact moving surface within 0.15 pixels", () => {
  let maximumError = 0;
  for (const depth of [0, 0.1, 0.22, 0.43, 0.53, 0.72, 0.985, 1]) {
    const row = new ProjectedRow(depth, 318);
    for (const time of [0, 3.2, 11, 24, LOOP_SECONDS]) {
      for (const amplitude of [0, 1, 2]) {
        row.update(time, amplitude);
        for (let index = 0; index <= row.samples; index++) {
          const exact = surfaceY(row.xs[index], depth, time, amplitude);
          maximumError = Math.max(
            maximumError,
            Math.abs(row.ys[index] - exact),
          );
          assert.ok(
            Number.isFinite(row.ys[index]),
            "geometry must stay finite at canvas edges",
          );
        }
      }
    }
  }
  assert.ok(maximumError < 0.15, `lookup error was ${maximumError}px`);
});

test("the loop closes with continuous position and velocity", () => {
  const epsilon = 0.00001;
  for (const depth of [0, 0.22, 0.53, 0.72, 1]) {
    for (const x of [0, 200, 500, 950, 1400, 1891]) {
      const y = (time) => surfaceY(x, depth, time, 2);
      assert.ok(Math.abs(y(0) - y(LOOP_SECONDS)) < 1e-9);
      const before = (y(LOOP_SECONDS) - y(LOOP_SECONDS - epsilon)) / epsilon;
      const after = (y(epsilon) - y(0)) / epsilon;
      assert.ok(Math.abs(before - after) < 0.001);
    }
  }
});

test("zero amplitude freezes geometry without changing the initial surface", () => {
  for (const depth of [0.1, 0.53, 0.9]) {
    for (const x of [100, 900, 1700]) {
      assert.equal(surfaceY(x, depth, 17, 0), surfaceY(x, depth, 0, 0));
      assert.equal(surfaceY(x, depth, 0, 2), surfaceY(x, depth, 0, 0));
    }
  }
});
