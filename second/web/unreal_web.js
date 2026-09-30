/* The browser host for the engine (WASM.md). The engine runs in a Web Worker
 * (engine-worker.js) with no per-frame budget; this thread:
 *
 *   PAINTS  the newest frame that is due, dropping older ones - the same rule
 *           as present.c: never show a frame late. WebGL does the palette
 *           lookup (a 320x200 index texture and a 256x1 palette texture - 256 x rows
 *           when a frame carries a palette per row), so
 *           painting costs one small upload, not a 64,000-pixel JS loop.
 *   SOUNDS  the driver's own 8-bit DAC output through an AudioWorklet. The
 *           worklet pins where the sound IS - "at audio time T it was at demo time
 *           P" - and the picture's continuous clock is offset by that pin, so
 *           a demo frame is shown when its own sound plays. That is what keeps
 *           picture and music together, whatever the load time was.
 */
"use strict";
(() => {
  /* WHICH DEMO: the page may set window.DEMO before this script (see
     index.html); anything it leaves out is Unreal's, so a page without it is
     Unreal's page exactly as it was. */
  const CFG = Object.assign({
    exe: "../original/v10/UNREAL.EXE",
    engine: "../build/wasm/unreal.js", factory: "createUnreal",
    env: { UNREAL_BYTECLOCK: "1", UNREAL_KEYS: "right,down,down,enter", UNREAL_CPUBPS: "21450000", UNREAL_IONS: "68", UNREAL_QUIET: "1",
           UNREAL_FASTPARTS: "8" },           /* the World Vector on an 8x CPU (NOTES 57) */
    audioRate: 20000,                         /* what the setup keystrokes select */
    settle: 0, setupMax: 400,                 /* engine-worker.js: waiting for the driver's rate */
    lead: 4,                                  /* engine-worker.js: frames computed ahead of the clock */
  }, window.DEMO || {});
  let W = 320, H = 200;                       /* the picture's size; a text page is 640x400 */
  const canvas = document.getElementById("screen");
  const status = document.getElementById("status");
  const startBtn = document.getElementById("start");

  /* ---- WebGL palette painter, with a 2D fallback ---------------------- */
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: false });
  let paint;
  if (gl) {
    const vs = "attribute vec2 p; varying vec2 t; void main(){ t = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.,1.); }";
    const fs = "precision mediump float; varying vec2 t; uniform sampler2D idx, pal;" +
               "void main(){ float i = texture2D(idx, t).r; gl_FragColor = texture2D(pal, vec2((i*255.0+0.5)/256.0, t.y)); }";
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = (unit, w, h) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null);
      return t;
    };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    tex(0, W, H); gl.uniform1i(gl.getUniformLocation(prog, "idx"), 0);
    let texW = W, texH = H;
    const palT = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, palT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog, "pal"), 1);
    /* the palette texture is 256 x rows: one row, or one per picture row (a
       frame whose palette changed while the beam drew it) */
    let pal8 = new Uint8Array(256 * 3);
    paint = (f) => {
      const n = f.pal.length;
      if (pal8.length !== n) pal8 = new Uint8Array(n);
      for (let i = 0; i < n; i++) pal8[i] = (f.pal[i] << 2) | (f.pal[i] >> 4);   /* VGA 6-bit -> 8 */
      gl.activeTexture(gl.TEXTURE1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 256, n / 768, 0, gl.RGB, gl.UNSIGNED_BYTE, pal8);
      gl.activeTexture(gl.TEXTURE0);
      const fw = f.w || 320, fh = f.h || 200;
      if (fw !== texW || fh !== texH) {          /* a text page and back: the canvas takes its size */
        texW = W = fw; texH = H = fh; canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, W, H, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, f.idx);
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.LUMINANCE, gl.UNSIGNED_BYTE, f.idx);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  } else {
    const ctx2d = canvas.getContext("2d");
    let image = ctx2d.createImageData(W, H);
    paint = (f) => {
      const fw = f.w || 320, fh = f.h || 200;
      if (fw !== image.width || fh !== image.height) {
        W = fw; H = fh; canvas.width = W; canvas.height = H; image = ctx2d.createImageData(W, H);
      }
      const d = image.data, pal = f.pal, idx = f.idx, rowed = pal.length > 768;
      for (let i = 0, o = 0; i < W * H; i++, o += 4) {
        const p = idx[i] * 3 + (rowed ? Math.floor(i / W) * 768 : 0);
        d[o] = (pal[p] << 2) | (pal[p] >> 4); d[o + 1] = (pal[p + 1] << 2) | (pal[p + 1] >> 4); d[o + 2] = (pal[p + 2] << 2) | (pal[p + 2] >> 4); d[o + 3] = 255;
      }
      ctx2d.putImageData(image, 0, 0);
    };
  }

  /* ---- fullscreen through a video element (iPhone) -----------------------
   * iPhone puts only a <video> in real fullscreen, and the native player is
   * the one place it hides the home indicator. So where the page has no
   * element fullscreen but video fullscreen exists - that is iPhone; iPad
   * and everything else have the real API - the Fullscreen button does this
   * instead: each painted frame is copied into a hidden 2D canvas, that
   * canvas is captured as a MediaStream, a hidden <video> plays the stream,
   * and the video goes to the native player. The page, the clock and the
   * sound run on exactly as before; only the picture takes the extra hop. The copy is made right after paint(), in the same task, which is why
   * the WebGL context does not need preserveDrawingBuffer. */
  const vfs = {
    on: !(document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
        typeof HTMLVideoElement !== "undefined" && "webkitEnterFullscreen" in HTMLVideoElement.prototype,
    active: false, vid: null, mirror: null, mctx: null, track: null,
    setup() {
      if (this.vid) return true;
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.setAttribute("playsinline", "");
      v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none";
      /* the player shows the video at the video's own shape, so the mirror
         is 4:3 (640x480) and the 320x200 is scaled into it without smoothing */
      const m = document.createElement("canvas"); m.width = 640; m.height = 480;
      const c = m.getContext("2d");
      if (!c || !m.captureStream) return false;
      c.imageSmoothingEnabled = false;
      const st = m.captureStream(0);              /* a frame only when we push one */
      this.track = st.getVideoTracks()[0];
      if (!this.track || !this.track.requestFrame) { this.track = null; v.srcObject = m.captureStream(60); }
      else v.srcObject = st;
      v.addEventListener("webkitendfullscreen", () => { this.active = false; fsChanged(); });
      document.body.appendChild(v);
      this.vid = v; this.mirror = m; this.mctx = c;
      /* PRE-ROLLED: one black frame pushed and the (muted, inline) video
         playing from page load, so Start can send it to the player
         synchronously in the click - iPhone refuses a video with no frame yet */
      c.fillStyle = "#000"; c.fillRect(0, 0, 640, 480);
      if (this.track) this.track.requestFrame();
      const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
      return true;
    },
    push() {                                       /* called right after paint() */
      if (!this.active) return;
      this.mctx.drawImage(canvas, 0, 0, 640, 480);
      if (this.track) this.track.requestFrame();
    },
    /* SYNCHRONOUS, all of it inside the click: play() is started, not
       awaited, and the player is entered at once. Returns false when it
       could not be (the caller then lays the stage over the viewport). */
    enter() {
      if (!this.setup()) { status.textContent = "video fullscreen: no canvas capture here"; return false; }
      const v = this.vid;
      if (!v.webkitEnterFullscreen && !v.requestFullscreen) { status.textContent = "video fullscreen: no video fullscreen here"; return false; }
      this.active = true;
      this.push();                                 /* so the player has a frame (black before the first picture) */
      const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
      try {
        if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
        else { const r = v.requestFullscreen(); if (r && r.catch) r.catch(() => { this.active = false; fsFallback(); }); }
      } catch (e) { this.active = false; status.textContent = "video fullscreen refused: " + e.message; return false; }
      return true;
    },
    exit() { if (this.vid && this.vid.webkitExitFullscreen) this.vid.webkitExitFullscreen(); this.active = false; }
  };

  /* ---- PRELOAD, from page load -------------------------------------------
   * Everything that does not depend on the choices made at Start: the exe,
   * every file the page names (CFG.files, and CFG.preload - URLs that an
   * option may add to CFG.files later, such as the smooth city's data), the
   * engine's glue script (as a blob URL, so every worker gets it without a
   * refetch) and its wasm, COMPILED (a WebAssembly.Module can be handed to
   * any worker). Instantiating waits for Start: the engine's environment -
   * the section, the options - is fixed by its C constructors. A Restart
   * reuses all of it. Start stays disabled, as "Loading..", until this is done. */
  const cache = new Map();                      /* URL -> ArrayBuffer (kept; each run gets a copy) */
  let pre = null;                               /* { module, engineUrl } once loaded */
  let spare = null;                             /* a worker with the glue already loaded */
  async function fetchBuf(u) {
    if (cache.has(u)) return cache.get(u);
    const r = await fetch(u);
    if (!r.ok) throw new Error(u + ": " + r.status);
    const b = await r.arrayBuffer();
    cache.set(u, b);
    return b;
  }
  function warmWorker() {
    const w = new Worker("engine-worker.js");
    w.postMessage({ type: "load", engineUrl: pre.engineUrl, engine: CFG.engine, module: pre.module });
    return w;
  }
  const wasmUrl = CFG.wasm || CFG.engine.replace(/\.js$/, ".wasm");
  startBtn.disabled = true; startBtn.textContent = "Loading..";
  (async () => {
    const urls = [CFG.exe].concat(Object.values(CFG.files || {}), CFG.preload || []);
    const compile = async () => {
      const r = await fetch(wasmUrl);
      if (!r.ok) throw new Error(wasmUrl + ": " + r.status);
      if (WebAssembly.compileStreaming && /application\/wasm/.test(r.headers.get("Content-Type") || ""))
        return WebAssembly.compileStreaming(r);
      return WebAssembly.compile(await r.arrayBuffer());
    };
    const glue = async () => {
      const r = await fetch(CFG.engine);
      if (!r.ok) throw new Error(CFG.engine + ": " + r.status);
      return URL.createObjectURL(new Blob([await r.text()], { type: "text/javascript" }));
    };
    const [module, engineUrl] = await Promise.all([compile(), glue()].concat(urls.map(fetchBuf)));
    pre = { module, engineUrl };
    spare = warmWorker();
    startBtn.textContent = "Start"; startBtn.disabled = false;
  })().catch((e) => { status.textContent = "preload failed: " + (e && e.message || e); console.error(e); });

  /* ---- the run ------------------------------------------------------- */
  let worker = null, audio = null, worklet = null, pcmRate = 0;
  let moduleFor = null;                /* the context the worklet module was added to */
  let runGen = 0;                      /* which press of Start the run belongs to */
  let queue = [], painted = 0, dropped = 0, framesSeen = 0, ended = false, t0 = 0, running = false;
  let lastT = 0, lastD = 0;            /* the newest frame's start and length, demo seconds */
  /* fps: what is PAINTED per second (what the viewer sees) and what the engine
     produces per second (70.086 when it keeps up), over a one-second window */
  let fpsAt = 0, fpsPainted = 0, fpsSeen = 0, fpsShown = 0, engShown = 0;

  /* ---- the presentation clock ----------------------------------------
   * A straight line, and one constant on it.
   *
   * The line: audio time as a function of performance time, from
   * getOutputTimestamp() (an exact pair) - AudioContext.currentTime itself
   * moves in 6.4 ms render quanta, most of a refresh, and deciding from it
   * jittered the picture. The decision is made for the instant the NEXT
   * refresh reaches the screen, not "now".
   *
   * The constant: the worklet's pin, "at audio time T the sound was at demo
   * time P", captured as one pair inside the worklet. The demo's position at
   * any instant is P + (audioTime - T), in demo SECONDS - not frames, since a
   * demo may change its frame length (Panic's 466-line frames); each frame
   * carries its own start time t, and the frame shown is the newest whose t
   * has come. With every frame 1/70.086 s (Unreal: t = n / 70.086) that is
   * exactly the old rule, frame n shown once P + (audioTime - T) * 70.086
   * reaches n. Consecutive pins agree to the
   * sample, so a new one changes nothing unless the sound actually stalled -
   * which is the one time the offset should change. Before the first pin
   * (the silent setup screens), wall time from the start paces things, and
   * the first pin corrects it by the queue's initial depth, a few frames. */
  let refreshMs = 1000 / 60, lastTs = 0;
  let rafId = 0;                       /* the pending tick, cancelled on restart */
  let pinP = -1, pinT = 0;
  function audioTimeAt(perfMs) {
    if (audio.getOutputTimestamp) {
      const ts = audio.getOutputTimestamp();
      if (ts && ts.contextTime !== undefined && ts.performanceTime)
        return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
    return audio.currentTime + (perfMs - performance.now()) / 1000;
  }
  function timeAt(perfMs) {
    if (pinP >= 0 && audio) return pinP + (audioTimeAt(perfMs) - pinT);
    return (perfMs - t0) / 1000;
  }

  /* a check, console only: over the first 10 s, how many refreshes each
     painted frame stayed up - at 144 Hz it should be 2s and 3s, nothing else */
  let holds = {}, holdN = 0, holdStart = 0, checkDone = false;

  function tick(ts) {
    if (!running) return;
    if (lastTs && ts > lastTs && ts - lastTs < 100) refreshMs = refreshMs * 0.9 + (ts - lastTs) * 0.1;
    lastTs = ts;
    const due = timeAt(ts + refreshMs);              /* the demo time this refresh will show */
    /* the worker paces against the RENDER side of the audio (the sample the
       worklet is taking now), not what is heard: they differ by the output
       latency, which reached 48-60 ms with Chrome 154 and starved a short
       lead. The picture still follows what is heard. */
    if (worker) worker.postMessage({ type: "clock", t: (pinP >= 0 && audio) ? pinP + (audio.currentTime - pinT) : timeAt(performance.now()) });
    let show = null;
    while (queue.length && queue[0].t <= due) { if (show) dropped++; show = queue.shift(); }
    /* hideText: the BIOS text page (the setup screen, rasterised 640x400)
       is not shown - the screen stays black until the demo's first picture */
    if (show && CFG.hideText && show.w === 640 && show.h === 400) show = null;
    if (show) { paint(show); painted++; if (vfs.active) vfs.push(); }
    if (!checkDone) {
      if (show) { if (holdN) holds[holdN] = (holds[holdN] || 0) + 1; holdN = 1; if (!holdStart) holdStart = ts; }
      else if (holdN) holdN++;
      if (holdStart && ts - holdStart > 10000) { checkDone = true; console.log("refreshes per painted frame over 10 s:", JSON.stringify(holds)); }
    }
    const now = performance.now();
    if (now - fpsAt >= 1000) {
      if (fpsAt) {
        fpsShown = (painted - fpsPainted) * 1000 / (now - fpsAt);
        engShown = (framesSeen - fpsSeen) * 1000 / (now - fpsAt);
      }
      fpsAt = now; fpsPainted = painted; fpsSeen = framesSeen;
      status.textContent = `${fpsShown.toFixed(1)} fps  (engine ${engShown.toFixed(1)}/s, display ${(1000 / refreshMs).toFixed(0)} Hz)  frame ${framesSeen}  dropped ${dropped}  behind ${lastD > 0 ? Math.max(0, Math.floor((due - lastT) / lastD)) : 0}` + (ended ? "  (ended)" : "");
    }
    if (!ended || queue.length) rafId = requestAnimationFrame(tick);
  }

  /* Start is also Restart: a press while a run is going stops it (the worker
     is terminated, the worklet disconnected) and begins a new one with the
     section and multiplier selected now. The AudioContext is kept - it was
     opened once by the first gesture and stays open; only a run that is
     already loading is abandoned by the generation check after each await. */
  function stopRun() {
    running = false; ended = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (worker) { worker.terminate(); worker = null; }
    if (worklet) { try { worklet.port.onmessage = null; worklet.disconnect(); } catch (x) {} worklet = null; }
    pcmRate = 0; pinP = -1; pinT = 0;
    queue = []; painted = 0; dropped = 0; framesSeen = 0; t0 = 0; lastT = lastD = 0;
    fpsAt = fpsPainted = fpsSeen = 0; fpsShown = engShown = 0; lastTs = 0;
    holds = {}; holdN = 0; holdStart = 0; checkDone = false;
  }

  async function start() {
    if (!pre) return;                              /* still preloading: Start is disabled */
    stopRun();
    const gen = ++runGen;
    /* opened once, in the click itself (so the gesture counts), at the 20 kHz
       the setup keystrokes always select - a second open at "ready" was a
       device re-open, and with the pinned clock the open time no longer matters */
    if (!audio || audio.state === "closed") audio = new AudioContext({ sampleRate: CFG.audioRate });
    const w = spare || warmWorker();
    spare = null;
    worker = w;
    const sel = document.getElementById("section"), section = sel ? sel.value : "";
    status.textContent = "starting the engine...";
    /* the exe and, for a demo that opens files next to it (CFG.files:
       {DOS name: URL}), those - preloaded; a copy each, since they are
       transferred to the worker */
    const names = Object.keys(CFG.files || {});
    const got = await Promise.all([CFG.exe].concat(names.map((k) => CFG.files[k])).map(fetchBuf));
    if (gen !== runGen) return;
    const exe = got[0].slice(0), files = names.map((name, i) => ({ name, data: got[i + 1].slice(0) }));
    const env = Object.assign({}, CFG.env);
    if (section) env.UNREAL_ARGS = section;
    w.onmessage = async (e) => {
      if (w !== worker) return;                     /* a run that was stopped */
      const m = e.data;
      if (m.type === "frame") { queue.push(m); framesSeen = m.n; lastT = m.t; lastD = m.d; if (queue.length > 32) { queue.splice(0, queue.length - 32); dropped++; } }
      else if (m.type === "pcm") { if (worklet) worklet.port.postMessage({ samples: m.samples, t: m.t, d: m.d }, [m.samples.buffer]); }
      else if (m.type === "ready") {
        pcmRate = m.pcmRate;
        if (pcmRate) {
          if (audio.sampleRate !== pcmRate) {        /* the browser refused 20 kHz */
            const ac = new AudioContext({ sampleRate: pcmRate });
            try { audio.close(); } catch (x) {}
            audio = ac;
          }
          if (moduleFor !== audio) { await audio.audioWorklet.addModule("pcm-worklet.js"); moduleFor = audio; }
          if (w !== worker) return;
          worklet = new AudioWorkletNode(audio, "pcm-queue");
          worklet.connect(audio.destination);
          const node = worklet;              /* a stopped run's pins, still queued, are dropped */
          node.port.onmessage = (ev) => { if (node === worklet) { pinP = ev.data.time; pinT = ev.data.t; } };
        }
        t0 = performance.now(); running = true;
        status.textContent = "running" + (gl ? " (WebGL)" : " (2D)");
        rafId = requestAnimationFrame(tick);
      }
      else if (m.type === "ended") { ended = true; status.textContent = "the demo has ended"; }
      else if (m.type === "error") { ended = true; status.textContent = "engine stopped: " + m.rc; }
    };
    w.postMessage({ type: "init", exe, files, env, engine: CFG.engine, factory: CFG.factory,
                    settle: CFG.settle, setupMax: CFG.setupMax, lead: CFG.lead },
                  [exe].concat(files.map((f) => f.data)));
  }


  /* Fullscreen: the stage around the canvas, so the CSS can size the canvas
     to 4:3 inside it (a fullscreen element itself is forced to fill the
     screen). It is a CHECKBOX, remembered: checked, Start goes fullscreen
     FIRST, synchronously in the click - browsers allow it only inside the
     gesture, and Start then awaits - and the stage shows black until the
     first picture. Toggling it while a run is going enters or leaves at once;
     leaving by any other way (Esc, the player's close button, a tap on the
     laid-over stage, F) unchecks it. F toggles.
     Where there is no Fullscreen API (iPhone) the native video player takes
     the picture (vfs above); where that, or the API, is refused, the stage is
     instead laid over the whole viewport (class "max"); a tap on it, or F,
     puts it back. */
  const stage = document.getElementById("stage");
  const fullBox = document.getElementById("full");
  const fsApi = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
  const FSKEY = (CFG.factory || "createUnreal") + ".fullscreen";
  function isFull() {
    return vfs.active || stage.classList.contains("max") || !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function fsChanged() {
    if (!fullBox || fullBox.type !== "checkbox") return;
    fullBox.checked = isFull();
    try { localStorage.setItem(FSKEY, fullBox.checked ? "1" : "0"); } catch (e) {}
  }
  function fsFallback() { stage.classList.add("max"); fsChanged(); }
  function enterFullscreen() {                  /* synchronous: call it inside the click */
    if (isFull()) return;
    if (vfs.on) { if (!vfs.enter()) fsFallback(); return; }   /* iPhone: the native video player */
    if (!fsApi) { fsFallback(); return; }
    try {
      const r = (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
      if (r && r.catch) r.catch(fsFallback);
    } catch (e) { fsFallback(); }
  }
  function exitFullscreen() {
    if (vfs.active) vfs.exit();
    stage.classList.remove("max");
    if (document.fullscreenElement || document.webkitFullscreenElement)
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    fsChanged();
  }
  function toggleFullscreen() { if (isFull()) exitFullscreen(); else enterFullscreen(); }
  document.addEventListener("fullscreenchange", fsChanged);
  document.addEventListener("webkitfullscreenchange", fsChanged);
  if (fullBox && fullBox.type === "checkbox") {
    try { fullBox.checked = localStorage.getItem(FSKEY) === "1"; } catch (e) { fullBox.checked = false; }
    fullBox.addEventListener("change", () => {
      const want = fullBox.checked;
      try { localStorage.setItem(FSKEY, want ? "1" : "0"); } catch (e) {}
      if (!worker) return;                      /* not running: only the choice for Start */
      if (want) enterFullscreen(); else exitFullscreen();
    });
  } else if (fullBox) fullBox.addEventListener("click", toggleFullscreen);   /* a page with the old button */
  if (vfs.on) vfs.setup();                      /* pre-rolled, so Start can enter it in the click */
  startBtn.addEventListener("click", () => {
    if (!pre) return;
    if (fullBox && fullBox.type === "checkbox" && fullBox.checked) enterFullscreen();   /* FIRST, before start() awaits anything */
    start().catch((e) => { status.textContent = String(e); console.error(e); });
  });
  stage.addEventListener("click", () => { if (stage.classList.contains("max")) { stage.classList.remove("max"); fsChanged(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); } });

  /* this was a PWA once; a Home Screen web app on iPhone never hides the
     home indicator, not even in the video player, and a Safari bookmark
     does, so it is a plain page again. Any service worker left registered
     from that time is removed. */
  if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
})();
