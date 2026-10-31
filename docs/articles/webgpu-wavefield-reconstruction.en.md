# From a Wireframe Wall to a Soft Surface: Reverse-Engineering and Rebuilding a WebGPU Wave

> Originally published on [GopherAtlas](https://gopheratlas.com/notes/graphics-interaction/webgpu-wavefield-reconstruction-en/) · [中文版](webgpu-wavefield-reconstruction.zh-CN.md)

## A Wave I Couldn't Look Away From

At first, all I wanted was an animated background for the Tool4Furry homepage.

At the top of [a Motion example article](https://motion.dev/examples/react-particle-orb), I came across a gently undulating blue grid. Its lines were remarkably fine, almost like translucent fabric. A few silver-blue ridges emerged from the darkness, only to gradually dissolve back into the background.

What fascinated me wasn't the complexity of the animation, but the way it controlled visual depth.

The grid had a distinct sense of space, yet almost none of the hard edges typically associated with three-dimensional wireframe models. Distant lines were barely visible. Curved surfaces appeared to overlap in the foreground, while the brightest details remained concentrated along just a handful of crests. Even in constant motion, the effect never demanded too much attention.

That was exactly the feeling I wanted for the homepage.

On the surface, reproducing it seemed straightforward: define a few wave functions, generate a grid of vertices, and project them onto the screen with some form of perspective.

Once I started implementing it, however, I realized I had seriously underestimated this seemingly simple wave.

## Why Did Everything Look Like a Wireframe Wall?

My first implementation used Canvas 2D.

I began with sine functions, arranging curves across the screen and letting them rise and fall over time. I gradually added waves at different frequencies, transverse connections between curves, and shading based on the slope of the surface.

The result had a grid. It had waves. But it never had the softness of the reference.

With too many lines, the image resembled a mesh screen standing upright. With fewer lines, it became little more than a collection of thin, parallel curves. Adding cross-connections helped establish the spatial structure, but made the grid feel even more mechanical.

For a while, I thought the projection was the problem.

The next experiments therefore introduced more complete spatial geometry: a continuous surface, surface normals, an orthographic camera, and eventually even a second surface offset along the normals, connected by side edges to give the membrane actual geometric thickness.

I hoped that a more substantial three-dimensional structure would produce the missing sense of depth.

![Figure 1: Actual render from Wavefield V0.2](https://assets.gopheratlas.com/media/sha256/ec/ec11f2e9bd67825549d0c9e55e11d9b88ebf67bf5184a0dbbe890a0d27d3fede.webp)

*Figure 1: An early Canvas 2D experiment in Wavefield V0.2. Introducing membrane geometry and a camera produced a continuous surface, but the lines and spatial layering still lacked the softness of the reference.*

Those experiments weren't entirely wasted. They gave the surface a more coherent definition and made its movement through space easier to control.

But the central problem remained. I could change the shape of the waves, yet I couldn't make them form those delicate arcs in the light and disappear so naturally into the darkness.

More elaborate geometry wasn't producing the visual result I wanted.

Dense grids also introduced another problem: moiré patterns. Increasing the rendering resolution or drawing more curves didn't necessarily help. Sometimes it made the lines even harder to distinguish.

Eventually, I began to suspect that the problem I had been trying to solve wasn't really about geometry at all.

## Following the Browser to the Shader

If repeatedly adjusting the mathematical model wasn't getting me closer, perhaps the better approach was to examine how the reference actually rendered its waves.

My first attempts didn't reveal much.

There was clearly a `canvas` element on the page. I tried obtaining its `2d`, `webgl`, and `webgl2` contexts, but none led me to the rendering system I was looking for. For a moment, I wondered whether the drawing process was hidden behind some unusual abstraction.

Then I realized that I had left one option out of my investigation:

```js
canvas.getContext("webgpu")
```

This time, the browser returned a `GPUCanvasContext`.

The header background wasn't being drawn with Canvas 2D, nor was it using WebGL as I had initially suspected. It was powered by WebGPU.

There was another distinction worth keeping in mind. Although the page was a Particle Orb example, **the effect I was investigating was the blue background in the article header**, not the particle orb demonstration embedded in the article itself.

Being on the same page didn't mean they shared the same rendering implementation.

Following the execution through the Sources panel in DevTools, I eventually located the `ParticleFrame` module responsible for the header at the time.

After setting a breakpoint, I found that the active rendering variant was:

```js
variant = "terrain"
```

From there, I was able to inspect the WGSL shader string used by that variant. It contained 5,961 characters, including the vertex and fragment shader entry points.

![Figure 2: Motion's terrain variant and WGSL in Chrome DevTools](https://assets.gopheratlas.com/media/sha256/67/67932f674c369426178fcee267580c275edc684036eb2fecc30f75b82a061d02.webp)

*Figure 2: Browser runtime inspection conducted in October 2026. The active variant and WGSL source confirmed that the article header used a WebGPU terrain rendering path.*

Three comments in the shader immediately caught my attention:

```wgsl
// Broad, unequal hills form a landscape.
// Small waves add detail to its ridges.
// All grid edges sample the same continuous height field.
```

These are the original comments from the header shader delivered by Motion's website at the time.

They describe three remarkably simple principles: build the overall landscape from broad, unequal hills; add smaller waves to enrich the ridges; and sample every grid edge from the same continuous height field.

Looking back at my earlier experiments, those three lines almost perfectly captured where I had gone wrong.

I had been thinking about how to arrange many curves into an attractive grid. The reference implementation began with a different question: how to create a landscape with natural, continuous undulations.

**The grid was simply a way of making that landscape visible.**

## How Four Hills Form a Continuous Landscape

Motion's header `terrain` shader wasn't running a complicated fluid simulation. Nor did this particular implementation rely on a conventional particle system to drive the waves.

At its foundation was a continuous height field.

For any point $p=(x,z)$ on a plane, the height $H(p,t)$ could be described as the sum of four Gaussian hills and several smaller detail waves:

$$
H(p,t)=\sum_{i=1}^{4} A_i\exp\left(-\left\|w_i\odot(p-c_i(t))\right\|^2\right)+D(p,t)
$$

Here, $A_i$ determines the height of each hill, $c_i(t)$ is its slowly drifting center, and $w_i$ controls its width along different directions. The term $D(p,t)$ adds smaller-amplitude sinusoidal variations.

The hills aren't perfectly symmetrical, and they don't all move at the same speed.

Some are broad and gentle; others are taller and more concentrated. As they overlap, they create wide crests, sloping ridges, and relatively quiet valleys. The smaller waves break up excessive regularity without dominating the overall shape.

Compared with animating every curve independently, this approach has an important advantage: **regardless of how finely the grid is subdivided, the height at any position comes from the same function.**

Adjacent curves don't follow unrelated wave patterns. Grid lines running in different directions also meet naturally at their intersections.

The continuity of the terrain comes before the continuity of the grid.

Another interesting detail is that the shader calculates not only the height, but also its partial derivatives along both horizontal axes.

For Gaussian hills, these derivatives can be obtained analytically. There is no need to estimate them using finite differences between neighboring pixels.

The resulting slopes can then contribute to both the geometry and the surface normals used in lighting calculations.

This means the positions of the crests, the orientation of the surface, and the areas that catch the light all come from the same underlying terrain data.

But getting the terrain right only solves half the problem.

If we project that height field onto the screen and draw every grid line with uniform width and opacity, the result can still look like an ordinary three-dimensional wireframe.

What makes the reference feel soft is how each individual line is rendered.

## The Secret to Softness Lies in Lines and Light

In the reference implementation, the grid lines weren't drawn using an ordinary `stroke()` operation.

Instead, the shader expanded each grid edge into a quad with a defined width in screen space. Each quad consisted of two triangles, allowing large numbers of line segments to be rendered efficiently through instancing.

The `terrain` variant I inspected used a grid of $192\times112$ cells, with two directional edges per cell, resulting in **43,008 line-segment instances**.

But the way those segments were submitted to the GPU wasn't the most important visual difference.

What mattered was that the resulting quads weren't filled as uniformly opaque strips.

### How Does a Line Become Soft?

For pixels on either side of a line's center, the fragment shader calculates a coverage value based on their perpendicular distance from that center.

In Wavefield's implementation, this can be expressed as:

$$
C(d)=\exp\left(-\frac{1}{2}\left(\frac{d}{\sigma}\right)^2\right)
$$

Here, $d$ represents the perpendicular distance from the line center, while $\sigma$ determines the width of the soft transition.

Coverage is strongest near the center and decreases smoothly toward the edges.

This is fundamentally different from a conventional hard-edged line.

A hard-edged line ends abruptly at its boundary. A line with Gaussian coverage has a bright center surrounded by gradually fading edges.

For a single line, the difference may seem subtle. But when thousands of these lines follow the contours of a curved surface, their soft edges and transparent overlaps begin to resemble fibers or a thin layer of translucent fabric.

### Let Some of the Grid Come Into Focus—and Let the Rest Fade

Gaussian coverage alone still isn't enough to reproduce the depth of the reference.

Another essential mechanism adjusts the apparent sharpness of each line according to its position along the depth of the grid.

Near the focal region, lines remain narrow and well-defined. Farther from that region, they become wider while their peak opacity decreases.

This isn't a full camera depth-of-field post-processing effect. It's a stylized approximation implemented directly through the width and coverage of the line segments.

That distinction matters.

Simply making distant lines wider would cause them to merge into large, overly bright regions. The reference therefore applies an energy adjustment tied to line width, allowing defocused lines to spread out while becoming less opaque.

The two directions of the grid aren't treated equally, either.

The reference shader assigns noticeably different base opacity values to its primary and crossing lines, approximately `0.72` and `0.14`, respectively.

The primary lines establish the visible flow of the waves. The crossing lines recede into the background, providing just enough structure to suggest a complete surface.

This helps explain why the result looks like a continuous grid without resembling a checkerboard or a wire screen.

![Figure 3: Three rendering treatments of the same height field](https://assets.gopheratlas.com/media/sha256/0e/0e5308bccfae596ec8bdda73b454d6103b3c6ddb6f33d4e665c8acfe640ab2a9.webp)

*Figure 3: Software reference renders based on the same height field and projection in Wavefield v1.0.0. All three states share the same geometry; the differences come primarily from grid rendering, Gaussian coverage, depth-dependent focus, and localized lighting. These are diagnostic reference renders, not native browser WebGPU captures.*

This comparison makes the distinction easier to see.

On the left is the continuous terrain. At the upper right is a hard-edged grid with relatively uniform line widths and prominent cross-connections. At the lower right, the soft material treatment has been restored.

The terrain and viewing angle remain unchanged.

Yet in the third state, the waves finally begin to acquire a convincing sense of depth. Much of the grid outside the focal region nearly disappears, leaving a few crisp, luminous curves tracing the ridges.

The rigid wireframe starts to feel like a soft surface.

### Why Do Only a Few Ridges Catch the Light?

The final piece is lighting.

The reference shader derives surface normals from the terrain slopes and combines them with the viewing direction to calculate a stylized grazing-angle highlight.

As the surface normal approaches certain angles relative to the viewer, the highlight becomes stronger. But its intensity is also constrained by the focal weight.

In other words, not every grid segment that satisfies the lighting condition becomes equally bright. Even if a region has a favorable angle, its highlight is suppressed when it falls outside the focal area.

As a result, the brightest details remain concentrated along a few localized ridges instead of illuminating the entire grid.

Line coverage, focus, line direction, depth attenuation, and highlight intensity ultimately contribute to the final opacity, which is then composited against the page background using premultiplied alpha.

None of this requires the grid to have actual physical thickness. Yet together, these techniques create something remarkably close to the visual volume of a delicate membrane.

Looking back at my earliest attempts, I finally understood that much of what I had been trying to achieve through increasingly elaborate geometry was actually a problem of material and optical treatment.

## From Understanding the Effect to Rebuilding Wavefield

Once I understood the structure of the reference, I reorganized the experiment and turned it into an independent project: [Wavefield](https://github.com/librecosta/wavefield).

The earlier Canvas 2D versions preserved what I had learned about geometry and projection. The new implementation moved directly to WebGPU and WGSL, replacing the process of drawing individual curves on a Canvas 2D context.

However, Wavefield v1.0.0 isn't a copy of Motion's header shader.

There is a clear difference in how the rendering work is organized.

In the Motion shader I inspected, the vertex rendering path calculated the terrain data it needed. Wavefield separates this work into two stages: a **Compute Pass** first samples the shared grid nodes, and a **Render Pass** then reads those samples to render each grid edge as a soft line segment.

At full grid quality, Wavefield uses $192\times112$ cells, producing **21,809 shared nodes** and **43,008 line-segment instances**.

This arrangement allows adjacent edges to reuse the same height and slope data rather than repeating the complete terrain calculation for every segment endpoint.

It also makes the implementation easier to reason about and debug.

![Figure 4: Wavefield v1.0.0 WebGPU preview and parameter controls](https://assets.gopheratlas.com/media/sha256/73/739bfb10205bd3822f3a29bc8878116055d08b213acfa1a9957a60554bd76874.webp)

*Figure 4: Wavefield's standalone experiment workspace. Hill positions, focus, line softness, grid opacity, localized highlights, and rendering parameters can all be adjusted. The animation can also be frozen at an exact time for controlled comparisons.*

To avoid falling back into endless trial-and-error adjustments, I added a set of reproducible controls.

By fixing the animation time and scene parameters, I could compare the same frame under different line widths, focal positions, and opacity settings.

That proved far more reliable than watching an animation run continuously and trying to judge parameter changes from memory.

Wavefield also includes several runtime constraints.

By default, GPU submissions are capped at 24 per second, with an even lower option available. The canvas device-pixel ratio is capped at 1.5, and narrower viewports use a smaller grid.

Continuous rendering pauses when the page is hidden, the wave leaves the viewport, or the user has enabled reduced motion. If WebGPU is unavailable or the GPU device is lost, the page falls back to a static CSS effect and provides a way to retry.

None of these measures should be taken as proof that the project performs consistently across all devices.

The rendering time currently reported by the demo primarily measures CPU-side command encoding and submission. It is not a measurement of GPU execution time. Understanding power consumption, graphics load, and compatibility across mobile devices and browsers will require further testing on actual hardware.

There is also an important distinction regarding the source of the visual design.

Wavefield's default scene parameters, along with some projection and optical coefficients, were informed by runtime observations of Motion's header. This is a reconstruction with an identifiable reference, not an entirely original visual design.

The project uses independently written WebGPU rendering code and documents its sources and remaining permission boundaries in its [third-party notices](https://github.com/librecosta/wavefield/blob/main/THIRD_PARTY_NOTICES.md).

This experiment didn't lead me to conclude that WebGPU is inherently better than Canvas 2D.

Canvas 2D remains well suited to many kinds of two-dimensional graphics and animation. WebGL is also perfectly capable of implementing similar instanced line rendering.

What ultimately matters is the nature of the graphics task. In this case, the scene consists of many grid edges sharing terrain data, with soft coverage and lighting controlled individually in the fragment stage.

WebGPU simply provides a direct way to organize that work.

Looking back at the entire process, the question that had troubled me from the beginning was surprisingly simple:

Why could I draw a continuous wave, yet never make it feel light and soft?

The answer wasn't more triangles, a more elaborate camera, or even a more sophisticated wave function.

It was hidden in details that were much easier to overlook: which lines should remain sharp and which should blur; where a little light should catch the surface and where darkness should be preserved; and which parts of the grid should begin to disappear before we can fully make them out.

**Sometimes, what gives procedural graphics their character isn't how much we draw, but how carefully we control what can be seen.**
