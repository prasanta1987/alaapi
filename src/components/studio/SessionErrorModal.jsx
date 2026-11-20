import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Graceful Session Error / Disconnect Notice Modal with countdown auto-dismiss
 */
export function SessionErrorModal({
  errorModalMsg,
  errorCountdown,
  onDismiss,
  isLoggedIn
}) {
  if (!errorModalMsg) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="bg-gray-900 border border-red-500/40 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl relative">
        <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center mx-auto mb-3 text-red-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white mb-2">Class Session Notice</h3>
        <p className="text-xs text-gray-300 mb-3 leading-relaxed">{errorModalMsg}</p>
        <p className="text-[11px] text-purple-300/80 mb-5 font-mono">
          Auto-returning to dashboard in {errorCountdown}s...
        </p>
        <button
          onClick={onDismiss}
          className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
        >
          Return to {isLoggedIn ? 'Dashboard' : 'Lobby'} ({errorCountdown}s)
        </button>
      </div>
    </div>
  );
}
