import { useCallback, useEffect, useRef, useState } from "react";
import { useAnimationFrame, type MotionValue } from "motion/react";
import { FrameClock } from "./wave/clock";
import { RendererSession, type RendererStatus } from "./wave/renderer-session";
import type { GpuRenderer } from "./wave/gpu-renderer";
import type { TerrainSettings } from "./wave/gpu-terrain";

export type FrameStats = {
  time: number; renderMs: number; fps: number; draws: number; instances: number;
  width: number; height: number; pixelWidth: number; pixelHeight: number; dpr: number;
};
type Props = {
  playing: MotionValue<boolean>; settings: MotionValue<TerrainSettings>;
  initialTime: number; seek: { sequence: number; time: number }; lossToken: number; retry: number;
  onStats: (stats: FrameStats) => void; onStatus: (status: RendererStatus) => void;
};

export function WaveField({ playing, settings, initialTime, seek, lossToken, retry, onStats, onStatus }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<GpuRenderer | null>(null);
  const sessionRef = useRef<RendererSession<GpuRenderer> | null>(null);
  const [clock] = useState(() => new FrameClock(initialTime));
  const inViewport = useRef(false), pageVisible = useRef(!document.hidden);
  const sampleStart = useRef<number | null>(null), frames = useRef(0);
  const totalDraws = useRef(0), renderTotal = useRef(0);
  const publishStats = useCallback((fps: number, renderMs: number) => {
    const active = renderer.current, element = canvas.current;
    if (!active || !element) return;
    onStats({ time: clock.elapsed, renderMs, fps, draws: totalDraws.current, instances: active.instanceCount,
      width: active.width, height: active.height, pixelWidth: element.width, pixelHeight: element.height, dpr: active.dpr });
  }, [clock, onStats]);

  useEffect(() => {
    const element = canvas.current!;
    inViewport.current = false; totalDraws.current = 0;
    const suspend = () => {
      clock.suspend(); sampleStart.current = null; frames.current = renderTotal.current = 0;
    };
    suspend(); onStatus({ phase: "initializing" });
    const session = new RendererSession<GpuRenderer>(error => {
      renderer.current = null; suspend();
      onStatus({ phase: "fallback", reason: error && typeof error === "object" && "reason" in error
        ? String(error.reason) : "initialization failed",
        message: error instanceof Error ? error.message : "WebGPU could not start." });
    });
    sessionRef.current = session;
    const resize = () => {
      const active = renderer.current;
      if (!active) return;
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      try { active.resize(width, height, window.devicePixelRatio); clock.invalidate(); }
      catch (error) { session.fail(error); }
    };
    const ro = new ResizeObserver(resize); ro.observe(element);
    const io = new IntersectionObserver(([entry]) => {
      inViewport.current = entry.isIntersecting;
      suspend(); clock.invalidate(); publishStats(0, 0);
    }); io.observe(element);
    const visibility = () => {
      pageVisible.current = !document.hidden;
      suspend(); clock.invalidate(); publishStats(0, 0);
    };
    const offSettings = settings.on("change", () => clock.invalidate());
    const offPlaying = playing.on("change", () => { suspend(); clock.invalidate(); });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resize);
    void session.load(async () => {
      const { GpuRenderer } = await import("./wave/gpu-renderer");
      if (session.cancelled) throw new Error("Initialization cancelled.");
      return GpuRenderer.create(element, error => session.fail(error), () => session.cancelled);
    }, active => {
      renderer.current = active; resize();
      if (session.cancelled) return;
      onStatus({ phase: "ready", adapter: active.adapter }); clock.invalidate(); publishStats(0, 0);
    });
    return () => {
      ro.disconnect(); io.disconnect(); offSettings(); offPlaying();
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener("resize", resize);
      suspend(); renderer.current = null; session.dispose(); sessionRef.current = null;
    };
  }, [retry, clock, playing, settings, publishStats, onStatus]);
  useEffect(() => { if (seek.sequence) clock.seek(seek.time); }, [seek, clock]);
  useEffect(() => { if (lossToken) renderer.current?.simulateDeviceLoss(); }, [lossToken]);
  useAnimationFrame(timestamp => {
    const active = renderer.current;
    if (!active) return;
    const current = settings.get(), visible = inViewport.current && pageVisible.current;
    if (clock.step(timestamp, current.speed, playing.get(), visible, current.frameLimit)) {
      try { renderTotal.current += active.draw(clock.elapsed, current); frames.current++; totalDraws.current++; }
      catch (error) { sessionRef.current?.fail(error); return; }
    }
    if (!visible) return;
    if (sampleStart.current === null) sampleStart.current = timestamp;
    const interval = timestamp - sampleStart.current;
    if (interval >= 1000) {
      publishStats(frames.current * 1000 / interval, frames.current ? renderTotal.current / frames.current : 0);
      frames.current = renderTotal.current = 0; sampleStart.current = timestamp;
    }
  });
  return <canvas key={retry} ref={canvas} className="wave-canvas" role="img" aria-label="WebGPU Gaussian wire terrain" />;
}
