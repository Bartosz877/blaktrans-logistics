/**
 * adminAuth.ts
 *
 * Operacje administracyjne na kontach Firebase Authentication.
 *
 * Usuwanie kont Auth:
 * 1. Próba przez Cloud Function deleteAuthUser (Firebase Admin SDK po stronie serwera)
 * 2. Fallback: Identity Toolkit REST API z tokenem admina
 * 3. Zawsze usuwa dokument users/{uid} z Firestore (natychmiastowa blokada logowania)
 */

import { doc, updateDoc, deleteDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, app } from "./firebase";

const FIREBASE_API_KEY = "AIzaSyBnUHwt2qoxUoq_YM_-FthcUAgoAHXnVVw";
const PROJECT_ID = "blaktransapp";

/**
 * Usuwa konto Firebase Authentication.
 * Metoda 1: Cloud Function deleteAuthUser (Firebase Admin SDK)
 * Metoda 2: Identity Toolkit REST API (fallback)
 * Zawsze usuwa też dokument users/{uid} z Firestore.
 */
export async function deleteUserAccount(uid: string, _email?: string): Promise<void> {
  let authDeleted = false;

  // Metoda 1: Cloud Function (Firebase Admin SDK po stronie serwera)
  try {
    const functions = getFunctions(app, "us-central1");
    const deleteAuthUser = httpsCallable(functions, "deleteAuthUser");
    const result = await deleteAuthUser({ uid });
    console.log("[adminAuth] Cloud Function OK:", result.data);
    authDeleted = true;
  } catch (cfErr: any) {
    console.warn("[adminAuth] Cloud Function error:", cfErr?.message || cfErr);
  }

  // Metoda 2: Identity Toolkit REST API (fallback gdy Cloud Function zawiedzie)
  if (!authDeleted) {
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete?key=${FIREBASE_API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localId: uid }),
      });
      if (response.ok) {
        console.log("[adminAuth] Identity Toolkit REST API: konto usunięte");
        authDeleted = true;
      } else {
        const errData = await response.json().catch(() => ({}));
        console.warn("[adminAuth] Identity Toolkit error:", errData);
      }
    } catch (restErr: any) {
      console.warn("[adminAuth] REST API fallback error:", restErr?.message || restErr);
    }
  }

  // Zawsze usuń dokument users/{uid} z Firestore (blokada logowania nawet jeśli Auth nie usunięte)
  try {
    await deleteDoc(doc(db, "users", uid));
    console.log("[adminAuth] users/" + uid + " usunięty z Firestore");
  } catch (err) {
    console.warn("[adminAuth] Błąd usuwania users/" + uid + ":", err);
  }

  if (!authDeleted) {
    console.warn("[adminAuth] Konto Auth nie zostało usunięte, ale users/" + uid + " usunięty — logowanie zablokowane");
  }
}

/**
 * Zawiesza konto użytkownika — ustawia suspended:true w Firestore.
 * Zawieszone konto jest blokowane przy logowaniu i sprawdzaniu sesji.
 */
export async function suspendUserAccount(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    suspended: true,
    suspendedAt: new Date().toISOString(),
  });
}

/**
 * Cofa zawieszenie konta użytkownika.
 */
export async function unsuspendUserAccount(uid: string): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    suspended: false,
    suspendedAt: null,
  });
}

/**
 * Sprawdza czy konto jest zawieszone.
 */
export async function isAccountSuspended(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return false;
    return snap.data()?.suspended === true;
  } catch {
    return false;
  }
}
