// ==========================================================================
// UI Elements and View State Management
// ==========================================================================

export const elements = {
    // Top-Level Views
    landingView: document.getElementById('landingView'),

    // Media & Video
    localVideo: document.getElementById('localVideo'),
    remoteVideo: document.getElementById('remoteVideo'),
    videoContainer: document.getElementById('videoContainer'),
    remotePlaceholder: document.getElementById('remotePlaceholder'),
    rawAudioBadge: document.getElementById('rawAudioBadge'),
    remoteIndicator: document.getElementById('remoteIndicator'),
    wakeLockBadge: document.getElementById('wakeLockBadge'),

    // Media Controls
    mediaControls: document.getElementById('mediaControls'),
    toggleAudioBtn: document.getElementById('toggleAudioBtn'),
    toggleVideoBtn: document.getElementById('toggleVideoBtn'),
    switchCameraBtn: document.getElementById('switchCameraBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    hangupBtn: document.getElementById('hangupBtn'),
    audioIconOn: document.getElementById('audioIconOn'),
    audioIconOff: document.getElementById('audioIconOff'),
    videoIconOn: document.getElementById('videoIconOn'),
    videoIconOff: document.getElementById('videoIconOff'),

    // Landing & Room Access
    landingPanel: document.getElementById('landingPanel'),
    headerInfo: document.getElementById('headerInfo'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    roomIdInput: document.getElementById('roomIdInput'),

    // Authentication
    googleLoginBtn: document.getElementById('googleLoginBtn'),
    userProfile: document.getElementById('userProfile'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    logoutBtn: document.getElementById('logoutBtn'),

    // Room Info Banner in Call
    inCallRoomInfo: document.getElementById('inCallRoomInfo'),
    inCallRoomIdText: document.getElementById('inCallRoomIdText'),
    copyRoomIdBtn: document.getElementById('copyRoomIdBtn'),

    // Hardware Settings Modal
    deviceSettingsModal: document.getElementById('deviceSettingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    cameraSelect: document.getElementById('cameraSelect'),
    micSelect: document.getElementById('micSelect'),
    speakerSelect: document.getElementById('speakerSelect'),
    speakerSelectContainer: document.getElementById('speakerSelectContainer'),

    // Status Banner
    statusText: document.getElementById('statusText')
};

/**
 * Updates status text and badge styling across all status indicators
 */
export function updateStatus(message, isError = false) {
    const statusEls = document.querySelectorAll('.status-display');
    if (statusEls.length > 0) {
        statusEls.forEach(el => {
            el.textContent = message;
            if (el.id === 'statusText') {
                el.className = `status-display font-mono text-xs sm:text-sm inline-block px-4 py-2 rounded-lg border ${
                    isError 
                        ? 'bg-red-950/80 border-red-700 text-red-300' 
                        : 'bg-gray-950 border-gray-800 text-green-400'
                }`;
            } else {
                el.className = `status-display font-mono text-[11px] leading-relaxed break-words ${
                    isError ? 'text-red-400 font-semibold' : 'text-green-400'
                }`;
            }
        });
    } else if (elements.statusText) {
        elements.statusText.textContent = message;
        elements.statusText.className = `status-display font-mono text-sm inline-block px-4 py-2 rounded border ${
            isError 
                ? 'bg-red-900/50 border-red-700 text-red-200' 
                : 'bg-gray-950 border-gray-800 text-green-400'
        }`;
    }
}

/**
 * Transitions layout to the active In-Call Studio View
 */
export function showCallView(roomId, isCaller = false) {
    if (elements.landingView) {
        elements.landingView.classList.add('hidden');
    } else {
        if (elements.landingPanel) elements.landingPanel.classList.add('hidden');
        if (elements.headerInfo) elements.headerInfo.classList.add('hidden');
    }

    elements.videoContainer.classList.remove('hidden');
    elements.videoContainer.classList.add('flex');
    elements.mediaControls.classList.remove('hidden');

    if (roomId) {
        document.querySelectorAll('.in-call-room-id').forEach(el => {
            el.textContent = roomId;
        });
        if (elements.inCallRoomInfo) {
            elements.inCallRoomInfo.classList.remove('hidden');
            elements.inCallRoomInfo.classList.add('flex');
        }
    } else {
        if (elements.inCallRoomInfo) {
            elements.inCallRoomInfo.classList.add('hidden');
            elements.inCallRoomInfo.classList.remove('flex');
        }
    }
}

/**
 * Transitions layout back to the Landing / Lobby View
 */
export function showLandingView() {
    elements.videoContainer.classList.add('hidden');
    elements.videoContainer.classList.remove('flex');
    elements.mediaControls.classList.add('hidden');
    elements.deviceSettingsModal.classList.add('hidden');

    if (elements.landingView) {
        elements.landingView.classList.remove('hidden');
    } else {
        if (elements.landingPanel) elements.landingPanel.classList.remove('hidden');
        if (elements.headerInfo) elements.headerInfo.classList.remove('hidden');
    }

    if (elements.inCallRoomInfo) {
        elements.inCallRoomInfo.classList.add('hidden');
        elements.inCallRoomInfo.classList.remove('flex');
    }

    // Reset controls
    elements.createRoomBtn.disabled = false;
    elements.createRoomBtn.textContent = "Create Room";
    elements.joinRoomBtn.disabled = false;
    elements.joinRoomBtn.textContent = "Join Class";
    elements.roomIdInput.disabled = false;
    elements.roomIdInput.value = '';

    // Reset video stream previews
    if (elements.localVideo) elements.localVideo.srcObject = null;
    if (elements.remoteVideo) elements.remoteVideo.srcObject = null;
    elements.remotePlaceholder.style.display = 'flex';
    elements.rawAudioBadge.classList.add('hidden');
    elements.remoteIndicator.classList.replace('bg-green-500', 'bg-gray-500');
    elements.remoteIndicator.classList.remove('animate-pulse');
}

/**
 * Copies text to clipboard with fallback for non-secure contexts
 */
export function copyToClipboard(text, onSuccess) {
    if (!text) return;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (onSuccess) onSuccess();
            }).catch(() => {
                fallbackCopy(text, onSuccess);
            });
        } else {
            fallbackCopy(text, onSuccess);
        }
    } catch (err) {
        fallbackCopy(text, onSuccess);
    }
}

function fallbackCopy(text, onSuccess) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand("copy");
        if (onSuccess) onSuccess();
    } catch (e) {
        console.error("Copy command failed:", e);
    }
    textArea.remove();
}

/**
 * Updates UI based on user authentication state
 */
export function updateAuthUI(user) {
    if (!elements.googleLoginBtn || !elements.userProfile) return;

    if (user) {
        // User is signed in
        elements.googleLoginBtn.classList.add('hidden');
        elements.userProfile.classList.remove('hidden');
        elements.userProfile.classList.add('flex');

        if (elements.userAvatar) {
            elements.userAvatar.src = user.photoURL || 'https://www.gravatar.com/avatar/?d=mp';
        }
        if (elements.userName) {
            elements.userName.textContent = user.displayName || user.email || 'User';
            elements.userName.title = user.email || '';
        }
    } else {
        // User is signed out
        elements.userProfile.classList.add('hidden');
        elements.userProfile.classList.remove('flex');
        elements.googleLoginBtn.classList.remove('hidden');
    }
}

