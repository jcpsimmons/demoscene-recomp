/* The Dr. J Show: the 4 s show bumper, the BRB / starting-soon loop and the
 * burning logo. The NeoVim murphy palette the show's graphics use. */
"use strict";
(() => {
  const { W, H, hex, ramp, mix, seg, ease, clamp, hash2 } = DS;
  const BLACK = hex("#000000"), FG = hex("#87ff87"), YEL = hex("#ffff00"), CYAN = hex("#00ffff"), MAG = hex("#ff00ff");
  const RED = hex("#ff0000"), ORANGE = hex("#ffa700"), TEAL = hex("#00afaf"), STATUS = hex("#00008b"), PURPLE = hex("#5f00af");
  const WHITE = hex("#ffffff"), GRAY = hex("#444444"), DIMYEL = mix(BLACK, YEL, 0.55);
  const plasmaPal = ramp([[0, "#000000"], [0.25, "#002a10"], [0.5, "#00174a"], [0.75, "#003a2a"], [1, "#000000"]], 256);
  const magBar = ramp([[0, "#1a001a"], [0.6, "#ff00ff"], [1, "#ffd7ff"]], 24);
  const cyanBar = ramp([[0, "#001a1a"], [0.6, "#00afaf"], [1, "#d7ffff"]], 24);
  const CHURN = [FG, YEL, CYAN, WHITE, hex("#005f00"), MAG];

  /* the wall: rows of words, re-dealt every other frame, each row sliding */
  const WORDS = ("LABOR CAPITAL WAGES LAYOFFS H-1B AI AUTOMATION BILLIONAIRES SHAREHOLDERS SURVEILLANCE " +
    "PLATFORM MONOPOLY DIGNITY SOURCES DATA UNION RENT OFFSHORING CONTRACTORS QUARTERLY EARNINGS " +
    "THE ALGORITHM HEADCOUNT EFFICIENCY RETURN-TO-OFFICE OVERTIME BENEFITS EQUITY VESTING " +
    "MANAGEMENT ACCOUNTABILITY THE DEAL THE WORK THE PEOPLE DOING THE WORK").split(" ");
  const wallWords = () => {
    const w = DS.param("wall", "");
    return w ? w.toUpperCase().replace(/[^\x20-\x7e]/g, " ").split(/\s+/).filter(Boolean) : WORDS;
  };
  const wall = (t, bright, words) => {
    const deal = Math.floor(t * 15);
    for (let r = 0; r < 17; r++) {
      const speed = 30 + hash2(r, 7) * 90, dir = r % 2 ? 1 : -1;
      let x = -((t * speed) % 64) * dir - 64, j = 0;
      while (x < W) {
        const h = hash2(r * 131 + j, deal + (r % 3));
        if (h < 0.18) {
          const ts = `[${String(Math.floor(h * 1000) % 60).padStart(2, "0")}:${String(Math.floor(h * 9000) % 60).padStart(2, "0")}]`;
          DS.text(ts, x, r * 16, mix(BLACK, DIMYEL, bright));
          x += (ts.length + 1) * 8;
        } else {
          const w = words[Math.floor(h * 997) % words.length];
          DS.text(w, x, r * 16, mix(BLACK, h > 0.92 ? WHITE : FG, bright * (0.45 + 0.55 * hash2(j, r))));
          x += (w.length + 1) * 8;
        }
        j++;
      }
    }
  };

  const L = DS.layer();
  DS.add({
    id: "drj-show", name: "The Dr. J Show", group: "The Dr. J Show",
    kind: "Bumper", duration: 4, hero: 1.9,
    params: [{ k: "wall", label: "Wall text", def: "" }],
    blurb: "The 4 second show bumper on the house timing: a wall of words over plasma, the title building out of churning blocks, slamming on the braam at 0.40 s, holding, then tearing apart at 3.70 s. Paste an episode's own words into Wall text to fill the wall with them.",
    draw(t) {
      const frame = Math.floor(t * 30);
      const locked = t >= 0.4, out = seg(t, 3.7, 4.0);
      DS.plasma(t, plasmaPal);
      wall(t, locked ? 0.22 + 0.78 * out : 1, wallWords());
      if (locked) {
        DS.copper(132 + Math.sin(t * 2.6) * 96, 10, magBar);
        DS.copper(132 + Math.sin(t * 2.6 + 2.2) * 96, 10, cyanBar);
      }
      /* the cleared terminal window the title sits in */
      const px = 88, py = 26, pw = 304, ph = 236;
      if (locked && out < 0.5) {
        DS.rect(px, py, pw, ph, BLACK);
        DS.rect(px, py, pw, 1, TEAL); DS.rect(px, py + ph - 1, pw, 1, TEAL); DS.rect(px, py, 1, ph, TEAL); DS.rect(px + pw - 1, py, 1, ph, TEAL);
        DS.rect(px + 1, py + 1, pw - 2, 16, hex("#303030"));
        DS.text(" drj.show ", px + 8, py + 1, WHITE);
      }
      /* the title, into its own layer so it can slam */
      DS.use(L); DS.clear(0);
      const build = seg(t, 0, 0.36) * 12 * 1.25;
      const glint = (t - 1.6) / 0.6 * 520 - 60;
      let n = 0;
      const lockedCol = (base) => (x, y) => (t > 1.6 && t < 2.2 && Math.abs(x + y * 0.6 - glint) < 7 ? WHITE : base);
      const churn = (s) => (x, y) => CHURN[Math.floor(hash2(Math.floor(x / s) + Math.floor(y / s) * 977, frame) * CHURN.length)];
      const word = (str, s, y, base) => {
        const first = n; n += str.replace(/ /g, "").length;
        const on = (i) => !locked ? (first + i) < build : out === 0 || hash2(first + i, frame) > out * 1.2;
        const x0 = Math.round((W - DS.tw(str, s)) / 2);
        const jx = out > 0 ? (i) => (hash2(i + first, frame + 3) - 0.5) * 80 * out : null;
        for (let i = 0; i < str.length; i++) {
          if (str[i] === " " || !on(i)) continue;
          const xi = x0 + i * 8 * s + (jx ? jx(i) : 0);
          DS.text(str[i], xi, y + (jx ? jx(i + 9) * 0.5 : 0), locked ? lockedCol(base) : churn(s), { s, shadow: locked ? PURPLE : undefined, so: Math.max(2, s) });
        }
      };
      word("THE", 2, 36, FG);
      word("DR. J", 6, 70, YEL);
      word("SHOW", 4, 168, FG);
      DS.use();
      /* lock: 108% -> 103% -> 100% and a two-frame shake */
      const sc = t < 0.4 ? 1 : t < 0.434 ? 1.08 : t < 0.467 ? 1.03 : 1;
      const sh = t >= 0.4 && t < 0.467 ? (frame % 2 ? 3 : -3) : 0;
      DS.blit(L, sc, W / 2, 140, sh, -sh);
      /* the handle types on under the title */
      if (locked && out < 0.5) {
        const hd = "@drjoshcsimmons", k = Math.floor(seg(t, 0.55, 1.05) * hd.length);
        const hx = Math.round((W - DS.tw(hd)) / 2);
        DS.text(hd.slice(0, k), hx, 240, CYAN);
        if (Math.floor(t * 2.2) % 2 === 0) DS.rect(hx + k * 8, 240, 8, 16, FG);
      }
      if (t >= 0.4 && t < 0.434) DS.fade(WHITE, 0.35);
      if (out > 0) DS.glitch(0.25 + out * 0.75, 20 + out * 140, frame);
    },
    music(S, t0) {
      const T = (x) => t0 + x;
      /* data blurps while the title builds */
      for (let i = 0; i < 14; i++) S.blip(T(i * 0.027), 600 + DS.hash(i + 40) * 2400, 0.05, 0.02);
      S.tone(T(0.0), 200, 0.38, { type: "sawtooth", vol: 0.05, slide: 1600, cutoff: 2000, r: 0.02 });
      S.noise(T(0.0), 0.38, { vol: 0.08, bp: 800, sweep: 7000, q: 3, swell: true });
      /* the braam on the lock */
      S.braam(T(0.4), "A1", 3.0, 0.6);
      S.tone(T(0.4), "A4", 0.05, { type: "square", vol: 0.04, r: 0.4, echo: 0.5 });
      /* the glitch out */
      for (let i = 0; i < 9; i++) {
        const x = 3.7 + i * 0.033;
        S.noise(T(x), 0.018, { vol: 0.16, bp: 400 + DS.hash(i + 7) * 6000, q: 4, r: 0.01 });
        S.blip(T(x + 0.01), 80 + DS.hash(i + 70) * 900, 0.06, 0.015);
      }
    },
  });

  /* ---- BRB / starting soon: tunnel, wobbling copper title, sine scroller ---- */
  const tunTex = DS.texture((x, y) => {
    if (x % 32 === 0 || y % 32 === 0) return TEAL;
    if ((x & 31) === 16 && (y & 31) === 16) return YEL;
    return ((x >> 5) ^ (y >> 5)) & 1 ? hex("#004d1f") : hex("#00002e");
  });
  const fill = ramp([[0, "#ff00ff"], [0.45, "#ffd7ff"], [0.5, "#ffffff"], [0.55, "#d7ffff"], [1, "#00ffff"]], 64);
  const brb = (id, name, def, msg, hero, blurb) => DS.add({
    id, name, group: "The Dr. J Show", kind: "Loop", duration: 16, loop: true, hero,
    params: [{ k: "text", label: "Title", def }, { k: "msg", label: "Scroller", def: msg }],
    blurb,
    draw(t) {
      DS.tunnel(t, tunTex, { speed: 64, spin: 16, fog: BLACK });
      const title = DS.param("text", def).toUpperCase().slice(0, 30);
      const s = clamp(Math.floor(440 / (title.length * 8)), 1, 6), y0 = 136 - 8 * s;
      DS.shade(0, y0 - 14, W, 16 * s + 28, BLACK, 0.55);
      DS.text(title, Math.round((W - DS.tw(title, s)) / 2), y0, (x, y) => fill[clamp(Math.floor(((y - y0) / (16 * s)) * 63 + Math.sin(t * Math.PI / 2 + x / 60) * 8), 0, 63)], {
        s, shadow: PURPLE, so: Math.max(2, s >> 1), dy: (i) => Math.sin((t / 4) * Math.PI * 2 + i * 0.55) * 6,
      });
      /* statusline */
      DS.rect(0, 0, W, 16, STATUS);
      DS.text(" THE DR. J SHOW", 0, 0, WHITE);
      const clock = Math.floor(t * 2) % 2 ? "  ON AIR SOON " : "              ";
      DS.text(clock, W - clock.length * 8, 0, YEL);
      /* the scroller, wrapping once every 16 s */
      const m = DS.param("msg", msg).toUpperCase() + "     ";
      const w = DS.tw(m, 2), off = -((t / 16) * w) % w;
      for (let k = 0; k < Math.ceil(W / w) + 1; k++) {
        const xb = off + k * w;
        DS.text(m, xb, 216, (x, y) => mix(YEL, ORANGE, clamp((y - 216) / 32)), {
          s: 2, shadow: BLACK, so: 2, dy: (i) => Math.sin(((xb + i * 16) / W) * Math.PI * 2 + (t / 2) * Math.PI * 2) * 10,
        });
      }
      DS.rect(0, 254, W, 16, hex("#303030"));
      DS.rect(0, 254, 64, 16, FG); DS.text(" NORMAL ", 0, 254, BLACK);
      DS.text("drjoshcsimmons.com ", W - 19 * 8, 254, hex("#bcbcbc"));
    },
    music(S, t0) {
      /* 120 bpm, eight bars of A minor, so it loops on the 16 s */
      const st = 0.125, T = (x) => t0 + x;
      const chords = [["A2", "E3", "C4"], ["F2", "C3", "A3"], ["C3", "G3", "E4"], ["G2", "D3", "B3"]];
      const bass = ["A1", "F1", "C2", "G1"];
      for (let bar = 0; bar < 8; bar++) {
        const c = bar % 4, b0 = bar * 2;
        S.pad(T(b0), chords[c], 1.9, { vol: 0.035, a: 0.2, r: 0.3, cutoff: 1100, type: "square" });
        S.seq(T(b0), st, "x.x.x.xxx.x.x.xx", (tt, ch, i) => S.tone(tt, i % 4 === 3 ? S.hz(bass[c]) * 2 : bass[c], 0.1, { type: "triangle", vol: 0.16, r: 0.04 }));
        S.seq(T(b0), st, "x.......x.......", (tt) => S.kick(tt, 0.55));
        S.seq(T(b0), st, "....x.......x...", (tt) => S.snare(tt, 0.22));
        S.seq(T(b0), st, "..x...x...x...xx", (tt) => S.hat(tt, 0.06));
        const arp = chords[c].map((n) => S.hz(n) * 2);
        S.seq(T(b0), st, "xxxxxxxxxxxxxxxx", (tt, ch, i) => S.blip(tt, arp[i % 3] * (i % 6 < 3 ? 1 : 2), 0.025, 0.06));
      }
    },
  });
  brb("brb", "Be right back", "BE RIGHT BACK",
    "THE DR. J SHOW WILL BE RIGHT BACK  ***  GO REFILL THE COFFEE  ***  GREETINGS TO FUTURE CREW, TRITON AND NOOON, WHOSE DEMOS RUN ON THIS SITE  ***  ", 5.2,
    "A break screen for the stream. A tunnel running forever, the title in a copper fill, a sine scroller with greetings, a chiptune loop that closes every 16 s. Title and scroller are yours to change.");
  brb("starting-soon", "Starting soon", "STARTING SOON",
    "THE DR. J SHOW STARTS IN A MINUTE  ***  GRAB A CHAIR  ***  DRJOSHCSIMMONS.COM  ***  ", 9.5,
    "The same loop set up for the minutes before a stream goes live.");

  /* ---- the burning logo ---- */
  const firePal = ramp([[0, "#000000"], [0.18, "#1a0000"], [0.36, "#8b0000"], [0.55, "#ff2a00"], [0.72, "#ffa700"], [0.88, "#ffff00"], [1, "#ffffff"]], 256);
  const fire = DS.Fire(firePal, { rate: 60, cool: 2.2, bed: 170 });
  const molten = ramp([[0, "#fff6b0"], [0.35, "#ffd000"], [0.7, "#ff6a00"], [1, "#8b0a00"]], 64);
  let mask = null;
  DS.add({
    id: "drj-fire", name: "Dr. J on fire", group: "The Dr. J Show",
    kind: "Loop", duration: 10, loop: true, hero: 4, silent: true,
    blurb: "The old fire effect from every 1993 intro, burning the DR. J logo. Silent, endless, good behind a hot take.",
    draw(t) {
      if (!mask) { mask = DS.layer(); DS.use(mask); DS.ctext("DR. J", 76, 1, { s: 8 }); DS.use(); }
      fire(t, mask);
      DS.ctext("DR. J", 76, (x, y) => molten[clamp(Math.floor(((y - 76) / 128) * 63 + Math.sin(t * 3 + x / 30) * 4), 0, 63)], { s: 8, shadow: hex("#200000"), so: 3 });
      DS.ctext("THE", 36, YEL, { s: 2, shadow: hex("#3a0000"), so: 2 });
      DS.ctext("SHOW", 218, YEL, { s: 2, sp: 2, shadow: hex("#3a0000"), so: 2 });
    },
  });
})();
