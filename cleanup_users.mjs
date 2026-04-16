/**
 * cleanup_users.mjs
 * Usuwa z Firestore (users + employees) wszystkich użytkowników
 * którzy NIE są administratorami i NIE należą do działu Kadry.
 *
 * Uruchom: node cleanup_users.mjs <adminEmail> <adminPassword>
 */
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, deleteDoc, doc, query, where } from "firebase/firestore";

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

const [,, adminEmail, adminPassword] = process.argv;
if (!adminEmail || !adminPassword) {
  console.error("Użycie: node cleanup_users.mjs <adminEmail> <adminPassword>");
  process.exit(1);
}

// Role uznawane za administratorskie
const ADMIN_ROLES = ["admin", "administrator", "ADMIN"];

async function main() {
  console.log("Logowanie jako admin...");
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
  console.log("Zalogowano.");

  // Pobierz wszystkich użytkowników z kolekcji users
  const usersSnap = await getDocs(collection(db, "users"));
  const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Znaleziono ${allUsers.length} użytkowników w kolekcji users.`);

  // Pobierz wszystkich pracowników z kolekcji employees
  const empSnap = await getDocs(collection(db, "employees"));
  const allEmployees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Znaleziono ${allEmployees.length} pracowników w kolekcji employees.`);

  // Zbuduj zbiór emaili pracowników z działu Kadry
  // "Kadry" = workType zawiera "Kadry" lub "kadry" lub "HR"
  const kadryEmails = new Set(
    allEmployees
      .filter((e) => {
        const wt = (e.workType || "").toLowerCase();
        return wt.includes("kadry") || wt.includes("hr") || wt.includes("kadr");
      })
      .map((e) => (e.email || "").toLowerCase())
  );
  console.log(`Pracownicy z działu Kadry (${kadryEmails.size}):`, [...kadryEmails]);

  // Zbuduj zbiór emaili adminów
  const adminEmails = new Set(
    allUsers
      .filter((u) => ADMIN_ROLES.includes(u.role || ""))
      .map((u) => (u.email || "").toLowerCase())
  );
  console.log(`Administratorzy (${adminEmails.size}):`, [...adminEmails]);

  // Wyznacz użytkowników do usunięcia z kolekcji users
  const usersToDelete = allUsers.filter((u) => {
    const email = (u.email || "").toLowerCase();
    const isAdmin = ADMIN_ROLES.includes(u.role || "") || adminEmails.has(email);
    const isKadry = kadryEmails.has(email);
    return !isAdmin && !isKadry;
  });

  console.log(`\nUżytkownicy do usunięcia z kolekcji users (${usersToDelete.length}):`);
  for (const u of usersToDelete) {
    console.log(`  - ${u.email} (rola: ${u.role}, id: ${u.id})`);
  }

  // Wyznacz pracowników do usunięcia z kolekcji employees
  const employeesToDelete = allEmployees.filter((e) => {
    const email = (e.email || "").toLowerCase();
    const isAdmin = ADMIN_ROLES.includes(e.role || "") || adminEmails.has(email);
    const isKadry = kadryEmails.has(email);
    return !isAdmin && !isKadry;
  });

  console.log(`\nPracownicy do usunięcia z kolekcji employees (${employeesToDelete.length}):`);
  for (const e of employeesToDelete) {
    console.log(`  - ${e.email} (stanowisko: ${e.workType}, id: ${e.id})`);
  }

  if (usersToDelete.length === 0 && employeesToDelete.length === 0) {
    console.log("\nBrak użytkowników do usunięcia.");
    process.exit(0);
  }

  // Usuń z kolekcji users
  let deletedUsers = 0;
  for (const u of usersToDelete) {
    try {
      await deleteDoc(doc(db, "users", u.id));
      console.log(`Usunięto users/${u.id} (${u.email})`);
      deletedUsers++;
    } catch (err) {
      console.warn(`Błąd usuwania users/${u.id}:`, err.message);
    }
  }

  // Usuń z kolekcji employees
  let deletedEmployees = 0;
  for (const e of employeesToDelete) {
    try {
      await deleteDoc(doc(db, "employees", e.id));
      console.log(`Usunięto employees/${e.id} (${e.email})`);
      deletedEmployees++;
    } catch (err) {
      console.warn(`Błąd usuwania employees/${e.id}:`, err.message);
    }
  }

  console.log(`\n✅ Gotowe. Usunięto: ${deletedUsers} z users, ${deletedEmployees} z employees.`);
  console.log("Uwaga: konta Firebase Authentication pozostają — usuń je ręcznie w Firebase Console jeśli potrzeba.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Błąd:", err);
  process.exit(1);
});
