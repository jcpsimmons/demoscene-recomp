/* DEBUG TELEMETRY - only through the sandbox tunnel (*.trycloudflare.com),
 * never on the published sites. Every 2 s the page POSTs a report to
 * /__telemetry on the same host (web/sandbox/serve.js appends it to a file in
 * the host's drop folder): the status line, the stalls of the page's main
 * thread (a gap between animation frames over 100 ms, with the status line
 * before and after it), errors and console warnings, WebGL context loss,
 * visibility changes, and the device's basics once. A random id per page
 * load ties one session's reports together; nothing is stored on the device.
 * Also PROBES (below): code written on the host, run here once, its result
 * reported - for questions the reports don't answer. */
"use strict";
(() => {
  if (!/\.trycloudflare\.com$/.test(location.hostname)) return;
  const sid = Math.random().toString(36).slice(2, 10);
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const status = () => { const e = document.getElementById("status"); return e ? e.textContent.slice(0, 200) : ""; };
  let events = [];
  const ev = (type, o) => { if (events.length < 400) events.push(Object.assign({ t: ms(), type }, o || {})); };
  /* once: the device */
  const gl = (() => {
    try {
      const c = document.createElement("canvas"), g = c.getContext("webgl2");
      if (!g) return { webgl2: false };
      const ext = g.getExtension("WEBGL_debug_renderer_info");
      const r = { webgl2: true, maxTex: g.getParameter(g.MAX_TEXTURE_SIZE), maxRb: g.getParameter(g.MAX_RENDERBUFFER_SIZE),
                  renderer: ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "", floatRT: !!g.getExtension("EXT_color_buffer_float") };
      const l = g.getExtension("WEBGL_lose_context"); if (l) l.loseContext();
      return r;
    } catch (e) { return { error: String(e) }; }
  })();
  ev("device", { ua: navigator.userAgent, w: innerWidth, h: innerHeight, dpr: devicePixelRatio, screen: screen.width + "x" + screen.height,
                 cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0, gl, url: location.pathname + location.search });
  /* the main thread's stalls */
  let last = 0, lastStatus = "", worst = 0, frames = 0;
  const tick = (ts) => {
    if (last) {
      const gap = ts - last;
      if (gap > 100) ev("stall", { ms: Math.round(gap), before: lastStatus, after: status(), vis: document.visibilityState });
      if (gap > worst) worst = gap;
    }
    frames++; last = ts; lastStatus = status();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  /* errors, warnings, the GPU */
  addEventListener("error", (e) => ev("error", { msg: String(e.message || e), at: (e.filename || "").split("/").pop() + ":" + (e.lineno || 0) }));
  addEventListener("unhandledrejection", (e) => ev("rejection", { msg: String(e.reason && (e.reason.stack || e.reason.message) || e.reason).slice(0, 500) }));
  for (const k of ["warn", "error"]) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { ev("console." + k, { msg: a.map((x) => String(x)).join(" ").slice(0, 500) }); orig(...a); };
  }
  document.addEventListener("webglcontextlost", (e) => ev("glLost", { canvas: e.target && e.target.className }), true);
  document.addEventListener("webglcontextrestored", (e) => ev("glRestored", { canvas: e.target && e.target.className }), true);
  document.addEventListener("visibilitychange", () => ev("visibility", { state: document.visibilityState }));
  addEventListener("pagehide", () => ev("pagehide"));
  /* every 2 s: a sample and the queued events */
  const send = (final) => {
    const cv = document.querySelector("canvas.remaster:not([hidden])") || document.querySelector("canvas#screen");
    const rep = { sid, t: ms(), status: status(), fps: Math.round(frames / 2), worstGapMs: Math.round(worst),
                  canvas: cv ? cv.width + "x" + cv.height : "", remaster: !!(document.getElementById("remaster") || {}).checked, events };
    events = []; worst = 0; frames = 0;
    const body = JSON.stringify(rep);
    try {
      if (final && navigator.sendBeacon) navigator.sendBeacon("/__telemetry", body);
      else fetch("/__telemetry", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch (e) {}
  };
  setInterval(() => send(false), 2000);
  /* PROBES: /__probe serves {id, code} written on the host; a new id's code
     runs once here (as the body of an async function, given the page's
     window) and its result - or its error - goes back as an event */
  let probed = "";
  setInterval(async () => {
    let p = null;
    try { const r = await fetch("/__probe", { cache: "no-store" }); if (r.status === 200) p = await r.json(); } catch (e) {}
    if (!p || !p.id || p.id === probed) return;
    probed = p.id;
    try {
      const fn = new Function("return (async () => {" + p.code + "})()");
      const v = await fn();
      let out; try { out = JSON.stringify(v); } catch (e) { out = String(v); }
      ev("probe", { id: p.id, ok: true, result: String(out).slice(0, 30000) });
    } catch (e) { ev("probe", { id: p.id, ok: false, error: String(e && (e.stack || e.message) || e).slice(0, 2000) }); }
    send(false);
  }, 2000);
  addEventListener("pagehide", () => send(true));
})();
