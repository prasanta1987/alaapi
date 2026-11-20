import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import {
  db,
  appId,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  arrayUnion,
  deleteField
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
  getPreferredDevices,
  setVoiceCallMode,
  buildAudioConstraints
} from '../services/media';
import {
  initPeerConnection,
  processRemoteCandidates,
  closePeerConnection,
  pc,
  optimizeSdpForMusic,
  optimizeSdpForSpeech,
  optimizeAudioSenders,
  resetIceCandidates
} from '../services/webrtc';
import { useCallTimer } from '../hooks/useCallTimer';
import { useMicLevel } from '../hooks/useMicLevel';
import { WhatsAppBanner } from '../components/studio/WhatsAppBanner';
import { AudioOnlyStage } from '../components/studio/AudioOnlyStage';
import { RemoteVideoControls } from '../components/studio/RemoteVideoControls';
import { RemotePlaceholder } from '../components/studio/RemotePlaceholder';
import { VolumePopover } from '../components/studio/VolumePopover';
import { MobileTopBar } from '../components/studio/MobileTopBar';
import { LocalVideoCard } from '../components/studio/LocalVideoCard';
import { SessionInfoCard } from '../components/studio/SessionInfoCard';
import { StudioControls } from '../components/studio/StudioControls';
import { SessionErrorModal } from '../components/studio/SessionErrorModal';

export function CallStudioPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const isCaller = searchParams.get('isCaller') === 'true';
  const callId = searchParams.get('callId');
  const calleeName = searchParams.get('calleeName');
  const urlCallType = searchParams.get('callType');
  const [callType, setCallType] = useState(() => urlCallType || 'video');
  const isAudioOnly = callType === 'audio';
  const { currentUser } = useAuth();
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const { incomingCall } = useCall();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [statusText, setStatusText] = useState('Initializing acoustic studio...');
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(() => isAudioOnly);
  const [isLocalMirrored, setIsLocalMirrored] = useState(true);
  const [isRemoteMirrored, setIsRemoteMirrored] = useState(false);
  const [isRemoteZoomed, setIsRemoteZoomed] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [hasLocalVideo, setHasLocalVideo] = useState(() => !isAudioOnly);
  const [hasLocalAudio, setHasLocalAudio] = useState(true);
  const [errorModalMsg, setErrorModalMsg] = useState(null);
  const [errorCountdown, setErrorCountdown] = useState(5);

  // Auto-dismiss disconnect notice modal after 5 seconds or immediately if another incoming call arrives
  useEffect(() => {
    if (!errorModalMsg) return;

    if (incomingCall) {
      setErrorModalMsg(null);
      navigate(currentUserRef.current ? '/dashboard' : '/', { replace: true });
      return;
    }

    setErrorCountdown(5);
    const countdownInterval = setInterval(() => {
      setErrorCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setErrorModalMsg(null);
          navigate(currentUserRef.current ? '/dashboard' : '/', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [errorModalMsg, incomingCall, navigate]);

  // Health Diagnostics: Mic Level & Ping
  const [pingRtt, setPingRtt] = useState(null); // in ms
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState(100); // 0..100% monitor volume
  const [showVolumePopover, setShowVolumePopover] = useState(false);
  const [activeAudioStream, setActiveAudioStream] = useState(() => localStream);

  // Mobile controls auto-dimmer
  const [isControlsDimmed, setIsControlsDimmed] = useState(false);

  // Available camera devices for in-call switching
  const [cameras, setCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState('');

  // Call duration timer & vocal dynamics mic analyzer hooks
  const { callDuration, formatDuration } = useCallTimer();
  const micLevel = useMicLevel(activeAudioStream, isMuted);

  // Navigation & lifecycle refs
  const isLeavingRef = useRef(false);
  const disconnectTimerRef = useRef(null);
  const iceRestartTimerRef = useRef(null);
  const unansweredTimeoutRef = useRef(null);
  const lastAppliedAnswerSdp = useRef(null);
  const lastAnsweredOfferSdp = useRef(null);
  const volumePopoverRef = useRef(null);
  const volumeBtnRef = useRef(null);
  const sliderTrackRef = useRef(null);
  const isDraggingVolumeRef = useRef(false);

  // Open Lobby Room (Wait-Until-2nd-Peer) tracking
  const isOpenRoomRef = useRef(false);
  const webrtcStartedRef = useRef(false);
  const effectiveIsCallerRef = useRef(isCaller);
  const myPeerId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`).current;
  const heartbeatIntervalRef = useRef(null);
  const isSharingOrBackgroundRef = useRef(false);

  // Safe WhatsApp & Native Link Sharing
  const handleShareRoomLink = async () => {
    isSharingOrBackgroundRef.current = true;
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }

    const publicOrigin = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'https://alaapi.web.app'
      : window.location.origin;
    const shareUrl = `${publicOrigin}/room/${roomId}`;
    const baseText = `Join My Live Calling Session:`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Alaapi Music Studio',
          text: baseText,
          url: shareUrl
        });
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Navigator share error, falling back to WhatsApp:', err);
        } else {
          return;
        }
      } finally {
        setTimeout(() => {
          isSharingOrBackgroundRef.current = false;
        }, 5000);
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${baseText} ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
    setTimeout(() => {
      isSharingOrBackgroundRef.current = false;
    }, 5000);
  };

  // Return-from-background revival (WhatsApp link sharing recovery & track health)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        isSharingOrBackgroundRef.current = false;

        // Clear any disconnect timer triggered while in background
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }

        requestScreenWakeLock().catch(() => { });

        // Revive local video playback
        if (localVideoRef.current && localVideoRef.current.paused) {
          localVideoRef.current.play().catch(() => { });
        }

        // Check if Android OS killed local hardware tracks while WhatsApp was foregrounded
        if (localStream) {
          const vTracks = localStream.getVideoTracks();
          const hasDeadVideo = !isAudioOnly && (vTracks.length === 0 || vTracks.some(t => t.readyState === 'ended'));
          const aTracks = localStream.getAudioTracks();
          const hasDeadAudio = aTracks.length === 0 || aTracks.some(t => t.readyState === 'ended');

          if (hasDeadVideo || hasDeadAudio) {
            console.log("[Media] Hardware tracks ended in background, re-acquiring...");
            try {
              const preferred = getPreferredDevices();
              await handleDeviceSwitch({
                selectedCamId: preferred.cameraId || '',
                selectedMicId: preferred.micId || '',
                localVideo: isAudioOnly ? null : localVideoRef.current,
                pc,
                audioOnly: isAudioOnly
              });
              if (localStream) setActiveAudioStream(localStream);
            } catch (e) {
              console.warn("Could not re-acquire hardware after background:", e);
            }
          }
        }

        // In Open Room: ensure presence heartbeat is active and send immediate pulse
        if (isOpenRoomRef.current && roomId && myPeerId) {
          const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
          updateDoc(roomRef, {
            [`peers.${myPeerId}`]: Date.now()
          }).catch(() => { });

          if (!heartbeatIntervalRef.current) {
            heartbeatIntervalRef.current = setInterval(() => {
              if (isLeavingRef.current) return;
              updateDoc(roomRef, {
                [`peers.${myPeerId}`]: Date.now()
              }).catch(() => { });
            }, 15000);
          }

          // If WebRTC is active and was interrupted while backgrounded, trigger automatic ICE recovery
          if (webrtcStartedRef.current && pc && (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) {
            try {
              console.log("[WebRTC] Triggering ICE restart after returning from background...");
              resetIceCandidates();
              if (typeof pc.restartIce === 'function') {
                pc.restartIce();
              }
              if (effectiveIsCallerRef.current) {
                const offer = await pc.createOffer({ iceRestart: true });
                const sdp = isAudioOnly ? optimizeSdpForSpeech(offer.sdp) : optimizeSdpForMusic(offer.sdp);
                const rtcOffer = new RTCSessionDescription({ type: offer.type, sdp });
                await pc.setLocalDescription(rtcOffer);
                await optimizeAudioSenders(pc, isAudioOnly);
                await updateDoc(roomRef, {
                  offer: { type: rtcOffer.type, sdp: rtcOffer.sdp },
                  answer: null,
                  callerCandidates: [],
                  calleeCandidates: []
                });
              }
            } catch (err) {
              console.warn("ICE restart recovery failed:", err);
            }
          }
        }
      } else {
        // When tab is hidden in background, cancel disconnect timer so backgrounding never kills session
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomId, myPeerId, isAudioOnly]);

  // Auto-dismiss volume popover on tap outside
  useEffect(() => {
    if (!showVolumePopover) return;

    const handleOutsideTap = (e) => {
      if (isDraggingVolumeRef.current) return;
      if (
        volumePopoverRef.current &&
        !volumePopoverRef.current.contains(e.target) &&
        volumeBtnRef.current &&
        !volumeBtnRef.current.contains(e.target)
      ) {
        setShowVolumePopover(false);
      }
    };

    window.addEventListener('pointerdown', handleOutsideTap);
    window.addEventListener('touchstart', handleOutsideTap);

    return () => {
      window.removeEventListener('pointerdown', handleOutsideTap);
      window.removeEventListener('touchstart', handleOutsideTap);
    };
  }, [showVolumePopover]);

  // 1. Flat Navigation & Accidental Back-Swipe Interception Guard
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
      }).catch(() => { });
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

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (callId) {
        try {
          const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId);
          await deleteDoc(callRef);
        } catch (e) { }
      }

      if (shouldDelete && roomId) {
        try {
          const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
          if (isOpenRoomRef.current) {
            await updateDoc(roomRef, {
              [`peers.${myPeerId}`]: deleteField()
            }).catch(() => { });
          } else {
            await deleteDoc(roomRef);
          }
        } catch (e) {
          console.warn("Could not delete room doc:", e);
        }
      }

      if (navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }

      closePeerConnection();
      stopLocalMedia(localVideoRef.current);
      setVoiceCallMode(false);
      releaseScreenWakeLock();

      if (message && (
        message.includes("not found") ||
        message.includes("unavailable") ||
        message.includes("ended") ||
        message.includes("No answer") ||
        message.includes("lost") ||
        message.includes("disconnected") ||
        message.includes("declined")
      )) {
        setErrorModalMsg(message);
      } else {
        navigate(currentUserRef.current ? '/dashboard' : '/', { replace: true });
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

    // USB / Headset Hot-Plug Recovery Listener
    const handleDeviceChange = async () => {
      if (isTerminated) return;
      try {
        const audioTracks = localStream ? localStream.getAudioTracks() : [];
        const hasEndedAudio = audioTracks.some(t => t.readyState === 'ended');
        const preferred = getPreferredDevices();
        if (hasEndedAudio || preferred.micId) {
          await handleDeviceSwitch({
            selectedMicId: preferred.micId || '',
            localVideo: isAudioOnly ? null : localVideoRef.current,
            pc,
            audioOnly: isAudioOnly
          });
          if (localStream) setActiveAudioStream(localStream);
        }
        if (remoteVideoRef.current && typeof remoteVideoRef.current.setSinkId === 'function' && preferred.speakerId) {
          await remoteVideoRef.current.setSinkId(preferred.speakerId).catch(() => { });
        }
      } catch (e) {
        console.warn("Hot-plug recovery warning:", e);
      }
    };

    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    const startCall = async () => {
      try {
        const stream = await setupLocalMedia(localVideoRef.current, null, isAudioOnly);
        if (isTerminated) {
          stopLocalMedia(localVideoRef.current);
          return;
        }
        setActiveAudioStream(stream);

        const vTracks = stream.getVideoTracks();
        const aTracks = stream.getAudioTracks();
        setHasLocalVideo(vTracks.length > 0 && !isAudioOnly);
        setHasLocalAudio(aTracks.length > 0);
        setIsVideoOff(isAudioOnly || vTracks.length === 0);

        // Enumerate video devices only if video is supported
        if (!isAudioOnly && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
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
        let roomSnap = null;
        try {
          roomSnap = await getDoc(roomRef);
        } catch (e) {
          console.warn("Could not check room document:", e);
        }

        if (!roomSnap || !roomSnap.exists() || roomSnap.data()?.status === 'ended') {
          discardCallSession("This meeting link has expired or ended.", false);
          return;
        }

        const roomData = roomSnap.data();
        const isOpenRoom = !callId && roomData?.mode === 'open';
        isOpenRoomRef.current = isOpenRoom;

        if (!isOpenRoom) {
          // Direct Call WebRTC flow (100% untouched)
          webrtcStartedRef.current = true;
          initPeerConnection({
            localStream: stream,
            isCaller,
            isAudioOnly,
            onRemoteStream: (remoteStream) => {
              if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
                remoteVideoRef.current.srcObject = remoteStream;
                remoteVideoRef.current.play().catch(e => console.warn("Remote play prevented:", e));

                // Route remote audio to user's preferred speaker if set
                const preferred = getPreferredDevices();
                if (typeof remoteVideoRef.current.setSinkId === 'function' && preferred.speakerId) {
                  remoteVideoRef.current.setSinkId(preferred.speakerId).catch(() => { });
                }

                setRemoteConnected(true);
                setIsReconnecting(false);
                setStatusText(isAudioOnly ? "Connected! Speech Mode active (Echo Cancellation ON)." : "Connected! High-fidelity audio active.");

                if (unansweredTimeoutRef.current) {
                  clearTimeout(unansweredTimeoutRef.current);
                  unansweredTimeoutRef.current = null;
                }
              }
            },
            onIceCandidate: async (candidate) => {
              const candidateStr = JSON.stringify(candidate.toJSON());
              const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
              await updateDoc(roomRef, { [field]: arrayUnion(candidateStr) }).catch(() => { });
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
                setStatusText(isAudioOnly ? "Connected! Speech Mode active (Echo Cancellation ON)." : "Connected! High-fidelity audio active.");
              } else if (state === 'disconnected' || state === 'failed') {
                setIsReconnecting(true);
                setStatusText("Network interruption... Reconnecting...");

                // Graceful disconnect limit (only if tab is visible and not sharing)
                if (!disconnectTimerRef.current && document.visibilityState === 'visible' && !isSharingOrBackgroundRef.current) {
                  disconnectTimerRef.current = setTimeout(() => {
                    if (document.visibilityState === 'visible' && !isSharingOrBackgroundRef.current) {
                      discardCallSession("Connection lost.", true);
                    }
                  }, 25000);
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
                        const sdp = isAudioOnly ? optimizeSdpForSpeech(offer.sdp) : optimizeSdpForMusic(offer.sdp);
                        const rtcOffer = new RTCSessionDescription({
                          type: offer.type,
                          sdp
                        });
                        await pc.setLocalDescription(rtcOffer);
                        await optimizeAudioSenders(pc, isAudioOnly);
                        await updateDoc(roomRef, {
                          offer: { type: rtcOffer.type, sdp: rtcOffer.sdp },
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
              callType: isAudioOnly ? 'audio' : 'video',
              createdAt: new Date().toISOString(),
              status: 'active',
              host: currentUserRef.current ? {
                uid: currentUserRef.current.uid,
                displayName: currentUserRef.current.displayName
              } : null
            }, { merge: true });

            const offer = await pc.createOffer();
            const sdp = isAudioOnly ? optimizeSdpForSpeech(offer.sdp) : optimizeSdpForMusic(offer.sdp);
            const rtcOffer = new RTCSessionDescription({
              type: offer.type,
              sdp
            });
            await pc.setLocalDescription(rtcOffer);
            await optimizeAudioSenders(pc, isAudioOnly);
            await updateDoc(roomRef, { offer: { type: rtcOffer.type, sdp: rtcOffer.sdp } });

            roomUnsubscribe = onSnapshot(roomRef, async (snapshot) => {
              if (!snapshot.exists()) {
                discardCallSession("Call ended: Room closed.", false);
                return;
              }

              const data = snapshot.data();
              if (!data) return;

              if (data.callType && data.callType !== callType) {
                setCallType(data.callType);
              }

              if (typeof data.calleeMirrored === 'boolean') {
                setIsRemoteMirrored(data.calleeMirrored);
              }

              // Apply answer when it arrives and differs from last applied answer
              if (data.answer && data.answer.sdp && data.answer.sdp !== lastAppliedAnswerSdp.current && pc && pc.signalingState === 'have-local-offer') {
                lastAppliedAnswerSdp.current = data.answer.sdp;
                const answerDesc = new RTCSessionDescription(data.answer);
                await pc.setRemoteDescription(answerDesc).catch(err => console.error("Error setting answer:", err));
                await optimizeAudioSenders(pc, isAudioOnly);
                if (data.calleeCandidates) {
                  processRemoteCandidates(data.calleeCandidates);
                }
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

              if (data.callType && data.callType !== callType) {
                setCallType(data.callType);
                if (data.callType === 'audio') {
                  setVoiceCallMode(true);
                  setHasLocalVideo(false);
                  setIsVideoOff(true);
                  if (localStream) {
                    localStream.getVideoTracks().forEach(track => {
                      track.stop();
                      localStream.removeTrack(track);
                    });
                    const audioTrack = localStream.getAudioTracks()[0];
                    if (audioTrack && typeof audioTrack.applyConstraints === 'function') {
                      audioTrack.applyConstraints(buildAudioConstraints(null, true)).catch(e => {
                        console.warn("Could not apply speech constraints to audio track:", e);
                      });
                    }
                  }
                  if (localVideoRef.current) {
                    localVideoRef.current.srcObject = null;
                  }
                }
              }

              // When host's offer is populated and differs from last answered offer
              if (data.offer && data.offer.sdp && data.offer.sdp !== lastAnsweredOfferSdp.current && pc) {
                try {
                  lastAnsweredOfferSdp.current = data.offer.sdp;
                  clearTimeout(notFoundTimer);

                  const offerDesc = new RTCSessionDescription(data.offer);
                  await pc.setRemoteDescription(offerDesc);
                  if (data.callerCandidates) {
                    processRemoteCandidates(data.callerCandidates);
                  }

                  const effectiveAudioOnly = isAudioOnly || data.callType === 'audio';
                  const answer = await pc.createAnswer();
                  const sdp = effectiveAudioOnly ? optimizeSdpForSpeech(answer.sdp) : optimizeSdpForMusic(answer.sdp);
                  const rtcAnswer = new RTCSessionDescription({
                    type: answer.type,
                    sdp
                  });
                  await pc.setLocalDescription(rtcAnswer);
                  await optimizeAudioSenders(pc, effectiveAudioOnly);

                  await updateDoc(roomRef, {
                    answer: { type: rtcAnswer.type, sdp: rtcAnswer.sdp },
                    calleeMirrored: isLocalMirrored,
                    guest: currentUserRef.current ? {
                      uid: currentUserRef.current.uid,
                      displayName: currentUserRef.current.displayName
                    } : null
                  });

                  setStatusText(effectiveAudioOnly ? "Connected! Speech Mode active (Echo Cancellation ON)." : "Connected! High-fidelity audio active.");
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
        } else {
          // Open Meeting Room Flow (Google Meet / Zoom style)
          let storedToken = null;
          try {
            const saved = JSON.parse(localStorage.getItem('alaapi_last_host_room') || 'null');
            if (saved && saved.roomId === roomId) {
              storedToken = saved.token;
            } else {
              storedToken = localStorage.getItem(`alaapi_host_token_${roomId}`) || sessionStorage.getItem(`alaapi_host_token_${roomId}`);
            }
          } catch (_) {
            storedToken = sessionStorage.getItem(`alaapi_host_token_${roomId}`);
          }
          const isRoomHost = Boolean(
            (storedToken && roomData?.hostToken && storedToken === roomData.hostToken) ||
            (currentUserRef.current && roomData?.host?.uid && roomData.host.uid === currentUserRef.current.uid)
          );
          effectiveIsCallerRef.current = isRoomHost;
          webrtcStartedRef.current = true;

          initPeerConnection({
            localStream: stream,
            isCaller: isRoomHost,
            isAudioOnly,
            onRemoteStream: (remoteStream) => {
              if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
                remoteVideoRef.current.srcObject = remoteStream;
                remoteVideoRef.current.play().catch(e => console.warn("Remote play prevented:", e));

                const preferred = getPreferredDevices();
                if (typeof remoteVideoRef.current.setSinkId === 'function' && preferred.speakerId) {
                  remoteVideoRef.current.setSinkId(preferred.speakerId).catch(() => { });
                }

                setRemoteConnected(true);
                setIsReconnecting(false);
                setStatusText(isAudioOnly ? "Connected! Speech Mode active (Echo Cancellation ON)." : "Connected! High-fidelity audio active.");
              }
            },
            onIceCandidate: async (candidate) => {
              const candidateStr = JSON.stringify(candidate.toJSON());
              const field = isRoomHost ? 'callerCandidates' : 'calleeCandidates';
              await updateDoc(roomRef, { [field]: arrayUnion(candidateStr) }).catch(() => { });
            },
            onConnectionStateChange: (state) => {
              console.log(`[Meeting WebRTC] Connection state: ${state}`);

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
                setStatusText(isAudioOnly ? "Connected! Speech Mode active (Echo Cancellation ON)." : "Connected! High-fidelity audio active.");
              } else if (state === 'disconnected' || state === 'failed') {
                setIsReconnecting(true);
                setStatusText("Network interruption... Reconnecting...");

                // Automatic ICE restart by host after grace period
                if (isRoomHost && !iceRestartTimerRef.current) {
                  iceRestartTimerRef.current = setTimeout(async () => {
                    if (pc && (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) {
                      try {
                        console.log("[Meeting WebRTC] Executing automatic ICE restart...");
                        resetIceCandidates();
                        if (typeof pc.restartIce === 'function') pc.restartIce();
                        const offer = await pc.createOffer({ iceRestart: true });
                        const sdp = isAudioOnly ? optimizeSdpForSpeech(offer.sdp) : optimizeSdpForMusic(offer.sdp);
                        const rtcOffer = new RTCSessionDescription({ type: offer.type, sdp });
                        await pc.setLocalDescription(rtcOffer);
                        await optimizeAudioSenders(pc, isAudioOnly);
                        await updateDoc(roomRef, {
                          offer: { type: rtcOffer.type, sdp: rtcOffer.sdp },
                          answer: null,
                          callerCandidates: [],
                          calleeCandidates: []
                        });
                      } catch (e) {
                        console.warn("ICE restart failed:", e);
                      }
                    }
                  }, 3000);
                }
              }
            }
          });

          if (isRoomHost) {
            // Host prepares offer immediately (like Google Meet / Zoom)
            setStatusText(`Meeting Ready [${roomId}]. Share the link to invite participants.`);

            try {
              const offer = await pc.createOffer();
              const sdp = isAudioOnly ? optimizeSdpForSpeech(offer.sdp) : optimizeSdpForMusic(offer.sdp);
              const rtcOffer = new RTCSessionDescription({ type: offer.type, sdp });
              await pc.setLocalDescription(rtcOffer);
              await optimizeAudioSenders(pc, isAudioOnly);

              await updateDoc(roomRef, {
                offer: { type: rtcOffer.type, sdp: rtcOffer.sdp },
                callerMirrored: isLocalMirrored,
                status: 'open'
              });
            } catch (err) {
              console.error("Host offer creation failed:", err);
            }

            // Host listens for guest answer & candidates
            roomUnsubscribe = onSnapshot(roomRef, async (snapshot) => {
              if (!snapshot.exists()) {
                discardCallSession("Call ended: Room closed.", false);
                return;
              }

              const data = snapshot.data();
              if (!data || data.status === 'ended') {
                discardCallSession("This meeting link has expired or ended.", false);
                return;
              }

              if (data.callType && data.callType !== callType) {
                setCallType(data.callType);
              }

              if (typeof data.calleeMirrored === 'boolean') {
                setIsRemoteMirrored(data.calleeMirrored);
              }

              // When guest answer arrives:
              if (data.answer && data.answer.sdp && data.answer.sdp !== lastAppliedAnswerSdp.current && pc && pc.signalingState === 'have-local-offer') {
                lastAppliedAnswerSdp.current = data.answer.sdp;
                const answerDesc = new RTCSessionDescription(data.answer);
                await pc.setRemoteDescription(answerDesc).catch(err => console.error("Error setting answer:", err));
                await optimizeAudioSenders(pc, isAudioOnly);
                if (data.calleeCandidates) {
                  processRemoteCandidates(data.calleeCandidates);
                }
                setStatusText(isAudioOnly ? "Connected! Speech Mode active (Echo Cancellation ON)." : "Connected! High-fidelity audio active.");
              }

              // Process remote candidates from guest
              if (data.calleeCandidates) {
                processRemoteCandidates(data.calleeCandidates);
              }
            }, (err) => {
              console.error("Host room listener error:", err);
              discardCallSession("Network error connecting to room.", false);
            });
          } else {
            // Guest joins: awaits host offer, applies it, and sends answer
            setStatusText(`Connecting to Room [${roomId}]...`);

            roomUnsubscribe = onSnapshot(roomRef, async (snapshot) => {
              if (!snapshot.exists()) {
                discardCallSession("This meeting link has expired or ended.", false);
                return;
              }

              const data = snapshot.data();
              if (!data || data.status === 'ended') {
                discardCallSession("This meeting link has expired or ended.", false);
                return;
              }

              if (data.callType && data.callType !== callType) {
                setCallType(data.callType);
                if (data.callType === 'audio') {
                  setVoiceCallMode(true);
                  setHasLocalVideo(false);
                  setIsVideoOff(true);
                  if (localStream) {
                    localStream.getVideoTracks().forEach(track => {
                      track.stop();
                      localStream.removeTrack(track);
                    });
                    const audioTrack = localStream.getAudioTracks()[0];
                    if (audioTrack && typeof audioTrack.applyConstraints === 'function') {
                      audioTrack.applyConstraints(buildAudioConstraints(null, true)).catch(e => {
                        console.warn("Could not apply speech constraints to audio track:", e);
                      });
                    }
                  }
                  if (localVideoRef.current) {
                    localVideoRef.current.srcObject = null;
                  }
                }
              }

              // When host's offer is available:
              if (data.offer && data.offer.sdp && data.offer.sdp !== lastAnsweredOfferSdp.current && pc && pc.signalingState !== 'closed') {
                try {
                  lastAnsweredOfferSdp.current = data.offer.sdp;
                  const offerDesc = new RTCSessionDescription(data.offer);
                  await pc.setRemoteDescription(offerDesc);
                  if (data.callerCandidates) {
                    processRemoteCandidates(data.callerCandidates);
                  }

                  const effectiveAudioOnly = isAudioOnly || data.callType === 'audio';
                  const answer = await pc.createAnswer();
                  const sdp = effectiveAudioOnly ? optimizeSdpForSpeech(answer.sdp) : optimizeSdpForMusic(answer.sdp);
                  const rtcAnswer = new RTCSessionDescription({ type: answer.type, sdp });
                  await pc.setLocalDescription(rtcAnswer);
                  await optimizeAudioSenders(pc, effectiveAudioOnly);

                  await updateDoc(roomRef, {
                    answer: { type: rtcAnswer.type, sdp: rtcAnswer.sdp },
                    calleeMirrored: isLocalMirrored,
                    guest: currentUserRef.current ? {
                      uid: currentUserRef.current.uid,
                      displayName: currentUserRef.current.displayName
                    } : null
                  });

                  setStatusText(effectiveAudioOnly ? "Connected! Speech Mode active (Echo Cancellation ON)." : "Connected! High-fidelity audio active.");
                } catch (err) {
                  console.error("Guest answer failed:", err);
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
              console.error("Guest room listener error:", err);
              discardCallSession("Network error connecting to room.", false);
            });
          }
        }
      } catch (err) {
        console.error("Call Setup Error:", err);
        setStatusText(`Hardware Error: ${err.message}`);
      }
    };

    startCall();

    const handleBeforeUnload = () => {
      // Note: On mobile devices, switching apps or sharing via WhatsApp triggers beforeunload/pagehide.
      // We must NOT wipe open rooms, peers, or stop the heartbeat here so link sharing never destroys the session.
      if (!isOpenRoomRef.current && callId) {
        const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId);
        deleteDoc(callRef).catch(() => { });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
      discardCallSession("Session closed.", true);
    };
  }, [roomId, isCaller, navigate]);

  // Leave Call action
  const handleLeaveCall = async () => {
    isLeavingRef.current = true;
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    try {
      if (roomId) {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        if (isOpenRoomRef.current) {
          await updateDoc(roomRef, {
            status: 'ended',
            offer: null,
            answer: null
          }).catch(() => { });
          await deleteDoc(roomRef).catch(() => { });
        } else {
          await deleteDoc(roomRef);
        }
      }
      if (callId) {
        const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', callId);
        await deleteDoc(callRef);
      }
      try {
        localStorage.removeItem('alaapi_last_host_room');
        if (roomId) {
          localStorage.removeItem(`alaapi_host_token_${roomId}`);
          sessionStorage.removeItem(`alaapi_host_token_${roomId}`);
        }
      } catch (_) { }
    } catch (e) {
      console.warn("Delete error on leave:", e);
    }
    closePeerConnection();
    stopLocalMedia(localVideoRef.current);
    setVoiceCallMode(false);
    releaseScreenWakeLock();
    navigate(currentUserRef.current ? '/dashboard' : '/', { replace: true });
  };

  // Toggle Microphone
  const handleAudioToggle = () => {
    const muted = toggleAudioMute();
    setIsMuted(muted);
  };

  // Toggle Video
  const handleVideoToggle = () => {
    if (isAudioOnly) return;
    const stopped = toggleVideoFeed();
    setIsVideoOff(stopped);
  };

  // Switch camera: toggles between front and back camera on mobile or cycles webcams on desktop
  const handleFlipCamera = async () => {
    if (isAudioOnly || !hasLocalVideo) return;

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
      setActiveAudioStream(localStream);
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

  // Adjust incoming remote audio monitor volume
  const handleVolumeChange = (newVol) => {
    const clamped = Math.max(0, Math.min(100, newVol));
    setRemoteVolume(clamped);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = clamped / 100;
    }
  };

  // Vertical slider touch/pointer drag handlers (moving up increases volume, moving down decreases)
  const updateVolumeFromPointer = (clientY) => {
    if (!sliderTrackRef.current) return;
    const rect = sliderTrackRef.current.getBoundingClientRect();
    if (rect.height <= 0) return;
    const relativeY = clientY - rect.top;
    const ratio = 1 - Math.max(0, Math.min(1, relativeY / rect.height));
    handleVolumeChange(Math.round(ratio * 100));
  };

  const handleSliderPointerDown = (e) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    isDraggingVolumeRef.current = true;
    const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    updateVolumeFromPointer(clientY);

    const onMove = (moveEvent) => {
      if (!isDraggingVolumeRef.current) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const currentY = moveEvent.clientY ?? (moveEvent.touches && moveEvent.touches[0] ? moveEvent.touches[0].clientY : 0);
      updateVolumeFromPointer(currentY);
    };

    const onEnd = () => {
      isDraggingVolumeRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
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
        const isCallerRole = isOpenRoomRef.current ? effectiveIsCallerRef.current : isCaller;
        const mirrorField = isCallerRole ? 'callerMirrored' : 'calleeMirrored';
        updateDoc(roomRef, { [mirrorField]: next }).catch(err => console.warn("Failed to sync mirror state:", err));
      }

      return next;
    });
  };

  return (
    <div id="videoContainer" className="w-full h-full h-[100dvh] flex bg-gray-950 overflow-hidden select-none relative">
      {/* WhatsApp In-App Browser Banner */}
      <WhatsAppBanner />

      {/* 1. Main Remote Stage */}
      <div id="remoteStage" className="relative flex-1 min-h-0 w-full h-full bg-black rounded-none overflow-hidden flex items-center justify-center">
        {/* Remote Video Stream (Hidden when Audio Only, plays incoming audio) */}
        <video
          ref={remoteVideoRef}
          id="remoteVideo"
          data-fit={isRemoteZoomed ? "cover" : "contain"}
          style={{ objectFit: isRemoteZoomed ? 'cover' : 'contain' }}
          className={isAudioOnly ? 'hidden' : `w-full h-full ${isRemoteZoomed ? 'object-cover' : 'object-contain'} mx-auto transition-all ${isRemoteMirrored ? 'scale-x-[-1]' : ''}`}
          autoPlay
          playsInline
        />

        {/* Dedicated Audio-Only Acoustic Stage UI */}
        {isAudioOnly && (
          <AudioOnlyStage
            calleeName={calleeName}
            remoteConnected={remoteConnected}
          />
        )}

        {/* Remote Video Actions: Vertical Icon-Only Dock (Mirror, Fit/Zoom, Fullscreen) */}
        {remoteConnected && !isAudioOnly && (
          <RemoteVideoControls
            isRemoteMirrored={isRemoteMirrored}
            onToggleMirror={() => setIsRemoteMirrored(prev => !prev)}
            isRemoteZoomed={isRemoteZoomed}
            onToggleZoom={() => setIsRemoteZoomed(prev => !prev)}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
            isControlsDimmed={isControlsDimmed}
          />
        )}

        {/* Sleek Vertical Floating Speaker Volume Popover on Mobile */}
        <VolumePopover
          show={showVolumePopover}
          remoteConnected={remoteConnected}
          remoteVolume={remoteVolume}
          onVolumeChange={handleVolumeChange}
          onSliderPointerDown={handleSliderPointerDown}
          volumePopoverRef={volumePopoverRef}
          sliderTrackRef={sliderTrackRef}
        />

        {/* Remote Placeholder when waiting */}
        {!remoteConnected && (
          <RemotePlaceholder
            isOpenRoom={isOpenRoomRef.current}
            roomId={roomId}
            onShareRoomLink={handleShareRoomLink}
          />
        )}

        {/* Mobile Top Overlay: Call Timer, Health Diagnostic Pill & Room ID */}
        <MobileTopBar
          callDuration={callDuration}
          formatDuration={formatDuration}
          micLevel={micLevel}
          isMuted={isMuted}
          hasLocalAudio={hasLocalAudio}
          pingRtt={pingRtt}
          remoteConnected={remoteConnected}
          isReconnecting={isReconnecting}
          roomId={roomId}
          copiedRoomId={copiedRoomId}
          onCopyRoomId={copyRoomId}
          onShareRoomLink={handleShareRoomLink}
          isControlsDimmed={isControlsDimmed}
        />
      </div>

      {/* 2. Studio Side Panel (Sidebar on Desktop, Overlay on Mobile) */}
      <aside id="studioSidePanel" className="flex flex-col">
        {/* Top: User Camera Card */}
        <LocalVideoCard
          localVideoRef={localVideoRef}
          hasLocalVideo={hasLocalVideo}
          hasLocalAudio={hasLocalAudio}
          isLocalMirrored={isLocalMirrored}
          onToggleLocalMirror={handleToggleLocalMirror}
          remoteConnected={remoteConnected}
          isAudioOnly={isAudioOnly}
        />

        {/* Middle: Session Info (Clean Desktop Card with Room ID, Call Duration & Health) */}
        <SessionInfoCard
          roomId={roomId}
          remoteConnected={remoteConnected}
          copiedRoomId={copiedRoomId}
          onCopyRoomId={copyRoomId}
          onShareRoomLink={handleShareRoomLink}
          callDuration={callDuration}
          formatDuration={formatDuration}
          micLevel={micLevel}
          isMuted={isMuted}
          hasLocalAudio={hasLocalAudio}
          pingRtt={pingRtt}
          isReconnecting={isReconnecting}
          remoteVolume={remoteVolume}
          onVolumeChange={handleVolumeChange}
          statusText={statusText}
        />

        {/* Bottom: In-Call Studio Controls */}
        <StudioControls
          hasLocalAudio={hasLocalAudio}
          isMuted={isMuted}
          onAudioToggle={handleAudioToggle}
          hasLocalVideo={hasLocalVideo}
          isVideoOff={isVideoOff}
          onVideoToggle={handleVideoToggle}
          isAudioOnly={isAudioOnly}
          remoteConnected={remoteConnected}
          remoteVolume={remoteVolume}
          showVolumePopover={showVolumePopover}
          onVolumeToggle={() => setShowVolumePopover(prev => !prev)}
          volumeBtnRef={volumeBtnRef}
          onFlipCamera={handleFlipCamera}
          onLeaveCall={handleLeaveCall}
          isControlsDimmed={isControlsDimmed}
        />
      </aside>

      {/* Graceful Session Error Modal */}
      <SessionErrorModal
        errorModalMsg={errorModalMsg}
        errorCountdown={errorCountdown}
        onDismiss={() => {
          setErrorModalMsg(null);
          navigate(currentUserRef.current ? '/dashboard' : '/', { replace: true });
        }}
        isLoggedIn={!!currentUserRef.current}
      />
    </div>
  );
}
