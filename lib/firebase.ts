import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyBnUHwt2qoxUoq_YM_-FthcUAgoAHXnVVw",
  authDomain: "blaktransapp.firebaseapp.com",
  projectId: "blaktransapp",
  storageBucket: "blaktransapp.firebasestorage.app",
  messagingSenderId: "151784365587",
  appId: "1:151784365587:android:1bf8b6880a3b64c70569e6",
};

// Initialize Firebase app (singleton)
const isFirstInit = getApps().length === 0;
const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with React Native AsyncStorage persistence
// metro.config.js ensures Metro uses @firebase/auth/dist/rn/index.js
// which contains getReactNativePersistence and initializeAuth
let auth: ReturnType<typeof getAuth>;
if (isFirstInit) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} else {
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
