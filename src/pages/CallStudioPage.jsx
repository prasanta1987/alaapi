import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  db,
  appId,
  doc,
  setDoc,
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
  currentFacingMode,
  isMobileDevice,
  handleDeviceSwitch,
  requestScreenWakeLock,
  releaseScreenWakeLock,
  setupOrientationListeners,
  updateOrientationClasses,
  getPreferredDevices
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
  Minimize2,
  Scan
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

  const [statusText, setStatusText] = useState('Initializing acoustic studio...');
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isLocalMirrored, setIsLocalMirrored] = useState(true);
  const [isRemoteMirrored, setIsRemoteMirrored] = useState(false);
  const [isRemoteZoomed, setIsRemoteZoomed] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(true);
  const [hasLocalAudio, setHasLocalAudio] = useState(true);
  const [errorModalMsg, setErrorModalMsg] = useState(null);

  // Health Diagnostics: Mic Level & Ping
  const [micLevel, setMicLevel] = useState(0); // 0..100
  const [pingRtt, setPingRtt] = useState(null); // in ms
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Mobile controls auto-dimmer
  const [isControlsDimmed, setIsControlsDimmed] = useState(false);

  // Available camera devices for in-call switching
  const [cameras, setCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState('');

  // Call running duration timer
  const [callDuration, setCallDuration] = useState(0);

  // Navigation & lifecycle refs
  const isLeavingRef = useRef(false);
  const disconnectTimerRef = useRef(null);
  const iceRestartTimerRef = useRef(null);
  const unansweredTimeoutRef = useRef(null);
  const lastAppliedAnswerSdp = useRef(null);
  const lastAnsweredOfferSdp = useRef(null);

  // 1. Call Running Timer
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

  // 2. Flat Navigation & Accidental Back-Swipe Interception Guard
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      if (isLeavingRef.current) return;
      const leave = window.confirm('Leave the live singing class?');
      if (leave) {
        handleLeaveCall();
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // 3. Local Mic VU Level Analyzer (0..100)
  useEffect(() => {
    let analyserInterval = null;
    let micAudioCtx = null;

    try {
      if (localStream && localStream.getAudioTracks().length > 0) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          micAudioCtx = new AudioContextClass();
          const source = micAudioCtx.createMediaStreamSource(localStream);
          const analyser = micAudioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          analyserInterval = setInterval(() => {
            if (isMuted || !localStream || localStream.getAudioTracks().length === 0) {
              setMicLevel(0);
              return;
            }
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(100, Math.round((avg / 128) * 100));
            setMicLevel(normalized);
          }, 120);
        }
      }
    } catch (e) {
      console.warn("Could not start local mic level analyzer:", e);
    }

    return () => {
      if (analyserInterval) clearInterval(analyserInterval);
      if (micAudioCtx) {
        micAudioCtx.close().catch(() => {});
      }
    };
  }, [hasLocalAudio, isMuted]);

  // 4. Live WebRTC Stats Ping Polling (every 3s when connected)
  useEffect(() => {
    if (!remoteConnected) {
      setPingRtt(null);
      return;
    }

    const pollStats = () => {
      if (!pc || pc.connectionState === 'closed') return;
      pc.getStats().then(stats => {
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
            setPingRtt(Math.round(report.currentRoundTripTime * 1000));
          }
        });
      }).catch(() => {});
    };

    pollStats();
    const statsInterval = setInterval(pollStats, 3000);
    return () => clearInterval(statsInterval);
  }, [remoteConnected]);

  // 5. Mobile Controls Auto-Dimmer after 5s idle during active call
  useEffect(() => {
    if (!remoteConnected) {
      setIsControlsDimmed(false);
      return;
    }

    let dimTimer = setTimeout(() => setIsControlsDimmed(true), 5000);

    const resetIdleTimer = () => {
      setIsControlsDimmed(false);
      clearTimeout(dimTimer);
      dimTimer = setTimeout(() => setIsControlsDimmed(true), 5000);
    };

    window.addEventListener('pointermove', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);

    return () => {
      clearTimeout(dimTimer);
      window.removeEventListener('pointermove', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
      window.removeEventListener('click', resetIdleTimer);
    };
  }, [remoteConnected]);

  // 6. Main WebRTC Session Lifecycle
  useEffect(() => {
    let roomUnsubscribe = null;
    let callUnsubscribe = null;
    let isTerminated = false;

    setupOrientationListeners();
    updateOrientationClasses();

    const discardCallSession = async (message, shouldDelete = false) => {
      if (isTerminated) return;
      isTerminated = true;
      isLeavingRef.current = true;

      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      if (iceRestartTimerRef.current) clearTimeout(iceRestartTimerRef.current);
      if (unansweredTimeoutRef.current) clearTimeout(unansweredTimeoutRef.current);

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

      if (message && (message.includes("not found") || message.includes("unavailable") || message.includes("ended") || message.includes("No answer"))) {
        setErrorModalMsg(message);
      } else {
        navigate(currentUser ? '/dashboard' : '/', { replace: true });
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
        const stream = await setupLocalMedia(localVideoRef.current);
        if (isTerminated) {
          stopLocalMedia(localVideoRef.current);
          return;
        }

        const vTracks = stream.getVideoTracks();
        const aTracks = stream.getAudioTracks();
        setHasLocalVideo(vTracks.length > 0);
        setHasLocalAudio(aTracks.length > 0);

        // Enumerate video devices
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          setCameras(videoDevices);

          const preferred = getPreferredDevices();
          if (preferred.cameraId && videoDevices.some(d => d.deviceId === preferred.cameraId)) {
            setSelectedCam(preferred.cameraId);
          } else if (videoDevices.length > 0) {
            setSelectedCam(videoDevices[0].deviceId);
          }
        }

        await requestScreenWakeLock();

        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

        // WebRTC initialization with automatic ICE restart and connection recovery
        initPeerConnection({
          localStream: stream,
          isCaller,
          onRemoteStream: (remoteStream) => {
            if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
              remoteVideoRef.current.srcObject = remoteStream;
              remoteVideoRef.current.play().catch(e => console.warn("Remote play prevented:", e));

              // Route remote audio to user's preferred speaker if set
              const preferred = getPreferredDevices();
              if (typeof remoteVideoRef.current.setSinkId === 'function' && preferred.speakerId) {
                remoteVideoRef.current.setSinkId(preferred.speakerId).catch(() => {});
              }

              setRemoteConnected(true);
              setIsReconnecting(false);
              setStatusText("Connected! High-fidelity audio active.");

              if (unansweredTimeoutRef.current) {
                clearTimeout(unansweredTimeoutRef.current);
                unansweredTimeoutRef.current = null;
              }
            }
          },
          onIceCandidate: async (candidate) => {
            const candidateStr = JSON.stringify(candidate.toJSON());
            const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
            await updateDoc(roomRef, { [field]: arrayUnion(candidateStr) }).catch(() => {});
          },
          onConnectionStateChange: (state) => {
            console.log(`[WebRTC] Connection state: ${state}`);

            if (state === 'connected' || state === 'completed') {
              if (disconnectTimerRef.current) {
                clearTimeout(disconnectTimerRef.current);
                disconnectTimerRef.current = null;
              }
              if (iceRestartTimerRef.current) {
                clearTimeout(iceRestartTimerRef.current);
                iceRestartTimerRef.current = null;
              }
              setIsReconnecting(false);
              setStatusText("Connected! High-fidelity audio active.");
            } else if (state === 'disconnected' || state === 'failed') {
              setIsReconnecting(true);
              setStatusText("Network interruption... Reconnecting...");

              // 14-second hard disconnect limit
              if (!disconnectTimerRef.current) {
                disconnectTimerRef.current = setTimeout(() => {
                  discardCallSession("Connection lost.", true);
                }, 14000);
              }

              // Automatic ICE restart by caller after 2.5s grace period
              if (isCaller && !iceRestartTimerRef.current) {
                iceRestartTimerRef.current = setTimeout(async () => {
                  if (pc && (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) {
                    try {
                      console.log("[WebRTC] Executing automatic ICE restart...");
                      if (typeof pc.restartIce === 'function') {
                        pc.restartIce();
                      }
                      const offer = await pc.createOffer({ iceRestart: true });
                      await pc.setLocalDescription(offer);
                      await updateDoc(roomRef, {
                        offer: { type: offer.type, sdp: offer.sdp },
                        answer: null
                      });
                    } catch (e) {
                      console.warn("ICE restart failed:", e);
                    }
                  }
                }, 2500);
              }
            }
          }
        });

        // 45-Second Unanswered Ring Timeout for caller
        if (isCaller) {
          unansweredTimeoutRef.current = setTimeout(() => {
            if (!remoteConnected && !isTerminated) {
              discardCallSession("No answer from participant. Please try calling again.", true);
            }
          }, 45000);
        }

        // USB / Headset Hot-Plug Recovery Listener
        const handleDeviceChange = async () => {
          try {
            const audioTracks = localStream ? localStream.getAudioTracks() : [];
            const hasEndedAudio = audioTracks.some(t => t.readyState === 'ended');
            const preferred = getPreferredDevices();
            if (hasEndedAudio || preferred.micId) {
              await handleDeviceSwitch({
                selectedMicId: preferred.micId || '',
                localVideo: localVideoRef.current,
                pc
              });
            }
          } catch (e) {
            console.warn("Hot-plug recovery warning:", e);
          }
        };

        if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
          navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        }

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

          roomUnsubscribe = onSnapshot(roomRef, async (snapshot) => {
            if (!snapshot.exists()) {
              discardCallSession("Call ended: Room closed.", false);
              return;
            }

            const data = snapshot.data();
            if (!data) return;

            if (typeof data.calleeMirrored === 'boolean') {
              setIsRemoteMirrored(data.calleeMirrored);
            }

            // Apply answer when it arrives and differs from last applied answer
            if (data.answer && data.answer.sdp && data.answer.sdp !== lastAppliedAnswerSdp.current && pc && pc.signalingState === 'have-local-offer') {
              lastAppliedAnswerSdp.current = data.answer.sdp;
              const answerDesc = new RTCSessionDescription(data.answer);
              await pc.setRemoteDescription(answerDesc).catch(err => console.error("Error setting answer:", err));
              setStatusText("Participant joined! Connecting...");

              if (unansweredTimeoutRef.current) {
                clearTimeout(unansweredTimeoutRef.current);
                unansweredTimeoutRef.current = null;
              }
            }

            processRemoteCandidates(data.calleeCandidates);
          });
        } else {
          // Joining as callee - await host offer
          setStatusText(`Connecting to Room [${roomId}]...`);

          const notFoundTimer = setTimeout(() => {
            if (!remoteConnected && !isTerminated) {
              discardCallSession(`Room "${roomId}" not found or host unavailable.`, false);
            }
          }, 15000);

          roomUnsubscribe = onSnapshot(roomRef, async (snapshot) => {
            if (!snapshot.exists()) {
              if (lastAnsweredOfferSdp.current) {
                discardCallSession("The host has ended the call.", false);
              }
              return;
            }

            const data = snapshot.data();
            if (!data) return;

            // When host's offer is populated and differs from last answered offer
            if (data.offer && data.offer.sdp && data.offer.sdp !== lastAnsweredOfferSdp.current && pc) {
              try {
                lastAnsweredOfferSdp.current = data.offer.sdp;
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
    isLeavingRef.current = true;
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
    navigate(currentUser ? '/dashboard' : '/', { replace: true });
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

  // Switch camera: toggles between front and back camera on mobile or cycles webcams on desktop
  const handleFlipCamera = async () => {
    if (!hasLocalVideo) return;

    const isMobile = isMobileDevice();

    if (isMobile) {
      const nextFacing = currentFacingMode === 'user' ? 'environment' : 'user';

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

  // Toggle local mirror mode
  const handleToggleLocalMirror = () => {
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

  // Diagnostic Health Pill (VU Meter + Ping)
  const renderDiagnosticPill = () => (
    <div className="bg-gray-900/85 backdrop-blur px-2 py-1 rounded-full border border-purple-500/30 flex items-center gap-1.5 shadow">
      {/* 4-bar mini VU meter */}
      <div className="flex items-end gap-0.5 h-3 px-0.5" title={isMuted ? "Microphone Muted" : `Mic Pickup: ${micLevel}%`}>
        {[1, 2, 3, 4].map(barIndex => {
          const threshold = barIndex * 22;
          const active = !isMuted && micLevel >= threshold;
          return (
            <span
              key={barIndex}
              style={{ height: `${barIndex * 2.5 + 2}px` }}
              className={`w-1 rounded-full transition-all duration-75 ${
                isMuted
                  ? 'bg-red-500/40'
                  : active
                  ? barIndex >= 4 ? 'bg-amber-400' : 'bg-emerald-400'
                  : 'bg-gray-700'
              }`}
            />
          );
        })}
      </div>

      {/* Connection Ping / Reconnecting Status */}
      {isReconnecting ? (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Reconnecting...
        </span>
      ) : pingRtt !== null ? (
        <span className="flex items-center gap-1 text-[10px] font-mono font-medium text-gray-300" title={`Round-Trip Time: ${pingRtt}ms`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            pingRtt < 150 ? 'bg-emerald-400' : pingRtt < 350 ? 'bg-amber-400' : 'bg-red-400'
          }`} />
          {pingRtt}ms
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          48kHz
        </span>
      )}
    </div>
  );

  return (
    <div id="videoContainer" className="w-full h-full h-[100dvh] flex bg-gray-950 overflow-hidden select-none">
      {/* 1. Main Remote Stage */}
      <div id="remoteStage" className="relative flex-1 min-h-0 w-full h-full bg-black rounded-none overflow-hidden flex items-center justify-center">
        {/* Remote Video Stream (Mirrors automatically when peer mirrors their camera; Fit/Fill Zoom toggles dynamically) */}
        <video
          ref={remoteVideoRef}
          id="remoteVideo"
          className={`w-full h-full ${isRemoteZoomed ? 'object-cover' : 'object-contain'} mx-auto transition-transform ${isRemoteMirrored ? 'scale-x-[-1]' : ''}`}
          autoPlay
          playsInline
        />

        {/* Remote Video Actions: Mirror Toggle & Fit / Fill Zoom Toggle */}
        {remoteConnected && (
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
            <button
              onClick={() => setIsRemoteMirrored(prev => !prev)}
              title={isRemoteMirrored ? "Switch Remote Video to Normal" : "Mirror Remote Video Feed"}
              className="bg-gray-900/80 hover:bg-gray-900 active:scale-95 text-gray-300 hover:text-white px-2.5 py-1 rounded-full backdrop-blur border border-purple-500/30 text-[11px] font-semibold flex items-center gap-1.5 shadow-lg transition-all"
            >
              <FlipHorizontal className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[10px] hidden sm:inline">{isRemoteMirrored ? "Remote Mirrored" : "Mirror Remote"}</span>
            </button>
            <button
              onClick={() => setIsRemoteZoomed(prev => !prev)}
              title={isRemoteZoomed ? "Switch to Fit (Contain)" : "Switch to Fill / Zoom (Cover)"}
              className="bg-gray-900/80 hover:bg-gray-900 active:scale-95 text-gray-300 hover:text-white px-2.5 py-1 rounded-full backdrop-blur border border-purple-500/30 text-[11px] font-semibold flex items-center gap-1.5 shadow-lg transition-all"
            >
              <Scan className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[10px] hidden sm:inline">{isRemoteZoomed ? "Fill / Zoom" : "Fit"}</span>
            </button>
          </div>
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

        {/* Mobile Top Overlay: Call Timer, Health Diagnostic Pill & Room ID (Auto-dims on mobile idle) */}
        <div className={`mobile-top-bar absolute top-3 pt-[env(safe-area-inset-top,0px)] inset-x-3 z-20 flex items-center justify-between pointer-events-none transition-opacity duration-300 ${
          isControlsDimmed ? 'opacity-25 hover:opacity-100' : 'opacity-100'
        }`}>
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Call Running Timer on Mobile / Video Feed */}
            <div className="bg-gray-900/85 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold text-purple-300 flex items-center gap-1.5 border border-purple-500/30 shadow">
              <Clock className="w-3 h-3 text-purple-400" />
              <span>{formatDuration(callDuration)}</span>
            </div>

            {/* Diagnostic Health Pill */}
            {renderDiagnosticPill()}
          </div>

          <div className="bg-gray-900/90 backdrop-blur border border-purple-500/40 rounded-full px-3 py-1 shadow-lg flex items-center gap-2 pointer-events-auto">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Room</span>
            <span className="text-sm font-mono font-bold text-purple-400 tracking-wider select-all">{roomId}</span>
            <button
              onClick={copyRoomId}
              title="Copy Room ID"
              className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-gray-800 transition-colors flex items-center justify-center"
            >
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

        {/* Middle: Session Info (Clean Desktop Card with Room ID, Call Duration & Health) */}
        <div className="sidebar-info-card flex-col gap-2.5 p-3.5 bg-gray-950/70 rounded-xl border border-gray-800 text-xs">
          {/* Room ID Row */}
          <div className="flex items-center justify-between bg-gray-900/90 px-3 py-2 rounded-lg border border-purple-500/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Room ID</span>
              <span className="text-base font-mono font-bold text-purple-400 tracking-wider select-all">{roomId}</span>
            </div>
            <div className="flex items-center gap-1">
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

          {/* Call Running Timer, Diagnostic Health & Connection Status */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-800 gap-2">
            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-purple-300 bg-purple-950/40 px-2.5 py-1 rounded-md border border-purple-500/30">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>{formatDuration(callDuration)}</span>
            </div>

            {/* Diagnostic Health Pill on Desktop Sidebar */}
            {renderDiagnosticPill()}

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

        {/* Bottom: In-Call Studio Controls (Auto-dims on mobile idle) */}
        <div className="w-full flex flex-col gap-2 shrink-0">
          <div className="sidebar-header text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
            Studio Controls
          </div>

          <nav id="mediaControls" className={`pointer-events-auto shrink-0 transition-opacity duration-300 ${
            isControlsDimmed ? 'opacity-25 hover:opacity-100' : 'opacity-100'
          }`}>
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
              onClick={() => navigate(currentUser ? '/dashboard' : '/', { replace: true })}
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
