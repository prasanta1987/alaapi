import React from 'react';
import { Clock, Copy, Check, Share2, Music, Volume2, VolumeX } from 'lucide-react';
import { MicVUMeter, NetworkVUMeter } from './VUMeters';

/**
 * Middle: Session Info (Clean Desktop Card with Room ID, Call Duration & Health)
 */
export function SessionInfoCard({
  roomId,
  remoteConnected,
  copiedRoomId,
  onCopyRoomId,
  onShareRoomLink,
  callDuration,
  formatDuration,
  micLevel,
  isMuted,
  hasLocalAudio,
  pingRtt,
  isReconnecting,
  remoteVolume,
  onVolumeChange,
  statusText
}) {
  return (
    <div className="sidebar-info-card flex-col gap-2.5 p-3.5 bg-gray-950/70 rounded-xl border border-gray-800 text-xs">
      {/* Room ID Row: Only shown before call is connected so user can copy & share it */}
      {!remoteConnected && (
        <div className="flex items-center justify-between bg-gray-900/90 px-3 py-2 rounded-lg border border-purple-500/30">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Room ID</span>
            <span className="text-base font-mono font-bold text-purple-400 tracking-wider select-all">{roomId}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onCopyRoomId}
              title="Copy Room ID"
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors cursor-pointer"
            >
              {copiedRoomId ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={onShareRoomLink}
              title="Share Room Link"
              className="text-purple-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Call Running Timer & Dual VU Meters: Mic & Network */}
      <div className={`flex items-center justify-between gap-2 ${!remoteConnected ? 'pt-1 border-t border-gray-800' : ''}`}>
        <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-purple-300 bg-purple-950/40 px-2.5 py-1 rounded-md border border-purple-500/30">
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span>{formatDuration(callDuration)}</span>
        </div>

        {/* Dual VU Meters: Mic VU & Network VU (+ Tuner link) */}
        <div className="flex items-center gap-1.5">
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
          <button
            type="button"
            onClick={() => window.open('/tuner', '_blank')}
            title="Open Swara & Pitch Tuner in a new tab"
            className="text-gray-400 hover:text-purple-300 p-1 rounded hover:bg-gray-800 transition-colors ml-0.5 cursor-pointer"
          >
            <Music className="w-3.5 h-3.5 text-purple-400" />
          </button>
        </div>
      </div>

      {/* Remote Acoustic Monitor Volume Slider */}
      {remoteConnected && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
          <button
            type="button"
            onClick={() => onVolumeChange(remoteVolume > 0 ? 0 : 100)}
            title={remoteVolume === 0 ? "Unmute Monitor" : "Mute Monitor"}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            {remoteVolume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-purple-400" />
            )}
          </button>
          <span className="text-[10px] font-medium text-gray-400 shrink-0">Monitor:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={remoteVolume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
            title={`Acoustic monitor volume: ${remoteVolume}%`}
          />
          <span className="text-[10px] font-mono text-gray-300 w-7 text-right shrink-0">{remoteVolume}%</span>
        </div>
      )}

      {/* Status Display */}
      <div className="pt-1 border-t border-gray-800">
        <p className="text-gray-300 font-mono text-[11px] leading-relaxed break-words">
          {statusText}
        </p>
      </div>
    </div>
  );
}
