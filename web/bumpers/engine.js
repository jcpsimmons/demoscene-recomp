/* bumpers - a tiny software demo engine for the Bumpers & Intros section.
 *
 * Everything is drawn into ONE 480x270 framebuffer of 32-bit pixels, the way a
 * 1993 intro drew into mode 13h: no WebGL, no canvas paths, every pixel set by
 * hand. 480x270 is 16:9 and scales by whole numbers to video - 4x is 1920x1080,
 * 8x is 3840x2160 - so the chunky pixels stay square and sharp in an edit.
 *
 * An intro is a PURE function of time: draw(t) paints the frame for t seconds
 * in. The page plays it against the audio clock; tools/render.mjs steps it
 * frame by frame for a video master. The few effects that carry state (fire)
 * replay from the start when time goes backwards, so a frame never depends on
 * how you got to it.
 *
 * Text is the site's own IBM VGA 8x16 font, read once into 1-bit glyphs. */
"use strict";
(() => {
  const W = 480, H = 270, N = W * H;
  const main = new Uint32Array(N);
  let T = main;                         /* the buffer the drawing calls write to */

  /* ---- colour: packed ABGR, as a little-endian Uint32 view of RGBA bytes --- */
  const rgb = (r, g, b) => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
  const hex = (s) => { const n = parseInt(s.replace("#", ""), 16); return rgb(n >> 16, n >> 8, n); };
  const R = (c) => c & 255, G = (c) => (c >>> 8) & 255, B = (c) => (c >>> 16) & 255;
  const mix = (a, b, t) => {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return rgb(R(a) + (R(b) - R(a)) * t, G(a) + (G(b) - G(a)) * t, B(a) + (B(b) - B(a)) * t);
  };
  const scale = (c, f) => rgb(Math.min(255, R(c) * f), Math.min(255, G(c) * f), Math.min(255, B(c) * f));
  /* a ramp: n colours through [[pos 0..1, "#hex"], ...] - the palette of an effect */
  const ramp = (stops, n = 256) => {
    const out = new Uint32Array(n), s = stops.map(([p, c]) => [p, typeof c === "string" ? hex(c) : c]);
    for (let i = 0; i < n; i++) {
      const p = i / (n - 1);
      let k = 0; while (k < s.length - 2 && p > s[k + 1][0]) k++;
      const [p0, c0] = s[k], [p1, c1] = s[k + 1];
      out[i] = mix(c0, c1, (p - p0) / ((p1 - p0) || 1));
    }
    return out;
  };

  /* ---- numbers ------------------------------------------------------------- */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));          /* 0..1 across [a, b] */
  const ease = {
    out: (x) => 1 - (1 - x) * (1 - x) * (1 - x),
    in: (x) => x * x * x,
    inout: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
    bounce: (x) => {
      const n = 7.5625, d = 2.75;
      if (x < 1 / d) return n * x * x;
      if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
      if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
      return n * (x -= 2.625 / d) * x + 0.984375;
    },
  };
  /* a stateless hash: the same n gives the same 0..1 every frame and every run */
  const hash = (n) => {
    n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13;
    n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  const hash2 = (a, b) => hash(Math.imul(a, 73856093) ^ Math.imul(b, 19349663));
  /* ordered dither: the 4x4 Bayer matrix, thresholds in 0..1 */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
  /* a sine table: 1024 steps a turn, read by phase in turns */
  const SIN = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((i / 1024) * Math.PI * 2);
  const fsin = (turns) => SIN[((turns * 1024) | 0) & 1023];

  /* ---- buffers and plain drawing -------------------------------------------- */
  const layer = () => new Uint32Array(N);
  const use = (buf) => { T = buf || main; };
  const clear = (c = 0) => T.fill(c);
  const pset = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < W && y < H) T[y * W + x] = c; };
  const rect = (x, y, w, h, c) => {
    let x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
    for (let j = y0; j < y1; j++) T.fill(c, j * W + x0, j * W + x1);
  };
  /* a rectangle blended over what is there (a = 0..1) */
  const shade = (x, y, w, h, c, a) => {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) T[j * W + i] = mix(T[j * W + i], c, a);
  };
  const line = (x0, y0, x1, y1, c) => {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, guard = 4000;
    for (;;) {
      if (x0 >= 0 && y0 >= 0 && x0 < W && y0 < H) T[y0 * W + x0] = c;
      if ((x0 === x1 && y0 === y1) || !guard--) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  };
  /* the whole frame toward a colour (a = 0..1) */
  const fade = (c, a) => { if (a <= 0) return; if (a >= 1) { T.fill(c); return; } for (let i = 0; i < N; i++) T[i] = mix(T[i], c, a); };
  /* copy a layer over the target; 0 in the layer is transparent. With s != 1
     the layer is scaled about (cx, cy), nearest neighbour - the "slam". */
  const blit = (src, s = 1, cx = W / 2, cy = H / 2, dx = 0, dy = 0) => {
    const inv = 1 / s;
    for (let y = 0; y < H; y++) {
      const sy = Math.round((y - dy - cy) * inv + cy);
      if (sy < 0 || sy >= H) continue;
      for (let x = 0; x < W; x++) {
        const sx = Math.round((x - dx - cx) * inv + cx);
        if (sx < 0 || sx >= W) continue;
        const c = src[sy * W + sx];
        if (c) T[y * W + x] = c;
      }
    }
  };

  /* ---- the font: IBM VGA 8x16 as 1-bit glyphs -------------------------------- */
  const glyphs = new Map();
  let gctx = null, base = 12;
  const loadFont = async (url) => {
    const ff = new FontFace("BumperVGA", `url(${url})`);
    await ff.load(); document.fonts.add(ff);
    const c = document.createElement("canvas"); c.width = 8; c.height = 16;
    gctx = c.getContext("2d", { willReadFrequently: true });
    gctx.font = "16px BumperVGA"; gctx.textBaseline = "alphabetic";
    const m = gctx.measureText("█");
    base = Math.round(m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || 12);
  };
  const glyph = (ch) => {
    let g = glyphs.get(ch);
    if (g) return g;
    g = new Uint8Array(128);
    if (!gctx) return g;                /* the font isn't in yet: draw nothing, cache nothing */
    if (ch !== " ") {
      gctx.clearRect(0, 0, 8, 16); gctx.fillStyle = "#fff"; gctx.fillText(ch, 0, base);
      const d = gctx.getImageData(0, 0, 8, 16).data;
      for (let i = 0; i < 128; i++) g[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    }
    glyphs.set(ch, g);
    return g;
  };
  /* text(str, x, y, colour, opts)
       colour: a packed colour, or fn(px, py, i) -> colour (gradients, plasma fills)
       opts.s / opts.sy: whole-pixel scale; opts.sp: extra spacing in font pixels
       opts.dy(i): per-letter vertical offset (wave, drop-in); opts.on(i): draw letter i?
       opts.shadow: colour of a hard shadow opts.so pixels down-right
       opts.cw: cell width (8) - 9 for the VGA text-mode look */
  const text = (str, x, y, col, o = {}) => {
    const s = o.s || 1, sy = o.sy || s, sp = o.sp || 0, cw = (o.cw || 8) + sp;
    const fn = typeof col === "function";
    if (o.shadow !== undefined) text(str, x + (o.so || s), y + (o.so || sy), o.shadow, Object.assign({}, o, { shadow: undefined }));
    for (let i = 0; i < str.length; i++) {
      if (o.on && !o.on(i)) continue;
      const g = glyph(str[i]);
      const gx = Math.round(x + i * cw * s), gy = Math.round(y + (o.dy ? o.dy(i) : 0));
      if (gx > W || gx + 8 * s < 0) continue;
      for (let py = 0; py < 16; py++) for (let px = 0; px < 8; px++) {
        if (!g[py * 8 + px]) continue;
        const X = gx + px * s, Y = gy + py * sy;
        const c = fn ? col(X, Y, i) : col;
        if (s === 1 && sy === 1) { if (X >= 0 && Y >= 0 && X < W && Y < H) T[Y * W + X] = c; }
        else rect(X, Y, s, sy, c);
      }
    }
  };
  const tw = (str, s = 1, sp = 0, cw = 8) => str.length * (cw + sp) * s - sp * s;
  const ctext = (str, y, col, o = {}) => text(str, Math.round((W - tw(str, o.s || 1, o.sp || 0, o.cw || 8)) / 2), y, col, o);
  /* the "decode": letters that aren't locked yet churn through random glyphs */
  const CHURN = "#$%&@*+=?/<>[]{}0123456789ABCDEFX░▒▓█";
  const decode = (str, p, t, seed = 1) => {
    if (p <= 0) return " ".repeat(str.length);
    let out = "";
    const k = Math.floor(p * str.length);
    for (let i = 0; i < str.length; i++) {
      if (str[i] === " " || i < k) out += str[i];
      else if (i < k + 6) out += CHURN[Math.floor(hash2(i + seed * 97, Math.floor(t * 30)) * CHURN.length)];
      else out += " ";
    }
    return out;
  };

  /* ---- effects ------------------------------------------------------------- */
  /* a vertical gradient over the whole frame (or rows y0..y1) */
  const vgrad = (pal, y0 = 0, y1 = H) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) T.fill(pal[Math.floor(((y - y0) / (y1 - y0)) * (pal.length - 1))], y * W, y * W + W);
  };
  /* stars flying at you: n stars, speed in depths/s; col(depth 0..1) -> colour */
  const stars = (t, n, speed, col, o = {}) => {
    const cx = o.cx ?? W / 2, cy = o.cy ?? H / 2, fov = o.fov ?? 180, streak = o.streak || 0;
    for (let i = 0; i < n; i++) {
      const sx = hash(i * 3 + 1) * 2 - 1, sy = hash(i * 3 + 2) * 2 - 1;
      const z = 1 - ((hash(i * 3 + 3) + t * speed) % 1);           /* 1 far .. 0 near */
      const zz = 0.05 + z;
      const x = cx + (sx * fov) / zz, y = cy + (sy * fov * 0.75) / zz;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = col(1 - z);
      if (streak) { const z2 = zz + streak * speed; line(x, y, cx + (sx * fov) / z2, cy + (sy * fov * 0.75) / z2, c); }
      if (z < 0.3) rect(x, y, 2, 2, c); else pset(x, y, c);
    }
  };
  /* plasma: four sines through the table into a 256-colour ramp */
  const plasma = (t, pal, o = {}) => {
    const k = o.k || 1, y0 = o.y0 || 0, y1 = o.y1 || H, n = pal.length;
    for (let y = y0; y < y1; y++) {
      const a = fsin(y / (110 * k) + t * 0.23), b = fsin(y / (61 * k) - t * 0.17);
      for (let x = 0; x < W; x++) {
        const v = a + b + fsin(x / (140 * k) + t * 0.31) + fsin((x + y) / (90 * k) + t * 0.11 + fsin(x / (300 * k) - t * 0.07) * 0.5);
        T[y * W + x] = pal[(((v + 4) * 0.125 * n * 2 + t * 40) | 0) % n];
      }
    }
  };
  /* a copper bar: a horizontal bar shaded from its edges to a bright middle */
  const copper = (y, h, pal) => {
    for (let j = 0; j < h; j++) {
      const yy = Math.round(y + j);
      if (yy < 0 || yy >= H) continue;
      const p = 1 - Math.abs((j + 0.5) / h * 2 - 1);
      T.fill(pal[Math.floor(p * (pal.length - 1))], yy * W, yy * W + W);
    }
  };
  /* textures for the tunnel and the rotozoomer: 256x256, made by fn(x, y) */
  const texture = (fn) => { const t = new Uint32Array(65536); for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) t[y * 256 + x] = fn(x, y); return t; };
  let TUN = null;
  const tunnel = (t, tex, o = {}) => {
    if (!TUN) {
      TUN = { a: new Uint16Array(N), d: new Uint16Array(N), s: new Float32Array(N) };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - W / 2, dy = (y - H / 2) * 1.2, r = Math.sqrt(dx * dx + dy * dy) || 1;
        TUN.a[y * W + x] = Math.floor(((Math.atan2(dy, dx) / Math.PI) * 0.5 + 0.5) * 256 * 2) & 255;
        TUN.d[y * W + x] = Math.floor(6000 / r) & 1023;
        TUN.s[y * W + x] = Math.min(1, r / 150);
      }
    }
    const u = Math.floor(t * (o.spin ?? 24)), v = Math.floor(t * (o.speed ?? 90)), fog = o.fog ?? 0;
    for (let i = 0; i < N; i++) {
      const c = tex[(((TUN.d[i] + v) & 255) << 8) | ((TUN.a[i] + u) & 255)];
      T[i] = fog ? mix(fog, c, TUN.s[i]) : c;
    }
  };
  const rotozoom = (t, tex, ang, zoom, ox = 0, oy = 0) => {
    const ca = Math.cos(ang) * zoom, sa = Math.sin(ang) * zoom;
    for (let y = 0; y < H; y++) {
      let u = (-W / 2) * ca - (y - H / 2) * sa + ox, v = (-W / 2) * sa + (y - H / 2) * ca + oy;
      for (let x = 0; x < W; x++, u += ca, v += sa) T[y * W + x] = tex[((v & 255) << 8) | (u & 255)];
    }
  };
  /* interference rings: two drifting centres, their rings XORed */
  const rings = (t, c0, c1, w = 14) => {
    const ax = W / 2 + Math.cos(t * 0.7) * 120, ay = H / 2 + Math.sin(t * 0.9) * 60;
    const bx = W / 2 + Math.cos(t * 0.5 + 2) * 130, by = H / 2 + Math.sin(t * 0.6 + 1) * 70;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const da = Math.hypot(x - ax, y - ay), db = Math.hypot(x - bx, y - by);
      T[y * W + x] = ((Math.floor(da / w) ^ Math.floor(db / w)) & 1) ? c1 : c0;
    }
  };
  /* fire: the classic averaging fire. Seeded by its bottom row and by mask
     (a layer: any lit pixel there burns). Replays from 0 if t goes backwards. */
  const Fire = (pal, o = {}) => {
    const heat = new Float32Array(W * (H + 2));
    let step = -1;
    const rate = o.rate || 60, cool = o.cool ?? 2.4, bed = o.bed ?? 255;
    const tick = (k, mask) => {
      for (let x = 0; x < W; x++) { heat[(H + 1) * W + x] = hash2(x, k) > 0.5 ? bed : 0; heat[H * W + x] = hash2(x + 999, k) > 0.5 ? bed * 0.85 : 0; }
      if (mask) for (let i = 0; i < N; i++) if (mask[i] && hash2(i, k) > 0.6) heat[i] = 150 + hash2(i + 7, k) * 105;
      for (let y = 0; y < H; y++) {
        const b = (y + 1) * W;
        for (let x = 0; x < W; x++) {
          /* each pixel drifts a pixel left or right as it rises: the flicker */
          const r = hash2(x * 7 + y * 131, k), xs = (x + (r < 0.3 ? -1 : r > 0.7 ? 1 : 0) + W) % W;
          const v = (heat[b + (xs - 1 + W) % W] + heat[b + xs] + heat[b + (xs + 1) % W] + heat[b + W + xs]) * 0.25
                  - cool * (0.3 + 1.4 * hash2(x + y * 977, k ^ 0x5bd1));
          heat[y * W + x] = v < 0 ? 0 : v;
        }
      }
    };
    return (t, mask) => {
      const target = Math.floor(t * rate);
      if (target < step) { heat.fill(0); step = -1; }
      if (target - step > 240) { heat.fill(0); step = target - 240; }   /* a jump far ahead: 4 s of burn is enough */
      while (step < target) tick(++step, mask);
      for (let i = 0; i < N; i++) { const h = heat[i] | 0; if (h > 4 || !o.over) T[i] = pal[h > 255 ? 255 : h]; }
    };
  };
  /* a wire globe: meridians and parallels, the far side dim */
  const globe = (cx, cy, r, rot, tilt, near, far, o = {}) => {
    const lat = o.lat ?? 9, lon = o.lon ?? 12, ct = Math.cos(tilt), st = Math.sin(tilt);
    const P = (la, lo) => {
      let x = Math.cos(la) * Math.sin(lo + rot), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo + rot);
      const y2 = y * ct - z * st, z2 = y * st + z * ct;
      return [cx + x * r, cy - y2 * r, z2];
    };
    const seg = (a, b) => line(a[0], a[1], b[0], b[1], (a[2] + b[2]) > 0 ? near : far);
    const STEP = 28;
    for (let i = 0; i < lon; i++) {
      const lo = (i / lon) * Math.PI * 2;
      let p = P(-Math.PI / 2, lo);
      for (let k = 1; k <= STEP; k++) { const q = P(-Math.PI / 2 + (k / STEP) * Math.PI, lo); seg(p, q); p = q; }
    }
    for (let j = 1; j < lat; j++) {
      const la = -Math.PI / 2 + (j / lat) * Math.PI;
      let p = P(la, 0);
      for (let k = 1; k <= STEP * 2; k++) { const q = P(la, (k / (STEP * 2)) * Math.PI * 2); seg(p, q); p = q; }
    }
    return P;
  };

  /* ---- a mesh, software-rasterised: z-buffer, Gouraud light, shade(x, y, i) */
  const zb = new Float32Array(N);
  const mesh = (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const [nv, nt] = new Uint32Array(bin, 0, 2);
    const q = new Int16Array(bin, 8, nv * 3), tri = new Uint16Array(bin, 8 + nv * 6, nt * 3);
    const v = new Float32Array(nv * 3), n = new Float32Array(nv * 3);
    for (let i = 0; i < nv * 3; i++) v[i] = q[i] / 32767;
    for (let k = 0; k < nt * 3; k += 3) {
      const a = tri[k] * 3, b = tri[k + 1] * 3, c = tri[k + 2] * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      for (const i of [a, b, c]) { n[i] += fx; n[i + 1] += fy; n[i + 2] += fz; }
    }
    for (let i = 0; i < nv * 3; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    return { nv, nt, v, n, tri, sx: new Float32Array(nv), sy: new Float32Array(nv), sz: new Float32Array(nv), li: new Float32Array(nv) };
  };
  /* o: rx, ry (radians), cx, cy, size (pixels for a unit), light [x,y,z],
     ambient, shade(x, y, intensity) -> colour, persp (0 = orthographic) */
  const drawMesh = (m, o) => {
    const cy_ = Math.cos(o.ry), sy_ = Math.sin(o.ry), cx_ = Math.cos(o.rx || 0), sx_ = Math.sin(o.rx || 0);
    const L = o.light || [-0.5, 0.6, 0.65], ll = Math.hypot(...L), lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
    const amb = o.ambient ?? 0.08, size = o.size, persp = o.persp ?? 0.25;
    zb.fill(-1e9);
    for (let i = 0; i < m.nv; i++) {
      const k = i * 3;
      /* yaw then pitch; the model is y-up, z toward the viewer */
      let x = m.v[k] * cy_ + m.v[k + 2] * sy_, z = -m.v[k] * sy_ + m.v[k + 2] * cy_, y = m.v[k + 1];
      const y2 = y * cx_ - z * sx_; z = y * sx_ + z * cx_; y = y2;
      let nx = m.n[k] * cy_ + m.n[k + 2] * sy_, nz = -m.n[k] * sy_ + m.n[k + 2] * cy_, ny = m.n[k + 1];
      const ny2 = ny * cx_ - nz * sx_; nz = ny * sx_ + nz * cx_; ny = ny2;
      const p = 1 / (1 - z * persp);
      m.sx[i] = o.cx + x * size * p; m.sy[i] = o.cy - y * size * p; m.sz[i] = z;
      m.li[i] = Math.max(0, nx * lx + ny * ly + nz * lz) * (1 - amb) + amb;
    }
    for (let k = 0; k < m.nt * 3; k += 3) {
      const a = m.tri[k], b = m.tri[k + 1], c = m.tri[k + 2];
      const ax = m.sx[a], ay = m.sy[a], bx = m.sx[b], by = m.sy[b], cx = m.sx[c], cy = m.sy[c];
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area >= 0 && !o.twoSided) continue;              /* back face (screen y points down) */
      const inv = 1 / area;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * m.sz[a] + w1 * m.sz[b] + w2 * m.sz[c], i = y * W + x;
        if (z <= zb[i]) continue;
        zb[i] = z;
        T[i] = o.shade(x, y, w0 * m.li[a] + w1 * m.li[b] + w2 * m.li[c], z);
      }
    }
  };

  /* ---- post: glitch, TV-off, shake ------------------------------------------ */
  const tmp = new Uint32Array(N);
  /* row tearing: amount 0..1 of rows torn, by up to max pixels; k picks the pattern */
  const glitch = (amount, max, k) => {
    tmp.set(T);
    for (let y = 0; y < H; y++) {
      const band = Math.floor(y / 6);
      if (hash2(band, k) > amount) continue;
      const off = Math.round((hash2(band + 500, k) * 2 - 1) * max);
      const swap = hash2(band + 900, k) > 0.7;
      for (let x = 0; x < W; x++) {
        let c = tmp[y * W + ((x - off + W * 4) % W)];
        if (swap) c = rgb(B(c), R(c), G(c));
        T[y * W + x] = c;
      }
    }
  };
  /* the picture collapsing as a CRT switched off: to a line (p 0..0.6), then a dot */
  const tvOff = (p, bg = 0) => {
    if (p <= 0) return;
    tmp.set(T); T.fill(bg);
    const hy = Math.max(1, H * (1 - ease.in(clamp(p / 0.6)))), wx = p < 0.6 ? W : Math.max(1, W * (1 - ease.out(seg(p, 0.6, 1))));
    const bright = 1 + p * 3;
    for (let y = Math.floor(H / 2 - hy / 2); y < Math.ceil(H / 2 + hy / 2); y++) {
      const sy = Math.floor(((y - (H / 2 - hy / 2)) / hy) * H);
      for (let x = Math.floor(W / 2 - wx / 2); x < Math.ceil(W / 2 + wx / 2); x++) {
        const sx = Math.floor(((x - (W / 2 - wx / 2)) / wx) * W);
        if (y >= 0 && y < H && x >= 0 && x < W) T[y * W + x] = scale(tmp[(sy < 0 ? 0 : sy >= H ? H - 1 : sy) * W + (sx < 0 ? 0 : sx >= W ? W - 1 : sx)], bright);
      }
    }
  };
  const shift = (dx, dy) => {
    tmp.set(T); T.fill(0);
    for (let y = 0; y < H; y++) { const sy = y - dy; if (sy < 0 || sy >= H) continue; for (let x = 0; x < W; x++) { const sx = x - dx; if (sx >= 0 && sx < W) T[y * W + x] = tmp[sy * W + sx]; } }
  };
  /* dissolve to a colour through the Bayer matrix: p 0..1 */
  const dissolve = (p, c = 0) => { if (p <= 0) return; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < p) T[y * W + x] = c; };

  /* ---- the registry: every intro adds itself with DS.add({...}) ------------- */
  const list = [];
  const add = (fx) => { list.push(fx); return fx; };
  const get = (id) => list.find((f) => f.id === id);
  /* params: the page's ?name=...&tag=... and the like, read by intros */
  const params = new URLSearchParams(location.search);
  const param = (k, d) => { const v = params.get(k); return v === null || v === "" ? d : v; };

  window.DS = {
    W, H, N, main, layer, use, rgb, hex, mix, scale, ramp, R, G, B,
    clamp, lerp, seg, ease, hash, hash2, bayer, fsin,
    clear, pset, rect, shade, line, fade, blit, vgrad,
    loadFont, glyph, text, tw, ctext, decode,
    stars, plasma, copper, texture, tunnel, rotozoom, rings, Fire, globe, mesh, drawMesh,
    glitch, tvOff, shift, dissolve,
    add, get, list, params, param,
  };
})();
