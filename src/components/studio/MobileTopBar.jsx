import React from 'react';
import { Clock, Copy, Check, Share2 } from 'lucide-react';
import { MicVUMeter, NetworkVUMeter } from './VUMeters';

/**
 * Mobile Top Overlay Bar: Call Timer, Health Diagnostic VU Meters & Room ID (Auto-dims on mobile idle)
 */
export function MobileTopBar({
  callDuration,
  formatDuration,
  micLevel,
  isMuted,
  hasLocalAudio,
  pingRtt,
  remoteConnected,
  isReconnecting,
  roomId,
  copiedRoomId,
  onCopyRoomId,
  onShareRoomLink,
  isControlsDimmed
}) {
  return (
    <div
      className={`mobile-top-bar absolute top-3 pt-[env(safe-area-inset-top,0px)] inset-x-3 z-20 flex items-center justify-between pointer-events-none transition-opacity duration-300 ${
        isControlsDimmed ? 'opacity-25 hover:opacity-100' : 'opacity-100'
      }`}
    >
      <div className="flex items-center gap-1.5 pointer-events-auto">
        {/* Call Running Timer on Mobile / Video Feed */}
        <div className="bg-gray-900/85 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold text-purple-300 flex items-center gap-1.5 border border-purple-500/30 shadow">
          <Clock className="w-3 h-3 text-purple-400" />
          <span>{formatDuration(callDuration)}</span>
        </div>

        {/* Dual VU Meters: Mic & Network */}
        <MicVUMeter
          micLevel={micLevel}
          isMuted={isMuted}
          hasLocalAudio={hasLocalAudio}
        />
        <NetworkVUMeter
          pingRtt={pingRtt}
          remoteConnected={remoteConnected}
          isReconnecting={isReconnecting}
        />
      </div>

      {/* Room ID Badge: Only shown before call is connected so user can copy & share it */}
      {!remoteConnected && (
        <div className="bg-gray-900/90 backdrop-blur border border-purple-500/40 rounded-full px-3 py-1 shadow-lg flex items-center gap-2 pointer-events-auto">
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Room</span>
          <span className="text-sm font-mono font-bold text-purple-400 tracking-wider select-all">{roomId}</span>
          <button
            onClick={onCopyRoomId}
            title="Copy Room ID"
            className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-gray-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            {copiedRoomId ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onShareRoomLink}
            title="Share Room Link"
            className="text-purple-400 hover:text-white p-0.5 rounded hover:bg-gray-800 transition-colors flex items-center justify-center ml-0.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
