// ==========================================================================
// Media & Hardware Devices Management
// ==========================================================================

export let localStream = null;
export let currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)
export let isAudioMuted = false;
export let isVideoStopped = false;
export let wakeLock = null;

// LocalStorage key for persisting audio DSP settings
const STORAGE_KEY_AUDIO_DSP = 'vocal_studio_audio_dsp_settings';

/**
 * Loads stored DSP settings from localStorage or defaults to pure singing dynamics (all false)
 */
function loadStoredAudioSettings() {
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
    // Default: disabled for pure musical singing performance
    return {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false
    };
}

export let audioSettings = loadStoredAudioSettings();

/**
 * Returns a copy of the current audio settings
 */
export function getAudioSettings() {
    return { ...audioSettings };
}

/**
 * Saves and updates audio DSP settings in memory and localStorage
 */
export function saveAudioSettings(newSettings) {
    audioSettings = { ...audioSettings, ...newSettings };
    try {
        localStorage.setItem(STORAGE_KEY_AUDIO_DSP, JSON.stringify(audioSettings));
    } catch (e) {
        console.warn("Could not write audio DSP settings to localStorage:", e);
    }
    return { ...audioSettings };
}

/**
 * Constructs WebRTC audio constraints matching current DSP settings.
 * WebRTC Architecture Note:
 * In Chromium (Chrome/Edge), Acoustic Echo Cancellation (AEC) strictly requires mono input.
 * When channelCount: 2 (stereo) is requested with echoCancellation: true, Chromium's
 * WebRtcAudioProcessor forcibly overrides echoCancellation to false.
 * To allow Echo Cancellation to activate, channelCount must be mono ({ ideal: 1 }).
 * When Echo Cancellation is turned OFF (pure music studio mode), channelCount is set to 2 (stereo 48kHz).
 */
export function buildAudioConstraints(deviceId = null) {
    const isEchoCancel = Boolean(audioSettings.echoCancellation);
    const isNoiseSuppress = Boolean(audioSettings.noiseSuppression);
    const isAutoGain = Boolean(audioSettings.autoGainControl);

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
        // AEC requires mono in WebRTC
        constraints.channelCount = { ideal: 1 };
    } else {
        // Full dynamic range stereo musical mode (48kHz)
        constraints.channelCount = { ideal: 2 };
        constraints.sampleRate = { ideal: 48000 };
    }

    if (deviceId) {
        constraints.deviceId = { ideal: deviceId };
    }

    return constraints;
}

// Sequential promise queue to eliminate concurrent getUserMedia race conditions
let audioReconfigQueue = Promise.resolve();

/**
 * Hot-swaps the audio track with newly configured DSP constraints.
 * Uses a promise queue to guarantee sequential execution without race conditions.
 * In Chromium (Chrome/Edge), calling applyConstraints on an existing microphone track
 * does not reconfigure the AudioProcessingModule (APM). Re-acquiring the track and using
 * RTCRtpSender.replaceTrack is required to genuinely rebuild the audio pipeline.
 */
export function reapplyAudioConstraints(pc = null) {
    audioReconfigQueue = audioReconfigQueue
        .catch(() => { })
        .then(() => _executeReapplyAudioConstraints(pc));
    return audioReconfigQueue;
}

async function _executeReapplyAudioConstraints(pc = null) {
    if (!localStream) return null;

    const oldAudioTrack = localStream.getAudioTracks()[0];
    const micDeviceId = oldAudioTrack ? oldAudioTrack.getSettings().deviceId : null;

    // CRITICAL: In Chromium, the AudioProcessingModule (APM) pipeline is shared by all
    // tracks from an active MediaStreamAudioSource. If oldAudioTrack is still running,
    // getUserMedia reuses the existing audio source and ignores newly requested DSP settings.
    // We MUST stop and remove oldAudioTrack FIRST so Chromium can construct a fresh pipeline.
    if (oldAudioTrack) {
        localStream.removeTrack(oldAudioTrack);
        oldAudioTrack.stop();
    }

    const audioConstraints = buildAudioConstraints(micDeviceId);

    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        const newAudioTrack = tempStream.getAudioTracks()[0];

        if (!newAudioTrack) return null;

        // Retain current mute state on the new hardware track
        newAudioTrack.enabled = !isAudioMuted;

        // Hot-swap in active WebRTC peer connection without dropping call
        if (pc && pc.signalingState !== 'closed') {
            const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
            if (audioSender) {
                await audioSender.replaceTrack(newAudioTrack);
            }
        }

        localStream.addTrack(newAudioTrack);

        const settings = newAudioTrack.getSettings();
        console.log("Hardware Audio DSP Successfully Applied:", {
            echoCancellation: settings.echoCancellation,
            noiseSuppression: settings.noiseSuppression,
            autoGainControl: settings.autoGainControl,
            channelCount: settings.channelCount,
            sampleRate: settings.sampleRate
        });

        return settings;
    } catch (err) {
        console.error("Failed to reapply audio constraints:", err);
        // Fallback recovery to re-acquire standard mic if specialized constraints failed
        try {
            const recoveryStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recoveryTrack = recoveryStream.getAudioTracks()[0];
            if (recoveryTrack) {
                recoveryTrack.enabled = !isAudioMuted;
                localStream.addTrack(recoveryTrack);
                if (pc && pc.signalingState !== 'closed') {
                    const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                    if (audioSender) await audioSender.replaceTrack(recoveryTrack);
                }
            }
        } catch (recErr) {
            console.warn("Audio recovery failed:", recErr);
        }
        throw err;
    }
}

/**
 * Updates a specific audio DSP setting and dynamically applies it to the active audio stream
 */
export async function updateAudioDSPSetting(key, value, pc = null) {
    if (!['echoCancellation', 'noiseSuppression', 'autoGainControl'].includes(key)) return null;

    saveAudioSettings({ [key]: Boolean(value) });

    if (localStream) {
        return await reapplyAudioConstraints(pc);
    }
    return null;
}

/**
 * Detects whether the current device is a mobile operating system (Android, iOS)
 * or a desktop operating system (Windows, Mac, Linux).
 */
export function isMobileDevice() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';

    // Explicit desktop checks (including Windows laptops with touchscreens)
    if (/Windows NT/i.test(ua)) return false;
    if (/Macintosh/i.test(ua) && (!navigator.maxTouchPoints || navigator.maxTouchPoints <= 1)) return false;

    // Explicit mobile devices (Android, iPhone, iPod)
    if (/Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)) return true;

    // iPadOS check (reports Macintosh + multi-touch)
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1) return true;

    // Touchscreen phone/tablet under 1024px width
    if (navigator.maxTouchPoints > 1 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.screen.width <= 1024) {
        return true;
    }

    return false;
}

/**
 * Returns 'portrait' or 'landscape' based on true device hardware orientation.
 * Mobile uses screen orientation API (immune to virtual keyboard).
 * Desktop uses viewport dimensions.
 */
export function getDeviceOrientation() {
    const isMobile = isMobileDevice();

    if (isMobile) {
        // 1. Modern Screen Orientation API
        if (typeof window !== 'undefined' && window.screen && window.screen.orientation && window.screen.orientation.type) {
            return window.screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape';
        }
        // 2. Legacy window.orientation (0, 180 = portrait; 90, -90, 270 = landscape)
        if (typeof window !== 'undefined' && typeof window.orientation !== 'undefined') {
            return (Math.abs(window.orientation) === 90 || Math.abs(window.orientation) === 270) ? 'landscape' : 'portrait';
        }
        // 3. Screen physical dimensions (fixed hardware pixels)
        if (typeof window !== 'undefined' && window.screen && window.screen.width && window.screen.height) {
            return window.screen.height >= window.screen.width ? 'portrait' : 'landscape';
        }
    }

    // Desktop browser or fallback: based on current viewport dimensions
    return (typeof window !== 'undefined' && window.innerHeight >= window.innerWidth) ? 'portrait' : 'landscape';
}

/**
 * Updates CSS classes on <body> based on device type, viewport dimensions, and orientation.
 * Smoothly switches between Side Panel Mode (wide desktop) and Overlay Mode (mobile/narrow desktop).
 */
export function updateOrientationClasses() {
    if (typeof document === 'undefined') return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const isMobile = isMobileDevice();
    const orientation = getDeviceOrientation();

    // Studio Side Panel is shown ONLY when there is ample width AND height, and not a phone
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

/**
 * Aligns the floating local video preview container with the native aspect ratio
 * of the camera stream, eliminating any letterboxing or CSS cropping (zoom).
 */
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

/**
 * Audio and video constraints reading from current persisted media state.
 * On mobile devices, does NOT enforce rigid aspect-ratio or digital crops,
 * transmitting the feed as it is in the camera with maximum natural FOV.
 */
export function getMusicConstraints(facingMode = currentFacingMode) {
    const isMobile = isMobileDevice();

    const videoConstraints = {
        facingMode: { ideal: facingMode }
    };

    if (!isMobile) {
        // Desktop / Laptop: standard 16:9 widescreen
        videoConstraints.width = { ideal: 1280 };
        videoConstraints.height = { ideal: 720 };
        videoConstraints.aspectRatio = { ideal: 16 / 9 };
    }
    // Note for Mobile Devices:
    // We intentionally avoid forcing aspectRatio or width/height cropping on mobile.
    // Forcing 9:16 or custom ratios causes mobile camera drivers to digitally crop
    // the hardware sensor, producing an unwanted zoomed-in view.
    // By providing facingMode unconstrained, the browser transmits the natural,
    // uncropped camera feed as it is.

    return {
        video: videoConstraints,
        audio: buildAudioConstraints()
    };
}

/**
 * Requests camera and microphone access
 */
export async function setupLocalMedia(localVideoElement, speakerContainer) {
    if (localStream) return localStream;

    localStream = await navigator.mediaDevices.getUserMedia(getMusicConstraints(currentFacingMode));
    localVideoElement.srcObject = localStream;
    localVideoElement.play().catch(e => console.warn("Local video play prevented:", e));

    localVideoElement.onloadedmetadata = () => {
        updateLocalVideoAspectRatio(localVideoElement);
    };
    updateLocalVideoAspectRatio(localVideoElement);

    // Apply proper selfie mirroring for front vs back camera
    if (currentFacingMode === 'environment') {
        localVideoElement.classList.remove('scale-x-[-1]');
    } else {
        localVideoElement.classList.add('scale-x-[-1]');
    }

    // Check support for Audio Output routing
    if (typeof HTMLMediaElement.prototype.setSinkId === 'undefined' && speakerContainer) {
        speakerContainer.style.display = 'none';
    }

    return localStream;
}

/**
 * Stops all active media tracks on localStream and clears the reference
 */
export function stopLocalMedia(localVideoElement) {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (localVideoElement) {
        localVideoElement.srcObject = null;
    }
}

/**
 * Toggles microphone mute state and updates control button UI
 */
export function toggleAudioMute(button, iconOn, iconOff) {
    if (!localStream) return isAudioMuted;

    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioMuted;
    });

    iconOn.classList.toggle('hidden', isAudioMuted);
    iconOff.classList.toggle('hidden', !isAudioMuted);

    if (isAudioMuted) {
        button.classList.replace('bg-gray-800', 'bg-red-600');
        button.classList.replace('hover:bg-gray-700', 'hover:bg-red-700');
    } else {
        button.classList.replace('bg-red-600', 'bg-gray-800');
        button.classList.replace('hover:bg-red-700', 'hover:bg-gray-700');
    }

    return isAudioMuted;
}

/**
 * Toggles camera video stream state and updates control button UI
 */
export function toggleVideoFeed(button, iconOn, iconOff) {
    if (!localStream) return isVideoStopped;

    isVideoStopped = !isVideoStopped;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoStopped;
    });

    iconOn.classList.toggle('hidden', isVideoStopped);
    iconOff.classList.toggle('hidden', !isVideoStopped);

    if (isVideoStopped) {
        button.classList.replace('bg-gray-800', 'bg-red-600');
        button.classList.replace('hover:bg-gray-700', 'hover:bg-red-700');
    } else {
        button.classList.replace('bg-red-600', 'bg-gray-800');
        button.classList.replace('hover:bg-red-700', 'hover:bg-gray-700');
    }

    return isVideoStopped;
}

/**
 * Toggles facing mode between 'user' (front) and 'environment' (back)
 */
export function toggleCameraFacingMode() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    return currentFacingMode;
}

/**
 * Resets local media mute and track states
 */
export function resetMediaState(audioBtn, videoBtn, audioOn, audioOff, videoOn, videoOff) {
    isAudioMuted = false;
    isVideoStopped = false;

    if (audioOn && audioOff && audioBtn) {
        audioOn.classList.remove('hidden');
        audioOff.classList.add('hidden');
        audioBtn.classList.replace('bg-red-600', 'bg-gray-800');
        audioBtn.classList.replace('hover:bg-red-700', 'hover:bg-gray-700');
    }

    if (videoOn && videoOff && videoBtn) {
        videoOn.classList.remove('hidden');
        videoOff.classList.add('hidden');
        videoBtn.classList.replace('bg-red-600', 'bg-gray-800');
        videoBtn.classList.replace('hover:bg-red-700', 'hover:bg-gray-700');
    }
}

/**
 * Enumerates audio and video devices
 */
export async function updateDeviceList(cameraSelect, micSelect, speakerSelect) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

    const devices = await navigator.mediaDevices.enumerateDevices();

    cameraSelect.innerHTML = '<option value="">Default/Auto</option>';
    micSelect.innerHTML = '<option value="">Default/Auto</option>';
    speakerSelect.innerHTML = '<option value="">System Default</option>';

    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `${device.kind} (${device.deviceId.substring(0, 5)}...)`;

        if (device.kind === 'videoinput') {
            cameraSelect.appendChild(option);
        } else if (device.kind === 'audioinput') {
            micSelect.appendChild(option);
        } else if (device.kind === 'audiooutput') {
            speakerSelect.appendChild(option);
        }
    });

    if (localStream) {
        const activeVideoTrack = localStream.getVideoTracks()[0];
        const activeAudioTrack = localStream.getAudioTracks()[0];
        if (activeVideoTrack && activeVideoTrack.getSettings().deviceId) {
            cameraSelect.value = activeVideoTrack.getSettings().deviceId;
        }
        if (activeAudioTrack && activeAudioTrack.getSettings().deviceId) {
            micSelect.value = activeAudioTrack.getSettings().deviceId;
        }
    }
}

/**
 * Hot-swaps camera or microphone device while keeping track of current mute states
 */
export async function handleDeviceSwitch({ cameraSelect, micSelect, localVideo, pc }) {
    if (!localStream) return;

    const selectedCamId = cameraSelect.value;
    const selectedMicId = micSelect.value;

    // Stop old tracks FIRST to release hardware lock
    localStream.getTracks().forEach(track => track.stop());

    const isMobile = isMobileDevice();

    const videoConstraints = selectedCamId
        ? { deviceId: { exact: selectedCamId } }
        : { facingMode: { ideal: currentFacingMode } };

    if (!isMobile) {
        // Desktop / Laptop: standard 16:9 widescreen
        videoConstraints.width = { ideal: 1280 };
        videoConstraints.height = { ideal: 720 };
        videoConstraints.aspectRatio = { ideal: 16 / 9 };
    }

    const audioConstraints = buildAudioConstraints(selectedMicId);

    const newConstraints = { video: videoConstraints, audio: audioConstraints };

    let newStream;
    try {
        newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
    } catch (fallbackError) {
        // If 'exact' facingMode fails (common on desktops), fallback to 'ideal'
        if (!selectedCamId) {
            newConstraints.video.facingMode = { ideal: currentFacingMode };
            newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
        } else {
            throw fallbackError;
        }
    }

    // Apply current mute states to newly acquired hardware
    newStream.getAudioTracks().forEach(t => t.enabled = !isAudioMuted);
    newStream.getVideoTracks().forEach(t => t.enabled = !isVideoStopped);

    // Apply proper selfie mirroring for front vs back camera
    if (localVideo) {
        if (currentFacingMode === 'environment') {
            localVideo.classList.remove('scale-x-[-1]');
        } else {
            localVideo.classList.add('scale-x-[-1]');
        }
    }

    localVideo.srcObject = newStream;
    localVideo.play().catch(e => console.warn("Play prevented:", e));
    localVideo.onloadedmetadata = () => {
        updateLocalVideoAspectRatio(localVideo);
    };
    updateLocalVideoAspectRatio(localVideo);
    localStream = newStream;

    // Hot-swap in active peer connection if class is live
    if (pc) {
        const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');

        if (videoSender && newStream.getVideoTracks()[0]) {
            await videoSender.replaceTrack(newStream.getVideoTracks()[0]);
        }
        if (audioSender && newStream.getAudioTracks()[0]) {
            await audioSender.replaceTrack(newStream.getAudioTracks()[0]);
        }
    }
}

/**
 * Screen Wake Lock Management: Keeps screen awake during class
 */
export async function requestScreenWakeLock(wakeLockBadge) {
    if ('wakeLock' in navigator) {
        // Avoid duplicate redundant requests if wakeLock is already active
        if (wakeLock !== null && !wakeLock.released) return;

        try {
            wakeLock = await navigator.wakeLock.request('screen');
            if (wakeLockBadge) wakeLockBadge.classList.remove('hidden');

            wakeLock.addEventListener('release', () => {
                wakeLock = null;
                if (wakeLockBadge) wakeLockBadge.classList.add('hidden');
            }, { once: true });
        } catch (err) {
            // Silently handle if browser tab unfocused
            console.warn(`Wake Lock request skipped: ${err.message}`);
        }
    }
}

export function releaseScreenWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}

/**
 * Sets up orientation listeners to dynamically adjust constraints and CSS
 * when mobile devices are rotated between portrait and landscape, with debounced resizing.
 */
export function setupOrientationListeners(pc = null) {
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

    // Debounced resize to eliminate lag on window drag or DevTools open/close
    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            handleOrientation();
        }, 120);
    });

    // Run initial tagging
    handleOrientation();
}

