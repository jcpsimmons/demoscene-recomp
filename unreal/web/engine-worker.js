/* The engine in a Web Worker (WASM.md). The main thread only paints and talks
 * to the audio; this thread runs unreal_step() flat out, with no per-frame
 * time budget, pacing itself against wall time so it stays at most a couple
 * of demo frames ahead of what is due:
 *
 *   main -> worker   {type:"load", engineUrl, module}
 *                                                PRELOAD (before init): the glue script
 *                                                (engineUrl, a blob URL of unreal.js) and
 *                                                the compiled wasm (a WebAssembly.Module);
 *                                                the instance is made at init, since the
 *                                                environment (the section) is fixed then
 *                    {type:"init", exe, env}     start the engine
 *                    {type:"clock", frame}       where the picture's clock is, in frames
 *   worker -> main   {type:"ready", pcmRate}
 *                    {type:"frame", n, idx, pal} every frame boundary (transferred)
 *                    {type:"pcm", n, samples}    that frame's sound (transferred)
 *                    {type:"ended"} / {type:"error", rc}
 *
 * Frames come from the engine's own per-boundary callback (Module.onFrame), so
 * none is missed even when step() returns late - see engine.c.
 */
"use strict";
const ENGINE = "../build/wasm/unreal.js";
let loaded = null;                  /* {module} after "load" (or at init without one) */

const FRAME_HZ = 70.086;
const W = 320, H = 200;
let M = null, pcmBuf = 0, pcmView = null, pcmRate = 0;
let frames = 0, ended = false, t0 = 0, clockFrame = -1, clockAt = 0;

function onFrame(n) {
  const ip = M._unreal_frame_idx(), pp = M._unreal_frame_pal();
  const idx = M.HEAPU8.slice(ip, ip + W * H), pal = M.HEAPU8.slice(pp, pp + 768);
  frames = n;
  postMessage({ type: "frame", n, idx, pal }, [idx.buffer, pal.buffer]);
  const got = M._unreal_pcm_take(pcmBuf, 65536);
  if (got) {
    const s = new Float32Array(got);
    for (let i = 0; i < got; i++) s[i] = (pcmView[i] - 128) / 128;
    postMessage({ type: "pcm", n, samples: s }, [s.buffer]);
  }
}

/* Which frame is due: the picture's clock as the main thread last reported
   it, extrapolated at the demo's rate since the report; before any report,
   wall time from the start. Only the LEAD depends on this. */
/* frames computed ahead of the clock: ~250 ms, room for any output latency
   and a busy browser (4 frames was not enough with Chrome 154) */
const LEAD = 18;

function dueFrame() {
  const now = performance.now();
  if (clockFrame >= 0) return Math.floor(clockFrame + (now - clockAt) / 1000 * FRAME_HZ);
  return Math.floor((now - t0) / 1000 * FRAME_HZ);
}

function run() {
  if (ended) return;
  const until = performance.now() + 50;        /* stay responsive to messages */
  while (!ended && frames < dueFrame() + LEAD && performance.now() < until) {
    const r = M._unreal_step();
    if (r !== 1) { ended = true; postMessage({ type: r === 2 ? "ended" : "error", rc: r }); return; }
  }
  setTimeout(run, frames >= dueFrame() + LEAD ? 4 : 0);
}

onmessage = async (e) => {
  const m = e.data;
  if (m.type === "clock") { clockFrame = m.frame; clockAt = performance.now(); return; }
  if (m.type === "load") {
    importScripts(m.engineUrl || ENGINE);
    loaded = { module: m.module || null };
    return;
  }
  if (m.type !== "init") return;
  if (!loaded) { importScripts(ENGINE); loaded = { module: null }; }
  const module = loaded.module;
  M = await createUnreal({
    /* the glue looks for unreal.wasm beside THIS script (/web/) unless told;
       it lives beside unreal.js */
    locateFile: (f) => "../build/wasm/" + f,
    /* the preloaded, already compiled module: instantiated here, not fetched */
    instantiateWasm: module ? (imports, done) => {
      WebAssembly.instantiate(module, imports).then((inst) => done(inst, module));
      return {};
    } : undefined,
    preRun: [(mod) => { for (const k in m.env) mod.ENV[k] = m.env[k]; }],
    onFrame, print: () => {}, printErr: (s) => console.log(s),
  });
  const exe = new Uint8Array(m.exe);
  const p = M._malloc(exe.length);
  M.HEAPU8.set(exe, p);
  const rc = M._unreal_init(p, exe.length);
  if (rc !== 0) { postMessage({ type: "error", rc }); return; }
  pcmBuf = M._malloc(65536);
  pcmView = M.HEAPU8.subarray(pcmBuf, pcmBuf + 65536);
  /* through the setup screens until the driver reports its rate */
  for (let i = 0; i < 400 && !ended; i++) {
    const r = M._unreal_step();
    if (r !== 1) { ended = true; break; }
    pcmRate = M._unreal_pcm_rate();
    if (pcmRate) break;
  }
  postMessage({ type: "ready", pcmRate, frames });
  t0 = performance.now();
  run();
};
