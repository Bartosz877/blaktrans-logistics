import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBnkFqVnlJh8qvLPJHVJi8mOFxMiHPZJmY",
  authDomain: "blaktrans-app.firebaseapp.com",
  projectId: "blaktrans-app",
  storageBucket: "blaktrans-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
};

// Odczytaj konfigurację z firebase.ts
import { readFileSync } from "fs";
const firebaseTsContent = readFileSync("./lib/firebase.ts", "utf8");
const apiKeyMatch = firebaseTsContent.match(/apiKey:\s*["']([^"']+)["']/);
const authDomainMatch = firebaseTsContent.match(/authDomain:\s*["']([^"']+)["']/);
const projectIdMatch = firebaseTsContent.match(/projectId:\s*["']([^"']+)["']/);
const storageBucketMatch = firebaseTsContent.match(/storageBucket:\s*["']([^"']+)["']/);
const messagingSenderIdMatch = firebaseTsContent.match(/messagingSenderId:\s*["']([^"']+)["']/);
const appIdMatch = firebaseTsContent.match(/appId:\s*["']([^"']+)["']/);

const config = {
  apiKey: apiKeyMatch?.[1],
  authDomain: authDomainMatch?.[1],
  projectId: projectIdMatch?.[1],
  storageBucket: storageBucketMatch?.[1],
  messagingSenderId: messagingSenderIdMatch?.[1],
  appId: appIdMatch?.[1],
};

console.log("Firebase config:", JSON.stringify(config, null, 2));

const app = initializeApp(config);
const db = getFirestore(app);

const snap = await getDocs(collection(db, "notifications"));
console.log(`\nZnaleziono ${snap.size} powiadomień:`);
snap.docs.forEach((d, i) => {
  const data = d.data();
  console.log(`${i+1}. [${d.id}] type=${data.type} read=${data.read} title="${data.title}"`);
});

// Usuń wszystkie powiadomienia testowe (read: false)
const toDelete = snap.docs.filter(d => d.data().read === false);
console.log(`\nUsuwam ${toDelete.length} nieprzeczytanych powiadomień...`);
for (const d of toDelete) {
  await deleteDoc(doc(db, "notifications", d.id));
  console.log(`  Usunięto: ${d.id}`);
}
console.log("Gotowe!");
