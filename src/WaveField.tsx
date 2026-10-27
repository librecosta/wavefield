import { useCallback, useEffect, useRef, useState } from "react";
import { useAnimationFrame, type MotionValue } from "motion/react";
import { WaveRenderer } from "./wave/renderer";
import { FrameClock } from "./wave/clock";
import { RendererSession, type Backend, type RendererStatus } from "./wave/renderer-session";
import type { GpuRenderer } from "./wave/gpu-renderer";
import type { GpuSettings } from "./wave/gpu-terrain";
import type { WaveSettings } from "./wave/surface";

export type FrameStats = {
  time: number; renderMs: number; fps: number; draws: number; backend: Backend; instances: number;
  width: number; height: number; pixelWidth: number; pixelHeight: number; dpr: number;
};
type ActiveRenderer = ({ kind: "canvas"; instance: WaveRenderer } |
  { kind: "gpu"; instance: GpuRenderer }) & { dispose(): void };
type Props = {
  backend: Backend;
  playing: MotionValue<boolean>;
  settings: MotionValue<WaveSettings>;
  gpuSettings: MotionValue<GpuSettings>;
  initialTime: number;
  seek: { sequence: number; time: number };
  lossToken: number;
  onStats: (stats: FrameStats) => void;
  onStatus: (status: RendererStatus) => void;
  onFallback: (reason: string, message: string) => void;
};

export function WaveField({ backend, playing, settings, gpuSettings, initialTime, seek,
  lossToken, onStats, onStatus, onFallback }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ActiveRenderer | null>(null);
  const sessionRef = useRef<RendererSession<ActiveRenderer> | null>(null);
  // This component and clock persist across backend changes. Only the canvas is keyed.
  const [clock] = useState(() => new FrameClock(initialTime));
  const inViewport = useRef(false), pageVisible = useRef(!document.hidden);
  const sampleStart = useRef<number | null>(null), frames = useRef(0);
  const totalDraws = useRef(0), renderTotal = useRef(0);
  const publishStats = useCallback((fps: number, renderMs: number) => {
    const active = renderer.current, element = canvas.current;
    if (!active || !element) return;
    const instance = active.instance;
    onStats({ time: clock.elapsed, renderMs, fps, draws: totalDraws.current, backend: active.kind,
      instances: active.kind === "gpu" ? active.instance.instanceCount : 0,
      width: instance.width, height: instance.height,
      pixelWidth: element.width, pixelHeight: element.height, dpr: instance.dpr });
  }, [clock, onStats]);

  useEffect(() => {
    const element = canvas.current!;
    inViewport.current = false;
    totalDraws.current = 0;
    const suspend = () => {
      clock.suspend(); sampleStart.current = null;
      frames.current = renderTotal.current = 0;
    };
    suspend();
    const session = new RendererSession<ActiveRenderer>(error => {
      renderer.current = null;
      suspend();
      const reason = error && typeof error === "object" && "reason" in error
        ? String(error.reason) : "initialization failed";
      onFallback(reason, error instanceof Error ? error.message : "The renderer could not start.");
    });
    sessionRef.current = session;
    const resize = () => {
      const active = renderer.current;
      if (!active) return;
      const { width, height } = element.getBoundingClientRect();
      // Equal A/B lab sampling; the unchanged V0.2 class still supports DPR 2.
      const dpr = Math.max(1, Math.min(window.devicePixelRatio, 1.5));
      if (!width || !height) return;
      const instance = active.instance;
      if (width !== instance.width || height !== instance.height || dpr !== instance.dpr) {
        try { instance.resize(width, height, dpr); clock.invalidate(); }
        catch (error) { session.fail(error); }
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(element);
    const io = new IntersectionObserver(([entry]) => {
      inViewport.current = entry.isIntersecting;
      suspend(); clock.invalidate(); publishStats(0, 0);
    });
    io.observe(element);
    const visibility = () => {
      pageVisible.current = !document.hidden;
      suspend(); clock.invalidate(); publishStats(0, 0);
    };
    const offSettings = settings.on("change", () => clock.invalidate());
    const offGpuSettings = gpuSettings.on("change", () => clock.invalidate());
    const offPlaying = playing.on("change", () => { suspend(); clock.invalidate(); });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resize);

    void session.load(async () => {
      if (backend === "canvas") {
        const instance = new WaveRenderer(element);
        return { kind: "canvas", instance, dispose: () => instance.dispose() };
      }
      // No WebGPU module, adapter request, or device on the default Canvas path.
      const { GpuRenderer } = await import("./wave/gpu-renderer");
      if (session.cancelled) throw new Error("Initialization cancelled.");
      const instance = await GpuRenderer.create(element, error => session.fail(error), () => session.cancelled);
      return { kind: "gpu", instance, dispose: () => instance.dispose() };
    }, active => {
      renderer.current = active;
      resize();
      if (session.cancelled) return;
      if (active.kind === "gpu") onStatus({ phase: "ready", adapter: active.instance.adapter });
      clock.invalidate(); publishStats(0, 0);
    });

    return () => {
      ro.disconnect(); io.disconnect(); offSettings(); offGpuSettings(); offPlaying();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize);
      suspend(); renderer.current = null;
      session.dispose(); sessionRef.current = null;
    };
  }, [backend, clock, playing, settings, gpuSettings, publishStats, onStatus, onFallback]);

  useEffect(() => { if (seek.sequence) clock.seek(seek.time); }, [seek, clock]);
  useEffect(() => {
    if (lossToken && renderer.current?.kind === "gpu") renderer.current.instance.simulateDeviceLoss();
  }, [lossToken]);

  useAnimationFrame(timestamp => {
    const active = renderer.current;
    if (!active) return;
    const current = settings.get(), visible = inViewport.current && pageVisible.current;
    if (clock.step(timestamp, current.speed, playing.get(), visible, current.frameLimit)) {
      try {
        renderTotal.current += active.kind === "canvas"
          ? active.instance.draw(clock.elapsed, current)
          : active.instance.draw(clock.elapsed, gpuSettings.get());
        frames.current++; totalDraws.current++;
      } catch (error) { sessionRef.current?.fail(error); return; }
    }
    if (!visible) return;
    if (sampleStart.current === null) sampleStart.current = timestamp;
    const interval = timestamp - sampleStart.current;
    if (interval >= 1000) {
      publishStats(frames.current * 1000 / interval, frames.current ? renderTotal.current / frames.current : 0);
      frames.current = renderTotal.current = 0; sampleStart.current = timestamp;
    }
  });
  return <canvas key={backend} ref={canvas} className="wave-canvas" data-backend={backend} role="img"
    aria-label={backend === "canvas" ? "Canvas 2D blue wave membrane" : "WebGPU soft blue wire terrain"} />;
}
