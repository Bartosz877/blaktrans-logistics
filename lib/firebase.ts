import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBnUHwt2qoxUoq_YM_-FthcUAgoAHXnVVw",
  authDomain: "blaktransapp.firebaseapp.com",
  projectId: "blaktransapp",
  storageBucket: "blaktransapp.firebasestorage.app",
  messagingSenderId: "151784365587",
  appId: "1:151784365587:android:1bf8b6880a3b64c70569e6",
};

// Initialize primary Firebase app (singleton pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/**
 * Secondary Firebase app — used ONLY for creating new user accounts by admin.
 * Using a separate app instance prevents createUserWithEmailAndPassword from
 * switching the current admin session (onAuthStateChanged would otherwise fire
 * and redirect the admin to the driver panel).
 */
const SECONDARY_APP_NAME = "blaktrans-secondary";
const secondaryApp =
  getApps().find((a) => a.name === SECONDARY_APP_NAME) ??
  initializeApp(firebaseConfig, SECONDARY_APP_NAME);
const secondaryAuth = getAuth(secondaryApp);

export { app, auth, db, storage, secondaryAuth };
