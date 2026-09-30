/* A queue of Float32 chunks played back to back. The engine's driver mixes
   into its DMA ring at its own rate; the host takes those bytes every frame
   and posts them here, each chunk labelled with the demo time it belongs to
   (t, demo seconds, and d, the length of its frame).
   Underrun plays silence, which is also what the real card did when the demo
   fell behind.

   THE PIN. Every other render quantum, while real chunks are being rendered,
   the page is told one exact pair: at audio time T (this quantum's
   currentTime) the sound was at demo time P (the chunk and the offset into
   it at the START of the quantum), in demo seconds. Both are captured at the same instant in
   here, so the pair is exact whenever it arrives; the page keeps its own
   continuous clock (getOutputTimestamp) and uses the pair only as the
   constant that says where frame N sits on it. Nothing here is a clock. */
class PcmQueue extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];          // {samples: Float32Array, t: demo seconds, d: its frame's length}
    this.pos = 0;
    this.calls = 0;
    this.port.onmessage = (e) => { this.chunks.push(e.data); };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    if (this.chunks.length && ((++this.calls & 1) === 0)) {
      const c = this.chunks[0];
      this.port.postMessage({ time: c.t + this.pos / c.samples.length * c.d, t: currentTime });
    }
    let i = 0;
    while (i < out.length) {
      if (!this.chunks.length) { out.fill(0, i); break; }
      const c = this.chunks[0];
      const n = Math.min(out.length - i, c.samples.length - this.pos);
      out.set(c.samples.subarray(this.pos, this.pos + n), i);
      i += n; this.pos += n;
      if (this.pos >= c.samples.length) { this.chunks.shift(); this.pos = 0; }
    }
    return true;
  }
}
registerProcessor("pcm-queue", PcmQueue);
