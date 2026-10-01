import { Mp3Encoder } from '@breezystack/lamejs';

// Recebe os canais já decodificados (Float32) e devolve um MP3.
self.onmessage = ({ data }) => {
  const { channels, sampleRate, kbps } = data;
  const n = channels.length > 1 ? 2 : 1;
  const toInt16 = f => {
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };
  const left = toInt16(channels[0]);
  const right = n === 2 ? toInt16(channels[1]) : null;
  const enc = new Mp3Encoder(n, sampleRate, kbps);
  const block = 1152 * 20, parts = [];
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const buf = n === 2 ? enc.encodeBuffer(l, right.subarray(i, i + block)) : enc.encodeBuffer(l);
    if (buf.length) parts.push(new Uint8Array(buf));
    if ((i / block) % 40 === 0) self.postMessage({ progress: i / left.length });
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  self.postMessage({ done: true, blob: new Blob(parts, { type: 'audio/mpeg' }) });
};
