/* Decodes one AI-upscaled picture (lossless WebP, tools/webpack.py) back to
 * the exact PNM bytes src/core/upscale.c reads: P6 RGB for NAME.ppm, P5
 * grey for NAME.pgm (the WebP holds the grey as R = G = B). No colour
 * management (the files carry no profile, and none is applied), no
 * premultiplication (no alpha). NAME.u16: a layer of the fractal's ring
 * strip, decoded to its 16-bit values (below).
 *
 *   page -> here  {id, name, blob}
 *   here -> page  {id, name, data: Uint8Array} or {id, name, error}
 */
"use strict";
onmessage = async (e) => {
  const { id, name, blob } = e.data;
  try {
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const w = bmp.width, h = bmp.height;
    const cv = new OffscreenCanvas(w, h);
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    bmp.close();
    const px = g.getImageData(0, 0, w, h).data;
    if (name.endsWith(".u16")) {
      /* a layer of the fractal's ring strip (tools/webpack.py pack_rings):
         G = angle >> 2, R = (angle & 3) << 6 | magnitude << 3 | coverage,
         back to the 16-bit values (coverage << 13 | magnitude << 10 |
         angle) as little-endian bytes */
      const out = new Uint8Array(w * h * 2);
      for (let i = 0, o = 0; i < w * h; i++) {
        const r = px[4 * i], v = ((r & 7) << 13) | (((r >> 3) & 7) << 10) | (px[4 * i + 1] << 2) | (r >> 6);
        out[o++] = v & 255; out[o++] = v >> 8;
      }
      postMessage({ id, name, data: out, w, h }, [out.buffer]);
      return;
    }
    const grey = name.endsWith(".pgm");
    const head = new TextEncoder().encode(`P${grey ? 5 : 6}\n${w} ${h}\n255\n`);
    const ch = grey ? 1 : 3;
    const out = new Uint8Array(head.length + w * h * ch);
    out.set(head, 0);
    let o = head.length;
    if (grey) for (let i = 0; i < w * h; i++) out[o++] = px[4 * i];
    else for (let i = 0; i < w * h; i++) { out[o++] = px[4 * i]; out[o++] = px[4 * i + 1]; out[o++] = px[4 * i + 2]; }
    postMessage({ id, name, data: out }, [out.buffer]);
  } catch (err) {
    postMessage({ id, name, error: String(err && err.message || err) });
  }
};
