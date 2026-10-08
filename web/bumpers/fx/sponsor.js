/* Sponsor slates: "this segment is sponsored by" (name, tagline and address
 * from the page's fields or ?name= &tag= &url=) and the way back into the show. */
"use strict";
(() => {
  const { W, H, hex, ramp, mix, seg, ease, clamp } = DS;
  const BLACK = hex("#000000"), FG = hex("#87ff87"), YEL = hex("#ffff00"), CYAN = hex("#00ffff"), ORANGE = hex("#ffa700");
  const TEAL = hex("#00afaf"), STATUS = hex("#00008b"), PURPLE = hex("#5f00af"), WHITE = hex("#ffffff");
  const checker = DS.texture((x, y) => (x % 32 === 0 || y % 32 === 0 ? hex("#003a5a") : ((x >> 5) ^ (y >> 5)) & 1 ? STATUS : hex("#000020")));
  const magBar = ramp([[0, "#1a001a"], [0.6, "#ff00ff"], [1, "#ffd7ff"]], 24);
  const nameFill = ramp([[0, "#ffffd0"], [0.4, "#ffff00"], [1, "#ffa700"]], 32);

  DS.add({
    id: "sponsor", name: "Sponsored by", group: "Sponsor slates",
    kind: "Sponsor", duration: 6, hero: 3.4,
    params: [
      { k: "name", label: "Sponsor", def: "PLAUSIBLE DENIABILITY LABS" },
      { k: "tag", label: "Tagline", def: "ALL STATEMENTS DENIABLE." },
      { k: "url", label: "Address", def: "PDL.WTF" },
    ],
    blurb: "The sponsor read's opener. A rotozoomed checkerboard, the header typing on, the sponsor's name bouncing in letter by letter, their line and their address. Type the sponsor into the fields and it fits the name to the screen.",
    draw(t) {
      const [pn, pt, pu] = this.params;
      const name = DS.param("name", pn.def).toUpperCase().slice(0, 40);
      const tag = DS.param("tag", pt.def).toUpperCase().slice(0, 58);
      const url = DS.param("url", pu.def).slice(0, 28);
      DS.rotozoom(t, checker, t * 0.35, 0.75 + Math.sin(t * 0.9) * 0.25, t * 40, t * 18);
      DS.copper(24 + Math.sin(t * 3) * 4, 40, magBar);
      const hd = "THIS SEGMENT IS SPONSORED BY", k = Math.floor(seg(t, 0.15, 0.8) * hd.length);
      DS.ctext(hd.slice(0, k).padEnd(hd.length, " "), 28, WHITE, { s: 2, shadow: PURPLE, so: 2 });
      /* the panel */
      const py = 78, ph = 122;
      DS.shade(0, py, W, ph, BLACK, 0.88);
      DS.rect(0, py, W, 1, TEAL); DS.rect(0, py + ph - 1, W, 1, TEAL);
      /* the name, fitted: as big as will go on one line */
      const s = clamp(Math.floor(448 / (name.length * 8)), 1, 6), sy = Math.min(s, 5);
      const ny = py + Math.round((ph - 16 * sy - (tag ? 24 : 0)) / 2);
      const nx = Math.round((W - DS.tw(name, s)) / 2);
      DS.text(name, nx, ny, (x, y) => nameFill[clamp(Math.floor(((y - ny) / (16 * sy)) * 31), 0, 31)], {
        s, sy, shadow: PURPLE, so: Math.max(1, s >> 1),
        on: (i) => t > 0.9 + i * 0.035,
        dy: (i) => -(1 - ease.bounce(seg(t, 0.9 + i * 0.035, 1.35 + i * 0.035))) * 120 + (t > 2 ? Math.sin(t * 4 + i * 0.6) * 2 : 0),
      });
      if (tag) DS.ctext(DS.decode(tag, seg(t, 1.8, 2.5), t, 9), ny + 16 * sy + 10, CYAN);
      /* the address, typed, with a cursor */
      if (t > 2.6) {
        const u = url.slice(0, Math.floor(seg(t, 2.6, 3.1) * url.length)), ux = Math.round((W - DS.tw(url, 2)) / 2);
        DS.rect(0, 206, W, 40, mix(BLACK, STATUS, 0.85));
        DS.text(u, ux, 210, WHITE, { s: 2 });
        if (Math.floor(t * 2.4) % 2 === 0) DS.rect(ux + u.length * 16, 210, 16, 32, FG);
      }
      /* out: vertical blinds closing */
      const op = seg(t, 5.3, 5.9);
      if (op > 0) for (let b = 0; b < W / 24; b++) DS.rect(b * 24, 0, 24 * ease.in(clamp(op * 1.6 - b * 0.03)), H, BLACK);
    },
    music(S, t0) {
      const st = 60 / 140 / 4, T = (x) => t0 + x;
      const prog = [["C3", "E3", "G3"], ["A2", "C3", "E3"], ["F2", "A2", "C3"], ["G2", "B2", "D3"]];
      const bass = ["C2", "A1", "F1", "G1"];
      for (let half = 0; half < 6; half++) {
        const c = half % 4, b0 = half * 8 * st;
        if (b0 > 5.3) break;
        S.seq(T(b0), st, "x.xx.xx.", (tt, ch, i) => S.tone(tt, i === 3 ? S.hz(bass[c]) * 2 : bass[c], 0.09, { type: "triangle", vol: 0.17, r: 0.03 }));
        S.seq(T(b0), st, "x...x...", (tt) => S.kick(tt, 0.5));
        S.seq(T(b0), st, "..x...x.", (tt, ch, i) => (i === 6 ? S.snare(tt, 0.2) : S.hat(tt, 0.07)));
        if (b0 >= 0.85) {
          const arp = prog[c].map((n) => S.hz(n) * 4);
          S.seq(T(b0), st, "xxxxxxxx", (tt, ch, i) => S.blip(tt, arp[i % 3] * (i > 3 ? 2 : 1), 0.028, 0.05));
        }
      }
      for (let i = 0; i < 28; i += 2) S.blip(T(0.15 + i * 0.023), 1500 + (i % 4) * 200, 0.02, 0.015);
      S.crash(T(0.9), 0.15); S.brass(T(0.9), ["C4", "E4", "G4"], 0.25, 0.05);
      ["C5", "E5", "G5", "C6"].forEach((n, i) => S.blip(T(2.6 + i * 0.06), n, 0.04, 0.05, "triangle"));
      S.brass(T(5.3), ["C3", "G3", "C4", "E4"], 0.6, 0.07); S.kick(T(5.3)); S.crash(T(5.3), 0.2);
    },
  });

  const L = DS.layer();
  DS.add({
    id: "back-to-show", name: "And now, back to the show", group: "Sponsor slates",
    kind: "Sponsor", duration: 3, hero: 1.6,
    blurb: "The way out of the sponsor read. Warp stars, the line zooming in, then flying past the camera into a white flash.",
    draw(t) {
      DS.clear(BLACK);
      const sp = 0.5 + ease.in(seg(t, 1.8, 2.9)) * 4;
      DS.stars(t * sp, 300, 0.9, (d) => mix(STATUS, d > 0.7 ? WHITE : CYAN, d), { streak: 0.04 });
      DS.use(L); DS.clear(0);
      DS.ctext("AND NOW", 92, YEL, { s: 2, sp: 2, shadow: PURPLE, so: 2 });
      DS.ctext("BACK TO THE SHOW", 126, (x, y) => mix(FG, WHITE, clamp((y - 126) / 48 * -1 + 0.4)), { s: 3, shadow: PURPLE, so: 3 });
      DS.use();
      const zin = ease.back(seg(t, 0.35, 0.8)), zout = ease.in(seg(t, 2.3, 2.85));
      const sc = t < 0.35 ? 0 : 0.15 + 0.85 * zin + zout * 9;
      if (sc > 0.02) DS.blit(L, sc, W / 2, 132);
      DS.fade(WHITE, seg(t, 2.7, 2.85));
    },
    music(S, t0) {
      const T = (x) => t0 + x;
      S.riser(T(0), 0.35, 0.16, 400, 5000);
      S.brass(T(0.35), ["G3", "C4", "E4", "G4"], 0.5, 0.07); S.kick(T(0.35)); S.crash(T(0.35), 0.18);
      ["C5", "E5", "G5", "C6", "G5", "E5", "C5", "G4"].forEach((n, i) => S.blip(T(0.6 + i * 0.16), n, 0.035, 0.08, "square"));
      S.riser(T(2.2), 0.65, 0.22, 200, 9000);
      S.zap(T(2.2), 80, 2400, 0.65, 0.05);
      S.kick(T(2.85)); S.crash(T(2.85), 0.3);
    },
  });
})();
