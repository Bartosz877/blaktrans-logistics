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
  Modal,
  Pressable,
} from "react-native";
import { router } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { loginWithEmail } from "../../lib/auth";
import { useAuth } from "../_layout";

export default function LoginScreen() {
  const { suspendedError, setSuspendedError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Odzyskiwanie hasła
  const [resetVisible, setResetVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setLoginError("Podaj email i hasło.");
      return;
    }
    setLoading(true);
    setLoginError(null);
    setSuspendedError(null);
    try {
      const user = await loginWithEmail(email.trim(), password);
      if (user.role === "administrator" || user.role === "ADMIN") {
        router.replace("/(admin)/statystyki");
      } else {
        router.replace("/(driver)/dashboard");
      }
    } catch (e: any) {
      if (e?.message === "ACCOUNT_SUSPENDED") {
        setLoginError("Konto zostało zawieszone. Skontaktuj się z administratorem.");
      } else if (e?.message === "ACCOUNT_NOT_FOUND") {
        setLoginError("Konto nie istnieje lub zostało usunięte.");
      } else if (
        e?.code === "auth/invalid-credential" ||
        e?.code === "auth/wrong-password" ||
        e?.code === "auth/user-not-found"
      ) {
        setLoginError("Nieprawidłowy email lub hasło.");
      } else {
        setLoginError("Błąd logowania. Sprawdź połączenie.");
      }
    } finally {
      setLoading(false);
    }
  }

  function openReset() {
    setResetEmail(email.trim());
    setResetMsg(null);
    setResetVisible(true);
  }

  function closeReset() {
    setResetVisible(false);
    setResetMsg(null);
    setResetEmail("");
  }

  async function handleResetPassword() {
    setResetMsg(null);
    const trimmed = resetEmail.trim().toLowerCase();
    if (!trimmed) {
      setResetMsg({ type: "error", text: "Podaj adres email." });
      return;
    }
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      setResetMsg({ type: "error", text: "Podaj prawidłowy adres email." });
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setResetMsg({
        type: "success",
        text: `Link do resetowania hasła został wysłany na adres ${trimmed}. Sprawdź skrzynkę odbiorczą (i folder spam).`,
      });
    } catch (e: any) {
      const code = e?.code || "";
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        setResetMsg({ type: "error", text: "Nie znaleziono konta z tym adresem email." });
      } else if (code === "auth/too-many-requests") {
        setResetMsg({ type: "error", text: "Zbyt wiele prób. Spróbuj ponownie za chwilę." });
      } else {
        setResetMsg({ type: "error", text: "Błąd wysyłania emaila. Sprawdź połączenie i spróbuj ponownie." });
      }
    } finally {
      setResetLoading(false);
    }
  }

  // Komunikat zawieszenia z _layout.tsx (aktywna sesja)
  const errorToShow = suspendedError || loginError;
  const isSuspended =
    suspendedError === "Konto zostało zawieszone" ||
    loginError?.startsWith("Konto zostało zawieszone");

  return (
    <>
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
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

            {/* Komunikat błędu / zawieszenia */}
            {errorToShow && (
              <View style={[s.msgBox, isSuspended ? s.msgSuspended : s.msgError]}>
                <Text style={[s.msgText, isSuspended ? s.msgTextSuspended : s.msgTextError]}>
                  {isSuspended ? "🔒 " : "⚠ "}{errorToShow}
                </Text>
              </View>
            )}

            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={(v) => { setEmail(v); setLoginError(null); setSuspendedError(null); }}
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
                onChangeText={(v) => { setPassword(v); setLoginError(null); setSuspendedError(null); }}
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

            {/* Link odzyskiwania hasła */}
            <TouchableOpacity style={s.forgotBtn} onPress={openReset}>
              <Text style={s.forgotText}>Nie pamiętasz hasła?</Text>
            </TouchableOpacity>

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

      {/* Modal odzyskiwania hasła */}
      <Modal
        visible={resetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReset}
      >
        <Pressable style={s.overlay} onPress={closeReset}>
          <Pressable style={s.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Odzyskaj hasło</Text>
              <TouchableOpacity onPress={closeReset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.modalSubtitle}>
              Podaj adres email powiązany z kontem. Wyślemy link do resetowania hasła.
            </Text>

            {resetMsg && (
              <View style={[s.msgBox, resetMsg.type === "success" ? s.msgSuccess : s.msgError]}>
                <Text style={[s.msgText, resetMsg.type === "success" ? s.msgTextSuccess : s.msgTextError]}>
                  {resetMsg.type === "success" ? "✓ " : "⚠ "}{resetMsg.text}
                </Text>
              </View>
            )}

            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={resetEmail}
              onChangeText={(v) => { setResetEmail(v); setResetMsg(null); }}
              placeholder="email@firma.pl"
              placeholderTextColor="#6B7A8D"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!resetMsg || resetMsg.type !== "success"}
            />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={closeReset}>
                <Text style={s.cancelBtnText}>Anuluj</Text>
              </TouchableOpacity>

              {(!resetMsg || resetMsg.type !== "success") && (
                <TouchableOpacity
                  style={[s.sendBtn, resetLoading && s.btnDisabled]}
                  onPress={handleResetPassword}
                  disabled={resetLoading}
                  activeOpacity={0.85}
                >
                  {resetLoading ? (
                    <ActivityIndicator color="#0D1B2A" size="small" />
                  ) : (
                    <Text style={s.sendBtnText}>Wyślij link</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoWrap: { alignItems: "center", marginBottom: 16 },
  logoImg: { width: 160, height: 160 },
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
  passwordRow: { position: "relative" },
  inputPassword: { paddingRight: 50 },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  eyeIcon: { fontSize: 20 },
  forgotBtn: { alignSelf: "flex-end", marginTop: 10, paddingVertical: 4 },
  forgotText: { color: "#F5A623", fontSize: 13, fontWeight: "600" },
  btn: {
    backgroundColor: "#F5A623",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: "#0D1B2A",
    fontWeight: "800",
    fontSize: 17,
    letterSpacing: 0.5,
  },
  // Komunikaty błędów
  msgBox: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
    marginTop: 4,
    borderWidth: 1,
  },
  msgSuccess: {
    backgroundColor: "rgba(74,222,128,0.1)",
    borderColor: "rgba(74,222,128,0.35)",
  },
  msgError: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderColor: "rgba(248,113,113,0.35)",
  },
  msgSuspended: {
    backgroundColor: "rgba(251,191,36,0.1)",
    borderColor: "rgba(251,191,36,0.4)",
  },
  msgText: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  msgTextSuccess: { color: "#4ADE80" },
  msgTextError: { color: "#F87171" },
  msgTextSuspended: { color: "#FBBF24" },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalBox: {
    backgroundColor: "#162030",
    borderRadius: 18,
    padding: 24,
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: { color: "#F5A623", fontSize: 18, fontWeight: "800" },
  modalClose: { color: "#8899AA", fontSize: 18, fontWeight: "700" },
  modalSubtitle: {
    color: "#8899AA",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#1E2D3D",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  cancelBtnText: { color: "#8899AA", fontWeight: "700", fontSize: 14 },
  sendBtn: {
    flex: 2,
    backgroundColor: "#F5A623",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendBtnText: { color: "#0D1B2A", fontWeight: "800", fontSize: 14 },
});
