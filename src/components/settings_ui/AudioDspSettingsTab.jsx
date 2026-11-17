import React, { useState } from 'react';
import {
  getAudioSettings,
  saveAudioSettings,
  getVoiceCallAudioSettings,
  saveVoiceCallAudioSettings
} from '../../services/media';
import {
  Sliders,
  Sparkles,
  RotateCcw,
  Check,
  Music,
  Headphones,
  AlertCircle,
  Phone
} from 'lucide-react';

export function AudioDspSettingsTab({ onSaved }) {
  // Mode selection: 'music' for video lessons/singing, 'voice' for phone/audio calls
  const [profileMode, setProfileMode] = useState('music');
  const [musicDsp, setMusicDsp] = useState(getAudioSettings);
  const [voiceDsp, setVoiceDsp] = useState(getVoiceCallAudioSettings);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const activeDsp = profileMode === 'music' ? musicDsp : voiceDsp;

  // Toggle individual DSP filter in the active profile
  const toggleDsp = (key) => {
    if (profileMode === 'music') {
      const updated = { ...musicDsp, [key]: !musicDsp[key] };
      setMusicDsp(updated);
      saveAudioSettings(updated);
    } else {
      const updated = { ...voiceDsp, [key]: !voiceDsp[key] };
      setVoiceDsp(updated);
      saveVoiceCallAudioSettings(updated);
    }
  };

  // Reset to defaults based on mode
  const handleResetDefaults = () => {
    if (profileMode === 'music') {
      const rawMusicDefaults = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        highpassFilter: false
      };
      setMusicDsp(rawMusicDefaults);
      saveAudioSettings(rawMusicDefaults);
    } else {
      const speechDefaults = {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        highpassFilter: true
      };
      setVoiceDsp(speechDefaults);
      saveVoiceCallAudioSettings(speechDefaults);
    }
    setSaveSuccess(true);
    if (onSaved) onSaved();
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Save current profile settings
  const handleSave = () => {
    if (profileMode === 'music') {
      saveAudioSettings(musicDsp);
    } else {
      saveVoiceCallAudioSettings(voiceDsp);
    }
    setSaveSuccess(true);
    if (onSaved) onSaved();
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Music Lesson DSP Option details
  const musicOptions = [
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

  // Voice Call DSP Option details
  const voiceOptions = [
    {
      key: 'echoCancellation',
      title: 'Acoustic Echo Cancellation (AEC)',
      recommendation: 'Recommended ON for Loudspeaker (No Headphones)',
      description: 'Stops phone or laptop speaker sound from looping back into your microphone. Essential for hands-free and speakerphone voice calls without headphones.'
    },
    {
      key: 'noiseSuppression',
      title: 'Noise Suppression Filter',
      recommendation: 'Recommended ON for Speech Clarity',
      description: 'Suppresses room background hiss, traffic, and fan noise so spoken dialogue is clean and easy to understand.'
    },
    {
      key: 'autoGainControl',
      title: 'Automatic Gain Control (AGC)',
      recommendation: 'Recommended ON for Balanced Talking Volume',
      description: 'Automatically regulates microphone sensitivity so you can speak at varying distances from your device without getting too quiet or distorted.'
    },
    {
      key: 'highpassFilter',
      title: 'Browser High-Pass Filter',
      recommendation: 'Recommended ON for Voice',
      description: 'Removes deep rumble and table vibration to keep speech frequencies crisp.'
    }
  ];

  const currentOptions = profileMode === 'music' ? musicOptions : voiceOptions;

  return (
    <div className="space-y-5">
      {/* Toast Alert on Save */}
      {saveSuccess && (
        <div className="p-3 bg-green-950/80 border border-green-600/70 text-green-300 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <span>
              {profileMode === 'music' ? 'Studio Music' : 'Voice Call'} DSP preferences saved. Will apply to subsequent sessions.
            </span>
          </div>
        </div>
      )}

      {/* Mode Switcher: Video/Music vs Voice/Audio Calls */}
      <div className="flex items-center gap-2 p-1 bg-gray-950/90 rounded-2xl border border-gray-800">
        <button
          type="button"
          onClick={() => setProfileMode('music')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${profileMode === 'music'
            ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
            : 'text-gray-400 hover:text-white hover:bg-gray-900/50'
            }`}
        >
          <Music className="w-4 h-4" />
          <span>Video & Music Lessons</span>
        </button>
        <button
          type="button"
          onClick={() => setProfileMode('voice')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${profileMode === 'voice'
            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
            : 'text-gray-400 hover:text-white hover:bg-gray-900/50'
            }`}
        >
          <Phone className="w-4 h-4" />
          <span>Voice / Audio Calls</span>
        </button>
      </div>

      {/* Acoustic Guide Banner */}
      {profileMode === 'music' ? (
        <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-4 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-purple-900/60 text-purple-300 border border-purple-500/30 shrink-0 mt-0.5">
            <Music className="w-4 h-4" />
          </div>
          <div className="space-y-1 text-xs">
            <h4 className="font-semibold text-purple-200">High-Fidelity Studio Acoustic Mode</h4>
            <p className="text-gray-400 leading-relaxed">
              Standard meeting software compresses singing and tanpura drones. In Alaapi, video music lessons transmit pristine <strong>48kHz stereo raw audio</strong> when wearing headphones with acoustic filters turned off.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 shrink-0 mt-0.5">
            <Phone className="w-4 h-4" />
          </div>
          <div className="space-y-1 text-xs">
            <h4 className="font-semibold text-emerald-200">Hands-Free Speech Mode (Loudspeaker Ready)</h4>
            <p className="text-gray-400 leading-relaxed">
              During audio-only voice calls, Speech Mode turns on <strong>Acoustic Echo Cancellation (AEC)</strong>, noise suppression, and AGC so you can talk comfortably without headphones attached. When the call ends, your music preset is automatically restored.
            </p>
          </div>
        </div>
      )}

      {/* DSP Filter Switches List */}
      <div className="space-y-3">
        {currentOptions.map((item) => {
          const isEnabled = Boolean(activeDsp[item.key]);
          return (
            <div
              key={item.key}
              onClick={() => toggleDsp(item.key)}
              className="p-3.5 bg-gray-950/80 border border-gray-800 hover:border-gray-700 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-4 select-none group"
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold text-gray-200 transition-colors ${profileMode === 'voice' ? 'group-hover:text-emerald-300' : 'group-hover:text-purple-300'
                    }`}>
                    {item.title}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${profileMode === 'voice'
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                    : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}>
                    {item.recommendation}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {item.description}
                </p>
              </div>

              {/* Smooth Toggle Switch */}
              <div className="shrink-0">
                <div
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${isEnabled
                    ? profileMode === 'voice'
                      ? 'bg-emerald-600'
                      : 'bg-purple-600'
                    : 'bg-gray-800 border border-gray-700'
                    }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform shadow-md ${isEnabled ? 'translate-x-5' : 'translate-x-0'
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
          <span>
            {profileMode === 'music'
              ? 'Reset to Studio Defaults (Raw Audio)'
              : 'Reset to Speech Defaults (All Filters ON)'}
          </span>
        </button>

        <button
          type="button"
          onClick={handleSave}
          className={`w-full sm:w-auto px-6 py-2.5 text-white rounded-xl text-xs font-semibold shadow-lg transition-all flex items-center justify-center gap-2 ${profileMode === 'voice'
            ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30'
            : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/30'
            }`}
        >
          <Check className="w-4 h-4" />
          <span>Save {profileMode === 'music' ? 'Music' : 'Voice Call'} Settings</span>
        </button>
      </div>
    </div>
  );
}
