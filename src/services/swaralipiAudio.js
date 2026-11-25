// ==========================================================================
// Swaralipi Harmonium Synthesizer & Playback Engine (Web Audio API)
// Ported & optimized from Alaapi Swaralipi Demo v5
// ==========================================================================

export const SWARA_MAP = ['স', 'ঋ', 'র', 'জ্ঞ', 'গ', 'ম', 'হ্ম', 'প', 'দ', 'ধ', 'ণ', 'ন'];
export const WESTERN_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B♭', 'B'];
export const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

export const SCALE_OPTIONS = [
  { value: 0, label: 'Sa = C' },
  { value: 1, label: 'Sa = C# (Kali 1)' },
  { value: 2, label: 'Sa = D' },
  { value: 4, label: 'Sa = E' },
  { value: 5, label: 'Sa = F' },
  { value: 7, label: 'Sa = G' },
  { value: 8, label: 'Sa = G# (Kali 4)' },
  { value: 9, label: 'Sa = A' },
  { value: 10, label: 'Sa = B♭ (Kali 5)' },
  { value: 11, label: 'Sa = B' },
  { value: 12, label: 'Sa = F#' }
];

export const TAALS = {
  free: { id: 'free', name: 'মুক্ত (Free / Alankar)', beats: 8, bars: [] },
  dadra: { id: 'dadra', name: 'দাদরা (Dadra)', beats: 6, bars: [3] },
  kaharwa: { id: 'kaharwa', name: 'কাহারবা (Kaharwa)', beats: 8, bars: [4] },
  teental: { id: 'teental', name: 'ত্রিতাল (Teental)', beats: 16, bars: [4, 8, 12] },
  ektaal: { id: 'ektaal', name: 'একতাল (Ektaal)', beats: 12, bars: [3, 6, 9] }
};

let sharedAudioCtx = null;

export function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function getRootSaMidi(scaleOffset = 10) {
  const saOffset = Number(scaleOffset);
  return saOffset >= 7 ? 48 + saOffset : 60 + saOffset;
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Warm Double-Reed Harmonium Synth Voice (Web Audio API)
 * Uses two gently detuned sawtooth reeds + soft fundamental body triangle
 * routed through a warm low-pass reed filter and 520Hz acoustic body resonance.
 */
export function createHarmoniumVoice(ctx, initialFreq, startTime) {
  const masterGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(1800, Math.max(950, initialFreq * 3.4)), startTime);
  filter.Q.setValueAtTime(1.1, startTime);

  // Subtle warm mid-body resonance
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = 'peaking';
  bodyFilter.frequency.setValueAtTime(520, startTime);
  bodyFilter.Q.setValueAtTime(1.0, startTime);
  bodyFilter.gain.setValueAtTime(2.5, startTime);

  // Reed 1 (slightly flat)
  const reed1 = ctx.createOscillator();
  reed1.type = 'sawtooth';
  reed1.frequency.setValueAtTime(initialFreq, startTime);
  reed1.detune.setValueAtTime(-5.5, startTime);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.32, startTime);

  // Reed 2 (slightly sharp — creates natural harmonium chorus beating)
  const reed2 = ctx.createOscillator();
  reed2.type = 'sawtooth';
  reed2.frequency.setValueAtTime(initialFreq, startTime);
  reed2.detune.setValueAtTime(5.5, startTime);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.32, startTime);

  // Soft fundamental body
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(initialFreq, startTime);
  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(0.45, startTime);

  reed1.connect(g1);
  g1.connect(filter);
  reed2.connect(g2);
  g2.connect(filter);
  body.connect(g3);
  g3.connect(filter);

  filter.connect(bodyFilter);
  bodyFilter.connect(masterGain);
  masterGain.connect(ctx.destination);

  // Gentle bellows attack envelope
  masterGain.gain.setValueAtTime(0.0008, startTime);
  masterGain.gain.exponentialRampToValueAtTime(0.24, startTime + 0.042);
  masterGain.gain.setValueAtTime(0.22, startTime + 0.08);

  reed1.start(startTime);
  reed2.start(startTime);
  body.start(startTime);

  const oscs = [reed1, reed2, body];

  return {
    setFreq(freq, time) {
      oscs.forEach(o => {
        try {
          o.frequency.cancelScheduledValues(time);
          o.frequency.setValueAtTime(freq, time);
        } catch (_) {}
      });
      try {
        filter.frequency.setValueAtTime(Math.min(1800, Math.max(950, freq * 3.4)), time);
      } catch (_) {}
    },
    rampFreq(startFreq, endFreq, holdUntil, endTime) {
      oscs.forEach(o => {
        try {
          o.frequency.setValueAtTime(startFreq, holdUntil);
          o.frequency.exponentialRampToValueAtTime(endFreq, endTime);
        } catch (_) {}
      });
      try {
        filter.frequency.setValueAtTime(Math.min(1800, Math.max(950, startFreq * 3.4)), holdUntil);
        filter.frequency.exponentialRampToValueAtTime(Math.min(1800, Math.max(950, endFreq * 3.4)), endTime);
      } catch (_) {}
    },
    release(endTime) {
      try {
        const fadeStart = Math.max(startTime + 0.05, endTime - 0.055);
        masterGain.gain.setValueAtTime(0.22, fadeStart);
        masterGain.gain.exponentialRampToValueAtTime(0.0008, endTime);
        oscs.forEach(o => {
          try {
            o.stop(endTime + 0.03);
          } catch (_) {}
        });
      } catch (_) {}
    },
    stopNow() {
      const t = ctx.currentTime;
      try {
        masterGain.gain.cancelScheduledValues(t);
        masterGain.gain.setValueAtTime(Math.max(0.0008, masterGain.gain.value), t);
        masterGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.035);
        oscs.forEach(o => {
          try {
            o.stop(t + 0.045);
          } catch (_) {}
        });
      } catch (_) {}
    }
  };
}

/**
 * Preview a single note touch or key press with optional glide from previous cell.
 */
export function playPreviewTone(scaleOffset, semi, oct, duration = 0.38, glideFromCell = null) {
  if (semi === null || semi < 0) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const targetFreq = midiToFreq(getRootSaMidi(scaleOffset) + semi + (oct * 12));

  if (glideFromCell && glideFromCell.semi !== null && glideFromCell.semi >= 0) {
    const startFreq = midiToFreq(getRootSaMidi(scaleOffset) + glideFromCell.semi + (glideFromCell.oct * 12));
    const voice = createHarmoniumVoice(ctx, startFreq, now);
    voice.rampFreq(startFreq, targetFreq, now + 0.04, now + Math.min(0.28, duration * 0.65));
    voice.release(now + duration);
  } else {
    const voice = createHarmoniumVoice(ctx, targetFreq, now);
    voice.release(now + duration);
  }
}

/**
 * Sequence Playback Controller with Half-Beat Timing Fix & Meend Support
 */
export class SwaralipiPlaybackEngine {
  constructor() {
    this.isPlaying = false;
    this.playTimer = null;
    this.activePlayVoice = null;
    this.onCellPlaying = null;
    this.onKeyFlash = null;
    this.onEnded = null;
  }

  stop() {
    this.isPlaying = false;
    if (this.playTimer) {
      clearTimeout(this.playTimer);
      this.playTimer = null;
    }
    if (this.activePlayVoice) {
      this.activePlayVoice.stopNow();
      this.activePlayVoice = null;
    }
    if (this.onEnded) {
      this.onEnded();
    }
  }

  play({ rows, scaleOffset, bpm, onCellPlaying, onKeyFlash, onEnded }) {
    this.stop(); // Stop any active playback

    const flat = [];
    rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell.swara) {
          flat.push({ r, c, ...cell });
        }
      });
    });

    if (flat.length === 0) {
      return false;
    }

    const ctx = getAudioContext();
    this.isPlaying = true;
    this.onCellPlaying = onCellPlaying;
    this.onKeyFlash = onKeyFlash;
    this.onEnded = onEnded;

    let i = 0;
    let isGlidingIn = false;

    const stopActiveVoice = () => {
      if (this.activePlayVoice) {
        this.activePlayVoice.stopNow();
        this.activePlayVoice = null;
      }
    };

    const step = () => {
      if (!this.isPlaying || i >= flat.length) {
        this.stop();
        return;
      }

      const item = flat[i];
      if (this.onCellPlaying) {
        this.onCellPlaying(item.r, item.c);
      }

      const beatMs = Math.round(60000 / Math.max(30, Math.min(240, bpm)));
      const beatSec = beatMs / 1000;
      const now = ctx.currentTime;

      if (item.semi >= 0) {
        const rootSa = getRootSaMidi(scaleOffset);
        const midi = rootSa + item.semi + (item.oct * 12);
        const freq = midiToFreq(midi);

        let sustainBeats = 1;
        while (i + sustainBeats < flat.length && flat[i + sustainBeats].swara === 'া') {
          sustainBeats++;
        }
        const totalDurSec = sustainBeats * beatSec;

        let nextNote = null;
        if (item.meend) {
          const nextIdx = i + sustainBeats;
          if (nextIdx < flat.length && flat[nextIdx].r === item.r && flat[nextIdx].semi >= 0) {
            nextNote = flat[nextIdx];
          }
        }

        if (!isGlidingIn || !this.activePlayVoice) {
          stopActiveVoice();
          this.activePlayVoice = createHarmoniumVoice(ctx, freq, now);
        } else {
          this.activePlayVoice.setFreq(freq, now);
        }

        if (this.onKeyFlash) {
          this.onKeyFlash(midi, Math.max(180, sustainBeats * beatMs * 0.85));
        }

        if (nextNote) {
          const nextRootSa = getRootSaMidi(scaleOffset);
          const nextMidi = nextRootSa + nextNote.semi + (nextNote.oct * 12);
          const nextFreq = midiToFreq(nextMidi);
          const holdSec = totalDurSec * 0.35;
          this.activePlayVoice.rampFreq(freq, nextFreq, now + holdSec, now + totalDurSec);
          isGlidingIn = true;
        } else {
          this.activePlayVoice.release(now + totalDurSec * 0.92);
          this.activePlayVoice = null;
          isGlidingIn = false;
        }
      } else if (item.swara === ':') {
        // Half Beat Rest: Wait beatMs / 2
        stopActiveVoice();
        isGlidingIn = false;
        i++;
        this.playTimer = setTimeout(step, Math.round(beatMs / 2));
        return;
      } else if (item.swara !== 'া') {
        // Full Beat Pause '-' or others: Wait full beatMs
        stopActiveVoice();
        isGlidingIn = false;
      }

      i++;
      this.playTimer = setTimeout(step, beatMs);
    };

    step();
    return true;
  }
}
