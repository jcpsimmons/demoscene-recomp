/* demoscene-recomp: the look-only switch, shared by every page.
 *
 *   CRT picture (#crt)   scanlines and bloom on the demo PICTURE (#stage.crt).
 *                        OFF by default, remembered: off is the original picture.
 *
 * It never touches the demo's scripts or the canvas itself. */
"use strict";
(() => {
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  const crt = document.getElementById("crt"), stage = document.getElementById("stage");
  if (crt && stage) {
    crt.checked = get("recomp.crtpicture") === "1";
    const apply = () => stage.classList.toggle("crt", crt.checked);
    crt.addEventListener("change", () => { apply(); put("recomp.crtpicture", crt.checked ? "1" : "0"); });
    apply();
  }
})();
/* THE ≡ MENU (top bar, every page): the site style, Retro or Modern. The
   switch itself is window.recompLook (fit.js), which remembers it. */
(() => {
  const btn = document.getElementById("lookbtn"), menu = document.getElementById("lookmenu");
  if (!btn || !menu || !window.recompLook) return;
  const items = [...menu.querySelectorAll("[data-look]")];
  const sync = () => items.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.look === window.recompLook())));
  const open = (on) => {
    menu.hidden = !on; btn.setAttribute("aria-expanded", String(on));
    if (on) { sync(); (items.find((b) => b.getAttribute("aria-checked") === "true") || items[0]).focus(); }
  };
  btn.addEventListener("click", (e) => { e.stopPropagation(); open(menu.hidden); });
  items.forEach((b) => b.addEventListener("click", () => { window.recompLook(b.dataset.look); sync(); open(false); btn.focus(); }));
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) open(false); });
  /* capture: the menu's keys come before the page's (the landing menu's 1/2,
     arrows and Enter; the demo's F) */
  document.addEventListener("keydown", (e) => {
    if (menu.hidden) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { open(false); btn.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    else if (e.key === "Enter" || e.key === " ") { if (i >= 0) items[i].click(); }
    else if (e.key !== "Tab") return;
    if (e.key === "Tab") { open(false); return; }
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  sync();
})();
/* SPACE. The page is StarPort's: black space full of stars, drawn as CP437
   characters on the same 8x16 grid as the text (#space, behind everything),
   so every star is a sharp glyph and nothing is an image. The grid starts at
   the top left of the document and covers all of it; a cell gets a star or
   not by a hash of its row and column (and a seed drawn at each page load), so
   a resize keeps the stars where they were and only adds or removes the edges. Stars are left out wherever they
   would touch something: every run of text, the logos, the frame lines, the
   controls and the demo picture (which is how the black picture shows its
   edge before it starts). Static: nothing moves or twinkles.
   Rebuilt when the layout changes (resize, font load, status line). */
(() => {
  const body = document.body;
  const space = document.createElement("pre");
  space.id = "space"; space.setAttribute("aria-hidden", "true");
  body.insertBefore(space, body.firstChild);

  /* what a star must not touch: whole elements, and every run of text */
  const SOLID = "#stage, .bar, .btn, select, label.ck, #status, .box > .t, ol.menu a, ol.steps li, .link a, dl.nfo dt, [data-nostars]";
  /* a new sky on every page load; fixed for the life of the page, so a resize
     or relayout keeps the stars where they were */
  const SEED = (Math.random() * 4294967296) >>> 0;
  const hash = (r, c, s) => {
    let h = Math.imul(r, 0x27d4eb2d) ^ Math.imul(c + 0x9e37, 0x165667b1) ^ Math.imul(s, 0x85ebca6b) ^ SEED;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  /* the sky: dots only (CP437 . · ∙), in greys - mostly dark grey,
     some light grey, full white only occasionally (~3%) */
  const KINDS = [
    [0.40, "∙", "v8"], [0.60, "·", "v8"], [0.72, ".", "v8"],
    [0.86, "∙", "v7"], [0.97, "·", "v7"], [1.01, "∙", "vf"],
  ];
  const DENSITY = 0.07;
  /* ANSI-block space art in StarPort's spirit - a station (grey modules, blue
     windows and solar panels, red bands and beacons) and a small moon - drawn
     into the starfield where a free patch of the first screen allows (the
     margins of a wide window, 100 columns or more), never over anything. Each row: the characters,
     then the foreground and background colours as VGA indices ("." = none). */
  const ART = [
    { tx: 0.86, ty: 0.42, spin: "sat", rows: [
      ["               ▀               ", "...............8...............", "...............7..............."],
      ["              ▄▀▄     ▀        ", "..............878.....8........", "...............f......7........"],
      [" ▀▀▀▀▀▀▀▀▀▀▀  ▀█▀  ▀▀▀▀▀▀▀▀▀▀▀ ", ".19191919191..7f7..19191919191.", ".91919191919..8.8..91919191919."],
      ["▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀", "877777777777777f777777777777778", ".19191919191..8.8..19191919191."],
      [" ▀▀▀▀▀▀▀▀▀▀▀  ███  ▀▀▀▀▀▀▀▀▀▀▀ ", ".91919191919..878..91919191919.", "..............................."],
      ["          ▄▀▀▀██▒▒▀█▄          ", "..........88877777888..........", "...........7ff..887............"],
      ["          ▓▓█▀▀█▒▀▀█▓          ", "..........87ff7777788..........", "...........8.99.899............"],
      ["          ▓▓█▀▀█▒▀▀█▓          ", "..........87f99779988..........", "...........8.f7.877............"],
      ["         ▄▀▀▀▀▀▀▀▀▀▀▀▄         ", ".........c87ff7777788c.........", "..........04444444440.........."],
      ["          ▓▓█▓██▒▒░█▓          ", "..........87ff7777788..........", "...........8.7..888............"],
      ["          ▓▓████▒███▓          ", "..........87f99779988..........", "...........8....8.............."],
      ["          ▓▓█▓██▒▒░█▓          ", "..........87ff7777788..........", "...........8.7..888............"],
      ["         ▀▀▀▀▀▀▀▀▀▀▀▀▀         ", ".........c04444444440c.........", "..........87ff7777788.........."],
      ["          ▓▓█▀▀█▒▀▀█▓          ", "..........87ff7777788..........", "...........8.99.899............"],
      ["          ▓▓█▀▀█▒▀▀█▓          ", "..........87f99779988..........", "...........8.f7.877............"],
      ["          ▓▓█▓██▒▒░█▓          ", "..........87ff7777788..........", "...........8.7..888............"],
      ["           ▀▀▀▀▀▀▀▀▀           ", "...........87f777788...........", "...........1911191............."],
      ["           ▀█▀ ▀█▀             ", "...........191.191.............", "..............................."]] },
    /* the space station from StarPort's login screen (starport.png), decoded
       cell by cell from the 80x25 screen; the STARPORT logo drawn over it is
       left out, and its arms are cut where the original's run off the frame */
    /* the space station from StarPort's login screen, decoded cell by cell, as wide
       as it is on the 80-column screen (both arms to where the logo stops hiding them) */
    { tx: 0.13, ty: 0.48, spin: "station", bleed: 16,
      /* which cells turn with the deck (T), stay still (.), or pulse (L) - marked by hand */
      marks: ["                          L                    ", "                       T  T                    ", "          T            TT T                    ", "          T           TTTTTT      T    T       ", "      T   TTT TTT   ..........   TTT  TT       ", "L...........................L................. ", "  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT ", "    TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT ", "   ....................................L.......", "      T   T    TT   ..........   TT   T TT  T  ", "      T              ........                  ", "                     ....L...                  ", "                     ........                  ", "                    L. .... .L                 ", "                     ........                  ", "                     .L......                  ", "                     ........                  ", "                    L. .... .L                 ", "                     ........                  ", "                     .....L..                  ", "                    L........L                 ", "                      . .  .                   "],
      rows: [
      ["                          ·                    ", "..........................4....................", "..............................................."],
      ["                       ·  │                    ", ".......................4..1....................", "..............................................."],
      ["          │            │· │                    ", "..........8............14.1....................", "..............................................."],
      ["          │           ┌││┌┤│      ·    │       ", "..........8...........111111......9....7.......", "..............................................."],
      ["      ·   │·│ ┌▌■   ▀▀█░▒▓██▀▀   ■▌┐  ││       ", "......4...848.801...0019199900...987..77.......", "...............8....11.191..99....7............"],
      [".──░░░░░░░░░░░░░░░░░░▒▓█▓▓░█..███████████░▒▓█┘ ", "8888888888888888888880888887ff7777777777787888.", ".....................8..7.7.77...........787..."],
      ["  ∙╚─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼──.∙ ", "..4111111111111111111111111111111111111111111c.", "..............................................."],
      ["    ┌┼─┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┐ · ", "....1111191919191919191919191919191919191919.c.", ".........1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1....."],
      ["   ┌░░░░░░░░░░░░░░░░░▒▓█▓▒░███████.████..░▒▓┼─┌", "...8888888888888888880888787777777f7777ff878777", ".....................8..787.......7....77787..."],
      ["      │   │    └▌   ▀▀█░▓▓██▀▀   ▌┘   │ ▌└  │  ", "......8...1....80...1119999999...87...7.87..7..", "................8......1.1.......7......7......"],
      ["      └              ▌▒▓█▓▓░▌                  ", "......8..............00888887..................", ".....................88..7.7..................."],
      ["                     ░■▓█■▒░■                  ", ".....................81889789..................", "..........................87..................."],
      ["                     ░▒▓█▓▒░█                  ", ".....................80888787..................", "......................8..787..................."],
      ["                    ·░ ▀▀▀▀ █·                 ", "....................48.0000.7c.................", ".......................4444...................."],
      ["                     ░▒▓█▓▒░█                  ", ".....................80888787..................", "......................8..787..................."],
      ["                     ░■▓█■▒░■                  ", ".....................81889789..................", "..........................87..................."],
      ["                     ░▒▓█▓▒░█                  ", ".....................80888787..................", "......................8..787..................."],
      ["                    ·░ ▀▀▀▀ █·                 ", "....................48.4444.7c.................", "..............................................."],
      ["                     ░▒▓█▓▒░█                  ", ".....................80888787..................", "......................8..787..................."],
      ["                     ░▒██▓█░█                  ", ".....................80188987..................", "......................8..7.7..................."],
      ["                    ·└║██▓█│└·                 ", "....................488188987c.................", ".........................7....................."],
      ["                      │ │  │                   ", "......................8.8..7...................", "..............................................."]] },
    { tx: 0.12, ty: 0.68, rows: [
      ["  ▄▄██▄▄  ", "..ff7778..", ".........."],
      [" ██▀█▓▒██ ", ".fff77788.", "...8.88..."],
      ["█▀██▓▒████", "7f77778810", ".7..88...."],
      [" ▀█▀▀███▀ ", ".77778811.", ".8.88...0."],
      ["  ▀▀▀▀▀▀  ", "..888110..", "....00...."]] },
  ];

  const esc = { "<": "&lt;", ">": "&gt;", "&": "&amp;" };

  /* MOTION in the space art. A tick every 250 ms. The station's deck turns a
     step every 4 ticks (48 steps a turn: 48 s); the lights pulse over 8 ticks
     (2 s). Frame 0 of everything is the drawing. */
  const TICK_MS = 250, DECK_N = 48, DECK_EVERY = 4;
  /* LIGHTS: the small red lights (a red dot, or a lone red half block - not a
     red stripe) pulse like the stars twinkle: in whole VGA colours and glyphs,
     bright red, dark red, a small dark-red dot, a dim grey bulb, and back - a
     light never vanishes, so it stays fixed to the craft. */
  const PULSE = [3, 3, 2, 1, 0, 0, 1, 2];
  const lightsOf = (rows, r0, r1) => {
    const out = [];
    for (let r = r0; r < r1; r++) {
      const [chs, fg] = rows[r];
      for (let c = 0; c < chs.length; c++) {
        if (!"4c".includes(fg[c])) continue;
        const dot = /[·.∙•]/.test(chs[c]);
        const lone = /[▀▄]/.test(chs[c]) && fg[c - 1] !== fg[c] && fg[c + 1] !== fg[c];
        if (dot || lone) out.push({ r, c, ch: chs[c], fg: fg[c], half: lone });
      }
    }
    return out;
  };
  /* a light at level 3 (brightest) .. 0 (a dim, unlit bulb), in its own
     colour: red, blue, white/grey or cyan, each stepping through the VGA
     palette's shades of it; a dot also grows at the peak */
  const FAMILY = { c: "cc48", 4: "cc48", 9: "9918", 1: "9918", f: "f778", 7: "f778", b: "bb38", 3: "bb38" };
  const glow = (v, level) => {
    const fam = FAMILY[v.fg] || "cc48", col = fam[3 - level];
    if (v.half) return [level >= 2 ? v.ch : "∙", col];
    if (/[·.∙•]/.test(v.ch)) return [level === 3 ? "•" : v.ch === "." ? "." : "·", col];
    return [v.ch, col];
  };
  const pulse = (g, lights, t) => {
    const level = PULSE[t % PULSE.length];
    for (const v of lights) { const [ch, f] = glow(v, level); g[v.r][0][v.c] = ch; g[v.r][1][v.c] = f; }
  };
  const grid = (rows) => rows.map(([chs, fg, bg]) => [[...chs], [...fg], [...bg]]);
  const flat = (g) => g.map(([a, b, c]) => [a.join(""), b.join(""), c.join("")]);
  /* The satellite stands still, as drawn; its beacons pulse. */
  const satFrames = (rows) => {
    const lights = lightsOf(rows, 0, rows.length), frames = [];
    for (let t = 0; t < PULSE.length; t++) { const g = grid(rows); pulse(g, lights, t); frames.push(flat(g)); }
    return frames;
  };
  /* The station: a big circular deck on top of a cylindrical hub. Only the
     deck turns, about the hub's axis; what turns, what stays and which lights
     pulse is MARKED BY HAND (the ART entry's `marks`: T turns, . stays, L
     pulses). A disc turning on its own axis keeps its outline and, under a
     fixed sun, its shading - so the marked cells are the things on it:
       - the band of windows round the rim (rows with ┼ ticks, between the
         first and last tick) is a texture wrapped round the rim: each column
         shows the rim at the angle it faces, so its features crowd towards
         the edges and come back round from the far side;
       - every other turning cell belongs to a piece (touching T cells) that
         travels round the axis whole. A piece on the rim (any of its cells in
         the deck's full rows) runs along the rim on the near half, with a
         twin coming round from the far side. A piece on top of the deck or
         under it gets its own radius - the drawing says how far left or right
         it is, not how far out - between its drawn x and the rim, and the
         pieces alternate near and far half so they spread round the deck; a
         far one hides behind the tower. At rest every piece is where it was
         drawn, so frame 0 is the drawing. */
  const stationFrames = (rows, marks) => {
    const H = rows.length, W = rows[0][0].length;
    const at = (r, c) => [rows[r][0][c], rows[r][1][c], rows[r][2][c]];
    const mk = (r, c) => (marks[r] || "")[c] || " ";
    const blank = [" ", ".", "."];
    const fill = rows.map(([chs]) => chs.replace(/ /g, "").length / W);
    const full = (r) => fill[r] > 0.8;
    const strip = (r) => full(r) && (rows[r][0].match(/┼/g) || []).length >= 5;
    const span = (r) => [rows[r][0].indexOf("┼"), rows[r][0].lastIndexOf("┼")];
    /* the axis: the middle of the hub's commonest narrow row */
    let plainRow = -1, most = 0;
    for (let r = 0; r < H; r++) {
      const t = rows[r][0];
      if (full(r) || /[■▪]/.test(t) || t.trim().length < 6 || t.trim().length > 12) continue;
      const n = rows.filter((x) => x[0] === t).length;
      if (n > most) { most = n; plainRow = r; }
    }
    const t0 = rows[plainRow][0], h0 = t0.search(/\S/), h1 = t0.length - 1 - [...t0].reverse().join("").search(/\S/);
    const C = (h0 + h1) / 2, R = (h1 - h0 + 1) / 2;
    const fr = rows[fill.indexOf(Math.max(...fill))][0];
    const d0 = fr.search(/\S/), d1 = fr.length - 1 - [...fr].reverse().join("").search(/\S/);
    const RD = Math.max(C - d0, d1 - C) + 0.5;
    const ang = (x, rad) => Math.asin(Math.max(-1, Math.min(1, x / rad)));
    const wrapHalf = (u) => { while (u >= Math.PI / 2) u -= Math.PI; while (u < -Math.PI / 2) u += Math.PI; return u; };
    const inBand = (r, c) => strip(r) && c >= span(r)[0] && c <= span(r)[1];
    /* the still picture: turning cells lifted off. On the deck's shaded edges
       the gap takes the shading beside it (if there is deck on both sides),
       elsewhere it is empty. */
    const base = grid(rows);
    const setB = (r, c, cell) => { base[r][0][c] = cell[0]; base[r][1][c] = cell[1]; base[r][2][c] = cell[2]; };
    const things = [];
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        if (mk(r, c) !== "T" || inBand(r, c) || rows[r][0][c] === " ") continue;
        things.push({ r, c, cell: at(r, c) });
        let fill_ = blank;
        if (full(r) && !strip(r)) {
          let a = c - 1, b = c + 1;
          while (a >= 0 && (mk(r, a) === "T" || rows[r][0][a] === " ")) a--;
          while (b < W && (mk(r, b) === "T" || rows[r][0][b] === " ")) b++;
          if (a >= 0 && b < W && rows[r][0][a] !== " " && rows[r][0][b] !== " ") fill_ = at(r, a);
        }
        setB(r, c, fill_);
      }
    const byKey = new Map(things.map((v) => [v.r * W + v.c, v])), seen = new Set(), pieces = [];
    for (const v0 of things) {
      if (seen.has(v0)) continue;
      const pc = [], st = [v0]; seen.add(v0);
      while (st.length) {
        const v = st.pop(); pc.push(v);
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const u = byKey.get((v.r + dr) * W + v.c + dc);
          if (u && !seen.has(u)) { seen.add(u); st.push(u); }
        }
      }
      const xm = pc.reduce((t, v) => t + v.c - C, 0) / pc.length;
      pieces.push({ pc, xm, rim: pc.some((v) => full(v.r)) });
    }
    const all = [];
    pieces.filter((p) => !p.rim).sort((a, b) => a.xm - b.xm).forEach((p, i) => {
      const f = 0.15 + 0.7 * ((Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1;
      p.rad = Math.abs(p.xm) + f * Math.max(0, RD - 2 - Math.abs(p.xm)) + 0.5;
      const near = ang(p.xm, p.rad);
      all.push({ ...p, phi0: i % 2 ? Math.PI - near : near });
    });
    for (const p of pieces.filter((p) => p.rim)) {
      const near = ang(p.xm, RD);
      all.push({ ...p, rad: RD, phi0: near }, { ...p, rad: RD, phi0: near + Math.PI });
    }
    const lights = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
      if (mk(r, c) === "L" && rows[r][0][c] !== " ") lights.push({ r, c, ch: rows[r][0][c], fg: rows[r][1][c], half: /[▀▄]/.test(rows[r][0][c]) });
    const towerR = R + 1;
    const frames = [];
    for (let k = 0; k < DECK_N; k++) {
      const th = (2 * Math.PI * k) / DECK_N;
      const g = grid(flat(base));
      const put = (r, c, cell) => { if (c >= 0 && c < W) { g[r][0][c] = cell[0]; g[r][1][c] = cell[1]; g[r][2][c] = cell[2]; } };
      const beneath = (r, c) => (g[r][0][c] !== " " ? g[r][1][c] : ".");
      for (let r = 0; r < H; r++) {                                   /* the band of windows */
        if (!strip(r)) continue;
        const [e0, e1] = span(r);
        for (let c = e0; c <= e1; c++) {
          if (mk(r, c) !== "T") continue;
          const sc = Math.round(C + RD * Math.sin(wrapHalf(ang(c - C, RD) - th)));
          if (sc >= e0 && sc <= e1) put(r, c, at(r, sc));
        }
      }
      const placed = all.map((p) => ({ p, phi: p.phi0 + th })).sort((a, b) => Math.cos(a.phi) - Math.cos(b.phi));
      for (const { p, phi } of placed) {
        const x = p.rad * Math.sin(phi), z = Math.cos(phi);
        if (p.rim ? z < 0 : z < 0 && Math.abs(x) < towerR) continue;  /* the rim's far half / behind the tower */
        for (const v of p.pc) {
          const nc = Math.round(C + x + (v.c - C - p.xm));
          if (nc < 0 || nc >= W) continue;
          if (mk(v.r, nc) === "." && rows[v.r][0][nc] !== " " && !full(v.r)) continue;   /* never over still structure */
          put(v.r, nc, [v.cell[0], v.cell[1], v.cell[2] === "." ? beneath(v.r, nc) : v.cell[2]]);
        }
      }
      frames.push(g);
    }
    const out = [];
    for (let tk = 0; tk < DECK_N * DECK_EVERY; tk++) {
      const g = grid(flat(frames[Math.floor(tk / DECK_EVERY)]));
      pulse(g, lights, tk);
      out.push(flat(g));
    }
    return out;
  };
  /* The station stands still, as drawn; only the lights marked L pulse (the
     deck's turning, stationFrames, is kept but not used). */
  const stationStill = (rows, marks) => {
    const lights = [];
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r][0].length; c++)
      if ((marks[r] || "")[c] === "L" && rows[r][0][c] !== " ")
        lights.push({ r, c, ch: rows[r][0][c], fg: rows[r][1][c], half: /[▀▄]/.test(rows[r][0][c]) });
    const frames = [];
    for (let t = 0; t < PULSE.length; t++) { const g = grid(rows); pulse(g, lights, t); frames.push(flat(g)); }
    return frames;
  };
  const SPINNERS = { sat: (rows) => satFrames(rows), station: (rows, art) => stationStill(rows, art.marks || []) };
  const spinCache = new Map();
  const cellsHTML = (frame) => frame.map(([chs, fg, bg]) => {
    let line = "";
    for (let j = 0; j < chs.length; j++) {
      if (chs[j] === " ") { line += " "; continue; }
      line += '<span class="' + (fg[j] !== "." ? "v" + fg[j] : "") + (bg[j] !== "." ? " u" + bg[j] : "") + '">' + (esc[chs[j]] || chs[j]) + "</span>";
    }
    return line;
  }).join("\n");
  let spinning = [], spinT = 0, docked = null;
  const dockStation = () => {
    const dock = document.getElementById("dock"), art = ART.find((a) => a.spin === "station");
    if (!dock || !art || docked) return;
    const rows = art.alts ? art.alts[0] : art.rows;
    if (!spinCache.has(rows)) {
      const frames = SPINNERS[art.spin](rows, art);
      spinCache.set(rows, { frames, html: frames.map(cellsHTML) });
    }
    const { html } = spinCache.get(rows);
    const el = document.createElement("pre");
    el.className = "spinart docked"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = html[STILL ? 0 : spinT % html.length];
    dock.appendChild(el); dock.hidden = false;
    docked = { el, html, dock: true };
    spinning.push(docked);
  };
  const undock = () => {
    if (!docked) return;
    docked.el.remove(); spinning = spinning.filter((sp) => sp !== docked); docked = null;
    const dock = document.getElementById("dock"); if (dock) dock.hidden = true;
  };
  const STILL = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const build = () => {
    pending = 0;
    for (const sp of spinning) if (!sp.dock) sp.el.remove();
    spinning = spinning.filter((sp) => sp.dock);
    if (document.documentElement.dataset.look !== "retro") {
      undock();
      space.innerHTML = ""; space.style.height = "0"; stars = []; active.length = 0; return;
    }
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const cw = rem / 2, ch = rem;
    const W = document.documentElement.clientWidth;
    const H = Math.max(body.getBoundingClientRect().height, window.innerHeight);
    const cols = Math.floor(W / cw), rows = Math.ceil(H / ch);
    const sx = window.scrollX, sy = window.scrollY;
    const free = new Uint8Array(cols * rows).fill(1);
    let near = null;   /* a band round the picture where the sky is thicker, so its edge reads */
    const block = (x0, y0, x1, y1, px = cw * 0.75, py = 1) => {
      const c0 = Math.max(0, Math.floor((x0 + sx - px) / cw)), c1 = Math.min(cols - 1, Math.floor((x1 + sx + px) / cw));
      const r0 = Math.max(0, Math.floor((y0 + sy - py) / ch)), r1 = Math.min(rows - 1, Math.floor((y1 + sy + py) / ch));
      for (let r = r0; r <= r1; r++) free.fill(0, r * cols + c0, r * cols + c1 + 1);
    };
    const rect = (b, px, py) => { if (b.width || b.height) block(b.left, b.top, b.right, b.bottom, px, py); };
    for (const el of document.querySelectorAll(SOLID)) {
      if (el.closest("#space")) continue;
      /* the picture: exactly its own cells, so the stars run right up to its edge */
      const pic = el.id === "stage", b = el.getBoundingClientRect();
      rect(b, pic ? 0 : undefined, pic ? 0 : undefined);
      if (pic && b.width) near = [Math.floor((b.left + sx) / cw) - 3, Math.floor((b.top + sy) / ch) - 1,
                                  Math.floor((b.right + sx) / cw) + 3, Math.floor((b.bottom + sy) / ch) + 1];
    }
    /* frame lines: the four edges of every box */
    /* the boxes are solid panels, like StarPort's frames: no stars anywhere
       inside them, nor on their borders */
    for (const el of document.querySelectorAll(".box")) rect(el.getBoundingClientRect());
    /* text: each run of non-blank characters, line by line */
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => /\S/.test(n.data) && !n.parentElement.closest("#space, script, style, select, .sr")
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const range = document.createRange(), run = /\S+/g;
    for (let n; (n = walk.nextNode());) {
      for (let m; (m = run.exec(n.data));) {
        range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
        for (const b of range.getClientRects()) rect(b);
      }
    }
    /* the art: the free spot nearest its target in the first screen */
    const pic = new Array(cols * rows);
    const vis = Math.min(rows, Math.floor((window.innerHeight + sy) / ch));
    const sum = new Int32Array((cols + 1) * (rows + 1));   /* blocked-cell prefix sums */
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        sum[(r + 1) * (cols + 1) + c + 1] = (free[r * cols + c] ? 0 : 1) + sum[r * (cols + 1) + c + 1]
          + sum[(r + 1) * (cols + 1) + c] - sum[r * (cols + 1) + c];
    const blocked = (r0, c0, r1, c1) => sum[r1 * (cols + 1) + c1] - sum[r0 * (cols + 1) + c1]
      - sum[r1 * (cols + 1) + c0] + sum[r0 * (cols + 1) + c0];
    const placed = [];   /* art already drawn: [r0, c0, r1, c1] with its margin */
    let stationOut = false;
    const clash = (r0, c0, r1, c1) => placed.some(([a, b, c, d]) => r0 < c && a < r1 && c0 < d && b < c1);
    for (const art of cols >= 100 ? ART : []) {   /* not on a phone: no margins there */
     for (const rows of art.alts || [art.rows]) {   /* the first alternative that fits */
      const a = { tx: art.tx, ty: art.ty, rows };
      const h = a.rows.length, w = a.rows[0][0].length;
      let best = null, bd = Infinity;
      /* `bleed`: how many columns may hang off the left edge of the window
         (the station's arm runs off-screen where the margin is narrow) */
      for (let r = 2; r + h + 2 <= vis; r++)
        for (let c = art.bleed ? -art.bleed : 3; c + w + 3 <= cols; c++) {
          const d = Math.hypot((c + w / 2 - a.tx * cols) / 2, r + h / 2 - a.ty * vis);
          if (d < bd && !blocked(r - 2, Math.max(0, c - 3), r + h + 2, c + w + 3) && !clash(r - 2, c - 3, r + h + 2, c + w + 3)) { bd = d; best = [r, c]; }
        }
      if (!best) continue;
      const [r0, c0] = best;
      placed.push([r0 - 2, c0 - 3, r0 + h + 2, c0 + w + 3]);
      if (art.spin) {
        /* its own layer above the sky; no stars in any cell a frame ever covers */
        if (!spinCache.has(rows)) {
          const frames = SPINNERS[art.spin](rows, art);
          spinCache.set(rows, { frames, html: frames.map(cellsHTML) });
        }
        const { frames, html } = spinCache.get(rows);
        for (const f of STILL ? [frames[0]] : frames)
          f.forEach(([chs], i) => { for (let j = 0; j < w; j++) if (chs[j] !== " " && c0 + j >= 0) pic[(r0 + i) * cols + c0 + j] = " "; });
        const el = document.createElement("pre");
        el.className = "spinart"; el.setAttribute("aria-hidden", "true");
        el.style.left = c0 * cw + "px"; el.style.top = r0 * ch + "px";
        el.innerHTML = html[STILL ? 0 : spinT % html.length];
        body.insertBefore(el, space.nextSibling);
        spinning.push({ el, html });
        if (art.spin === "station") stationOut = true;
        break;
      }
      a.rows.forEach(([chs, fg, bg], i) => {
        for (let j = 0; j < w; j++) {
          if (chs[j] === " " || c0 + j < 0) continue;
          pic[(r0 + i) * cols + c0 + j] = '<span class="' + (fg[j] !== "." ? "v" + fg[j] : "")
            + (bg[j] !== "." ? " u" + bg[j] : "") + '">' + chs[j] + "</span>";
        }
      });
      /* the sky shows through: only the art's own characters cover stars */
      break;
     }
    }
    /* a phone (or any window with no room in the margins): the station sits in
       the page itself, under the title (#dock), its font scaled so all of it
       fits the width - still turning and pulsing */
    if (stationOut) undock(); else dockStation();
    let out = "";
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let c = 0; c < cols; c++) {
        if (pic[r * cols + c]) { line += pic[r * cols + c]; continue; }
        const d = near && c >= near[0] && c <= near[2] && r >= near[1] && r <= near[3] ? DENSITY * 2.5 : DENSITY;
        if (!free[r * cols + c] || hash(r, c, 1) >= d) { line += " "; continue; }
        const k = hash(r, c, 2), kind = KINDS.find((x) => k < x[0]);
        line += '<span class="s ' + kind[2] + '">' + (esc[kind[1]] || kind[1]) + "</span>";
      }
      out += line.replace(/ +$/, "") + "\n";
    }
    space.style.width = cols * cw + "px";
    space.style.height = H + "px";
    space.innerHTML = out;
    stars = [...space.querySelectorAll(".s")]; active.length = 0;
  };
  let pending = 0, stars = [];
  const active = [];
  const later = () => { if (!pending) pending = requestAnimationFrame(build); };
  window.addEventListener("resize", later);
  window.addEventListener("recomp-look", later);
  if (document.fonts) document.fonts.ready.then(later);
  window.addEventListener("load", later);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(later);
    for (const el of [body, ...document.querySelectorAll("main, #status, #start, #stage")]) ro.observe(el);
  }
  /* TWINKLE: now and then a star steps up to white - a bigger dot at the
     peak - and back down, one VGA colour per step, like an ANSI screen's
     colour cycling. CP437 dots and the palette's greys only; a handful of
     stars at a time. Off with prefers-reduced-motion. */
  const STEPS = [["v7", "∙"], ["vf", "∙"], ["vf", "•"], ["vf", "∙"], ["v7", "∙"]];
  const RATE = 0.002;   /* stars starting per star per step: ~10 lit on a full screen */
  let owed = 0;
  const twinkle = () => {
    if (document.hidden || !stars.length) return;
    for (let i = active.length - 1; i >= 0; i--) {
      const t = active[i];
      if (++t.k >= STEPS.length) { t.el.className = t.cls; t.el.textContent = t.ch; active.splice(i, 1); continue; }
      t.el.className = "s " + STEPS[t.k][0]; t.el.textContent = STEPS[t.k][1];
    }
    for (owed += stars.length * RATE; owed >= 1; owed--) {
      const el = stars[Math.floor(Math.random() * stars.length)];
      if (active.some((t) => t.el === el)) continue;
      const t = { el, cls: el.className, ch: el.textContent, k: 0 };
      el.className = "s " + STEPS[0][0]; el.textContent = STEPS[0][1];
      active.push(t);
    }
  };
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(twinkle, 140);
  if (!STILL) setInterval(() => {
    if (document.hidden || !spinning.length) return;
    spinT = (spinT + 1) % (DECK_N * DECK_EVERY);
    for (const sp of spinning) sp.el.innerHTML = sp.html[spinT % sp.html.length];
  }, TICK_MS);
  build();
})();
/* VISITORS. Our own counter: a Cloudflare Worker (web/counter) holding one
   number - no IPs, no cookies, and not on any blocklist. On the LIVE site
   (*.github.io) a browser counts once a day (the date of its last count is
   kept in localStorage); the local preview only reads. The landing page shows
   the total (#visits) as a 90s counter; it stays hidden if it can't be read. */
(() => {
  const API = "https://recomp-counter.demoscene-recomp.workers.dev";
  const KEY = "recomp.counted", DAY = 86400000;
  const box = document.getElementById("visits");
  let last = 0;
  try { last = Number(localStorage.getItem(KEY)) || 0; } catch (e) {}
  const hit = /\.github\.io$/.test(location.hostname) && Date.now() - last > DAY;
  if ((!hit && !box) || !window.fetch) return;
  fetch(API + (hit ? "/hit" : "/count"), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((j) => {
      if (hit) { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }
      const n = Math.max(0, Math.floor(Number(j.count))) || 0;
      if (!box) return;
      box.querySelector(".odo").innerHTML = [...String(n).padStart(7, "0")].map((d) => "<span>" + d + "</span>").join("");
      box.querySelector(".num").textContent = n.toLocaleString("en-US");
      box.hidden = false;
    })
    .catch(() => {});
})();
