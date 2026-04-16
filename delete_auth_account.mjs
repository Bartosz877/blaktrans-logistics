/**
 * delete_auth_account.mjs
 *
 * Usuwa konto Firebase Auth przez zalogowanie na nie i wywołanie deleteUser(currentUser).
 * To jedyna metoda kliencka która na pewno działa — użytkownik może usunąć własne konto.
 *
 * Używamy secondaryAuth żeby nie wylogować admina.
 */
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  deleteUser,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBnUHwt2qoxUoq_YM_-FthcUAgoAHXnVVw",
  authDomain: "blaktransapp.firebaseapp.com",
  projectId: "blaktransapp",
  storageBucket: "blaktransapp.firebasestorage.app",
  messagingSenderId: "151784365587",
  appId: "1:151784365587:android:1bf8b6880a3b64c70569e6",
};

// Osobna instancja żeby nie kolidować
const secondaryApp = initializeApp(firebaseConfig, "delete-tool");
const secondaryAuth = getAuth(secondaryApp);

async function deleteAuthAccount(email, password) {
  console.log(`\nPróbuję usunąć konto: ${email}`);
  try {
    // Zaloguj na to konto
    const cred = await signInWithEmailAndPassword(secondaryAuth, email, password);
    console.log(`  ✓ Zalogowano (uid: ${cred.user.uid})`);

    // Usuń konto (użytkownik może usunąć własne konto)
    await deleteUser(cred.user);
    console.log(`  ✅ Konto usunięte z Firebase Auth!`);
    return true;
  } catch (err) {
    if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
      console.log(`  ✅ Konto nie istnieje w Firebase Auth (już usunięte lub nigdy nie istniało)`);
      return true;
    } else if (err.code === "auth/wrong-password") {
      console.log(`  ❌ Złe hasło — nie można usunąć`);
      return false;
    } else {
      console.log(`  ❌ Błąd: ${err.code} - ${err.message}`);
      return false;
    }
  }
}

async function main() {
  // Usuń konto ziem@wp.pl z podanym hasłem
  // Hasło podane przez użytkownika: 123456
  const result = await deleteAuthAccount("ziem@wp.pl", "123456");

  if (result) {
    console.log("\n✅ Operacja zakończona — email ziem@wp.pl jest teraz wolny.");
  } else {
    console.log("\n⚠️  Nie udało się usunąć konta automatycznie.");
    console.log("   Możliwe że hasło jest inne niż 123456.");
    console.log("   Podaj prawidłowe hasło do konta ziem@wp.pl.");
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Błąd:", err);
  process.exit(1);
});
