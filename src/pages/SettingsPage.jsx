import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getPreferredDevices,
  savePreferredDevices,
  getAudioSettings,
  saveAudioSettings,
  buildAudioConstraints
} from '../services/media';
import {
  RINGTONE_OPTIONS,
  getSelectedRingtone,
  saveSelectedRingtone,
  previewRingtone,
  stopRingtone,
  unlockAudioContext
} from '../services/ringtone';
import {
  ArrowLeft,
  Camera,
  Mic,
  Volume2,
  Sliders,
  PhoneCall,
  User,
  Bell,
  Check,
  Play,
  Square,
  Sparkles,
  Save,
  RotateCcw,
  Headphones,
  CheckCircle2,
  Phone,
  Music,
  FileText,
  Radio,
  Loader2,
  RefreshCw,
  VideoOff,
  FlipHorizontal
} from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

export function SettingsPage() {
  const navigate = useNavigate();
  const { currentUser, userProfile, updateUserProfile, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState('devices'); // 'devices' | 'dsp' | 'testcall' | 'profile' | 'ringtone'

  // Hardware Devices
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [speakers, setSpeakers] = useState([]);

  const [selectedCamId, setSelectedCamId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  // Audio DSP
  const [audioDsp, setAudioDsp] = useState(getAudioSettings());

  // Test Call loopback
  const [testCallState, setTestCallState] = useState('idle'); // 'idle' | 'recording' | 'playing'
  const [countdown, setCountdown] = useState(5);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState(null);

  // Live preview & VU Meter
  const [micLevel, setMicLevel] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [isPlayingChime, setIsPlayingChime] = useState(false);
  const [isPreviewMirrored, setIsPreviewMirrored] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Profile fields
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [instrument, setInstrument] = useState('');
  const [bio, setBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Ringtone
  const [selectedRingtone, setSelectedRingtone] = useState(getSelectedRingtone());
  const [isPlayingRingtone, setIsPlayingRingtone] = useState(false);

  // Refs for media cleanup
  const videoPreviewRef = useRef(null);
  const testPreviewRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const activeStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const testCallTimerRef = useRef(null);

  // Initialize saved values on mount
  useEffect(() => {
    const preferred = getPreferredDevices();
    setSelectedCamId(preferred.cameraId || '');
    setSelectedMicId(preferred.micId || '');
    setSelectedSpeakerId(preferred.speakerId || '');

    setAudioDsp(getAudioSettings());
    setSelectedRingtone(getSelectedRingtone());

    if (userProfile) {
      setDisplayName(userProfile.displayName || currentUser?.displayName || '');
      setPhone(userProfile.phone || '');
      setInstrument(userProfile.instrument || 'Vocals');
      setBio(userProfile.bio || '');
    }
  }, [userProfile, currentUser]);

  // Enumerate connected devices
  const enumerateAllDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();

      const videoDevs = devices.filter(d => d.kind === 'videoinput');
      const audioDevs = devices.filter(d => d.kind === 'audioinput');
      const speakerDevs = devices.filter(d => d.kind === 'audiooutput');

      setCameras(videoDevs);
      setMics(audioDevs);
      setSpeakers(speakerDevs);

      const preferred = getPreferredDevices();
      if (!selectedCamId && preferred.cameraId && videoDevs.some(d => d.deviceId === preferred.cameraId)) {
        setSelectedCamId(preferred.cameraId);
      } else if (!selectedCamId && videoDevs.length > 0) {
        setSelectedCamId(videoDevs[0].deviceId);
      }

      if (!selectedMicId && preferred.micId && audioDevs.some(d => d.deviceId === preferred.micId)) {
        setSelectedMicId(preferred.micId);
      } else if (!selectedMicId && audioDevs.length > 0) {
        setSelectedMicId(audioDevs[0].deviceId);
      }

      if (!selectedSpeakerId && preferred.speakerId && speakerDevs.some(d => d.deviceId === preferred.speakerId)) {
        setSelectedSpeakerId(preferred.speakerId);
      } else if (!selectedSpeakerId && speakerDevs.length > 0) {
        setSelectedSpeakerId(speakerDevs[0].deviceId);
      }
    } catch (e) {
      console.warn("Error enumerating devices:", e);
    }
  };

  useEffect(() => {
    enumerateAllDevices();
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', enumerateAllDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', enumerateAllDevices);
      };
    }
  }, []);

  // Stop active hardware streams on tab switch or unmount
  const stopHardwareStreams = () => {
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
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => t.stop());
      activeStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    setMicLevel(0);
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopHardwareStreams();
      stopRingtone();
      if (recordedBlobUrl) {
        URL.revokeObjectURL(recordedBlobUrl);
      }
    };
  }, []);

  // Start Hardware Preview (only when on 'devices' tab)
  const startHardwarePreview = async () => {
    stopHardwareStreams();
    if (activeTab !== 'devices') return;

    try {
      const constraints = {
        video: selectedCamId ? { deviceId: { exact: selectedCamId } } : true,
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = stream;

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
        setCameraActive(true);
      }

      // Audio Analyser
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && stream.getAudioTracks().length > 0) {
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVU = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(100, Math.round((avg / 128) * 100));
          setMicLevel(normalized);
          animFrameRef.current = requestAnimationFrame(updateVU);
        };
        updateVU();
      }
    } catch (err) {
      console.warn("Could not start hardware preview:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'devices') {
      startHardwarePreview();
    } else {
      stopHardwareStreams();
    }
  }, [activeTab, selectedCamId, selectedMicId]);

  // Test Speaker Chime
  const handlePlayTestChime = () => {
    if (isPlayingChime) return;
    setIsPlayingChime(true);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.45); // C6

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.9);

      setTimeout(() => {
        setIsPlayingChime(false);
        ctx.close().catch(() => {});
      }, 1000);
    } catch (e) {
      setIsPlayingChime(false);
    }
  };

  // Start Test Call Recording (5-second echo check)
  const startTestCallRecording = async () => {
    stopHardwareStreams();
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      setRecordedBlobUrl(null);
    }

    try {
      setTestCallState('recording');
      setCountdown(5);
      recordedChunksRef.current = [];

      const constraints = {
        video: selectedCamId ? { deviceId: { exact: selectedCamId } } : true,
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = stream;

      if (testPreviewRef.current) {
        testPreviewRef.current.srcObject = stream;
        testPreviewRef.current.play().catch(() => {});
      }

      let options = { mimeType: 'video/webm;codecs=vp8,opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/mp4' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = {};
        }
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedBlobUrl(url);
        setTestCallState('playing');

        if (activeStreamRef.current) {
          activeStreamRef.current.getTracks().forEach(t => t.stop());
          activeStreamRef.current = null;
        }

        setTimeout(() => {
          if (playbackVideoRef.current) {
            playbackVideoRef.current.src = url;
            playbackVideoRef.current.play().catch(() => {});
          }
        }, 100);
      };

      recorder.start();

      let remaining = 5;
      testCallTimerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(testCallTimerRef.current);
          testCallTimerRef.current = null;
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 1000);
    } catch (err) {
      console.warn("Could not start test call recording:", err);
      setTestCallState('idle');
    }
  };

  // Save All Settings
  const handleSaveAllSettings = () => {
    savePreferredDevices({
      cameraId: selectedCamId,
      micId: selectedMicId,
      speakerId: selectedSpeakerId
    });

    saveAudioSettings(audioDsp);
    saveSelectedRingtone(selectedRingtone);

    setSaveSuccessMsg('All device & audio settings saved successfully!');
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // Save Profile
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    setSavingProfile(true);

    try {
      await updateUserProfile({
        displayName: displayName.trim(),
        phone: phone.trim(),
        instrument: instrument.trim(),
        bio: bio.trim()
      });
      setSaveSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    } catch (err) {
      console.error("Profile update failed:", err);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="min-h-full max-w-5xl mx-auto px-3 sm:px-6 py-4 flex flex-col gap-4">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-900/90 border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(currentUser ? '/dashboard' : '/')}
            className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 hover:text-white flex items-center justify-center transition-all border border-gray-700"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              Studio Device & Audio Setup
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-500/30">
                48kHz Stereo Engine
              </span>
            </h1>
            <p className="text-xs text-gray-400">
              Configure camera, microphone hardware, acoustic DSP filters, synthesized ringtones, and profile.
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveAllSettings}
          className="self-end sm:self-center px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          Save & Apply
        </button>
      </header>

      {/* Success Notice Banner */}
      {saveSuccessMsg && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-gray-800">
        {[
          { id: 'devices', label: 'Hardware Devices', icon: Camera },
          { id: 'dsp', label: 'Audio & DSP Filters', icon: Sliders },
          { id: 'testcall', label: 'Test Call (Echo Check)', icon: PhoneCall },
          { id: 'ringtone', label: 'Melody Ringtones', icon: Bell },
          { id: 'profile', label: 'Profile & Account', icon: User }
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-4 sm:p-6 shadow-2xl backdrop-blur flex-1 flex flex-col">
        {/* TAB 1: HARDWARE DEVICES */}
        {activeTab === 'devices' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Device Selectors */}
              <div className="space-y-4">
                {/* Camera Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-purple-400" />
                    Video Camera
                  </label>
                  <select
                    value={selectedCamId}
                    onChange={(e) => setSelectedCamId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
                  >
                    {cameras.length === 0 && <option value="">No Camera Found</option>}
                    {cameras.map((c, i) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Microphone Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-emerald-400" />
                    Microphone Input
                  </label>
                  <select
                    value={selectedMicId}
                    onChange={(e) => setSelectedMicId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
                  >
                    {mics.length === 0 && <option value="">No Microphone Found</option>}
                    {mics.map((m, i) => (
                      <option key={m.deviceId} value={m.deviceId}>
                        {m.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                  </select>

                  {/* Live Mic Level Bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 font-semibold w-16">Live Mic:</span>
                    <div className="flex-1 bg-gray-950 h-2 rounded-full overflow-hidden border border-gray-800">
                      <div
                        style={{ width: `${micLevel}%` }}
                        className={`h-full transition-all duration-75 ${
                          micLevel > 75 ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{micLevel}%</span>
                  </div>
                </div>

                {/* Speaker Selector */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-blue-400" />
                    Audio Output / Speaker
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedSpeakerId}
                      onChange={(e) => setSelectedSpeakerId(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors cursor-pointer"
                    >
                      {speakers.length === 0 && <option value="">System Default Speaker</option>}
                      {speakers.map((s, i) => (
                        <option key={s.deviceId} value={s.deviceId}>
                          {s.label || `Speaker ${i + 1}`}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handlePlayTestChime}
                      disabled={isPlayingChime}
                      className="px-3 py-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shrink-0 active:scale-95 disabled:opacity-50"
                      title="Play Test Chime"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      {isPlayingChime ? 'Playing...' : 'Test'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Camera Video Feed Preview */}
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-gray-800 shadow-xl flex items-center justify-center">
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isPreviewMirrored ? 'scale-x-[-1]' : ''} ${cameraActive ? '' : 'hidden'}`}
                  />
                  {!cameraActive && (
                    <div className="flex flex-col items-center justify-center text-gray-500 p-4 text-center">
                      <VideoOff className="w-8 h-8 mb-2 opacity-50" />
                      <span className="text-xs font-semibold">Camera Preview Inactive</span>
                    </div>
                  )}

                  {cameraActive && (
                    <button
                      onClick={() => setIsPreviewMirrored(prev => !prev)}
                      title={isPreviewMirrored ? "Unmirror" : "Mirror"}
                      className="absolute top-2 left-2 z-10 bg-black/70 hover:bg-black/90 text-gray-200 px-2 py-1 rounded-md text-[10px] font-semibold border border-white/20 backdrop-blur flex items-center gap-1 shadow"
                    >
                      <FlipHorizontal className="w-3 h-3 text-purple-300" />
                      <span>{isPreviewMirrored ? 'Mirrored' : 'Normal'}</span>
                    </button>
                  )}

                  <div className="absolute bottom-2 right-2 bg-black/75 px-2 py-0.5 rounded text-[10px] font-semibold text-gray-300 border border-white/10 backdrop-blur">
                    Live Preview
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-2 text-center">
                  Check your video framing and verify microphone levels before joining lessons.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AUDIO & ACOUSTIC DSP SETTINGS */}
        {activeTab === 'dsp' && (
          <div className="space-y-6 animate-fadeIn max-w-2xl">
            {/* Music Mode Info Box */}
            <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-500/40 flex items-start gap-3">
              <Headphones className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  High-Fidelity Vocal & Instrument Mode (Lossless 48kHz Stereo)
                </h4>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  For classical singing, harmonium, and acoustic instruments, <strong>turn Echo Cancellation OFF</strong> and wear headphones. This disables aggressive speech compression and provides full-bandwidth, natural vocal resonance.
                </p>
              </div>
            </div>

            {/* DSP Switches */}
            <div className="space-y-4 bg-gray-950/50 p-4 sm:p-5 rounded-2xl border border-gray-800">
              {/* Echo Cancellation */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <h5 className="text-xs sm:text-sm font-bold text-gray-200">Acoustic Echo Cancellation (AEC)</h5>
                  <p className="text-[11px] text-gray-400">
                    Recommended only when using laptop speakers without headphones to prevent feedback.
                  </p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={audioDsp.echoCancellation}
                    onChange={(e) => setAudioDsp(prev => ({ ...prev, echoCancellation: e.target.checked }))}
                  />
                  <span className="slider" />
                </label>
              </div>

              {/* Noise Suppression */}
              <div className="flex items-center justify-between py-1 border-t border-gray-800/80">
                <div>
                  <h5 className="text-xs sm:text-sm font-bold text-gray-200">Noise Suppression Filter</h5>
                  <p className="text-[11px] text-gray-400">
                    Suppresses background fans. Leave OFF for singing so high sustained notes are not clipped.
                  </p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={audioDsp.noiseSuppression}
                    onChange={(e) => setAudioDsp(prev => ({ ...prev, noiseSuppression: e.target.checked }))}
                  />
                  <span className="slider" />
                </label>
              </div>

              {/* Auto Gain Control */}
              <div className="flex items-center justify-between py-1 border-t border-gray-800/80">
                <div>
                  <h5 className="text-xs sm:text-sm font-bold text-gray-200">Automatic Gain Control (AGC)</h5>
                  <p className="text-[11px] text-gray-400">
                    Dynamically boosts or dampens microphone volume. OFF preserves dynamic expression (forte/piano).
                  </p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={audioDsp.autoGainControl}
                    onChange={(e) => setAudioDsp(prev => ({ ...prev, autoGainControl: e.target.checked }))}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>

            {/* Reset to Recommended Music Defaults */}
            <div className="flex justify-end">
              <button
                onClick={() => setAudioDsp({ echoCancellation: false, noiseSuppression: false, autoGainControl: false })}
                className="px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-xs text-gray-300 hover:text-white font-semibold flex items-center gap-1.5 transition-all border border-gray-700 shadow"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Recommended Vocal Defaults (All OFF)
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: TEST CALL (ECHO CHECK) */}
        {activeTab === 'testcall' && (
          <div className="space-y-6 animate-fadeIn max-w-xl mx-auto text-center">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Test Call Loopback (Echo Check)</h3>
              <p className="text-xs text-gray-400">
                Record a quick 5-second sample to verify your audio latency, microphone tone, and camera sync.
              </p>
            </div>

            {/* Test Video Stage */}
            <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-gray-800 shadow-xl flex items-center justify-center">
              {testCallState === 'recording' && (
                <>
                  <video
                    ref={testPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-red-950/20 pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-red-600/80 border-2 border-white flex items-center justify-center text-white font-black text-2xl shadow-2xl animate-pulse">
                      {countdown}s
                    </div>
                    <span className="mt-2 text-xs font-bold text-red-300 uppercase tracking-widest bg-black/60 px-3 py-1 rounded-full">
                      Recording 5s Sample...
                    </span>
                  </div>
                </>
              )}

              {testCallState === 'playing' && (
                <video
                  ref={playbackVideoRef}
                  controls
                  playsInline
                  className="w-full h-full object-cover"
                />
              )}

              {testCallState === 'idle' && (
                <div className="flex flex-col items-center justify-center text-gray-500 p-6">
                  <PhoneCall className="w-12 h-12 mb-3 text-purple-400/60" />
                  <span className="text-sm font-semibold text-gray-300">Ready to Record Sample</span>
                  <span className="text-xs text-gray-500 mt-1">Click the button below to start 5s test</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              {testCallState === 'idle' && (
                <button
                  onClick={startTestCallRecording}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Record 5s Sample
                </button>
              )}

              {testCallState === 'playing' && (
                <button
                  onClick={startTestCallRecording}
                  className="px-5 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-semibold text-xs border border-gray-700 transition-all flex items-center gap-2 shadow"
                >
                  <RefreshCw className="w-4 h-4" />
                  Record Another Sample
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: RINGTONE & AUDIO ALERTS */}
        {activeTab === 'ringtone' && (
          <div className="space-y-6 animate-fadeIn max-w-2xl">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-gray-900 border border-blue-500/30 flex items-start gap-3">
              <Bell className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white">Synthesized Melody Ringtones</h4>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  Choose the melody that rings when your teacher or instructor initiates a direct class call. All ringtones are synthesized dynamically in real-time via the Web Audio API—no external audio files required.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {RINGTONE_OPTIONS.map(opt => {
                const selected = selectedRingtone === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      setSelectedRingtone(opt.id);
                      saveSelectedRingtone(opt.id);
                    }}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      selected
                        ? 'bg-purple-950/60 border-purple-500 shadow-md shadow-purple-900/20'
                        : 'bg-gray-950/40 border-gray-800 hover:bg-gray-800/50 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                        selected ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'
                      }`}>
                        {selected ? <Check className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                      </div>
                      <div>
                        <h5 className="text-xs sm:text-sm font-bold text-white">{opt.name}</h5>
                        <p className="text-[11px] text-gray-400">
                          {opt.bpm} BPM • {opt.waveType === 'triangle' ? 'Triangle Wave' : 'Harmonic Sine Wave'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRingtone(opt.id);
                          saveSelectedRingtone(opt.id);
                          setIsPlayingRingtone(true);
                          previewRingtone(opt.id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 text-xs font-semibold flex items-center gap-1 transition-all active:scale-95 shadow"
                        title="Preview Melody"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Preview
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsPlayingRingtone(false);
                          stopRingtone();
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs font-semibold flex items-center gap-1 transition-all active:scale-95 shadow"
                        title="Stop Melody"
                      >
                        <Square className="w-3 h-3 fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: PROFILE & ACCOUNT */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-fadeIn max-w-xl">
            {currentUser ? (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* User Info Header */}
                <div className="flex items-center gap-3 p-3 bg-gray-950/60 rounded-2xl border border-gray-800">
                  <UserAvatar
                    photoURL={currentUser.photoURL || userProfile?.photoURL}
                    name={userProfile?.displayName || currentUser.displayName}
                    size="lg"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-white">{currentUser.displayName || 'Vocalist'}</h4>
                    <p className="text-xs text-gray-400">{currentUser.email}</p>
                    <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/30 uppercase">
                      {userProfile?.role || 'student'}
                    </span>
                  </div>
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-purple-400" />
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-blue-400" />
                    Phone / WhatsApp Contact
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 234 567 8900"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
                  />
                </div>

                {/* Vocal Range / Instrument */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-green-400" />
                    Vocal Range / Instrument
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Classical Soprano, Tenor, Harmonium"
                    value={instrument}
                    onChange={(e) => setInstrument(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
                  />
                </div>

                {/* Bio / Musical Goals */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-yellow-400" />
                    Bio / Musical Goals
                  </label>
                  <textarea
                    rows="3"
                    placeholder="Tell your instructor about your musical background and training goals..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500 transition-colors resize-none shadow-inner"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-8">
                <p className="text-xs text-gray-400 mb-3">Sign in to manage and customize your profile.</p>
                <Link
                  to="/dashboard"
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow"
                >
                  Go to Login
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
