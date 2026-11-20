import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * Sleek Vertical Floating Speaker Volume Popover on Mobile (Cannot move out of screen)
 */
export function VolumePopover({
  show,
  remoteConnected,
  remoteVolume,
  onVolumeChange,
  onSliderPointerDown,
  volumePopoverRef,
  sliderTrackRef
}) {
  if (!show || !remoteConnected) return null;

  return (
    <div
      ref={volumePopoverRef}
      data-volume-popover="true"
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 bg-gray-900/95 backdrop-blur-xl border border-purple-500/50 py-3.5 px-2.5 rounded-2xl shadow-2xl flex flex-col items-center gap-2.5 animate-fadeIn pointer-events-auto w-14 select-none touch-none"
    >
      {/* Percentage Display at Top */}
      <span className="text-[11px] font-mono font-bold text-purple-300">
        {remoteVolume}%
      </span>

      {/* Vertical Slider Track Container */}
      <div
        ref={sliderTrackRef}
        onPointerDown={onSliderPointerDown}
        onTouchStart={onSliderPointerDown}
        className="relative w-6 h-32 bg-gray-800/90 rounded-full cursor-pointer shadow-inner border border-gray-700/60 flex flex-col justify-end p-0.5 overflow-hidden select-none touch-none"
        title={`Drag up/down to adjust speaker volume: ${remoteVolume}%`}
      >
        {/* Level Fill Indicator (Grows from bottom to top) */}
        <div
          style={{ height: `${remoteVolume}%` }}
          className={`w-full transition-all duration-75 rounded-full ${
            remoteVolume === 0
              ? 'bg-red-500/60'
              : 'bg-gradient-to-t from-purple-600 via-indigo-500 to-purple-400'
          }`}
        />

        {/* Glowing Thumb Dot */}
        <div
          style={{ bottom: `calc(${Math.min(94, Math.max(6, remoteVolume))}% - 6px)` }}
          className="absolute left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border border-purple-400 pointer-events-none transition-all duration-75"
        />

        {/* Accessible Native Range Input for Keyboard Nav / Screen Readers */}
        <input
          type="range"
          min="0"
          max="100"
          value={remoteVolume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          style={{
            writingMode: 'vertical-lr',
            WebkitAppearance: 'slider-vertical',
            direction: 'rtl'
          }}
          className="sr-only"
          aria-label="Speaker Volume"
        />
      </div>

      {/* Mute / Unmute Button at Bottom */}
      <button
        type="button"
        onClick={() => onVolumeChange(remoteVolume > 0 ? 0 : 100)}
        className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors shrink-0"
        title={remoteVolume === 0 ? "Unmute Speaker" : "Mute Speaker"}
      >
        {remoteVolume === 0 ? (
          <VolumeX className="w-4 h-4 text-red-400" />
        ) : (
          <Volume2 className="w-4 h-4 text-purple-400" />
        )}
      </button>
    </div>
  );
}
