import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { WaveField, type FrameStats } from "./WaveField";
import { DEFAULT_SETTINGS } from "./wave/surface";
const query = new URLSearchParams(window.location.search),
  capture = query.has("capture"),
  still = query.has("still");
const timeParam = Number(query.get("time") || 0),
  initialTime = Number.isFinite(timeParam) ? Math.max(0, timeParam) : 0;

export function App() {
  const reduced = useReducedMotion();
  const [inspector, setInspector] = useState(query.has("inspect")),
    [playing, setPlaying] = useState(!still && !reduced);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS }),
    [resetToken, setResetToken] = useState(0);
  const [stats, setStats] = useState<FrameStats>({
    time: initialTime,
    renderMs: 0,
    fps: 0,
  });
  const elapsed = useRef(initialTime),
    inspectorRef = useRef(inspector);
  inspectorRef.current = inspector;
  const playingValue = useMotionValue(playing),
    speed = useMotionValue(settings.speed),
    amplitude = useMotionValue(settings.amplitude),
    brightness = useMotionValue(settings.brightness),
    glow = useMotionValue(settings.glow);
  const togglePlaying = useCallback(() => setPlaying((value) => !value), []);
  const reset = useCallback(() => {
    elapsed.current = 0;
    setResetToken((value) => value + 1);
    setStats((value) => ({ ...value, time: 0 }));
  }, []);
  const resetDefaults = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    reset();
  };
  const alignInitialFrame = () => {
    setPlaying(false);
    setSettings({ ...DEFAULT_SETTINGS });
    reset();
  };
  const onStats = useCallback((next: FrameStats) => {
    if (inspectorRef.current) setStats(next);
  }, []);
  useEffect(() => {
    playingValue.set(playing);
  }, [playing, playingValue]);
  useEffect(() => {
    speed.set(settings.speed);
    amplitude.set(settings.amplitude);
    brightness.set(settings.brightness);
    glow.set(settings.glow);
  }, [settings, speed, amplitude, brightness, glow]);
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      if (event.code === "Space") {
        if (target.tagName === "BUTTON") return;
        event.preventDefault();
        togglePlaying();
      }
      if (event.key.toLowerCase() === "d") setInspector((value) => !value);
      if (event.key.toLowerCase() === "r") reset();
      if (event.key === "Escape") setInspector(false);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [togglePlaying, reset]);
  return (
    <main
      className={`experiment${capture ? " capture-mode" : ""}`}
      aria-label="Wavefield"
    >
      <div className="wave-stage" data-testid="wave-stage">
        <WaveField
          controls={{
            playing: playingValue,
            speed,
            amplitude,
            brightness,
            glow,
          }}
          elapsed={elapsed}
          resetToken={resetToken}
          onStats={onStats}
        />
      </div>
      {!capture && (
        <button
          className="inspector-trigger"
          onClick={() => setInspector(true)}
          aria-label="Open controls, shortcut D"
        >
          Controls · D
        </button>
      )}
      <AnimatePresence>
        {inspector && !capture && (
          <motion.aside
            className="inspector"
            aria-label="Wave controls"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            <div className="inspector-heading">
              <h1>Wavefield</h1>
              <button
                className="text-button"
                onClick={() => setInspector(false)}
                aria-label="Close controls"
              >
                Close
              </button>
            </div>
            <div className="playback">
              <button onClick={togglePlaying}>
                {playing ? "Pause" : "Play"}
              </button>
              <button onClick={alignInitialFrame}>Initial frame</button>
              <button onClick={resetDefaults}>Reset</button>
            </div>
            {(
              [
                ["speed", "Speed", 0.1, 2, 0.05],
                ["amplitude", "Amplitude", 0, 2, 0.05],
                ["brightness", "Brightness", 0.3, 2, 0.05],
                ["glow", "Glow", 0, 2, 0.05],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label className="slider" key={key}>
                <span>{label}</span>
                <input
                  aria-label={label}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={settings[key]}
                  onChange={(event) =>
                    setSettings((value) => ({
                      ...value,
                      [key]: Number(event.target.value),
                    }))
                  }
                />
                <output>{settings[key].toFixed(2)}</output>
              </label>
            ))}
            <div className="stats" aria-live="off">
              <span>{stats.time.toFixed(1)} s</span>
              <span>{playing ? `${stats.fps} fps` : "Paused"}</span>
              <span>{stats.renderMs.toFixed(1)} ms / frame</span>
            </div>
            <p className="keyboard-hint">
              Space: play / pause · R: restart · D: controls
            </p>
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}
