import React, { useState, useEffect, useRef } from 'react';
import {
  getAudioSettings,
  saveAudioSettings
} from '../services/media';
import {
  X,
  Sliders,
  Mic,
  Volume2,
  Sparkles,
  Check,
  RotateCcw,
  Info,
  Radio
} from 'lucide-react';

export function AudioSettingsModal({ isOpen, onClose }) {
  const [settings, setSettings] = useState(getAudioSettings());
  const [mics, setMics] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const testStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);

  // Sync settings whenever opened
  useEffect(() => {
    if (isOpen) {
      setSettings(getAudioSettings());

      // Discover microphones
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices()
          .then(devices => {
            const audioIns = devices.filter(d => d.kind === 'audioinput');
            setMics(audioIns);
            if (audioIns.length > 0 && !selectedMicId) {
              setSelectedMicId(audioIns[0].deviceId);
            }
          })
          .catch(err => console.warn("Could not list audio devices:", err));
      }
    } else {
      stopMicTest();
    }
  }, [isOpen]);

  // Clean up mic test on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const stopMicTest = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) { }
      audioContextRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach(t => t.stop());
      testStreamRef.current = null;
    }
    setIsTestingMic(false);
    setMicLevel(0);
  };

  const startMicTest = async () => {
    try {
      stopMicTest();
      const constraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      setIsTestingMic(true);

      const updateMeter = () => {
        if (!testStreamRef.current) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        // Normalize 0..100
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      animFrameRef.current = requestAnimationFrame(updateMeter);
    } catch (err) {
      console.warn("Cannot start microphone test:", err);
      setIsTestingMic(false);
    }
  };

  const handleToggle = (key) => {
    const updated = {
      ...settings,
      [key]: !settings[key]
    };
    setSettings(updated);
    saveAudioSettings(updated);
  };

  const applyPreset = (preset) => {
    let newConf = {};
    if (preset === 'music') {
      newConf = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      };
    } else if (preset === 'speech') {
      newConf = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      };
    }
    setSettings(newConf);
    saveAudioSettings(newConf);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-900 border border-gray-700/80 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative text-left flex flex-col max-h-[92vh] overflow-hidden">

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-600/25 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Audio & DSP Settings</h3>
              <p className="text-xs text-gray-400">Configure acoustic processing before class starts</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopMicTest();
              onClose();
            }}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1 custom-scrollbar">

          {/* Vocal Teacher Tip */}
          <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-3.5 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-xs text-purple-200/90 leading-relaxed">
              <strong>Studio Pro Tip:</strong> For acoustic music and vocal singing lessons, turn <span className="text-purple-300 font-semibold">OFF</span> all DSP filters and use headphones to unlock pure <strong>48kHz lossless stereo dynamics</strong> without vocal clipping.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Presets:</span>
            <button
              onClick={() => applyPreset('music')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${!settings.echoCancellation && !settings.noiseSuppression && !settings.autoGainControl
                ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/30'
                : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-700'
                }`}
            >
              🎵 Music & Vocals
            </button>
            <button
              onClick={() => applyPreset('speech')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${settings.echoCancellation && settings.noiseSuppression && settings.autoGainControl
                ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-900/30'
                : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-700'
                }`}
            >
              🗣️ Spoken Speech
            </button>
          </div>

          {/* The 3 DSP Toggles matching user interface */}
          <div className="bg-gray-950/80 rounded-2xl border border-gray-800/90 p-4 space-y-3.5 divide-y divide-gray-800/70">

            {/* 1. Echo Cancellation */}
            <div className="flex items-center justify-between pt-1 first:pt-0">
              <div className="pr-4">
                <span className="text-sm font-semibold text-white block">Echo Cancellation</span>
                <span className="text-[11px] text-gray-400 block leading-tight mt-0.5">
                  Eliminates feedback. Turn OFF with headphones for high-fidelity 48kHz music.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('echoCancellation')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.echoCancellation ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                role="switch"
                aria-checked={settings.echoCancellation}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${settings.echoCancellation ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

            {/* 2. Noise Suppression */}
            <div className="flex items-center justify-between pt-3">
              <div className="pr-4">
                <span className="text-sm font-semibold text-white block">Noise Suppression</span>
                <span className="text-[11px] text-gray-400 block leading-tight mt-0.5">
                  Suppresses ambient hum. Turn OFF to prevent clipping soft vocal vibrato.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('noiseSuppression')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.noiseSuppression ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                role="switch"
                aria-checked={settings.noiseSuppression}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${settings.noiseSuppression ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

            {/* 3. Auto Gain Control */}
            <div className="flex items-center justify-between pt-3">
              <div className="pr-4">
                <span className="text-sm font-semibold text-white block">Auto Gain Control</span>
                <span className="text-[11px] text-gray-400 block leading-tight mt-0.5">
                  Normalizes volume. Turn OFF to maintain natural dynamic singing expression.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggle('autoGainControl')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.autoGainControl ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                role="switch"
                aria-checked={settings.autoGainControl}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${settings.autoGainControl ? 'translate-x-5' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

          </div>

          {/* Microphone Selection & Live VU Meter */}
          <div className="bg-gray-950/80 rounded-2xl border border-gray-800/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-purple-400" />
                Select Audio Input (Microphone)
              </label>
              <button
                onClick={isTestingMic ? stopMicTest : startMicTest}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1 transition-all ${isTestingMic
                  ? 'bg-red-950/80 text-red-300 border-red-700 animate-pulse'
                  : 'bg-gray-800 text-gray-300 border-gray-700 hover:text-white'
                  }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                {isTestingMic ? "Stop Mic Test" : "Test Mic"}
              </button>
            </div>

            {mics.length > 0 ? (
              <select
                value={selectedMicId}
                onChange={(e) => {
                  setSelectedMicId(e.target.value);
                  if (isTestingMic) {
                    stopMicTest();
                  }
                }}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                {mics.map(m => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || `Microphone ${m.deviceId.substring(0, 5)}...`}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-500 italic bg-gray-900/60 p-2 rounded-xl">
                Default system microphone (grant mic permissions to view list)
              </p>
            )}

            {/* Live VU Meter Bar */}
            {isTestingMic && (
              <div className="pt-2">
                <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                  <span>Input Signal Level</span>
                  <span className="font-mono text-xs text-purple-300">{micLevel}%</span>
                </div>
                <div className="w-full h-3 bg-gray-900 rounded-full overflow-hidden p-0.5 border border-gray-800 flex">
                  <div
                    className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-gray-800 flex items-center justify-end gap-2.5 shrink-0">
          <button
            onClick={() => {
              stopMicTest();
              onClose();
            }}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-semibold text-xs transition-all shadow-lg shadow-purple-900/40 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Done & Save Settings
          </button>
        </div>

      </div>
    </div>
  );
}

