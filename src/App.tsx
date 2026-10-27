import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { WaveField, type FrameStats } from "./WaveField";
import { DEFAULT_SETTINGS, type WaveSettings } from "./wave/surface";
import { DEFAULT_GPU_SETTINGS, type GpuSettings } from "./wave/gpu-terrain";
import type { Backend, RendererStatus } from "./wave/renderer-session";

const query = new URLSearchParams(window.location.search);
const capture = query.has("capture"), still = query.has("still");
const timeParam = Number(query.get("time") || 0);
const initialTime = Number.isFinite(timeParam) ? Math.max(0, timeParam) : 0;
const initialBackend: Backend = query.get("backend") === "gpu" ? "gpu" : "canvas";

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
const gpuSliders: readonly (readonly [keyof GpuSettings, string, number, number, number])[] = [
  ["relief", "Terrain Relief", 0, 1.8, 0.05],
  ["focusDepth", "Focus Depth", 0, 1, 0.02],
  ["defocus", "Defocus", 0, 3, 0.05],
  ["contrast", "Grid Contrast", 0.3, 1.8, 0.05],
  ["rimLight", "Rim Light", 0, 1.5, 0.05],
  ["opacity", "Opacity", 0, 1, 0.05],
];

export function App() {
  const reduced = useReducedMotion();
  const [inspector, setInspector] = useState(query.has("inspect"));
  const [playing, setPlaying] = useState(!still && !reduced);
  const [settings, setSettings] = useState<WaveSettings>({ ...DEFAULT_SETTINGS });
  const [gpuSettings, setGpuSettings] = useState<GpuSettings>({ ...DEFAULT_GPU_SETTINGS });
  const [backend, setBackend] = useState<Backend>(initialBackend);
  const [status, setStatus] = useState<RendererStatus>({ phase: initialBackend === "gpu" ? "initializing" : "ready" });
  const [seek, setSeek] = useState({ sequence: 0, time: initialTime });
  const [freezeTime, setFreezeTime] = useState(String(initialTime));
  const [lossToken, setLossToken] = useState(0);
  const [stats, setStats] = useState<FrameStats>({
    time: initialTime, renderMs: 0, fps: 0, draws: 0,
    width: 0, height: 0, pixelWidth: 0, pixelHeight: 0, dpr: 1, backend: initialBackend, instances: 0,
  });
  const inspectorRef = useRef(inspector);
  inspectorRef.current = inspector;
  const playingValue = useMotionValue(playing && !reduced);
  const settingsValue = useMotionValue(settings);
  const gpuSettingsValue = useMotionValue(gpuSettings);
  const togglePlaying = useCallback(() => { if (!reduced) setPlaying(value => !value); }, [reduced]);
  const restart = useCallback(() => {
    setSeek(value => ({ sequence: value.sequence + 1, time: 0 }));
    setStats(value => ({ ...value, time: 0 }));
  }, []);
  const resetDefaults = (resume: boolean) => {
    setSettings({ ...DEFAULT_SETTINGS });
    setGpuSettings({ ...DEFAULT_GPU_SETTINGS });
    setPlaying(resume && !reduced);
    restart();
  };
  const onStats = useCallback((next: FrameStats) => {
    if (inspectorRef.current) setStats(next);
  }, []);
  const onStatus = useCallback((next: RendererStatus) => setStatus(next), []);
  const onFallback = useCallback((reason: string, message: string) => {
    setStatus({ phase: "fallback", reason, message });
    setBackend("canvas");
    setStats(value => ({ ...value, backend: "canvas", fps: 0, renderMs: 0, draws: 0, instances: 0 }));
  }, []);
  const selectBackend = (next: Backend) => {
    if (next === backend) return;
    setBackend(next);
    setStatus({ phase: next === "gpu" ? "initializing" : "ready" });
    setStats(value => ({ ...value, backend: next, fps: 0, renderMs: 0, draws: 0, instances: 0 }));
  };
  const freeze = () => {
    const time = Number(freezeTime);
    if (!Number.isFinite(time) || time < 0) return;
    setPlaying(false);
    setSeek(value => ({ sequence: value.sequence + 1, time }));
    setStats(value => ({ ...value, time }));
  };
  useEffect(() => { playingValue.set(playing && !reduced); }, [playing, reduced, playingValue]);
  useEffect(() => { settingsValue.set(settings); }, [settings, settingsValue]);
  useEffect(() => { gpuSettingsValue.set(gpuSettings); }, [gpuSettings, gpuSettingsValue]);
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
        <WaveField backend={backend} playing={playingValue} settings={settingsValue} gpuSettings={gpuSettingsValue}
          initialTime={initialTime} seek={seek} lossToken={lossToken}
          onStats={onStats} onStatus={onStatus} onFallback={onFallback} />
      </div>
      {!capture && <button className="inspector-trigger" onClick={() => setInspector(true)}
        aria-label="Open controls, shortcut D">Controls · D</button>}
      <AnimatePresence>
        {inspector && !capture && (
          <motion.aside className="inspector" aria-label="Wave controls"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: reduced ? 0 : 0.15 }}>
            <div className="inspector-heading">
              <h1>Wavefield <span>A/B Lab · 0.3</span></h1>
              <button className="text-button" onClick={() => setInspector(false)} aria-label="Close controls">Close</button>
            </div>
            <div className="backend-switch" role="group" aria-label="Rendering backend">
              <button aria-pressed={backend === "canvas"} onClick={() => selectBackend("canvas")}>Canvas 2D · V0.2</button>
              <button aria-pressed={backend === "gpu"} onClick={() => selectBackend("gpu")}>WebGPU · V0.3</button>
            </div>
            <p className="renderer-status" role="status" data-testid="renderer-status">
              {backend === "gpu" ? "WebGPU" : "Canvas 2D"} · {status.phase}
              {status.reason && ` · ${status.reason}`}
              {status.message && <span>{status.message}</span>}
              {status.adapter && <span>{status.adapter}</span>}
            </p>
            {backend === "canvas" && groups.map(group => <details key={group.name} open={group.name === "Geometry"}>
              <summary>{group.name}</summary>
              <div className="group-controls">{group.sliders.map(slider)}</div>
            </details>)}
            {backend === "gpu" && <details open>
              <summary>GPU terrain &amp; material</summary>
              <div className="group-controls">{gpuSliders.map(([key, label, min, max, step]) => (
                <label className="slider" key={key}><span>{label}</span>
                  <input aria-label={label} type="range" min={min} max={max} step={step} value={gpuSettings[key]}
                    onChange={event => setGpuSettings(value => ({ ...value, [key]: Number(event.target.value) }))} />
                  <output>{gpuSettings[key].toFixed(2)}</output>
                </label>
              ))}</div>
            </details>}
            <details open>
              <summary>Animation</summary>
              <div className="group-controls">
                <div className="playback">
                  <button onClick={togglePlaying} disabled={!!reduced}>{playing && !reduced ? "Pause" : "Play"}</button>
                  <button onClick={() => resetDefaults(false)}>Initial Frame</button>
                  <button onClick={() => resetDefaults(true)}>Reset</button>
                </div>
                {slider(["speed", "Speed", 0.1, 2, 0.05, 2])}
                <div className="freeze-time">
                  <label htmlFor="freeze-time">Freeze at time</label>
                  <input id="freeze-time" type="number" min="0" step="0.1" value={freezeTime}
                    onChange={event => setFreezeTime(event.target.value)} />
                  <button onClick={freeze}>Freeze</button>
                </div>
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
              <span>{stats.fps.toFixed(1)} {stats.backend === "gpu" ? "submit" : "draw"} FPS</span>
              <span>{stats.renderMs.toFixed(2)} JS ms / {stats.backend === "gpu" ? "submit" : "draw"}</span>
              <span>{Math.round(stats.width)} × {Math.round(stats.height)} CSS</span>
              <span>{stats.pixelWidth} × {stats.pixelHeight} px</span>
              <span>DPR {stats.dpr.toFixed(2)}</span>
              <span className="draw-count">Backend {stats.backend === "gpu" ? "submits" : "draws"}: {stats.draws}</span>
              {stats.backend === "gpu" && <span className="draw-count">{stats.instances} segment instances · GPU time not measured</span>}
            </div>
            {backend === "gpu" && status.phase === "ready" && <button className="loss-test text-button"
              onClick={() => setLossToken(value => value + 1)}>Test device loss</button>}
            <p className="keyboard-hint">Space: play / pause · R: restart · D: controls</p>
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}
