/** RAF scheduling, animation time and actual Canvas draws are separate. */
export class FrameClock {
  elapsed: number;
  private previous: number | null = null;
  private active = false;
  private lastDraw = -Infinity;
  private dirty = true;

  constructor(initialTime = 0) { this.elapsed = initialTime; }
  invalidate() { this.dirty = true; }
  suspend() { this.previous = null; this.active = false; }
  reset() { this.elapsed = 0; this.suspend(); this.invalidate(); }

  step(now: number, speed: number, playing: boolean, visible: boolean, limit: number) {
    const active = playing && visible;
    if (active && this.active && this.previous !== null) {
      this.elapsed += Math.max(0, now - this.previous) * speed / 1000;
    }
    this.previous = now;
    this.active = active;
    if (!visible || (!active && !this.dirty) || now - this.lastDraw + 1e-7 < 1000 / limit) return false;
    this.lastDraw = now;
    this.dirty = false;
    return true;
  }
}
