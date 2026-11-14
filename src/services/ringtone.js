// ==========================================================================
// Web Audio API Synthesized Melody Ringtones
// Zero external audio files required, works 100% offline
// ==========================================================================

export const RINGTONE_STORAGE_KEY = 'alaapi_selected_ringtone';

export const RINGTONE_OPTIONS = [
  {
    id: 'jingle_bells',
    name: 'Jingle Bells',
    bpm: 170,
    waveType: 'triangle',
    notes: [
      ['E5', 1], ['E5', 1], ['E5', 2],
      ['E5', 1], ['E5', 1], ['E5', 2],
      ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5],
      ['E5', 3]
    ]
  },
  {
    id: 'carol_of_bells',
    name: 'Carol of the Bells',
    bpm: 185,
    waveType: 'sine',
    notes: [
      ['Bb4', 1], ['A4', 0.5], ['Bb4', 0.5], ['G4', 1],
      ['Bb4', 1], ['A4', 0.5], ['Bb4', 0.5], ['G4', 1],
      ['Bb4', 1], ['A4', 0.5], ['Bb4', 0.5], ['G4', 1],
      ['Bb4', 1], ['A4', 0.5], ['Bb4', 0.5], ['G4', 1]
    ]
  },
  {
    id: 'interstellar',
    name: 'Interstellar (First Step)',
    bpm: 126,
    waveType: 'triangle',
    notes: [
      ['A4', 1], ['E5', 2],
      ['A4', 1], ['E5', 2],
      ['B4', 1], ['E5', 2],
      ['B4', 1], ['E5', 2],
      ['C5', 1], ['E5', 2],
      ['D5', 1], ['E5', 2]
    ]
  },
  {
    id: 'hedwigs_theme',
    name: "Hedwig's Theme",
    bpm: 145,
    waveType: 'sine',
    notes: [
      ['B4', 1], ['E5', 1.5], ['G5', 0.5], ['Fs5', 1],
      ['E5', 2], ['B5', 1], ['A5', 2.5], ['Fs5', 2.5]
    ]
  },
  {
    id: 'fur_elise',
    name: 'Für Elise',
    bpm: 150,
    waveType: 'sine',
    notes: [
      ['E5', 0.5], ['Eb5', 0.5], ['E5', 0.5], ['Eb5', 0.5], ['E5', 0.5],
      ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 2]
    ]
  },
  {
    id: 'classic',
    name: 'Classic Telephone Ring',
    bpm: 120,
    waveType: 'sine',
    notes: [] // Custom dual-tone handling
  }
];

const NOTE_FREQS = {
  'G4': 392.00,
  'A4': 440.00,
  'Bb4': 466.16,
  'B4': 493.88,
  'C5': 523.25,
  'D5': 587.33,
  'Eb5': 622.25,
  'E5': 659.25,
  'Fs5': 739.99,
  'G5': 783.99,
  'A5': 880.00,
  'B5': 987.77
};

let audioCtx = null;
let activeNodes = [];
let loopTimeout = null;
let isRinging = false;

export function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function unlockAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function getSelectedRingtone() {
  try {
    const stored = localStorage.getItem(RINGTONE_STORAGE_KEY);
    if (stored && RINGTONE_OPTIONS.some(o => o.id === stored)) {
      return stored;
    }
  } catch (e) {}
  return 'jingle_bells';
}

export function saveSelectedRingtone(id) {
  try {
    if (RINGTONE_OPTIONS.some(o => o.id === id)) {
      localStorage.setItem(RINGTONE_STORAGE_KEY, id);
      return id;
    }
  } catch (e) {}
  return 'jingle_bells';
}

function clearActiveAudio() {
  if (loopTimeout) {
    clearTimeout(loopTimeout);
    loopTimeout = null;
  }

  if (activeNodes.length > 0) {
    const ctx = getAudioContext();
    const now = ctx ? ctx.currentTime : 0;
    activeNodes.forEach(({ osc, gain }) => {
      try {
        if (gain && ctx) {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(0, now);
        }
        if (osc) {
          osc.stop(now);
          osc.disconnect();
        }
      } catch (e) {}
    });
    activeNodes = [];
  }
}

function playClassicBurst(ctx, now) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(440, now);

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(480, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.28, now + 0.05);
  gain.gain.setValueAtTime(0.28, now + 0.9);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 1.1);
  osc2.stop(now + 1.1);

  activeNodes.push({ osc: osc1, gain });
  activeNodes.push({ osc: osc2, gain });

  return 1.1;
}

function playMelodyNotes(ctx, melody, now) {
  const beatSec = 60 / melody.bpm;
  let offset = 0;

  melody.notes.forEach(([noteName, beats]) => {
    const freq = NOTE_FREQS[noteName];
    if (!freq) return;

    const noteDuration = beats * beatSec;
    const soundDuration = noteDuration * 0.88; // subtle staccato separation
    const noteStart = now + offset;
    const noteEnd = noteStart + soundDuration;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = melody.waveType;
    osc.frequency.setValueAtTime(freq, noteStart);

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.25, noteStart + 0.02);
    gain.gain.setValueAtTime(0.22, noteEnd - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteStart);
    osc.stop(noteEnd + 0.02);

    activeNodes.push({ osc, gain });

    offset += noteDuration;
  });

  return offset;
}

export function playRingtone(ringtoneId = null, loop = true) {
  stopRingtone();
  isRinging = true;

  const ctx = getAudioContext();
  if (!ctx) return;

  const targetId = ringtoneId || getSelectedRingtone();
  const melody = RINGTONE_OPTIONS.find(o => o.id === targetId) || RINGTONE_OPTIONS[0];

  const scheduleRound = () => {
    if (!isRinging) return;
    const now = ctx.currentTime;
    let durationSec = 0;

    if (melody.id === 'classic') {
      durationSec = playClassicBurst(ctx, now);
    } else {
      durationSec = playMelodyNotes(ctx, melody, now);
    }

    if (loop && isRinging) {
      const pauseSec = melody.id === 'classic' ? 1.5 : 1.2;
      const nextDelayMs = Math.max(500, Math.round((durationSec + pauseSec) * 1000));
      loopTimeout = setTimeout(() => {
        if (isRinging) {
          scheduleRound();
        }
      }, nextDelayMs);
    }
  };

  scheduleRound();
}

export function previewRingtone(ringtoneId) {
  playRingtone(ringtoneId, false);
}

export function stopRingtone() {
  isRinging = false;
  clearActiveAudio();
}
