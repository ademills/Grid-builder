// Thin wrapper around AudioContext + AnalyserNode. Exposes per-frame amplitude,
// a small set of frequency-band averages, and a simple energy-based beat
// detector. Works with either a microphone stream or an <audio> element
// (file playback) as the source.

const FFT_SIZE = 1024;

/**
 * Starts an audio analyser from a MediaStream (microphone) or an HTMLMediaElement
 * (file playback). Returns a controller object with `update()` (call once per
 * frame to refresh the cached readings) and `stop()`.
 */
export function createAudioAnalyser(source) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const context = new AudioCtx();
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.8;

  let sourceNode;
  if (source instanceof MediaStream) {
    sourceNode = context.createMediaStreamSource(source);
    sourceNode.connect(analyser);
  } else {
    // HTMLMediaElement — also route to destination so the user hears it
    sourceNode = context.createMediaElementSource(source);
    sourceNode.connect(analyser);
    sourceNode.connect(context.destination);
  }

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  // Rolling average of total energy, for beat detection.
  let energyHistory = [];
  const HISTORY_LEN = 30;

  const state = {
    amplitude: 0,    // 0–1, RMS of the time-domain waveform
    bands: [0, 0, 0, 0], // 0–1 averages: bass / low-mid / high-mid / treble
    beat: false,     // true for the frame a beat is detected
  };

  function update(beatSensitivity = 0.5) {
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);

    // RMS amplitude from the waveform, centred on 128.
    let sumSquares = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      sumSquares += v * v;
    }
    state.amplitude = Math.sqrt(sumSquares / timeData.length);

    // Split the frequency spectrum into 4 bands.
    const n = freqData.length;
    const bandSize = Math.floor(n / 4);
    for (let b = 0; b < 4; b++) {
      let sum = 0;
      const start = b * bandSize;
      const end = b === 3 ? n : start + bandSize;
      for (let i = start; i < end; i++) sum += freqData[i];
      state.bands[b] = sum / ((end - start) * 255);
    }

    // Beat detection: bass band energy vs. its rolling average.
    const energy = state.bands[0];
    const avg = energyHistory.length
      ? energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length
      : energy;
    const threshold = avg * (1.05 + beatSensitivity);
    state.beat = energy > threshold && energy > 0.05;
    energyHistory.push(energy);
    if (energyHistory.length > HISTORY_LEN) energyHistory.shift();

    return state;
  }

  function stop() {
    try { sourceNode.disconnect(); } catch { /* already disconnected */ }
    try { analyser.disconnect(); } catch { /* already disconnected */ }
    context.close().catch(() => {});
  }

  return { state, update, stop, context, analyser };
}

// Blends a hex colour toward a target hex colour by `amount` (0–1).
export function blendHexToward(hex, target, amount) {
  if (amount <= 0) return hex;
  const a = Math.min(1, amount);
  const src = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(h => parseInt(h, 16));
  const dst = [target.slice(1, 3), target.slice(3, 5), target.slice(5, 7)].map(h => parseInt(h, 16));
  const mixed = src.map((v, i) => Math.round(v + (dst[i] - v) * a));
  return '#' + mixed.map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Maps a 0–1 amplitude value to a speed multiplier using the chosen curve. */
export function mapAmplitude(amp, mapping = 'linear') {
  const a = Math.max(0, Math.min(1, amp));
  switch (mapping) {
    case 'logarithmic':
      return Math.log10(1 + a * 9); // 0–1
    case 'exponential':
      return a * a;
    default:
      return a;
  }
}
