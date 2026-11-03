// ==========================================================================
// Firebase Configuration & Initialization
// ==========================================================================

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";

export const appId = 'music-class-app';

export const firebaseConfig = {
  apiKey: "AIzaSyAuVwdMgxbzY-dyPB__zzCnaBiriWG9CdA",
  authDomain: "alaapi.firebaseapp.com",
  projectId: "alaapi",
  storageBucket: "alaapi.firebasestorage.app",
  messagingSenderId: "837301073202",
  appId: "1:837301073202:web:c80424dde05e8e6af3532b"
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp,
  deleteField,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile
};

