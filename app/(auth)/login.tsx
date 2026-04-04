import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { loginWithEmail } from "../../lib/auth";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Błąd", "Podaj email i hasło.");
      return;
    }
    setLoading(true);
    try {
      const user = await loginWithEmail(email.trim(), password);
      if (user.role === "administrator" || user.role === "ADMIN") {
        router.replace("/(admin)/statystyki");
      } else {
        router.replace("/(driver)/dashboard");
      }
    } catch (e: any) {
      const msg =
        e?.code === "auth/invalid-credential" ||
        e?.code === "auth/wrong-password" ||
        e?.code === "auth/user-not-found"
          ? "Nieprawidłowy email lub hasło."
          : e?.message === "Nie znaleziono danych użytkownika."
          ? "Konto nie jest skonfigurowane. Skontaktuj się z administratorem."
          : "Błąd logowania. Sprawdź połączenie.";
      Alert.alert("Błąd logowania", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo BT — bez białego tła, naturalnie na granatowym tle */}
        <View style={s.logoWrap}>
          <Image
            source={require("../../assets/logo.png")}
            style={s.logoImg}
            resizeMode="contain"
          />
        </View>

        <Text style={s.title}>Blaktrans Logistics</Text>
        <Text style={s.subtitle}>Zaloguj się do systemu</Text>

        {/* Karta logowania */}
        <View style={s.card}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="email@firma.pl"
            placeholderTextColor="#6B7A8D"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={s.label}>Hasło</Text>
          <View style={s.passwordRow}>
            <TextInput
              style={[s.input, s.inputPassword]}
              value={password}
              onChangeText={setPassword}
              placeholder="Hasło"
              placeholderTextColor="#6B7A8D"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={s.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Text style={s.eyeIcon}>{showPassword ? "🙈" : "👁"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#0D1B2A" />
            ) : (
              <Text style={s.btnText}>Zaloguj się</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1B2A",
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 16,
    // Brak backgroundColor — logo naturalnie na granatowym tle
  },
  logoImg: {
    width: 160,
    height: 160,
    // Brak borderRadius ani backgroundColor — PNG ma transparentne tło
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F5A623",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#8899AA",
    textAlign: "center",
    marginBottom: 36,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "#162030",
    borderRadius: 18,
    padding: 24,
  },
  label: {
    color: "#AABBCC",
    fontSize: 14,
    marginBottom: 8,
    marginTop: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#1E2D3D",
    color: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  passwordRow: {
    position: "relative",
  },
  inputPassword: {
    paddingRight: 50,
  },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  eyeIcon: {
    fontSize: 20,
  },
  btn: {
    backgroundColor: "#F5A623",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: "#0D1B2A",
    fontWeight: "800",
    fontSize: 17,
    letterSpacing: 0.5,
  },
});
