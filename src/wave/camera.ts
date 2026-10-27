import { SURFACE_LENGTH, smoothstep, type WaveSettings } from "./surface.ts";

/** Orthographic camera above +Z. Camera depth increases towards the eye. */
export class Camera {
  scale = 1;
  sinTilt = 0;
  cosTilt = 1;
  private centerX = 0;
  private centerY = 0;

  configure(width: number, height: number, settings: WaveSettings) {
    const angle = settings.cameraTilt * Math.PI / 180;
    this.sinTilt = Math.sin(angle);
    this.cosTilt = Math.cos(angle);
    // A minimum vertical field size crops the long axis on narrow screens.
    // This changes framing, never the aspect ratio or world-space shape.
    const compact = 1 - smoothstep(560, 960, width);
    const framingScale = Math.max(width * 0.94 / SURFACE_LENGTH,
      Math.min(height * (0.17 + 0.03 * compact), width * 0.24));
    // A canonical vertical field bounds default poses in very wide QA views.
    // Geometry controls do not participate in fitting, so Depth remains visible.
    this.scale = Math.min(framingScale, height / 3.3) * settings.cameraZoom;
    this.centerX = width * 0.5;
    this.centerY = height * (0.5 + settings.verticalPosition);
  }

  worldToView(x: number, y: number, z: number, out: Float32Array, offset = 0) {
    out[offset] = x;
    out[offset + 1] = y * this.cosTilt - z * this.sinTilt;
    out[offset + 2] = y * this.sinTilt + z * this.cosTilt;
  }

  viewToScreen(x: number, y: number, out: Float32Array, offset = 0) {
    out[offset] = this.centerX + this.scale * x;
    out[offset + 1] = this.centerY - this.scale * y;
  }

  project(positions: Float32Array, view: Float32Array, screen: Float32Array) {
    for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
      this.worldToView(positions[i], positions[i + 1], positions[i + 2], view, i);
      this.viewToScreen(view[i], view[i + 1], screen, j);
    }
  }
}
