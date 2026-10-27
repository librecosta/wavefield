# Wavefield

Interactive procedural wave visuals for the web, built with React, Motion, and Canvas 2D.

A small [LibreCosta](https://github.com/librecosta) frontend experiment that draws a blue wireframe surface with layered glow. Geometry and lighting are generated mathematically; the demo has no image textures, backend, or external service dependency. It does not use Three.js or WebGL.

## Features

- Continuous wave deformation with shared geometry for both grid directions.
- Separate foreground lines, softened distant lines, and glow layers.
- Playback, speed, amplitude, brightness, and glow controls.
- Responsive canvas sizing, with device pixel ratio capped at 2.
- Reduced-motion preferences pause playback initially. Hidden pages and offscreen canvases stop advancing the animation.
- A deterministic initial pose and optional time selection for visual inspection.

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

The default view contains only the wave. Press **D** to open the controls, or use **Tab** to focus the controls button.

| Key / control | Action                                                   |
| ------------- | -------------------------------------------------------- |
| Space         | Pause or resume                                          |
| D             | Toggle controls                                          |
| R             | Restart the animation clock                              |
| Escape        | Close controls                                           |
| Initial frame | Pause, restore default settings, and return to time zero |
| Reset         | Restore default settings and restart the clock           |

Optional URL parameters:

- `?inspect=1` opens the controls.
- `?still=1` pauses at the initial pose.
- `?still=1&time=8` pauses at eight animation seconds.
- `?still=1&capture=1` uses a fixed 1891 × 230 canvas for local comparison; it may overflow a narrower window.

## Development

```sh
npm run typecheck
npm test
npm run check
```

`check` runs the type checker, geometry tests, and production build. The tests cover lookup accuracy, loop continuity, finite coordinates, and zero-amplitude behavior.

The implementation is in `src/wave/`: `surface.ts` defines the mathematical surface, `geometry.ts` precomputes its spatial terms, and `renderer.ts` draws the grid and glow. `WaveField.tsx` connects rendering to Motion's frame callback and browser visibility. `App.tsx` contains the demo controls.

## Browser requirements

The demo uses ES modules, Canvas 2D (including the `filter` property for blur), `ResizeObserver`, `IntersectionObserver`, and modern CSS viewport units. Use a current browser with these features. This repository does not include a cross-browser test suite or legacy-browser polyfills; blur quality and frame rate depend on the browser and device.

## License and attribution

Copyright © 2026 LibreCosta. Released under the [BSD-3-Clause license](LICENSE).

React and Motion are used as dependencies, not copied example implementations. This is an independent LibreCosta project, not an official Motion project. No third-party artwork or paid example source is bundled. See [third-party notices](THIRD_PARTY_NOTICES.md) and the dependencies' installed license files.
