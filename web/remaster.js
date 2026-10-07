/* The "AI Remaster" option of a demo page: a checkbox (#remaster) that swaps
 * the recompiled original for a modern rebuild of the same demo (for Crystal
 * Dream 2, cd2-recomp: every part redrawn at the screen's resolution with
 * AI-upscaled bitmaps), on the same page with the same controls.
 *
 * NOTHING IS DOWNLOADED UNTIL THE BOX IS TICKED. Ticking it the first time
 * puts Start back into a loading state ("Loading..", as the page's own load, and a
 * progress bar) while the remaster's engine loads EVERYTHING it will ever
 * draw - its program and every upscaled bitmap, decoded and on the GPU - so
 * nothing loads while it plays; Start comes back only then. The Section list
 * becomes the remaster's own start points. Unticking returns to the original
 * (its sections, its canvas); the remaster stays loaded, so ticking it again
 * is instant. Changing the box while something plays stops it.
 *
 * A page opts in with window.DEMO.remaster (before unreal_web.js):
 *
 *   remaster: {
 *     engine: "../../build/wasm/cd2-remaster/cd2_engine.js",   the engine's script
 *     global: "CD2Engine",                                     what it defines
 *     build:  "../../build/wasm/cd2-remaster/",                its wasm, workers, bitmaps
 *     name:   "Crystal Dream 2 - AI Remaster",                 for screenshots
 *     file:   "cd2-remaster",                                  screenshot file names
 *   }
 *
 * and the engine (window[global]) provides the REMASTER ENGINE INTERFACE:
 *
 *   SECTIONS                       [{value, label}]: its start points
 *   create({canvas, build, scripts, exe, onProgress(f, text), onStatus(text),
 *           onPause(paused), onEnded(why), onFrame()})  -> eng
 *   eng.load()                     Promise: everything loaded
 *   eng.start(value)               start / restart at a section (inside the click)
 *   eng.stop()                     back to ready
 *   eng.setPaused(v), eng.running, eng.paused, eng.ended, eng.ready
 *   eng.keydown(e) / eng.keyup(e)  true if the engine took the key
 *   eng.setSection(value)          the section changed while ready or playing
 *   eng.grab()                     Promise {blob (PNG), w, h, frame, t}: the picture
 *                                  at its render resolution
 *   eng.wasmSha                    the SHA-256 of its wasm (screenshot metadata)
 *
 * The page host (unreal_web.js, window.demoHost) routes Start, the tap that
 * pauses, the keys, the screenshot button and fullscreen to whichever is
 * active. The demo's original file (CFG.exe) is the one the page already
 * loaded (demoHost.fetchBuf): not downloaded twice. Unreal and Second
 * Reality take the same option by giving their pages a remaster config and
 * an engine with this interface.
 */
"use strict";
(() => {
  const host = window.demoHost, RC = host && host.CFG.remaster;
  const box = document.getElementById("remaster");
  if (!host || !RC || !box) { if (box) box.closest("label").hidden = true; return; }
  const startBtn = host.startBtn, status = host.status, stage = host.stage;
  const sel = document.getElementById("section");
  const prog = document.getElementById("rprog"), pfill = prog && prog.querySelector(".fill"), ptext = prog && prog.querySelector(".ptext");
  const origSections = sel ? sel.innerHTML : "", origValue = sel ? sel.value : "";
  let eng = null, loading = null, frac = 0, failed = null, lastStatus = "";
  let remSections = "", remValue = null;

  /* the remaster's canvas: next to the original's, one of them shown */
  const canvas = document.createElement("canvas");
  canvas.className = "remaster"; canvas.id = "screen-remaster"; canvas.hidden = true;
  host.canvas.after(canvas);

  const pct = () => Math.floor(frac * 100);
  function showProgress() {
    if (!prog) return;
    const on = box.checked && !(eng && eng.ready) && !failed;
    prog.hidden = !on;
    if (pfill) pfill.style.width = (frac * 100).toFixed(1) + "%";
    if (ptext) ptext.textContent = `Loading AI Remaster... ${pct()}%`;
  }

  /* what Start shows while the remaster is the choice */
  const alt = {
    canvas,
    get ready() { return !!(eng && eng.ready); },
    get running() { return !!(eng && eng.running); },
    get paused() { return !!(eng && eng.paused); },
    get ended() { return !!(eng && eng.ended); },
    setRenderSize(wh) { if (eng && eng.setRenderSize) eng.setRenderSize(wh); },
    startState() {
      if (failed) return { text: "AI Remaster failed", disabled: true };
      if (!alt.ready) return { text: "Loading..", disabled: true };      /* as the page's own load; the progress bar below has the detail */
      return { text: "Start", disabled: false };
    },
    start() {
      if (!alt.ready) return;
      host.showPaused(false);
      eng.start(sel ? sel.value : undefined).catch((e) => { status.textContent = String(e && e.message || e); });
    },
    stop() { if (eng) eng.stop(); host.showPaused(false); },
    togglePause() { if (eng && eng.running) eng.setPaused(!eng.paused); },
    keydown(e) { return !!(eng && eng.running && eng.keydown(e)); },
    keyup(e) { return !!(eng && eng.running && eng.keyup(e)); },
    async screenshot() {
      if (!eng) return;
      const g = await eng.grab();
      const meta = {
        Title: `${RC.name || document.title + " - AI Remaster"} - frame ${g.frame}`,
        Software: "demoscene-recomp: AI Remaster (the modern rebuild in WebAssembly + WebGL2)",
        Source: `${String(host.CFG.exe || "").split("/").pop()}, AI Remaster engine cd2.wasm sha256:${eng.wasmSha || "unknown"}`,
        Comment: `AI Remaster, frame ${g.frame}, demo time ${g.t.toFixed(6)} s, rendered at ${g.w}x${g.h}`,
        URL: location.href.split("#")[0],
        "Creation Time": new Date().toISOString(),
      };
      host.savePng(g.blob, meta, `${RC.file || "remaster"}-frame${String(g.frame).padStart(6, "0")}.png`);
    },
  };

  function load() {
    if (loading) return loading;
    frac = 0; showProgress(); host.refreshStart();
    loading = (async () => {
      const G = RC.global || "CD2Engine";
      if (!window[G]) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = new URL(RC.engine, location.href).href;
          s.onload = res; s.onerror = () => rej(new Error(RC.engine + ": not loaded"));
          document.head.appendChild(s);
        });
      }
      const E = window[G];
      remSections = E.SECTIONS.map((s) => `<option value="${s.value}">${s.label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</option>`).join("");
      if (box.checked) useSections(true);
      const exe = (await host.fetchBuf(host.CFG.exe)).slice(0);
      eng = E.create({
        canvas, build: new URL(RC.build, location.href).href, scripts: new URL(RC.build, location.href).href, exe,
        onProgress: (f) => { frac = f; showProgress(); if (box.checked) host.refreshStart(); },
        onStatus: (t) => { lastStatus = t; if (box.checked) status.textContent = t; },
        onPause: (p) => { if (box.checked) host.showPaused(p); },
        onEnded: (why) => { host.showPaused(false); if (window.recompStats) window.recompStats.ended(); if (box.checked) { status.textContent = why; host.refreshStart(); } },
        onFrame: () => host.afterFrame(),
      });
      window.remaster = eng;                      /* for a test driver */
      await eng.load();
      frac = 1; showProgress();
      if (box.checked) {
        host.refreshStart();
        const u = eng.T.ups || {};
        status.textContent = "AI Remaster ready";
      }
    })().catch((e) => {
      failed = String(e && e.message || e);
      console.error("AI Remaster: " + failed);
      showProgress();
      if (box.checked) { status.textContent = "AI Remaster could not load: " + failed; host.refreshStart(); }
    });
    return loading;
  }

  function useSections(remaster) {
    if (!sel) return;
    if (remaster) {
      if (!remSections) return;
      if (sel.dataset.mode === "remaster") return;
      sel.dataset.mode = "remaster";
      sel.innerHTML = remSections;
      if (remValue !== null) sel.value = remValue;
    } else {
      if (sel.dataset.mode !== "remaster") return;
      remValue = sel.value;
      sel.dataset.mode = "";
      sel.innerHTML = origSections; sel.value = origValue;
    }
  }
  if (sel) sel.addEventListener("change", () => {
    if (box.checked && eng && eng.ready) eng.setSection(sel.value);
  });

  /* the download's size, from the files themselves: the bitmaps' manifest
     (its byte total) and the engine's wasm (RC.wasm, or the engine's name
     with _engine.js -> .wasm), so the note cannot go stale */
  let sizeMB = null;
  async function sizeNote() {
    try {
      if (sizeMB === null) {
        const man = await (await fetch(RC.build + "upscaled/manifest.json")).json();
        let bytes = man.bytes || 0;
        const wasm = RC.wasm || RC.build + RC.engine.split("/").pop().replace(/_engine\.js$/, ".wasm");
        const h = await fetch(wasm, { method: "HEAD" });
        bytes += +(h.headers.get("content-length") || 0);
        sizeMB = bytes / 1e6;
      }
      if (box.checked && !(eng && eng.ready) && !failed)
        status.textContent = `loading the AI Remaster (${sizeMB.toFixed(1)} MB)...`;
    } catch (e) { /* the plain note stays */ }
  }

  box.checked = false;                              /* unchecked on every load: the original by default */
  box.addEventListener("change", () => {
    box.blur();
    if (box.checked) {
      host.stop();                                  /* the original, if it plays */
      host.setAlt(alt);
      host.canvas.hidden = true; canvas.hidden = false;
      useSections(true);
      load();
      if (eng && eng.ready) { eng.redraw && eng.redraw(); status.textContent = "AI Remaster ready"; }
      else if (!failed) { status.textContent = "loading the AI Remaster..."; sizeNote(); }
    } else {
      alt.stop();
      host.setAlt(null);
      canvas.hidden = true; host.canvas.hidden = false;
      useSections(false);
      status.textContent = "";
    }
    showProgress();
    host.refreshStart();
  });
})();
