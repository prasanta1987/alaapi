import React from 'react';
import { FlipHorizontal, Scan, Maximize2, Minimize2 } from 'lucide-react';

/**
 * Remote Video Actions: Vertical Icon-Only Dock (Mirror, Fit/Zoom, Fullscreen)
 */
export function RemoteVideoControls({
  isRemoteMirrored,
  onToggleMirror,
  isRemoteZoomed,
  onToggleZoom,
  isFullscreen,
  onToggleFullscreen,
  isControlsDimmed
}) {
  return (
    <div
      className={`absolute bottom-3 left-3 z-20 flex flex-col items-center gap-2 pointer-events-auto transition-opacity duration-300 ${
        isControlsDimmed ? 'opacity-25 hover:opacity-100' : 'opacity-100'
      }`}
    >
      {/* Mirror Toggle */}
      <button
        onClick={onToggleMirror}
        title={isRemoteMirrored ? "Disable Remote Mirror (Normal)" : "Mirror Remote Video Feed"}
        className={`w-9 h-9 rounded-full backdrop-blur border flex items-center justify-center shadow-lg transition-all active:scale-95 ${
          isRemoteMirrored
            ? 'bg-purple-600/90 hover:bg-purple-500 border-purple-400 text-white shadow-purple-500/30'
            : 'bg-gray-900/85 hover:bg-gray-900 border-purple-500/30 text-purple-400 hover:text-white'
        }`}
      >
        <FlipHorizontal className="w-4 h-4" />
      </button>

      {/* Fit / Fill (Zoom) Toggle */}
      <button
        onClick={onToggleZoom}
        title={isRemoteZoomed ? "Switch to Fit (Show entire video frame)" : "Switch to Fill / Zoom (Cover screen)"}
        className={`w-9 h-9 rounded-full backdrop-blur border flex items-center justify-center shadow-lg transition-all active:scale-95 ${
          isRemoteZoomed
            ? 'bg-purple-600/90 hover:bg-purple-500 border-purple-400 text-white shadow-purple-500/30'
            : 'bg-gray-900/85 hover:bg-gray-900 border-purple-500/30 text-purple-400 hover:text-white'
        }`}
      >
        <Scan className="w-4 h-4" />
      </button>

      {/* Fullscreen Toggle */}
      <button
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        className={`w-9 h-9 rounded-full backdrop-blur border flex items-center justify-center shadow-lg transition-all active:scale-95 ${
          isFullscreen
            ? 'bg-purple-600/90 hover:bg-purple-500 border-purple-400 text-white shadow-purple-500/30'
            : 'bg-gray-900/85 hover:bg-gray-900 border-purple-500/30 text-purple-400 hover:text-white'
        }`}
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
    </div>
  );
}
