export type Disposable = { dispose(): void };
export type RendererStatus = {
  phase: "ready" | "initializing" | "fallback";
  reason?: string;
  message?: string;
  adapter?: string;
};

/** Bound startup waits; a device arriving after timeout still gets destroyed. */
export function boundedInitialization<T>(promise: Promise<T>, label: string, timeoutMs = 8000,
  discardLate?: (resource: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error(`${label} timed out.`)); }, timeoutMs);
    promise.then(value => {
      clearTimeout(timer);
      if (expired) discardLate?.(value);
      else resolve(value);
    }, error => { clearTimeout(timer); if (!expired) reject(error); });
  });
}

/** One effect owns one session. Late promises may only dispose, never commit. */
export class RendererSession<T extends Disposable> {
  private closed = false;
  private failed = false;
  private resource: T | null = null;
  private onError: (error: unknown) => void;

  constructor(onError: (error: unknown) => void) { this.onError = onError; }
  get cancelled() { return this.closed || this.failed; }

  async load(factory: () => Promise<T>, onReady: (resource: T) => void) {
    try {
      const resource = await factory();
      if (this.cancelled) { resource.dispose(); return; }
      this.resource = resource;
      onReady(resource);
    } catch (error) { this.fail(error); }
  }

  fail(error: unknown) {
    if (this.cancelled) return;
    this.failed = true;
    this.resource?.dispose();
    this.resource = null;
    this.onError(error);
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.resource?.dispose();
    this.resource = null;
  }
}
