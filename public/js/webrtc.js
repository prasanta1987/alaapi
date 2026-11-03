// ==========================================================================
// WebRTC Peer Connection & ICE Handling
// ==========================================================================

export const rtcServers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

export let pc = null;
export let processedCandidates = new Set();

/**
 * Creates and initializes an RTCPeerConnection
 */
export function initPeerConnection({ localStream, onRemoteStream, onIceCandidate, onConnectionStateChange }) {
    pc = new RTCPeerConnection(rtcServers);
    processedCandidates.clear();

    // Attach local tracks to the connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle remote media streams
    pc.ontrack = event => {
        if (event.streams && event.streams[0] && onRemoteStream) {
            onRemoteStream(event.streams[0]);
        }
    };

    // Forward local ICE candidates to signaling handler
    pc.onicecandidate = event => {
        if (event.candidate && onIceCandidate) {
            onIceCandidate(event.candidate);
        }
    };

    // Monitor peer connection state transitions
    pc.onconnectionstatechange = () => {
        if (onConnectionStateChange && pc) {
            onConnectionStateChange(pc.connectionState);
        }
    };

    return pc;
}

/**
 * Iterates through candidate list from Firestore and adds new ones to pc
 */
export function processRemoteCandidates(candidateList) {
    if (!pc || !candidateList) return;

    candidateList.forEach(candStr => {
        if (!processedCandidates.has(candStr)) {
            processedCandidates.add(candStr);
            try {
                const candidate = new RTCIceCandidate(JSON.parse(candStr));
                pc.addIceCandidate(candidate).catch(e => console.error("Error adding ICE candidate:", e));
            } catch (err) {
                console.error("Failed to parse ICE candidate string:", err);
            }
        }
    });
}

/**
 * Closes the active peer connection and resets state
 */
export function closePeerConnection() {
    if (pc) {
        pc.close();
        pc = null;
    }
    processedCandidates.clear();
}

