import React from 'react';
import { Mic, MicOff, Wifi } from 'lucide-react';

/**
 * 1. Microphone VU Meter (Audio pickup level & mute status)
 */
export function MicVUMeter({ micLevel, isMuted, hasLocalAudio }) {
  return (
    <div
      className="bg-gray-900/90 backdrop-blur px-2 py-1 rounded-full border border-purple-500/40 flex items-center gap-1.5 shadow-md"
      title={isMuted ? "Microphone is Muted" : !hasLocalAudio ? "No Microphone Detected" : `Mic Pickup: ${micLevel}%`}
    >
      {isMuted || !hasLocalAudio ? (
        <MicOff className="w-3 h-3 text-red-400 shrink-0" />
      ) : (
        <Mic className="w-3 h-3 text-purple-400 shrink-0" />
      )}

      {/* 4-bar mini Mic VU meter */}
      <div className="flex items-end gap-0.5 h-3 px-0.5">
        {[1, 2, 3, 4].map(barIndex => {
          const threshold = barIndex === 1 ? 6 : barIndex === 2 ? 25 : barIndex === 3 ? 55 : 80;
          const active = !isMuted && hasLocalAudio && micLevel >= threshold;
          return (
            <span
              key={barIndex}
              style={{ height: `${barIndex * 2.5 + 2}px` }}
              className={`w-1 rounded-full transition-all duration-75 ${
                isMuted || !hasLocalAudio
                  ? 'bg-red-500/40'
                  : active
                    ? barIndex >= 4 ? 'bg-amber-400' : 'bg-emerald-400'
                    : 'bg-gray-700'
              }`}
            />
          );
        })}
      </div>

      <span className="text-[10px] font-mono font-medium text-gray-300">
        {isMuted ? (
          <span className="text-red-400 font-semibold">Muted</span>
        ) : !hasLocalAudio ? (
          <span className="text-gray-500">None</span>
        ) : (
          `${micLevel}%`
        )}
      </span>
    </div>
  );
}

/**
 * 2. Network VU Meter (WebRTC latency / ping signal strength)
 */
export function NetworkVUMeter({ pingRtt, remoteConnected, isReconnecting }) {
  let activeBars = 0;
  let barColor = 'bg-gray-700';
  let textColor = 'text-gray-400';
  let label = '';

  if (!remoteConnected) {
    activeBars = 1;
    barColor = 'bg-gray-700';
    textColor = 'text-gray-500';
    label = ''; // No "Waiting" text shown here
  } else if (isReconnecting) {
    activeBars = 1;
    barColor = 'bg-amber-400 animate-pulse';
    textColor = 'text-amber-400 font-semibold';
    label = 'Recon...';
  } else if (pingRtt === null) {
    activeBars = 4;
    barColor = 'bg-emerald-400';
    textColor = 'text-emerald-400';
    label = '48kHz';
  } else {
    label = `${pingRtt}ms`;
    if (pingRtt < 120) {
      activeBars = 4;
      barColor = 'bg-emerald-400';
      textColor = 'text-emerald-300';
    } else if (pingRtt < 220) {
      activeBars = 3;
      barColor = 'bg-emerald-400';
      textColor = 'text-emerald-300';
    } else if (pingRtt < 380) {
      activeBars = 2;
      barColor = 'bg-amber-400';
      textColor = 'text-amber-400';
    } else {
      activeBars = 1;
      barColor = 'bg-red-500';
      textColor = 'text-red-400';
    }
  }

  return (
    <div
      className="bg-gray-900/90 backdrop-blur px-2 py-1 rounded-full border border-purple-500/40 flex items-center gap-1.5 shadow-md"
      title={
        !remoteConnected
          ? "Waiting for participant to connect"
          : isReconnecting
            ? "Network interruption... Reconnecting..."
            : `Network Round-Trip Time (RTT): ${pingRtt !== null ? `${pingRtt}ms` : 'High-fidelity 48kHz audio active'}`
      }
    >
      <Wifi className={`w-3 h-3 shrink-0 ${textColor}`} />

      {/* 4-bar cellular / signal VU meter */}
      <div className="flex items-end gap-0.5 h-3 px-0.5">
        {[1, 2, 3, 4].map(barIndex => {
          const isActive = barIndex <= activeBars;
          return (
            <span
              key={barIndex}
              style={{ height: `${barIndex * 2.5 + 2}px` }}
              className={`w-1 rounded-full transition-all duration-150 ${
                isActive ? barColor : 'bg-gray-800'
              }`}
            />
          );
        })}
      </div>

      {label ? (
        <span className={`text-[10px] font-mono font-medium ${textColor}`}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
