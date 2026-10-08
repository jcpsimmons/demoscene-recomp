/* Plausible Deniability Labs: the Janus bumper, the [REDACTED] sting and the
 * Janus spin loop. One bit of black and paper, red for the accent. The bust is
 * the Fitzwilliam double herm (GR.20.1850, CC BY 4.0), software-rendered and
 * Bayer-dithered here. */
"use strict";
(() => {
  const { W, H, hex, mix, seg, ease, clamp, bayer, hash2 } = DS;
  const BLACK = hex("#000000"), PAPER = hex("#f2efe8"), RED = hex("#ff1f1f"), DRED = hex("#5a0000");
  let M = null;
  const janus = () => M || (M = DS.mesh(window.JANUS_MESH));
  /* the model's own turn that puts the bearded face toward the viewer at ry = 0 */
  const FACE = -Math.PI / 2;
  const dither = (x, y, i) => (Math.pow(i, 0.85) > bayer(x, y) ? PAPER : BLACK);

  DS.add({
    id: "pdl-janus", name: "Plausible Deniability Labs", group: "Plausible Deniability Labs",
    kind: "Bumper", duration: 8, hero: 5.8,
    blurb: "The Janus bust, scanned in by a red line and dithered to one bit, turning from one face to the other. The name decodes over it, a statement types out, and a red bar redacts the one word that matters.",
    draw(t) {
      DS.clear(BLACK);
      /* a scan line reveals the bust top to bottom, then it keeps turning */
      const scan = 26 + ease.inout(seg(t, 0.5, 2.4)) * 230;
      DS.drawMesh(janus(), {
        ry: FACE + 0.35 + (t / 8) * 3.5, rx: -0.08, cx: W / 2, cy: 132, size: 104, light: [-0.6, 0.55, 0.7], ambient: 0.04,
        shade: (x, y, i) => (y > scan ? BLACK : Math.abs(y - scan) < 1.5 ? RED : dither(x, y, i)),
      });
      if (t > 0.5 && t < 2.45) { DS.rect(0, Math.round(scan), W, 1, RED); DS.shade(0, Math.round(scan) + 1, W, 2, RED, 0.35); }
      /* the name decodes in */
      DS.ctext(DS.decode("PLAUSIBLE DENIABILITY LABS", seg(t, 1.0, 2.2), t, 5), 8, PAPER, { s: 2, shadow: BLACK, so: 2 });
      /* the statement, and the redaction */
      const st = "WE HAVE NO RECOLLECTION OF THIS BROADCAST.", k = Math.floor(seg(t, 2.6, 3.5) * st.length);
      const sx = Math.round((W - st.length * 8) / 2);
      DS.rect(sx - 4, 228, st.length * 8 + 8, 18, BLACK);
      DS.text(st.slice(0, k), sx, 229, PAPER);
      const rp = ease.out(seg(t, 4.0, 4.08));
      if (rp > 0) {
        const rx = sx + 11 * 8 - 2, rw = 12 * 8 + 4;
        DS.rect(rx, 228, rw * rp, 18, RED);
        if (t < 4.12) DS.shift(t < 4.06 ? 3 : -2, t < 4.06 ? -2 : 1);
      }
      const fp = seg(t, 5.2, 5.6);
      if (fp > 0) {
        const a = "ALL STATEMENTS DENIABLE.", b = "PDL.WTF", gap = 4, tot = (a.length + gap + b.length) * 8, x0 = Math.round((W - tot) / 2);
        DS.text(a, x0, 250, mix(BLACK, mix(BLACK, PAPER, 0.7), fp));
        DS.text(b, x0 + (a.length + gap) * 8, 250, mix(BLACK, RED, fp));
      }
      DS.dissolve(seg(t, 7.2, 7.9), BLACK);
    },
    music(S, t0) {
      const T = (x) => t0 + x;
      /* the drone */
      S.tone(T(0), "E1", 7.0, { type: "sine", vol: 0.22, a: 1.0, r: 1.2 });
      S.pad(T(0), ["E2", "B2"], 7.0, { vol: 0.04, a: 1.5, r: 1.2, cutoff: 300, sweep: 900 });
      /* the scanner: a thin sine and an arpeggio in E phrygian, echoed */
      S.tone(T(0.5), "B5", 1.9, { type: "sine", vol: 0.025, a: 0.2, r: 0.2, vib: 6 });
      const arp = ["E3", "F3", "B3", "E4", "G4", "F4", "B3", "C4"];
      for (let i = 0; i < 40; i++) S.tone(T(0.5 + i * 0.125), arp[i % 8], 0.06, { type: "square", vol: 0.035, r: 0.05, cutoff: 1800, echo: 0.35, pan: i % 2 ? 0.4 : -0.4 });
      /* the name decoding */
      for (let i = 0; i < 18; i++) S.blip(T(1.0 + i * 0.066), 1200 + DS.hash(i + 300) * 1800, 0.03, 0.02);
      /* the typing */
      for (let i = 0; i < 41; i += 2) S.noise(T(2.6 + i * 0.022), 0.003, { vol: 0.1, hp: 4000, r: 0.015 });
      /* the redaction: a thunk */
      S.kick(T(4.0), 1); S.tom(T(4.0), "E2", 0.6);
      S.noise(T(4.0), 0.03, { vol: 0.35, lp: 500, r: 0.4 });
      S.tone(T(4.0), "E5", 0.4, { type: "sine", vol: 0.05, r: 0.8, echo: 0.4 });
      /* the footer bell, and the dissolve */
      S.tone(T(5.2), "E6", 0.05, { type: "sine", vol: 0.05, r: 1.4, echo: 0.4 });
      S.tone(T(5.2), "B6", 0.05, { type: "sine", vol: 0.03, r: 1.4 });
      S.noise(T(7.2), 0.7, { vol: 0.08, hp: 2000, sweep: 200, sweepOn: "hp", swell: false, a: 0.2, r: 0.4 });
    },
  });

  DS.add({
    id: "pdl-redacted", name: "[REDACTED]", group: "Plausible Deniability Labs",
    kind: "Sting", duration: 2.5, hero: 1.3,
    blurb: "A two and a half second censor drop. Static, the word REDACTED, a red bar slamming over it with a bleep. Cut it in wherever something didn't happen.",
    draw(t) {
      const frame = Math.floor(t * 30);
      DS.clear(BLACK);
      if (t < 0.2) { for (let i = 0; i < DS.N; i++) DS.main[i] = hash2(i, frame) > 0.5 ? PAPER : BLACK; return; }
      DS.ctext("THIS SEGMENT HAS BEEN", 62, PAPER, { s: 2 });
      DS.ctext("REDACTED", 100, PAPER, { s: 6 });
      const rp = ease.out(seg(t, 0.55, 0.62));
      const bx = (W - DS.tw("REDACTED", 6)) / 2 - 10;
      DS.rect(bx, 96, (DS.tw("REDACTED", 6) + 20) * rp, 104, RED);
      if (rp > 0) DS.ctext("PURSUANT TO §4.2", 214, mix(BLACK, RED, seg(t, 0.75, 1.0)), { s: 1 });
      if (t > 0.55 && t < 0.64) DS.shift(frame % 2 ? 4 : -4, frame % 2 ? -3 : 3);
      const out = seg(t, 2.15, 2.5);
      if (out > 0) DS.glitch(0.3 + out * 0.7, 30 + out * 120, frame);
      if (t > 2.42) DS.clear(BLACK);
    },
    music(S, t0) {
      const T = (x) => t0 + x;
      S.noise(T(0), 0.2, { vol: 0.25, hp: 1500, r: 0.02 });
      S.tone(T(0.2), "E2", 0.3, { type: "sawtooth", vol: 0.08, cutoff: 600, r: 0.3 });
      S.kick(T(0.55), 1); S.tom(T(0.55), "E1", 0.7);
      S.noise(T(0.55), 0.03, { vol: 0.35, lp: 500, r: 0.4 });
      S.tone(T(0.57), 1000, 0.45, { type: "sine", vol: 0.16, a: 0.003, r: 0.01 });
      for (let i = 0; i < 9; i++) S.noise(T(2.15 + i * 0.035), 0.02, { vol: 0.14, bp: 500 + DS.hash(i + 11) * 5000, q: 4, r: 0.01 });
    },
  });

  DS.add({
    id: "janus-spin", name: "Janus spin", group: "Plausible Deniability Labs",
    kind: "Loop", duration: 12, loop: true, hero: 2.2, silent: true,
    blurb: "The bust turning a full circle every 12 seconds, one bit, with a red scan line passing over it. Silent background loop.",
    draw(t) {
      DS.clear(BLACK);
      const scan = ((t % 4) / 4) * (H + 40) - 20;
      DS.drawMesh(janus(), {
        ry: FACE + (t / 12) * Math.PI * 2, rx: -0.08, cx: W / 2, cy: 136, size: 118, light: [-0.6, 0.55, 0.7], ambient: 0.04,
        shade: (x, y, i) => (Math.abs(y - scan) < 1 ? RED : Math.abs(y - scan) < 4 ? (bayer(x, y) < 0.5 ? DRED : dither(x, y, i)) : dither(x, y, i)),
      });
      DS.text("PDL", W - 3 * 16 - 12, H - 40, PAPER, { s: 2 });
      DS.rect(W - 12 - 6, H - 40, 6, 6, RED);
    },
  });
})();
