# Wavefield

Interactive procedural wave visuals for the web, built with React, Motion, and Canvas 2D.

A [LibreCosta](https://github.com/librecosta) experiment with two independent renderers on one responsive stage: the **V0.2 Canvas 2D membrane** and the **V0.3 native WebGPU wire terrain**. Both are mathematical, with no image textures, backend, external services, Three.js, or rendering framework.

## Renderers

**Canvas 2D is the default.** Its continuous world-space membrane, analytic normals, normal-offset underside, shared grid, orthographic camera, translucent film, and thin near edge remain available. Geometry, Camera, and Material controls retain their V0.2 behavior. Setting Wave Height to zero produces a flat plane with depth; Thickness zero removes the side ribbon. Narrow views crop the long axis to preserve readable depth.

**WebGPU initializes only when selected.** An original seeded height field combines unequal, asymmetric broad forms, depth envelopes, and small ripples. Instanced triangle quads draw continuous grid segments with Gaussian cross-sections, depth-dependent defocus, restrained cross-lines, and local normal-based grazing highlights. This is an art-directed height-field projection, not a general 3D renderer.

The GPU canvas clears to transparent black. Its fragment output and blend state both use premultiplied alpha, so the terrain can be composited over a future hero background. The page supplies the dark background. No depth buffer, image assets, or per-frame CPU geometry upload is used.

This is an independent experiment, not a pixel-for-pixel recreation of reference artwork. Motion's public visuals inform the general blue-grid art direction. No Motion WGSL, proprietary scene constants, reference artwork, traced contours, or image-derived calibration data is included.

## Run locally

Use **Node.js 24 or newer** and npm. Tests use Node's native TypeScript support.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To serve the static production build locally:

```sh
npm run build
npm run preview
```

Build output is in `dist/`.

## A/B controls

Open **Controls** or press **D**. Select **Canvas 2D · V0.2** or **WebGPU · V0.3**. Each backend keeps its own geometry/material settings; both share the animation clock, speed, play state, and frame limit. Switching does not restart time. GPU startup temporarily suspends the shared clock rather than catching up after initialization.

| Controls | Purpose |
| --- | --- |
| Canvas Geometry | Wave Height, Surface Depth, Thickness |
| Canvas Camera | Tilt, Zoom, Vertical Position |
| Canvas Material | Grid Density, Surface Opacity, Rim Light, Glow, Brightness |
| GPU terrain & material | Terrain Relief, Focus Depth (0 far, 1 near), Defocus, Grid Contrast, Rim Light, Opacity |
| Animation | Speed, frame limit (12/24/30), play/pause, restart, reset |
| Freeze at time | Pause and seek to an exact number of animation seconds for A/B comparison |
| Test device loss | Destroy the active GPU device to exercise real Canvas fallback |

Space toggles playback; **R** restarts the clock; **Escape** closes controls. **Initial Frame** pauses and resets both parameter sets and time. **Reset** restores both defaults and resumes, unless reduced motion is enabled.

Motion schedules frames. Actual Canvas draws or GPU submissions are limited to **24/s by default**, independently of elapsed time. The cap is a maximum, not a promised frame rate: RAF cadence and device load may yield fewer frames. Paused settings/size changes draw once, subject to that cap. Hidden and offscreen views stop drawing and advancing time; returning excludes the inactive interval. Reduced motion keeps playback paused while allowing static parameter edits.

Diagnostics show actual backend draws/submissions per second, average **synchronous CPU** drawing or encoding/submission milliseconds, backend frame count, dimensions, effective DPR, and GPU segment instances. They update about once per second. **GPU completion time is not measured.** Both lab backends use the same DPR cap of **1.5**; the preserved standalone V0.2 Canvas renderer still supports DPR 2. GPU backing dimensions additionally obey device texture limits. Narrow screens use fewer GPU segments.

Optional query parameters:

- `?inspect=1` opens controls.
- `?still=1&time=8` freezes the Canvas view at eight animation seconds.
- `?backend=gpu&still=1&time=8` requests the GPU view at the same time, with normal fallback handling.
- Add `&capture=1` for the independent **1891 × 230 CSS-pixel** QA view. It may overflow narrow windows and hides controls. Ordinary pages use responsive hero framing.

## Compatibility and fallback

Canvas requires modern ES modules, Canvas 2D (including `filter` for blur), `ResizeObserver`, `IntersectionObserver`, and modern CSS viewport units. WebGPU additionally requires an enabled browser implementation, an available adapter, and a [secure context such as HTTPS or localhost](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure).

Unsupported browsers, a missing adapter, initialization timeout/failure, uncaptured validation errors, and device loss automatically return to Canvas, preserving time and playback. The Inspector reports the reason. GPU is retried only by selecting it again. Backend changes replace the canvas element; a single element never acquires both context types. Cancelled startups cannot overwrite a newer renderer, and late devices are destroyed. Each renderer releases its own buffers, context, device, listeners, and observers.

Hardware WebGPU was visually checked in the local Chromium-based browser on an AMD GCN-5 non-fallback adapter at 1440, 960, and 390 CSS pixels. This is not a cross-browser or mobile-device certification. Browser/driver support, blur quality, and frame rate vary. Canvas transparency uses painter ordering rather than exact 3D intersection sorting; the GPU terrain likewise has no depth attachment and is intended for a shallow background effect.

## Development

```sh
npm run typecheck
npm test
npm run check
```

`check` runs type checking, all tests, and the production build. The original Canvas geometry/camera/rendering tests are retained. Added tests cover terrain continuity, responsive GPU budgets, alpha/submission contracts, cancellation, timeouts, initialization errors, device loss, cleanup, and shared clock behavior. GPU doubles test contracts, not image quality; actual WGSL compilation and static/animated appearance require a real browser.

In `src/wave/`, the V0.2 `surface.ts`, `geometry.ts`, `camera.ts`, and `renderer.ts` implement the Canvas membrane. `gpu-terrain.ts` defines the original scene and sizing rules, `gpu-shaders.ts` supplies WGSL, and the lazy `gpu-renderer.ts` owns WebGPU resources. `renderer-session.ts` guards asynchronous ownership; `clock.ts` separates time from drawing. `WaveField.tsx` manages the one active backend, browser visibility, and cleanup. React controls parameters and low-frequency diagnostics rather than per-frame geometry.

## License

Copyright © 2026 LibreCosta. Released under [BSD-3-Clause](LICENSE).

React and Motion are dependencies, not copied example implementations. This is an independent LibreCosta project, not an official Motion project. See [third-party notices](THIRD_PARTY_NOTICES.md) and installed dependency licenses. No third-party artwork or paid example source is bundled.
