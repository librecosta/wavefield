import { useEffect, useRef, type MutableRefObject } from "react";
import { useAnimationFrame, type MotionValue } from "motion/react";
import { WaveRenderer } from "./wave/renderer";
import { DEFAULT_SETTINGS, type WaveSettings } from "./wave/surface";
export type WaveControls = {
  playing: MotionValue<boolean>;
  speed: MotionValue<number>;
  amplitude: MotionValue<number>;
  brightness: MotionValue<number>;
  glow: MotionValue<number>;
};
export type FrameStats = { time: number; renderMs: number; fps: number };
type Props = {
  controls: WaveControls;
  elapsed: MutableRefObject<number>;
  resetToken: number;
  onStats: (stats: FrameStats) => void;
};

export function WaveField({ controls, elapsed, resetToken, onStats }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    renderer = useRef<WaveRenderer | null>(null);
  const inViewport = useRef(true),
    pageVisible = useRef(!document.hidden),
    needsDraw = useRef(true),
    lastStats = useRef(0),
    frames = useRef(0),
    renderTotal = useRef(0);
  const previous = useRef<WaveSettings>({ ...DEFAULT_SETTINGS });
  useEffect(() => {
    const element = canvas.current!;
    renderer.current = new WaveRenderer(element);
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.current?.resize(width, height, window.devicePixelRatio);
      needsDraw.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(element);
    const io = new IntersectionObserver(([entry]) => {
      inViewport.current = entry.isIntersecting;
      needsDraw.current = true;
    });
    io.observe(element);
    const visibility = () => {
      pageVisible.current = !document.hidden;
      needsDraw.current = true;
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize);
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    needsDraw.current = true;
  }, [resetToken]);
  useAnimationFrame((timestamp, delta) => {
    if (!renderer.current || !inViewport.current || !pageVisible.current)
      return;
    const settings: WaveSettings = {
      speed: controls.speed.get(),
      amplitude: controls.amplitude.get(),
      brightness: controls.brightness.get(),
      glow: controls.glow.get(),
    };
    const changed = Object.keys(settings).some(
      (key) =>
        settings[key as keyof WaveSettings] !==
        previous.current[key as keyof WaveSettings],
    );
    if (controls.playing.get())
      elapsed.current += (Math.min(delta, 50) / 1000) * settings.speed;
    if (controls.playing.get() || needsDraw.current || changed) {
      renderTotal.current += renderer.current.draw(elapsed.current, settings);
      frames.current++;
      previous.current = settings;
      needsDraw.current = false;
    }
    if (timestamp - lastStats.current >= 750) {
      onStats({
        time: elapsed.current,
        renderMs: frames.current ? renderTotal.current / frames.current : 0,
        fps: Math.round(
          (frames.current / (timestamp - lastStats.current)) * 1000,
        ),
      });
      frames.current = 0;
      renderTotal.current = 0;
      lastStats.current = timestamp;
    }
  });
  return (
    <canvas
      ref={canvas}
      className="wave-canvas"
      role="img"
      aria-label="Slowly undulating blue wireframe waves on a dark background"
    />
  );
}
