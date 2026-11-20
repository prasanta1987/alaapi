import React from 'react';
import { Mic, MicOff, Video, VideoOff, RefreshCw, PhoneOff, Volume2, VolumeX } from 'lucide-react';

/**
 * Bottom: In-Call Studio Controls (Auto-dims on mobile idle)
 */
export function StudioControls({
  hasLocalAudio,
  isMuted,
  onAudioToggle,
  hasLocalVideo,
  isVideoOff,
  onVideoToggle,
  isAudioOnly,
  remoteConnected,
  remoteVolume,
  showVolumePopover,
  onVolumeToggle,
  volumeBtnRef,
  onFlipCamera,
  onLeaveCall,
  isControlsDimmed
}) {
  return (
    <div className="w-full flex flex-col gap-2 shrink-0">
      <div className="sidebar-header text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
        Studio Controls
      </div>

      <nav
        id="mediaControls"
        className={`pointer-events-auto shrink-0 transition-opacity duration-300 ${
          isControlsDimmed ? 'opacity-25 hover:opacity-100' : 'opacity-100'
        }`}
      >
        {/* Mic Toggle */}
        <button
          onClick={onAudioToggle}
          disabled={!hasLocalAudio}
          className={`text-white shadow border transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            !hasLocalAudio
              ? 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed opacity-60'
              : isMuted
                ? 'bg-red-600 hover:bg-red-500 border-red-700'
                : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
          }`}
          title={!hasLocalAudio ? "No microphone attached" : isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {isMuted || !hasLocalAudio ? <MicOff className="w-5 h-5 shrink-0" /> : <Mic className="w-5 h-5 shrink-0" />}
          <span className="text-xs font-semibold">{!hasLocalAudio ? "No Mic" : isMuted ? "Unmute" : "Mute"}</span>
        </button>

        {/* Video Toggle (Only for Video Calls) */}
        {!isAudioOnly && (
          <button
            onClick={onVideoToggle}
            disabled={!hasLocalVideo}
            className={`text-white shadow border transition-colors flex items-center justify-center gap-2 cursor-pointer ${
              !hasLocalVideo
                ? 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed opacity-60'
                : isVideoOff
                  ? 'bg-red-600 hover:bg-red-500 border-red-700'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
            }`}
            title={!hasLocalVideo ? "No camera attached" : isVideoOff ? "Start Video" : "Stop Video"}
          >
            {isVideoOff || !hasLocalVideo ? <VideoOff className="w-5 h-5 shrink-0" /> : <Video className="w-5 h-5 shrink-0" />}
            <span className="text-xs font-semibold">{!hasLocalVideo ? "No Cam" : isVideoOff ? "Start Video" : "Stop Video"}</span>
          </button>
        )}

        {/* Speaker / Monitor Volume Toggle Button (Mobile Overlay Dock only - hidden in sidebar view) */}
        {remoteConnected && (
          <button
            ref={volumeBtnRef}
            onClick={onVolumeToggle}
            className={`text-white shadow border transition-colors items-center justify-center gap-2 layout-overlay-volume-btn cursor-pointer ${
              remoteVolume === 0
                ? 'bg-red-600 hover:bg-red-500 border-red-700'
                : showVolumePopover
                  ? 'bg-purple-600 hover:bg-purple-500 border-purple-400'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
            }`}
            title={remoteVolume === 0 ? "Speaker Muted - Tap to unmute" : `Speaker Volume: ${remoteVolume}%`}
          >
            {remoteVolume === 0 ? (
              <VolumeX className="w-5 h-5 shrink-0 text-red-300" />
            ) : (
              <Volume2 className="w-5 h-5 shrink-0 text-purple-300" />
            )}
            <span className="text-xs font-semibold">{remoteVolume === 0 ? "Muted" : `${remoteVolume}%`}</span>
          </button>
        )}

        {/* In-Call Camera Switch (Only for Video Calls) */}
        {!isAudioOnly && (
          <button
            id="switchCameraBtn"
            onClick={onFlipCamera}
            disabled={!hasLocalVideo}
            className={`text-white shadow border transition-colors flex items-center justify-center gap-2 cursor-pointer ${
              !hasLocalVideo
                ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-40'
                : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
            }`}
            title={!hasLocalVideo ? "Camera not available" : "Switch / Flip Camera"}
          >
            <RefreshCw className="w-5 h-5 shrink-0" />
            <span className="text-xs font-semibold">Switch Cam</span>
          </button>
        )}

        {/* Leave Call */}
        <button
          onClick={onLeaveCall}
          className="bg-red-600 hover:bg-red-500 text-white shadow border border-red-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          title="Leave & End Call"
        >
          <PhoneOff className="w-5 h-5 shrink-0" />
          <span className="text-xs font-semibold">Leave</span>
        </button>
      </nav>
    </div>
  );
}
