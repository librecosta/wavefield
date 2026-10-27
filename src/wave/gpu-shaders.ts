import { DETAIL_WAVES } from "./gpu-terrain.ts";

// Shared data, independent code organization. No third-party shader is embedded.
const waves = DETAIL_WAVES.map(w => `vec4f(${w.x}, ${w.z}, ${w.amplitude}, ${w.rate})`).join(",");
const declarations = /* wgsl */ `
struct Scene {
  viewport: vec4f, field: vec4f, mesh: vec4f,
  optics: vec4f, ink: vec4f, land: vec4f,
  blue: vec4f, silver: vec4f,
  hills: array<vec4f, 4>, aspects: vec4f,
}
@group(0) @binding(0) var<uniform> scene: Scene;
`;

/** Sample each shared node once on the GPU, including both world derivatives. */
export const TERRAIN_COMPUTE = declarations + /* wgsl */ `
@group(0) @binding(1) var<storage, read_write> samples: array<vec4f>;
const DETAILS = array<vec4f,3>(${waves});
@compute @workgroup_size(64) fn sampleNodes(@builtin(global_invocation_id) invocation: vec3u) {
  let id = invocation.x;
  if (id >= u32(scene.mesh.z)) { return; }
  let stride = u32(scene.mesh.x) + 1u;
  let uv = vec2f(f32(id % stride) / scene.mesh.x, f32(id / stride) / scene.mesh.y);
  let world = (uv - 0.5) * vec2f(12,8);
  var value = vec3f(0);
  for (var hillId = 0u; hillId < 4u; hillId++) {
    let hill = scene.hills[hillId];
    let weights = hill.w / scene.land.y * vec2f(1, scene.aspects[hillId]);
    let delta = world - hill.xy;
    let radius = delta * weights;
    let h = hill.z * exp(-dot(radius, radius));
    value += vec3f(h, -2.0 * h * delta * weights * weights);
  }
  for (var waveId = 0u; waveId < 3u; waveId++) {
    let wave = DETAILS[waveId];
    let angle = dot(wave.xy, world) + scene.viewport.z * wave.w;
    value += vec3f(wave.z * sin(angle), wave.z * cos(angle) * wave.xy);
  }
  samples[id] = vec4f(value * scene.land.x, 0);
}
`;

/** Complete two-family cell topology; soft ribbons read the shared sampled surface. */
export const TERRAIN_SHADER = declarations + /* wgsl */ `
@group(0) @binding(1) var<storage, read> samples: array<vec4f>;
struct Point { pixel: vec2f, slope: vec2f, worldX: f32, depth: f32 }
fn gridPoint(index: vec2u) -> Point {
  let uv = vec2f(index) / scene.mesh.xy;
  let node = samples[index.y * (u32(scene.mesh.x) + 1u) + index.x];
  let q = 0.65 + 0.8 * uv.y;
  let worldX = (uv.x - 0.5) * 12.0;
  let span = max(scene.field.z, 2.2 * scene.field.w);
  let crop = 1.0 - scene.field.z / span;
  let position = vec2f(worldX * q / 5.0 - 0.3 * crop, -0.5 + 2.0 * uv.y - 0.68 * node.x * q);
  return Point(scene.field.xy + position * vec2f(span, scene.field.w), node.yz, worldX, uv.y);
}
fn focused(depth: f32) -> f32 {
  return 1.0 - smoothstep(0.07,0.38,abs(depth - scene.optics.x));
}
struct Ribbon {
  @builtin(position) clip: vec4f,
  @location(0) offset: f32,
  @location(1) sigma: f32,
  @location(2) energy: f32,
  @location(3) depth: f32,
  @location(4) slope: vec2f,
  @location(5) pixel: vec2f,
  @location(6) worldX: f32,
  @location(7) family: f32,
}
@vertex fn vertexMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Ribbon {
  let cell = instance / 2u;
  let cross = (instance & 1u) == 1u;
  let origin = vec2u(cell % u32(scene.mesh.x), cell / u32(scene.mesh.x));
  let step = select(vec2u(1,0), vec2u(0,1), cross);
  let a = gridPoint(origin);
  let b = gridPoint(origin + step);
  let corners = array<vec2f,6>(vec2f(0,-1),vec2f(1,-1),vec2f(0,1),vec2f(0,1),vec2f(1,-1),vec2f(1,1));
  let corner = corners[vertex];
  let depth = mix(a.depth,b.depth,corner.x);
  let focus = focused(depth);
  let sigma = scene.optics.y * (0.32 + 2.16 * (1.0-focus) * scene.optics.z);
  let delta = b.pixel-a.pixel;
  let segmentLength = max(0.001,length(delta));
  let tangent = delta/segmentLength;
  let normal = vec2f(-tangent.y,tangent.x);
  let pixel = mix(a.pixel,b.pixel,corner.x) + normal*corner.y*(3.0*sigma);
  var out: Ribbon;
  out.clip = vec4f(pixel/scene.viewport.xy*vec2f(2,-2)+vec2f(-1,1),0,1);
  out.offset=corner.y*3.0*sigma;
  out.sigma=sigma;
  out.energy=min(1.0,0.34*scene.optics.y/sigma);
  out.depth=depth; out.slope=mix(a.slope,b.slope,corner.x);
  out.pixel=pixel; out.worldX=mix(a.worldX,b.worldX,corner.x);
  out.family=select(scene.ink.x,scene.ink.y,cross);
  return out;
}
@fragment fn fragmentMain(in: Ribbon) -> @location(0) vec4f {
  let focus=focused(in.depth);
  let normal=normalize(vec3f(-in.slope.x,1,-in.slope.y));
  let view=normalize(vec3f(-0.045*in.worldX,0.42,1));
  let rim=pow(1.0-abs(dot(normal,view)),4.0)*focus*focus*focus;
  let localRim=clamp(rim*scene.optics.w,0.0,1.0);
  let depthFade=smoothstep(0.0,0.20,in.depth)*(0.42+0.58*in.depth);
  let inset=scene.field.zw-abs(in.pixel-scene.field.xy);
  let fade=clamp(scene.field.zw*vec2f(0.24,0.52),vec2f(48),vec2f(160));
  let visibility=smoothstep(vec2f(0),fade,inset);
  let radius=in.offset/in.sigma;
  let coverage=exp(-0.5*radius*radius);
  let alpha=clamp(coverage*in.energy*in.family*depthFade*(0.50+1.20*localRim)
    *visibility.x*visibility.y*scene.ink.z*scene.ink.w,0.0,1.0);
  // Public header props identify blue as highlight and paper as accent.
  let color=mix(scene.blue.rgb*0.7,scene.silver.rgb,0.78*localRim);
  return vec4f(color*alpha,alpha);
}
`;
