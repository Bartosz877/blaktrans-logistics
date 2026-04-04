import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export type UserRole = "administrator" | "driver" | "ADMIN" | "DRIVER";

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  name?: string;
  phone?: string;
}

// Used by _layout.tsx onAuthStateChanged
export async function getUserData(uid: string): Promise<AppUser> {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (userDoc.exists()) {
    const data = userDoc.data();
    return {
      uid,
      email: data.email || "",
      role: (data.role as UserRole) || "driver",
      name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.displayName || "",
      phone: data.phone || "",
    };
  }
  // Default to driver if no Firestore document
  return {
    uid,
    email: "",
    role: "driver",
    name: "",
  };
}

// Used by login screen
export async function loginWithEmail(
  email: string,
  password: string
): Promise<AppUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const userData = await getUserData(uid);
  return { ...userData, email: cred.user.email || email };
}

export async function logout(): Promise<void> {
  await firebaseSignOut(auth);
}
