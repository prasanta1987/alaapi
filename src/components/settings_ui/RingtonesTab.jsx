import React, { useState, useEffect } from 'react';
import {
  RINGTONE_OPTIONS,
  getSelectedRingtone,
  saveSelectedRingtone,
  previewRingtone,
  stopRingtone,
  unlockAudioContext
} from '../../services/ringtone';
import {
  Bell,
  Play,
  Square,
  Sparkles,
  Music,
  Check,
  CheckCircle2,
  Volume2
} from 'lucide-react';

export function RingtonesTab({ onSaved }) {
  const [selectedId, setSelectedId] = useState(getSelectedRingtone());
  const [playingId, setPlayingId] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Stop ringtone preview on unmount
  useEffect(() => {
    return () => {
      stopRingtone();
    };
  }, []);

  // Handle selecting a ringtone
  const handleSelectRingtone = (id) => {
    setSelectedId(id);
    saveSelectedRingtone(id);
    setSaveSuccess(true);
    if (onSaved) onSaved(id);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Preview melody
  const handlePreview = (e, id) => {
    e.stopPropagation();
    unlockAudioContext();

    if (playingId === id) {
      stopRingtone();
      setPlayingId(null);
    } else {
      stopRingtone();
      setPlayingId(id);
      previewRingtone(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert on Save */}
      {saveSuccess && (
        <div className="p-3 bg-green-950/80 border border-green-600/70 text-green-300 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <span>Ringtone updated to "{RINGTONE_OPTIONS.find(r => r.id === selectedId)?.name}".</span>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-4 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-purple-900/60 text-purple-300 border border-purple-500/30 shrink-0 mt-0.5">
          <Bell className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-xs">
          <h4 className="font-semibold text-purple-200">Web Audio Synthesized Melodies</h4>
          <p className="text-gray-400 leading-relaxed">
            All ringtones are dynamically generated via harmonic oscillators in real time with <strong>zero external MP3 downloads</strong>.
            They work seamlessly on mobile browsers, desktop PCs, and installed PWAs even when offline.
          </p>
        </div>
      </div>

      {/* Melodies Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RINGTONE_OPTIONS.map((item) => {
          const isSelected = selectedId === item.id;
          const isPlaying = playingId === item.id;

          return (
            <div
              key={item.id}
              onClick={() => handleSelectRingtone(item.id)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                isSelected
                  ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-900/20'
                  : 'bg-gray-950/80 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-gray-900 text-gray-400'
                  }`}
                >
                  <Music className="w-4 h-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-200 truncate">
                      {item.name}
                    </span>
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 block truncate">
                    {item.description || 'Synthesized musical ring'}
                  </span>
                </div>
              </div>

              {/* Preview Button */}
              <button
                type="button"
                onClick={(e) => handlePreview(e, item.id)}
                className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors ${
                  isPlaying
                    ? 'bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/40'
                    : 'bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700'
                }`}
                title={isPlaying ? "Stop Preview" : `Preview ${item.name}`}
              >
                {isPlaying ? (
                  <>
                    <Square className="w-3.5 h-3.5 text-red-400 fill-current" />
                    <span className="text-[10px] font-semibold hidden xs:inline">Stop</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-purple-400 fill-current" />
                    <span className="text-[10px] font-semibold hidden xs:inline">Test</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-gray-500 text-center">
        When an incoming direct call arrives from your teacher or student, your selected melody will ring automatically.
      </p>
    </div>
  );
}
