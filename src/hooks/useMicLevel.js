import { useState, useEffect } from 'react';
import { localStream } from '../services/media';

/**
 * Local Mic VU Level Analyzer (0..100) - Sensitive Studio Vocal Dynamics
 * Analyzes audio tracks in real-time, mapping vocal presence (100Hz-3800Hz)
 * and RMS energy into smooth VU needle dynamics.
 */
export function useMicLevel(activeAudioStream, isMuted) {
  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    const streamToAnalyze = activeAudioStream || localStream;
    if (isMuted || !streamToAnalyze) {
      setMicLevel(0);
      return;
    }

    const audioTracks = streamToAnalyze.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      setMicLevel(0);
      return;
    }

    let isCancelled = false;
    let micAudioCtx = null;
    let animFrame = null;
    let currentMeterLevel = 0;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      micAudioCtx = new AudioContextClass();

      // Immediate attempt to resume
      if (micAudioCtx.state === 'suspended') {
        micAudioCtx.resume().catch(() => { });
      }

      // Resume context on any user interaction (pointerdown, touchstart, click, keydown)
      const resumeAudioCtx = () => {
        if (micAudioCtx && micAudioCtx.state === 'suspended') {
          micAudioCtx.resume().catch(() => { });
        }
      };

      window.addEventListener('pointerdown', resumeAudioCtx);
      window.addEventListener('touchstart', resumeAudioCtx);
      window.addEventListener('click', resumeAudioCtx);
      window.addEventListener('keydown', resumeAudioCtx);

      // Create an audio-only stream containing just the microphone track
      const audioStream = new MediaStream([audioTracks[0]]);
      const source = micAudioCtx.createMediaStreamSource(audioStream);

      const analyser = micAudioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.25;
      source.connect(analyser);

      // Keep the audio graph processing in Chromium by connecting to a silent gain node
      const silentGain = micAudioCtx.createGain();
      silentGain.gain.value = 0;
      analyser.connect(silentGain);
      silentGain.connect(micAudioCtx.destination);

      const timeData = new Uint8Array(analyser.fftSize);
      const freqData = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (isCancelled) return;

        if (micAudioCtx.state === 'suspended') {
          micAudioCtx.resume().catch(() => { });
        }

        // 1. Time-domain RMS calculation
        analyser.getByteTimeDomainData(timeData);
        let sumSquares = 0;
        let peakAmplitude = 0;
        for (let i = 0; i < timeData.length; i++) {
          const norm = (timeData[i] - 128) / 128;
          sumSquares += norm * norm;
          const abs = Math.abs(norm);
          if (abs > peakAmplitude) peakAmplitude = abs;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);

        // 2. Frequency-domain energy calculation in vocal presence band (100Hz - 3800Hz)
        analyser.getByteFrequencyData(freqData);
        let maxFreqVal = 0;
        let speechBandSum = 0;
        const maxBin = Math.min(freqData.length, 42);
        for (let i = 1; i < maxBin; i++) {
          speechBandSum += freqData[i];
          if (freqData[i] > maxFreqVal) maxFreqVal = freqData[i];
        }
        const speechAvg = speechBandSum / Math.max(1, maxBin - 1);

        // 3. Sensitive Vocal Studio dBFS Mapping
        // With raw 48kHz audio (echoCancellation: false, autoGainControl: false),
        // quiet whisper RMS is ~0.005, speech RMS is ~0.02..0.06, singing is ~0.08..0.35
        let targetLevel = 0;
        if (rms > 0.001 || speechAvg > 3) {
          // Range: -50 dBFS (whisper) to 0 dBFS (peak) mapped to 0..100%
          const db = 20 * Math.log10(Math.max(rms, 0.001));
          const dbPercent = Math.max(0, Math.min(100, Math.round(((db + 50) / 50) * 100)));
          const freqPercent = Math.max(0, Math.min(100, Math.round((speechAvg / 110) * 100)));
          const peakPercent = Math.max(0, Math.min(100, Math.round(peakAmplitude * 110)));

          targetLevel = Math.max(
            dbPercent,
            Math.round(freqPercent * 0.65 + peakPercent * 0.35)
          );
        }

        // Smooth decay so meter animates smoothly like a professional VU needle
        if (targetLevel >= currentMeterLevel) {
          currentMeterLevel = targetLevel; // Instant attack
        } else {
          currentMeterLevel = Math.max(0, Math.round(currentMeterLevel * 0.84)); // Smooth decay
        }

        setMicLevel(currentMeterLevel);

        animFrame = requestAnimationFrame(updateMeter);
      };

      updateMeter();

      return () => {
        isCancelled = true;
        if (animFrame) cancelAnimationFrame(animFrame);
        window.removeEventListener('pointerdown', resumeAudioCtx);
        window.removeEventListener('touchstart', resumeAudioCtx);
        window.removeEventListener('click', resumeAudioCtx);
        window.removeEventListener('keydown', resumeAudioCtx);
        try {
          source.disconnect();
          analyser.disconnect();
          silentGain.disconnect();
          micAudioCtx.close();
        } catch (e) { }
        setMicLevel(0);
      };
    } catch (e) {
      console.warn("Could not start local mic level analyzer:", e);
    }
  }, [activeAudioStream, isMuted]);

  return micLevel;
}
