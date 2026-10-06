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
  /* WHERE THE HOST IS: this script, the worker and the worklet sit together
     in web/, and every demo's page in a folder below it (web/unreal/,
     web/second/, web/cd2/), so the host's own files are found beside THIS
     script, not beside the page. */
  const HOST = new URL(".", document.currentScript.src);
  /* WHICH DEMO: the page sets window.DEMO before this script (see
     web/<demo>/index.html), its URLs relative to the page; anything it leaves
     out is Unreal's (the defaults below are relative to this script). */
  const CFG = Object.assign({
    exe: new URL("../original/v10/UNREAL.EXE", HOST).href,
    engine: new URL("../build/wasm/unreal.js", HOST).href, factory: "createUnreal",
    env: { UNREAL_BYTECLOCK: "1", UNREAL_KEYS: "right,down,down,enter", UNREAL_CPUBPS: "21450000", UNREAL_IONS: "68", UNREAL_QUIET: "1",
           UNREAL_FASTPARTS: "8" },           /* the World Vector on an 8x CPU (NOTES 57) */
    audioRate: 20000,                         /* what the setup keystrokes select */
    settle: 0, setupMax: 400,                 /* engine-worker.js: waiting for the driver's rate */
    lead: 18,                                 /* engine-worker.js: frames computed ahead of the clock
                                                 (~250 ms: room for output latency and a busy browser) */
  }, window.DEMO || {});
  /* the engine's glue is also loaded by the worker, which resolves a relative
     URL against ITS script (web/), so it is made absolute here */
  CFG.engine = new URL(CFG.engine, location.href).href;
  if (CFG.wasm) CFG.wasm = new URL(CFG.wasm, location.href).href;
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
         is 4:3 (640x480) and the 320x200 is scaled into it without smoothing
         (1600x1200, an exact 5x6, was tried: too slow to copy on an iPhone) */
      const m = document.createElement("canvas"); m.width = 640; m.height = 480;
      const c = m.getContext("2d");
      if (!c || !m.captureStream) return false;
      c.imageSmoothingEnabled = false;
      const st = m.captureStream(0);              /* a frame only when we push one */
      this.track = st.getVideoTracks()[0];
      if (!this.track || !this.track.requestFrame) { this.track = null; v.srcObject = m.captureStream(60); }
      else v.srcObject = st;
      v.addEventListener("webkitendfullscreen", () => { this.active = false; this.size(false); fsChanged(); });
      document.body.appendChild(v);
      this.vid = v; this.mirror = m; this.mctx = c;
      /* PRE-ROLLED: one black frame pushed and the (muted, inline) video
         playing from page load, so Start can send it to the player
         synchronously in the click - iPhone refuses a video with no frame yet */
      c.fillStyle = "#000"; c.fillRect(0, 0, m.width, m.height);
      if (this.track) this.track.requestFrame();
      const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
      return true;
    },
    /* the mirror's size: 640x480 for the original (its 320x200 doubled,
       unsmoothed); for a remaster, the screen's own pixels at 4:3 (the
       short side, as the phone is held for the player), and the remaster
       draws at that size while the player shows it */
    size(on) {
      let w = 640, h = 480;
      if (on && alt) {
        h = Math.round(Math.min(screen.width, screen.height) * (devicePixelRatio || 1));
        w = Math.round(h * 4 / 3);
      }
      if (this.mirror.width !== w || this.mirror.height !== h) { this.mirror.width = w; this.mirror.height = h; }
      if (alt && alt.setRenderSize) alt.setRenderSize(on ? [w, h] : null);
    },
    push() {                                       /* called right after paint() */
      if (!this.active) return;
      const m = this.mirror;
      this.mctx.imageSmoothingEnabled = !!alt;     /* reset whenever the mirror is resized */
      this.mctx.drawImage(alt ? alt.canvas : canvas, 0, 0, m.width, m.height);
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
      this.size(true);
      this.push();                                 /* so the player has a frame (black before the first picture) */
      const pr = v.play(); if (pr && pr.catch) pr.catch(() => {});
      try {
        if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
        else { const r = v.requestFullscreen(); if (r && r.catch) r.catch(() => { this.active = false; fsFallback(); }); }
      } catch (e) { this.active = false; status.textContent = "video fullscreen refused: " + e.message; return false; }
      return true;
    },
    exit() { if (this.vid && this.vid.webkitExitFullscreen) this.vid.webkitExitFullscreen(); this.active = false; if (this.mirror) this.size(false); }
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
    const w = new Worker(new URL("engine-worker.js", HOST));
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
      /* the engine build's fingerprint, for the screenshots' metadata: the
         SHA-256 of these exact bytes (a copy of the response, off the path) */
      if (crypto && crypto.subtle) r.clone().arrayBuffer().then((b) => crypto.subtle.digest("SHA-256", b))
        .then((h) => { wasmSha = [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join(""); }).catch(() => {});
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
    refreshStart();
  })().catch((e) => { status.textContent = "preload failed: " + (e && e.message || e); console.error(e); });

  /* ---- the run ------------------------------------------------------- */
  let worker = null, audio = null, worklet = null, pcmRate = 0;
  let moduleFor = null;                /* the context the worklet module was added to */
  let runGen = 0;                      /* which press of Start the run belongs to */
  let queue = [], painted = 0, dropped = 0, framesSeen = 0, ended = false, t0 = 0, running = false;
  let lastT = 0, lastD = 0;            /* the newest frame's start and length, demo seconds */

  /* ---- pause and screenshot ------------------------------------------
   * A tap (click) on the picture pauses: the engine stops stepping (the
   * worker's "pause"), the sound context is suspended - so the pinned clock
   * stops with it and picture and sound resume together - and the picture
   * keeps the last frame shown. A second tap plays. While paused an overlay
   * lies over the picture with a camera button in its lower right: it saves
   * the frame on screen as a PNG at the demo's own resolution (320x200, or
   * whatever the frame is), the exact VGA colours (a palette per row where
   * the frame has one), with text metadata: the demo, the engine build (the
   * SHA-256 of the wasm file running), the frame number and its demo time. */
  let paused = false, shown = null, wasmSha = "";
  /* the AI Remaster while its box is ticked (window.demoHost, remaster.js) */
  let alt = null;
  function refreshStart() {
    if (alt) { const s = alt.startState(); startBtn.textContent = s.text; startBtn.disabled = s.disabled; return; }
    if (pre) { startBtn.textContent = "Start"; startBtn.disabled = false; }
    else { startBtn.textContent = "Loading.."; startBtn.disabled = true; }
  }
  const overlay = document.createElement("div");
  overlay.className = "pause-ui"; overlay.hidden = true;
  overlay.innerHTML = '<div class="pause-mark" aria-hidden="true">&#10074;&#10074;</div>' +
    '<button type="button" class="shot" title="Save this frame as a PNG at the demo\'s own resolution" aria-label="Save screenshot">' +
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>' +
    '</button>' +
    '<button type="button" class="copy" title="Copy this frame to the clipboard" aria-label="Copy screenshot to the clipboard">' +
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 2h10a2 2 0 0 1 2 2v12h-2V4H8V2zM5 6h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 2v12h10V8H5z"/></svg>' +
    '</button>';
  /* COPY instead of save: the same picture, to the clipboard. The clipboard
     write is started IN the click (Safari allows it only there) with a
     promise for the PNG, which savePng resolves when the picture is made. */
  const canCopy = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
  if (!canCopy) overlay.querySelector(".copy").remove();
  let copyTo = null;                            /* {resolve, reject} while a copy is being made */
  let resuming = false;
  function setPaused(on) {
    if (on === paused || resuming) return;
    if (on && (!running || ended)) return;
    /* RESUME waits for the sound to be running again before the picture and
       the engine move: until then the audio clock is still stopped (and its
       output timestamp stale), and a picture restarted early jumps ahead -
       about 20 frames - to catch a clock that had not restarted yet */
    if (!on && audio && audio.state === "suspended") {
      resuming = true;
      audio.resume().catch(() => {}).then(() => { resuming = false; lastTs = 0; unpause(); });
      return;
    }
    if (!on) { unpause(); return; }
    paused = true;
    if (worker) worker.postMessage({ type: "pause", on: true });
    if (audio && audio.state === "running") { try { audio.suspend().catch(() => {}); } catch (x) {} }
    pausedAt = performance.now();
    overlay.hidden = false;
    status.textContent = `paused at frame ${shown ? shown.n : framesSeen} - tap the picture to play`;
  }
  function unpause() {
    if (!paused) return;
    paused = false;
    if (pinP < 0) t0 += performance.now() - pausedAt;          /* before the first pin, wall time paces */
    if (worker) worker.postMessage({ type: "pause", on: false });
    overlay.hidden = true;
  }
  let pausedAt = 0;
  /* a PNG with tEXt chunks: CRC-32 over chunk type + data */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function pngText(png, fields) {
    const enc = new TextEncoder(), parts = [png.subarray(0, 33)];       /* signature + IHDR */
    for (const [k, v] of Object.entries(fields)) {
      const data = enc.encode(k + "\0" + v), chunk = new Uint8Array(12 + data.length), dv = new DataView(chunk.buffer);
      dv.setUint32(0, data.length); chunk.set(enc.encode("tEXt"), 4); chunk.set(data, 8);
      let c = 0xFFFFFFFF; for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ chunk[i]) & 255] ^ (c >>> 8);
      dv.setUint32(8 + data.length, (c ^ 0xFFFFFFFF) >>> 0); parts.push(chunk);
    }
    parts.push(png.subarray(33));
    return new Blob(parts, { type: "image/png" });
  }
  async function screenshot() {
    const f = shown; if (!f) return;
    const w = f.w || 320, h = f.h || 200, c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d"), img = x.createImageData(w, h), d = img.data, pal = f.pal, rowed = pal.length > 768;
    for (let i = 0, o = 0; i < w * h; i++, o += 4) {
      const p = f.idx[i] * 3 + (rowed ? Math.floor(i / w) * 768 : 0);
      d[o] = (pal[p] << 2) | (pal[p] >> 4); d[o + 1] = (pal[p + 1] << 2) | (pal[p + 1] >> 4); d[o + 2] = (pal[p + 2] << 2) | (pal[p + 2] >> 4); d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    const demo = (CFG.factory || "createUnreal").replace(/^create/, "").toLowerCase();
    const exe = String(CFG.exe || "").split("/").pop();
    const meta = {
      Title: `${document.title} - frame ${f.n}`,
      Software: "demoscene-recomp (recompiled to WebAssembly)",
      Source: `${exe}, engine ${String(CFG.wasm || CFG.engine.replace(/\.js$/, ".wasm")).split("/").pop()} sha256:${wasmSha || "unknown"}`,
      Comment: `frame ${f.n}, demo time ${f.t.toFixed(6)} s, ${w}x${h}` + (location.search ? `, options ${location.search}` : ""),
      URL: location.href.split("#")[0],
      "Creation Time": new Date().toISOString(),
    };
    savePng(blob, meta, `${demo}-frame${String(f.n).padStart(6, "0")}.png`);
  }
  function savePng(blob, fields, name) {
    blob.arrayBuffer().then((b) => {
      const out = pngText(new Uint8Array(b), fields);
      if (copyTo) { const c = copyTo; copyTo = null; c.resolve(out); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  }
  overlay.querySelector(".shot").addEventListener("click", (e) => { e.stopPropagation(); (alt ? alt.screenshot() : screenshot()).catch((x) => console.error(x)); });
  if (canCopy) overlay.querySelector(".copy").addEventListener("click", (e) => {
    e.stopPropagation();
    const png = new Promise((resolve, reject) => { copyTo = { resolve, reject }; });
    const was = status.textContent;
    navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
      .then(() => { status.textContent = "frame copied to the clipboard"; setTimeout(() => { if (status.textContent === "frame copied to the clipboard") status.textContent = was; }, 2500); })
      .catch((x) => { status.textContent = "could not copy: " + (x && x.message || x); });
    (alt ? alt.screenshot() : screenshot()).catch((x) => { if (copyTo) { copyTo.reject(x); copyTo = null; } console.error(x); });
  });
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
  let underruns = 0;                   /* render quanta the worklet found empty after the sound began */
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
    if (paused) { lastTs = 0; rafId = requestAnimationFrame(tick); return; }   /* the last picture stays up */
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
    if (show) { paint(show); painted++; shown = show; if (vfs.active) vfs.push(); }
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
      status.textContent = `${fpsShown.toFixed(1)} fps  (engine ${engShown.toFixed(1)}/s, display ${(1000 / refreshMs).toFixed(0)} Hz)  frame ${framesSeen}  dropped ${dropped}  behind ${lastD > 0 ? Math.max(0, Math.floor((due - lastT) / lastD)) : 0}` + (underruns ? `  underruns ${underruns}` : "") + (ended ? "  (ended)" : "");
    }
    if (!ended || queue.length) rafId = requestAnimationFrame(tick);
  }

  /* Start is also Restart: a press while a run is going stops it (the worker
     is terminated, the worklet disconnected) and begins a new one with the
     section and multiplier selected now. The AudioContext is kept - it was
     opened once by the first gesture and stays open; only a run that is
     already loading is abandoned by the generation check after each await. */
  function stopRun() {
    setPaused(false);
    running = false; ended = false; shown = null;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (worker) { worker.terminate(); worker = null; }
    if (worklet) { try { worklet.port.onmessage = null; worklet.disconnect(); } catch (x) {} worklet = null; }
    pcmRate = 0; pinP = -1; pinT = 0; underruns = 0;
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
          if (moduleFor !== audio) { await audio.audioWorklet.addModule(new URL("pcm-worklet.js", HOST).href); moduleFor = audio; }
          if (w !== worker) return;
          worklet = new AudioWorkletNode(audio, "pcm-queue");
          worklet.connect(audio.destination);
          const node = worklet;              /* a stopped run's pins, still queued, are dropped */
          node.port.onmessage = (ev) => { if (node === worklet) { pinP = ev.data.time; pinT = ev.data.t; underruns = ev.data.under || 0; } };
        }
        t0 = performance.now(); running = true;
        status.textContent = "running" + (gl ? " (WebGL)" : " (2D)");
        rafId = requestAnimationFrame(tick);
      }
      else if (m.type === "ended") { ended = true; status.textContent = "the demo has ended"; }
      else if (m.type === "error") { ended = true; status.textContent = "engine stopped: " + m.rc; }
    };
    w.postMessage({ type: "init", exe, files, env, engine: CFG.engine, factory: CFG.factory,
                    settle: CFG.settle, setupMax: CFG.setupMax, lead: CFG.lead, openRate: CFG.openRate, gapFill: CFG.gapFill },
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
  /* a PHONE gets no fullscreen: ticking the box explains how to fill the
     screen instead (held landscape, the page fits the picture to it -
     demo.css, the same test as here) */
  const PHONE = matchMedia("(pointer: coarse) and (max-width: 540px), (pointer: coarse) and (max-height: 540px)");
  function phoneFullscreenNote() {
    let pop = document.querySelector(".fs-pop");
    if (!pop) {
      pop = document.createElement("div");
      pop.className = "fs-pop"; pop.hidden = true;
      pop.innerHTML = '<div class="box" role="dialog" aria-labelledby="fs-pop-t">' +
        '<h2 class="t" id="fs-pop-t"><span class="i">Fullscreen</span></h2>' +
        '<p>On a phone, turn it sideways and scroll the demo into view: the picture fills the screen.</p>' +
        '<p class="ok"><button type="button">OK</button></p></div>';
      pop.addEventListener("click", (e) => { if (e.target === pop || e.target.closest("button")) pop.hidden = true; });
      document.body.appendChild(pop);
    }
    pop.hidden = false;
    pop.querySelector("button").focus();
  }
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
    try { fullBox.checked = !PHONE.matches && localStorage.getItem(FSKEY) === "1"; } catch (e) { fullBox.checked = false; }
    fullBox.addEventListener("change", () => {
      if (PHONE.matches) { fullBox.checked = false; fullBox.blur(); phoneFullscreenNote(); return; }
      const want = fullBox.checked;
      try { localStorage.setItem(FSKEY, want ? "1" : "0"); } catch (e) {}
      if (!worker && !(alt && alt.running)) return;   /* not running: only the choice for Start */
      if (want) enterFullscreen(); else exitFullscreen();
    });
  } else if (fullBox) fullBox.addEventListener("click", toggleFullscreen);   /* a page with the old button */
  if (vfs.on) vfs.setup();                      /* pre-rolled, so Start can enter it in the click */
  startBtn.addEventListener("click", () => {
    if (alt) {                                    /* the AI Remaster (remaster.js) */
      if (!alt.ready) return;
      if (fullBox && fullBox.type === "checkbox" && fullBox.checked) enterFullscreen();
      startBtn.blur();
      alt.start();
      return;
    }
    if (!pre) return;
    if (fullBox && fullBox.type === "checkbox" && fullBox.checked) enterFullscreen();   /* FIRST, before start() awaits anything */
    if (CFG.liveKeys) startBtn.blur();             /* Enter is the demo's now, not a second Start */
    start().catch((e) => { status.textContent = String(e); console.error(e); });
  });
  /* a tap on the picture pauses or plays (pause and screenshot, above); the
     laid-over stage (no Fullscreen API) is left by F, the checkbox, or the
     overlay's close button while paused */
  (stage.querySelector(".tube") || stage).appendChild(overlay);   /* on the picture itself, also in fullscreen */
  const closeMax = document.createElement("button");
  closeMax.type = "button"; closeMax.className = "unmax"; closeMax.title = "Leave the full-window view"; closeMax.setAttribute("aria-label", "Leave the full-window view");
  closeMax.innerHTML = "&#10005;";
  closeMax.addEventListener("click", (e) => { e.stopPropagation(); stage.classList.remove("max"); fsChanged(); });
  overlay.appendChild(closeMax);
  stage.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".shot, .copy, .unmax")) return;
    if (alt && alt.running) alt.togglePause();
    else if (!alt && running && !ended) setPaused(!paused);
    else if (stage.classList.contains("max")) { stage.classList.remove("max"); fsChanged(); }
  });
  /* LIVE KEYS (CFG.liveKeys: an engine with unreal_key - Crystal Dream 2, whose
     end menu is driven by arrows and Enter). While a run is going, a key the
     table below knows goes to the engine as the BIOS code AH scan, AL ASCII
     (cengine.c types it through the emulated 8042 - a press, its release
     100 ms later) and the page does nothing else with it: no scrolling, no
     button press. F stays the page's: it toggles fullscreen and never reaches
     the demo (CD2's end menu uses arrows and Enter), and Tab still moves
     the focus. Esc goes to the demo -
     in fullscreen the browser takes it first to leave fullscreen. Keys in the
     Section list are left to the list. Without liveKeys nothing changes. */
  const SCAN = { Escape: 0x011B, Enter: 0x1C0D, NumpadEnter: 0x1C0D, Space: 0x3920, Backspace: 0x0E08,
                 ArrowUp: 0x4800, ArrowDown: 0x5000, ArrowLeft: 0x4B00, ArrowRight: 0x4D00,
                 PageUp: 0x4900, PageDown: 0x5100, Home: 0x4700, End: 0x4F00 };
  "1234567890".split("").forEach((d, i) => { SCAN["Digit" + d] = ((i + 2) << 8) | d.charCodeAt(0); });
  ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].forEach((row, r) => row.split("").forEach((ch, i) => {
    if (ch !== "F") SCAN["Key" + ch] = (([0x10, 0x1E, 0x2C][r] + i) << 8) | ch.toLowerCase().charCodeAt(0);
  }));
  for (let i = 1; i <= 10; i++) SCAN["F" + i] = (0x3A + i) << 8;
  const liveKey = (e) => {
    if (!CFG.liveKeys || !worker || ended || e.altKey || e.ctrlKey || e.metaKey) return 0;
    if (e.target && e.target.tagName === "SELECT") return 0;
    return SCAN[e.code] || 0;
  };
  document.addEventListener("keydown", (e) => {
    if (alt) {                                    /* the AI Remaster's keys (its end menu's, pause, ...) */
      if (e.target && e.target.tagName === "SELECT") return;
      if (alt.keydown(e)) { e.preventDefault(); return; }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
      return;
    }
    const code = liveKey(e);
    if (code) { e.preventDefault(); worker.postMessage({ type: "key", code }); return; }
    if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
  });
  document.addEventListener("keyup", (e) => { if (alt ? alt.keyup(e) : liveKey(e)) e.preventDefault(); });   /* Space clicks on keyup */

  /* ---- the page host, for an alternative engine (web/remaster.js) --------
   * A page with an "AI Remaster" option (CFG.remaster) loads remaster.js after
   * this script. While its box is ticked it is the ALT engine: Start, the tap
   * on the picture, the keys, the screenshot button and the fullscreen box go
   * to it instead of this page's run; unticked (alt null) everything here is
   * exactly as before. */
  window.demoHost = {
    CFG, startBtn, status, stage, canvas, fetchBuf, refreshStart,
    stop() { if (running || worker) stopRun(); status.textContent = ""; },
    setAlt(a) { alt = a; overlay.hidden = true; refreshStart(); },
    showPaused(on) { overlay.hidden = !on; },
    afterFrame() { if (vfs.active) vfs.push(); },
    savePng,
  };

  /* this was a PWA once; a Home Screen web app on iPhone never hides the
     home indicator, not even in the video player, and a Safari bookmark
     does, so it is a plain page again. Any service worker left registered
     from that time is removed. */
  if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
})();
