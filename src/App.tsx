import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { WaveField, type FrameStats } from "./WaveField";
import { DEFAULT_SETTINGS, ARTICLE_PHASE, STUDY_HILLS, seededHills, type TerrainSettings } from "./wave/gpu-terrain";
import type { RendererStatus } from "./wave/renderer-session";

const query = new URLSearchParams(window.location.search);
const capture = query.has("capture"), still = query.has("still");
const captureSize = /^(\d+)x(\d+)$/.exec(query.get("capture") || "");
const captureWidth = captureSize ? Math.max(280,Math.min(2560,Number(captureSize[1]))) : 1891;
const captureHeight = captureSize ? Math.max(180,Math.min(1600,Number(captureSize[2]))) : 230;
const requestedTime = Number(query.get("time") || 0);
const initialTime = Number.isFinite(requestedTime) ? Math.max(0, requestedTime) : 0;
const defaults = (): TerrainSettings => ({ ...DEFAULT_SETTINGS,
  quality: query.get("quality") === "reference" ? "reference" : "adaptive" });
type ScalarKey = { [K in keyof TerrainSettings]: TerrainSettings[K] extends number ? K : never }[keyof TerrainSettings];
type Slider = readonly [ScalarKey, string, number, number, number];
const groups: readonly { name: string; sliders: readonly Slider[] }[] = [
  { name: "Landform", sliders: [["relief","Height scale",0,1.8,0.05],["span","Hill span",0.6,1.8,0.05],["phase","Scene phase",0,4096,1]] },
  { name: "Focus & material", sliders: [["focus","Focus depth",0,1,0.01],["softness","Defocus",0,2,0.05],
    ["lineSize","Line size",0.5,2.5,0.05],["mainAlpha","Main alpha",0,1,0.02],["crossAlpha","Cross alpha",0,0.4,0.01],
    ["rim","Grazing highlight",0,2,0.05],["opacity","Opacity",0,1.5,0.05]] },
  { name: "Projection", sliders: [["framing","Field scale",0.6,1.5,0.05],["vertical","Vertical position",-0.4,0.4,0.02]] },
];

export function App() {
  const reduced = useReducedMotion();
  const [inspector, setInspector] = useState(query.has("inspect"));
  const [playing, setPlaying] = useState(!still && !reduced);
  const [settings, setSettings] = useState(defaults);
  const [status, setStatus] = useState<RendererStatus>({ phase: "initializing" });
  const [seek, setSeek] = useState({ sequence: 0, time: initialTime });
  const [freezeTime, setFreezeTime] = useState(String(initialTime));
  const [seed, setSeed] = useState("137");
  const [selectedHill, setSelectedHill] = useState(0);
  const [lossToken, setLossToken] = useState(0), [retry, setRetry] = useState(0);
  const [stats, setStats] = useState<FrameStats>({ time: initialTime, fps: 0, renderMs: 0, draws: 0, instances: 0,
    width: 0, height: 0, pixelWidth: 0, pixelHeight: 0, dpr: 1 });
  const inspectorRef = useRef(inspector); inspectorRef.current = inspector;
  const playingValue = useMotionValue(playing && !reduced);
  const settingsValue = useMotionValue(settings);
  const onStats = useCallback((value: FrameStats) => { if (inspectorRef.current) setStats(value); }, []);
  const onStatus = useCallback((value: RendererStatus) => setStatus(value), []);
  const togglePlaying = useCallback(() => { if (!reduced) setPlaying(value => !value); }, [reduced]);
  const seekTo = useCallback((time: number) => {
    setSeek(value => ({ sequence: value.sequence + 1, time }));
    setStats(value => ({ ...value, time }));
  }, []);
  useEffect(() => { playingValue.set(playing && !reduced); }, [playing, reduced, playingValue]);
  useEffect(() => { settingsValue.set(reduced ? { ...settings, entrance: false } : settings); }, [settings, reduced, settingsValue]);
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLElement &&
        (/^(INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY)$/.test(event.target.tagName) || event.target.isContentEditable)) return;
      if (event.code === "Space") { event.preventDefault(); togglePlaying(); }
      if (event.code === "KeyD") setInspector(value => !value);
      if (event.code === "Escape") setInspector(false);
      if (event.code === "KeyR") seekTo(0);
    };
    window.addEventListener("keydown",keydown); return () => window.removeEventListener("keydown",keydown);
  }, [seekTo,togglePlaying]);
  const slider = ([key,label,min,max,step]: Slider) => <label className="slider" key={key}>
    <span>{label}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={settings[key]}
      onChange={event => setSettings(value => ({ ...value, [key]: Number(event.target.value) }))} />
    <output>{settings[key].toFixed(2)}</output></label>;
  const reset = () => { setSettings(defaults()); setPlaying(false); seekTo(0); };
  const fallback = status.phase === "fallback";
  return <main className={`experiment${capture ? " capture-mode" : ""}`} aria-label="Wavefield"
    style={capture ? {width:captureWidth,height:captureHeight,minHeight:captureHeight} : undefined}>
    <div className={`wave-stage${fallback ? " is-fallback" : ""}`} data-testid="wave-stage">
      <WaveField playing={playingValue} settings={settingsValue} initialTime={initialTime} seek={seek}
        lossToken={lossToken} retry={retry} onStats={onStats} onStatus={onStatus} />
      {fallback && <div className="fallback" role="status"><span className="brand">Wavefield</span>
        <p>Static background · {status.reason}</p><p>{status.message}</p>
        <button onClick={() => setRetry(value => value + 1)}>Retry WebGPU</button></div>}
    </div>
    {!capture && <button className="inspector-trigger" onClick={() => setInspector(true)} aria-label="Open controls">Controls · D</button>}
    <AnimatePresence>{inspector && !capture && <motion.aside className="inspector" aria-label="Terrain controls"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: reduced ? 0 : 0.15 }}>
      <div className="inspector-heading"><h1>Wavefield <span>Terrain · 0.3-R1</span></h1>
        <button className="text-button" onClick={() => setInspector(false)} aria-label="Close controls">Close</button></div>
      <p className="renderer-status" data-testid="renderer-status" role="status">WebGPU · {status.phase}
        {status.reason && ` · ${status.reason}`}<span>{status.adapter || status.message}</span></p>
      {groups.map(group => <details key={group.name} open={group.name === "Landform"}>
        <summary>{group.name}</summary><div className="group-controls">{group.sliders.map(slider)}
        {group.name === "Landform" && <>
          <div className="seed"><label htmlFor="seed">Scene seed</label><input id="seed" value={seed} type="number" min="0" step="1" onChange={event=>setSeed(event.target.value)} />
            <button onClick={() => { const value=Number(seed); if (Number.isFinite(value)) setSettings(current=>({...current,hills:seededHills(value)})); }}>Apply</button></div>
          <button className="text-button" onClick={() => setSettings(value => ({...value,hills:STUDY_HILLS,phase:ARTICLE_PHASE}))}>Article reference preset</button>
          <p className="keyboard-hint">Numeric article preset derived from the public initializer. Scene seed generates Wavefield alternatives.</p>
          <label className="frame-limit">Hill<select aria-label="Hill" value={selectedHill} onChange={event=>setSelectedHill(Number(event.target.value))}>
            {[0,1,2,3].map(index=><option key={index} value={index}>{index+1}</option>)}</select></label>
          {([["x","Hill X",-6,6,0.1],["z","Hill Z",-4,4,0.1],["amplitude","Hill height",0,3,0.05],["width","Inverse span",0.15,1,0.01]] as const).map(([key,label,min,max,step])=><label className="slider" key={key}>
            <span>{label}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={settings.hills[selectedHill][key]}
              onChange={event=>setSettings(value=>({...value,hills:value.hills.map((hill,index)=>index===selectedHill?{...hill,[key]:Number(event.target.value)}:hill)}))} />
            <output>{settings.hills[selectedHill][key].toFixed(2)}</output></label>)}
        </>}
        </div></details>)}
      <details open><summary>Animation & sampling</summary><div className="group-controls">
        <div className="playback"><button onClick={togglePlaying} disabled={!!reduced || fallback}>{playing && !reduced ? "Pause" : "Play"}</button>
          <button onClick={reset}>Initial frame</button></div>
        {slider(["speed","Speed",0.1,2,0.05])}
        <div className="freeze-time"><label htmlFor="freeze-time">Freeze at time</label><input id="freeze-time" type="number" min="0" step="0.1" value={freezeTime} onChange={event=>setFreezeTime(event.target.value)} />
          <button onClick={()=>{const time=Number(freezeTime);if(Number.isFinite(time)&&time>=0){setPlaying(false);seekTo(time);}}}>Freeze</button></div>
        <label className="frame-limit">Frame limit<select aria-label="Frame limit" value={settings.frameLimit} onChange={event=>setSettings(value=>({...value,frameLimit:Number(event.target.value)}))}>
          <option value="12">12 submits / s</option><option value="24">24 submits / s</option></select></label>
        <label className="frame-limit">Grid quality<select aria-label="Grid quality" value={settings.quality} onChange={event=>setSettings(value=>({...value,quality:event.target.value as TerrainSettings["quality"]}))}>
          <option value="adaptive">Adaptive</option><option value="reference">192 × 112</option></select></label>
        <label className="frame-limit">Entrance fade<input aria-label="Entrance fade" type="checkbox" checked={settings.entrance} onChange={event=>setSettings(value=>({...value,entrance:event.target.checked}))} /></label>
        {reduced && <p className="keyboard-hint">Reduced motion: static preview.</p>}
      </div></details>
      <div className="stats" data-testid="frame-stats" aria-live="off"><span>{stats.time.toFixed(1)} s</span><span>{stats.fps.toFixed(1)} submit FPS</span><span>{stats.renderMs.toFixed(2)} CPU ms / submit</span>
        <span>{Math.round(stats.width)} × {Math.round(stats.height)} CSS</span><span>{stats.pixelWidth} × {stats.pixelHeight} px</span><span>DPR {stats.dpr.toFixed(2)}</span>
        <span className="draw-count">Submits: {stats.draws} · {stats.instances} segments</span><span className="draw-count">GPU execution time not measured</span></div>
      {status.phase === "ready" && <button className="text-button loss-test" onClick={()=>setLossToken(value=>value+1)}>Test device loss</button>}
      <p className="keyboard-hint">Space: play / pause · R: restart · D: controls</p>
    </motion.aside>}</AnimatePresence>
  </main>;
}
