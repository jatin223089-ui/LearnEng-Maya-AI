// AudioWorklet processor: captures mic float32 frames and posts them to the main thread.
// Loaded as a Blob URL from useLiveAudio.js because CRA can't serve worklet files easily.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      // Copy because the buffer is reused
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
