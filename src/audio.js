// Wispr Flow takes speech as 16 kHz mono PCM16 WAV. The browser resamples its recording to that rate, and this
// pure encoder writes the file, so the tests can check every byte of the header.
export const WAV_RATE = 16000;
const HEADER_BYTES = 44;

export function encodeWav(samples, sampleRate) {
  const dataBytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(HEADER_BYTES + dataBytes));
  const tag = (offset, text) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true); // size of the fmt chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  tag(36, 'data');
  view.setUint32(40, dataBytes, true);
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(HEADER_BYTES + i * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
  });
  return new Uint8Array(view.buffer);
}
