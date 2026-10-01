"use strict";
/* Runs in <head>, before the first paint, so nothing jumps after it.
 *
 * THE LOOK. Two skins of the same pages: "retro" (the StarPort BBS, the
 * default) and "modern" (modern.css). The choice is <html data-look=...>,
 * remembered in localStorage ("recomp.look") and switched from the ≡ menu
 * (bbs.js) through window.recompLook(name).
 *
 * PIXEL-EXACT TEXT (retro only). The VGA font is drawn on an 8x16 grid; it is
 * crisp only when its pixels land on whole screen pixels. With display
 * scaling (125%, 150%, 175%...) a 16 CSS px font is 20/24/28 device px and
 * every glyph is resampled. So the root font size is set to 16 x a whole
 * number of DEVICE pixels: round(devicePixelRatio) x 16, expressed in CSS px.
 * Every size on the pages is a whole multiple of 1rem, so all text stays on
 * the grid. Re-done when the ratio changes (another monitor, browser zoom). */
(() => {
  const root = document.documentElement;
  const KEY = "recomp.look", LOOKS = ["retro", "modern"];
  let look = "retro";
  try { const v = localStorage.getItem(KEY); if (LOOKS.includes(v)) look = v; } catch (e) {}

  let mq = null;
  const fit = () => {
    if (mq) { mq.removeEventListener("change", fit); mq = null; }
    if (root.dataset.look !== "retro") { root.style.fontSize = ""; return; }
    const dpr = window.devicePixelRatio || 1;
    root.style.fontSize = 16 * Math.max(1, Math.round(dpr)) / dpr + "px";
    mq = window.matchMedia("(resolution: " + dpr + "dppx)");
    mq.addEventListener("change", fit);
  };

  window.recompLook = (name) => {
    if (name === undefined) return root.dataset.look;
    if (!LOOKS.includes(name)) return root.dataset.look;
    try { localStorage.setItem(KEY, name); } catch (e) {}
    root.dataset.look = name;
    fit();
    window.dispatchEvent(new CustomEvent("recomp-look", { detail: name }));
    return name;
  };
  root.dataset.look = look;
  fit();
})();
