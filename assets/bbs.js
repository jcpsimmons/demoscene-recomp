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
    { tx: 0.86, ty: 0.42, rows: [
      ["               ▀               ", "...............8...............", "...............7..............."],
      ["              ▄▀▄     ▀        ", "..............878.....8........", "...............f......7........"],
      [" ▀▀▀▀▀▀▀▀▀▀▀  ▀█▀  ▀▀▀▀▀▀▀▀▀▀▀ ", ".19191919191..7f7..19191919191.", ".91919191919..8.8..91919191919."],
      ["▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀", "877777777777777f777777777777778", ".19191919191..8.8..19191919191."],
      [" ▀▀▀▀▀▀▀▀▀▀▀  ███  ▀▀▀▀▀▀▀▀▀▀▀ ", ".91919191919..878..91919191919.", "..............................."],
      ["          ▄▀▀▀██▒▒▀█▄          ", "..........88877777888..........", "...........7ff..887............"],
      ["          ▓▓█▀▀█▒▀▀█▓          ", "..........87ff7777788..........", "...........8.99.899............"],
      ["          ▓▓█▀▀█▒▀▀█▓          ", "..........87f99779988..........", "...........8.f7.877............"],
      ["       ▄  ▀▀▀▀▀▀▀▀▀▀▀  ▄       ", ".......c..87ff7777788..c.......", "..........04444444440.........."],
      ["          ▓▓█▓██▒▒░█▓          ", "..........87ff7777788..........", "...........8.7..888............"],
      ["          ▓▓████▒███▓          ", "..........87f99779988..........", "...........8....8.............."],
      ["          ▓▓█▓██▒▒░█▓          ", "..........87ff7777788..........", "...........8.7..888............"],
      ["       ▀  ▀▀▀▀▀▀▀▀▀▀▀  ▀       ", ".......c..04444444440..c.......", "..........87ff7777788.........."],
      ["          ▓▓█▀▀█▒▀▀█▓          ", "..........87ff7777788..........", "...........8.99.899............"],
      ["          ▓▓█▀▀█▒▀▀█▓          ", "..........87f99779988..........", "...........8.f7.877............"],
      ["          ▓▓█▓██▒▒░█▓          ", "..........87ff7777788..........", "...........8.7..888............"],
      ["           ▀▀▀▀▀▀▀▀▀           ", "...........87f777788...........", "...........1911191............."],
      ["           ▀█▀ ▀█▀             ", "...........191.191.............", "..............................."]] },
    /* the space station from StarPort's login screen (starport.png), decoded
       cell by cell from the 80x25 screen; the STARPORT logo drawn over it is
       left out, and its arms are cut where the original's run off the frame */
    { tx: 0.13, ty: 0.48, rows: [
      ["            ·                    ", "............4....................", "................................."],
      ["         ·  │                    ", ".........4..1....................", "................................."],
      ["         │· │                    ", ".........14.1....................", "................................."],
      ["        ┌││┌┤│      ·    │       ", "........111111......9....7.......", "................................."],
      ["┌▌■   ▀▀█░▒▓██▀▀   ■▌┐  ││       ", "801...0019199900...987..77.......", ".8....11.191..99....7............"],
      ["░░░░░░░▒▓█▓▓░█..███████████░▒▓█┘ ", "88888880888887ff7777777777787888.", ".......8..7.7.77...........787..."],
      ["─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼─┼──.∙ ", "1111111111111111111111111111111c.", "................................."],
      ["█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┼█┐ · ", "191919191919191919191919191919.c.", ".1.1.1.1.1.1.1.1.1.1.1.1.1.1....."],
      ["░░░░░░░▒▓█▓▒░███████.████..░▒▓┼─┌", "88888880888787777777f7777ff878777", ".......8..787.......7....77787..."],
      [" └▌   ▀▀█░▓▓██▀▀   ▌┘   │ ▌└  │  ", ".80...1119999999...87...7.87..7..", "..8......1.1.......7......7......"],
      ["       ▌▒▓█▓▓░▌                  ", ".......00888887..................", ".......88..7.7..................."],
      ["       ░■▓█■▒░■                  ", ".......81889789..................", "............87..................."],
      ["       ░▒▓█▓▒░█                  ", ".......80888787..................", "........8..787..................."],
      ["      ·░ ▀▀▀▀ █·                 ", "......48.0000.7c.................", ".........4444...................."],
      ["       ░▒▓█▓▒░█                  ", ".......80888787..................", "........8..787..................."],
      ["       ░■▓█■▒░■                  ", ".......81889789..................", "............87..................."],
      ["       ░▒▓█▓▒░█                  ", ".......80888787..................", "........8..787..................."],
      ["      ·░ ▀▀▀▀ █·                 ", "......48.4444.7c.................", "................................."],
      ["       ░▒▓█▓▒░█                  ", ".......80888787..................", "........8..787..................."],
      ["       ░▒██▓█░█                  ", ".......80188987..................", "........8..7.7..................."],
      ["      ·└║██▓█│└·                 ", "......488188987c.................", "...........7....................."],
      ["        │ │  │                   ", "........8.8..7...................", "................................."]]},
    { tx: 0.12, ty: 0.68, rows: [
      ["  ▄▄██▄▄  ", "..ff7778..", ".........."],
      [" ██▀█▓▒██ ", ".fff77788.", "...8.88..."],
      ["█▀██▓▒████", "7f77778810", ".7..88...."],
      [" ▀█▀▀███▀ ", ".77778811.", ".8.88...0."],
      ["  ▀▀▀▀▀▀  ", "..888110..", "....00...."]] },
  ];

  const esc = { "<": "&lt;", ">": "&gt;", "&": "&amp;" };

  const build = () => {
    pending = 0;
    if (document.documentElement.dataset.look !== "retro") { space.innerHTML = ""; space.style.height = "0"; return; }
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
    const clash = (r0, c0, r1, c1) => placed.some(([a, b, c, d]) => r0 < c && a < r1 && c0 < d && b < c1);
    for (const a of cols >= 100 ? ART : []) {   /* not on a phone: no margins there */
      const h = a.rows.length, w = a.rows[0][0].length;
      let best = null, bd = Infinity;
      for (let r = 2; r + h + 2 <= vis; r++)
        for (let c = 3; c + w + 3 <= cols; c++) {
          const d = Math.hypot((c + w / 2 - a.tx * cols) / 2, r + h / 2 - a.ty * vis);
          if (d < bd && !blocked(r - 2, c - 3, r + h + 2, c + w + 3) && !clash(r - 2, c - 3, r + h + 2, c + w + 3)) { bd = d; best = [r, c]; }
        }
      if (!best) continue;
      const [r0, c0] = best;
      placed.push([r0 - 2, c0 - 3, r0 + h + 2, c0 + w + 3]);
      a.rows.forEach(([chs, fg, bg], i) => {
        for (let j = 0; j < w; j++) {
          if (chs[j] === " ") continue;
          pic[(r0 + i) * cols + c0 + j] = '<span class="' + (fg[j] !== "." ? "v" + fg[j] : "")
            + (bg[j] !== "." ? " u" + bg[j] : "") + '">' + chs[j] + "</span>";
        }
      });
      /* the sky shows through: only the art's own characters cover stars */
    }
    let out = "";
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let c = 0; c < cols; c++) {
        if (pic[r * cols + c]) { line += pic[r * cols + c]; continue; }
        const d = near && c >= near[0] && c <= near[2] && r >= near[1] && r <= near[3] ? DENSITY * 2.5 : DENSITY;
        if (!free[r * cols + c] || hash(r, c, 1) >= d) { line += " "; continue; }
        const k = hash(r, c, 2), kind = KINDS.find((x) => k < x[0]);
        line += '<span class="' + kind[2] + '">' + (esc[kind[1]] || kind[1]) + "</span>";
      }
      out += line.replace(/ +$/, "") + "\n";
    }
    space.style.width = cols * cw + "px";
    space.style.height = H + "px";
    space.innerHTML = out;
  };
  let pending = 0;
  const later = () => { if (!pending) pending = requestAnimationFrame(build); };
  window.addEventListener("resize", later);
  window.addEventListener("recomp-look", later);
  if (document.fonts) document.fonts.ready.then(later);
  window.addEventListener("load", later);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(later);
    for (const el of [body, ...document.querySelectorAll("main, #status, #start, #stage")]) ro.observe(el);
  }
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
