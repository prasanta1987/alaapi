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

export function initPeerConnection({ localStream, onRemoteStream, onIceCandidate, onConnectionStateChange }) {
  pc = new RTCPeerConnection(rtcServers);
  processedCandidates.clear();

  const hasAudio = localStream && localStream.getAudioTracks().length > 0;
  const hasVideo = localStream && localStream.getVideoTracks().length > 0;

  // Ensure audio transceiver exists (sendrecv if local mic exists, recvonly if missing)
  if (hasAudio) {
    localStream.getAudioTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  } else {
    try {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    } catch (e) {
      console.warn("Could not add audio recvonly transceiver:", e);
    }
  }

  // Ensure video transceiver exists (sendrecv if local camera exists, recvonly if missing)
  if (hasVideo) {
    localStream.getVideoTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  } else {
    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
    } catch (e) {
      console.warn("Could not add video recvonly transceiver:", e);
    }
  }

  pc.ontrack = event => {
    if (onRemoteStream) {
      if (event.streams && event.streams[0]) {
        onRemoteStream(event.streams[0]);
      } else if (event.track) {
        const inboundStream = new MediaStream([event.track]);
        onRemoteStream(inboundStream);
      }
    }
  };

  pc.onicecandidate = event => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    if (onConnectionStateChange && pc) {
      onConnectionStateChange(pc.connectionState);
    }
  };

  return pc;
}

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

export function closePeerConnection() {
  if (pc) {
    pc.close();
    pc = null;
  }
  processedCandidates.clear();
}

