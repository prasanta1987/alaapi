// ==========================================================================
// Web Audio API Synthesized Ringtone
// ==========================================================================

let audioCtx = null;
let ringInterval = null;
let isRinging = false;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playSingleBurst(ctx) {
  if (!ctx || !isRinging) return;

  const now = ctx.currentTime;
  
  // Dual tone generator: 440Hz and 480Hz (standard audible telephone ring)
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(440, now);

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(480, now);

  // Smooth attack and decay envelope
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.08);
  gain.gain.setValueAtTime(0.3, now + 1.0);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);

  osc1.stop(now + 1.2);
  osc2.stop(now + 1.2);
}

export function playRingtone() {
  if (isRinging) return;
  isRinging = true;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Play immediately
    playSingleBurst(ctx);

    // Repeat every 2.6 seconds
    ringInterval = setInterval(() => {
      if (isRinging) {
        playSingleBurst(ctx);
      }
    }, 2600);
  } catch (err) {
    console.warn("Could not play synthesized ringtone:", err);
  }
}

export function stopRingtone() {
  isRinging = false;
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
}

