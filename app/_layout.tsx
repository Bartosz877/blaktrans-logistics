import { useEffect, useState, createContext, useContext } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { getUserData, AppUser } from "../lib/auth";
import { View, ActivityIndicator, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { registerPushToken } from "../lib/pushNotifications";

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  setUser: (u: AppUser | null) => void;
  suspendedError: string | null;
  setSuspendedError: (msg: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  setUser: () => {},
  suspendedError: null,
  setSuspendedError: () => {},
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
      // Kierowca (DRIVER), Dygacz (dygacz) i inne role — panel użytkownika
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
  const [suspendedError, setSuspendedError] = useState<string | null>(null);

  // Periodyczna walidacja sesji — co 30s sprawdza czy konto nie zostało zawieszone/usunięte
  useEffect(() => {
    if (!firebaseUser) return;
    const interval = setInterval(async () => {
      try {
        const data = await getUserData(firebaseUser.uid);
        // Konto OK — aktualizuj dane jeśli się zmieniły
        setUser(data);
      } catch (err: any) {
        // Konto usunięte lub zawieszone — wyloguj
        setUser(null);
        setSuspendedError(
          err?.message === "ACCOUNT_SUSPENDED"
            ? "Konto zostało zawieszone"
            : null
        );
        try {
          const { signOut } = await import("firebase/auth");
          await signOut(auth);
        } catch {}
      }
    }, 30000); // co 30 sekund
    return () => clearInterval(interval);
  }, [firebaseUser?.uid]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const data = await getUserData(fbUser.uid);
          setUser(data);
          // Zarejestruj token push (tylko na urządzeniu mobilnym)
          if (Platform.OS !== "web") {
            registerPushToken(fbUser.uid).catch(() => {});
          }
        } catch (err: any) {
          // Konto usunięte lub zawieszone — wyloguj natychmiast
          setUser(null);
          setSuspendedError(
            err?.message === "ACCOUNT_SUSPENDED"
              ? "Konto zostało zawieszone"
              : null
          );
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
      <AuthContext.Provider value={{ user, firebaseUser, loading, setUser, suspendedError, setSuspendedError }}>
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
