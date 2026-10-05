/* The sound's last stage: a queue of stereo chunks from the sound worker
 * (audio-worker.js), played back to back, and the clock.
 *
 * Every chunk carries the demo time of its first sample (t0) and the
 * generation it was rendered for: a seek or a pause starts a new
 * generation, and chunks of any other one are dropped, so nothing of the
 * old position is heard after a jump.
 *
 * THE PIN. Every few render quanta, while real chunks play, the page is told
 * one exact pair: at context time T (this quantum's currentTime) the sound
 * was at demo time D (the chunk's t0 + the offset into it). The page turns
 * it into the time AT THE SPEAKER with getOutputTimestamp - the same clock
 * as the native build's (the play position of the device). Underrun plays
 * silence and pins nothing, so the picture waits for the sound.
 *
 *   page   -> here  {type:"port"} + a MessagePort to the worker
 *                   {type:"pause", gen}   silence, queue dropped, gen adopted
 *                   {type:"resume"}
 *   worker -> here  {type:"flush", gen}   a seek: queue dropped, gen adopted
 *                   {type:"chunk", gen, t0, l, r}
 *   here -> page    {gen, d, t}           the pin
 *   here -> worker  {gen, consumed}       frames played (the worker's lead)
 */
class PcmQueue extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.pos = 0;
    this.gen = -1;
    this.paused = false;
    this.consumed = 0;
    this.calls = 0;
    this.worker = null;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "port") {
        this.worker = m.port;
        this.worker.onmessage = (ev) => this.fromWorker(ev.data);
      } else if (m.type === "pause") {
        this.paused = true; this.gen = m.gen; this.chunks = []; this.pos = 0; this.consumed = 0;
      } else if (m.type === "resume") this.paused = false;
    };
  }
  fromWorker(m) {
    if (m.type === "flush") { this.gen = m.gen; this.chunks = []; this.pos = 0; this.consumed = 0; }
    else if (m.type === "chunk" && m.gen === this.gen) this.chunks.push(m);
  }
  process(inputs, outputs) {
    const L = outputs[0][0], R = outputs[0][1] || null;
    const n = L.length;
    let i = 0;
    const tell = (++this.calls & 3) === 0;
    if (tell && this.worker && !this.paused) this.worker.postMessage({ gen: this.gen, consumed: this.consumed });
    if (!this.paused && this.chunks.length) {
      const c = this.chunks[0];
      if (tell) this.port.postMessage({ gen: this.gen, d: c.t0 + this.pos / sampleRate, t: currentTime });
      while (i < n && this.chunks.length) {
        const h = this.chunks[0];
        const k = Math.min(n - i, h.l.length - this.pos);
        L.set(h.l.subarray(this.pos, this.pos + k), i);
        if (R) R.set(h.r.subarray(this.pos, this.pos + k), i);
        i += k; this.pos += k; this.consumed += k;
        if (this.pos >= h.l.length) { this.chunks.shift(); this.pos = 0; }
      }
    }
    if (i < n) { L.fill(0, i); if (R) R.fill(0, i); }
    return true;
  }
}
registerProcessor("cd2-pcm", PcmQueue);
