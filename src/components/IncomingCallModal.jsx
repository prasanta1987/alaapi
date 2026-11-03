import React from 'react';
import { useCall } from '../context/CallContext';
import { Phone, PhoneOff, Music } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

export function IncomingCallModal() {
  const { incomingCall, acceptIncomingCall, declineIncomingCall } = useCall();

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-gray-900 border border-purple-500/50 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden">
        {/* Pulsing ring aura */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 via-transparent to-transparent pointer-events-none" />

        {/* Teacher Avatar with Pulse */}
        <div className="relative inline-block mb-4">
          <div className="absolute inset-0 rounded-full bg-purple-500/30 animate-ping" />
          <UserAvatar
            photoURL={incomingCall.callerPhoto}
            name={incomingCall.callerName}
            size="xl"
            className="w-20 h-20 text-2xl relative z-10 mx-auto"
          />
        </div>

        {/* Caller Info */}
        <div className="flex items-center justify-center gap-1.5 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Music className="w-3.5 h-3.5 animate-bounce" />
          Incoming Vocal Class
        </div>
        <h3 className="text-xl sm:text-2xl font-extrabold text-white mb-1 truncate">
          {incomingCall.callerName || 'Your Teacher'}
        </h3>
        <p className="text-gray-400 text-xs mb-6">
          is calling you for a 1-on-1 vocal session.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-4">
          {/* Decline */}
          <button
            onClick={declineIncomingCall}
            className="flex-1 py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-red-900/30 transition-all active:scale-95 text-sm"
          >
            <PhoneOff className="w-4 h-4" />
            Decline
          </button>

          {/* Accept */}
          <button
            onClick={acceptIncomingCall}
            className="flex-1 py-3 px-4 rounded-2xl bg-green-600 hover:bg-green-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-green-900/30 transition-all active:scale-95 text-sm animate-pulse"
          >
            <Phone className="w-4 h-4" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

