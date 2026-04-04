import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc, query, where } from "firebase/firestore";
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
  await signInWithEmailAndPassword(auth, "ftbkuchta@gmail.com", "123456");
  
  const snap = await getDocs(query(collection(db, "employees"), where("email", "==", "test.pracownik@blaktrans.pl")));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "employees", d.id));
    console.log("Usunięto testowego pracownika:", d.id);
  }
  
  if (snap.empty) {
    console.log("Brak testowego pracownika do usunięcia");
  }
  
  process.exit(0);
} catch (e) {
  console.error("Błąd:", e.message);
  process.exit(1);
}
