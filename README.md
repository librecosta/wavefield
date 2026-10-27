# Wavefield

Interactive procedural wave visuals for the web, built with React, Motion, and Canvas 2D.

A small [LibreCosta](https://github.com/librecosta) frontend experiment that draws a translucent blue membrane with a three-dimensional grid, thin edges, and local grazing highlights. Geometry, camera projection, and lighting are mathematical; the demo has no image textures, backend, or external service dependency. It does not use Three.js or WebGL.

## Features

- Continuous world-space height field, analytic normals, and a normal-offset underside.
- Shared vertices for surface patches and both grid directions; only the visible near edge has a side ribbon.
- An independent orthographic camera with tilt, zoom, and vertical framing controls.
- Subtle surface fill, normal-based lighting, local rim highlights, and limited glow.
- Responsive hero framing, CSS-pixel line widths, DPR capped at 2, and spacing-based grid thinning/fading.
- Motion schedules frames; Canvas draws are capped at 24/s by default. Timekeeping is independent of that cap.
- Pause, deterministic time selection, hidden/offscreen suspension, and reduced-motion support.

The demo is experimental. It is not a pixel-for-pixel recreation of a reference image. No reference artwork, traced contours, or image-derived calibration data is included.

## Getting started

Use Node.js 24 or newer and npm. The tests use Node's native TypeScript support.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite.

```sh
npm run build
npm run preview
```

The production build is a static site in `dist/`. The preview command serves that build locally.

## Controls

Use **Controls** or **D** to open the Inspector. Its four collapsible groups affect separate parts of the rendering:

| Group | Controls and defaults |
| ----- | --------------------- |
| Geometry | Wave Height **1**, Surface Depth **4.8**, Thickness **0.035** (world units) |
| Camera | Tilt **18°**, Zoom **1×**, Vertical Position **0.04** (fraction of canvas height; positive moves down) |
| Material | Grid Density **1**, Surface Opacity **0.035**, Rim Light **0.65**, Glow **0.55**, Brightness **1** |
| Animation | Speed **0.7**, Frame Limit **24 draws/s** (12/24/30 available) |

Wave Height scales the entire height field: **0 is a flat plane with real depth**, not a frozen wave. Thickness offsets the underside along the normal; **0 removes the side ribbon**. Density changes the shared mesh resolution; spacing-based thinning can reduce visible lines further. Surface Opacity affects the film, while Rim Light affects local grazing highlights. Zoom preserves proportions. On narrow screens, the camera crops the long axis to retain readable depth rather than compressing the whole membrane into a thin strip.

| Key / control | Action                                                   |
| ------------- | -------------------------------------------------------- |
| Space         | Pause or resume                                          |
| D             | Toggle controls                                          |
| R             | Restart the animation clock                              |
| Escape        | Close controls                                           |
| Initial Frame | Pause, restore all defaults, and return to time zero      |
| Reset         | Restore all defaults and restart playback at time zero    |

Reduced motion keeps animation paused and disables Play; settings still redraw a static frame. Hidden pages and offscreen canvases stop drawing and advancing time. Resuming does not accumulate the inactive interval. Paused parameter changes draw once, subject to the same frame cap. The cap is a maximum, not a promised frame rate: RAF cadence and device load can yield fewer draws.

Diagnostics show actual **draw FPS**, average synchronous JavaScript milliseconds per draw, total draws, CSS size, backing pixel size, and DPR. They update about once per second; they do not measure GPU time or display refresh rate.

Optional URL parameters:

- `?inspect=1` opens the controls.
- `?still=1` pauses at the initial pose.
- `?still=1&time=8` pauses at eight animation seconds.
- `?still=1&time=8&capture=1` uses the independent, fixed **1891 × 230 CSS-pixel** QA view with the same camera and default controls. It may overflow a narrower window. Normal views use a responsive hero height, never this fixed aspect ratio. Capture mode hides the Inspector.

## Development

```sh
npm run typecheck
npm test
npm run check
```

`check` runs the type checker, tests, and production build. Tests cover continuous/compiled geometry agreement, finite unit normals and tangents, flat-plane and thickness degeneration, shared grid nodes, loop position/velocity continuity, camera direction and parameter effects, responsive framing, DPR 1/2 drawing contracts, canvas cleanup, draw caps, and timekeeping through pauses/visibility changes.

In `src/wave/`, `surface.ts` defines the continuous height field and defaults; `geometry.ts` caches spatial modes and builds shared world vertices, normals, and lower vertices. Coordinates are X right, Y up, Z towards the viewer; V increases towards the near edge, with normals oriented towards +Y using Pv × Pu. `camera.ts` maps world → view → CSS screen coordinates. `renderer.ts` paints the film, near side, grid, and glow. Geometry buffers change with geometry/time, projection with geometry/camera/size, and gradients stay cached during animation. `clock.ts` separates elapsed time from draw scheduling. `WaveField.tsx` owns browser visibility and resource cleanup; React updates controls and low-frequency diagnostics rather than every animation frame.

## Browser requirements

The demo uses ES modules, Canvas 2D (including the `filter` property for blur), `ResizeObserver`, `IntersectionObserver`, and modern CSS viewport units. Use a current browser with these features. This repository does not include a cross-browser test suite or legacy-browser polyfills; blur quality and frame rate depend on the browser and device.

This is a shallow-height-field painter with a restricted camera angle, not a general 3D renderer. Transparent patches use far-to-near strips, with no depth buffer or exact self-intersection sorting. Large wave heights at shallow tilt can overlap imperfectly. No claim of pixel-accurate reproduction of Motion's artwork or source code is made.

## License and attribution

Copyright © 2026 LibreCosta. Released under the [BSD-3-Clause license](LICENSE).

React and Motion are used as dependencies, not copied example implementations. This is an independent LibreCosta project, not an official Motion project. No third-party artwork or paid example source is bundled. See [third-party notices](THIRD_PARTY_NOTICES.md) and the dependencies' installed license files.
