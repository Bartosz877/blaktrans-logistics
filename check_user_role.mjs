import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBnUHwt2qoxUoq_YM_-FthcUAgoAHXnVVw",
  authDomain: "blaktransapp.firebaseapp.com",
  projectId: "blaktransapp",
  storageBucket: "blaktransapp.firebasestorage.app",
  messagingSenderId: "151784365587",
  appId: "1:151784365587:android:1bf8b6880a3b64c70569e6",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

try {
  const cred = await signInWithEmailAndPassword(auth, "ftbkuchta@gmail.com", "123456");
  const uid = cred.user.uid;
  console.log("UID:", uid);
  
  const userDoc = await getDoc(doc(db, "users", uid));
  if (userDoc.exists()) {
    console.log("Dane użytkownika:", JSON.stringify(userDoc.data(), null, 2));
  } else {
    console.log("Brak dokumentu w Firestore dla tego UID");
  }
  
  process.exit(0);
} catch (e) {
  console.error("Błąd:", e.message);
  process.exit(1);
}
