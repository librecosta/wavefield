# Wavefield

Procedural wire terrain for the web, built with React, Motion, TypeScript, and native WebGPU. A [LibreCosta](https://github.com/librecosta) experiment.

V0.3-R1 reconstructs the mathematical behavior of the [Motion article header terrain](https://motion.dev/examples/react-particle-orb), using independently written compute and rendering shaders. Four unequal elliptical Gaussian hills, slow center drift, and three low-amplitude spatial waves produce a continuous height field. Analytic slopes drive localized grazing highlights; Gaussian line profiles, a narrow focus band, and defocus energy compensation give the grid its soft blue appearance.

This is an independent project, not an official Motion example. The public behavior and numeric scene observations are documented in [Issue #2](https://github.com/librecosta/wavefield/issues/2). No third-party shader source, artwork, textures, or image-derived calibration files are bundled. The former Canvas renderer and A/B lab have been removed.

## Run locally

Use **Node.js 24 or newer** and npm. Tests use Node's native TypeScript support.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. To serve a production build locally:

```sh
npm run build
npm run preview
```

Build output is in `dist/`. There are no runtime external services or asset requests.

## Controls and reproducible frames

Open **Controls** or press **D**. The Inspector exposes hill position, amplitude and span; focus depth, defocus, line size, both grid-family alphas and grazing light; field framing and vertical position; playback, exact time, and 12/24 submission limits. **Space** toggles playback, **R** restarts time, and **Escape** closes controls. **Initial frame** restores the preset and pauses at zero.

The default article preset records four hill uniforms and phase for the `react-particle-orb` header, recovered from its public initializer and checked against runtime uniform writes on 2026-10-28. **Scene seed** generates Wavefield variations with a separate deterministic generator; it is not Motion's seed algorithm. **Article reference preset** restores the measured hills and phase.

| URL | Result |
| --- | --- |
| `?inspect=1&still=1&time=8` | Responsive stage, controls open, frozen at 8 seconds |
| `?capture=1&still=1&time=8&quality=reference` | 1891 × 230 CSS pixels, controls hidden, full grid |
| `?capture=1440x576&still=1&time=8&quality=reference` | Matching desktop QA frame |
| `?capture=390x422&still=1&time=0&quality=reference` | Matching small-screen QA frame |

Ordinary pages use a responsive stage, with horizontal cropping that preserves terrain depth on small screens. Capture mode is independent and can overflow a narrow window. Time zero shows settled geometry by default; enable **Entrance fade** to reproduce the initial 1.2-second reveal. Reduced motion always uses a settled static frame.

## Rendering and lifecycle

One compute pass samples shared heights and slopes, then one render pass draws two grid edges per cell as six-vertex instanced ribbons. Reference quality uses **192 × 112 cells / 43,008 segments**. Adaptive quality uses **128 × 96 / 24,576** below 560 CSS pixels; both families remain complete. There is no depth attachment. Transparent clear, premultiplied output and blending allow compositing over the page background.

Motion schedules callbacks. Actual GPU submissions are capped at **24/s by default**, separately from elapsed animation time. RAF cadence and load can produce a lower rate. Pausing, reduced motion, a hidden document, or an offscreen canvas stop continuous drawing and time advancement. Static parameter or size changes request one capped redraw. Returning excludes the inactive interval. GPU initialization also suspends the clock.

Diagnostics report actual submissions, average synchronous **CPU encoding/submission** cost, frame count, dimensions, DPR, and segment count. **GPU execution time is not measured.** DPR is capped at 1.5 and backing dimensions respect device texture limits. Pipelines and buffers are reused across frames.

Unsupported WebGPU, initialization failure/timeout, uncaptured validation errors, and device loss show a static CSS brand background with a reason and an explicit retry button. There is no retry loop. Cancelled initialization cannot replace a newer session; late devices, buffers, contexts, listeners and observers are cleaned up. **Test device loss** exercises this path on the active device.

## Compatibility and visual scope

Requires an enabled WebGPU implementation, an available adapter, and a secure context (HTTPS or localhost), plus modern ES modules, `ResizeObserver`, `IntersectionObserver`, and CSS viewport units. Browser and driver support vary; the static fallback remains available when GPU startup fails.

Hardware compilation and visual checks were performed in the local Chromium-based browser on an AMD GCN-5 non-fallback adapter. Static header comparisons cover 1891 × 230, 1440 × 576 and 390-pixel-wide frames. This is not a cross-browser or physical mobile-device certification. Pixel coverage, subpixel joins and floating-point evaluation can differ; no cross-browser pixel-identical claim is made. The original historical screenshots' exact elapsed times remain unknown. See the Issue discussion for measured comparisons and remaining differences.

## Development

```sh
npm run typecheck
npm test
npm run check
```

`check` runs type checking, tests and the production build. Tests cover analytic slopes, continuity, projection, focus/energy behavior, mesh budgets, uniform packing, scheduling, initialization failures, cancellation, loss and cleanup. GPU contract doubles do not establish WGSL compilation or visual quality; those require a real browser.

The rendering path is small: `gpu-terrain.ts` defines scene parameters and the CPU oracle; `gpu-shaders.ts` implements shared-node sampling and ribbons; `gpu-renderer.ts` owns GPU resources. `renderer-session.ts` guards asynchronous ownership, `clock.ts` separates time from submissions, and `WaveField.tsx` connects browser visibility and Motion scheduling. React manages controls and low-frequency diagnostics.

## License

Copyright © 2026 LibreCosta. Released under [BSD-3-Clause](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) and installed dependency licenses. React and Motion are dependencies, not copied example implementations.
