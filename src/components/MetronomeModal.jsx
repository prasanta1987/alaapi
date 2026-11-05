import React, { useState, useEffect, useRef } from 'react';
import {
  startMetronome,
  stopMetronome,
  updateMetronomeParams,
  setMetronomeVolume,
  toggleMetronomeMute,
  getMetronomeState
} from '../services/metronome';
import { getPeerClockOffset } from '../services/webrtc';
import {
  X,
  Play,
  Square,
  Plus,
  Minus,
  Volume2,
  VolumeX,
  Activity,
  RotateCcw,
  Sparkles,
  Radio,
  CheckCircle2
} from 'lucide-react';

export function MetronomeModal({
  isOpen,
  onClose,
  metronomeData, // From Firestore room: { active, bpm, beatsPerBar, startEpoch }
  onSyncMetronome // Callback to update Firestore room: (newMetronomeData) => void
}) {
  const [bpm, setBpm] = useState(metronomeData?.bpm || 120);
  const [beatsPerBar, setBeatsPerBar] = useState(metronomeData?.beatsPerBar || 4);
  const [activeBeat, setActiveBeat] = useState(0);
  const [isAccent, setIsAccent] = useState(false);
  const [localVol, setLocalVol] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  const tapTimesRef = useRef([]);

  const isActive = Boolean(metronomeData?.active);

  // Sync state whenever remote peer updates metronome in Firestore
  useEffect(() => {
    if (metronomeData) {
      if (metronomeData.bpm && metronomeData.bpm !== bpm) {
        setBpm(metronomeData.bpm);
      }
      if (metronomeData.beatsPerBar && metronomeData.beatsPerBar !== beatsPerBar) {
        setBeatsPerBar(metronomeData.beatsPerBar);
      }

      if (metronomeData.active) {
        // Calibrate clock offset to eliminate cross-device millisecond skew
        const clockOffset = getPeerClockOffset();
        const baseEpoch = metronomeData.startEpoch || Date.now();
        // If data was broadcast from peer, adjust with measured clock skew
        const adjustedStartEpoch = metronomeData.isLocal ? baseEpoch : (baseEpoch + clockOffset);

        startMetronome({
          bpm: metronomeData.bpm || 120,
          beatsPerBar: metronomeData.beatsPerBar || 4,
          startEpoch: adjustedStartEpoch,
          onBeat: (beatNum, accent) => {
            setActiveBeat(beatNum);
            setIsAccent(accent);
          }
        });
      } else {
        stopMetronome();
        setActiveBeat(0);
        setIsAccent(false);
      }
    }
  }, [metronomeData]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      // Keep metronome ticking if active in call
    };
  }, []);

  const handleToggleActive = () => {
    const nextActive = !isActive;

    if (nextActive) {
      // 500ms Future Arming Window: gives both machines enough time to receive the signal
      // and align Web Audio hardware timers to strike Beat 1 at the EXACT same millisecond.
      const scheduledStart = Date.now() + 500;
      const updated = {
        active: true,
        bpm,
        beatsPerBar,
        startEpoch: scheduledStart,
        updatedAt: Date.now(),
        isLocal: true
      };

      if (onSyncMetronome) {
        onSyncMetronome(updated);
      }

      startMetronome({
        bpm,
        beatsPerBar,
        startEpoch: scheduledStart,
        onBeat: (beatNum, accent) => {
          setActiveBeat(beatNum);
          setIsAccent(accent);
        }
      });
    } else {
      const updated = {
        active: false,
        bpm,
        beatsPerBar,
        startEpoch: 0,
        updatedAt: Date.now(),
        isLocal: true
      };

      if (onSyncMetronome) {
        onSyncMetronome(updated);
      }

      stopMetronome();
      setActiveBeat(0);
      setIsAccent(false);
    }
  };

  const handleBpmChange = (newBpm) => {
    const clamped = Math.max(30, Math.min(260, Math.round(newBpm)));
    setBpm(clamped);

    if (isActive) {
      // 400ms transition window for instantaneous phase-locked tempo change
      const scheduledTransition = Date.now() + 400;
      const updated = {
        active: true,
        bpm: clamped,
        beatsPerBar,
        startEpoch: scheduledTransition,
        updatedAt: Date.now(),
        isLocal: true
      };

      if (onSyncMetronome) {
        onSyncMetronome(updated);
      }

      updateMetronomeParams({
        bpm: clamped,
        beatsPerBar,
        startEpoch: scheduledTransition
      });
    } else {
      updateMetronomeParams({ bpm: clamped });
    }
  };

  const handleBeatsPerBarChange = (newBeats) => {
    setBeatsPerBar(newBeats);
    if (isActive) {
      const scheduledTransition = Date.now() + 400;
      const updated = {
        active: true,
        bpm,
        beatsPerBar: newBeats,
        startEpoch: scheduledTransition,
        updatedAt: Date.now(),
        isLocal: true
      };

      if (onSyncMetronome) {
        onSyncMetronome(updated);
      }

      updateMetronomeParams({
        beatsPerBar: newBeats,
        startEpoch: scheduledTransition
      });
    } else {
      updateMetronomeParams({ beatsPerBar: newBeats });
    }
  };

  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    if (taps.length > 0 && now - taps[taps.length - 1] > 2500) {
      tapTimesRef.current = [];
    }
    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > 4) {
      tapTimesRef.current.shift();
    }
    if (tapTimesRef.current.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      handleBpmChange(calculatedBpm);
    }
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setLocalVol(v);
    setMetronomeVolume(v);
  };

  const handleMuteToggle = () => {
    const muted = toggleMetronomeMute();
    setIsMuted(muted);
  };

  // Tempo markings
  const getTempoName = (tempo) => {
    if (tempo < 60) return "Largo / Adagio";
    if (tempo < 76) return "Adagio";
    if (tempo < 108) return "Andante";
    if (tempo < 120) return "Moderato";
    if (tempo < 156) return "Allegro";
    if (tempo < 176) return "Vivace";
    return "Presto";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-gray-900 border border-gray-700/80 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative text-center flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              isActive ? 'bg-purple-600/30 text-purple-400 border border-purple-500/50' : 'bg-gray-800 text-gray-400'
            }`}>
              <Activity className={`w-4 h-4 ${isActive ? 'animate-pulse' : ''}`} />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                Studio Metronome
                <span className="text-[10px] px-1.5 py-0.2 rounded font-normal bg-purple-950 text-purple-300 border border-purple-800/40">
                  Dual-Sync
                </span>
              </h3>
              <p className="text-[10px] text-gray-400">Synchronized on both devices</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BPM & Visual Beat Animation */}
        <div className="py-4">
          <div className="text-center mb-1">
            <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white flex items-baseline justify-center gap-1">
              <span>{bpm}</span>
              <span className="text-xs font-sans font-bold text-purple-400 uppercase">BPM</span>
            </div>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mt-0.5">
              {getTempoName(bpm)}
            </p>
          </div>

          {/* Visual Rhythm Dots Animation */}
          <div className="flex items-center justify-center gap-2.5 my-3 py-2 bg-gray-950/60 rounded-2xl border border-gray-800/70">
            {Array.from({ length: beatsPerBar }).map((_, i) => {
              const beatNum = i + 1;
              const isCurrent = activeBeat === beatNum;
              const isFirstBeat = beatNum === 1;

              return (
                <div
                  key={beatNum}
                  className={`relative flex items-center justify-center transition-all duration-75 rounded-full ${
                    isCurrent
                      ? isFirstBeat
                        ? 'w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 text-gray-950 font-black shadow-lg shadow-amber-500/50 scale-110 ring-2 ring-white/50'
                        : 'w-9 h-9 bg-purple-500 text-white font-bold shadow-lg shadow-purple-500/50 scale-105 ring-2 ring-purple-300/40'
                      : 'w-8 h-8 bg-gray-800 text-gray-400 border border-gray-700/60 font-semibold'
                  }`}
                >
                  <span className="text-xs font-mono">{beatNum}</span>
                </div>
              );
            })}
          </div>

          {/* BPM Adjustment Buttons */}
          <div className="flex items-center justify-center gap-2 mt-2">
            <button
              onClick={() => handleBpmChange(bpm - 5)}
              className="px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-bold transition-all border border-gray-700"
              title="Minus 5 BPM"
            >
              -5
            </button>
            <button
              onClick={() => handleBpmChange(bpm - 1)}
              className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-white transition-all border border-gray-700 shadow-sm"
              title="Minus 1 BPM"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Tap Tempo Button */}
            <button
              onClick={handleTapTempo}
              className="px-3.5 py-1.5 rounded-xl bg-purple-900/40 hover:bg-purple-900/70 active:scale-95 text-purple-200 border border-purple-600/40 text-xs font-bold uppercase tracking-wider transition-all"
            >
              Tap Tempo
            </button>

            <button
              onClick={() => handleBpmChange(bpm + 1)}
              className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-white transition-all border border-gray-700 shadow-sm"
              title="Plus 1 BPM"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleBpmChange(bpm + 5)}
              className="px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-300 text-xs font-bold transition-all border border-gray-700"
              title="Plus 5 BPM"
            >
              +5
            </button>
          </div>

          {/* BPM Range Slider */}
          <div className="mt-3 px-1">
            <input
              type="range"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => handleBpmChange(Number(e.target.value))}
              className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {/* Time Signature Buttons */}
          <div className="flex items-center justify-between gap-1.5 mt-3 pt-3 border-t border-gray-800 text-xs">
            <span className="text-[11px] font-semibold text-gray-400">Time Signature:</span>
            <div className="flex items-center gap-1">
              {[2, 3, 4, 6].map((num) => (
                <button
                  key={num}
                  onClick={() => handleBeatsPerBarChange(num)}
                  className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    beatsPerBar === num
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {num === 6 ? '6/8' : `${num}/4`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Start / Stop Main Button */}
        <div className="mt-1">
          <button
            onClick={handleToggleActive}
            className={`w-full py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-xl transition-all active:scale-98 ${
              isActive
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/40 animate-pulse'
                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40'
            }`}
          >
            {isActive ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                Stop Metronome (Live on Both Sides)
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                Start Metronome (Sync Both Sides)
              </>
            )}
          </button>
        </div>

        {/* Local Audio Volume Control */}
        <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between gap-3 text-xs text-gray-400">
          <button
            onClick={handleMuteToggle}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
            title={isMuted ? "Unmute local click" : "Mute local click"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-purple-400" />}
            <span className="text-[11px]">{isMuted ? "Click Muted" : "My Click Vol"}</span>
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : localVol}
            disabled={isMuted}
            onChange={handleVolumeChange}
            className="w-28 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>

      </div>
    </div>
  );
}

