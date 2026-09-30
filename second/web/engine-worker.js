/* The engine in a Web Worker (WASM.md). The main thread only paints and talks
 * to the audio; this thread runs unreal_step() flat out, with no per-frame
 * time budget, pacing itself against wall time so it stays at most a couple
 * of demo frames ahead of what is due:
 *
 *   main -> worker   {type:"load", engineUrl, engine, module}
 *                                                PRELOAD (optional, before init): the glue
 *                                                script (engineUrl, a blob URL of engine's
 *                                                text) and the compiled wasm (module); the
 *                                                instance is made at init, since the
 *                                                engine's environment is fixed then
 *                    {type:"init", exe, files, env, engine, factory, settle, setupMax, lead}
 *                                                start the engine; files: [{name, data}],
 *                                                the demo's other files, put into the
 *                                                engine's file system at "/" first
 *                    {type:"clock", t}           where the picture's clock is, in demo seconds
 *   worker -> main   {type:"ready", pcmRate}
 *                    {type:"frame", n, t, d, w, h, idx, pal}
 *                                                every frame boundary (transferred)
 *                    {type:"pcm", n, t, d, samples}  that frame's sound (transferred)
 *                    {type:"ended"} / {type:"error", rc}
 *
 * TIME IS DEMO SECONDS, not frame numbers. A frame is labelled t = the
 * engine's time at its boundary (unreal_frame_time: the end of the frame that
 * was composed, so the start of its showing) and d = its length. For a demo
 * whose frames are all one length (Unreal: t = n / 70.086) this is the frame
 * number scaled, and every rule below reduces to the frame-number rule it
 * replaced; for one that reprograms the vertical total (Panic's 466-line
 * frames, 14.808 ms) it keeps picture and sound on the demo's own clock.
 *
 * Frames come from the engine's own per-boundary callback (Module.onFrame), so
 * none is missed even when step() returns late - see engine.c.
 */
"use strict";

const UNREAL_VGA_HZ = 70.086;       /* only for an engine that cannot report its time */
let M = null, pcmBuf = 0, pcmView = null, pcmRate = 0;
let frames = 0, ended = false, t0 = 0, clockT = -1, clockAt = 0;
let lastT = 0;
let loaded = null;                  /* {dir, module} after "load" (or at init without one) */
/* the start times of the newest LEAD frames: the lead rule below */
let LEAD = 4;
const recent = [];

/* Linear resampling of one chunk to the rate the audio was opened at - only
   if the driver moves its rate after "ready" (Unreal's never does). */
function resample(s, from, to) {
  if (from === to || !from) return s;
  const n = Math.max(1, Math.round(s.length * to / from)), o = new Float32Array(n), k = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * k, j = Math.floor(x), f = x - j;
    o[i] = j + 1 < s.length ? s[j] * (1 - f) + s[j + 1] * f : s[s.length - 1];
  }
  return o;
}

function onFrame(n) {
  const ip = M._unreal_frame_idx(), pp = M._unreal_frame_pal();
  const w = M._unreal_frame_w ? M._unreal_frame_w() : 320, h = M._unreal_frame_h ? M._unreal_frame_h() : 200;
  const t = M._unreal_frame_time ? M._unreal_frame_time() : n / UNREAL_VGA_HZ;
  const d = t - lastT;
  lastT = t;
  /* one palette, or (Second Reality's beam-accurate compose) one per row */
  const np = M._unreal_frame_pal_n ? M._unreal_frame_pal_n() : 1;
  const idx = M.HEAPU8.slice(ip, ip + w * h), pal = M.HEAPU8.slice(pp, pp + 768 * np);
  frames = n;
  recent.push(t); if (recent.length > LEAD) recent.shift();
  postMessage({ type: "frame", n, t, d, w, h, idx, pal }, [idx.buffer, pal.buffer]);
  const got = M._unreal_pcm_take(pcmBuf, 65536);
  if (got) {
    let s = new Float32Array(got);
    for (let i = 0; i < got; i++) s[i] = (pcmView[i] - 128) / 128;
    if (pcmRate) s = resample(s, M._unreal_pcm_rate(), pcmRate);
    postMessage({ type: "pcm", n, t, d, samples: s }, [s.buffer]);
  }
}

/* Where the picture's clock is, in demo seconds: as the main thread last
   reported it, extrapolated since the report; before any report, wall time
   from the start. Only the LEAD depends on this. */
function dueTime() {
  const now = performance.now();
  if (clockT >= 0) return clockT + (now - clockAt) / 1000;
  return (now - t0) / 1000;
}
/* Step while the frame LEAD-1 before the newest is already due: at most LEAD
   frames ahead of the clock (with constant frames, n < floor(due * Hz) + LEAD;
   Unreal's LEAD is 4). The clock is what is HEARD, so the lead must cover the
   audio output latency too, or the worklet's queue runs dry and the pinned
   clock stalls: a demo whose frames cost more (Panic at 175M) sets a larger
   one. The page's queue holds 12 frames, so LEAD stays well under that. */
function wantMore() { return recent.length < LEAD || recent[0] <= dueTime(); }

function run() {
  if (ended) return;
  const until = performance.now() + 50;        /* stay responsive to messages */
  while (!ended && wantMore() && performance.now() < until) {
    const r = M._unreal_step();
    if (r !== 1) { ended = true; postMessage({ type: r === 2 ? "ended" : "error", rc: r }); return; }
  }
  setTimeout(run, wantMore() ? 0 : 4);
}

onmessage = async (e) => {
  const m = e.data;
  if (m.type === "clock") { clockT = m.t; clockAt = performance.now(); return; }
  if (m.type === "load") {
    const engine = m.engine || "../build/wasm/unreal.js";
    importScripts(m.engineUrl || engine);
    loaded = { dir: engine.slice(0, engine.lastIndexOf("/") + 1), module: m.module || null };
    return;
  }
  if (m.type !== "init") return;
  if (!loaded) {
    const engine = m.engine || "../build/wasm/unreal.js";
    importScripts(engine);
    loaded = { dir: engine.slice(0, engine.lastIndexOf("/") + 1), module: null };
  }
  const dir = loaded.dir, module = loaded.module;
  M = await self[m.factory || "createUnreal"]({
    /* the glue looks for the .wasm beside THIS script (/web/) unless told;
       it lives beside the engine's .js */
    locateFile: (f) => dir + f,
    /* the preloaded, already compiled module: instantiated here, not fetched */
    instantiateWasm: module ? (imports, done) => {
      WebAssembly.instantiate(module, imports).then((inst) => done(inst, module));
      return {};
    } : undefined,
    preRun: [(mod) => { for (const k in m.env) mod.ENV[k] = m.env[k]; }],
    onFrame, print: () => {}, printErr: (s) => console.log(s),
  });
  /* the files a DOS program opens from its own directory (Second Reality's
     REALITY.FC, FCINFO10.TXT, README.1ST): the engine reads them from the
     current directory, "/". DOS names are case-blind and the program asks for
     "reality.fc" as well as "REALITY.FC"; MEMFS is not, so the lower-case
     name is a symlink to the file. */
  for (const f of m.files || []) {
    M.FS.writeFile("/" + f.name, new Uint8Array(f.data));
    const lower = f.name.toLowerCase();
    if (lower !== f.name) M.FS.symlink("/" + f.name, "/" + lower);
  }
  const exe = new Uint8Array(m.exe);
  const p = M._malloc(exe.length);
  M.HEAPU8.set(exe, p);
  const rc = M._unreal_init(p, exe.length);
  if (rc !== 0) { postMessage({ type: "error", rc }); return; }
  pcmBuf = M._malloc(65536);
  pcmView = M.HEAPU8.subarray(pcmBuf, pcmBuf + 65536);
  /* Through the setup screens until the driver reports the rate it plays at
     (at most setupMax frames; none = no sound). settle > 0: the rate must
     also have held for that many frames, for a driver that sets a probe rate
     first. The frames stepped here are posted as usual. */
  const settle = m.settle || 0, setupMax = m.setupMax || 400;
  LEAD = m.lead || 4;
  let rate = 0, held = 0;
  for (let i = 0; i < setupMax && !ended; i++) {
    const r = M._unreal_step();
    if (r !== 1) { ended = true; break; }
    const now = M._unreal_pcm_rate();
    held = now && now === rate ? held + 1 : 0;
    rate = now;
    if (rate && held >= settle) break;
  }
  pcmRate = rate;
  postMessage({ type: "ready", pcmRate, frames });
  t0 = performance.now();
  run();
};
