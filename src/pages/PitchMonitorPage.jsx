import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestScreenWakeLock, releaseScreenWakeLock } from '../services/media';
import {
  Music,
  Mic,
  MicOff,
  RotateCcw,
  ArrowLeft,
  Sliders,
  Volume2,
  VolumeX,
  Play,
  Square,
  Radio,
  Sparkles
} from 'lucide-react';

const WESTERN_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SWARA_NAMES = [
  'Sa', 're', 'Re', 'ga', 'Ga', 'Ma', 'ma', 'Pa', 'dha', 'Dha', 'ni', 'Ni'
];

const SA_OPTIONS = [
  { value: 0, label: 'Sa = C (Natural)' },
  { value: 1, label: 'Sa = C# (Kali 1)' },
  { value: 2, label: 'Sa = D (Safed 2)' },
  { value: 3, label: 'Sa = D# (Kali 2)' },
  { value: 4, label: 'Sa = E (Safed 3)' },
  { value: 5, label: 'Sa = F (Safed 4)' },
  { value: 6, label: 'Sa = F# (Kali 3)' },
  { value: 7, label: 'Sa = G (Safed 5)' },
  { value: 8, label: 'Sa = G# (Kali 4)' },
  { value: 9, label: 'Sa = A (Safed 6)' },
  { value: 10, label: 'Sa = A# / Bb (Kali 5)' },
  { value: 11, label: 'Sa = B (Safed 7)' }
];

const SENSITIVITY_THRESHOLDS = {
  ultra: 0.0008,
  high: 0.0025,
  normal: 0.008
};

const MAX_POINTS = 360;

// Root Frequency for vocal octave (middle Sa around 130Hz - 260Hz)
const getRootFreq = (offset) => 440 * Math.pow(2, ((48 + offset) - 69) / 12);

export function PitchMonitorPage() {
  const navigate = useNavigate();

  // UI & Controls State
  const [isRunning, setIsRunning] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [isTanpuraRunning, setIsTanpuraRunning] = useState(false);
  const [tanpuraVolume, setTanpuraVolume] = useState(45); // 0..100%
  const [tanpuraFirstString, setTanpuraFirstString] = useState('Pa'); // 'Pa' | 'Ma' | 'Ni'
  const [activePluckIndex, setActivePluckIndex] = useState(-1); // 0..3 string index

  const [saOffset, setSaOffset] = useState(10); // Default A# / Bb (Kali 5)
  const [sensitivity, setSensitivity] = useState('normal');
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [sampleRateLabel, setSampleRateLabel] = useState('Raw Studio Audio');
  const [errorMsg, setErrorMsg] = useState('');

  // Live Telemetry State
  const [readout, setReadout] = useState({
    swara: '—',
    western: '—',
    freq: '0.0',
    cents: 0,
    signalPct: 0
  });

  // Audio & Canvas Refs
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const demoTimerRef = useRef(null);
  const rafIdRef = useRef(null);
  const timeDomainBufRef = useRef(null);

  // Tanpura Refs
  const tanpuraCtxRef = useRef(null);
  const tanpuraMasterGainRef = useRef(null);
  const tanpuraTimerRef = useRef(null);
  const saOffsetRef = useRef(saOffset);
  const tanpuraFirstStringRef = useRef(tanpuraFirstString);
  const tanpuraVolumeRef = useRef(tanpuraVolume);

  const pitchHistoryRef = useRef(new Array(MAX_POINTS).fill(null));
  const minMidiRef = useRef(48); // C3
  const maxMidiRef = useRef(72); // C5
  const sensitivityRef = useRef(sensitivity);

  useEffect(() => {
    saOffsetRef.current = saOffset;
  }, [saOffset]);

  useEffect(() => {
    tanpuraFirstStringRef.current = tanpuraFirstString;
  }, [tanpuraFirstString]);

  useEffect(() => {
    tanpuraVolumeRef.current = tanpuraVolume;
    if (tanpuraMasterGainRef.current) {
      tanpuraMasterGainRef.current.gain.value = (tanpuraVolume / 100) * 0.7;
    }
  }, [tanpuraVolume]);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  // Enumerate Microphones
  const populateMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === 'audioinput');
      setDevices(inputs);
    } catch (err) {
      console.warn('Could not list audio devices:', err);
    }
  }, []);

  useEffect(() => {
    populateMicrophones();
  }, [populateMicrophones]);

  // Normalized YIN / CMNDF Pitch Detector (captures quiet lapel & mobile mics cleanly)
  const detectPitch = (buf, sampleRate) => {
    const SIZE = buf.length;
    let rms = 0;
    let peak = 0;

    for (let i = 0; i < SIZE; i++) {
      const v = buf[i];
      rms += v * v;
      const absV = Math.abs(v);
      if (absV > peak) peak = absV;
    }
    rms = Math.sqrt(rms / SIZE);

    const gate = SENSITIVITY_THRESHOLDS[sensitivityRef.current] ?? 0.0008;
    if (rms < gate || peak === 0) {
      return { freq: -1, rms };
    }

    // Software peak normalization so low-gain raw mic captures never drop out
    const scale = 1 / peak;
    const norm = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      norm[i] = buf[i] * scale;
    }

    const minPeriod = Math.floor(sampleRate / 1400); // ~F6
    const maxPeriod = Math.min(Math.floor(sampleRate / 55), Math.floor(SIZE / 2) - 1); // ~A1
    const halfSize = Math.floor(SIZE / 2);
    if (maxPeriod <= minPeriod) return { freq: -1, rms };

    const diff = new Float32Array(maxPeriod + 1);
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      let sum = 0;
      for (let i = 0; i < halfSize; i++) {
        const delta = norm[i] - norm[i + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }

    const cmndf = new Float32Array(maxPeriod + 1);
    cmndf[0] = 1;
    let runningSum = 0;
    let globalMinTau = minPeriod;
    let globalMinVal = 1;

    for (let tau = 1; tau <= maxPeriod; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
      if (tau >= minPeriod && cmndf[tau] < globalMinVal) {
        globalMinVal = cmndf[tau];
        globalMinTau = tau;
      }
    }

    // First dip below 0.22 threshold, falling back to global harmonic minimum (< 0.45)
    let bestTau = -1;
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      if (cmndf[tau] < 0.22) {
        while (tau + 1 <= maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
    }

    if (bestTau === -1 && globalMinVal < 0.45) {
      bestTau = globalMinTau;
    }

    if (bestTau === -1) return { freq: -1, rms };

    // Parabolic interpolation for sub-cent precision
    let betterTau = bestTau;
    if (bestTau > minPeriod && bestTau < maxPeriod) {
      const s0 = cmndf[bestTau - 1];
      const s1 = cmndf[bestTau];
      const s2 = cmndf[bestTau + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (denom !== 0) {
        betterTau = bestTau + (s2 - s0) / denom;
      }
    }

    return { freq: sampleRate / betterTau, rms };
  };

  const freqToNoteInfo = (freq) => {
    const midiFloat = 69 + 12 * Math.log2(freq / 440);
    const midiRound = Math.round(midiFloat);
    const cents = Math.round((midiFloat - midiRound) * 100);
    const noteIndex = ((midiRound % 12) + 12) % 12;
    const octave = Math.floor(midiRound / 12) - 1;
    const western = `${WESTERN_NOTES[noteIndex]}${octave}`;

    const swaraIndex = (((noteIndex - saOffsetRef.current) % 12) + 12) % 12;
    const swara = SWARA_NAMES[swaraIndex];

    return { midiFloat, midiRound, cents, noteIndex, swaraIndex, western, swara };
  };

  // Draw Graphical Pitch Trace & Horizontal Swara Lines
  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width === 0 || height === 0) return;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const leftMargin = 76;
    const plotWidth = width - leftMargin - 14;
    const minMidi = minMidiRef.current;
    const maxMidi = maxMidiRef.current;
    const midiSpan = maxMidi - minMidi;

    const midiToY = (m) => {
      const ratio = (m - minMidi) / midiSpan;
      return height - 22 - ratio * (height - 44);
    };

    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textBaseline = 'middle';

    for (let m = Math.ceil(minMidi); m <= Math.floor(maxMidi); m++) {
      const y = midiToY(m);
      const noteIndex = ((m % 12) + 12) % 12;
      const octave = Math.floor(m / 12) - 1;
      const swaraIndex = (((noteIndex - saOffsetRef.current) % 12) + 12) % 12;
      const swaraName = SWARA_NAMES[swaraIndex];
      const westernName = `${WESTERN_NOTES[noteIndex]}${octave}`;

      const isSa = swaraIndex === 0;
      const isPa = swaraIndex === 7;
      const isShuddha = [0, 2, 4, 5, 7, 9, 11].includes(swaraIndex);

      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(width - 14, y);

      if (isSa) {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.7)';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([]);
      } else if (isPa) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
        ctx.lineWidth = 1.3;
        ctx.setLineDash([]);
      } else if (isShuddha) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = isSa ? '#c084fc' : isPa ? '#60a5fa' : isShuddha ? '#d4d4d8' : '#71717a';
      ctx.textAlign = 'left';
      ctx.fillText(swaraName, 12, y);

      ctx.fillStyle = '#71717a';
      ctx.textAlign = 'right';
      ctx.fillText(westernName, leftMargin - 10, y);
    }

    // Vertical Y-axis divider
    ctx.beginPath();
    ctx.moveTo(leftMargin, 10);
    ctx.lineTo(leftMargin, height - 10);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pitch Trace Curve
    const history = pitchHistoryRef.current;
    const stepX = plotWidth / (MAX_POINTS - 1);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      if (!prev || !curr) continue;
      if (Math.abs(curr.midiFloat - prev.midiFloat) > 7) continue;

      const x1 = leftMargin + (i - 1) * stepX;
      const y1 = midiToY(prev.midiFloat);
      const x2 = leftMargin + i * stepX;
      const y2 = midiToY(curr.midiFloat);

      const absCents = Math.abs(curr.cents);
      if (absCents <= 12) {
        ctx.strokeStyle = '#10b981';
      } else if (absCents <= 28) {
        ctx.strokeStyle = '#f59e0b';
      } else {
        ctx.strokeStyle = '#ef4444';
      }

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Glowing Playhead Dot
    const latest = history[history.length - 1];
    if (latest) {
      const headX = leftMargin + (MAX_POINTS - 1) * stepX;
      const headY = midiToY(latest.midiFloat);
      const absCents = Math.abs(latest.cents);
      const dotColor = absCents <= 12 ? '#10b981' : absCents <= 28 ? '#f59e0b' : '#ef4444';

      ctx.beginPath();
      ctx.arc(headX, headY, 6, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(headX, headY, 12, 0, Math.PI * 2);
      ctx.fillStyle = absCents <= 12 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)';
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    drawGraph();
    window.addEventListener('resize', drawGraph);
    return () => window.removeEventListener('resize', drawGraph);
  }, [drawGraph, saOffset]);

  // Clean up pitch detector audio resources
  const stopAllAudio = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setIsRunning(false);
    setIsDemoRunning(false);
  }, []);

  // Tanpura Drone Plucker Synthesis
  const stopTanpura = useCallback(() => {
    if (tanpuraTimerRef.current) {
      clearInterval(tanpuraTimerRef.current);
      tanpuraTimerRef.current = null;
    }
    if (tanpuraCtxRef.current) {
      tanpuraCtxRef.current.close().catch(() => {});
      tanpuraCtxRef.current = null;
    }
    tanpuraMasterGainRef.current = null;
    setIsTanpuraRunning(false);
    setActivePluckIndex(-1);
  }, []);

  // Screen Wake Lock: keeps device screen awake while tuning or singing
  useEffect(() => {
    requestScreenWakeLock().catch(() => {});
    return () => {
      releaseScreenWakeLock();
    };
  }, []);

  useEffect(() => {
    return () => {
      stopAllAudio();
      stopTanpura();
    };
  }, [stopAllAudio, stopTanpura]);

  // Plucks an acoustic-simulated Tanpura string with harmonic buzz and exponential decay
  const pluckString = (ctx, masterGain, freq, stringIdx) => {
    if (!ctx || ctx.state === 'closed') return;
    const now = ctx.currentTime;

    // 1. Primary string oscillator (Triangle wave for pure fundamental resonance)
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    // 2. Secondary string oscillator (Sawtooth wave with high-cut filter for rich jawari buzz)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq, now);

    // 3. Jawari resonance filter (body resonance)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(1800, freq * 7), now);
    filter.Q.setValueAtTime(2.5, now);

    // 4. String Gain Envelope (Fast attack ~35ms, gentle sustain, smooth exponential decay ~4.2s)
    const stringGain = ctx.createGain();
    stringGain.gain.setValueAtTime(0.0001, now);
    stringGain.gain.exponentialRampToValueAtTime(0.22, now + 0.035);
    stringGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);

    // Secondary oscillator gain (softer, providing jawari shimmer)
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.28;

    osc1.connect(stringGain);
    osc2.connect(filter);
    filter.connect(osc2Gain);
    osc2Gain.connect(stringGain);
    stringGain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 4.3);
    osc2.stop(now + 4.3);

    setActivePluckIndex(stringIdx);
  };

  // Toggle Background Tanpura Drone (Sa-Pa / Sa-Ma plucked string cycle)
  const toggleTanpura = async () => {
    if (isTanpuraRunning) {
      stopTanpura();
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      tanpuraCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = (tanpuraVolumeRef.current / 100) * 0.7;
      masterGain.connect(ctx.destination);
      tanpuraMasterGainRef.current = masterGain;

      let step = 0;
      const playTanpuraPluck = () => {
        const rootFreq = getRootFreq(saOffsetRef.current);
        const firstStr = tanpuraFirstStringRef.current;

        let str1Freq;
        if (firstStr === 'Ma') {
          str1Freq = rootFreq * 0.6674; // Mandra Ma (4th)
        } else if (firstStr === 'Ni') {
          str1Freq = rootFreq * 0.9438; // Mandra Ni (major 7th)
        } else {
          str1Freq = rootFreq * 0.74915; // Mandra Pa (5th)
        }

        const strings = [
          str1Freq,              // String 1: Pa / Ma / Ni
          rootFreq,              // String 2: Jodi Sa 1
          rootFreq * 1.002,      // String 3: Jodi Sa 2 (jawari shimmer detune)
          rootFreq * 0.5         // String 4: Kharja Sa (Low octave)
        ];

        const stringIdx = step % 4;
        pluckString(ctx, masterGain, strings[stringIdx], stringIdx);
        step++;
      };

      playTanpuraPluck();
      tanpuraTimerRef.current = setInterval(playTanpuraPluck, 1250); // 1.25s per string (5s complete cycle)

      setIsTanpuraRunning(true);
    } catch (err) {
      console.warn("Could not start Tanpura drone:", err);
      stopTanpura();
    }
  };

  // Animation & Audio Sampling Loop
  const startRenderLoop = useCallback(() => {
    const tick = () => {
      const analyser = analyserRef.current;
      const audioCtx = audioCtxRef.current;
      const buf = timeDomainBufRef.current;
      if (!analyser || !audioCtx || !buf) return;

      analyser.getFloatTimeDomainData(buf);
      const { freq, rms } = detectPitch(buf, audioCtx.sampleRate);
      const signalPct = Math.min(100, Math.round(rms * 1800));

      if (freq > 0) {
        const info = freqToNoteInfo(freq);
        pitchHistoryRef.current.push(info);
        if (pitchHistoryRef.current.length > MAX_POINTS) {
          pitchHistoryRef.current.shift();
        }

        // Smooth octave auto-scroll
        if (info.midiFloat > maxMidiRef.current - 2.5) {
          maxMidiRef.current += (info.midiFloat + 3 - maxMidiRef.current) * 0.15;
          minMidiRef.current = maxMidiRef.current - 24;
        } else if (info.midiFloat < minMidiRef.current + 2.5) {
          minMidiRef.current += (info.midiFloat - 3 - minMidiRef.current) * 0.15;
          maxMidiRef.current = minMidiRef.current + 24;
        }

        setReadout({
          swara: info.swara,
          western: info.western,
          freq: freq.toFixed(1),
          cents: info.cents,
          signalPct
        });
      } else {
        pitchHistoryRef.current.push(null);
        if (pitchHistoryRef.current.length > MAX_POINTS) {
          pitchHistoryRef.current.shift();
        }
        setReadout((prev) => ({
          ...prev,
          freq: '0.0',
          signalPct
        }));
      }

      drawGraph();
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [drawGraph]);

  // Start Live Microphone Capture with fail-safe fallback
  const handleStartMic = async () => {
    // Stop any active demo or previous capture (Tanpura drone can stay running)
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setIsDemoRunning(false);
    setErrorMsg('');

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      let stream = null;
      try {
        const audioConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        };
        if (selectedDeviceId) {
          audioConstraints.deviceId = { ideal: selectedDeviceId };
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false
        });
        setSampleRateLabel(`${(ctx.sampleRate / 1000).toFixed(1)}kHz Raw Studio Audio`);
      } catch (rawErr) {
        console.warn('Raw audio constraints rejected, falling back to standard audio:', rawErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: selectedDeviceId ? { deviceId: { ideal: selectedDeviceId } } : true,
            video: false
          });
          setSampleRateLabel(`${(ctx.sampleRate / 1000).toFixed(1)}kHz Standard Audio`);
        } catch (fallbackErr) {
          throw fallbackErr;
        }
      }

      mediaStreamRef.current = stream;

      await populateMicrophones();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      analyserRef.current = analyser;
      timeDomainBufRef.current = new Float32Array(analyser.fftSize);

      setIsRunning(true);
      startRenderLoop();
    } catch (err) {
      stopAllAudio();
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow mic access in browser settings.'
          : `Could not start microphone: ${err.message}`
      );
    }
  };

  // Start Built-In Sargam Scale Synthesizer (for silent testing)
  const handleStartDemo = async () => {
    stopAllAudio();
    setErrorMsg('');

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;

      osc.type = 'triangle';
      gain.gain.value = 0.08;

      osc.connect(gain);
      gain.connect(analyser);
      gain.connect(ctx.destination);
      osc.start();

      analyserRef.current = analyser;
      timeDomainBufRef.current = new Float32Array(analyser.fftSize);

      // Bilawal Thaat ascending & descending intervals from Sa
      const scaleIntervals = [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0];
      let step = 0;

      const playStep = () => {
        const rootMidi = 60 + saOffsetRef.current; // Middle octave Sa
        const midi = rootMidi + scaleIntervals[step % scaleIntervals.length];
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.03);
        step++;
      };

      playStep();
      demoTimerRef.current = setInterval(playStep, 650);

      setSampleRateLabel('Demo Scale Synthesizer');
      setIsDemoRunning(true);
      startRenderLoop();
    } catch (err) {
      stopAllAudio();
      setErrorMsg(`Demo synthesizer error: ${err.message}`);
    }
  };

  const handleClear = () => {
    pitchHistoryRef.current.fill(null);
    drawGraph();
  };

  const absCents = Math.abs(readout.cents);
  const accuracyColor =
    readout.freq === '0.0'
      ? 'text-purple-400'
      : absCents <= 12
        ? 'text-emerald-400'
        : absCents <= 28
          ? 'text-amber-400'
          : 'text-red-400';

  const needleBg =
    absCents <= 12 ? 'bg-emerald-500' : absCents <= 28 ? 'bg-amber-500' : 'bg-red-500';

  const clampedCents = Math.max(-50, Math.min(50, readout.cents));
  const needleLeftPct = 50 + clampedCents;

  const currentSaLabel = SA_OPTIONS.find((s) => s.value === saOffset)?.label || 'Kali 5';

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-950 text-gray-100 overflow-hidden select-none">
      {/* Header Bar */}
      <header className="bg-gray-900/90 border-b border-gray-800 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              stopAllAudio();
              stopTanpura();
              navigate(-1);
            }}
            className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700/60 transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="w-8 h-8 rounded-xl bg-purple-900/40 text-purple-400 border border-purple-500/30 flex items-center justify-center">
            <Music className="w-4 h-4" />
          </div>

          <div>
            <h1 className="text-sm sm:text-base font-bold text-white leading-tight flex items-center gap-1.5">
              <span>Alaapi Swara & Pitch Monitor</span>
            </h1>
            <p className="text-[11px] text-gray-400">
              {sampleRateLabel} • Intonation Meter
            </p>
          </div>
        </div>

        {/* Top Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Microphone device selection */}
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              if (isRunning) handleStartMic();
            }}
            className="bg-gray-900 border border-gray-700 text-gray-200 text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-purple-500 max-w-[140px] sm:max-w-[180px] truncate"
            title="Microphone Input"
          >
            <option value="">Default Mic</option>
            {devices.map((d, idx) => (
              <option key={d.deviceId || idx} value={d.deviceId}>
                {d.label || `Mic ${idx + 1}`}
              </option>
            ))}
          </select>

          {/* Root Pitch (Sa) Selection */}
          <select
            value={saOffset}
            onChange={(e) => setSaOffset(Number(e.target.value))}
            className="bg-gray-900 border border-purple-500/50 text-purple-300 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-purple-400"
            title="Select Root Scale (Sa)"
          >
            {SA_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Sensitivity */}
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-xl px-2 py-1">
            <Sliders className="w-3.5 h-3.5 text-gray-400 mr-1" />
            <select
              value={sensitivity}
              onChange={(e) => setSensitivity(e.target.value)}
              className="bg-transparent text-xs font-semibold text-gray-200 focus:outline-none"
              title="Mic Sensitivity Gate"
            >
              <option value="ultra" className="bg-gray-900">Sens: Ultra</option>
              <option value="high" className="bg-gray-900">Sens: High</option>
              <option value="normal" className="bg-gray-900">Sens: Normal</option>
            </select>
          </div>

          {/* Clear Graph Button */}
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold text-gray-200 flex items-center gap-1.5 transition-colors"
            title="Clear Graph History"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          {/* Microphone Toggle Button */}
          {isRunning ? (
            <button
              type="button"
              onClick={stopAllAudio}
              className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-red-600/25 transition-all"
            >
              <MicOff className="w-3.5 h-3.5" />
              Stop Mic
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartMic}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-600/30 transition-all"
            >
              <Mic className="w-3.5 h-3.5" />
              Start Mic
            </button>
          )}
        </div>
      </header>

      {/* Tanpura Drone Toolbar */}
      <div className="bg-gray-950 px-3 sm:px-5 py-2 border-b border-gray-800/80 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tanpura Drone Toggle Button */}
          <button
            type="button"
            onClick={toggleTanpura}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              isTanpuraRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                : 'bg-gray-900 hover:bg-gray-850 text-amber-300 border border-amber-500/30'
            }`}
            title={isTanpuraRunning ? "Stop Tanpura Drone" : "Start Indian Classical Tanpura Drone"}
          >
            <Radio className={`w-3.5 h-3.5 ${isTanpuraRunning ? 'animate-pulse text-white' : 'text-amber-400'}`} />
            <span>{isTanpuraRunning ? 'Tanpura: ON' : 'Tanpura Drone'}</span>
          </button>

          {/* First String Selector: Pa / Ma / Ni */}
          <div className="flex items-center gap-1 text-xs bg-gray-900 border border-gray-800 rounded-xl px-2 py-1">
            <span className="text-gray-400 font-medium text-[11px]">1st String:</span>
            <select
              value={tanpuraFirstString}
              onChange={(e) => setTanpuraFirstString(e.target.value)}
              className="bg-transparent font-bold text-amber-300 text-xs focus:outline-none"
              title="First String Tuning (Pa, Ma, or Ni)"
            >
              <option value="Pa" className="bg-gray-900">Pa (Pancham)</option>
              <option value="Ma" className="bg-gray-900">Ma (Madhyam)</option>
              <option value="Ni" className="bg-gray-900">Ni (Nishad)</option>
            </select>
          </div>

          {/* Tanpura String Animation Badges */}
          <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono">
            {[
              { idx: 0, label: tanpuraFirstString },
              { idx: 1, label: 'Sa' },
              { idx: 2, label: 'Sa' },
              { idx: 3, label: 'Kharja' }
            ].map((str) => {
              const isPlucking = isTanpuraRunning && activePluckIndex === str.idx;
              return (
                <span
                  key={str.idx}
                  className={`px-2 py-0.5 rounded-md border transition-all ${
                    isPlucking
                      ? 'bg-amber-500 text-black font-bold border-amber-300 scale-105 shadow-sm shadow-amber-400/50'
                      : 'bg-gray-900 text-gray-400 border-gray-800'
                  }`}
                >
                  {str.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Tanpura Drone Volume Slider */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTanpuraVolume((v) => (v > 0 ? 0 : 45))}
            className="text-gray-400 hover:text-amber-300 transition-colors"
            title={tanpuraVolume === 0 ? "Unmute Drone" : "Mute Drone"}
          >
            {tanpuraVolume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            )}
          </button>
          <span className="text-[11px] text-gray-400 font-medium hidden xs:inline">Drone:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={tanpuraVolume}
            onChange={(e) => setTanpuraVolume(Number(e.target.value))}
            className="w-20 sm:w-28 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            title={`Tanpura Drone volume: ${tanpuraVolume}%`}
          />
          <span className="text-[11px] font-mono text-gray-300 w-7 text-right">{tanpuraVolume}%</span>
        </div>
      </div>

      {/* Telemetry Readout Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 bg-gray-950 border-b border-gray-800/80 shrink-0">
        {/* Swara Card */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl px-3.5 py-2 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              Sargam Swara
            </span>
            <Volume2 className="w-3 h-3 text-gray-500" />
          </div>
          <div className={`text-xl sm:text-2xl font-extrabold tracking-tight ${accuracyColor}`}>
            {readout.swara}
          </div>
          <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-purple-500 transition-all duration-75"
              style={{ width: `${readout.signalPct}%` }}
            />
          </div>
        </div>

        {/* Western Note Card */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl px-3.5 py-2 flex flex-col justify-center">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">
            Western Note
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            {readout.western}
          </div>
        </div>

        {/* Frequency Card */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl px-3.5 py-2 flex flex-col justify-center">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">
            Frequency
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-baseline gap-1">
            <span>{readout.freq}</span>
            <span className="text-xs font-semibold text-gray-400">Hz</span>
          </div>
        </div>

        {/* Intonation Cents Card */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-2xl px-3.5 py-2 flex flex-col justify-center">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">
            Intonation (Cents)
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-baseline gap-1">
            <span>{readout.cents > 0 ? `+${readout.cents}` : readout.cents}</span>
            <span className="text-xs font-semibold text-gray-400">cents</span>
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full mt-1.5 relative overflow-hidden">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white -translate-x-1/2 z-10" />
            <div
              className={`absolute top-0 bottom-0 w-3 rounded-full -translate-x-1/2 transition-all duration-75 ${needleBg}`}
              style={{ left: `${needleLeftPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Graphical Pitch Canvas */}
      <div className="relative flex-1 w-full overflow-hidden bg-gray-950">
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Hero Overlay before Mic is started */}
        {!isRunning && !isDemoRunning && (
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-5 text-center z-10">
            <div className="w-12 h-12 rounded-2xl bg-purple-900/40 border border-purple-500/30 text-purple-400 flex items-center justify-center mb-3">
              <Mic className="w-6 h-6" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mb-1.5">
              Vocal & Instrument Swara Monitor
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 max-w-md mb-5 leading-relaxed">
              Captures raw audio to analyze your intonation. The grid aligns dynamically to your selected{' '}
              <strong className="text-purple-300">{currentSaLabel}</strong> scale.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleStartMic}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all active:scale-95"
              >
                <Mic className="w-4 h-4" />
                Start Microphone
              </button>

              <button
                type="button"
                onClick={handleStartDemo}
                className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-semibold flex items-center gap-2 transition-colors active:scale-95"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                Test Demo Scale
              </button>

              <button
                type="button"
                onClick={toggleTanpura}
                className={`px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-all active:scale-95 ${
                  isTanpuraRunning
                    ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/30'
                    : 'bg-gray-800 hover:bg-gray-750 text-amber-300 border-amber-500/40'
                }`}
              >
                <Radio className="w-4 h-4" />
                {isTanpuraRunning ? 'Stop Tanpura' : 'Play Tanpura Drone'}
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 max-w-md px-4 py-2.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Demo Scale Synthesizer Running Notice */}
        {isDemoRunning && (
          <div className="absolute bottom-4 right-4 z-10">
            <button
              type="button"
              onClick={stopAllAudio}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-red-600/30"
            >
              <Square className="w-3.5 h-3.5" />
              Stop Demo Scale
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
