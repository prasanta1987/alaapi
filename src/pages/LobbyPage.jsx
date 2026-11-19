import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db, appId, doc, getDoc, setDoc } from '../services/firebase';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { IosInstallModal } from '../components/IosInstallModal';
import {
  PlusCircle,
  LogIn,
  Sparkles,
  ArrowRight,
  Music,
  AlertCircle,
  Settings2,
  Loader2,
  Download,
  Smartphone,
  Share2,
  Copy,
  Check,
  X,
  Video
} from 'lucide-react';

export function LobbyPage({ onOpenDeviceSetup, onOpenAudioSettings }) {
  const { currentUser, userProfile } = useAuth();
  const { isInstallable, isStandalone, showIosGuide, setShowIosGuide, installApp } = usePwaInstall();
  const [joinRoomId, setJoinRoomId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const [createdRoom, setCreatedRoom] = useState(null); // { roomId, shareUrl }
  const [copiedLink, setCopiedLink] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    setIsCreatingRoom(true);
    // Generate clean 6-digit numeric Room ID for easy sharing
    const newRoomId = Math.floor(100000 + Math.random() * 900000).toString();
    const myHostToken = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      try {
        sessionStorage.setItem(`alaapi_host_token_${newRoomId}`, myHostToken);
      } catch (_) { }

      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newRoomId);
      await setDoc(roomRef, {
        mode: 'open',
        status: 'open',
        callType: 'video',
        hostToken: myHostToken,
        offer: null,
        answer: null,
        callerCandidates: [],
        calleeCandidates: [],
        createdAt: new Date().toISOString(),
        host: currentUser ? { uid: currentUser.uid, displayName: currentUser.displayName } : null
      });

      const shareUrl = `${window.location.origin}/room/${newRoomId}`;
      setCreatedRoom({ roomId: newRoomId, shareUrl });
    } catch (err) {
      console.warn("Could not pre-create open room in Firestore:", err);
      navigate(`/room/${newRoomId}`, { replace: true });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!createdRoom) return;
    const shareText = `Join My Live Calling Session:`;
    // const shareText = `Join my live singing class on Alaapi: ${createdRoom.shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Alaapi Music Studio',
          text: shareText,
          url: createdRoom.shareUrl
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = () => {
    if (!createdRoom) return;
    navigator.clipboard.writeText(createdRoom.shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }).catch(() => { });
  };

  const handleStartClass = () => {
    if (!createdRoom) return;
    navigate(`/room/${createdRoom.roomId}`, { replace: true });
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    const cleanId = joinRoomId.trim();
    if (!cleanId || cleanId.length !== 6) {
      setErrorMsg("Please enter a valid 6-digit Room ID.");
      return;
    }

    setIsCheckingRoom(true);
    setErrorMsg('');

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', cleanId);
      const snap = await getDoc(roomRef);

      if (!snap.exists()) {
        setErrorMsg(`Room "${cleanId}" not found. Check ID and try again.`);
        setIsCheckingRoom(false);
        return;
      }
    } catch (err) {
      console.warn("Could not check room existence before joining:", err);
    }

    setIsCheckingRoom(false);
    navigate(`/room/${cleanId}`, { replace: true });
  };

  const handleOpenSettings = onOpenDeviceSetup || onOpenAudioSettings;

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-3 sm:px-6 py-4 select-none">
      <div className="max-w-3xl w-full bg-gray-900/90 backdrop-blur rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-6 border border-gray-800 flex flex-col justify-between my-auto">
        {/* Header Title */}
        <header className="text-center mb-3 sm:mb-4">
          <h1 className="text-xl sm:text-2xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500 tracking-tight mb-1">
            Hello, {currentUser ? currentUser.displayName : 'Guest'} !
          </h1>
        </header>

        {/* PWA Full-Screen Install Banner (Shown on mobile & desktop browsers until installed) */}
        {isInstallable && !isStandalone && (
          <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-purple-950/70 via-indigo-950/50 to-gray-900 border border-purple-500/40 flex flex-col sm:flex-row items-center justify-between gap-2.5 shadow-md">
            <div className="flex items-center gap-2.5 text-center sm:text-left">
              <div className="w-8 h-8 rounded-lg bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300 shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                  Install Alaapi App
                  <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 border border-purple-500/40">
                    Mobile App
                  </span>
                </h4>
                <p className="text-[11px] text-gray-300">
                  Install on your phone for a dedicated app window with mobile notifications and zero browser address bars.
                </p>
              </div>
            </div>
            <button
              onClick={installApp}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0 active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              Install App
            </button>
          </div>
        )}

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
              Start an instant session with a 6-digit Room ID to share with your peer.
            </p>
            <button
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 active:scale-98 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-md shadow-purple-900/30 transition-all mt-auto disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreatingRoom && <Loader2 className="w-4 h-4 animate-spin" />}
              {isCreatingRoom ? "Creating Room..." : "Create Room"}
            </button>
          </div>

          {/* Join Room Card */}
          <div className="bg-gray-800/50 backdrop-blur border border-gray-700/80 p-3.5 sm:p-5 rounded-2xl flex flex-col items-center text-center hover:bg-gray-800 hover:border-green-500/50 transition-all shadow-xl group">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center mb-2 text-green-400 shadow-inner group-hover:scale-105 transition-transform">
              <LogIn className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold mb-1 text-gray-100">Join a Class Room</h2>
            <p className="text-gray-400 text-xs mb-2 leading-snug">
              Enter the 6-digit Room ID provided by your host or teacher to join.
            </p>
            <form onSubmit={handleJoinRoom} className="w-full flex flex-col gap-2 mt-auto">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="ENTER 6-DIGIT ROOM ID"
                value={joinRoomId}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setJoinRoomId(val);
                  if (errorMsg) setErrorMsg('');
                }}
                maxLength={6}
                disabled={isCheckingRoom}
                className="w-full px-3 py-2 bg-gray-900/90 border border-gray-600 rounded-xl text-center text-white font-mono text-base tracking-widest focus:outline-none focus:border-green-500 placeholder-gray-600 shadow-inner disabled:opacity-50"
              />
              {errorMsg && (
                <p className="text-[11px] text-red-400 flex items-center justify-center gap-1 font-medium bg-red-950/40 py-1 px-2 rounded-lg border border-red-500/30">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </p>
              )}
              <button
                type="submit"
                disabled={isCheckingRoom}
                className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-500 active:scale-98 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-md shadow-green-900/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCheckingRoom && <Loader2 className="w-4 h-4 animate-spin" />}
                {isCheckingRoom ? "Checking Room..." : "Join Class"}
              </button>
            </form>
          </div>
        </div>

        {/* Hardware Devices & Diagnostics Setup Button */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={handleOpenSettings}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gray-800/80 hover:bg-gray-800 active:scale-95 text-gray-300 hover:text-white border border-gray-700/80 flex items-center justify-center gap-2 text-xs font-semibold shadow-sm transition-all group"
          >
            <Settings2 className="w-4 h-4 text-purple-400 group-hover:rotate-45 transition-transform" />
            Audio & Video Device Settings
          </button>
          <Link
            to="/tuner"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-purple-950/60 hover:bg-purple-900/70 active:scale-95 text-purple-200 hover:text-white border border-purple-500/40 flex items-center justify-center gap-2 text-xs font-semibold shadow-sm transition-all group"
          >
            <Music className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
            Swara & Pitch Tuner
          </Link>
        </div>
      </div>

      {/* Google Meet-Style "Your Class Room is Ready" Modal */}
      {createdRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-purple-500/40 rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-center relative">
            <button
              onClick={() => handleStartClass()}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title="Close and Enter Room"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-500/50 flex items-center justify-center mx-auto text-purple-300 shadow-inner">
              <Video className="w-6 h-6 text-purple-400" />
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-1">Your Class Room is Ready!</h3>
              <p className="text-xs text-gray-400">
                Share this link with your student or peer via WhatsApp before joining, or enter now.
              </p>
            </div>

            {/* Room Code Badge */}
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Room Code</span>
              <span className="text-2xl font-mono font-black text-purple-300 tracking-wider">
                {createdRoom.roomId.slice(0, 3)} {createdRoom.roomId.slice(3)}
              </span>
              <span className="text-[11px] text-gray-400 font-mono truncate max-w-full px-2">
                {createdRoom.shareUrl}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5">
              {/* WhatsApp Share Button */}
              <button
                onClick={handleShareWhatsApp}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all"
              >
                <Share2 className="w-4 h-4" />
                Share via WhatsApp
              </button>

              {/* Copy Link Button */}
              <button
                onClick={handleCopyLink}
                className="w-full py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-750 active:scale-98 text-gray-200 hover:text-white border border-gray-700 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
              >
                {copiedLink ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                {copiedLink ? "Link Copied to Clipboard!" : "Copy Class Link"}
              </button>

              {/* Enter Room Button */}
              <button
                onClick={handleStartClass}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 transition-all mt-1"
              >
                <span>Enter Class Room</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Installation Instructions Guide */}
      <IosInstallModal isOpen={showIosGuide} onClose={() => setShowIosGuide(false)} />
    </div>
  );
}
