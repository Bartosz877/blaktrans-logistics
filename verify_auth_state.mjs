/**
 * verify_auth_state.mjs
 * Weryfikuje czy konta ziem@wp.pl i xxx@wp.pl są zablokowane przez brak dokumentu users.
 * Próbuje zalogować się i sprawdza czy getUserData rzuca błąd.
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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

async function checkAccount(email, password) {
  console.log(`\nSprawdzam konto: ${email}`);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    console.log(`  ✓ Firebase Auth: zalogowano (uid: ${uid})`);

    // Sprawdź czy jest dokument users
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data?.suspended === true) {
        console.log(`  🔒 users/${uid}: ZAWIESZONE — logowanie zostanie zablokowane`);
      } else {
        console.log(`  ⚠️  users/${uid}: ISTNIEJE — konto NIE jest zablokowane!`);
        console.log(`     Dane:`, JSON.stringify(data, null, 2));
      }
    } else {
      console.log(`  ✅ users/${uid}: BRAK DOKUMENTU — konto zablokowane (getUserData rzuci ACCOUNT_NOT_FOUND)`);
    }

    await signOut(auth);
  } catch (err) {
    if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
      console.log(`  ✅ Firebase Auth: konto nie istnieje lub hasło nieprawidłowe — zablokowane`);
    } else {
      console.log(`  ❌ Błąd: ${err.message}`);
    }
  }
}

async function main() {
  // Sprawdź konta które były wcześniej dostępne
  await checkAccount("ziem@wp.pl", "haslo123");
  await checkAccount("xxx@wp.pl", "haslo123");
  await checkAccount("xxxx@wp.pl", "haslo123");
  await checkAccount("xx@wp.pl", "haslo123");

  console.log("\nGotowe.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Błąd:", err);
  process.exit(1);
});
