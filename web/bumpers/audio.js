/* bumpers - the sound: a small WebAudio synth that every intro scores itself
 * with. Nothing is sampled; every hit, braam and arpeggio is built from
 * oscillators and one buffer of noise, so it plays the same in the page
 * (AudioContext) and in a video render (OfflineAudioContext, tools/render.mjs).
 *
 * An intro's music(S, t0) schedules all its notes up front, at audio time t0. */
"use strict";
(() => {
  const NOTES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  /* "A2", "F#3", "Bb1" -> Hz */
  const hz = (n) => {
    if (typeof n === "number") return n;
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
    const semi = NOTES[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
    return 440 * Math.pow(2, (semi - 69) / 12);
  };

  const Synth = (ctx, out) => {
    const sr = ctx.sampleRate;
    /* the bus: everything -> master -> soft clip -> compressor -> out; a send to a feedback delay */
    const master = ctx.createGain(); master.gain.value = 0.8;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) { const x = (i / 1023.5) - 1; curve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4); }
    clip.curve = curve;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(clip); clip.connect(comp); comp.connect(out);
    const delay = ctx.createDelay(2), fb = ctx.createGain(), wet = ctx.createGain(), dlp = ctx.createBiquadFilter();
    delay.delayTime.value = 0.375; fb.gain.value = 0.35; wet.gain.value = 0.5; dlp.type = "lowpass"; dlp.frequency.value = 3000;
    delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(wet); wet.connect(master);
    const send = delay;

    /* one second of seeded noise, reused by every noisy sound */
    const noiseBuf = ctx.createBuffer(1, sr, sr);
    { const d = noiseBuf.getChannelData(0); let s = 22222; for (let i = 0; i < sr; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; } }
    /* a distortion curve for the braam's grit */
    const grit = ctx.createWaveShaper();
    { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 511.5) - 1; c[i] = Math.tanh(x * 4); } grit.curve = c; }

    const env = (g, t, a, peak, hold, r, sus = 0) => {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      if (sus) g.gain.setTargetAtTime(peak * sus, t + a, hold / 3 + 0.001);
      g.gain.setValueAtTime(sus ? peak * sus : peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
      g.gain.setValueAtTime(0, t + a + hold + r + 0.01);
    };
    const panner = (p, dest) => {
      if (!p || !ctx.createStereoPanner) return dest;
      const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(dest); return n;
    };

    /* tone(t, note, dur, {type, vol, a, r, cutoff, q, slide, detune, pan, echo}) */
    const tone = (t, note, dur, o = {}) => {
      const f = hz(note), osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type || "square"; osc.frequency.setValueAtTime(f, t);
      if (o.detune) osc.detune.value = o.detune;
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, hz(o.slide)), t + (o.slideT || dur));
      if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(osc.frequency); l.start(t + 0.15); l.stop(t + dur + (o.r ?? 0.08) + 0.05); }
      let node = osc;
      if (o.cutoff) {
        const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.Q.value = o.q || 1;
        fl.frequency.setValueAtTime(o.cutoff, t);
        if (o.sweep) fl.frequency.exponentialRampToValueAtTime(o.sweep, t + (o.sweepT || dur));
        osc.connect(fl); node = fl;
      }
      node.connect(g);
      const dest = panner(o.pan, master); g.connect(dest);
      if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(send); }
      env(g, t, o.a ?? 0.004, o.vol ?? 0.15, Math.max(0, dur - (o.a ?? 0.004)), o.r ?? 0.08, o.sus || 0);
      osc.start(t); osc.stop(t + dur + (o.r ?? 0.08) + 0.05);
    };
    /* noise(t, dur, {vol, hp, lp, bp, q, a, r, sweep, pan, echo}) */
    const noise = (t, dur, o = {}) => {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true;
      if (o.rate) src.playbackRate.value = o.rate;
      let node = src;
      for (const [k, type] of [["hp", "highpass"], ["lp", "lowpass"], ["bp", "bandpass"]]) {
        if (!o[k]) continue;
        const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = o.q || 0.8; f.frequency.setValueAtTime(o[k], t);
        if (o.sweep && k === (o.sweepOn || "bp")) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
        node.connect(f); node = f;
      }
      node.connect(g);
      const dest = panner(o.pan, master); g.connect(dest);
      if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(send); }
      if (o.swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t + dur); g.gain.setValueAtTime(0, t + dur + 0.01); }
      else env(g, t, o.a ?? 0.002, o.vol ?? 0.2, Math.max(0, dur - (o.a ?? 0.002)), o.r ?? 0.05);
      src.start(t, (t * 7.31) % 0.9); src.stop(t + dur + (o.r ?? 0.05) + 0.05);
    };

    /* ---- drums ---- */
    const kick = (t, vol = 0.9) => {
      tone(t, 150, 0.02, { type: "sine", vol, slide: 42, slideT: 0.14, r: 0.28, a: 0.001 });
      noise(t, 0.006, { vol: vol * 0.3, lp: 3000, r: 0.02 });
    };
    const snare = (t, vol = 0.5) => {
      noise(t, 0.02, { vol, hp: 1200, r: 0.16 });
      tone(t, 190, 0.02, { type: "triangle", vol: vol * 0.6, slide: 120, slideT: 0.08, r: 0.08 });
    };
    const hat = (t, vol = 0.12, open = false) => noise(t, 0.005, { vol, hp: 7000, r: open ? 0.22 : 0.035 });
    const crash = (t, vol = 0.25) => noise(t, 0.01, { vol, hp: 4500, r: 1.6, echo: 0.2 });
    const tom = (t, note, vol = 0.6) => tone(t, note, 0.02, { type: "sine", vol, slide: hz(note) * 0.55, slideT: 0.25, r: 0.35 });
    /* a timpani: a pitched thud with a skin of filtered noise */
    const timpani = (t, note, vol = 0.6) => {
      tone(t, note, 0.03, { type: "sine", vol, slide: hz(note) * 0.92, slideT: 0.6, r: 1.1 });
      tone(t, hz(note) * 1.5, 0.02, { type: "sine", vol: vol * 0.25, r: 0.5 });
      noise(t, 0.01, { vol: vol * 0.35, lp: 600, r: 0.18 });
    };

    /* ---- textures ---- */
    /* the braam: stacked, detuned saws through an opening low-pass and grit,
       a sub under it and an impact on top - the trailer "BWAAAM" */
    const braam = (t, root = "A1", dur = 2.6, vol = 0.5) => {
      const f = hz(root), bus = ctx.createGain(), lp = ctx.createBiquadFilter(), pre = ctx.createGain();
      lp.type = "lowpass"; lp.Q.value = 3;
      lp.frequency.setValueAtTime(140, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.09);
      lp.frequency.exponentialRampToValueAtTime(380, t + dur * 0.8);
      pre.gain.value = 0.9;
      const sh = ctx.createWaveShaper(); sh.curve = grit.curve;
      pre.connect(sh); sh.connect(lp); lp.connect(bus); bus.connect(master);
      env(bus, t, 0.012, vol, dur * 0.35, dur * 0.65);
      for (const [mult, n] of [[1, 3], [2, 3], [1.5, 2], [0.5, 1]]) for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.value = f * mult; o.detune.value = (i - (n - 1) / 2) * 14;
        g.gain.value = 0.16 / n; o.connect(g); g.connect(pre); o.start(t); o.stop(t + dur + 0.1);
      }
      tone(t, f / 2, dur * 0.5, { type: "sine", vol: vol * 0.9, a: 0.01, r: dur * 0.5 });
      kick(t, 1);
      noise(t, 0.04, { vol: vol * 0.5, lp: 900, r: 0.6 });
      crash(t, 0.12);
    };
    /* a chord pad: saws (or squares) with a slow attack */
    const pad = (t, notes, dur, o = {}) => {
      notes.forEach((n, i) => {
        tone(t, n, dur, { type: o.type || "sawtooth", vol: (o.vol ?? 0.06), a: o.a ?? 0.25, r: o.r ?? 0.9, cutoff: o.cutoff ?? 1400, sweep: o.sweep, q: o.q, detune: (i % 2 ? 7 : -7), pan: (i % 3 - 1) * 0.35, echo: o.echo });
        if (o.thick) tone(t, n, dur, { type: o.type || "sawtooth", vol: (o.vol ?? 0.06) * 0.7, a: o.a ?? 0.25, r: o.r ?? 0.9, cutoff: o.cutoff ?? 1400, sweep: o.sweep, detune: (i % 2 ? -11 : 11), pan: -(i % 3 - 1) * 0.35 });
      });
    };
    /* a brass stab: saws with a fast filter blip */
    const brass = (t, notes, dur, vol = 0.07) => notes.forEach((n, i) => {
      tone(t, n, dur, { type: "sawtooth", vol, a: 0.03, r: 0.5, cutoff: 600, sweep: 2600, sweepT: 0.08, detune: i % 2 ? 5 : -5, pan: (i % 3 - 1) * 0.3, echo: 0.15 });
      tone(t + 0.08, n, Math.max(0.05, dur - 0.08), { type: "sawtooth", vol: vol * 0.8, a: 0.05, r: 0.6, cutoff: 2600, sweep: 900, sweepT: dur, detune: i % 2 ? -9 : 9 });
    });
    /* a riser: band-passed noise sweeping up, swelling in */
    const riser = (t, dur, vol = 0.18, from = 300, to = 6000) => noise(t, dur, { vol, bp: from, sweep: to, q: 2, swell: true });
    /* a downer: the reverse - a zap falling away */
    const zap = (t, from = 1600, to = 40, dur = 0.5, vol = 0.18) => tone(t, from, dur, { type: "square", vol, slide: to, slideT: dur, r: 0.05, cutoff: 3000 });
    const blip = (t, note, vol = 0.07, len = 0.03, type = "square") => tone(t, note, len, { type, vol, r: 0.02 });
    /* a step sequencer: pat is a string, one char a step; fn(t, ch, i) for every non-"." */
    const seq = (t0, step, pat, fn) => { [...pat].forEach((ch, i) => { if (ch !== "." && ch !== " ") fn(t0 + i * step, ch, i); }); };

    return { ctx, master, send, hz, tone, noise, kick, snare, hat, crash, tom, timpani, braam, pad, brass, riser, zap, blip, seq };
  };

  /* an AudioBuffer as a 24-bit stereo WAV (for the video renderer) */
  const wav = (buf) => {
    const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bps = 3;
    const out = new DataView(new ArrayBuffer(44 + n * ch * bps));
    const s = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    s(0, "RIFF"); out.setUint32(4, 36 + n * ch * bps, true); s(8, "WAVE"); s(12, "fmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * bps, true); out.setUint16(32, ch * bps, true); out.setUint16(34, bps * 8, true);
    s(36, "data"); out.setUint32(40, n * ch * bps, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      let v = Math.max(-1, Math.min(1, data[c][i])) * 8388607 | 0;
      out.setUint8(o, v & 255); out.setUint8(o + 1, (v >> 8) & 255); out.setUint8(o + 2, (v >> 16) & 255); o += 3;
    }
    return new Uint8Array(out.buffer);
  };
  /* render an intro's music offline: seconds of audio from t = 0 */
  const renderOffline = async (fx, seconds, sr = 48000) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    const S = Synth(ctx, ctx.destination);
    if (fx.music) {
      if (fx.loop) for (let k = 0; k * fx.duration < seconds; k++) fx.music(S, k * fx.duration, k);
      else fx.music(S, 0, 0);
    }
    return ctx.startRendering();
  };

  window.DSA = { Synth, hz, wav, renderOffline };
})();
