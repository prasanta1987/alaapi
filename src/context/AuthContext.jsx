import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  auth,
  db,
  appId,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteField,
  onSnapshot,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
} from '../services/firebase';

const AuthContext = createContext(null);

export function isUserOnline(user) {
  if (!user) return false;
  if (!user.isOnline) return false;
  const now = Date.now();
  if (user.lastHeartbeat) {
    // 75 seconds threshold allows 60s background tab throttling + 15s latency
    return (now - user.lastHeartbeat) < 75000;
  }
  if (user.lastSeen) {
    return (now - new Date(user.lastSeen).getTime()) < 90000;
  }
  return false;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = null;
    let heartbeatTimer = null;
    let currentAuthUid = null;

    const sendHeartbeat = async (uid) => {
      if (!uid) return;
      try {
        const uRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', uid);
        await updateDoc(uRef, {
          isOnline: true,
          lastHeartbeat: Date.now(),
          lastSeen: new Date().toISOString()
        });
      } catch (e) {
        // Silent catch for background or unmounted updates
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && currentAuthUid) {
        sendHeartbeat(currentAuthUid);
      }
    };

    const handleBeforeUnload = () => {
      if (currentAuthUid) {
        const uRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentAuthUid);
        updateDoc(uRef, {
          isOnline: false,
          lastSeen: new Date().toISOString()
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      currentAuthUid = user ? user.uid : null;

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (user) {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
        
        // Sync latest profile details from Firebase Auth user object into Firestore
        const now = Date.now();
        const authSyncData = {
          uid: user.uid,
          displayName: user.displayName || 'Vocalist',
          email: user.email || '',
          photoURL: user.photoURL || '',
          isOnline: true,
          lastHeartbeat: now,
          lastSeen: new Date(now).toISOString()
        };

        try {
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const existing = snap.data();
            const updates = { ...authSyncData };
            if (user.email === 'prasanta.ani@gmail.com' && existing.role !== 'admin') {
              updates.role = 'admin';
            }
            await setDoc(userRef, updates, { merge: true });
          } else {
            const isInitialAdmin = user.email === 'prasanta.ani@gmail.com';
            await setDoc(userRef, {
              ...authSyncData,
              role: isInitialAdmin ? 'admin' : 'student',
              phone: '',
              bio: '',
              instrument: 'Vocals',
              createdAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.warn("Error syncing user data to Firestore:", e);
        }

        // Heartbeat every 25 seconds for reliable real-time presence
        heartbeatTimer = setInterval(() => {
          sendHeartbeat(user.uid);
        }, 25000);

        // Listen to user profile document changes in real time
        unsubscribeProfile = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserProfile(snapshot.data());
          }
          setLoading(false);
        }, (err) => {
          console.warn("User profile listener error:", err);
          setLoading(false);
        });

      } else {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    if (currentUser) {
      try {
        const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUser.uid);
        await updateDoc(userRef, {
          isOnline: false,
          lastSeen: new Date().toISOString()
        });
      } catch (e) {}
    }
    return await signOut(auth);
  };

  const updateUserProfile = async (updates) => {
    if (!currentUser) return;

    if (updates.displayName && updates.displayName !== currentUser.displayName) {
      try {
        await updateProfile(currentUser, { displayName: updates.displayName });
      } catch (e) {
        console.warn("Failed to update Firebase Auth displayName:", e);
      }
    }

    const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUser.uid);
    await setDoc(userRef, {
      ...updates,
      lastSeen: new Date().toISOString()
    }, { merge: true });
  };

  const isAdmin = userProfile?.role === 'admin' || currentUser?.email === 'prasanta.ani@gmail.com';

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      isAdmin,
      loading,
      loginWithGoogle,
      logout,
      updateUserProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

