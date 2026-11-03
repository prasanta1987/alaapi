import React from 'react';
import { useCall } from '../context/CallContext';
import { PhoneOff, Loader2 } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

export function OutgoingCallModal() {
  const { outgoingCall, cancelOutgoingCall } = useCall();

  if (!outgoingCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-gray-900 border border-gray-700 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl relative">
        {/* Student Avatar */}
        <div className="relative inline-block mb-4">
          <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
          <UserAvatar
            photoURL={outgoingCall.student.photoURL}
            name={outgoingCall.student.displayName}
            size="xl"
            className="w-20 h-20 text-2xl relative z-10 mx-auto"
          />
        </div>

        <div className="flex items-center justify-center gap-1.5 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Ringing...
        </div>
        <h3 className="text-xl sm:text-2xl font-extrabold text-white mb-1 truncate">
          {outgoingCall.student.displayName || 'Student'}
        </h3>
        <p className="text-gray-400 text-xs mb-6">
          Waiting for student to answer on their device...
        </p>

        {/* Cancel Button */}
        <button
          onClick={cancelOutgoingCall}
          className="w-full py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-red-900/30 transition-all active:scale-95 text-sm"
        >
          <PhoneOff className="w-4 h-4" />
          Cancel Call
        </button>
      </div>
    </div>
  );
}

