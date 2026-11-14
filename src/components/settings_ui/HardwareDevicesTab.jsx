import React, { useState, useEffect, useRef } from 'react';
import {
  getPreferredDevices,
  savePreferredDevices
} from '../../services/media';
import {
  Camera,
  Mic,
  Volume2,
  RefreshCw,
  FlipHorizontal,
  Check,
  Play,
  Square,
  Sparkles,
  VideoOff
} from 'lucide-react';

export function HardwareDevicesTab({ onSaved }) {
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);

  const [selectedCamId, setSelectedCamId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  const [micLevel, setMicLevel] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [isPreviewMirrored, setIsPreviewMirrored] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const videoPreviewRef = useRef(null);
  const activeStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);

  // Stop active hardware streams & analyzers
  const stopHardwareMedia = () => {
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
      try {
        activeStreamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {}
      activeStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setCameraActive(false);
    setMicLevel(0);
  };

  // Setup VU meter for microphone pickup
  const setupAudioMeter = (stream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (e) {}
        audioContextRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tickMeter = () => {
        if (!activeStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const scaled = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(scaled);

        animFrameRef.current = requestAnimationFrame(tickMeter);
      };

      tickMeter();
    } catch (e) {
      console.warn("Could not setup audio meter:", e);
    }
  };

  // Start live camera & microphone preview
  const startPreview = async (camId, micId) => {
    stopHardwareMedia();

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
      try {
        const fallback = {
          video: camId ? { deviceId: { ideal: camId }, width: { ideal: 640 }, height: { ideal: 480 } } : true,
          audio: micId ? { deviceId: { ideal: micId } } : true
        };
        stream = await navigator.mediaDevices.getUserMedia(fallback);
      } catch (err2) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err3) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (err4) {
            console.warn("Could not obtain audio or video for preview:", err4);
          }
        }
      }
    }

    if (!stream) return;
    activeStreamRef.current = stream;

    // Attach video preview
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = stream;
      videoPreviewRef.current.play().catch(e => console.warn("Preview play error:", e));
      setCameraActive(true);
    } else {
      setCameraActive(false);
    }

    // Attach audio analyzer for VU meter
    setupAudioMeter(stream);
  };

  // Enumerate hardware devices
  const refreshDevices = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devs.filter(d => d.kind === 'videoinput');
      const audioInDevs = devs.filter(d => d.kind === 'audioinput');
      const audioOutDevs = devs.filter(d => d.kind === 'audiooutput');

      setCameras(videoDevs);
      setMics(audioInDevs);
      setSpeakers(audioOutDevs);

      const saved = getPreferredDevices();
      const initialCam = (saved.camId && videoDevs.some(d => d.deviceId === saved.camId))
        ? saved.camId
        : (videoDevs[0]?.deviceId || '');
      const initialMic = (saved.micId && audioInDevs.some(d => d.deviceId === saved.micId))
        ? saved.micId
        : (audioInDevs[0]?.deviceId || '');
      const initialSpeaker = (saved.speakerId && audioOutDevs.some(d => d.deviceId === saved.speakerId))
        ? saved.speakerId
        : (audioOutDevs[0]?.deviceId || '');

      setSelectedCamId(initialCam);
      setSelectedMicId(initialMic);
      setSelectedSpeakerId(initialSpeaker);

      startPreview(initialCam, initialMic);
    } catch (e) {
      console.warn("Error refreshing devices:", e);
    }
  };

  useEffect(() => {
    refreshDevices();
    return () => {
      stopHardwareMedia();
    };
  }, []);

  // Handle switching camera
  const handleCamChange = (e) => {
    const newId = e.target.value;
    setSelectedCamId(newId);
    startPreview(newId, selectedMicId);
  };

  // Handle switching microphone
  const handleMicChange = (e) => {
    const newId = e.target.value;
    setSelectedMicId(newId);
    startPreview(selectedCamId, newId);
  };

  // Play test chime via Web Audio API
  const handlePlayTestChime = () => {
    if (isPlayingChime) return;
    setIsPlayingChime(true);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();

      const notes = [
        { freq: 523.25, time: 0 },    // C5
        { freq: 659.25, time: 0.15 }, // E5
        { freq: 783.99, time: 0.3 },  // G5
        { freq: 1046.50, time: 0.45 } // C6
      ];

      notes.forEach(({ freq, time }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

        gain.gain.setValueAtTime(0, ctx.currentTime + time);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + time + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + 0.55);
      });

      setTimeout(() => {
        setIsPlayingChime(false);
        try { ctx.close(); } catch (e) {}
      }, 1100);
    } catch (err) {
      console.warn("Chime playback error:", err);
      setIsPlayingChime(false);
    }
  };

  // Save device preferences
  const handleSave = () => {
    savePreferredDevices({
      camId: selectedCamId,
      micId: selectedMicId,
      speakerId: selectedSpeakerId
    });
    setSaveSuccess(true);
    if (onSaved) onSaved();
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert on Save */}
      {saveSuccess && (
        <div className="p-3 bg-green-950/80 border border-green-600/70 text-green-300 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <span>Hardware preferences saved successfully.</span>
          </div>
        </div>
      )}

      {/* Grid: Preview & Hardware Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Column: Live Camera & Mic Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-purple-400" />
              Live Camera Preview
            </span>
            {cameraActive && (
              <button
                type="button"
                onClick={() => setIsPreviewMirrored(prev => !prev)}
                className="text-[11px] font-medium text-gray-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                title="Toggle Mirror"
              >
                <FlipHorizontal className="w-3 h-3" />
                <span>{isPreviewMirrored ? 'Mirrored' : 'Normal'}</span>
              </button>
            )}
          </div>

          <div className="relative aspect-video bg-gray-950 rounded-2xl overflow-hidden border border-gray-800 shadow-inner flex items-center justify-center">
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-transform ${
                isPreviewMirrored ? 'scale-x-[-1]' : ''
              } ${cameraActive ? '' : 'hidden'}`}
            />

            {!cameraActive && (
              <div className="flex flex-col items-center justify-center p-6 text-center text-gray-500">
                <VideoOff className="w-9 h-9 mb-2 text-purple-400/40" />
                <span className="text-xs font-semibold text-gray-400">Camera Inactive</span>
                <span className="text-[10px] text-gray-600 mt-0.5">Select a camera or grant permission</span>
              </div>
            )}

            {/* In-Preview Camera Badge */}
            {cameraActive && (
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur text-[10px] font-medium text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Video
              </div>
            )}
          </div>

          {/* Live Mic VU Meter */}
          <div className="bg-gray-950/80 p-3 rounded-xl border border-gray-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400 flex items-center gap-1.5 font-medium">
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
                Mic Pickup Level
              </span>
              <span className="font-mono text-[11px] text-gray-300">{micLevel}%</span>
            </div>

            {/* 10-bar Segmented Visualizer */}
            <div className="flex items-center gap-1 h-3 w-full bg-gray-900 rounded-md p-1 border border-gray-800">
              {[...Array(10)].map((_, i) => {
                const threshold = (i + 1) * 10;
                const active = micLevel >= threshold;
                return (
                  <div
                    key={i}
                    className={`flex-1 h-full rounded-sm transition-all duration-75 ${
                      active
                        ? i < 6
                          ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                          : i < 8
                          ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                          : 'bg-red-500 shadow-sm shadow-red-500/50'
                        : 'bg-gray-800'
                    }`}
                  />
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500">
              Speak normally into your microphone to verify the green pickup bars react.
            </p>
          </div>
        </div>

        {/* Right Column: Device Selectors */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Connected Hardware
            </span>
            <button
              type="button"
              onClick={refreshDevices}
              className="text-[11px] font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              title="Rescan audio & video inputs"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Rescan</span>
            </button>
          </div>

          {/* 1. Camera Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-purple-400" />
              Camera / Webcam
            </label>
            <select
              value={selectedCamId}
              onChange={handleCamChange}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            >
              {cameras.length === 0 && <option value="">No cameras detected</option>}
              {cameras.map((c, i) => (
                <option key={c.deviceId || i} value={c.deviceId}>
                  {c.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Microphone Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              Microphone / Audio Input
            </label>
            <select
              value={selectedMicId}
              onChange={handleMicChange}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            >
              {mics.length === 0 && <option value="">No microphones detected</option>}
              {mics.map((m, i) => (
                <option key={m.deviceId || i} value={m.deviceId}>
                  {m.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Speaker Selector & Test Chime */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-blue-400" />
              Playback Speaker / Headphones
            </label>
            <div className="flex gap-2">
              <select
                value={selectedSpeakerId}
                onChange={(e) => setSelectedSpeakerId(e.target.value)}
                className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
              >
                {speakers.length === 0 && (
                  <option value="">System Default Speaker</option>
                )}
                {speakers.map((s, i) => (
                  <option key={s.deviceId || i} value={s.deviceId}>
                    {s.label || `Speaker ${i + 1}`}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handlePlayTestChime}
                disabled={isPlayingChime}
                className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
                title="Play 4-tone acoustic chime"
              >
                <Play className={`w-3.5 h-3.5 ${isPlayingChime ? 'animate-spin' : ''}`} />
                <span>{isPlayingChime ? 'Playing...' : 'Test'}</span>
              </button>
            </div>
            <p className="text-[10px] text-gray-500">
              On supported browsers, output routes directly to your chosen headphones or speaker.
            </p>
          </div>

          {/* Save Device Preferences Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleSave}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 active:scale-[0.99] text-white font-semibold text-xs rounded-xl shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Save Device Preferences</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
