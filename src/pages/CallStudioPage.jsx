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
  setVideoFeedEnabled,
  toggleCameraFacingMode,
  setCameraFacingMode,
  currentFacingMode,
  isMobileDevice,
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
  pc
} from '../services/webrtc';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  RefreshCw,
  PhoneOff,
  Copy,
  Check,
  Radio,
  AlertCircle,
  Clock,
  FlipHorizontal,
  Maximize2,
  Minimize2
} from 'lucide-react';

export function CallStudioPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const isCaller = searchParams.get('isCaller') === 'true';
  const callId = searchParams.get('callId');
  const calleeName = searchParams.get('calleeName');
  const callType = searchParams.get('callType') || 'video'; // 'video' | 'audio'
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const wakeLockBadgeRef = useRef(null);

  const [statusText, setStatusText] = useState('Initializing acoustic studio...');
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isLocalMirrored, setIsLocalMirrored] = useState(true);
  const [isRemoteMirrored, setIsRemoteMirrored] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(true);
  const [hasLocalAudio, setHasLocalAudio] = useState(true);
  const [errorModalMsg, setErrorModalMsg] = useState(null);

  // Available camera devices for in-call switching
  const [cameras, setCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState('');

  // Call running duration timer
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(timerInterval);
    };
  }, []);

  const formatDuration = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

        // If audio-only call, start with video disabled (user can still toggle on anytime)
        if (callType === 'audio') {
          setIsVideoOff(true);
          setVideoFeedEnabled(false);
        }

        // Populate camera list for in-call camera switching
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          setCameras(videoDevices);

          // Detect active track's actual deviceId and facingMode
          const activeTrack = videoTracks[0];
          const activeSettings = activeTrack && activeTrack.getSettings ? activeTrack.getSettings() : {};
          if (activeSettings.deviceId) {
            setSelectedCam(activeSettings.deviceId);
          } else if (videoDevices.length > 0) {
            setSelectedCam(videoDevices[0].deviceId);
          }
          if (activeSettings.facingMode) {
            setCameraFacingMode(activeSettings.facingMode);
          }
        }

        await requestScreenWakeLock(wakeLockBadgeRef.current);

        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

        // WebRTC initialization
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
            callerMirrored: isLocalMirrored,
            calleeMirrored: false,
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

            if (typeof data.calleeMirrored === 'boolean') {
              setIsRemoteMirrored(data.calleeMirrored);
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
                  calleeMirrored: isLocalMirrored,
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

            if (typeof data.callerMirrored === 'boolean') {
              setIsRemoteMirrored(data.callerMirrored);
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

  // Toggle Microphone
  const handleAudioToggle = () => {
    const muted = toggleAudioMute();
    setIsMuted(muted);
  };

  // Toggle Video
  const handleVideoToggle = () => {
    const stopped = toggleVideoFeed();
    setIsVideoOff(stopped);
  };

  // Switch camera: toggles between front and back camera on mobile (Motorola/Android/iOS) or cycles webcams on desktop
  const handleFlipCamera = async () => {
    if (!hasLocalVideo) return;

    const isMobile = isMobileDevice();

    if (isMobile) {
      // Toggle facing mode: front ('user') <-> back ('environment')
      const nextFacing = currentFacingMode === 'user' ? 'environment' : 'user';

      // If multiple camera sensors are reported, find a sensor matching the desired facing mode
      let targetCamId = '';
      if (cameras.length > 1) {
        const matchingCam = cameras.find(c => {
          const label = (c.label || '').toLowerCase();
          if (nextFacing === 'environment') {
            return label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('facing 0') || label.includes('camera 0');
          } else {
            return label.includes('front') || label.includes('user') || label.includes('facing 1') || label.includes('camera 1');
          }
        });

        if (matchingCam) {
          targetCamId = matchingCam.deviceId;
        } else {
          const currentIndex = cameras.findIndex(c => c.deviceId === selectedCam);
          const nextIndex = (currentIndex + 1) % cameras.length;
          targetCamId = cameras[nextIndex].deviceId;
        }
      }

      setSelectedCam(targetCamId);

      await handleDeviceSwitch({
        selectedCamId: targetCamId,
        facingMode: nextFacing,
        localVideo: localVideoRef.current,
        pc
      });
    } else {
      // Desktop: cycle through attached USB cameras
      if (cameras.length > 1) {
        const currentIndex = cameras.findIndex(c => c.deviceId === selectedCam);
        const nextIndex = (currentIndex + 1) % cameras.length;
        const nextCamId = cameras[nextIndex].deviceId;
        setSelectedCam(nextCamId);

        await handleDeviceSwitch({
          selectedCamId: nextCamId,
          localVideo: localVideoRef.current,
          pc
        });
      } else {
        const nextFacing = currentFacingMode === 'user' ? 'environment' : 'user';
        await handleDeviceSwitch({
          facingMode: nextFacing,
          localVideo: localVideoRef.current,
          pc
        });
      }
    }

    if (localStream) {
      setHasLocalVideo(localStream.getVideoTracks().length > 0);
    }
  };

  // Copy Room ID
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopiedRoomId(true);
      setTimeout(() => setCopiedRoomId(false), 2000);
    });
  };

  // Share Room Link via WhatsApp
  const shareViaWhatsApp = () => {
    const meetingUrl = `${window.location.origin}/room/${roomId}`;
    const message = `Join my Alaapi music class session:\n${meetingUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // Fullscreen state and handler
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request error:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn("Exit fullscreen error:", err);
      });
    }
  };

  // Toggle local video mirror
  const handleToggleLocalMirror = (e) => {
    if (e) e.stopPropagation();
    setIsLocalMirrored(prev => {
      const next = !prev;
      if (localVideoRef.current) {
        if (next) {
          localVideoRef.current.classList.add('scale-x-[-1]');
        } else {
          localVideoRef.current.classList.remove('scale-x-[-1]');
        }
      }

      // Sync mirror state to Firestore room doc so peer's screen mirrors this video feed in real-time
      if (roomId) {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        const mirrorField = isCaller ? 'callerMirrored' : 'calleeMirrored';
        updateDoc(roomRef, { [mirrorField]: next }).catch(err => console.warn("Failed to sync mirror state:", err));
      }

      return next;
    });
  };

  return (
    <div id="videoContainer" className="w-full h-full h-[100dvh] flex bg-gray-950 overflow-hidden select-none">
      {/* 1. Main Remote Stage */}
      <div id="remoteStage" className="relative flex-1 min-h-0 w-full h-full bg-black rounded-none overflow-hidden flex items-center justify-center">
        {/* Call Timer Overlay Badge on Remote Stage (Desktop/Wide screens) */}
        <div className="absolute top-3 left-3 z-20 hidden sm:flex items-center gap-1.5 px-3 py-1 bg-gray-900/85 backdrop-blur rounded-full border border-gray-700/80 font-mono text-xs font-semibold text-gray-200 shadow-md">
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span>{formatDuration(callDuration)}</span>
        </div>

        {/* Remote Video Stream (Mirrors automatically when peer mirrors their camera) */}
        <video
          ref={remoteVideoRef}
          id="remoteVideo"
          className={`w-full h-full object-contain mx-auto transition-transform ${isRemoteMirrored ? 'scale-x-[-1]' : ''}`}
          autoPlay
          playsInline
        />

        {/* Remote Video Mirror Toggle Button */}
        {remoteConnected && (
          <button
            onClick={() => setIsRemoteMirrored(prev => !prev)}
            title={isRemoteMirrored ? "Switch Remote Video to Normal" : "Mirror Remote Video Feed"}
            className="absolute bottom-3 left-3 z-20 bg-gray-900/80 hover:bg-gray-900 active:scale-95 text-gray-300 hover:text-white px-2.5 py-1 rounded-full backdrop-blur border border-purple-500/30 text-[11px] font-semibold flex items-center gap-1.5 shadow-lg transition-all"
          >
            <FlipHorizontal className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[10px] hidden sm:inline">{isRemoteMirrored ? "Remote Mirrored" : "Mirror Remote"}</span>
          </button>
        )}

        {/* Remote Placeholder when waiting */}
        {!remoteConnected && (
          <div id="remotePlaceholder" className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-gray-950 z-10">
            <Radio className="w-16 h-16 sm:w-20 sm:h-20 mb-3 opacity-25 animate-pulse text-purple-400" />
            <span className="text-sm font-medium tracking-wide text-gray-500">
              Awaiting Connection in Room {roomId}...
            </span>
          </div>
        )}

        {/* Mobile Top Overlay: Room ID, Call Timer & WhatsApp Share Button */}
        <div className="mobile-top-bar absolute top-3 pt-[env(safe-area-inset-top,0px)] inset-x-3 z-20 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Small Call Running Timer Pill on Mobile */}
            <div className="bg-gray-900/85 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold text-gray-200 flex items-center gap-1.5 border border-purple-500/30 shadow">
              <Clock className="w-3 h-3 text-purple-400" />
              <span>{formatDuration(callDuration)}</span>
            </div>

            {remoteConnected && (
              <div className="bg-gray-900/85 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-semibold text-green-400 flex items-center gap-1.5 border border-green-500/30 shadow">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Raw Audio
              </div>
            )}
            <div ref={wakeLockBadgeRef} className="bg-gray-900/85 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-semibold text-blue-400 flex items-center gap-1.5 border border-blue-500/30 shadow">
              Awake
            </div>
          </div>

          <div className="bg-gray-900/90 backdrop-blur border border-purple-500/40 rounded-full px-3 py-1 shadow-lg flex items-center gap-2 pointer-events-auto">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Room</span>
            <span className="text-sm font-mono font-bold text-purple-400 tracking-wider">{roomId}</span>
            {/* Share via WhatsApp button */}
            <button
              onClick={shareViaWhatsApp}
              className="text-emerald-400 hover:text-emerald-300 p-0.5 transition-colors flex items-center justify-center"
              title="Share Room link via WhatsApp"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.634.054-1.077-.087-1.189-.379-2.126-1.282-2.735-2.029-.071-.088-.135-.17-.193-.243-.377-.478-.65-.824-.65-1.42 0-.629.33-.938.448-1.06.118-.122.257-.153.342-.153.085 0 .17.002.245.006.079.004.184-.03.287.218.106.255.362.883.394.948.032.065.053.141.01.226-.042.085-.064.138-.127.212-.064.074-.134.166-.191.223-.064.064-.131.134-.056.262.074.128.33.543.708.88.487.433.897.568 1.025.632.128.064.202.053.277-.032.074-.085.319-.372.404-.5.085-.128.17-.106.287-.064.117.042.744.351.872.415.128.064.213.096.245.149.032.053.032.308-.112.713zM12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.975-1.306A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.167c-1.636 0-3.15-.494-4.417-1.341l-.317-.212-2.955.775.789-2.88-.231-.368A8.136 8.136 0 013.833 12c0-4.503 3.664-8.167 8.167-8.167 4.503 0 8.167 3.664 8.167 8.167 0 4.503-3.664 8.167-8.167 8.167z"/>
              </svg>
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
              className={`w-full h-full object-cover ${isLocalMirrored ? 'scale-x-[-1]' : ''} ${hasLocalVideo ? '' : 'hidden'}`}
              autoPlay
              playsInline
              muted
            />

            {/* Mirror Toggle Button on Overlay Video Feed */}
            {hasLocalVideo && (
              <button
                onClick={handleToggleLocalMirror}
                title={isLocalMirrored ? "Switch to Normal (Unmirrored)" : "Switch to Mirrored"}
                className="absolute top-1.5 left-1.5 z-20 bg-black/70 hover:bg-black/90 active:scale-95 text-gray-200 hover:text-white px-1.5 py-1 rounded-md backdrop-blur border border-white/20 transition-all flex items-center gap-1 shadow-md"
              >
                <FlipHorizontal className="w-3.5 h-3.5 text-purple-300" />
                <span className="text-[9px] font-semibold hidden sm:inline">
                  {isLocalMirrored ? 'Mirrored' : 'Normal'}
                </span>
              </button>
            )}

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

        {/* Middle: Session Info (Clean Desktop Card with Room ID & Call Duration) */}
        <div className="sidebar-info-card flex-col gap-2.5 p-3.5 bg-gray-950/70 rounded-xl border border-gray-800 text-xs">
          {/* Room ID Row */}
          <div className="flex items-center justify-between bg-gray-900/90 px-3 py-2 rounded-lg border border-purple-500/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Room ID</span>
              <span className="text-base font-mono font-bold text-purple-400 tracking-wider select-all">{roomId}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={shareViaWhatsApp}
                title="Share Meeting via WhatsApp"
                className="text-emerald-400 hover:text-emerald-300 p-1 rounded hover:bg-gray-800 transition-colors flex items-center justify-center"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.634.054-1.077-.087-1.189-.379-2.126-1.282-2.735-2.029-.071-.088-.135-.17-.193-.243-.377-.478-.65-.824-.65-1.42 0-.629.33-.938.448-1.06.118-.122.257-.153.342-.153.085 0 .17.002.245.006.079.004.184-.03.287.218.106.255.362.883.394.948.032.065.053.141.01.226-.042.085-.064.138-.127.212-.064.074-.134.166-.191.223-.064.064-.131.134-.056.262.074.128.33.543.708.88.487.433.897.568 1.025.632.128.064.202.053.277-.032.074-.085.319-.372.404-.5.085-.128.17-.106.287-.064.117.042.744.351.872.415.128.064.213.096.245.149.032.053.032.308-.112.713zM12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.975-1.306A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.167c-1.636 0-3.15-.494-4.417-1.341l-.317-.212-2.955.775.789-2.88-.231-.368A8.136 8.136 0 013.833 12c0-4.503 3.664-8.167 8.167-8.167 4.503 0 8.167 3.664 8.167 8.167 0 4.503-3.664 8.167-8.167 8.167z"/>
                </svg>
              </button>
              <button
                onClick={copyRoomId}
                title="Copy Room ID"
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
              >
                {copiedRoomId ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={handleToggleFullscreen}
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Call Running Timer & Connection Status */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-800">
            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-purple-300 bg-purple-950/40 px-2.5 py-1 rounded-md border border-purple-500/30">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>{formatDuration(callDuration)}</span>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              remoteConnected
                ? 'bg-green-950/50 text-green-400 border-green-500/40'
                : 'bg-gray-800 text-gray-400 border-gray-700'
            }`}>
              {remoteConnected ? '● Connected' : 'Waiting...'}
            </span>
          </div>

          {/* Status Display */}
          <div className="pt-1 border-t border-gray-800">
            <p className="text-gray-300 font-mono text-[11px] leading-relaxed break-words">
              {statusText}
            </p>
          </div>
        </div>

        {/* Bottom: In-Call Studio Controls */}
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
              <span className="text-xs font-semibold">{!hasLocalAudio ? "No Mic" : isMuted ? "Unmute" : "Mute"}</span>
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
              <span className="text-xs font-semibold">{!hasLocalVideo ? "No Cam" : isVideoOff ? "Start Video" : "Stop Video"}</span>
            </button>

            {/* In-Call Camera Switch (Front/Back on Mobile, or cycle attached cameras on Desktop) */}
            <button
              id="switchCameraBtn"
              onClick={handleFlipCamera}
              disabled={!hasLocalVideo}
              className={`text-white shadow border transition-colors flex items-center justify-center gap-2 ${
                !hasLocalVideo
                  ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed opacity-40'
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600'
              }`}
              title={!hasLocalVideo ? "Camera not available" : "Switch / Flip Camera"}
            >
              <RefreshCw className="w-5 h-5 shrink-0" />
              <span className="text-xs font-semibold">Switch Cam</span>
            </button>

            {/* Leave Call */}
            <button
              onClick={handleLeaveCall}
              className="bg-red-600 hover:bg-red-500 text-white shadow border border-red-700 transition-colors flex items-center justify-center gap-2"
              title="Leave & End Call"
            >
              <PhoneOff className="w-5 h-5 shrink-0" />
              <span className="text-xs font-semibold">Leave</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Graceful Session Error Modal */}
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
