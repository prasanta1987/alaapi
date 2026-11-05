import React, { useState, useEffect, useRef } from 'react';
import {
  getPreferredDevices,
  savePreferredDevices,
  getAudioSettings,
  saveAudioSettings
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
  Sparkles,
  PhoneCall,
  RotateCcw,
  Headphones,
  CheckCircle2,
  Sliders,
  RefreshCw
} from 'lucide-react';

export function DeviceSetupModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('devices'); // 'devices' | 'audio' | 'testcall'

  // Device lists
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);

  // Selected device IDs
  const [selectedCamId, setSelectedCamId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  // Audio DSP Settings
  const [audioSettings, setAudioSettings] = useState(getAudioSettings());

  // Live testing states
  const [micLevel, setMicLevel] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isHardwarePreviewMirrored, setIsHardwarePreviewMirrored] = useState(false);

  // Test Call (Loopback recorder) states
  const [testCallState, setTestCallState] = useState('idle'); // 'idle' | 'recording' | 'playing'
  const [countdown, setCountdown] = useState(5);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null);

  // Refs for cleanup and testing
  const videoPreviewRef = useRef(null);
  const testPreviewRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const activeStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const testCallTimerRef = useRef(null);

  // Clean up all active streams, analyzers, and timers
  const stopAllMedia = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (testCallTimerRef.current) {
      clearInterval(testCallTimerRef.current);
      testCallTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
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
    if (testPreviewRef.current) {
      testPreviewRef.current.srcObject = null;
    }
    setCameraActive(false);
    setMicLevel(0);
  };

  // Setup dynamic VU meter via Web Audio API
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
      analyser.smoothingTimeConstant = 0.6;
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

  // Starts preview stream for camera and microphone (Hardware Devices tab only)
  const startHardwarePreview = async (camId, micId) => {
    stopAllMedia();

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

  // Starts media stream specifically for Test Call using selected devices & DSP filters
  const startTestCallStream = async (camId, micId, dsp) => {
    stopAllMedia();

    const videoConstraints = camId
      ? { deviceId: { exact: camId }, width: { ideal: 640 }, height: { ideal: 480 } }
      : true;

    const audioConstraints = {
      echoCancellation: Boolean(dsp?.echoCancellation),
      googEchoCancellation: Boolean(dsp?.echoCancellation),
      noiseSuppression: Boolean(dsp?.noiseSuppression),
      googNoiseSuppression: Boolean(dsp?.noiseSuppression),
      googHighpassFilter: Boolean(dsp?.noiseSuppression),
      autoGainControl: Boolean(dsp?.autoGainControl),
      googAutoGainControl: Boolean(dsp?.autoGainControl)
    };
    if (micId) {
      audioConstraints.deviceId = { exact: micId };
    }

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: audioConstraints });
    } catch (err) {
      try {
        const fallback = {
          video: camId ? { deviceId: { ideal: camId } } : true,
          audio: { ...audioConstraints, deviceId: micId ? { ideal: micId } : undefined }
        };
        stream = await navigator.mediaDevices.getUserMedia(fallback);
      } catch (err2) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (err3) {
          console.warn("Could not acquire test call media stream:", err3);
        }
      }
    }

    if (!stream) return;
    activeStreamRef.current = stream;

    // Attach live preview in Test Call (unmirrored)
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack && testPreviewRef.current) {
      testPreviewRef.current.srcObject = stream;
      testPreviewRef.current.play().catch(e => console.warn("Test preview play error:", e));
      setCameraActive(true);
    } else {
      setCameraActive(false);
    }

    // Attach VU meter
    setupAudioMeter(stream);
  };

  // 1. Initialize & enumerate devices on modal open
  useEffect(() => {
    if (!isOpen) {
      stopAllMedia();
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl);
        setRecordedBlobUrl(null);
      }
      return;
    }

    // Refresh settings
    setAudioSettings(getAudioSettings());
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
          try {
            tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (e2) {}
        }

        const devices = await navigator.mediaDevices.enumerateDevices();

        // Release temp stream immediately
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

        // ONLY start camera/mic preview if user is currently on the Hardware Devices tab
        if (activeTab === 'devices') {
          startHardwarePreview(camToUse, micToUse);
        } else if (activeTab === 'testcall') {
          startTestCallStream(camToUse, micToUse, getAudioSettings());
        }
      } catch (err) {
        console.warn("Could not enumerate hardware devices:", err);
      }
    };

    enumerate();

    return () => {
      stopAllMedia();
    };
  }, [isOpen]);

  // 2. React to Tab switching:
  // - "devices": camera and mic active for live hardware verification
  // - "audio": ALL hardware connections dropped
  // - "testcall": user-selected devices accessed for loopback test
  useEffect(() => {
    if (!isOpen) return;

    if (activeTab === 'devices') {
      if (selectedCamId || selectedMicId || cameras.length > 0 || mics.length > 0) {
        startHardwarePreview(selectedCamId, selectedMicId);
      }
    } else if (activeTab === 'testcall') {
      setTestCallState('idle');
      startTestCallStream(selectedCamId, selectedMicId, audioSettings);
    } else if (activeTab === 'audio') {
      // Hardware connections MUST be completely dropped on Audio & DSP tab
      stopAllMedia();
    }

    return () => {
      stopAllMedia();
    };
  }, [activeTab, isOpen]);

  // 3. Drop all camera and mic connections when user leaves the window (blur, tab switch, minimize)
  useEffect(() => {
    if (!isOpen) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User left tab or minimized browser window -> Drop all connections immediately!
        stopAllMedia();
      } else {
        // User returned to window
        if (activeTab === 'devices') {
          startHardwarePreview(selectedCamId, selectedMicId);
        } else if (activeTab === 'testcall') {
          if (testCallState !== 'playing') {
            startTestCallStream(selectedCamId, selectedMicId, audioSettings);
          }
        }
      }
    };

    const handlePageHide = () => {
      stopAllMedia();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [isOpen, activeTab, selectedCamId, selectedMicId, audioSettings, testCallState]);

  // Tab change handler
  const handleTabChange = (newTab) => {
    if (newTab === activeTab) return;
    stopAllMedia();
    setActiveTab(newTab);
  };

  // Change camera
  const handleCamSelect = (camId) => {
    setSelectedCamId(camId);
    if (activeTab === 'devices') {
      startHardwarePreview(camId, selectedMicId);
    } else if (activeTab === 'testcall') {
      startTestCallStream(camId, selectedMicId, audioSettings);
    }
  };

  // Change microphone
  const handleMicSelect = (micId) => {
    setSelectedMicId(micId);
    if (activeTab === 'devices') {
      startHardwarePreview(selectedCamId, micId);
    } else if (activeTab === 'testcall') {
      startTestCallStream(selectedCamId, micId, audioSettings);
    }
  };

  // Toggle DSP settings
  const handleToggleDSP = (key) => {
    const updated = {
      ...audioSettings,
      [key]: !audioSettings[key]
    };
    setAudioSettings(updated);
  };

  // Quick DSP presets
  const handleApplyPreset = (preset) => {
    let updated = {};
    if (preset === 'music') {
      updated = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      };
    } else if (preset === 'speech') {
      updated = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
    }
    setAudioSettings(updated);
  };

  // Play Harmonic Chime to Test Speakers/Headphones
  const handlePlayTestChime = () => {
    if (isPlayingChime) return;
    setIsPlayingChime(true);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();

      if (ctx.setSinkId && selectedSpeakerId) {
        ctx.setSinkId(selectedSpeakerId).catch(() => {});
      }

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
  const handleStartTestCall = async () => {
    if (testCallState === 'recording') return;

    if (!activeStreamRef.current) {
      await startTestCallStream(selectedCamId, selectedMicId, audioSettings);
    }

    if (!activeStreamRef.current) {
      console.warn("No stream available for test recording.");
      return;
    }

    recordedChunksRef.current = [];
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      setRecordedBlobUrl(null);
    }
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
        // Stop active hardware capture while listening to playback to prevent audio loopback/speaker feedback
        stopAllMedia();
      };

      recorder.start();

      let secondsLeft = 5;
      testCallTimerRef.current = setInterval(() => {
        secondsLeft -= 1;
        setCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          if (testCallTimerRef.current) {
            clearInterval(testCallTimerRef.current);
            testCallTimerRef.current = null;
          }
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

  // Re-record another test sample
  const handleRecordAnotherSample = () => {
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      setRecordedBlobUrl(null);
    }
    setTestCallState('idle');
    startTestCallStream(selectedCamId, selectedMicId, audioSettings);
  };

  // Close modal and drop all media
  const handleClose = () => {
    stopAllMedia();
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      setRecordedBlobUrl(null);
    }
    onClose();
  };

  // Save preferred devices and audio settings
  const handleSavePreferences = () => {
    savePreferredDevices({
      cameraId: selectedCamId,
      micId: selectedMicId,
      speakerId: selectedSpeakerId
    });
    saveAudioSettings(audioSettings);

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      handleClose();
    }, 700);
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
                Configure camera, microphone, acoustic DSP filters, and run test calls.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 pb-1 border-b border-gray-800/80 flex items-center gap-2 shrink-0 bg-gray-950/20 overflow-x-auto">
          <button
            onClick={() => handleTabChange('devices')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'devices'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Hardware Devices
          </button>

          <button
            onClick={() => handleTabChange('audio')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'audio'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Audio & DSP Settings
          </button>

          <button
            onClick={() => handleTabChange('testcall')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'testcall'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            Test Call (Echo Check)
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'devices' && (
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
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-700/80 flex items-center justify-center shadow-inner group">
                    <video
                      ref={videoPreviewRef}
                      className={`w-full h-full object-cover ${isHardwarePreviewMirrored ? 'transform scale-x-[-1]' : ''} ${cameraActive ? '' : 'hidden'}`}
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
                    {cameraActive && (
                      <button
                        type="button"
                        onClick={() => setIsHardwarePreviewMirrored(prev => !prev)}
                        title={isHardwarePreviewMirrored ? "Switch to Normal Orientation" : "Mirror Video Preview"}
                        className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-black/70 hover:bg-black/90 text-[10px] text-gray-300 hover:text-white border border-gray-700 transition-all flex items-center gap-1 shadow"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>{isHardwarePreviewMirrored ? "Mirrored" : "Normal"}</span>
                      </button>
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
                    Live hardware input monitor with responsiveness calibration.
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
          )}

          {activeTab === 'audio' && (
            /* Tab 2: Audio & Acoustic DSP Settings (NO camera/mic held open) */
            <div className="space-y-4">
              {/* Vocal Teacher Tip */}
              <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-3.5 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <p className="text-xs text-purple-200/90 leading-relaxed">
                  <strong>Studio Pro Tip:</strong> For acoustic music and vocal singing lessons, turn <span className="text-purple-300 font-semibold">OFF</span> all DSP filters and use headphones to unlock pure <strong>48kHz lossless stereo dynamics</strong> without vocal clipping or volume compression.
                </p>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Presets:</span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('music')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    !audioSettings.echoCancellation && !audioSettings.noiseSuppression && !audioSettings.autoGainControl
                      ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/30'
                      : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  🎵 Music & Vocals (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('speech')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                    audioSettings.echoCancellation && audioSettings.noiseSuppression && audioSettings.autoGainControl
                      ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-900/30'
                      : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  🗣️ Spoken Speech
                </button>
              </div>

              {/* The 3 DSP Toggles */}
              <div className="bg-gray-950/80 rounded-2xl border border-gray-800/90 p-4 space-y-3.5 divide-y divide-gray-800/70">
                {/* 1. Echo Cancellation */}
                <div className="flex items-center justify-between pt-1 first:pt-0">
                  <div className="pr-4">
                    <span className="text-xs sm:text-sm font-semibold text-white block">Echo Cancellation</span>
                    <span className="text-[11px] text-gray-400 block leading-tight mt-0.5">
                      Eliminates feedback. Recommended: OFF with headphones for high-fidelity 48kHz music.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleDSP('echoCancellation')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      audioSettings.echoCancellation ? 'bg-purple-600' : 'bg-gray-700'
                    }`}
                    role="switch"
                    aria-checked={audioSettings.echoCancellation}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        audioSettings.echoCancellation ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Noise Suppression */}
                <div className="flex items-center justify-between pt-3">
                  <div className="pr-4">
                    <span className="text-xs sm:text-sm font-semibold text-white block">Noise Suppression</span>
                    <span className="text-[11px] text-gray-400 block leading-tight mt-0.5">
                      Suppresses ambient hum. Recommended: OFF to prevent clipping soft vocal vibrato.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleDSP('noiseSuppression')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      audioSettings.noiseSuppression ? 'bg-purple-600' : 'bg-gray-700'
                    }`}
                    role="switch"
                    aria-checked={audioSettings.noiseSuppression}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        audioSettings.noiseSuppression ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 3. Auto Gain Control */}
                <div className="flex items-center justify-between pt-3">
                  <div className="pr-4">
                    <span className="text-xs sm:text-sm font-semibold text-white block">Auto Gain Control</span>
                    <span className="text-[11px] text-gray-400 block leading-tight mt-0.5">
                      Normalizes volume. Recommended: OFF to preserve full acoustic singing dynamics.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleDSP('autoGainControl')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      audioSettings.autoGainControl ? 'bg-purple-600' : 'bg-gray-700'
                    }`}
                    role="switch"
                    aria-checked={audioSettings.autoGainControl}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        audioSettings.autoGainControl ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'testcall' && (
            /* Tab 3: Test Call / Echo Loopback Diagnostic using Selected Devices */
            <div className="p-4 sm:p-5 rounded-2xl bg-gray-950/70 border border-gray-800 space-y-4 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/40 flex items-center justify-center mx-auto mb-2 text-purple-400 shadow-md">
                  <PhoneCall className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h4 className="text-sm sm:text-base font-bold text-white mb-1">Interactive Echo Loopback Test</h4>
                <p className="text-[11px] sm:text-xs text-gray-400 leading-relaxed">
                  Record a 5-second sample speaking or singing into your mic. The app will immediately play it back so you can check your clarity, volume balance, and background acoustics.
                </p>

                {/* Selected devices badge */}
                <div className="mt-2.5 inline-flex flex-wrap items-center justify-center gap-2 px-3 py-1 bg-gray-900 border border-gray-800 rounded-full text-[10px] text-gray-300">
                  <span className="flex items-center gap-1 text-purple-300 font-medium">
                    <Video className="w-3 h-3" />
                    {cameras.find(c => c.deviceId === selectedCamId)?.label || (selectedCamId ? 'Selected Camera' : 'Camera')}
                  </span>
                  <span className="text-gray-600">•</span>
                  <span className="flex items-center gap-1 text-purple-300 font-medium">
                    <Mic className="w-3 h-3" />
                    {mics.find(m => m.deviceId === selectedMicId)?.label || (selectedMicId ? 'Selected Mic' : 'Microphone')}
                  </span>
                </div>
              </div>

              {/* IDLE OR RECORDING: Show Live Preview Box (UNMIRRORED) and VU meter */}
              {(testCallState === 'idle' || testCallState === 'recording') && (
                <div className="space-y-3 max-w-sm mx-auto">
                  {/* Live Video Preview Box (Unmirrored) */}
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-700 shadow-xl flex items-center justify-center">
                    <video
                      ref={testPreviewRef}
                      className={`w-full h-full object-cover ${cameraActive ? '' : 'hidden'}`}
                      autoPlay
                      playsInline
                      muted
                    />
                    {!cameraActive && (
                      <div className="flex flex-col items-center justify-center p-3 text-center text-gray-500">
                        <VideoOff className="w-8 h-8 text-gray-600 mb-1" />
                        <span className="text-[11px] font-semibold text-gray-400">Audio-Only Test (Camera Inactive)</span>
                      </div>
                    )}

                    {/* Recording Overlay */}
                    {testCallState === 'recording' && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-white p-3">
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600 text-[10px] font-bold tracking-wider animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          REC
                        </div>
                        <div className="w-14 h-14 rounded-full bg-red-600/40 border-2 border-red-500 flex items-center justify-center text-white font-mono text-2xl font-black shadow-lg shadow-red-900/50 mb-1">
                          {countdown}s
                        </div>
                        <span className="text-xs font-semibold text-white">Speak or sing now!</span>
                      </div>
                    )}
                  </div>

                  {/* Live VU Meter during Test Call */}
                  <div className="space-y-1 text-left px-1">
                    <div className="flex justify-between text-[10px] text-gray-400 font-medium">
                      <span>Mic Input Level</span>
                      <span className="font-mono text-purple-300">{micLevel}%</span>
                    </div>
                    <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden p-0.5 border border-gray-700">
                      <div
                        className={`h-full rounded-full transition-all duration-75 ${
                          testCallState === 'recording'
                            ? 'bg-red-500'
                            : micLevel > 75
                            ? 'bg-amber-400'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.max(4, micLevel)}%` }}
                      />
                    </div>
                  </div>

                  {/* Start Recording Button */}
                  {testCallState === 'idle' && (
                    <div className="pt-2">
                      <button
                        onClick={handleStartTestCall}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-lg shadow-purple-900/40 transition-all inline-flex items-center justify-center gap-2"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        Start 5-Second Test Recording
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PLAYING: Playback recorded sample (UNMIRRORED) */}
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
                      className="w-full h-full object-cover"
                      autoPlay
                      controls
                      playsInline
                    />
                  </div>
                  <button
                    onClick={handleRecordAnotherSample}
                    className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow"
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
                <Check className="w-3.5 h-3.5" /> Device & Audio preferences saved!
              </span>
            ) : (
              <span>Your hardware devices and acoustic DSP filters will be remembered.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
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
