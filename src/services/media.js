// ==========================================================================
// Media & Hardware Devices Management
// ==========================================================================

export let localStream = null;
export let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
export let isAudioMuted = false;
export let isVideoStopped = false;
export let wakeLock = null;

const STORAGE_KEY_AUDIO_DSP = 'vocal_studio_audio_dsp_settings';

// Default DSP Settings for Music & Vocal Classes:
// Echo Cancellation OFF (stereo 48kHz lossless when using headphones)
export function loadStoredAudioSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_AUDIO_DSP);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        echoCancellation: Boolean(parsed.echoCancellation),
        noiseSuppression: Boolean(parsed.noiseSuppression),
        autoGainControl: Boolean(parsed.autoGainControl)
      };
    }
  } catch (e) {
    console.warn("Could not read audio DSP settings from localStorage:", e);
  }
  return {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false
  };
}

export let audioSettings = loadStoredAudioSettings();

export function getAudioSettings() {
  audioSettings = loadStoredAudioSettings();
  return { ...audioSettings };
}

export function saveAudioSettings(newSettings) {
  audioSettings = { ...audioSettings, ...newSettings };
  try {
    localStorage.setItem(STORAGE_KEY_AUDIO_DSP, JSON.stringify(audioSettings));
  } catch (e) {
    console.warn("Could not write audio DSP settings to localStorage:", e);
  }
  return { ...audioSettings };
}

export function buildAudioConstraints(deviceId = null) {
  const current = getAudioSettings();
  const isEchoCancel = Boolean(current.echoCancellation);
  const isNoiseSuppress = Boolean(current.noiseSuppression);
  const isAutoGain = Boolean(current.autoGainControl);

  const constraints = {
    echoCancellation: isEchoCancel,
    googEchoCancellation: isEchoCancel,
    noiseSuppression: isNoiseSuppress,
    googNoiseSuppression: isNoiseSuppress,
    googHighpassFilter: isNoiseSuppress,
    autoGainControl: isAutoGain,
    googAutoGainControl: isAutoGain
  };

  if (isEchoCancel) {
    // Standard AEC requires mono in WebRTC
    constraints.channelCount = { ideal: 1 };
  } else {
    // Lossless high-fidelity stereo musical dynamics (48kHz)
    constraints.channelCount = { ideal: 2 };
    constraints.sampleRate = { ideal: 48000 };
  }

  if (deviceId) {
    constraints.deviceId = { ideal: deviceId };
  }

  return constraints;
}

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';

  if (/Windows NT/i.test(ua)) return false;
  if (/Macintosh/i.test(ua) && (!navigator.maxTouchPoints || navigator.maxTouchPoints <= 1)) return false;
  if (/Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1) return true;

  if (navigator.maxTouchPoints > 1 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.screen.width <= 1024) {
    return true;
  }

  return false;
}

export function getDeviceOrientation() {
  const isMobile = isMobileDevice();

  if (isMobile) {
    if (typeof window !== 'undefined' && window.screen && window.screen.orientation && window.screen.orientation.type) {
      return window.screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape';
    }
    if (typeof window !== 'undefined' && typeof window.orientation !== 'undefined') {
      return (Math.abs(window.orientation) === 90 || Math.abs(window.orientation) === 270) ? 'landscape' : 'portrait';
    }
    if (typeof window !== 'undefined' && window.screen && window.screen.width && window.screen.height) {
      return window.screen.height >= window.screen.width ? 'portrait' : 'landscape';
    }
  }

  return (typeof window !== 'undefined' && window.innerHeight >= window.innerWidth) ? 'portrait' : 'landscape';
}

export function updateOrientationClasses() {
  if (typeof document === 'undefined') return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const isMobile = isMobileDevice();
  const orientation = getDeviceOrientation();

  const useSidePanel = !isMobile && width >= 850 && height >= 520;

  document.body.classList.toggle('layout-sidepanel', useSidePanel);
  document.body.classList.toggle('layout-overlay', !useSidePanel);
  document.body.classList.toggle('device-mobile', isMobile);
  document.body.classList.toggle('device-desktop', !isMobile);
  document.body.classList.toggle('orientation-portrait', orientation === 'portrait');
  document.body.classList.toggle('orientation-landscape', orientation === 'landscape');

  updateLocalVideoAspectRatio();
}

export const updateLayoutMode = updateOrientationClasses;

export function updateLocalVideoAspectRatio(videoEl = null) {
  if (typeof document === 'undefined') return;
  const video = videoEl || document.getElementById('localVideo');
  const container = document.getElementById('localVideoContainer');
  if (!video || !container) return;

  if (document.body.classList.contains('layout-sidepanel')) {
    container.style.removeProperty('aspect-ratio');
  } else if (video.videoWidth && video.videoHeight) {
    const aspect = `${video.videoWidth} / ${video.videoHeight}`;
    container.style.setProperty('aspect-ratio', aspect, 'important');
  }
}

export function getMusicConstraints(facingMode = currentFacingMode) {
  const isMobile = isMobileDevice();

  const videoConstraints = {
    facingMode: { ideal: facingMode }
  };

  if (!isMobile) {
    videoConstraints.width = { ideal: 1280 };
    videoConstraints.height = { ideal: 720 };
    videoConstraints.aspectRatio = { ideal: 16 / 9 };
  }

  return {
    video: videoConstraints,
    audio: buildAudioConstraints()
  };
}

export async function setupLocalMedia(localVideoElement, speakerContainer = null) {
  if (localStream) return localStream;

  let stream = null;

  // 1. Initial attempt: acquire both audio and video together
  try {
    stream = await navigator.mediaDevices.getUserMedia(getMusicConstraints(currentFacingMode));
  } catch (initialErr) {
    console.warn("Could not acquire both audio and video simultaneously:", initialErr.name, initialErr.message);

    // 2. Multi-stage hardware fallback
    let hasAudioDev = false;
    let hasVideoDev = false;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        hasAudioDev = devices.some(d => d.kind === 'audioinput');
        hasVideoDev = devices.some(d => d.kind === 'videoinput');
      }
    } catch (e) {
      console.warn("Could not enumerate devices:", e);
    }

    // Attempt standalone audio
    let audioStream = null;
    if (hasAudioDev || !hasVideoDev) {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints() });
      } catch (audioErr) {
        console.warn("Could not acquire standalone audio track:", audioErr.message);
      }
    }

    // Attempt standalone video
    let videoStream = null;
    if (hasVideoDev || !hasAudioDev) {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: getMusicConstraints(currentFacingMode).video });
      } catch (videoErr) {
        console.warn("Could not acquire standalone video track:", videoErr.message);
      }
    }

    // Combine any acquired tracks
    stream = new MediaStream();
    if (audioStream) {
      audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
    }
    if (videoStream) {
      videoStream.getVideoTracks().forEach(t => stream.addTrack(t));
    }
  }

  // Zero-hardware fallback: if device lacks both camera and mic, return empty stream
  if (!stream) {
    stream = new MediaStream();
  }

  localStream = stream;

  if (localVideoElement) {
    if (localStream.getVideoTracks().length > 0) {
      localVideoElement.srcObject = localStream;
      localVideoElement.play().catch(e => console.warn("Local video play prevented:", e));

      localVideoElement.onloadedmetadata = () => {
        updateLocalVideoAspectRatio(localVideoElement);
      };
      updateLocalVideoAspectRatio(localVideoElement);

      if (currentFacingMode === 'environment') {
        localVideoElement.classList.remove('scale-x-[-1]');
      } else {
        localVideoElement.classList.add('scale-x-[-1]');
      }
    } else {
      localVideoElement.srcObject = null;
    }
  }

  if (typeof HTMLMediaElement.prototype.setSinkId === 'undefined' && speakerContainer) {
    speakerContainer.style.display = 'none';
  }

  return localStream;
}

export function stopLocalMedia(localVideoElement = null) {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (localVideoElement) {
    localVideoElement.srcObject = null;
  }
}

export function toggleAudioMute(button = null, iconOn = null, iconOff = null) {
  if (!localStream || localStream.getAudioTracks().length === 0) return isAudioMuted;

  isAudioMuted = !isAudioMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isAudioMuted;
  });

  if (iconOn && iconOff) {
    iconOn.classList.toggle('hidden', isAudioMuted);
    iconOff.classList.toggle('hidden', !isAudioMuted);
  }

  return isAudioMuted;
}

export function toggleVideoFeed(button = null, iconOn = null, iconOff = null) {
  if (!localStream || localStream.getVideoTracks().length === 0) return isVideoStopped;

  isVideoStopped = !isVideoStopped;
  localStream.getVideoTracks().forEach(track => {
    track.enabled = !isVideoStopped;
  });

  if (iconOn && iconOff) {
    iconOn.classList.toggle('hidden', isVideoStopped);
    iconOff.classList.toggle('hidden', !isVideoStopped);
  }

  return isVideoStopped;
}

export function toggleCameraFacingMode() {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  return currentFacingMode;
}

// Clean in-call hardware switcher: switches camera or mic independently
export async function handleDeviceSwitch({ selectedCamId, selectedMicId, localVideo, pc }) {
  if (!localStream) {
    localStream = new MediaStream();
  }

  const isMobile = isMobileDevice();

  // 1. Switch Video Track if camera requested or available
  if (selectedCamId !== undefined) {
    try {
      const videoConstraints = selectedCamId
        ? { deviceId: { exact: selectedCamId } }
        : { facingMode: { ideal: currentFacingMode } };

      if (!isMobile) {
        videoConstraints.width = { ideal: 1280 };
        videoConstraints.height = { ideal: 720 };
        videoConstraints.aspectRatio = { ideal: 16 / 9 };
      }

      const tempStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      const newVideoTrack = tempStream.getVideoTracks()[0];

      if (newVideoTrack) {
        localStream.getVideoTracks().forEach(t => {
          localStream.removeTrack(t);
          t.stop();
        });
        newVideoTrack.enabled = !isVideoStopped;
        localStream.addTrack(newVideoTrack);

        if (pc && pc.signalingState !== 'closed') {
          const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack);
          } else {
            pc.addTrack(newVideoTrack, localStream);
          }
        }

        if (localVideo) {
          if (currentFacingMode === 'environment') {
            localVideo.classList.remove('scale-x-[-1]');
          } else {
            localVideo.classList.add('scale-x-[-1]');
          }
          localVideo.srcObject = localStream;
          localVideo.play().catch(e => console.warn("Video play prevented:", e));
          updateLocalVideoAspectRatio(localVideo);
        }
      }
    } catch (camErr) {
      console.warn("Could not switch camera device:", camErr);
    }
  }

  // 2. Switch Audio Track if microphone requested or available
  if (selectedMicId !== undefined) {
    try {
      const audioConstraints = buildAudioConstraints(selectedMicId);
      const tempAudioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      const newAudioTrack = tempAudioStream.getAudioTracks()[0];

      if (newAudioTrack) {
        localStream.getAudioTracks().forEach(t => {
          localStream.removeTrack(t);
          t.stop();
        });
        newAudioTrack.enabled = !isAudioMuted;
        localStream.addTrack(newAudioTrack);

        if (pc && pc.signalingState !== 'closed') {
          const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            await audioSender.replaceTrack(newAudioTrack);
          } else {
            pc.addTrack(newAudioTrack, localStream);
          }
        }
      }
    } catch (micErr) {
      console.warn("Could not switch microphone device:", micErr);
    }
  }
}

export async function requestScreenWakeLock(wakeLockBadge = null) {
  if ('wakeLock' in navigator) {
    if (wakeLock !== null && !wakeLock.released) return;

    try {
      wakeLock = await navigator.wakeLock.request('screen');
      if (wakeLockBadge) wakeLockBadge.classList.remove('hidden');

      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        if (wakeLockBadge) wakeLockBadge.classList.add('hidden');
      }, { once: true });
    } catch (err) {
      console.warn(`Wake Lock request skipped: ${err.message}`);
    }
  }
}

export function releaseScreenWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release().catch(() => { });
    wakeLock = null;
  }
}

export function setupOrientationListeners() {
  let resizeTimer = null;

  const handleOrientation = () => {
    updateOrientationClasses();
    updateLocalVideoAspectRatio();
  };

  window.addEventListener('orientationchange', () => {
    setTimeout(handleOrientation, 200);
  });

  if (typeof window !== 'undefined' && window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', () => {
      setTimeout(handleOrientation, 200);
    });
  }

  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      handleOrientation();
    }, 120);
  });

  handleOrientation();
}
