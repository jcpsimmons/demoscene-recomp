#!/usr/bin/env node
/* Render a bumper to a video master, frame-exact, with its sound.
 *
 *   cd tools && npm install          (once: Playwright's Chromium)
 *   node tools/render.mjs drj-show                     4K ProRes 422 HQ .mov
 *   node tools/render.mjs sponsor --name "ACME" --tag "WE MAKE ANVILS" --url acme.com
 *   node tools/render.mjs brb --seconds 64 --size 1080 --mp4
 *   node tools/render.mjs --all --size 1080 --mp4
 *   node tools/render.mjs --list
 *
 * Options
 *   --size 4k|1080|native   3840x2160 (8x, default), 1920x1080 (4x), 480x270
 *   --fps N                 frames per second (30)
 *   --seconds N             length; default the intro's own, a loop's one cycle
 *   --mp4                   also write an H.264 + AAC .mp4 next to the .mov
 *   --lufs N                integrated loudness target (-18; true peak held at -1 dBTP)
 *   --out DIR               output folder (renders/)
 *   --name --tag --url --wall --text --msg --ticker   the intro's own fields
 *
 * The page draws every frame at exactly t = n / fps (the intros are pure
 * functions of time) and renders the music through an OfflineAudioContext, so
 * nothing depends on how fast this machine is. The 480x270 picture is scaled
 * up with nearest neighbour: the pixels stay square and sharp. Each render
 * also writes checks/<name>_sheet.jpg, eight frames across its length. */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIELDS = ["name", "tag", "url", "wall", "text", "msg", "ticker"];
const argv = process.argv.slice(2);
const opt = { size: "4k", fps: 30, out: path.join(ROOT, "renders"), lufs: -18 };
const ids = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) { ids.push(a); continue; }
  const k = a.slice(2);
  if (["mp4", "all", "list"].includes(k)) opt[k] = true;
  else opt[k] = argv[++i];
}
const SIZES = { "4k": [3840, 2160], "2160": [3840, 2160], "1080": [1920, 1080], native: [480, 270] };
if (!SIZES[opt.size]) { console.error(`--size must be one of ${Object.keys(SIZES).join(", ")}`); process.exit(1); }
const [OW, OH] = SIZES[opt.size];
const FPS = Number(opt.fps);

let chromium;
try { ({ chromium } = await import("playwright")); }
catch (e) { console.error("Playwright isn't installed. Run: cd tools && npm install"); process.exit(1); }
if (spawnSync("ffmpeg", ["-version"]).status !== 0) { console.error("ffmpeg isn't on the PATH."); process.exit(1); }

/* a static server for the site, so the font and scripts load as on the web */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff": "font/woff", ".png": "image/png", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

/* Playwright's own Chromium, or the installed Chrome when that isn't downloaded */
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" })).catch(() => {
  console.error("No browser for Playwright. Run: cd tools && npx playwright install chromium"); process.exit(1);
});
const page = await browser.newPage();
const open = async (id) => {
  const q = new URLSearchParams({ fx: id, render: "1" });
  for (const f of FIELDS) if (opt[f] !== undefined) q.set(f, opt[f]);
  await page.goto(`http://127.0.0.1:${PORT}/web/bumpers/play.html?${q}`);
  await page.waitForFunction(() => window.BUMPER_RENDER, null, { timeout: 30000 });
};

await open(ids[0] || "drj-show");
const all = await page.evaluate(() => DS.list.map((f) => ({ id: f.id, name: f.name, kind: f.kind, duration: f.duration, loop: !!f.loop })));
if (opt.list) {
  for (const f of all) console.log(`${f.id.padEnd(16)} ${f.kind.padEnd(9)} ${f.loop ? "loop " : ""}${f.duration}s  ${f.name}`);
  await browser.close(); server.close(); process.exit(0);
}
const todo = opt.all ? all.map((f) => f.id) : ids;
if (!todo.length) { console.error("Name a bumper (node tools/render.mjs --list) or pass --all."); process.exit(1); }
for (const id of todo) if (!all.find((f) => f.id === id)) { console.error(`No bumper called "${id}". Try --list.`); process.exit(1); }

fs.mkdirSync(path.join(opt.out, "checks"), { recursive: true });
const run = (args) => { const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8", maxBuffer: 1 << 26 }); if (r.status !== 0) throw new Error(r.stderr); return r; };

for (const id of todo) {
  await open(id);
  const info = await page.evaluate(() => window.BUMPER_RENDER.info());
  const seconds = Number(opt.seconds || info.duration);
  const frames = Math.round(seconds * FPS);
  const suffix = FIELDS.filter((f) => opt[f]).length ? "_" + String(opt.name || opt.text || opt.wall || "custom").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) : "";
  const base = `${id}${suffix}_${opt.size === "native" ? "480" : opt.size}`;
  const mov = path.join(opt.out, base + ".mov");
  console.log(`${id}: ${frames} frames at ${FPS} fps, ${seconds} s, ${OW}x${OH}`);

  /* the sound: rendered offline, measured, then gained to the target */
  let wavPath = null, gain = 0, loud = "";
  if (!info.silent) {
    const b64 = await page.evaluate((s) => window.BUMPER_RENDER.audio(s), seconds);
    wavPath = path.join(opt.out, `.${base}.wav`);
    fs.writeFileSync(wavPath, Buffer.from(b64, "base64"));
    const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", wavPath, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const I = Number((/I:\s+(-?[\d.]+) LUFS/.exec(m.slice(m.lastIndexOf("Summary"))) || [])[1]);
    const TP = Number((/Peak:\s+(-?[\d.]+) dBFS/.exec(m.slice(m.lastIndexOf("Summary"))) || [])[1]);
    if (isFinite(I)) {
      gain = Number(opt.lufs) - I;
      if (isFinite(TP) && TP + gain > -1) gain = -1 - TP;
      loud = `audio ${I.toFixed(1)} LUFS, peak ${TP.toFixed(1)} dBTP -> gain ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB`;
    }
  }

  const args = ["-y", "-hide_banner", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", "480x270", "-r", String(FPS), "-i", "pipe:0"];
  if (wavPath) args.push("-i", wavPath);
  args.push("-vf", `scale=${OW}:${OH}:flags=neighbor`, "-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le", "-vendor", "apl0");
  if (wavPath) args.push("-af", `volume=${gain.toFixed(2)}dB`, "-c:a", "pcm_s24le", "-ar", "48000", "-shortest");
  args.push(mov);
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((r, j) => ff.on("close", (c) => (c ? j(new Error(`ffmpeg exited ${c}`)) : r())));
  for (let n = 0; n < frames; n++) {
    const b64 = await page.evaluate((t) => window.BUMPER_RENDER.frame(t), n / FPS);
    if (!ff.stdin.write(Buffer.from(b64, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
    if (n % FPS === 0) process.stdout.write(`\r  frame ${n}/${frames}`);
  }
  ff.stdin.end();
  await done;
  process.stdout.write(`\r  wrote ${path.relative(process.cwd(), mov)}${" ".repeat(20)}\n`);
  if (loud) console.log("  " + loud);

  if (opt.mp4) {
    const mp4 = mov.replace(/\.mov$/, ".mp4");
    run(["-y", "-i", mov, "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", ...(wavPath ? ["-c:a", "aac", "-b:a", "320k"] : []), "-movflags", "+faststart", mp4]);
    console.log(`  wrote ${path.relative(process.cwd(), mp4)}`);
  }
  /* the check sheet: eight frames across the length, 4x2 */
  const sheet = path.join(opt.out, "checks", base + "_sheet.jpg");
  const step = Math.max(1, Math.floor(frames / 8));
  run(["-y", "-i", mov, "-vf", `select='not(mod(n\\,${step}))',scale=480:270:flags=neighbor,tile=4x2:padding=4:color=0x222222`, "-frames:v", "1", "-q:v", "3", sheet]);
  console.log(`  wrote ${path.relative(process.cwd(), sheet)}`);
  if (/janus/.test(id)) console.log("  credit in the description: Bust: Double headed herm, The Fitzwilliam Museum, Cambridge (GR.20.1850), CC BY 4.0");
  if (wavPath) fs.unlinkSync(wavPath);
}
await browser.close();
server.close();
