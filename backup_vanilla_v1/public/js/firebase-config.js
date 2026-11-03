// ==========================================================================
// Firebase Configuration & Initialization
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    deleteDoc,
    onSnapshot, 
    arrayUnion 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

/**
 * Global App Identifier
 */
export const appId = typeof __app_id !== 'undefined' ? __app_id : 'music-class-app';

/**
 * Firebase Project Configuration
 * You can replace this with your project credentials from Firebase Console:
 * Project Settings -> General -> Your apps -> Web app configuration.
 */
export const firebaseConfig = typeof __firebase_config !== 'undefined'
    ? JSON.parse(__firebase_config)
    : {
        // projectId: "alaapi",

        // apiKey: "YOUR_API_KEY",
        // authDomain: "alaapi.firebaseapp.com",
        // storageBucket: "alaapi.appspot.com",
        // messagingSenderId: "YOUR_SENDER_ID",
        // appId: "YOUR_APP_ID"

        apiKey: "AIzaSyAuVwdMgxbzY-dyPB__zzCnaBiriWG9CdA",
        authDomain: "alaapi.firebaseapp.com",
        projectId: "alaapi",
        storageBucket: "alaapi.firebasestorage.app",
        messagingSenderId: "837301073202",
        appId: "1:837301073202:web:c80424dde05e8e6af3532b"
    };

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firestore Database (Used for WebRTC Signaling)
export const db = getFirestore(app);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Export Firestore utilities
export {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    arrayUnion
};

// Export Auth utilities
export {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
};

