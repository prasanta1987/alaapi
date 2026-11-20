import React from 'react';
import { Radio, Share2 } from 'lucide-react';

/**
 * Remote Video Placeholder shown when awaiting participant connection
 */
export function RemotePlaceholder({ isOpenRoom, roomId, onShareRoomLink }) {
  return (
    <div id="remotePlaceholder" className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-950 z-10 p-6 text-center">
      <Radio className="w-16 h-16 sm:w-20 sm:h-20 mb-3 opacity-25 animate-pulse text-purple-400" />
      <span className="text-sm font-medium tracking-wide text-gray-300 max-w-sm">
        {isOpenRoom
          ? "Waiting for the 2nd participant to join... Share the link to begin."
          : `Awaiting Connection in Room ${roomId}...`}
      </span>
      {isOpenRoom && (
        <button
          type="button"
          onClick={onShareRoomLink}
          className="mt-4 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-purple-900/40 transition-all active:scale-95 pointer-events-auto"
        >
          <Share2 className="w-4 h-4" />
          <span>Share Meeting Link</span>
        </button>
      )}
    </div>
  );
}
