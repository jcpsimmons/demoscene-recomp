/* bumpers - the player page. Plays one intro against the audio clock: the
 * picture for t is drawn from ctx.currentTime, so sound and picture can't
 * drift. Before Play it shows the intro's hero frame.
 *
 * Also the hooks tools/render.mjs drives (window.BUMPER_RENDER): a frame's
 * pixels for any t, and the whole soundtrack rendered offline. */
"use strict";
(async () => {
  const $ = (id) => document.getElementById(id);
  const cv = $("screen"), g = cv.getContext("2d");
  const img = new ImageData(new Uint8ClampedArray(DS.main.buffer), DS.W, DS.H);
  const OBS = DS.params.has("obs"), RENDER = DS.params.has("render");
  if (OBS) document.body.classList.add("obs");

  let fx = DS.get(DS.param("fx", "")) || DS.list[0];
  let actx = null, out = null, recDest = null, bus = null, S = null;
  let t0 = 0, playing = false, scheduled = 0, raf = 0;
  let rec = null;

  const paint = (t) => { fx.draw(t); g.putImageData(img, 0, 0); };
  const fmt = (f) => (f.loop ? `loop, ${f.duration} s` : `${f.duration.toFixed(f.duration % 1 ? 1 : 0)} s`);
  const status = (s) => { $("status").textContent = s; };

  /* ---- the page's text for the current intro ---- */
  const describe = () => {
    document.title = `${fx.name} - bumpers`;
    $("title").textContent = fx.name; $("fxname").textContent = fx.name; $("fxgroup").textContent = fx.group === fx.name ? fx.kind : fx.group;
    $("fxkind").textContent = fx.kind + (fx.silent ? " (silent)" : "");
    $("fxlen").textContent = fmt(fx);
    $("fxblurb").textContent = fx.blurb;
    $("fxcredit").hidden = !/janus/.test(fx.id);
    describe.cli();
    const u = new URL(location.href); u.searchParams.set("obs", "1"); $("obslink").href = u.href;
    $("repeat").checked = !!fx.loop;
    /* fields for its parameters */
    const box = $("fields"); box.innerHTML = "";
    for (const p of fx.params || []) {
      const l = document.createElement("label"), i = document.createElement("input");
      l.textContent = p.label; i.value = DS.params.get(p.k) || ""; i.placeholder = p.def || "(the default list)";
      if (p.k === "url") i.className = "keep";
      i.addEventListener("input", () => {
        if (i.value) DS.params.set(p.k, i.value); else DS.params.delete(p.k);
        syncUrl(); if (!playing) paint(fx.hero);
        describe.cli();
      });
      i.addEventListener("keydown", (e) => e.stopPropagation());
      l.appendChild(i); box.appendChild(l);
    }
    box.hidden = !(fx.params || []).length;
  };
  describe.cli = () => {
    const q = (fx.params || []).filter((p) => DS.params.get(p.k)).map((p) => ` --${p.k} "${DS.params.get(p.k)}"`).join("");
    $("fxcli").textContent = `node tools/render.mjs ${fx.id}${fx.loop ? " --seconds " + fx.duration * 2 : ""}${q}`;
  };
  const syncUrl = () => {
    const u = new URL(location.href);
    u.search = "";
    u.searchParams.set("fx", fx.id);
    for (const p of fx.params || []) if (DS.params.get(p.k)) u.searchParams.set(p.k, DS.params.get(p.k));
    if (OBS) u.searchParams.set("obs", "1");
    history.replaceState(null, "", u);
  };

  /* ---- sound ---- */
  /* iOS plays Web Audio through the ringer, so the silent switch mutes it.
     Declaring the page's sound as media playback (Safari 17+) and, for older
     iOS, starting a silent <audio> in the same tap moves it to the media
     volume, which the switch leaves alone. */
  let unmute = null;
  const mediaSession = () => {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    if (!unmute) {
      const n = 4410, b = new DataView(new ArrayBuffer(44 + n * 2));
      const s = (o, str) => { for (let i = 0; i < str.length; i++) b.setUint8(o + i, str.charCodeAt(i)); };
      s(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt "); b.setUint32(16, 16, true);
      b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, 44100, true); b.setUint32(28, 88200, true);
      b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, "data"); b.setUint32(40, n * 2, true);
      unmute = new Audio(URL.createObjectURL(new Blob([b.buffer], { type: "audio/wav" })));
      unmute.loop = true; unmute.setAttribute("playsinline", "");
    }
    unmute.play().catch(() => {});
  };
  const audio = () => {
    mediaSession();
    if (actx) return;
    actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
    out = actx.createGain(); out.connect(actx.destination);
    if (actx.createMediaStreamDestination) { recDest = actx.createMediaStreamDestination(); out.connect(recDest); }
    out.gain.value = $("mute").checked ? 0 : 1;
  };
  const stopSound = () => { if (bus) { try { bus.disconnect(); } catch (e) {} bus = null; } };

  /* ---- play ---- */
  const start = async () => {
    audio();
    if (actx.state !== "running") { try { await actx.resume(); } catch (e) {} }
    stopSound();
    bus = actx.createGain(); bus.connect(out);
    S = DSA.Synth(actx, bus);
    t0 = actx.currentTime + 0.08; scheduled = 0;
    if (fx.music) { fx.music(S, t0, 0); scheduled = 1; }
    playing = true; $("play").textContent = "Restart";
    status(actx.state === "running" ? "" : "Sound is blocked until you click the page.");
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  };
  const tick = () => {
    if (!playing) return;
    const t = Math.max(0, actx.currentTime - t0);
    if (fx.loop && fx.music && t > scheduled * fx.duration - 2) { fx.music(S, t0 + scheduled * fx.duration, scheduled); scheduled++; }
    if (!fx.loop && t >= fx.duration) {
      paint(fx.duration - 1e-3);
      if (rec && rec.state === "recording") { rec.stop(); return; }
      if ($("repeat").checked || OBS) { setTimeout(() => playing && start(), 500); playing = false; return; }
      playing = false; $("play").textContent = "Play again"; status("Done. Space to play again."); return;
    }
    if (rec && rec.state === "recording" && fx.loop && t >= fx.duration) { rec.stop(); }
    paint(t);
    if (rec) rec.paint();
    raf = requestAnimationFrame(tick);
  };

  /* ---- record one pass: the picture at 1920x1080 and the sound, to a file ---- */
  const record = async () => {
    if (rec && rec.state === "recording") { rec.stop(); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { status("This browser can't record. Use tools/render.mjs."); return; }
    audio();
    const big = document.createElement("canvas"); big.width = 1920; big.height = 1080;
    const bg = big.getContext("2d"); bg.imageSmoothingEnabled = false;
    const stream = big.captureStream(60);
    if (recDest) for (const tr of recDest.stream.getAudioTracks()) stream.addTrack(tr);
    const types = ["video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm"];
    const type = types.find((x) => MediaRecorder.isTypeSupported(x)) || "";
    const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 24e6 });
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mr.mimeType });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `${fx.id}.${/mp4/.test(mr.mimeType) ? "mp4" : "webm"}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      $("rec").classList.remove("on"); $("rec").textContent = "Record";
      status(`Saved ${a.download}. For an edit master, render it with tools/render.mjs instead: exact frames, no dropped ones.`);
      rec = null; playing = false; $("play").textContent = "Play again";
    };
    mr.paint = () => bg.drawImage(cv, 0, 0, 1920, 1080);
    rec = mr;
    mr.paint();
    mr.start(250);
    $("rec").classList.add("on"); $("rec").textContent = "Stop";
    status("Recording one pass...");
    await start();
  };

  /* ---- switching ---- */
  const pick = $("pick");
  for (const grp of [...new Set(DS.list.map((f) => f.group))]) {
    const og = document.createElement("optgroup"); og.label = grp;
    for (const f of DS.list.filter((x) => x.group === grp)) {
      const o = document.createElement("option"); o.value = f.id; o.textContent = `${f.name} (${fmt(f)})`; og.appendChild(o);
    }
    pick.appendChild(og);
  }
  const choose = (id) => {
    playing = false; stopSound(); cancelAnimationFrame(raf);
    for (const p of fx.params || []) DS.params.delete(p.k);
    fx = DS.get(id); pick.value = id; syncUrl(); describe(); paint(fx.hero);
    $("play").textContent = "Play"; status("");
  };
  pick.addEventListener("change", () => choose(pick.value));

  /* ---- controls ---- */
  $("play").addEventListener("click", start);
  $("rec").addEventListener("click", record);
  $("mute").addEventListener("change", () => { if (out) out.gain.value = $("mute").checked ? 0 : 1; });
  $("crt").addEventListener("change", () => $("stage").classList.toggle("crt", $("crt").checked));
  const stage = $("stage");
  const full = (on) => {
    if (on && !document.fullscreenElement) (stage.requestFullscreen ? stage.requestFullscreen().catch(() => stage.classList.add("max")) : stage.classList.add("max"));
    else if (!on) { if (document.fullscreenElement) document.exitFullscreen(); stage.classList.remove("max"); }
  };
  $("full").addEventListener("change", () => full($("full").checked));
  document.addEventListener("fullscreenchange", () => { $("full").checked = !!document.fullscreenElement; });
  stage.addEventListener("click", () => start());
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "enter") { if (e.target.closest && e.target.closest("button")) return; e.preventDefault(); start(); }
    else if (k === "f") { $("full").checked = !$("full").checked; full($("full").checked); }
    else if (k === "l") $("repeat").checked = !$("repeat").checked;
    else if (k === "m") { $("mute").checked = !$("mute").checked; $("mute").dispatchEvent(new Event("change")); }
    else if (k === "r") record();
    else if (k === "escape") { stage.classList.remove("max"); $("full").checked = false; }
    else if (k === "arrowright" || k === "arrowleft") {
      const i = DS.list.indexOf(fx), n = DS.list.length;
      choose(DS.list[(i + (k === "arrowright" ? 1 : n - 1)) % n].id);
    }
  });

  /* ---- boot ---- */
  await DS.loadFont("../assets/Web437_IBM_VGA_8x16.woff");
  pick.value = fx.id; describe(); paint(fx.hero);
  $("play").disabled = false; $("play").textContent = "Play"; $("rec").disabled = false;
  if (OBS && !RENDER) start();

  /* ---- the renderer's hooks (tools/render.mjs) ---- */
  window.BUMPER_RENDER = {
    info: () => ({ id: fx.id, name: fx.name, duration: fx.duration, loop: !!fx.loop, silent: !!fx.silent || !fx.music, W: DS.W, H: DS.H }),
    /* the RGBA bytes of the frame at t, base64 */
    frame: (t) => {
      fx.draw(t);
      const u8 = new Uint8Array(DS.main.buffer);
      let s = "";
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
    /* the soundtrack for `seconds`, a 48 kHz 24-bit WAV, base64 */
    audio: async (seconds) => {
      const buf = await DSA.renderOffline(fx, seconds, 48000);
      const u8 = DSA.wav(buf);
      let s = "";
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
  };
})();
