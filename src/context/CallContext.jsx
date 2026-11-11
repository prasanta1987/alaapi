import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  db,
  appId,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot
} from '../services/firebase';
import { useAuth } from './AuthContext';
import { playRingtone, stopRingtone } from '../services/ringtone';

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { currentUser, userProfile } = useAuth();
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [callNotice, setCallNotice] = useState(null);
  const navigate = useNavigate();

  // Listen for real-time incoming calls for current logged-in user
  useEffect(() => {
    if (!currentUser) {
      setIncomingCall(null);
      stopRingtone();
      return;
    }

    const callsRef = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
    const q = query(
      callsRef,
      where('calleeId', '==', currentUser.uid),
      where('status', '==', 'ringing')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const callDoc = snapshot.docs[0];
        const data = callDoc.data();
        setIncomingCall({ id: callDoc.id, ...data });
        playRingtone();
      } else {
        setIncomingCall(null);
        stopRingtone();
      }
    }, (err) => {
      console.warn("Incoming call listener error:", err);
    });

    return () => {
      unsubscribe();
      stopRingtone();
    };
  }, [currentUser]);

  // Accept incoming call
  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    stopRingtone();
    const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', incomingCall.id);
    const targetRoomId = incomingCall.roomId;
    const callType = incomingCall.callType || 'video';

    try {
      await updateDoc(callRef, { status: 'accepted' });
    } catch (e) {
      console.warn("Error accepting call:", e);
    }

    setIncomingCall(null);
    navigate(`/room/${targetRoomId}?callType=${callType}&calleeName=${encodeURIComponent(incomingCall.callerName || 'Teacher')}`);
  };

  // Decline incoming call
  const declineIncomingCall = async () => {
    if (!incomingCall) return;
    stopRingtone();
    const callRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', incomingCall.id);

    try {
      await updateDoc(callRef, { status: 'declined' });
    } catch (e) {
      console.warn("Error declining call:", e);
    }

    setIncomingCall(null);
  };

  // Initiate direct call from Teacher/Admin to Student/Teacher (video or audio)
  const initiateDirectCall = async (student, callType = 'video') => {
    if (!currentUser) return;

    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const callsRef = collection(db, 'artifacts', appId, 'public', 'data', 'calls');
    const callDocRef = doc(callsRef);

    const callPayload = {
      callerId: currentUser.uid,
      callerName: userProfile?.displayName || currentUser.displayName || 'Teacher',
      callerPhoto: currentUser.photoURL || '',
      calleeId: student.id || student.uid,
      calleeName: student.displayName || 'Student',
      roomId,
      callType, // 'video' | 'audio'
      status: 'ringing',
      createdAt: new Date().toISOString()
    };

    await setDoc(callDocRef, callPayload);

    // Pre-create room document so callee can immediately connect upon accepting
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      await setDoc(roomRef, {
        offer: null,
        answer: null,
        callerCandidates: [],
        calleeCandidates: [],
        createdAt: new Date().toISOString(),
        status: 'ringing',
        callType,
        host: {
          uid: currentUser.uid,
          displayName: userProfile?.displayName || currentUser.displayName || 'Teacher'
        }
      });
    } catch (e) {
      console.warn("Could not pre-initialize room document:", e);
    }

    // Host navigates straight to Call Studio as Caller, establishing room and offer
    navigate(`/room/${roomId}?isCaller=true&callId=${callDocRef.id}&callType=${callType}&calleeName=${encodeURIComponent(student.displayName || 'Student')}`);
  };

  // Cancel outgoing call
  const cancelOutgoingCall = async () => {
    if (!outgoingCall) return;
    const callDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', outgoingCall.id);
    setOutgoingCall(null);
    try {
      await deleteDoc(callDocRef);
    } catch (e) {
      console.warn("Error cancelling call:", e);
    }
  };

  return (
    <CallContext.Provider value={{
      incomingCall,
      outgoingCall,
      callNotice,
      setCallNotice,
      acceptIncomingCall,
      declineIncomingCall,
      initiateDirectCall,
      cancelOutgoingCall
    }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}

