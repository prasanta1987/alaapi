// ==========================================================================
// WebRTC Peer Connection, ICE & Ultra-Low-Latency Data Synchronization
// ==========================================================================

export const rtcServers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
  ]
};

export let pc = null;
export let dataChannel = null;
export let processedCandidates = new Set();
let peerClockOffset = 0; // Difference between remote and local system clocks in ms
let syncMessageCallback = null;

export function getPeerClockOffset() {
  return peerClockOffset;
}

export function setPeerClockOffset(offset) {
  peerClockOffset = offset;
}

export function sendSyncMessage(msgObj) {
  if (dataChannel && dataChannel.readyState === 'open') {
    try {
      dataChannel.send(JSON.stringify(msgObj));
      return true;
    } catch (e) {
      console.warn("Could not send message over data channel:", e);
    }
  }
  return false;
}

export function onSyncMessage(callback) {
  syncMessageCallback = callback;
}

// Runs a 3-way handshake to measure RTT and calibrate clock skew down to ~1ms
function runClockCalibration() {
  if (!dataChannel || dataChannel.readyState !== 'open') return;

  const t0 = Date.now();
  try {
    dataChannel.send(JSON.stringify({ type: 'NTP_PING', t0 }));
  } catch (e) {
    console.warn("Could not send clock calibration ping:", e);
  }
}

function handleDataChannelMessage(msg) {
  if (!msg || !msg.type) return;

  if (msg.type === 'NTP_PING') {
    if (dataChannel && dataChannel.readyState === 'open') {
      try {
        dataChannel.send(JSON.stringify({ type: 'NTP_PONG', t0: msg.t0, t1: Date.now() }));
      } catch (e) {}
    }
    return;
  }

  if (msg.type === 'NTP_PONG') {
    const t2 = Date.now();
    const rtt = Math.max(1, t2 - msg.t0);
    const latency = rtt / 2;
    // Offset = remoteClock - localClock
    const offset = msg.t1 - (msg.t0 + latency);
    peerClockOffset = offset;
    console.log(`[WebRTC Clock Sync] Offset: ${offset.toFixed(1)}ms | RTT: ${rtt}ms`);

    // Acknowledge offset to remote peer so both devices are in mutual agreement
    if (dataChannel && dataChannel.readyState === 'open') {
      try {
        dataChannel.send(JSON.stringify({ type: 'NTP_OFFSET_ACK', offset: -offset }));
      } catch (e) {}
    }
    return;
  }

  if (msg.type === 'NTP_OFFSET_ACK') {
    peerClockOffset = msg.offset;
    console.log(`[WebRTC Clock Sync] Mutual offset ACK applied: ${peerClockOffset.toFixed(1)}ms`);
    return;
  }

  // Forward application sync messages (e.g. metronome events)
  if (syncMessageCallback) {
    syncMessageCallback(msg);
  }
}

function setupDataChannel(channel, isCaller) {
  dataChannel = channel;

  channel.onopen = () => {
    console.log("[WebRTC] Sync DataChannel open and ready for zero-latency commands.");
    if (isCaller) {
      // Small pause to let transport stabilize, then calibrate clocks
      setTimeout(runClockCalibration, 80);
      setTimeout(runClockCalibration, 500);
    }
  };

  channel.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleDataChannelMessage(msg);
    } catch (e) {
      console.warn("Failed to parse DataChannel message:", e);
    }
  };

  channel.onclose = () => {
    console.log("[WebRTC] Sync DataChannel closed.");
    dataChannel = null;
  };

  channel.onerror = (err) => {
    console.warn("[WebRTC] Sync DataChannel error:", err);
  };
}

export function initPeerConnection({
  localStream,
  isCaller = false,
  onRemoteStream,
  onIceCandidate,
  onConnectionStateChange,
  onSyncMessageCallback
}) {
  pc = new RTCPeerConnection(rtcServers);
  processedCandidates.clear();
  peerClockOffset = 0;

  if (onSyncMessageCallback) {
    syncMessageCallback = onSyncMessageCallback;
  }

  // 1. Audio transceiver setup
  const hasAudio = localStream && localStream.getAudioTracks().length > 0;
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

  // 2. Video transceiver setup
  const hasVideo = localStream && localStream.getVideoTracks().length > 0;
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

  // 3. WebRTC DataChannel setup for instantaneous cross-device metronome sync
  if (isCaller) {
    try {
      const ch = pc.createDataChannel('alaapi-sync', { ordered: true });
      setupDataChannel(ch, true);
    } catch (e) {
      console.warn("Could not create WebRTC data channel:", e);
    }
  } else {
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel, false);
    };
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
  if (dataChannel) {
    try {
      dataChannel.close();
    } catch (e) {}
    dataChannel = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  processedCandidates.clear();
  peerClockOffset = 0;
  syncMessageCallback = null;
}
