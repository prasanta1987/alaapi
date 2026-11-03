// ==========================================================================
// Singing Class WebRTC - Main Application Controller
// ==========================================================================

import {
    db,
    appId,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    arrayUnion,
    auth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "./firebase-config.js";

import {
    localStream,
    setupLocalMedia,
    stopLocalMedia,
    toggleAudioMute,
    toggleVideoFeed,
    toggleCameraFacingMode,
    resetMediaState,
    updateDeviceList,
    handleDeviceSwitch,
    requestScreenWakeLock,
    releaseScreenWakeLock,
    wakeLock,
    getAudioSettings,
    updateAudioDSPSetting,
    setupOrientationListeners,
    updateOrientationClasses
} from "./media.js";

import {
    initPeerConnection,
    processRemoteCandidates,
    closePeerConnection,
    pc
} from "./webrtc.js";

import {
    elements,
    updateStatus,
    showCallView,
    showLandingView,
    copyToClipboard,
    updateAuthUI
} from "./ui.js";

let roomUnsubscribe = null;
let currentRoomId = null;
let currentUser = null;

/**
 * Syncs all Audio DSP toggle checkboxes with current state from media.js
 */
function syncDSPToggleSwitches() {
    const settings = getAudioSettings();
    document.querySelectorAll('.dsp-toggle').forEach(toggle => {
        const key = toggle.getAttribute('data-key');
        if (key && typeof settings[key] !== 'undefined') {
            toggle.checked = Boolean(settings[key]);
        }
    });
}

/**
 * Bootstraps app state and enables landing page controls
 */
function initApp() {
    try {
        updateOrientationClasses();
        setupOrientationListeners(pc);
        syncDSPToggleSwitches();
        updateStatus("System Ready. Create or Join a class.");

        // Enable landing page controls
        elements.createRoomBtn.disabled = false;
        elements.joinRoomBtn.disabled = false;
        elements.roomIdInput.disabled = false;
    } catch (error) {
        console.error("Initialization Error:", error);
        updateStatus(`Failed to initialize: ${error.message}`, true);
    }
}

/**
 * Discards active session, cleans up WebRTC, hardware and deletes room from database
 */
async function discardSession(statusMessage = "Call ended.", shouldDeleteDoc = false) {
    const roomIdToDelete = currentRoomId;
    currentRoomId = null;

    if (roomUnsubscribe) {
        roomUnsubscribe();
        roomUnsubscribe = null;
    }

    if (shouldDeleteDoc && roomIdToDelete) {
        try {
            const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomIdToDelete);
            await deleteDoc(roomRef);
        } catch (e) {
            console.warn("Could not delete room doc from database:", e);
        }
    }

    closePeerConnection();
    stopLocalMedia(elements.localVideo);
    releaseScreenWakeLock();

    resetMediaState(
        elements.toggleAudioBtn,
        elements.toggleVideoBtn,
        elements.audioIconOn,
        elements.audioIconOff,
        elements.videoIconOn,
        elements.videoIconOff
    );

    showLandingView();
    if (statusMessage) {
        updateStatus(statusMessage);
    }
}

/**
 * Helper to setup PeerConnection and attach track/candidate handlers
 */
function setupWebRTCConnection(roomId, isCaller) {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

    initPeerConnection({
        localStream,
        onRemoteStream: (stream) => {
            if (elements.remoteVideo.srcObject !== stream) {
                elements.remoteVideo.srcObject = stream;
                elements.remoteVideo.play().catch(e => console.warn("Remote play prevented:", e));

                elements.remotePlaceholder.style.display = 'none';
                elements.rawAudioBadge.classList.remove('hidden');
                elements.remoteIndicator.classList.replace('bg-gray-500', 'bg-green-500');
                elements.remoteIndicator.classList.add('animate-pulse');
                updateStatus("Connected! Streaming high-fidelity audio.");
            }
        },
        onIceCandidate: async (candidate) => {
            const candidateStr = JSON.stringify(candidate.toJSON());
            const updateField = isCaller
                ? { callerCandidates: arrayUnion(candidateStr) }
                : { calleeCandidates: arrayUnion(candidateStr) };
            await updateDoc(roomRef, updateField).catch(() => {});
        },
        onConnectionStateChange: (state) => {
            if (state === 'failed') {
                discardSession("Connection lost. Session discarded.", true);
            }
        }
    });

    return roomRef;
}

/**
 * 1. Create Room (Student / Host)
 */
elements.createRoomBtn.addEventListener('click', async () => {
    const originalText = elements.createRoomBtn.innerHTML;
    elements.createRoomBtn.innerHTML = '<span class="animate-pulse">Starting...</span>';
    elements.createRoomBtn.disabled = true;
    elements.joinRoomBtn.disabled = true;
    elements.roomIdInput.disabled = true;

    try {
        updateStatus("Requesting camera and microphone access...");
        await setupLocalMedia(elements.localVideo, elements.speakerSelectContainer);
        await updateDeviceList(elements.cameraSelect, elements.micSelect, elements.speakerSelect);
        updateStatus("Camera and microphone ready.");
    } catch (err) {
        console.error("Media Error:", err);
        updateStatus(`Hardware Error: ${err.message}. Please allow permissions.`, true);
        elements.createRoomBtn.innerHTML = originalText;
        elements.createRoomBtn.disabled = false;
        elements.joinRoomBtn.disabled = false;
        elements.roomIdInput.disabled = false;
        return;
    }

    // Keep screen awake
    await requestScreenWakeLock(elements.wakeLockBadge);

    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    currentRoomId = roomId;
    showCallView(roomId, true);
    updateStatus(`Room Created [${roomId}].`);

    const roomRef = setupWebRTCConnection(roomId, true);

    await setDoc(roomRef, {
        offer: null,
        answer: null,
        callerCandidates: [],
        calleeCandidates: [],
        createdAt: new Date().toISOString(),
        host: currentUser ? {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Host',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || ''
        } : null
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await updateDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp } });

    roomUnsubscribe = onSnapshot(roomRef, (snapshot) => {
        // If room document is deleted by either party, discard session immediately
        if (!snapshot.exists()) {
            discardSession("The call has ended. Returning to main screen.", false);
            return;
        }

        const data = snapshot.data();
        if (!data) return;

        if (data.answer && pc && pc.signalingState === 'have-local-offer') {
            const answerDesc = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDesc).catch(err => console.error("Error setting answer:", err));
            updateStatus("Others joined. Establishing peer connection...");
        }
        processRemoteCandidates(data.calleeCandidates);
    });
});

/**
 * 2. Join Room (Teacher / Guest)
 */
elements.joinRoomBtn.addEventListener('click', async () => {
    const roomId = elements.roomIdInput.value.trim().toUpperCase();
    if (!roomId) {
        updateStatus("Please enter a Room ID", true);
        return;
    }

    const originalText = elements.joinRoomBtn.innerHTML;
    elements.joinRoomBtn.innerHTML = '<span class="animate-pulse">Joining...</span>';
    elements.createRoomBtn.disabled = true;
    elements.joinRoomBtn.disabled = true;
    elements.roomIdInput.disabled = true;
    updateStatus(`Verifying room [${roomId}]...`);

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
        updateStatus("Room not found. Check the ID and try again.", true);
        elements.joinRoomBtn.innerHTML = originalText;
        elements.createRoomBtn.disabled = false;
        elements.joinRoomBtn.disabled = false;
        elements.roomIdInput.disabled = false;
        return;
    }

    try {
        updateStatus("Requesting camera and microphone access...");
        await setupLocalMedia(elements.localVideo, elements.speakerSelectContainer);
        await updateDeviceList(elements.cameraSelect, elements.micSelect, elements.speakerSelect);
        updateStatus("Camera and microphone ready.");
    } catch (err) {
        console.error("Media Error:", err);
        updateStatus(`Hardware Error: ${err.message}. Please allow permissions.`, true);
        elements.joinRoomBtn.innerHTML = originalText;
        elements.createRoomBtn.disabled = false;
        elements.joinRoomBtn.disabled = false;
        elements.roomIdInput.disabled = false;
        return;
    }

    // Keep screen awake
    await requestScreenWakeLock(elements.wakeLockBadge);

    currentRoomId = roomId;
    showCallView(roomId, false);
    setupWebRTCConnection(roomId, false);

    const roomData = roomSnap.data();
    const offerDesc = new RTCSessionDescription(roomData.offer);
    await pc.setRemoteDescription(offerDesc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(roomRef, { 
        answer: { type: answer.type, sdp: answer.sdp },
        guest: currentUser ? {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Guest',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || ''
        } : null
    });

    roomUnsubscribe = onSnapshot(roomRef, (snapshot) => {
        // If room document is deleted by either party, discard session immediately
        if (!snapshot.exists()) {
            discardSession("The call has ended. Returning to main screen.", false);
            return;
        }

        const data = snapshot.data();
        if (!data) return;
        processRemoteCandidates(data.callerCandidates);
    });
});

/**
 * 3. End / Hangup Call - Discard session & delete database entry from room id
 */
elements.hangupBtn.addEventListener('click', async () => {
    await discardSession("Call ended successfully. Ready for a new session.", true);
});

// Automatic cleanup when closing or reloading tab
window.addEventListener('beforeunload', () => {
    if (currentRoomId) {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId);
        deleteDoc(roomRef).catch(() => {});
    }
});

/**
 * Media Controls Event Listeners
 */
elements.toggleAudioBtn.addEventListener('click', () => {
    toggleAudioMute(elements.toggleAudioBtn, elements.audioIconOn, elements.audioIconOff);
});

elements.toggleVideoBtn.addEventListener('click', () => {
    toggleVideoFeed(elements.toggleVideoBtn, elements.videoIconOn, elements.videoIconOff);
});

elements.switchCameraBtn.addEventListener('click', async () => {
    toggleCameraFacingMode();
    elements.cameraSelect.value = ""; // Clear explicit selection to use facingMode
    await handleDeviceSwitch({
        cameraSelect: elements.cameraSelect,
        micSelect: elements.micSelect,
        localVideo: elements.localVideo,
        pc
    });
});

// Copy Room ID Buttons (Side panel & Mobile overlay)
document.querySelectorAll('.copy-room-id-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const idEl = document.querySelector('.in-call-room-id');
        const text = idEl ? idEl.textContent.trim() : (elements.inCallRoomIdText ? elements.inCallRoomIdText.textContent.trim() : '');
        copyToClipboard(text, () => {
            updateStatus("Room ID copied to clipboard!");
        });
    });
});
if (elements.copyRoomIdBtn) {
    elements.copyRoomIdBtn.addEventListener('click', () => {
        const text = elements.inCallRoomIdText ? elements.inCallRoomIdText.textContent.trim() : '';
        copyToClipboard(text, () => {
            updateStatus("Room ID copied to clipboard!");
        });
    });
}

// Hardware Settings Modal
elements.settingsBtn.addEventListener('click', () => {
    elements.deviceSettingsModal.classList.remove('hidden');
});

elements.closeSettingsBtn.addEventListener('click', () => {
    elements.deviceSettingsModal.classList.add('hidden');
});

elements.deviceSettingsModal.addEventListener('click', (e) => {
    if (e.target === elements.deviceSettingsModal) {
        elements.deviceSettingsModal.classList.add('hidden');
    }
});

// Device Switch Change Listeners
elements.cameraSelect.addEventListener('change', () => {
    handleDeviceSwitch({
        cameraSelect: elements.cameraSelect,
        micSelect: elements.micSelect,
        localVideo: elements.localVideo,
        pc
    });
});

elements.micSelect.addEventListener('change', () => {
    handleDeviceSwitch({
        cameraSelect: elements.cameraSelect,
        micSelect: elements.micSelect,
        localVideo: elements.localVideo,
        pc
    });
});

elements.speakerSelect.addEventListener('change', async () => {
    if (typeof elements.remoteVideo.setSinkId !== 'undefined') {
        try {
            await elements.remoteVideo.setSinkId(elements.speakerSelect.value);
        } catch (error) {
            console.error("Error routing audio output:", error);
        }
    }
});

if (navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
        updateDeviceList(elements.cameraSelect, elements.micSelect, elements.speakerSelect);
    });
}

// Screen Wake Lock Visibility Change Listener
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestScreenWakeLock(elements.wakeLockBadge);
    } else if (document.visibilityState === 'visible' && pc) {
        await requestScreenWakeLock(elements.wakeLockBadge);
    }
});

// Audio DSP Toggle Event Listeners (Echo Cancellation, Noise Suppression, Auto Gain Control)
const friendlyNames = {
    echoCancellation: 'Echo Cancellation',
    noiseSuppression: 'Noise Suppression',
    autoGainControl: 'Auto Gain Control'
};

function setDSPControlsDisabled(disabled) {
    document.querySelectorAll('.dsp-toggle').forEach(toggle => {
        toggle.disabled = disabled;
        const switchLabel = toggle.closest('.switch');
        if (switchLabel) {
            if (disabled) {
                switchLabel.classList.add('is-busy');
            } else {
                switchLabel.classList.remove('is-busy');
            }
        }
    });
}

document.querySelectorAll('.dsp-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
        const key = e.target.getAttribute('data-key');
        const targetChecked = e.target.checked;
        if (!key) return;

        const label = friendlyNames[key] || key;
        updateStatus(`Applying ${label} (${targetChecked ? 'ON' : 'OFF'})...`);
        setDSPControlsDisabled(true);

        try {
            const hardwareSettings = await updateAudioDSPSetting(key, targetChecked, pc);

            // Re-synchronize all checkboxes across UI to single source of truth
            syncDSPToggleSwitches();

            if (hardwareSettings) {
                const isActuallyActive = Boolean(hardwareSettings[key]);
                updateStatus(`${label} live: ${isActuallyActive ? 'ACTIVE' : 'OFF'}`);
            } else {
                updateStatus(`${label} saved for next session: ${targetChecked ? 'ON' : 'OFF'}`);
            }
        } catch (err) {
            console.error(`Error applying DSP setting for ${key}:`, err);
            updateStatus(`Failed to apply ${label}: ${err.message}`, true);
            syncDSPToggleSwitches();
        } finally {
            setDSPControlsDisabled(false);
        }
    });
});

// ==========================================================================
// Google Authentication Management
// ==========================================================================
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateAuthUI(user);

    if (user) {
        // Record / update user in Firestore for future management
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
        setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName || 'Anonymous',
            email: user.email || '',
            photoURL: user.photoURL || '',
            lastSeen: new Date().toISOString()
        }, { merge: true }).catch(err => console.warn("User sync skipped:", err));
    }
});

if (elements.googleLoginBtn) {
    elements.googleLoginBtn.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            updateStatus("Connecting with Google...");
            await signInWithPopup(auth, provider);
            updateStatus("Signed in with Google successfully!");
        } catch (err) {
            console.error("Google Auth Error:", err);
            // Handle popup closed by user gracefully
            if (err.code === 'auth/popup-closed-by-user') {
                updateStatus("Sign-in cancelled.");
            } else {
                updateStatus(`Sign-in failed: ${err.message}`, true);
            }
        }
    });
}

if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            updateStatus("Signed out successfully.");
        } catch (err) {
            console.error("Sign-out error:", err);
            updateStatus(`Sign-out failed: ${err.message}`, true);
        }
    });
}

// Bootstrap application on load
initApp();

