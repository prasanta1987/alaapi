import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  db,
  appId,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  arrayUnion
} from '../services/firebase';
import {
  localStream,
  setupLocalMedia,
  stopLocalMedia,
  toggleAudioMute,
  toggleVideoFeed,
  toggleCameraFacingMode,
  handleDeviceSwitch,
  requestScreenWakeLock,
  releaseScreenWakeLock,
  setupOrientationListeners,
  updateOrientationClasses
} from '../services/media';
import {
  initPeerConnection,
  processRemoteCandidates,
  closePeerConnection,
  sendSyncMessage,
  pc
} from '../services/webrtc';
import {
  stopMetronome
} from '../services/metronome';
import { MetronomeModal } from '../components/MetronomeModal';
import { DeviceSetupModal } from '../components/DeviceSetupModal';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  RefreshCw,
  Settings,
  PhoneOff,
  Copy,
  Check,
  Radio,
  Sliders,
  Activity,
  AlertCircle,
  X
} from 'lucide-react';

export function CallStudioPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const isCaller = searchParams.get('isCaller') === 'true';
  const callId = searchParams.get('callId');
  const calleeName = searchParams.get('calleeName');
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const wakeLockBadgeRef = useRef(null);

  const [statusText, setStatusText] = useState('Initializing acoustic studio...');
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metronomeOpen, setMetronomeOpen] = useState(false);
  const [roomMetronome, setRoomMetronome] = useState(null);
  const [hasLocalVideo, setHasLocalVideo] = useState(true);
  const [hasLocalAudio, setHasLocalAudio] = useState(true);
  const [errorModalMsg, setErrorModalMsg] = useState(null);

  // Available Hardware Devices
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selectedCam, setSelectedCam] = useState('');
  const [selectedMic, setSelectedMic] = useState('');

  // 1. Initial setup and lifecycle
  useEffect(() => {
    let roomUnsubscribe = null;
    let callUnsubscribe = null;
    let isTerminated = false;

    setupOrientationListeners();
    updateOrientationClasses();

    const discardCallSession = async (message, shouldDelete = false) => {
      if (isTerminated) return;
      isTerminated = true;

      stopMetronome();

      if (roomUnsubscribe) {
        roomUnsubscribe();
        roomUnsubscribe = null;
      }

      if (callUnsubscribe) {
        callUnsubscribe();
        callUnsubscribe = null;
      }

      if (callId) {
        try {
          const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId);
          await deleteDoc(callRef);
        } catch (e) {}
      }

      if (shouldDelete && roomId) {
        try {
          const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
          await deleteDoc(roomRef);
        } catch (e) {
          console.warn("Could not delete room doc:", e);
        }
      }

      closePeerConnection();
      stopLocalMedia(localVideoRef.current);
      releaseScreenWakeLock();

      // If terminated due to room not found or host unavailable, show user-friendly modal
      if (message && (message.includes("not found") || message.includes("unavailable") || message.includes("ended"))) {
        setErrorModalMsg(message);
      } else {
        navigate(currentUser ? '/dashboard' : '/');
      }
    };

    // If caller initiated via direct call, listen for decline from student
    if (callId) {
      const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId);
      callUnsubscribe = onSnapshot(callRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const callData = snapshot.data();
        if (callData.status === 'declined') {
          discardCallSession(`${calleeName || 'Student'} is unavailable or declined the call.`, true);
        }
      });
    }

    const startCall = async () => {
      try {
        setStatusText("Detecting audio and camera devices...");
        const stream = await setupLocalMedia(localVideoRef.current);

        const videoTracks = stream ? stream.getVideoTracks() : [];
        const audioTracks = stream ? stream.getAudioTracks() : [];
        setHasLocalVideo(videoTracks.length > 0);
        setHasLocalAudio(audioTracks.length > 0);

        // Populate device lists
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          setCameras(devices.filter(d => d.kind === 'videoinput'));
          setMics(devices.filter(d => d.kind === 'audioinput'));
        }

        await requestScreenWakeLock(wakeLockBadgeRef.current);

        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

        // WebRTC initialization with DataChannel sync
        initPeerConnection({
          localStream: stream,
          isCaller,
          onRemoteStream: (remoteStream) => {
            if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
              remoteVideoRef.current.srcObject = remoteStream;
              remoteVideoRef.current.play().catch(e => console.warn("Remote play prevented:", e));
              setRemoteConnected(true);
              setStatusText("Connected! High-fidelity audio active.");
            }
          },
          onIceCandidate: async (candidate) => {
            const candidateStr = JSON.stringify(candidate.toJSON());
            const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
            await updateDoc(roomRef, { [field]: arrayUnion(candidateStr) }).catch(() => {});
          },
          onConnectionStateChange: (state) => {
            if (state === 'failed') {
              discardCallSession("Connection lost.", true);
            }
          },
          onSyncMessageCallback: (msg) => {
            if (msg.type === 'METRONOME_SYNC' && msg.metronome) {
              setRoomMetronome({ ...msg.metronome, isLocal: false });
            }
          }
        });

        if (isCaller) {
          setStatusText(
            calleeName
              ? `Calling ${calleeName}... Waiting for answer...`
              : `Room Created [${roomId}]. Waiting for participant...`
          );

          await setDoc(roomRef, {
            offer: null,
            answer: null,
            callerCandidates: [],
            calleeCandidates: [],
            createdAt: new Date().toISOString(),
            status: 'active',
            host: currentUser ? {
              uid: currentUser.uid,
              displayName: currentUser.displayName
            } : null
          }, { merge: true });

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await updateDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp } });

          roomUnsubscribe = onSnapshot(roomRef, (snapshot) => {
            if (!snapshot.exists()) {
              discardCallSession("Call ended: Room closed.", false);
              return;
            }

            const data = snapshot.data();
            if (!data) return;

            if (data.metronome) {
              setRoomMetronome(data.metronome);
            }

            if (data.answer && pc && pc.signalingState === 'have-local-offer') {
              const answerDesc = new RTCSessionDescription(data.answer);
              pc.setRemoteDescription(answerDesc).catch(err => console.error("Error setting answer:", err));
              setStatusText("Participant joined! Connecting...");
            }
            processRemoteCandidates(data.calleeCandidates);
          });
        } else {
          // Joining as callee - asynchronously await host offer
          setStatusText(`Connecting to Room [${roomId}]...`);

          let answered = false;
          const notFoundTimer = setTimeout(() => {
            if (!answered && !isTerminated) {
              discardCallSession(`Room "${roomId}" not found or host unavailable.`, false);
            }
          }, 15000);

          roomUnsubscribe = onSnapshot(roomRef, async (snapshot) => {
            if (!snapshot.exists()) {
              if (answered) {
                discardCallSession("The host has ended the call.", false);
              }
              return;
            }

            const data = snapshot.data();
            if (!data) return;

            if (data.metronome) {
              setRoomMetronome(data.metronome);
            }

            // When host's offer is populated and callee hasn't answered yet
            if (data.offer && !answered && pc) {
              try {
                answered = true;
                clearTimeout(notFoundTimer);

                const offerDesc = new RTCSessionDescription(data.offer);
                await pc.setRemoteDescription(offerDesc);

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                await updateDoc(roomRef, {
                  answer: { type: answer.type, sdp: answer.sdp },
                  guest: currentUser ? {
                    uid: currentUser.uid,
                    displayName: currentUser.displayName
                  } : null
                });

                setStatusText("Connected! High-fidelity audio active.");
              } catch (err) {
                console.error("Callee answer failed:", err);
                discardCallSession("Failed to establish audio/video stream.", false);
              }
            }

            if (data.callerCandidates) {
              processRemoteCandidates(data.callerCandidates);
            }
          }, (err) => {
            console.error("Callee room listener error:", err);
            discardCallSession("Network error connecting to room.", false);
          });
        }
      } catch (err) {
        console.error("Call Setup Error:", err);
        setStatusText(`Hardware Error: ${err.message}`);
      }
    };

    startCall();

    const handleBeforeUnload = () => {
      if (roomId) {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        deleteDoc(roomRef).catch(() => {});
      }
      if (callId) {
        const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId);
        deleteDoc(callRef).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      discardCallSession("Session closed.", true);
    };
  }, [roomId, isCaller, currentUser, navigate]);

  // Leave Call action
  const handleLeaveCall = async () => {
    stopMetronome();
    try {
      if (roomId) {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        await deleteDoc(roomRef);
      }
      if (callId) {
        const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId);
        await deleteDoc(callRef);
      }
    } catch (e) {
      console.warn("Delete error on leave:", e);
    }
    closePeerConnection();
    stopLocalMedia(localVideoRef.current);
    releaseScreenWakeLock();
    navigate(currentUser ? '/dashboard' : '/');
  };

  // Toggle Controls
  const handleAudioToggle = () => {
    const muted = toggleAudioMute();
    setIsMuted(muted);
  };

  const handleVideoToggle = () => {
    const stopped = toggleVideoFeed();
    setIsVideoOff(stopped);
  };

  const handleFlipCamera = async () => {
    toggleCameraFacingMode();
    setSelectedCam('');
    await handleDeviceSwitch({
      selectedCamId: '',
      selectedMicId: selectedMic,
      localVideo: localVideoRef.current,
      pc
    });
  };

  // Copy Room ID
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopiedRoomId(true);
      setTimeout(() => setCopiedRoomId(false), 2000);
    });
  };

  // Synchronized Metronome callback (DataChannel direct P2P + Firestore database entry)
  const handleSyncMetronome = async (newMetronomeData) => {
    setRoomMetronome({ ...newMetronomeData, isLocal: true });

    // 1. Instantaneous direct P2P sync via WebRTC DataChannel (sub-millisecond fast)
    sendSyncMessage({
      type: 'METRONOME_SYNC',
      metronome: { ...newMetronomeData, isLocal: false }
    });

    // 2. Persistent database entry in Firestore so both devices are coordinated
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      await updateDoc(roomRef, {
        metronome: {
          ...newMetronomeData,
          isLocal: false
        }
      });
    } catch (e) {
      console.warn("Could not sync metronome state to Firestore:", e);
    }
  };

  return (
    <div id="videoContainer" className="w-full h-full h-[100dvh] flex bg-gray-950 overflow-hidden select-none">
      {/* 1. Main Remote Stage */}
      <div id="remoteStage" className="relative flex-1 min-h-0 w-full h-full bg-black rounded-none overflow-hidden flex items-center justify-center">
        {/* Remote Video Stream */}
        <video
          ref={remoteVideoRef}
          id="remoteVideo"
          className="w-full h-full object-contain mx-auto"
          autoPlay
          playsInline
        />

        {/* Remote Placeholder when waiting */}
        {!remoteConnected && (
          <div id="remotePlaceholder" className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-gray-950 z-10">
            <Radio className="w-16 h-16 sm:w-20 sm:h-20 mb-3 opacity-25 animate-pulse text-purple-400" />
            <span className="text-sm font-medium tracking-wide text-gray-500">
              Awaiting Connection in Room {roomId}...
            </span>
          </div>
        )}

        {/* Mobile Top Overlay: Room ID & Status Pill */}
        <div className="mobile-top-bar absolute top-3 inset-x-3 z-20 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {remoteConnected && (
              <div className="bg-gray-900/85 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-semibold text-green-400 flex items-center gap-1.5 border border-green-500/30 shadow">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Raw Audio
              </div>
            )}
            <div ref={wakeLockBadgeRef} className="bg-gray-900/85 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-semibold text-blue-400 flex items-center gap-1.5 border border-blue-500/30 shadow">
              Awake
            </div>
            {roomMetronome?.active && (
              <div className="bg-purple-900/85 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-semibold text-purple-300 flex items-center gap-1.5 border border-purple-500/40 shadow animate-pulse">
                <Activity className="w-3.5 h-3.5 text-purple-300" />
                {roomMetronome.bpm || 120} BPM
              </div>
            )}
          </div>

          <div className="bg-gray-900/90 backdrop-blur border border-purple-500/40 rounded-full px-3 py-1 shadow-lg flex items-center gap-2 pointer-events-auto">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Room</span>
            <span className="text-sm font-mono font-bold text-purple-400 tracking-wider">{roomId}</span>
            <button onClick={copyRoomId} className="text-gray-400 hover:text-white p-0.5">
              {copiedRoomId ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Studio Side Panel (Sidebar on Desktop, Overlay on Mobile) */}
      <aside id="studioSidePanel" className="flex flex-col">
        {/* Top: User Camera Card */}
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
            <span className={`flex items-center gap-1.5 text-[11px] font-normal lowercase ${
              hasLocalVideo ? 'text-green-400' : 'text-gray-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                hasLocalVideo ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
              }`} />
              {hasLocalVideo ? 'live' : 'inactive'}
            </span>
          </div>

          <div id="localVideoContainer" className="pointer-events-auto relative bg-gray-950 rounded-xl overflow-hidden border border-gray-700/80 shadow-2xl shrink-0 self-end md:self-auto flex items-center justify-center min-h-[100px]">
            <video
              ref={localVideoRef}
              id="localVideo"
              className={`w-full h-full object-cover transform scale-x-[-1] ${hasLocalVideo ? '' : 'hidden'}`}
              autoPlay
              playsInline
              muted
            />
            {!hasLocalVideo && (
              <div className="flex flex-col items-center justify-center p-4 text-center text-gray-500 w-full">
                <VideoOff className="w-7 h-7 mb-1.5 text-purple-400/60" />
                <span className="text-[11px] font-semibold text-gray-300">No Camera</span>
                <span className="text-[9px] text-gray-500">Audio / View-Only Mode</span>
              </div>
            )}
            <div className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 bg-black/75 text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded backdrop-blur border border-white/10 flex items-center gap-1">
              <span>You</span>
              {!hasLocalAudio && (
                <span className="text-[9px] text-amber-400 font-medium">(No Mic)</span>
              )}
            </div>
          </div>
        </div>

        {/* Middle: Session Info (Clean Desktop Card with NO DSP switches) */}
        <div className="sidebar-info-card flex-col gap-2.5 p-3.5 bg-gray-950/70 rounded-xl border border-gray-800 text-xs">
          {/* Room ID Row */}
          <div className="flex items-center justify-between bg-gray-900/90 px-3 py-2 rounded-lg border border-purple-500/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Room ID</span>
              <span className="text-base font-mono font-bold text-purple-400 tracking-wider select-all">{roomId}</span>
            </div>
            <button onClick={copyRoomId} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors">
              {copiedRoomId ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Status Display */}
          <div className="pt-1 border-t border-gray-800">
            <p className="text-gray-300 font-mono text-[11px] leading-relaxed break-words">
              {statusText}
            </p>
          </div>
        </div>

        {/* Bottom: Media & Studio Controls */}
        <div className="w-full flex flex-col gap-2 shrink-0">
          <div className="sidebar-header text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
            Studio Controls
          </div>

          <nav id="mediaControls" className="pointer-events-auto shrink-0">
            {/* Mic Toggle */}
            <button
              onClick={handleAudioToggle}
              disabled={!hasLocalAudio}
              className={`text-white shadow border transition-colors flex items-center justify-center gap-2 ${
                !hasLocalAudio
                  ? 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed opacity-60'
                  : isMuted
                  ? 'bg-red-600 hover:bg-red-500 border-red-700'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
              }`}
              title={!hasLocalAudio ? "No microphone attached" : isMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isMuted || !hasLocalAudio ? <MicOff className="w-5 h-5 shrink-0" /> : <Mic className="w-5 h-5 shrink-0" />}
              <span className="text-xs font-semibold">{!hasLocalAudio ? "No Mic" : "Mic"}</span>
            </button>

            {/* Video Toggle */}
            <button
              onClick={handleVideoToggle}
              disabled={!hasLocalVideo}
              className={`text-white shadow border transition-colors flex items-center justify-center gap-2 ${
                !hasLocalVideo
                  ? 'bg-gray-900 border-gray-800 text-gray-500 cursor-not-allowed opacity-60'
                  : isVideoOff
                  ? 'bg-red-600 hover:bg-red-500 border-red-700'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
              }`}
              title={!hasLocalVideo ? "No camera attached" : isVideoOff ? "Start Video" : "Stop Video"}
            >
              {isVideoOff || !hasLocalVideo ? <VideoOff className="w-5 h-5 shrink-0" /> : <Video className="w-5 h-5 shrink-0" />}
              <span className="text-xs font-semibold">{!hasLocalVideo ? "No Cam" : "Camera"}</span>
            </button>

            {/* Mobile Camera Switch (Front/Back) */}
            <button
              id="switchCameraBtn"
              onClick={handleFlipCamera}
              disabled={!hasLocalVideo}
              className={`text-white shadow border transition-colors flex items-center justify-center ${
                !hasLocalVideo
                  ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-40'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
              }`}
              title={!hasLocalVideo ? "Camera not available" : "Switch Front/Back Camera"}
            >
              <RefreshCw className="w-5 h-5 shrink-0" />
            </button>

            {/* Synchronized Metronome Trigger */}
            <button
              onClick={() => setMetronomeOpen(true)}
              className={`text-white shadow border transition-all flex items-center justify-center gap-2 ${
                roomMetronome?.active
                  ? 'bg-purple-600 hover:bg-purple-500 border-purple-400 shadow-purple-900/50 ring-2 ring-purple-400/30'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
              }`}
              title="Synchronized Studio Metronome"
            >
              <Activity className={`w-5 h-5 shrink-0 ${roomMetronome?.active ? 'animate-pulse text-white' : 'text-purple-400'}`} />
              <span className="text-xs font-semibold">
                {roomMetronome?.active ? `${roomMetronome.bpm || 120} BPM` : 'Metronome'}
              </span>
            </button>

            {/* Hardware & Diagnostics Modal */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="bg-gray-800 hover:bg-gray-700 text-white shadow border border-gray-600 transition-colors flex items-center justify-center gap-2"
              title="Camera, Mic & Device Diagnostics"
            >
              <Settings className="w-5 h-5 shrink-0 text-gray-300" />
              <span className="text-xs font-semibold">Devices</span>
            </button>

            {/* Leave Call (Full width span on 2-column grid) */}
            <button
              onClick={handleLeaveCall}
              className="col-span-2 bg-red-600 hover:bg-red-500 text-white shadow border border-red-700 transition-colors flex items-center justify-center gap-2"
              title="Leave & End Call"
            >
              <PhoneOff className="w-5 h-5 shrink-0" />
              <span className="text-xs font-semibold">Leave</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* 3. Synchronized Metronome Modal */}
      <MetronomeModal
        isOpen={metronomeOpen}
        onClose={() => setMetronomeOpen(false)}
        metronomeData={roomMetronome}
        onSyncMetronome={handleSyncMetronome}
      />

      {/* 4. Hardware Devices & Diagnostics Modal */}
      <DeviceSetupModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* 5. Graceful Session Error Modal */}
      {errorModalMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn select-none">
          <div className="bg-gray-900 border border-red-500/40 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center mx-auto mb-3 text-red-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Class Session Notice</h3>
            <p className="text-xs text-gray-300 mb-5 leading-relaxed">{errorModalMsg}</p>
            <button
              onClick={() => navigate(currentUser ? '/dashboard' : '/')}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
            >
              Return to {currentUser ? 'Dashboard' : 'Lobby'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
