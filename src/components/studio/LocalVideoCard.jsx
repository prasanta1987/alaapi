import React from 'react';
import { Video, VideoOff, FlipHorizontal, Headphones } from 'lucide-react';

/**
 * Top User Camera Card on Side Panel / Mobile Overlay
 */
export function LocalVideoCard({
  localVideoRef,
  hasLocalVideo,
  hasLocalAudio,
  isLocalMirrored,
  onToggleLocalMirror,
  remoteConnected,
  isAudioOnly
}) {
  return (
    <div className="w-full flex flex-col gap-2 shrink-0">
      <div className="sidebar-header items-center justify-between text-xs font-semibold text-gray-300 uppercase tracking-wider px-1">
        <span className="flex items-center gap-1.5">
          {hasLocalVideo ? (
            <Video className="w-3.5 h-3.5 text-purple-400" />
          ) : (
            <VideoOff className="w-3.5 h-3.5 text-gray-500" />
          )}
          {hasLocalVideo ? 'Your Camera' : 'Camera (None)'}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Connected / Waiting Badge placed near the video feed */}
          <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            remoteConnected
              ? 'bg-green-950/60 text-green-400 border-green-500/40'
              : 'bg-gray-800/80 text-gray-400 border-gray-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              remoteConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
            }`} />
            {remoteConnected ? 'Connected' : 'Waiting...'}
          </span>

          <span className={`flex items-center gap-1.5 text-[11px] font-normal lowercase ${
            hasLocalVideo ? 'text-green-400' : 'text-gray-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              hasLocalVideo ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
            }`} />
            {hasLocalVideo ? 'live' : 'inactive'}
          </span>
        </div>
      </div>

      <div
        id="localVideoContainer"
        className="pointer-events-auto relative bg-gray-950 rounded-xl overflow-hidden border border-gray-700/80 shadow-2xl shrink-0 self-end md:self-auto flex items-center justify-center min-h-[100px]"
      >
        <video
          ref={localVideoRef}
          id="localVideo"
          className={`w-full h-full object-cover ${isLocalMirrored ? 'scale-x-[-1]' : ''} ${hasLocalVideo ? '' : 'hidden'}`}
          autoPlay
          playsInline
          muted
        />

        {/* Mirror Toggle Button on Overlay Video Feed */}
        {hasLocalVideo && (
          <button
            onClick={onToggleLocalMirror}
            title={isLocalMirrored ? "Switch to Normal (Unmirrored)" : "Switch to Mirrored"}
            className="absolute top-1 left-1 sm:top-1.5 sm:left-1.5 z-20 bg-black/60 hover:bg-black/90 active:scale-95 text-gray-200 hover:text-white px-1.5 py-0.5 sm:py-1 rounded-md backdrop-blur border border-white/20 transition-all flex items-center gap-1 shadow-md cursor-pointer"
          >
            <FlipHorizontal className="w-3 h-3 text-purple-300" />
            <span className="text-[9px] font-semibold hidden sm:inline">
              {isLocalMirrored ? 'Mirrored' : 'Normal'}
            </span>
          </button>
        )}

        {isAudioOnly ? (
          <div className="flex flex-col items-center justify-center p-3 text-center text-gray-400 w-full h-full min-h-[90px]">
            <Headphones className="w-6 h-6 mb-1 text-purple-400" />
            <span className="text-[10px] font-semibold text-gray-300">Voice Mode</span>
            <span className="text-[8px] text-gray-500 font-mono">Camera Off</span>
          </div>
        ) : !hasLocalVideo ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-gray-500 w-full">
            <VideoOff className="w-7 h-7 mb-1.5 text-purple-400/60" />
            <span className="text-[11px] font-semibold text-gray-300">No Camera</span>
            <span className="text-[9px] text-gray-500">Audio / View-Only Mode</span>
          </div>
        ) : null}

        <div className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 bg-black/60 text-white text-[9px] sm:text-xs px-1.5 py-0.5 rounded backdrop-blur border border-white/10 flex items-center gap-1">
          <span>You</span>
          {!hasLocalAudio && (
            <span className="text-[8px] text-amber-400 font-medium">(No Mic)</span>
          )}
        </div>
      </div>
    </div>
  );
}
