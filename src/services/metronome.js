// ==========================================================================
// High-Precision Synchronized Studio Metronome (Web Audio API)
// ==========================================================================

let audioCtx = null;
let masterGain = null;
let isRunning = false;
let currentBpm = 120;
let currentBeatsPerBar = 4;
let startEpochMs = 0;
let localVolume = 0.8;
let isAudioMuted = false;

let nextBeatIndex = 0;
let schedulerTimer = null;
let beatCallback = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtxClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(localVolume, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playSynthesizedClick(time, isAccent = false) {
  const ctx = getAudioContext();
  if (isAudioMuted || localVolume <= 0) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Accent (Beat 1) is higher pitched (1300Hz), other beats are 850Hz woodblock click
  const freq = isAccent ? 1300 : 850;
  const clickLength = isAccent ? 0.045 : 0.035;
  const initialGain = isAccent ? localVolume : localVolume * 0.7;

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, time);
  // Quick frequency drop creates realistic woodblock acoustic snap
  osc.frequency.exponentialRampToValueAtTime(freq * 0.4, time + clickLength);

  gain.gain.setValueAtTime(initialGain, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + clickLength);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(time);
  osc.stop(time + clickLength + 0.01);
}

// Schedules beats based on universal epoch start time
function scheduleBeats() {
  if (!isRunning) return;
  const ctx = getAudioContext();
  const lookaheadSec = 0.12; // Lookahead window (120ms)
  const beatIntervalSec = 60 / currentBpm;
  const nowEpochSec = Date.now() / 1000;
  const startSec = startEpochMs / 1000;

  // Determine current beat index based on elapsed epoch time
  const elapsedSec = nowEpochSec - startSec;
  if (nextBeatIndex * beatIntervalSec < elapsedSec - 0.2) {
    // Jump forward if tab was backgrounded or synchronized from remote peer
    nextBeatIndex = Math.max(0, Math.floor(elapsedSec / beatIntervalSec));
  }

  while (true) {
    const beatEpochSec = startSec + nextBeatIndex * beatIntervalSec;
    const timeUntilBeatSec = beatEpochSec - nowEpochSec;

    // Stop scheduling if beyond our lookahead window
    if (timeUntilBeatSec > lookaheadSec) break;

    // If beat is in the near future (or barely passed by <30ms)
    if (timeUntilBeatSec >= -0.03) {
      const audioTime = ctx.currentTime + Math.max(0, timeUntilBeatSec);
      const beatInBar = (nextBeatIndex % currentBeatsPerBar) + 1;
      const isAccent = beatInBar === 1;

      playSynthesizedClick(audioTime, isAccent);

      // Trigger visual animation in React
      const triggerDelayMs = Math.max(0, timeUntilBeatSec * 1000);
      if (beatCallback) {
        setTimeout(() => {
          if (isRunning && beatCallback) {
            beatCallback(beatInBar, isAccent);
          }
        }, triggerDelayMs);
      }
    }

    nextBeatIndex++;
  }

  schedulerTimer = setTimeout(scheduleBeats, 35);
}

export function startMetronome({
  bpm = 120,
  beatsPerBar = 4,
  startEpoch = Date.now(),
  onBeat = null
}) {
  currentBpm = Math.max(30, Math.min(300, Math.round(bpm)));
  currentBeatsPerBar = beatsPerBar;
  startEpochMs = startEpoch;
  beatCallback = onBeat;

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const beatIntervalSec = 60 / currentBpm;
  const nowEpochSec = Date.now() / 1000;
  const elapsedSec = Math.max(0, nowEpochSec - (startEpochMs / 1000));
  nextBeatIndex = Math.floor(elapsedSec / beatIntervalSec);

  if (!isRunning) {
    isRunning = true;
    scheduleBeats();
  }
}

export function updateMetronomeParams({ bpm, beatsPerBar, startEpoch }) {
  if (bpm) currentBpm = Math.max(30, Math.min(300, Math.round(bpm)));
  if (beatsPerBar) currentBeatsPerBar = beatsPerBar;
  if (startEpoch) {
    startEpochMs = startEpoch;
    const beatIntervalSec = 60 / currentBpm;
    const nowEpochSec = Date.now() / 1000;
    const elapsedSec = Math.max(0, nowEpochSec - (startEpochMs / 1000));
    nextBeatIndex = Math.floor(elapsedSec / beatIntervalSec);
  }
}

export function stopMetronome() {
  isRunning = false;
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  if (beatCallback) {
    beatCallback(0, false);
  }
}

export function setMetronomeVolume(vol) {
  localVolume = Math.max(0, Math.min(1, vol));
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(isAudioMuted ? 0 : localVolume, audioCtx.currentTime);
  }
}

export function toggleMetronomeMute() {
  isAudioMuted = !isAudioMuted;
  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(isAudioMuted ? 0 : localVolume, audioCtx.currentTime);
  }
  return isAudioMuted;
}

export function isMetronomeRunning() {
  return isRunning;
}

export function getMetronomeState() {
  return {
    isRunning,
    bpm: currentBpm,
    beatsPerBar: currentBeatsPerBar,
    volume: localVolume,
    isMuted: isAudioMuted
  };
}

