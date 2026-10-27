import { useCallback, useEffect, useRef, useState } from "react";
import { useAnimationFrame, type MotionValue } from "motion/react";
import { WaveRenderer } from "./wave/renderer";
import { FrameClock } from "./wave/clock";
import type { WaveSettings } from "./wave/surface";

export type FrameStats = {
  time: number; renderMs: number; fps: number; draws: number;
  width: number; height: number; pixelWidth: number; pixelHeight: number; dpr: number;
};
type Props = {
  playing: MotionValue<boolean>;
  settings: MotionValue<WaveSettings>;
  initialTime: number;
  resetToken: number;
  onStats: (stats: FrameStats) => void;
};

export function WaveField({ playing, settings, initialTime, resetToken, onStats }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<WaveRenderer | null>(null);
  const [clock] = useState(() => new FrameClock(initialTime));
  const inViewport = useRef(false), pageVisible = useRef(!document.hidden);
  const sampleStart = useRef<number | null>(null), frames = useRef(0);
  const totalDraws = useRef(0), renderTotal = useRef(0);
  const publishStats = useCallback((fps: number, renderMs: number) => {
    const instance = renderer.current, element = canvas.current;
    if (!instance || !element) return;
    onStats({
      time: clock.elapsed, renderMs, fps, draws: totalDraws.current,
      width: instance.width, height: instance.height,
      pixelWidth: element.width, pixelHeight: element.height, dpr: instance.dpr,
    });
  }, [clock, onStats]);

  useEffect(() => {
    const element = canvas.current!;
    const instance = new WaveRenderer(element);
    renderer.current = instance;
    const suspend = () => {
      clock.suspend();
      sampleStart.current = null;
      frames.current = renderTotal.current = 0;
    };
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio, 2));
      if (!width || !height) return;
      if (width !== instance.width || height !== instance.height || dpr !== instance.dpr) {
        instance.resize(width, height, dpr);
        clock.invalidate();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(element);
    const io = new IntersectionObserver(([entry]) => {
      inViewport.current = entry.isIntersecting;
      suspend();
      clock.invalidate();
      publishStats(0, 0);
    });
    io.observe(element);
    const visibility = () => {
      pageVisible.current = !document.hidden;
      suspend();
      clock.invalidate();
      publishStats(0, 0);
    };
    const offSettings = settings.on("change", () => clock.invalidate());
    const offPlaying = playing.on("change", () => { suspend(); clock.invalidate(); });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      ro.disconnect(); io.disconnect(); offSettings(); offPlaying();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize);
      suspend();
      instance.dispose();
      renderer.current = null;
    };
  }, [clock, playing, settings, publishStats]);

  useEffect(() => { if (resetToken) clock.reset(); }, [resetToken, clock]);

  useAnimationFrame((timestamp) => {
    const instance = renderer.current;
    if (!instance) return;
    const current = settings.get();
    const visible = inViewport.current && pageVisible.current;
    if (clock.step(timestamp, current.speed, playing.get(), visible, current.frameLimit)) {
      renderTotal.current += instance.draw(clock.elapsed, current);
      frames.current++;
      totalDraws.current++;
    }
    if (!visible) return;
    if (sampleStart.current === null) sampleStart.current = timestamp;
    const interval = timestamp - sampleStart.current;
    if (interval >= 1000) {
      publishStats(frames.current * 1000 / interval, frames.current ? renderTotal.current / frames.current : 0);
      frames.current = renderTotal.current = 0;
      sampleStart.current = timestamp;
    }
  });
  return <canvas ref={canvas} className="wave-canvas" role="img"
    aria-label="A blue translucent wave membrane with a shared three-dimensional grid and thin edges" />;
}
