import React, { useState, useEffect, useRef } from 'react';
import {
  getPreferredDevices,
  getAudioSettings
} from '../../services/media';
import {
  PhoneCall,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Mic,
  Camera,
  Volume2,
  Headphones,
  VideoOff
} from 'lucide-react';

export function TestCallTab() {
  const [testState, setTestState] = useState('idle'); // 'idle' | 'recording' | 'playing'
  const [countdown, setCountdown] = useState(5);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null);
  const [micLevel, setMicLevel] = useState(0);

  const previewVideoRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animFrameRef = useRef(null);

  const cleanupAll = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      try { recorderRef.current.stop(); } catch (e) {}
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
      streamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setMicLevel(0);
  };

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, []);

  // Start 5-second acoustic echo recording test
  const startTestRecording = async () => {
    cleanupAll();
    setRecordedBlobUrl(null);
    setTestState('recording');
    setCountdown(5);
    chunksRef.current = [];

    const { camId, micId } = getPreferredDevices();
    const dsp = getAudioSettings();

    const videoConstraints = camId
      ? { deviceId: { exact: camId }, width: { ideal: 640 }, height: { ideal: 480 } }
      : true;

    const audioConstraints = {
      echoCancellation: Boolean(dsp?.echoCancellation),
      noiseSuppression: Boolean(dsp?.noiseSuppression),
      autoGainControl: Boolean(dsp?.autoGainControl)
    };
    if (micId) {
      audioConstraints.deviceId = { exact: micId };
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
    } catch (e) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: audioConstraints
        });
      } catch (err2) {
        alert("Could not access microphone or camera for echo test: " + err2.message);
        setTestState('idle');
        return;
      }
    }

    streamRef.current = stream;

    // Attach to preview video element
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = stream;
      previewVideoRef.current.play().catch(() => {});
    }

    // Setup VU meter
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!streamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn("VU Meter error in test call:", e);
    }

    // Setup MediaRecorder
    let mimeType = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : '';
    }

    const recorderOptions = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(stream, recorderOptions);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedBlobUrl(url);
      setTestState('playing');

      // Stop capturing live stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
        audioCtxRef.current = null;
      }
    };

    recorder.start(200);

    // 5-second countdown timer
    let remaining = 5;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }
    }, 1000);
  };

  const handleStopOrReset = () => {
    cleanupAll();
    setTestState('idle');
    setRecordedBlobUrl(null);
  };

  return (
    <div className="space-y-6">
      {/* Description Banner */}
      <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-4 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-purple-900/60 text-purple-300 border border-purple-500/30 shrink-0 mt-0.5">
          <PhoneCall className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-xs">
          <h4 className="font-semibold text-purple-200">Acoustic Loopback Echo Test</h4>
          <p className="text-gray-400 leading-relaxed">
            Records your microphone and camera for <strong>5 seconds</strong> and immediately plays it back through your speakers.
            This gives you the exact sound and picture quality your students and teachers will receive.
          </p>
        </div>
      </div>

      {/* Main Testing Box */}
      <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-5 space-y-4">
        {testState === 'idle' && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
              <Headphones className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Ready for 5-Second Test</h4>
              <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                Sing a vocal phrase or play an instrument note during the 5-second recording to inspect acoustic tone.
              </p>
            </div>
            <button
              type="button"
              onClick={startTestRecording}
              className="py-3 px-6 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-purple-900/30 transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start 5-Second Acoustic Test</span>
            </button>
          </div>
        )}

        {testState === 'recording' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-red-400 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                Recording Voice & Video Sample ({countdown}s left)...
              </span>
              <button
                type="button"
                onClick={handleStopOrReset}
                className="text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <div className="relative aspect-video max-w-md mx-auto bg-black rounded-xl overflow-hidden border border-red-500/40 shadow-lg">
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur border border-red-500/60 flex items-center justify-center text-2xl font-mono font-bold text-red-400 shadow-2xl">
                  {countdown}
                </div>
              </div>
            </div>

            {/* Live Mic VU during recording */}
            <div className="max-w-md mx-auto space-y-1">
              <div className="flex justify-between text-[11px] text-gray-400">
                <span>Mic Pickup</span>
                <span className="font-mono">{micLevel}%</span>
              </div>
              <div className="h-2 w-full bg-gray-900 rounded-full overflow-hidden border border-gray-800">
                <div
                  style={{ width: `${micLevel}%` }}
                  className="h-full bg-emerald-500 transition-all duration-75"
                />
              </div>
            </div>
          </div>
        )}

        {testState === 'playing' && recordedBlobUrl && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Playback: Listen to your voice loopback
              </span>
              <button
                type="button"
                onClick={startTestRecording}
                className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Record Again</span>
              </button>
            </div>

            <div className="relative aspect-video max-w-md mx-auto bg-black rounded-xl overflow-hidden border border-emerald-500/40 shadow-2xl">
              <video
                ref={playbackVideoRef}
                src={recordedBlobUrl}
                autoPlay
                controls
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            <p className="text-[11px] text-gray-400 text-center max-w-md mx-auto">
              If the sound is clear and dynamic without muffling or choppy artifacts, your acoustic hardware setup is optimal for live singing classes!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
