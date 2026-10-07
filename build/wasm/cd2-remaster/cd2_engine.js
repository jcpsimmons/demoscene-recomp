/* Crystal Dream 2, the modern rebuild, in the browser: THE ENGINE (web/README.md).
 *
 * Everything that plays the demo, with no page around it, so any page can
 * embed it: the standalone page (index.html + cd2_web.js) and the
 * demoscene-recomp site's "AI Remaster" option (its web/remaster.js) both
 * drive it through window.CD2Engine.
 *
 *   const eng = CD2Engine.create({ canvas, build, exe, ... });
 *   await eng.load();          everything, before it says ready (below)
 *   eng.start(frame);          inside the click (the AudioContext)
 *   eng.setPaused(v) / eng.stop() / eng.keydown(e) / eng.grab() ...
 *   eng.setRenderSize([w, h] | null)  draw at that size instead of the canvas box's
 *
 * The page's thread runs one instance of cd2.wasm (src/main.c +
 * src/web/web_host.c) that draws every picture with WebGL2 at the canvas's
 * device pixels, once per requestAnimationFrame, at the demo position the
 * clock gives:
 *
 *   THE CLOCK is the sound, as in the native build: a second instance of
 *   the wasm in a worker (audio-worker.js) mixes the music into an
 *   AudioWorklet (pcm-worklet.js), which pins "at context time T the sound
 *   was at demo time D"; getOutputTimestamp turns that into the demo time
 *   AT THE SPEAKER, and the picture shows that time - so picture and music
 *   stay locked at any refresh rate. Every jump seeks the sound; a pause
 *   stops it and the resume restarts it where the picture is. Without
 *   sound (nosound, or no AudioWorklet) the wall clock runs the picture.
 *   Mute only silences the output: the clock is still the sound's.
 *
 *   THE BITMAPS ARE ALL LOADED BEFORE READY. load() downloads every
 *   AI-upscaled picture of build/upscaled (tools/webpack.py), decodes them
 *   in workers (decode-worker.js) and, bitmap by bitmap, writes the decoded
 *   files into the wasm's file system and has the wasm make their textures
 *   at once (cd2_web_ups_upload), after which the files are deleted - only
 *   the textures stay. The fractal's ring strip (build/fracrings/, one
 *   lossless WebP per layer) comes the same way and goes straight into its
 *   texture (cd2_web_frac_begin / cd2_web_frac_layer); manifest.bytes
 *   counts it. Nothing is downloaded or decoded while the demo
 *   plays; a draw that ever finds a bitmap missing is counted (stats().misses).
 *   Every bitmap the demo registers - the parts' own, the setup's pages, the
 *   intro's pictures, the end menu's - is registered first
 *   (cd2_web_ups_register), so stats() can say that all of them are up.
 *
 * Options of create():
 *   canvas      the <canvas> to draw on (it gets an id if it has none: the
 *               wasm finds it by selector)
 *   build       URL of the build folder: cd2.js, cd2.wasm, upscaled/
 *               (default ../build/web/ from this script)
 *   scripts     URL of the folder with audio-worker.js, decode-worker.js,
 *               pcm-worklet.js (default: this script's)
 *   exe         the demo's CD2.EXE: an ArrayBuffer, or its URL
 *   env         {K: V} native knobs (CD2_NO_UPSCALE, CD2_FRACSCALE, ...)
 *   nosound     the wall clock runs the picture
 *   size        [w, h]: the canvas's pixels, fixed (a test)
 *   fracCompute the fractal computed live (the set-aside renderer) instead
 *               of drawn from the stored ring strip; also the page URL's
 *               ?frac=compute or env CD2_FRAC=compute. The strip
 *               (build/fracrings/, manifest.fracrings) is then not loaded.
 *   onProgress(fraction 0..1, text)    while loading
 *   onStatus(text)                     twice a second while playing
 *   onPause(paused)                    a pause or resume (also by key)
 *   onEnded(why)                       the run ended (the end, or Quit)
 *   onFrame()                          right after each frame is drawn
 *
 * eng.T is the state for a test driver (pos, fps, ups, mem, cpuHist, ...).
 */
"use strict";
(() => {
  const HERE = document.currentScript ? new URL(".", document.currentScript.src).href : location.href;
  const HZ = 70.086, LAST = 36736;
  /* the start points the menu offers: the parts and scenes, in whole-run frames */
  const SECTIONS = [
    [1, "The whole demo"], [763, "Intro"], [4194, "Glenz and the vector objects"], [12526, "Plasma"],
    [13373, "Check this out (the fractal)"], [15787, "Vectorslime"], [16931, "Virtual Reality"],
    [21824, "Pictures and the torus"], [23395, "Vector World"], [26021, "The scroller"],
    [27477, "Last Event (chess)"], [36004, "The end menu"],
  ].map(([value, label]) => ({ value, label }));
  /* the live end menu's keys, in the demo's codes (web_host.c cd2_web_key) */
  const LIVE_KEYS = { ArrowUp: 0xB9, ArrowDown: 0xBA, PageUp: 0xB5, PageDown: 0xB6, Enter: 0xBD, NumpadEnter: 0xBD, Space: 0x20, Escape: 0x1B };
  let instances = 0;

  function create(opt) {
    opt = opt || {};
    const canvas = opt.canvas;
    /* the browser can take the GPU back (a phone short of memory): the
       picture then stays black while the sound plays on - say so */
    let glLost = false;
    canvas.addEventListener("webglcontextlost", () => { glLost = true; try { console.warn("cd2: WebGL context lost"); } catch (e) {} });
    canvas.addEventListener("webglcontextrestored", () => { try { console.warn("cd2: WebGL context restored (the picture does not come back without a reload)"); } catch (e) {} });
    if (!canvas.id) canvas.id = "cd2-engine-" + (++instances);
    const BUILD = new URL(opt.build || new URL("../build/web/", HERE).href, location.href).href;
    const SCRIPTS = new URL(opt.scripts || HERE, location.href).href;
    const progress = opt.onProgress || (() => {}), statusCb = opt.onStatus || (() => {});
    const T = { log: [], errors: 0, mem: { wasmPeak: 0, jsHeapPeak: 0, heldPeak: 0 } };
    T.stats = () => stats();        /* for a test driver: the live counts (misses, refused, ...) */
    const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ": HTTP " + r.status); return r; };
    /* the fractal: the stored ring strip (default), or the set-aside compute
       renderer - opt.fracCompute, env CD2_FRAC=compute, or the page's URL
       ?frac=compute (any page that embeds the engine); then the strip is
       not downloaded */
    const fracCompute = !!(opt.fracCompute || (opt.env && opt.env.CD2_FRAC === "compute") ||
                           new URLSearchParams(location.search).get("frac") === "compute");

    let M = null, wasmModule = null, glueUrl = null, exeBuf = null, manifest = null, loading = null;
    let muted = false;

    /* ---- the bitmaps: every one downloaded, decoded and uploaded in load() */
    const ups = new Map();          /* name -> {files, bytes, blobs, got, decoded, ready, failed} */
    let dlBytes = 0, dlTotal = 0, upBytes = 0, held = 0, uploadsOn = false, upsDone = null;
    const toUpload = [];

    function upsAvail(name) {
      const b = ups.get(name);
      if (!b || b.failed) return -1;
      if (b.ready) return 1;
      if (T.ready) T.upsMisses = (T.upsMisses || 0) + 1;    /* never, with everything preloaded */
      return 0;
    }

    function sampleMem() {
      const m = T.mem;
      if (M && M.HEAPU8) m.wasmPeak = Math.max(m.wasmPeak, M.HEAPU8.buffer.byteLength);
      if (performance.memory) m.jsHeapPeak = Math.max(m.jsHeapPeak, performance.memory.usedJSHeapSize);
      m.heldPeak = Math.max(m.heldPeak, held);
    }

    let progStage = 0;              /* the program's share: 0..1 */
    function report(text) {
      const f = 0.1 * progStage + (dlTotal ? 0.45 * dlBytes / dlTotal + 0.45 * upBytes / dlTotal : 0.9 * progStage);
      progress(Math.min(1, f), text);
    }

    function bitmapsLoad() {
      const list = (manifest && manifest.bitmaps || []).map((b) => ({ name: b.name, files: b.files }));
      /* the fractal's ring strip (manifest.fracrings, tools/webpack.py):
         one entry per layer, through the same downloads and decoders, made
         a texture layer by cd2_web_frac_layer - unless the set is computed */
      const fr = manifest && manifest.fracrings;
      if (fr && !fracCompute) {
        for (const f of fr.files) list.push({ name: "fracrings:" + f.layer, kind: "rings", layer: f.layer, dir: "fracrings/",
                                             files: [{ name: f.name.replace(/\.webp$/, ""), bytes: f.bytes }] });
      }
      if (!list.length) { T.upscaled = "none"; return Promise.resolve(); }
      for (const b of list) ups.set(b.name, { name: b.name, kind: b.kind, layer: b.layer, dir: b.dir || "upscaled/", files: b.files,
                                              bytes: b.files.reduce((s, f) => s + f.bytes, 0),
                                              blobs: new Map(), got: 0, decoded: null, ready: false, failed: false });
      dlTotal = manifest.bytes - (fr && fracCompute ? fr.bytes : 0);
      const nDec = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
      const decoders = [];
      for (let i = 0; i < nDec; i++) decoders.push({ w: new Worker(new URL("decode-worker.js", SCRIPTS)), busy: false });
      const DECODE_CAP = 160e6;     /* decoded bytes waiting for the wasm (only before it is up) */
      let left = ups.size;
      return new Promise((resolve) => {
        upsDone = () => { if (--left === 0) { decoders.forEach((d) => d.w.terminate()); resolve(); } };
        const decodeNext = () => {
          for (const d of decoders) {
            if (d.busy || held > DECODE_CAP) continue;
            let pick = null;
            for (const b of ups.values()) if (!b.decoding && !b.decoded && !b.ready && !b.failed && b.got === b.files.length) { pick = b; break; }
            if (!pick) return;
            pick.decoding = true; d.busy = true;
            const files = pick.files.slice(), out = [];
            const one = () => {
              const f = files.shift();
              if (!f) {
                d.busy = false; pick.decoding = false; pick.decoded = out; pick.blobs = null;
                toUpload.push(pick); flushUploads(); decodeNext(); return;
              }
              d.w.onmessage = (e) => {
                const m = e.data;
                if (m.error) {
                  console.warn("upscaled " + m.name + ": " + m.error);
                  pick.failed = true; pick.decoding = false; pick.blobs = null; d.busy = false;
                  out.forEach((x) => { held -= x.data.length; });
                  upBytes += pick.bytes; report(); upsDone(); decodeNext(); return;
                }
                out.push({ name: m.name, data: m.data }); held += m.data.length; sampleMem();
                one();
              };
              d.w.postMessage({ name: pick.kind === "rings" ? f.name + ".u16" : f.name, blob: pick.blobs.get(f.name) });
            };
            one();
          }
        };
        /* the downloads: in the manifest's order (the demo's), six at a time */
        const queue = [];
        for (const b of ups.values()) for (const f of b.files) queue.push([b, f]);
        const t0 = performance.now();
        let active = 0;
        const next = () => {
          while (active < 6 && queue.length) {
            const [b, f] = queue.shift();
            active++;
            /* typed here: a server that does not know .webp (application/octet-stream) is fine */
            get(BUILD + b.dir + f.name + ".webp").then((r) => r.arrayBuffer()).then((ab) => new Blob([ab], { type: "image/webp" })).then((blob) => {
              b.blobs.set(f.name, blob); b.got++; dlBytes += blob.size;
            }).catch((e) => {
              if (!b.failed) { b.failed = true; upBytes += b.bytes; upsDone(); }
              console.warn("upscaled " + f.name + ": " + e.message);
            }).finally(() => {
              active--;
              if (!queue.length && !active) T.downloadMs = performance.now() - t0;
              report(`AI-upscaled bitmaps: ${(dlBytes / 1e6).toFixed(1)} of ${(dlTotal / 1e6).toFixed(1)} MB`);
              next(); decodeNext();
            });
          }
        };
        next();
      });
    }

    /* a decoded layer of the ring strip into the wasm's memory and its
       texture (fractal.c fractal_rings_layer: level 0 and the mips); the
       texture made for the strip's height first (cd2_web_frac_begin) */
    let ringsPtr = 0, ringsLen = 0, ringsLeft = -1;
    function ringsUpload(b) {
      const fr = manifest.fracrings, data = b.decoded[0].data;
      held -= data.length; b.decoded = null;
      try {
        if (ringsLeft < 0) {
          const n = M._cd2_web_frac_begin(fr.H);
          if (n !== fr.layers) throw new Error(`the strip has ${fr.layers} layers, this build expects ${n} (webpack.py and the build disagree)`);
          ringsLeft = n;
        }
        if (data.length !== fr.N * fr.HL * 2) throw new Error("layer " + b.layer + ": " + data.length + " bytes");
        if (!ringsPtr) { ringsLen = data.length; ringsPtr = M._malloc(ringsLen); }
        M.HEAPU8.set(data, ringsPtr);
        if (!M._cd2_web_frac_layer(b.layer, ringsPtr)) throw new Error("layer " + b.layer + " not taken");
        b.ready = true;
        if (--ringsLeft === 0) { M._free(ringsPtr); ringsPtr = 0; }
      } catch (e) { b.failed = true; console.warn("fractal ring strip: " + e.message); }
      upBytes += b.bytes;
      sampleMem();
      report(`AI-upscaled bitmaps: ${(dlBytes / 1e6).toFixed(1)} of ${(dlTotal / 1e6).toFixed(1)} MB`);
    }

    /* a decoded bitmap into the file system and straight to textures; its
       files deleted (upscale.c deletes what it read; anything left here) */
    function flushUploads() {
      if (!uploadsOn) return;
      while (toUpload.length) {
        const b = toUpload.shift();
        const t0 = performance.now();
        if (b.kind === "rings") { ringsUpload(b); T.uploadMs = (T.uploadMs || 0) + performance.now() - t0; upsDone(); continue; }
        try {
          for (const f of b.decoded) M.FS.writeFile("/upscaled/" + f.name, f.data);
        } catch (e) { b.failed = true; console.warn("upscaled " + b.name + ": " + e.message); }
        for (const f of b.decoded) held -= f.data.length;
        b.decoded = null;
        sampleMem();
        if (!b.failed) {
          b.ready = true;                                   /* upsAvail: 1, so ups_ready reads them */
          const n = M.ccall("cd2_web_ups_upload", "number", ["string"], [b.name]);
          if (n === 0) { b.failed = true; console.warn("upscaled " + b.name + ": not loaded (see above)"); }
          else if (n < 0) T.upsUnused = (T.upsUnused || []).concat(b.name);   /* in the cache, drawn by nothing */
        }
        for (const f of b.files) { try { M.FS.unlink("/upscaled/" + f.name); } catch (e) {} }
        T.uploadMs = (T.uploadMs || 0) + performance.now() - t0;
        upBytes += b.bytes;
        sampleMem();
        report(`AI-upscaled bitmaps: ${(dlBytes / 1e6).toFixed(1)} of ${(dlTotal / 1e6).toFixed(1)} MB`);
        upsDone();
      }
    }

    /* ---- load: the program, the demo's data, every bitmap -------------- */
    function load() {
      if (!loading) loading = doLoad().catch((e) => { T.fatal = String(e && e.message || e); throw e; });
      return loading;
    }

    async function doLoad() {
      const t0 = performance.now();
      report("the program");
      const compile = async () => {
        const r = await get(BUILD + "cd2.wasm");
        /* the build's fingerprint (screenshots): the SHA-256 of these bytes */
        if (crypto && crypto.subtle) r.clone().arrayBuffer().then((b) => crypto.subtle.digest("SHA-256", b))
          .then((h) => { eng.wasmSha = [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join(""); }).catch(() => {});
        if (WebAssembly.compileStreaming && /application\/wasm/.test(r.headers.get("Content-Type") || "")) return WebAssembly.compileStreaming(r);
        return WebAssembly.compile(await r.arrayBuffer());
      };
      const glue = async () => URL.createObjectURL(new Blob([await (await get(BUILD + "cd2.js")).text()], { type: "text/javascript" }));
      const exe = async () => {
        if (opt.exe instanceof ArrayBuffer) return opt.exe;
        try { return await (await get(new URL(opt.exe || "../CD2.EXE", location.href).href)).arrayBuffer(); }
        catch (e) { throw new Error("the demo's CD2.EXE is not served (" + e.message + ")"); }
      };
      manifest = await (await get(BUILD + "upscaled/manifest.json")).json().catch(() => null);
      const texts = Promise.all(((manifest && manifest.texts) || []).map(async (n) => {
        try { return [n, new Uint8Array(await (await get(BUILD + "upscaled/" + n)).arrayBuffer())]; } catch (e) { return null; }
      }));
      const bitmaps = opt.env && opt.env.CD2_NO_UPSCALE ? Promise.resolve() : bitmapsLoad();
      [wasmModule, glueUrl, exeBuf] = await Promise.all([compile(), glue(), exe()]);
      progStage = 0.4; report("the program");
      preloadSound();
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = glueUrl; s.onload = res; s.onerror = () => rej(new Error("cd2.js")); document.head.appendChild(s); });
      const env = Object.assign({}, opt.env || {});
      if (fracCompute) env.CD2_FRAC = "compute";
      const factory = window.createCD2;
      M = await factory({
        instantiateWasm: (imports, done) => { WebAssembly.instantiate(wasmModule, imports).then((inst) => done(inst, wasmModule)); return {}; },
        preRun: [(mod) => { for (const k in env) mod.ENV[k] = env[k]; }],
        print: (s) => { console.log(s); T.log.push(s); },
        printErr: (s) => { console.warn(s); T.log.push(s); },
      });
      M.FS.writeFile("/CD2.EXE", new Uint8Array(exeBuf));
      M.FS.mkdir("/upscaled");
      for (const t of await texts) if (t) M.FS.writeFile("/upscaled/" + t[0], t[1]);   /* the CRCs, the intro's index */
      M.upsAvail = upsAvail;
      progStage = 0.6; report("preparing the parts");
      await new Promise((r) => setTimeout(r, 0));
      M._cd2_web_load();
      if (M._cd2_web_state() !== 1) throw new Error("CD2.EXE: not Crystal Dream 2's (no archive)");
      M._cd2_web_init_parts();
      if (M._cd2_web_state() !== 2) throw new Error("the parts' init failed");
      sizeCanvas();
      const sel = M.stringToNewUTF8("#" + CSS.escape(canvas.id));
      M._cd2_web_init_gl(sel);
      M._free(sel);
      if (M._cd2_web_state() !== 3) throw new Error("no WebGL2 here");
      const flags = M._cd2_web_flags();
      T.flags = flags; T.timerQuery = !!(flags & 4);
      T.glErrors = M._cd2_web_gl_errors();
      if (T.glErrors) console.error(T.glErrors + " shader(s) did not compile - see above");
      if (flags & 1) console.warn("EXT_color_buffer_float is missing: the fractal cannot draw here");
      progStage = 0.8; report("registering the bitmaps");
      await new Promise((r) => setTimeout(r, 0));
      const tr = performance.now();
      M._cd2_web_ups_register();                            /* the setup's, the intro's, the end menu's (1-2 s) */
      T.registerMs = performance.now() - tr;
      progStage = 1; report("AI-upscaled bitmaps");
      uploadsOn = true; flushUploads();
      await bitmaps;
      /* anything registered that the cache does not have: tried now, so it
         is known (unavailable) rather than pending */
      for (let i = 0, n = M._cd2_web_ups_count(); i < n; i++) {
        const nm = M.UTF8ToString(M._cd2_web_ups_name(i));
        if (M._cd2_web_ups_state() === 0) M.ccall("cd2_web_ups_upload", "number", ["string"], [nm]);
      }
      T.ups = stats();
      T.loadMs = performance.now() - t0;
      sampleMem();
      pos = startFrame(opt.from || 1); moved = true;
      drawOnce();
      T.ready = true;
      report("ready");
      return T;
    }

    function stats() {
      if (!M) return null;
      const s = (i) => M._cd2_web_ups_stat(i);
      const names = [];
      for (let i = 0, n = M._cd2_web_ups_count(); i < n; i++) {
        const nm = M.UTF8ToString(M._cd2_web_ups_name(i));
        if (M._cd2_web_ups_state() <= 0) names.push(nm);
      }
      return { registered: s(0), uploaded: s(1), unavailable: s(2), pending: s(3), notUp: names,
               texBytes: s(4), texBytesRaw: s(5), misses: s(6) + (T.upsMisses || 0), refused: s(7),
               manifestBitmaps: [...ups.values()].filter((b) => !b.kind).length, failed: [...ups.values()].filter((b) => b.failed).map((b) => b.name),
               downloadBytes: dlBytes,
               fracRings: M._cd2_web_frac_state() };    /* the fractal: 1 the ring strip, 0 computed */
    }

    /* ---- the canvas: the box's device pixels ------------------------- */
    let cw = 0, ch = 0;
    const fixed = opt.size || null;
    let override = null;                        /* setRenderSize: [w, h] while a mirror needs that size (iPhone video fullscreen) */
    function sizeCanvas() {
      if (fixed) { cw = fixed[0]; ch = fixed[1]; }
      else if (!cw) { const r = canvas.getBoundingClientRect(); cw = Math.round(r.width * devicePixelRatio); ch = Math.round(r.height * devicePixelRatio); }
      if (cw < 1 || ch < 1) { cw = 640; ch = 480; }
      const w = override ? override[0] : cw, h = override ? override[1] : ch;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    if (!fixed && window.ResizeObserver) {
      const ro = new ResizeObserver((es) => {
        const e = es[0];
        if (e.devicePixelContentBoxSize && e.devicePixelContentBoxSize[0]) { cw = e.devicePixelContentBoxSize[0].inlineSize; ch = e.devicePixelContentBoxSize[0].blockSize; }
        else { cw = Math.round(e.contentRect.width * devicePixelRatio); ch = Math.round(e.contentRect.height * devicePixelRatio); }
        if (cw < 1 || ch < 1) return;                       /* hidden: keep the last size */
        if (!running || paused) drawOnce();
      });
      try { ro.observe(canvas, { box: "device-pixel-content-box" }); } catch (e) { ro.observe(canvas); }
    }

    /* ---- the sound ----------------------------------------------------- */
    let audio = null, node = null, gainNode = null, sworker = null, soundOk = false, soundModern = true;
    let gen = 0, pinGen = -1, pinD = 0, pinT = 0;

    function audioTimeAt(perf) {
      if (audio.getOutputTimestamp) {
        const ts = audio.getOutputTimestamp();
        if (ts && ts.contextTime !== undefined && ts.performanceTime) return ts.contextTime + (perf - ts.performanceTime) / 1000;
      }
      return audio.currentTime - (audio.outputLatency || audio.baseLatency || 0) + (perf - performance.now()) / 1000;
    }

    /* the sound worker and its music model, while the page loads */
    let soundReady = null, soundAttached = null, soundTried = false;
    function preloadSound() {
      if (opt.nosound || !window.AudioWorkletNode) return;
      sworker = new Worker(new URL("audio-worker.js", SCRIPTS));
      soundReady = new Promise((res) => {
        sworker.onmessage = (e) => {
          const m = e.data;
          if (m.type === "ready") { T.soundInitMs = m.ms; res(!!m.ok); }
          else if (m.type === "attached") { if (soundAttached) soundAttached(!!m.ok); }
          else if (m.type === "error") { console.error("sound: " + m.msg); res(false); if (soundAttached) soundAttached(false); }
        };
      });
      const exe = exeBuf.slice(0);
      sworker.postMessage({ type: "init", glue: glueUrl, module: wasmModule, exe }, [exe]);
    }

    /* synchronous up to the first await: the AudioContext is made inside the click */
    async function openSound() {
      if (opt.nosound || !window.AudioContext || !window.AudioWorkletNode) return false;
      try {
        audio = new AudioContext({ latencyHint: "interactive" });
        const resumed = audio.resume();
        await audio.audioWorklet.addModule(new URL("pcm-worklet.js", SCRIPTS).href);
        node = new AudioWorkletNode(audio, "cd2-pcm", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        gainNode = audio.createGain();
        gainNode.gain.value = muted ? 0 : 1;
        node.connect(gainNode).connect(audio.destination);
        const chn = new MessageChannel();
        node.port.postMessage({ type: "port", port: chn.port2 }, [chn.port2]);
        node.port.onmessage = (e) => { const p = e.data; if (p.gen === gen) { pinGen = p.gen; pinD = p.d; pinT = p.t; } };
        if (!sworker) preloadSound();
        const attached = new Promise((res) => { soundAttached = res; });
        sworker.postMessage({ type: "attach", port: chn.port1, rate: audio.sampleRate }, [chn.port1]);
        await resumed;
        const ok = (await soundReady) && (await attached);
        T.audioRate = audio.sampleRate; T.audioState = audio.state;
        return ok;
      } catch (e) {
        console.error("sound: " + e.message);
        return false;
      }
    }

    /* ---- the clock and the run ----------------------------------------- */
    let running = false, paused = false, pos = 1, moved = true, faithful = false, ended = false, runGen = 0;
    let wallPos = 1, wallAt = 0, rafId = 0;
    let lastTs = 0, frameMs = 0, refreshMs = 1000 / 60, dts = [];
    let live = 0, lastFade = -2, frames = 0, fpsAt = 0, fpsFrames = 0, fps = 0;

    function startFrame(f) { f = parseInt(f, 10); return f >= 1 ? f : 1; }

    function demoPos(perf) {
      if (soundOk) {
        if (pinGen === gen) return (pinD + (audioTimeAt(perf) - pinT)) * HZ;
        return wallPos;                       /* the sound is starting: hold the picture */
      }
      return wallPos + (perf - wallAt) / 1000 * HZ;
    }

    function seek(p) {
      pos = wallPos = Math.max(1, p); wallAt = performance.now(); moved = true;
      if (soundOk && !paused) { gen++; pinGen = -1; sworker.postMessage({ type: "seek", t: pos / HZ, gen }); }
    }

    function soundStop() { if (soundOk) { gen++; node.port.postMessage({ type: "pause", gen }); sworker.postMessage({ type: "pause" }); } }

    function setPaused(v) {
      v = !!v;
      if (v === paused || !running) return;
      paused = v;
      if (v) { pos = Math.floor(pos); soundStop(); }
      else {
        if (soundOk) node.port.postMessage({ type: "resume" });
        seek(pos);
      }
      T.paused = paused;
      if (opt.onPause) opt.onPause(paused);
      if (paused) statusCb(statusLine());
    }

    function drawOnce() {
      if (!M || M._cd2_web_state() !== 3) return;
      sizeCanvas();
      M._cd2_web_frame(pos, moved ? 1 : 0, faithful ? 1 : 0, canvas.width, canvas.height, 0, refreshMs);
      moved = false;
    }

    function finish(why) {
      running = false; ended = true; paused = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      soundStop();
      T.ended = why;
      statusCb(why);
      if (opt.onEnded) opt.onEnded(why);
    }

    function statusLine() {
      const n = Math.floor(pos);
      return `frame ${n} (${(n / HZ).toFixed(2)} s)  ${(M && M.UTF8ToString(M._cd2_web_scene(n))) || (live ? "menu" : "")}` +
        `${live ? " (your keys)" : ""}  -  ${faithful ? "original pixels" : "modern"}, ` +
        `${!soundOk ? "no sound (wall clock)" : (muted ? "muted" : soundModern ? "modern sound" : "original sound")}` +
        `  -  ${fps.toFixed(0)} fps at ${canvas.width}x${canvas.height}${paused ? "  -  paused" : ""}` +
        (glLost ? "  -  GRAPHICS LOST: the browser took back the GPU (memory?) - reload the page" : "");
    }

    function tick(ts) {
      if (!running) return;
      rafId = requestAnimationFrame(tick);
      if (lastTs) {
        frameMs = ts - lastTs;
        dts.push(frameMs); if (dts.length > 120) dts.shift();
        const s = dts.slice().sort((a, b) => a - b);
        refreshMs = Math.max(4, s[Math.floor(s.length * 0.1)]);
      }
      lastTs = ts;
      if (!paused) pos = demoPos(performance.now());
      if (pos < 1) pos = 1;
      if (pos >= LAST + 1 && !live) { finish("the demo has ended"); return; }
      sizeCanvas();
      const c0 = performance.now();
      M._cd2_web_frame(pos, moved ? 1 : 0, faithful ? 1 : 0, canvas.width, canvas.height, frameMs, refreshMs);
      const cpu = performance.now() - c0;
      if (cpu > (T.maxCpuMs || 0)) { T.maxCpuMs = cpu; T.maxCpuAt = Math.floor(pos); }
      T.cpuHist = T.cpuHist || [0, 0, 0, 0, 0, 0];
      T.cpuHist[cpu < 4 ? 0 : cpu < 8 ? 1 : cpu < 16 ? 2 : cpu < 33 ? 3 : cpu < 66 ? 4 : 5]++;
      if (cpu >= 33) (T.slow = T.slow || []).push([Math.floor(pos), Math.round(cpu)]);
      moved = false;
      frames++;
      if (opt.onFrame) opt.onFrame();               /* right after drawing: the canvas can be copied (a video mirror) */
      /* the live end menu: its music plays on, its Quit fades and ends */
      const lv = M._cd2_web_live();
      if (lv !== live) {
        live = lv; lastFade = -2;
        if (soundOk) sworker.postMessage({ type: "live", on: lv, fade: lv ? 1e18 : 0 });
      }
      if (live) {
        const fade = M._cd2_web_fade();
        if (fade >= 0 && fade !== lastFade && soundOk) sworker.postMessage({ type: "live", on: 1, fade });
        lastFade = fade;
        if (M._cd2_web_quit()) { finish("the end (Quit)"); return; }
      }
      const now = performance.now();
      if (now - fpsAt >= 500) {
        if (fpsAt) fps = (frames - fpsFrames) * 1000 / (now - fpsAt);
        fpsAt = now; fpsFrames = frames;
        statusCb(statusLine());
        if (frames % 16 === 0) sampleMem();
      }
      T.fracScale = M._cd2_web_frac_scale();
      T.pos = pos; T.frames = frames; T.fps = fps; T.paused = paused; T.live = live; T.pinned = pinGen === gen;
    }

    /* start (or restart) at frame `from`: call it INSIDE the click - the
       AudioContext is opened synchronously on the first start */
    async function start(from) {
      if (!M || !T.ready) return;
      from = startFrame(from);
      if (running) { if (paused) setPaused(false); seek(from); return; }
      const g = ++runGen;
      running = true; ended = false; paused = false; live = 0;
      pos = wallPos = from; wallAt = performance.now(); moved = true;
      if (audio === null && !soundTried) {
        soundTried = true;
        statusCb("starting the sound...");
        soundOk = await openSound();
        T.sound = soundOk;
        if (g !== runGen || !running) return;
      }
      if (soundOk) {
        if (audio.state === "suspended") { try { await audio.resume(); } catch (e) {} }
        node.port.postMessage({ type: "resume" }); sworker.postMessage({ type: "modern", on: soundModern });
      }
      seek(from);
      if (opt.startPaused) setPaused(true);
      lastTs = 0;
      rafId = requestAnimationFrame(tick);
    }

    /* stop: back to ready, the picture stays where it was */
    function stop() {
      runGen++;
      if (!running && !ended) return;
      running = false; paused = false; ended = false; T.paused = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      soundStop();
      if (live) { live = 0; if (soundOk) sworker.postMessage({ type: "live", on: 0, fade: 0 }); }
    }

    /* keys: the end menu's while it is live, else the player's. True if taken. */
    function keydown(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return false;
      if (e.target && e.target.tagName === "SELECT") return false;
      if (!running) return false;
      if (live && LIVE_KEYS[e.code] !== undefined) { M._cd2_web_key(LIVE_KEYS[e.code], 1); return true; }
      const step = (d) => { setPaused(true); pos = Math.max(1, Math.floor(pos) + d); moved = true; drawOnce(); };
      const jump = (p) => { if (paused) { pos = Math.max(1, p); moved = true; drawOnce(); } else seek(p); };
      switch (e.key) {
        case " ": setPaused(!paused); break;
        case "o": case "O": setFaithful(!faithful); break;
        case "m": case "M": soundModern = !soundModern; if (soundOk) sworker.postMessage({ type: "modern", on: soundModern }); break;
        case "ArrowRight": step(1); break;
        case "ArrowLeft": step(-1); break;
        case "PageDown": jump(pos + 10 * HZ); break;
        case "PageUp": jump(pos - 10 * HZ); break;
        case "n": case "N": { const l = M._cd2_web_scene_last(Math.floor(pos)); if (l > 0) jump(l + 1); break; }
        case "b": case "B": {
          const f = M._cd2_web_scene_first(Math.floor(pos)), q = f > 1 ? M._cd2_web_scene_first(f - 1) : -1;
          jump(q > 0 ? q : Math.max(1, f)); break;
        }
        default: return false;
      }
      return true;
    }
    function keyup(e) {
      if (running && live && LIVE_KEYS[e.code] !== undefined) { M._cd2_web_key(0, 0); return true; }
      return false;
    }

    function setFaithful(v) { faithful = !!v; if (opt.onFaithful) opt.onFaithful(faithful); if (!running || paused) drawOnce(); }
    function setMute(v) { muted = !!v; if (gainNode) gainNode.gain.value = muted ? 0 : 1; }

    /* the picture at the current position, read back right after drawing
       it: the rectangle the demo drew into (4:3, or the canvas's width for
       a wide part), at its render resolution */
    function grabPixels() {
      drawOnce();
      const ctx = canvas.getContext("webgl2"), W = canvas.width, H = canvas.height;
      let vx, vy, vw, vh;
      if (M._cd2_web_rect && M._cd2_web_rect(2) > 0) {      /* the rectangle drawn: wide when a wide part drew it */
        vx = M._cd2_web_rect(0); vy = M._cd2_web_rect(1); vw = M._cd2_web_rect(2); vh = M._cd2_web_rect(3);
      } else {
        if (W * 3 > H * 4) { vh = H; vw = Math.floor(H * 4 / 3); } else { vw = W; vh = Math.floor(W * 3 / 4); }
        vx = Math.floor((W - vw) / 2); vy = Math.floor((H - vh) / 2);
      }
      const px = new Uint8Array(vw * vh * 4);
      ctx.readPixels(vx, vy, vw, vh, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      const c2 = document.createElement("canvas"); c2.width = vw; c2.height = vh;
      const g = c2.getContext("2d"), im = g.createImageData(vw, vh);
      for (let y = 0; y < vh; y++) im.data.set(px.subarray((vh - 1 - y) * vw * 4, (vh - y) * vw * 4), y * vw * 4);
      for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255;
      g.putImageData(im, 0, 0);
      return { canvas: c2, w: vw, h: vh, frame: Math.floor(pos), t: pos / HZ };
    }
    async function grab() {
      const r = grabPixels();
      r.blob = await new Promise((res) => r.canvas.toBlob(res, "image/png"));
      return r;
    }

    const eng = {
      T, SECTIONS, HZ, wasmSha: "", canvas,
      load, start, stop, setPaused, keydown, keyup, setFaithful, setMute, grab, stats,
      grabDataURL: () => grabPixels().canvas.toDataURL("image/png"),
      seekTo: (p) => { if (running && !paused) seek(p); else { pos = p; moved = true; drawOnce(); } },
      setSection: (p) => { if (running) { seek(startFrame(p)); if (paused) drawOnce(); } else { pos = startFrame(p); moved = true; drawOnce(); } },
      redraw: () => { if (!running || paused) drawOnce(); },
      setRenderSize: (wh) => { override = wh || null; if (!running || paused) drawOnce(); },
      statusLine,
      get ready() { return !!T.ready; },
      get running() { return running; },
      get paused() { return paused; },
      get ended() { return ended; },
      get pos() { return pos; },
      get faithful() { return faithful; },
      get live() { return live; },
      get module() { return M; },
    };
    T.engine = eng;
    return eng;
  }

  /* ensure-loaded scripts: a page that embeds the engine loads this file
     once and calls create() */
  window.CD2Engine = { create, SECTIONS, HZ, LAST };
})();
