/* The sound (web/README.md): an instance of cd2.wasm of its own, mixing the
 * demo's music exactly as the native build's audio thread does
 * (sound_render: the demo's player on float voices, or the card's bytes),
 * a little ahead of the speaker, into the worklet's queue (pcm-worklet.js)
 * through a MessagePort - the page's thread is never in the way, so a slow
 * frame on the page cannot starve the sound.
 *
 * It is made while the page loads (the music model takes about a second),
 * at 48 kHz; Start attaches the worklet and gives the device's rate.
 *
 *   page -> here    {type:"init", glue, module, exe}
 *                   {type:"attach", port, rate}  the worklet's port, the output's rate
 *                   {type:"seek", t, gen}      play from demo time t
 *                   {type:"pause"}             stop rendering (the worklet is silent)
 *                   {type:"modern", on}        M: modern / faithful mixer
 *                   {type:"live", on, fade}    the live end menu's tail (sound_live_tail)
 *   here -> page    {type:"ready", ok, ms} / {type:"attached", ok} / {type:"error", msg}
 *   worklet -> here {gen, consumed}            frames it has played of this generation
 */
"use strict";
const CHUNK = 1024;                     /* frames per message */
const LEAD = 0.12;                      /* seconds rendered ahead of the worklet */
let M = null, rate = 48000, port = null, buf = 0;
let gen = -1, t = 0, rendered = 0, consumed = 0, running = false;

function fill() {
  if (!running || !M || !port) return;
  while (rendered - consumed < LEAD * rate) {
    M._cd2_snd_render(t, buf, CHUNK);
    const s = M.HEAPF32.subarray(buf >> 2, (buf >> 2) + 2 * CHUNK);
    const l = new Float32Array(CHUNK), r = new Float32Array(CHUNK);
    for (let i = 0; i < CHUNK; i++) { l[i] = s[2 * i]; r[i] = s[2 * i + 1]; }
    port.postMessage({ type: "chunk", gen, t0: t, l, r }, [l.buffer, r.buffer]);
    t += CHUNK / rate;
    rendered += CHUNK;
  }
}

const queued = [];                      /* messages that came before the instance */
let initing = false;

async function init(m) {
  initing = true;
  try {
    const t0 = performance.now();
    importScripts(m.glue);
    M = await createCD2({
      instantiateWasm: (imports, done) => { WebAssembly.instantiate(m.module, imports).then((inst) => done(inst, m.module)); return {}; },
      print: () => {}, printErr: (s) => console.log("[sound] " + s),
    });
    M.FS.writeFile("/CD2.EXE", new Uint8Array(m.exe));
    const t1 = performance.now();
    M._cd2_snd_init(rate);
    buf = M._malloc(CHUNK * 2 * 4);
    postMessage({ type: "ready", ok: M._cd2_snd_ok(), ms: [t1 - t0, performance.now() - t1] });
    setInterval(fill, 10);
  } catch (err) {
    postMessage({ type: "error", msg: String(err && err.message || err) });
  }
  while (queued.length) handle(queued.shift());
}

function handle(m) {
  if (m.type === "attach") {
    port = m.port;
    port.onmessage = (ev) => { if (ev.data.gen === gen && ev.data.consumed > consumed) { consumed = ev.data.consumed; fill(); } };
    if (m.rate !== rate) { rate = m.rate; M._cd2_snd_init(rate); }
    postMessage({ type: "attached", ok: M._cd2_snd_ok() });
  } else if (m.type === "seek") {
    gen = m.gen; t = m.t; rendered = 0; consumed = 0; running = true;
    port.postMessage({ type: "flush", gen });
    fill();
  } else if (m.type === "pause") {
    running = false;
  } else if (m.type === "modern") {
    M._cd2_snd_modern(m.on ? 1 : 0);
  } else if (m.type === "live") {
    M._cd2_snd_live(m.on ? 1 : 0, m.fade);
  }
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") { if (!initing) init(m); return; }
  if (!M) { queued.push(m); return; }
  handle(m);
};
