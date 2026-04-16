import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export type UserRole = "administrator" | "driver" | "dygacz" | "ADMIN" | "DRIVER";

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  name?: string;
  phone?: string;
  suspended?: boolean;
}

/**
 * Pobiera dane użytkownika z Firestore.
 * WAŻNE: Jeśli dokument nie istnieje lub konto jest zawieszone — rzuca błąd.
 * NIE ma już fallbacku na "driver" dla nieistniejących kont.
 */
export async function getUserData(uid: string): Promise<AppUser> {
  const userDoc = await getDoc(doc(db, "users", uid));

  if (!userDoc.exists()) {
    // Brak dokumentu users/{uid} = konto usunięte lub niezarejestrowane
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const data = userDoc.data();

  if (data?.suspended === true) {
    // Konto zawieszone — rzuć błąd który _layout.tsx obsłuży
    throw new Error("ACCOUNT_SUSPENDED");
  }

  return {
    uid,
    email: data.email || "",
    role: (data.role as UserRole) || "driver",
    name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.displayName || "",
    phone: data.phone || "",
    suspended: false,
  };
}

/**
 * Logowanie przez email + hasło.
 * Sprawdza czy konto istnieje i nie jest zawieszone PRZED zwróceniem danych.
 */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<AppUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  try {
    const userData = await getUserData(uid);
    return { ...userData, email: cred.user.email || email };
  } catch (err: any) {
    // Konto usunięte lub zawieszone — wyloguj natychmiast
    try { await firebaseSignOut(auth); } catch {}

    if (err.message === "ACCOUNT_SUSPENDED") {
      throw new Error("ACCOUNT_SUSPENDED");
    }
    // ACCOUNT_NOT_FOUND lub inny błąd
    throw new Error("ACCOUNT_NOT_FOUND");
  }
}

export async function logout(): Promise<void> {
  await firebaseSignOut(auth);
}
