/* Meridian Strategic Systems: the "presents" opener, the production end card
 * and the globe loop. The house colours: navy, cream, crimson, gold. */
"use strict";
(() => {
  const { W, H, hex, ramp, mix, seg, ease, clamp } = DS;
  const NAVY = hex("#102441"), DEEP = hex("#040a14"), CREAM = hex("#f6f3eb"), CRIM = hex("#a33132");
  const GOLD = hex("#c4a46b"), PALE = hex("#e5c78e"), SLATE = hex("#526174"), WHITE = hex("#ffffff");
  const sky = ramp([[0, "#02050b"], [0.5, "#0c1c34"], [0.8, "#102441"], [1, "#1b355b"]], 270);
  const goldFill = ramp([[0, "#fff6dc"], [0.3, "#e5c78e"], [0.62, "#c4a46b"], [0.66, "#8a6a35"], [1, "#d9b97c"]], 64);
  const crimBar = ramp([[0, "#1a0506"], [0.55, "#a33132"], [1, "#ffd0cc"]], 32);
  const goldBar = ramp([[0, "#1c150a"], [0.55, "#c4a46b"], [1, "#fff6dc"]], 32);
  const starCol = (d) => mix(SLATE, CREAM, d);

  /* gold letters: a copper gradient down each letter, a sheen running across */
  const goldText = (y0, h, sheen) => (x, y) => {
    const s = Math.abs(x + (y - y0) * 0.6 - sheen);
    if (s < 5) return WHITE;
    return goldFill[clamp(Math.floor(((y - y0) / h) * 63), 0, 63)];
  };

  DS.add({
    id: "mss-presents", name: "Meridian Strategic Systems presents", group: "Meridian Strategic Systems",
    kind: "Bumper", duration: 8, hero: 5.6,
    blurb: "The opener. Stars, a wire globe turning on its tilt, MERIDIAN dropping in gold, a crimson meridian line scanning the name, then PRESENTS. Timpani roll into brass, ends on a CRT switch-off.",
    draw(t) {
      DS.vgrad(sky);
      DS.stars(t, 260, 0.08, starCol);
      /* the globe, faded in, tilted like the Earth */
      const ga = ease.out(seg(t, 0.2, 1.6));
      if (ga > 0) DS.globe(W / 2, 122, 104 * (0.6 + 0.4 * ga), t * 0.35, 0.41, mix(NAVY, GOLD, 0.45 * ga), mix(DEEP, SLATE, 0.35 * ga), { lat: 9, lon: 16 });
      if (ga > 0) DS.globe(W / 2, 122, 104 * (0.6 + 0.4 * ga), t * 0.35, 0.41, mix(NAVY, hex("#ff5a5a"), ga), mix(DEEP, CRIM, 0.5 * ga), { lat: 0, lon: 1 });
      /* two copper bars fall in and settle as rules above and below the name */
      const bp = ease.bounce(seg(t, 0.9, 1.7));
      if (t > 0.9) {
        DS.copper(-10 + (56 - -10) * bp, 7, crimBar);
        DS.copper(H + 10 + (146 - (H + 10)) * bp, 7, goldBar);
      }
      /* MERIDIAN: each letter drops and bounces, a gold copper fill, a hard navy shadow */
      const word = "MERIDIAN", s = 4, sp = 1, x0 = Math.round((W - DS.tw(word, s, sp)) / 2), y0 = 70;
      const sheen = (t - 2.8) * 260;
      DS.text(word, x0, y0, goldText(y0, 64, sheen), {
        s, sp, shadow: DEEP, so: 4,
        on: (i) => t > 1.55 + i * 0.09,
        dy: (i) => -(1 - ease.bounce(seg(t, 1.55 + i * 0.09, 2.05 + i * 0.09))) * 150,
      });
      /* STRATEGIC SYSTEMS types on */
      const sub = "STRATEGIC SYSTEMS", k = Math.floor(seg(t, 2.6, 3.35) * sub.length);
      if (t > 2.6) DS.shade(56, 150, W - 112, 40, DEEP, 0.6 * seg(t, 2.6, 2.8));
      if (t > 2.6) DS.ctext(sub.slice(0, k).padEnd(sub.length, " "), 154, CREAM, { s: 2, sp: 1, shadow: DEEP, so: 2 });
      if (t > 2.6 && t < 3.6 && Math.floor(t * 8) % 2 === 0) {
        const cx = Math.round((W - DS.tw(sub, 2, 1)) / 2) + k * 18;
        DS.rect(cx, 154, 16, 32, PALE);
      }
      /* the meridian: a crimson line sweeping across, lighting what it crosses */
      const mp = seg(t, 3.4, 4.3);
      if (mp > 0 && mp < 1) {
        const mx = Math.round(-20 + mp * (W + 40));
        for (let y = 0; y < H; y++) for (let dx = -2; dx <= 2; dx++) {
          const x = mx + dx; if (x < 0 || x >= W) continue;
          const i = y * W + x; DS.main[i] = dx === 0 ? hex("#ffd0cc") : mix(DS.main[i], CRIM, 0.75);
        }
      }
      /* PRESENTS: a crimson band opens from the centre, white letters in it */
      const pp = ease.out(seg(t, 4.4, 4.9));
      if (pp > 0) {
        const bw = Math.round(pp * 230), py = 204;
        DS.rect(W / 2 - bw / 2, py - 6, bw, 44, CRIM);
        DS.rect(W / 2 - bw / 2, py - 8, bw, 2, PALE); DS.rect(W / 2 - bw / 2, py + 38, bw, 2, PALE);
        const p2 = "PRESENTS", x = Math.round((W - DS.tw(p2, 2, 4)) / 2);
        DS.text(p2, x, py, CREAM, { s: 2, sp: 4, on: (i) => Math.abs(i - 3.5) < pp * 4.6, shadow: DEEP, so: 2 });
      }
      /* fade in from black, and the CRT switch-off at the end */
      DS.fade(0, 1 - seg(t, 0, 0.35));
      if (t > 5.0 && t < 5.12) DS.fade(WHITE, 0.55 * (1 - seg(t, 5.0, 5.12)));
      DS.tvOff(seg(t, 7.15, 7.85));
      if (t >= 7.85) DS.clear(0);
    },
    music(S, t0) {
      const T = (x) => t0 + x;
      /* a low pedal under everything */
      S.pad(T(0), ["D1", "D2", "A2"], 7.0, { vol: 0.05, a: 1.2, r: 1.5, cutoff: 420 });
      /* the timpani roll, swelling */
      for (let k = 0, x = 0.15; x < 1.55; k++, x += 0.055) S.timpani(T(x), k % 2 ? "A1" : "D2", 0.08 + 0.42 * ((x - 0.15) / 1.4));
      /* the brass hit as MERIDIAN lands */
      S.brass(T(1.6), ["D3", "F3", "A3", "D4"], 1.0, 0.075);
      S.timpani(T(1.6), "D2", 0.9); S.kick(T(1.6)); S.crash(T(1.6), 0.22);
      ["D5", "F5", "G5", "A5", "C6", "D6", "F6", "A6"].forEach((n, i) => S.blip(T(1.6 + i * 0.09 + 0.35), n, 0.05, 0.05, "triangle"));
      /* the typewriter */
      for (let i = 0; i < 17; i++) S.noise(T(2.6 + i * 0.044), 0.004, { vol: 0.14, hp: 3500, r: 0.02 });
      S.pad(T(2.6), ["F3", "A3", "C4"], 1.6, { vol: 0.04, a: 0.4, cutoff: 1200 });
      /* the meridian scan: a sine gliding up over the riser */
      S.tone(T(3.4), "A4", 0.9, { type: "sine", vol: 0.05, slide: "A5", r: 0.3, echo: 0.3 });
      S.riser(T(3.6), 0.8, 0.14);
      /* PRESENTS: Bb, then the D major resolve */
      S.brass(T(4.4), ["Bb2", "D3", "F3", "Bb3"], 0.55, 0.07);
      S.timpani(T(4.4), "Bb1", 0.7);
      S.brass(T(5.0), ["D3", "F#3", "A3", "D4", "F#4"], 1.8, 0.08);
      S.timpani(T(5.0), "D2", 1); S.kick(T(5.0)); S.crash(T(5.0), 0.3);
      S.pad(T(5.0), ["D2", "A2", "F#3", "A3"], 2.1, { vol: 0.05, a: 0.05, r: 1.2, cutoff: 1800, thick: true });
      for (let k = 0; k < 4; k++) S.timpani(T(5.5 + k * 0.42), "A1", 0.25 - k * 0.04);
      /* the switch-off */
      S.zap(T(7.15), 1400, 30, 0.6, 0.12);
    },
  });

  DS.add({
    id: "mss-production", name: "A Meridian Strategic Systems production", group: "Meridian Strategic Systems",
    kind: "End card", duration: 5, hero: 2.6,
    blurb: "The end card. Interference rings in navy behind a framed panel, a small globe spinning above the name, the web address in gold. Soft resolve, fades out.",
    draw(t) {
      DS.rings(t * 0.6, DEEP, hex("#0d1f3a"), 16);
      const pw = 440, ph = 176, px = (W - pw) / 2, py = 52;
      DS.shade(px, py, pw, ph, DEEP, 0.92);
      DS.rect(px, py, pw, 1, GOLD); DS.rect(px, py + ph - 1, pw, 1, GOLD);
      DS.rect(px, py + 3, pw, 1, mix(DEEP, GOLD, 0.4)); DS.rect(px, py + ph - 4, pw, 1, mix(DEEP, GOLD, 0.4));
      DS.globe(W / 2, 40, 26, t * 0.9, 0.41, GOLD, mix(DEEP, SLATE, 0.5), { lat: 6, lon: 10 });
      const a = ease.out(seg(t, 0.3, 0.9));
      DS.ctext("A", 78, mix(DEEP, CREAM, a), { s: 1 });
      const name = "MERIDIAN STRATEGIC SYSTEMS";
      DS.ctext(DS.decode(name, seg(t, 0.5, 1.4), t, 3), 102, goldText(102, 32, (t - 1.6) * 300), { s: 2, shadow: DEEP, so: 2 });
      const b = ease.out(seg(t, 1.4, 1.9));
      DS.ctext("PRODUCTION", 142, mix(DEEP, CREAM, b), { s: 2, sp: 5 });
      DS.rect(W / 2 - 60 * b, 182, 120 * b, 2, CRIM);
      const url = "meridianstrategic.systems", k = Math.floor(seg(t, 2.0, 2.8) * url.length);
      DS.ctext(url.slice(0, k).padEnd(url.length, " "), 196, PALE, {});
      DS.fade(0, 1 - seg(t, 0, 0.4));
      DS.fade(0, seg(t, 4.3, 5.0));
    },
    music(S, t0) {
      const T = (x) => t0 + x;
      S.pad(T(0.1), ["D3", "A3", "E4", "F#4"], 3.8, { vol: 0.05, a: 0.8, r: 1.4, cutoff: 1500, echo: 0.2 });
      S.pad(T(0.1), ["D2"], 3.8, { type: "triangle", vol: 0.08, a: 0.5, r: 1.2 });
      ["D5", "A5", "E6", "F#6", "A6", "D7"].forEach((n, i) => S.tone(T(0.5 + i * 0.16), n, 0.05, { type: "sine", vol: 0.06, r: 0.8, echo: 0.4 }));
      S.timpani(T(1.4), "D2", 0.45);
      ["A5", "F#5", "D5"].forEach((n, i) => S.tone(T(2.2 + i * 0.22), n, 0.05, { type: "sine", vol: 0.045, r: 1.0, echo: 0.4 }));
    },
  });

  DS.add({
    id: "mss-globe", name: "Meridian globe", group: "Meridian Strategic Systems",
    kind: "Loop", duration: 20, loop: true, hero: 3, silent: true,
    params: [{ k: "ticker", label: "Ticker", def: "MERIDIAN STRATEGIC SYSTEMS  +++  THE DR. J SHOW  +++  MERIDIANSTRATEGIC.SYSTEMS  +++  " }],
    blurb: "A background loop for a stream or a segment card: the gold globe turning in space, copper rules, and a ticker along the bottom you can rewrite.",
    draw(t) {
      DS.vgrad(sky);
      DS.stars(t, 180, 0.05, starCol);
      /* one turn every 20 s, so the loop closes */
      const rot = (t / 20) * Math.PI * 2;
      DS.globe(W / 2, 132, 90, rot, 0.41, mix(NAVY, GOLD, 0.7), mix(DEEP, SLATE, 0.4), { lat: 9, lon: 18 });
      DS.globe(W / 2, 132, 90, rot, 0.41, hex("#ff5a5a"), mix(DEEP, CRIM, 0.5), { lat: 0, lon: 1 });
      /* a satellite on a polar orbit, three times a loop */
      const a = (t / 20) * Math.PI * 2 * 3, sx = W / 2 + Math.cos(a) * 124, sy = 132 + Math.sin(a) * 34;
      DS.rect(sx - 1, sy - 1, 3, 3, Math.sin(a) > 0 ? CREAM : SLATE);
      DS.copper(18, 5, goldBar);
      DS.ctext("MERIDIAN STRATEGIC SYSTEMS", 25, CREAM, { s: 1, sp: 1, shadow: DEEP });
      DS.copper(228, 5, crimBar);
      DS.shade(0, 234, W, 24, DEEP, 0.85);
      const msg = DS.param("ticker", this.params[0].def).toUpperCase();
      const w = DS.tw(msg, 1, 1), x = -(((t / 20) * w * 2) % w);
      for (let k = 0; k < Math.ceil(W / w) + 1; k++) DS.text(msg, x + k * w, 238, PALE, { sp: 1 });
    },
  });
})();
