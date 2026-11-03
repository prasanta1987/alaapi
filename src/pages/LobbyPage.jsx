import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PlusCircle, LogIn, Sparkles, ArrowRight, Music, AlertCircle, Sliders } from 'lucide-react';

export function LobbyPage({ onOpenAudioSettings }) {
  const { currentUser, userProfile } = useAuth();
  const [joinRoomId, setJoinRoomId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    navigate(`/room/${newRoomId}?isCaller=true`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    const cleanId = joinRoomId.trim().toUpperCase();
    if (!cleanId) {
      setErrorMsg("Please enter a valid Room ID.");
      return;
    }
    setErrorMsg('');
    navigate(`/room/${cleanId}`);
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-3 sm:px-6 py-4 select-none">
      <div className="max-w-3xl w-full bg-gray-900/90 backdrop-blur rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 border border-gray-800 flex flex-col justify-between my-auto">
        {/* Header Title */}
        <header className="text-center mb-3 sm:mb-4">
          {/* <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-900/40 border border-purple-500/30 text-purple-300 text-[11px] font-semibold mb-1.5">
            <Sparkles className="w-3 h-3 text-purple-400" />
            High-Fidelity 48kHz Acoustic Space
          </div> */}
          <h1 className="text-xl sm:text-2xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500 tracking-tight mb-1">
            Hello, {currentUser ? currentUser.displayName : 'Guest'}
          </h1>
          {/* <p className="text-gray-400 text-xs max-w-sm mx-auto leading-relaxed">
            Pure, unprocessed vocal dynamics with zero clipping and custom acoustic DSP control.
          </p> */}
        </header>

        {/* Dashboard Direct Calling Banner for Logged-In Users */}
        {currentUser && (
          <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-gray-900 border border-purple-500/40 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-md">
            <div className="flex items-center gap-2.5 text-center sm:text-left">
              <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300 shrink-0">
                <Music className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  {userProfile?.role === 'teacher'
                    ? "Direct Student Calling Available"
                    : "Teacher Directory & Status Available"}
                </h4>
                <p className="text-[11px] text-gray-300">
                  {userProfile?.role === 'teacher'
                    ? "View your student list and call them directly with 1 click."
                    : "Manage your profile and see class status in the Dashboard."}
                </p>
              </div>
            </div>
            <Link
              to="/dashboard"
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0"
            >
              Open Dashboard
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* Create / Join Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 my-1">
          {/* Create Room Card */}
          <div className="bg-gray-800/50 backdrop-blur border border-gray-700/80 p-3.5 sm:p-5 rounded-2xl flex flex-col items-center text-center hover:bg-gray-800 hover:border-purple-500/50 transition-all shadow-xl group">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center mb-2 text-purple-400 shadow-inner group-hover:scale-105 transition-transform">
              <PlusCircle className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold mb-1 text-gray-100">Create a Class Room</h2>
            <p className="text-gray-400 text-xs mb-3 leading-snug">
              Start an instant session with a 5-letter Room ID to share with your peer.
            </p>
            <button
              onClick={handleCreateRoom}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 active:scale-98 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-md shadow-purple-900/30 transition-all mt-auto"
            >
              Create Room
            </button>
          </div>

          {/* Join Room Card */}
          <div className="bg-gray-800/50 backdrop-blur border border-gray-700/80 p-3.5 sm:p-5 rounded-2xl flex flex-col items-center text-center hover:bg-gray-800 hover:border-green-500/50 transition-all shadow-xl group">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center mb-2 text-green-400 shadow-inner group-hover:scale-105 transition-transform">
              <LogIn className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold mb-1 text-gray-100">Join a Class Room</h2>
            <p className="text-gray-400 text-xs mb-2 leading-snug">
              Enter the Room ID provided by your host or teacher to join.
            </p>
            <form onSubmit={handleJoinRoom} className="w-full flex flex-col gap-2 mt-auto">
              <input
                type="text"
                placeholder="ENTER ROOM ID"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full px-3 py-1.5 bg-gray-900/90 border border-gray-600 rounded-xl text-center text-white font-mono text-sm focus:outline-none focus:border-green-500 uppercase placeholder-gray-600 shadow-inner"
              />
              {errorMsg && (
                <p className="text-[11px] text-red-400 flex items-center justify-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {errorMsg}
                </p>
              )}
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-500 active:scale-98 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-md shadow-green-900/30 transition-all"
              >
                Join Class
              </button>
            </form>
          </div>
        </div>

        {/* Audio DSP Pre-Call Settings Button */}
        <div className="mt-3 flex justify-center">
          <button
            onClick={onOpenAudioSettings}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gray-800/80 hover:bg-gray-800 active:scale-95 text-gray-300 hover:text-white border border-gray-700/80 flex items-center justify-center gap-2 text-xs font-semibold shadow-sm transition-all group"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-400 group-hover:rotate-12 transition-transform" />
            Audio & Acoustic DSP Settings (Echo, Noise, Mic Level)
          </button>
        </div>

        {/* Footer info */}
        {/* <footer className="text-center mt-3 pt-2 border-t border-gray-800/60 text-[11px] text-gray-400">
          <p>Stereo 48kHz WebRTC • Lossless Musical Dynamics • Echo Cancellation & Noise Suppression Controls</p>
        </footer> */}
      </div>
    </div>
  );
}
