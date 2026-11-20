import React from 'react';
import { Headphones } from 'lucide-react';

/**
 * Dedicated Audio-Only Acoustic Stage UI
 * Displays pulsing concentric sound rings, participant avatar, and 48kHz lossless indicator.
 */
export function AudioOnlyStage({ calleeName, remoteConnected }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 z-10 select-none">
      {/* Pulsing Concentric Audio Rings & Avatar */}
      <div className="relative flex items-center justify-center mb-6">
        {remoteConnected && (
          <>
            <div className="absolute w-44 h-44 rounded-full bg-purple-600/10 border border-purple-500/20 animate-ping pointer-events-none" />
            <div className="absolute w-36 h-36 rounded-full bg-purple-500/15 border border-purple-500/30 animate-pulse pointer-events-none" />
          </>
        )}
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-purple-700 via-indigo-600 to-pink-500 p-1 shadow-2xl flex items-center justify-center z-10">
          <div className="w-full h-full rounded-full bg-gray-950 flex flex-col items-center justify-center">
            <Headphones className="w-10 h-10 sm:w-12 sm:h-12 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Remote Participant Name */}
      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-1">
        {calleeName || 'Audio Call'}
      </h2>

      {/* High-Fidelity Acoustic Status */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
          remoteConnected
            ? 'bg-purple-950/60 text-purple-300 border-purple-500/40'
            : 'bg-gray-800 text-gray-400 border-gray-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${remoteConnected ? 'bg-purple-400 animate-pulse' : 'bg-gray-500'}`} />
          {remoteConnected ? 'Studio Audio Live (48kHz Lossless)' : 'Connecting Audio Stream...'}
        </span>
      </div>

      <p className="text-xs text-gray-400 font-mono">
        Pure acoustic mode &bull; Camera hardware disabled
      </p>
    </div>
  );
}
