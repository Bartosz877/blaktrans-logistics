import { useEffect, useState, createContext, useContext } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { getUserData, AppUser } from "../lib/auth";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  setUser: (u: AppUser | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  setUser: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function AuthGuard({
  firebaseUser,
  user,
  loading,
}: {
  firebaseUser: User | null;
  user: AppUser | null;
  loading: boolean;
}) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === "(auth)";
    const inAdmin = segments[0] === "(admin)";
    const inDriver = segments[0] === "(driver)";

    if (!firebaseUser) {
      // Nie zalogowany — idź do logowania
      if (!inAuth) {
        router.replace("/(auth)/login");
      }
    } else if (user?.role === "administrator" || user?.role === "ADMIN") {
      // Administrator — panel admina
      if (!inAdmin) {
        router.replace("/(admin)/statystyki");
      }
    } else if (user) {
      // Kierowca i Dygacz (DRIVER) — panel użytkownika
      if (!inDriver) {
        router.replace("/(driver)/dashboard");
      }
    }
    // Jeśli user jest null ale firebaseUser istnieje — czekamy (getUserData w toku)
  }, [loading, firebaseUser, user]);

  return null;
}

export default function RootLayout() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const data = await getUserData(fbUser.uid);
          setUser(data);
        } catch {
          // Dokument w Firestore nie istnieje — wyloguj
          setUser(null);
          try {
            const { signOut } = await import("firebase/auth");
            await signOut(auth);
          } catch {}
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <SafeAreaProvider>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#0D1B2A",
          }}
        >
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={{ user, firebaseUser, loading, setUser }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="(driver)" />
        </Stack>
        <AuthGuard firebaseUser={firebaseUser} user={user} loading={loading} />
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}
