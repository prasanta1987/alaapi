import React, { useState, useEffect, useRef } from 'react';
import {
  getPreferredDevices,
  savePreferredDevices
} from '../services/media';
import {
  X,
  Camera,
  Mic,
  Volume2,
  Video,
  VideoOff,
  MicOff,
  Check,
  Play,
  Square,
  Sparkles,
  PhoneCall,
  RotateCcw,
  Headphones,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export function DeviceSetupModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('devices'); // 'devices' | 'testcall'

  // Device lists
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);

  // Selected device IDs
  const [selectedCamId, setSelectedCamId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  // Live testing states
  const [micLevel, setMicLevel] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test Call (Loopback recorder) states
  const [testCallState, setTestCallState] = useState('idle'); // 'idle' | 'recording' | 'playing'
  const [countdown, setCountdown] = useState(5);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null);

  // Refs for cleanup and testing
  const videoPreviewRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const activeStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // Initialize and enumerate hardware devices
  useEffect(() => {
    if (!isOpen) {
      stopAllMedia();
      return;
    }

    const preferred = getPreferredDevices();

    const enumerate = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          return;
        }

        // Request temporary permissions to get device labels if not yet granted
        let tempStream = null;
        try {
          tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (e) {
          // If both fail, try audio only
          try {
            tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (e2) {}
        }

        const devices = await navigator.mediaDevices.enumerateDevices();

        // Release temp stream
        if (tempStream) {
          tempStream.getTracks().forEach(t => t.stop());
        }

        const videoIns = devices.filter(d => d.kind === 'videoinput');
        const audioIns = devices.filter(d => d.kind === 'audioinput');
        const audioOuts = devices.filter(d => d.kind === 'audiooutput');

        setCameras(videoIns);
        setMics(audioIns);
        setSpeakers(audioOuts);

        // Pick preferred or first available
        const camToUse = videoIns.some(c => c.deviceId === preferred.cameraId)
          ? preferred.cameraId
          : (videoIns[0]?.deviceId || '');
        const micToUse = audioIns.some(m => m.deviceId === preferred.micId)
          ? preferred.micId
          : (audioIns[0]?.deviceId || '');
        const speakerToUse = audioOuts.some(s => s.deviceId === preferred.speakerId)
          ? preferred.speakerId
          : (audioOuts[0]?.deviceId || '');

        setSelectedCamId(camToUse);
        setSelectedMicId(micToUse);
        setSelectedSpeakerId(speakerToUse);

        // Start hardware preview with chosen devices
        startHardwarePreview(camToUse, micToUse);
      } catch (err) {
        console.warn("Could not enumerate hardware devices:", err);
      }
    };

    enumerate();

    return () => {
      stopAllMedia();
    };
  }, [isOpen]);

  // Clean up all active streams and audio contexts
  const stopAllMedia = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => t.stop());
      activeStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setCameraActive(false);
    setMicLevel(0);
    setTestCallState('idle');
  };

  // Starts or updates preview stream for camera and microphone
  const startHardwarePreview = async (camId, micId) => {
    try {
      // Stop existing stream first
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(t => t.stop());
        activeStreamRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      const constraints = {};
      if (camId) {
        constraints.video = { deviceId: { exact: camId }, width: { ideal: 640 }, height: { ideal: 480 } };
      } else {
        constraints.video = true;
      }

      if (micId) {
        constraints.audio = { deviceId: { exact: micId } };
      } else {
        constraints.audio = true;
      }

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback: try individual media types
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio });
        } catch (audioErr) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: constraints.video });
          } catch (vidErr) {
            console.warn("Could not obtain audio or video for preview:", vidErr);
          }
        }
      }

      if (!stream) return;
      activeStreamRef.current = stream;

      // Attach video preview
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(e => console.warn("Preview play prevented:", e));
        setCameraActive(true);
      } else {
        setCameraActive(false);
      }

      // Attach audio analyzer for VU meter
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const tickMeter = () => {
          if (!activeStreamRef.current) return;
          analyser.getByteFrequencyData(dataArray);

          // Calculate average volume level
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          // Scale non-linearly for smooth visual VU meter
          const scaled = Math.min(100, Math.round((avg / 128) * 100));
          setMicLevel(scaled);

          animFrameRef.current = requestAnimationFrame(tickMeter);
        };

        tickMeter();
      }
    } catch (e) {
      console.warn("Hardware preview error:", e);
    }
  };

  // Change camera
  const handleCamSelect = (camId) => {
    setSelectedCamId(camId);
    startHardwarePreview(camId, selectedMicId);
  };

  // Change microphone
  const handleMicSelect = (micId) => {
    setSelectedMicId(micId);
    startHardwarePreview(selectedCamId, micId);
  };

  // Play Harmonic Chime to Test Speakers/Headphones
  const handlePlayTestChime = () => {
    if (isPlayingChime) return;
    setIsPlayingChime(true);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();

      // Play C-major acoustic chord (C5, E5, G5)
      const chord = [523.25, 659.25, 783.99];
      const now = ctx.currentTime;

      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + 1.25);
      });

      setTimeout(() => {
        setIsPlayingChime(false);
        try { ctx.close(); } catch (e) {}
      }, 1300);
    } catch (e) {
      console.warn("Error playing chime:", e);
      setIsPlayingChime(false);
    }
  };

  // Start 5-Second Test Call Recording
  const handleStartTestCall = () => {
    if (!activeStreamRef.current) return;
    if (testCallState === 'recording') return;

    recordedChunksRef.current = [];
    setRecordedBlobUrl(null);
    setTestCallState('recording');
    setCountdown(5);

    try {
      const recorder = new MediaRecorder(activeStreamRef.current);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedBlobUrl(url);
        setTestCallState('playing');
      };

      recorder.start();

      let secondsLeft = 5;
      const interval = setInterval(() => {
        secondsLeft -= 1;
        setCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          clearInterval(interval);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 1000);
    } catch (err) {
      console.warn("Could not start MediaRecorder for test call:", err);
      setTestCallState('idle');
    }
  };

  // Save preferred devices
  const handleSavePreferences = () => {
    savePreferredDevices({
      cameraId: selectedCamId,
      micId: selectedMicId,
      speakerId: selectedSpeakerId
    });
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 900);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 animate-fadeIn select-none">
      <div className="bg-gray-900 border border-gray-700/80 rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden relative">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-900/50 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Audio & Video Device Setup
              </h3>
              <p className="text-[11px] text-gray-400">
                Test your camera, microphone, and verify sound before entering a class.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 pb-1 border-b border-gray-800/80 flex items-center gap-2 shrink-0 bg-gray-950/20">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'devices'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Hardware Diagnostics
          </button>
          <button
            onClick={() => setActiveTab('testcall')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'testcall'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            Interactive Test Call (Echo Check)
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'devices' ? (
            <>
              {/* 1. Camera Section */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-gray-950/60 border border-gray-800/90 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-purple-400" />
                    <span className="text-xs sm:text-sm font-bold text-gray-200">Camera Device</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    cameraActive
                      ? 'bg-green-950/50 text-green-400 border-green-500/30'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>
                    {cameraActive ? '● Live Preview' : 'No Video'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1 font-medium">Select Video Source</label>
                    <select
                      value={selectedCamId}
                      onChange={(e) => handleCamSelect(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      {cameras.length === 0 && <option value="">No Camera Detected</option>}
                      {cameras.map((c) => (
                        <option key={c.deviceId} value={c.deviceId}>
                          {c.label || `Camera (${c.deviceId.substring(0, 6)}...)`}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {cameras.length > 0 ? `${cameras.length} camera(s) available` : 'Connect a webcam to enable video'}
                    </p>
                  </div>

                  {/* Live Video Preview Box */}
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-700/80 flex items-center justify-center shadow-inner">
                    <video
                      ref={videoPreviewRef}
                      className={`w-full h-full object-cover transform scale-x-[-1] ${cameraActive ? '' : 'hidden'}`}
                      autoPlay
                      playsInline
                      muted
                    />
                    {!cameraActive && (
                      <div className="flex flex-col items-center justify-center p-3 text-center text-gray-500">
                        <VideoOff className="w-8 h-8 text-gray-600 mb-1" />
                        <span className="text-[11px] font-semibold text-gray-400">Camera Inactive</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Microphone Section & Dynamic VU Meter */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-gray-950/60 border border-gray-800/90 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-purple-400" />
                    <span className="text-xs sm:text-sm font-bold text-gray-200">Microphone Device</span>
                  </div>
                  <span className="text-[10px] font-mono text-purple-300 font-semibold">
                    Input Level: {micLevel}%
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1 font-medium">Select Audio Input</label>
                  <select
                    value={selectedMicId}
                    onChange={(e) => handleMicSelect(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {mics.length === 0 && <option value="">No Microphone Detected</option>}
                    {mics.map((m) => (
                      <option key={m.deviceId} value={m.deviceId}>
                        {m.label || `Microphone (${m.deviceId.substring(0, 6)}...)`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Animated Dynamic VU Meter */}
                <div>
                  <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1 font-medium">
                    <span>Live Input Sensitivity (Speak to test)</span>
                    <span className={micLevel > 75 ? 'text-amber-400 font-bold' : 'text-gray-400'}>
                      {micLevel > 75 ? 'High / Loud' : micLevel > 20 ? 'Active Signal' : 'Quiet / Silent'}
                    </span>
                  </div>
                  <div className="h-3 w-full bg-gray-800/90 rounded-full overflow-hidden p-0.5 border border-gray-700 flex items-center">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        micLevel > 80
                          ? 'bg-gradient-to-r from-green-500 via-yellow-400 to-red-500'
                          : micLevel > 40
                          ? 'bg-gradient-to-r from-green-500 to-yellow-400'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.max(3, micLevel)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Unprocessed 48kHz audio captures true harmonic resonance without noise suppression gating.
                  </p>
                </div>
              </div>

              {/* 3. Speaker / Audio Output Section */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-gray-950/60 border border-gray-800/90 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-purple-400" />
                    <span className="text-xs sm:text-sm font-bold text-gray-200">Speakers / Headphones</span>
                  </div>
                  <button
                    onClick={handlePlayTestChime}
                    disabled={isPlayingChime}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Volume2 className={`w-3.5 h-3.5 ${isPlayingChime ? 'animate-bounce text-yellow-300' : ''}`} />
                    {isPlayingChime ? 'Playing Chime...' : 'Play Test Sound'}
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1 font-medium">Select Audio Output Device</label>
                  <select
                    value={selectedSpeakerId}
                    onChange={(e) => setSelectedSpeakerId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {speakers.length === 0 ? (
                      <option value="">Default System Output</option>
                    ) : (
                      speakers.map((s) => (
                        <option key={s.deviceId} value={s.deviceId}>
                          {s.label || `Speaker (${s.deviceId.substring(0, 6)}...)`}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                    <Headphones className="w-3 h-3 text-purple-400" />
                    We strongly recommend wearing headphones during music lessons for optimal fidelity.
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* Tab 2: Test Call / Echo Loopback Diagnostic */
            <div className="p-5 rounded-2xl bg-gray-950/70 border border-gray-800 space-y-4 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/40 flex items-center justify-center mx-auto mb-2 text-purple-400 shadow-md">
                  <PhoneCall className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-white mb-1">Interactive Echo Loopback Test</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Record a 5-second sample speaking or singing into your mic. The app will immediately play it back so you can check your clarity, volume balance, and background acoustics.
                </p>
              </div>

              {testCallState === 'idle' && (
                <div className="py-4">
                  <button
                    onClick={handleStartTestCall}
                    className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-lg shadow-purple-900/40 transition-all inline-flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    Start 5-Second Test Recording
                  </button>
                </div>
              )}

              {testCallState === 'recording' && (
                <div className="py-6 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-red-600/30 border-2 border-red-500 flex items-center justify-center text-red-400 font-mono text-2xl font-black animate-pulse mb-2 shadow-lg shadow-red-900/50">
                    {countdown}s
                  </div>
                  <span className="text-xs font-semibold text-red-300">Recording your voice... Speak or sing now!</span>
                  <div className="h-2 w-48 bg-gray-800 rounded-full overflow-hidden mt-3 p-0.5">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-100"
                      style={{ width: `${Math.max(5, micLevel)}%` }}
                    />
                  </div>
                </div>
              )}

              {testCallState === 'playing' && recordedBlobUrl && (
                <div className="py-2 space-y-3 flex flex-col items-center">
                  <span className="text-xs font-bold text-green-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Recording Finished! Listening to Playback...
                  </span>
                  <div className="relative aspect-video max-w-sm w-full bg-black rounded-xl overflow-hidden border border-gray-700 shadow-xl">
                    <video
                      ref={playbackVideoRef}
                      src={recordedBlobUrl}
                      className="w-full h-full object-cover transform scale-x-[-1]"
                      autoPlay
                      controls
                      playsInline
                    />
                  </div>
                  <button
                    onClick={handleStartTestCall}
                    className="px-4 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Record Another Sample
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between shrink-0 bg-gray-950/60">
          <div className="text-[11px] text-gray-400">
            {saveSuccess ? (
              <span className="text-green-400 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Preferences saved!
              </span>
            ) : (
              <span>Your preferred devices will be remembered for all future classes.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePreferences}
              className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-bold shadow-md shadow-purple-900/30 transition-all flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
