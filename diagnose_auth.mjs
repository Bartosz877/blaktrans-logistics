/**
 * diagnose_auth.mjs
 * Sprawdza czy konto ziem@wp.pl nadal istnieje w Firebase Auth
 * przez próbę resetowania hasła (nie wymaga znajomości hasła).
 */
import { initializeApp } from "firebase/app";
import { getAuth, fetchSignInMethodsForEmail } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

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

async function checkEmailInAuth(email) {
  try {
    // fetchSignInMethodsForEmail zwraca tablicę metod logowania jeśli konto istnieje
    // lub pustą tablicę jeśli konto nie istnieje
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods && methods.length > 0) {
      console.log(`  🔴 Firebase Auth: KONTO ISTNIEJE (metody: ${methods.join(", ")})`);
      return true;
    } else {
      console.log(`  ✅ Firebase Auth: konto nie istnieje`);
      return false;
    }
  } catch (err) {
    console.log(`  ❓ Firebase Auth: błąd sprawdzania: ${err.code} - ${err.message}`);
    return null;
  }
}

async function checkEmailInFirestore(email) {
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      console.log(`  🔴 Firestore users: DOKUMENT ISTNIEJE (${snap.size} rekordów)`);
      snap.forEach(d => console.log(`     ID: ${d.id}, dane:`, JSON.stringify(d.data())));
      return true;
    } else {
      console.log(`  ✅ Firestore users: brak dokumentu`);
      return false;
    }
  } catch (err) {
    console.log(`  ❓ Firestore users: błąd: ${err.message}`);
    return null;
  }
}

async function checkEmailInEmployees(email) {
  try {
    const q = query(collection(db, "employees"), where("email", "==", email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      console.log(`  🟡 Firestore employees: REKORD ISTNIEJE (${snap.size} rekordów)`);
      snap.forEach(d => console.log(`     ID: ${d.id}, uid: ${d.data().uid || "brak"}`));
      return true;
    } else {
      console.log(`  ✅ Firestore employees: brak rekordu`);
      return false;
    }
  } catch (err) {
    console.log(`  ❓ Firestore employees: błąd: ${err.message}`);
    return null;
  }
}

async function main() {
  const emailsToCheck = ["ziem@wp.pl", "xxx@wp.pl", "xxxx@wp.pl"];

  for (const email of emailsToCheck) {
    console.log(`\n=== Sprawdzam: ${email} ===`);
    const inAuth = await checkEmailInAuth(email);
    const inUsers = await checkEmailInFirestore(email);
    const inEmployees = await checkEmailInEmployees(email);

    if (inAuth) {
      console.log(`  ⚠️  PROBLEM: konto nadal istnieje w Firebase Auth — email NIE jest dostępny do ponownego użycia`);
    } else if (inAuth === false) {
      console.log(`  ✓ Email dostępny do ponownego użycia`);
    }
  }

  console.log("\nDiagnoza zakończona.");
  process.exit(0);
}

main().catch(err => {
  console.error("Błąd:", err);
  process.exit(1);
});
