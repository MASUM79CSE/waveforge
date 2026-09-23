/**
 * WaveForge recorder worklet (M4). Accumulates input frames per channel
 * and posts transferable chunks to the main thread every 4096 frames
 * (plus a trailing partial on 'flush'). No allocations on the audio thread
 * beyond the reused accumulators.
 */
class WfRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.max = 4096;
    this.acc = [];
    this.len = 0;
    this.port.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.cmd === 'flush') this.flush();
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const chCount = input.length;
    while (this.acc.length < chCount) this.acc.push(new Float32Array(this.max));
    while (this.acc.length > chCount) this.acc.pop();

    for (let ch = 0; ch < chCount; ++ch) {
      const block = input[ch];
      const acc = this.acc[ch];
      if (!block || !acc) continue;
      for (let i = 0; i < block.length; ++i) {
        if (this.len >= this.max) {
          this.flush();
        }
        acc[this.len] = block[i];
        this.len += 1;
      }
    }
    return true;
  }

  flush() {
    if (this.len === 0) return;
    const channels = [];
    const transfer = [];
    for (let ch = 0; ch < this.acc.length; ++ch) {
      const part = (this.acc[ch] || new Float32Array(0)).slice(0, this.len);
      channels.push(part);
      transfer.push(part.buffer);
    }
    this.port.postMessage({ type: 'chunk', frames: this.len, channels }, transfer);
    this.len = 0;
  }
}

registerProcessor('wf-recorder', WfRecorderProcessor);
