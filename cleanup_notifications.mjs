import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { readFileSync } from "fs";

const ts = readFileSync("./lib/firebase.ts", "utf8");
const get = (re) => ts.match(re)?.[1];
const app = initializeApp({
  apiKey: get(/apiKey:\s*["']([^"']+)["']/),
  authDomain: get(/authDomain:\s*["']([^"']+)["']/),
  projectId: get(/projectId:\s*["']([^"']+)["']/),
  storageBucket: get(/storageBucket:\s*["']([^"']+)["']/),
  messagingSenderId: get(/messagingSenderId:\s*["']([^"']+)["']/),
  appId: get(/appId:\s*["']([^"']+)["']/),
});
const db = getFirestore(app);

const snap = await getDocs(collection(db, "notifications"));
console.log(`Znaleziono ${snap.size} powiadomień. Usuwam wszystkie stare...`);
for (const d of snap.docs) {
  await deleteDoc(doc(db, "notifications", d.id));
  console.log(`  Usunięto: ${d.id} - ${d.data().title}`);
}
console.log("Gotowe! Kolekcja notifications jest teraz pusta.");
