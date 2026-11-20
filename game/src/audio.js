// Port Azura — WebAudio-synthesised sound. No audio files: every effect is an
// oscillator or a noise burst shaped by hand, so the game stays fully offline.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return !!ctx;
  }

  function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.25, freq = 1200, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
    shoot() { noise(0.09, 0.3, 900); tone(160, 0.08, 'sawtooth', 0.12, 60); },
    hit() { noise(0.06, 0.18, 2400); },
    crash() { noise(0.28, 0.4, 300); tone(90, 0.25, 'triangle', 0.25, 40); },
    pickup() { tone(660, 0.09, 'sine', 0.22); tone(990, 0.14, 'sine', 0.22, null, 0.08); },
    cash() { tone(880, 0.07, 'triangle', 0.2); tone(1174, 0.07, 'triangle', 0.2, null, 0.07); tone(1568, 0.16, 'triangle', 0.2, null, 0.14); },
    horn() { tone(370, 0.22, 'square', 0.16); tone(466, 0.22, 'square', 0.12); },
    door() { tone(220, 0.06, 'square', 0.15, 180); tone(180, 0.08, 'square', 0.15, 140, 0.07); },
    busted() { tone(392, 0.18, 'square', 0.2); tone(311, 0.18, 'square', 0.2, null, 0.18); tone(233, 0.4, 'square', 0.2, null, 0.36); },
    wasted() { tone(330, 0.5, 'sawtooth', 0.2, 55); },
    missionDone() { tone(523, 0.1, 'triangle', 0.22); tone(659, 0.1, 'triangle', 0.22, null, 0.1); tone(784, 0.1, 'triangle', 0.22, null, 0.2); tone(1046, 0.24, 'triangle', 0.24, null, 0.3); },
    star() { tone(1244, 0.12, 'square', 0.14, 1866); },
    /** Continuous engine hum while driving; rpm 0..1 follows speed. */
    engine(on, rpm) {
      if (!ensure()) return;
      if (on && !engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter).connect(engineGain).connect(master);
        engineOsc.start();
      }
      if (engineOsc) {
        engineOsc.frequency.value = 55 + rpm * 165;
        engineGain.gain.value = on ? 0.05 + rpm * 0.05 : 0.0;
      }
    },
    /** Police siren wash; level 0..1 by nearest police distance. */
    siren(level, dt) {
      if (!ensure()) return;
      if (level > 0.02 && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = 'triangle';
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
      }
      if (sirenOsc) {
        sirenPhase += dt * 2.4;
        sirenOsc.frequency.value = 700 + Math.sin(sirenPhase * Math.PI * 2) * 180;
        sirenGain.gain.value = level * 0.05;
      }
    },
  };
}
