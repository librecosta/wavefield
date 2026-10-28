# Third-party notices

Wavefield's own code is licensed under BSD-3-Clause. Dependencies are installed through npm, with versions recorded in `package-lock.json`; their licenses remain separate from the project license. No third-party example implementations or artwork are vendored here.

## Runtime dependencies

React, React DOM and Scheduler use the MIT license:

> Copyright (c) Meta Platforms, Inc. and affiliates.

Motion, Motion DOM and Motion Utils use the MIT license:

> Copyright (c) 2024 [Motion](https://motion.dev) B.V.

Framer Motion uses the MIT license:

> Copyright (c) 2018 Framer B.V.

The MIT permission and disclaimer below apply to those packages:

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

TypeScript's runtime helpers (`tslib`) use the 0BSD license:

```text
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

## Development dependencies

`@webgpu/types` uses BSD-3-Clause, copyright 2022 WebGPU Developers. It provides compile-time API declarations only and is not shipped as a runtime renderer. Its complete license is included in the installed package.

Vite and its React plugin use MIT. TypeScript uses Apache-2.0. Transitive development dependencies also include ISC, BSD-3-Clause, 0BSD and CC-BY-4.0 licenses. The CC-BY-4.0 browser-compatibility dataset is provided by [caniuse-lite](https://github.com/browserslist/caniuse-lite), a build-time dependency; it is not part of the wave geometry or artwork.

The complete license files are distributed in the respective npm packages. When distributing a generated bundle, retain its third-party license comments and applicable notices as well as this project's LICENSE.

## Visual and mathematical reference

The PRNG inside `seededHills` follows **Mulberry32**, designed by Tommy Ettinger (2017). The [author's original reference](https://gist.github.com/tommyettinger/46a874533244883189143505d203312c) carries a CC0 public-domain dedication. This algorithm supplies Wavefield's alternative scene seeds and is separate from Motion's article initializer; it is not a new PRNG invented by this project.

Motion's public [article header terrain](https://motion.dev/examples/react-particle-orb) informs Wavefield's visual behavior. The mathematical observations and engineering requirements are recorded in [Issue #2](https://github.com/librecosta/wavefield/issues/2). The default preset's precise hill, phase and color data were derived from the public initializer and verified against runtime uniforms on 2026-10-28. These remain in `src/wave/gpu-terrain.ts` as `STUDY_HILLS`, `ARTICLE_PHASE`, and the color values; `src/App.tsx` exposes the Article reference preset. The projection, motion and optical coefficients in the terrain model and shaders also follow the observed reference behavior. This is a source-informed reconstruction with a closely corresponding scene, not merely a generic visual influence.

Wavefield implements that behavior with separately written shared-node compute sampling and ribbon rendering passes; its alternative seed generator is independent. The repository audit found no verbatim copy of the original website JavaScript or complete WGSL. Independent implementation and attribution alone do not establish permission for reproducing the reference design or exact preset. No separate permission or license for the website's header implementation or scene design has been verified. The MIT licenses of the installed Motion packages do not establish that permission; Wavefield's BSD license does not relicense third-party rights. Maintainers should review this provenance before release or downstream integration.

No original Motion JavaScript/WGSL, paid example implementation, research captures, images, fonts, or other website assets are distributed. Publicly readable website source is not represented as BSD-licensed material. Wavefield is not affiliated with or endorsed by Motion.

## Repository preview

`docs/assets/wavefield-preview.webp` is a screenshot of Wavefield's own running WebGPU demo, not a capture of Motion's website or a user-provided image. It uses the unchanged default preset at time 8 seconds, a 1440 × 576 CSS-pixel capture view, and reference grid quality. Only image encoding/compression was applied. The reference-scene provenance above also applies to the rendered appearance; the screenshot does not resolve that permission uncertainty.
