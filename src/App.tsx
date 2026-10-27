import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { WaveField, type FrameStats } from "./WaveField";
import { DEFAULT_SETTINGS, type WaveSettings } from "./wave/surface";

const query = new URLSearchParams(window.location.search);
const capture = query.has("capture"), still = query.has("still");
const timeParam = Number(query.get("time") || 0);
const initialTime = Number.isFinite(timeParam) ? Math.max(0, timeParam) : 0;

type SliderSpec = readonly [keyof WaveSettings, string, number, number, number, number, string?];
const groups: { name: string; sliders: SliderSpec[] }[] = [
  { name: "Geometry", sliders: [
    ["waveHeight", "Wave Height", 0, 1.6, 0.05, 2],
    ["surfaceDepth", "Surface Depth", 2, 8, 0.2, 1],
    ["thickness", "Thickness", 0, 0.18, 0.005, 3],
  ] },
  { name: "Camera", sliders: [
    ["cameraTilt", "Tilt", 10, 38, 1, 0, "°"],
    ["cameraZoom", "Zoom", 0.6, 1.5, 0.05, 2, "×"],
    ["verticalPosition", "Vertical Position", -0.3, 0.3, 0.02, 2],
  ] },
  { name: "Material", sliders: [
    ["gridDensity", "Grid Density", 0.5, 1.5, 0.25, 2],
    ["surfaceOpacity", "Surface Opacity", 0, 0.12, 0.005, 3],
    ["rimLight", "Rim Light", 0, 1.5, 0.05, 2],
    ["glow", "Glow", 0, 1.5, 0.05, 2],
    ["brightness", "Brightness", 0.4, 1.6, 0.05, 2],
  ] },
];

export function App() {
  const reduced = useReducedMotion();
  const [inspector, setInspector] = useState(query.has("inspect"));
  const [playing, setPlaying] = useState(!still && !reduced);
  const [settings, setSettings] = useState<WaveSettings>({ ...DEFAULT_SETTINGS });
  const [resetToken, setResetToken] = useState(0);
  const [stats, setStats] = useState<FrameStats>({
    time: initialTime, renderMs: 0, fps: 0, draws: 0,
    width: 0, height: 0, pixelWidth: 0, pixelHeight: 0, dpr: 1,
  });
  const inspectorRef = useRef(inspector);
  inspectorRef.current = inspector;
  const playingValue = useMotionValue(playing && !reduced);
  const settingsValue = useMotionValue(settings);
  const togglePlaying = useCallback(() => { if (!reduced) setPlaying(value => !value); }, [reduced]);
  const restart = useCallback(() => {
    setResetToken(value => value + 1);
    setStats(value => ({ ...value, time: 0 }));
  }, []);
  const resetDefaults = (resume: boolean) => {
    setSettings({ ...DEFAULT_SETTINGS });
    setPlaying(resume && !reduced);
    restart();
  };
  const onStats = useCallback((next: FrameStats) => {
    if (inspectorRef.current) setStats(next);
  }, []);
  useEffect(() => { playingValue.set(playing && !reduced); }, [playing, reduced, playingValue]);
  useEffect(() => { settingsValue.set(settings); }, [settings, settingsValue]);
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable ||
        event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.code === "Space" && !["BUTTON", "SUMMARY"].includes(target.tagName)) {
        event.preventDefault(); togglePlaying();
      }
      if (event.key.toLowerCase() === "d") setInspector(value => !value);
      if (event.key.toLowerCase() === "r") restart();
      if (event.key === "Escape") setInspector(false);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [togglePlaying, restart]);

  const slider = ([key, label, min, max, step, precision, suffix = ""]: SliderSpec) => (
    <label className="slider" key={key}>
      <span>{label}</span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={settings[key]}
        onChange={event => setSettings(value => ({ ...value, [key]: Number(event.target.value) }))} />
      <output>{settings[key].toFixed(precision)}{suffix}</output>
    </label>
  );
  return (
    <main className={`experiment${capture ? " capture-mode" : ""}`} aria-label="Wavefield">
      <div className="wave-stage" data-testid="wave-stage">
        <WaveField playing={playingValue} settings={settingsValue} initialTime={initialTime}
          resetToken={resetToken} onStats={onStats} />
      </div>
      {!capture && <button className="inspector-trigger" onClick={() => setInspector(true)}
        aria-label="Open controls, shortcut D">Controls · D</button>}
      <AnimatePresence>
        {inspector && !capture && (
          <motion.aside className="inspector" aria-label="Wave controls"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: reduced ? 0 : 0.15 }}>
            <div className="inspector-heading">
              <h1>Wavefield <span>0.2</span></h1>
              <button className="text-button" onClick={() => setInspector(false)} aria-label="Close controls">Close</button>
            </div>
            {groups.map(group => <details key={group.name} open={group.name === "Geometry"}>
              <summary>{group.name}</summary>
              <div className="group-controls">{group.sliders.map(slider)}</div>
            </details>)}
            <details open>
              <summary>Animation</summary>
              <div className="group-controls">
                <div className="playback">
                  <button onClick={togglePlaying} disabled={!!reduced}>{playing && !reduced ? "Pause" : "Play"}</button>
                  <button onClick={() => resetDefaults(false)}>Initial Frame</button>
                  <button onClick={() => resetDefaults(true)}>Reset</button>
                </div>
                {slider(["speed", "Speed", 0.1, 2, 0.05, 2])}
                <label className="frame-limit"><span>Frame Limit</span>
                  <select aria-label="Frame Limit" value={settings.frameLimit}
                    onChange={event => setSettings(value => ({ ...value, frameLimit: Number(event.target.value) }))}>
                    {[12, 24, 30].map(limit => <option value={limit} key={limit}>{limit} draws / s</option>)}
                  </select>
                </label>
                {reduced && <p className="keyboard-hint">Reduced motion: animation paused.</p>}
              </div>
            </details>
            <div className="stats" data-testid="frame-stats" aria-live="off">
              <span>{stats.time.toFixed(1)} s</span>
              <span>{stats.fps.toFixed(1)} draw FPS</span>
              <span>{stats.renderMs.toFixed(2)} ms / draw</span>
              <span>{Math.round(stats.width)} × {Math.round(stats.height)} CSS</span>
              <span>{stats.pixelWidth} × {stats.pixelHeight} px</span>
              <span>DPR {stats.dpr.toFixed(2)}</span>
              <span className="draw-count">Total canvas draws: {stats.draws}</span>
            </div>
            <p className="keyboard-hint">Space: play / pause · R: restart · D: controls</p>
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}
