import React, { useState } from 'react';
import {
  getAudioSettings,
  saveAudioSettings
} from '../../services/media';
import {
  Sliders,
  Sparkles,
  RotateCcw,
  Check,
  Music,
  Headphones,
  AlertCircle
} from 'lucide-react';

export function AudioDspSettingsTab({ onSaved }) {
  const [audioDsp, setAudioDsp] = useState(getAudioSettings());
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Toggle individual DSP filter
  const toggleDsp = (key) => {
    setAudioDsp(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Reset to Studio Music Defaults (raw 48kHz audio with all filters OFF)
  const handleResetDefaults = () => {
    const rawDefaults = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      highpassFilter: false
    };
    setAudioDsp(rawDefaults);
    saveAudioSettings(rawDefaults);
    setSaveSuccess(true);
    if (onSaved) onSaved();
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Save customized audio settings
  const handleSave = () => {
    saveAudioSettings(audioDsp);
    setSaveSuccess(true);
    if (onSaved) onSaved();
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const dspOptions = [
    {
      key: 'echoCancellation',
      title: 'Acoustic Echo Cancellation (AEC)',
      recommendation: 'Recommended OFF for Singing with Headphones',
      description: 'Cancels loudspeaker audio loopback. When wearing headphones or using an audio interface, disabling AEC prevents subtle phase distortion and pitch wobbling.'
    },
    {
      key: 'noiseSuppression',
      title: 'Noise Suppression Filter',
      recommendation: 'Recommended OFF for Music & Instruments',
      description: 'Removes background steady noise. Disabling allows quiet vocal breath nuances, soft string harmonics, and natural room resonance to pass through unattenuated.'
    },
    {
      key: 'autoGainControl',
      title: 'Automatic Gain Control (AGC)',
      recommendation: 'Recommended OFF for Expressive Dynamic Range',
      description: 'Automatically compresses loud vocal notes and boosts soft passages. Disabling preserves your natural vocal dynamics from pianissimo to fortissimo.'
    },
    {
      key: 'highpassFilter',
      title: 'Browser High-Pass / Low-Cut Filter',
      recommendation: 'Optional',
      description: 'Cuts frequencies below 80Hz. Useful only if experiencing extreme table bumps, AC hum, or air wind without an external pop filter.'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Toast Alert on Save */}
      {saveSuccess && (
        <div className="p-3 bg-green-950/80 border border-green-600/70 text-green-300 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <span>Audio DSP preferences saved. Will apply to subsequent sessions.</span>
          </div>
        </div>
      )}

      {/* Acoustic Guide Banner */}
      <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-4 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-purple-900/60 text-purple-300 border border-purple-500/30 shrink-0 mt-0.5">
          <Music className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-xs">
          <h4 className="font-semibold text-purple-200">High-Fidelity Studio Acoustic Mode</h4>
          <p className="text-gray-400 leading-relaxed">
            Standard video meeting software applies aggressive speech filters that chop sustained singing notes and acoustic instruments.
            Alaapi transmits pristine <strong>48kHz stereo raw audio</strong> by default when acoustic filters are switched off.
          </p>
        </div>
      </div>

      {/* DSP Filter Switches List */}
      <div className="space-y-3">
        {dspOptions.map((item) => {
          const isEnabled = Boolean(audioDsp[item.key]);
          return (
            <div
              key={item.key}
              onClick={() => toggleDsp(item.key)}
              className="p-3.5 bg-gray-950/80 border border-gray-800 hover:border-gray-700 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-4 select-none group"
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-200 group-hover:text-purple-300 transition-colors">
                    {item.title}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                    {item.recommendation}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {item.description}
                </p>
              </div>

              {/* iOS-style Smooth Toggle Switch */}
              <div className="shrink-0">
                <div
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                    isEnabled ? 'bg-purple-600' : 'bg-gray-800 border border-gray-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform shadow-md ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions: Reset Defaults & Save */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={handleResetDefaults}
          className="w-full sm:w-auto px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white rounded-xl text-xs font-semibold border border-gray-700 transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset to Studio Defaults (Raw Audio)</span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="w-full sm:w-auto px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          <span>Save Audio Settings</span>
        </button>
      </div>
    </div>
  );
}
