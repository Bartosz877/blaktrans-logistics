import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { router } from "expo-router";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../_layout";
import { logout } from "../../lib/auth";

export default function ProfilScreen() {
  const { user } = useAuth();

  // Zmiana hasła
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleLogout() {
    try {
      await logout();
      router.replace("/(auth)/login");
    } catch {}
  }

  async function handleChangePassword() {
    setPasswordMsg(null);

    if (!currentPassword.trim()) {
      setPasswordMsg({ type: "error", text: "Podaj obecne hasło." });
      return;
    }
    if (!newPassword.trim()) {
      setPasswordMsg({ type: "error", text: "Podaj nowe hasło." });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: "Nowe hasło musi mieć co najmniej 6 znaków." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Nowe hasła nie są zgodne." });
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordMsg({ type: "error", text: "Nowe hasło musi być inne niż obecne." });
      return;
    }

    setChangingPassword(true);
    try {
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.email) throw new Error("Brak zalogowanego użytkownika.");

      // Reautentykacja
      const credential = EmailAuthProvider.credential(fbUser.email, currentPassword);
      await reauthenticateWithCredential(fbUser, credential);

      // Zmiana hasła
      await updatePassword(fbUser, newPassword);

      setPasswordMsg({ type: "success", text: "Hasło zostało zmienione pomyślnie." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      const code = e?.code || "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPasswordMsg({ type: "error", text: "Obecne hasło jest nieprawidłowe." });
      } else if (code === "auth/too-many-requests") {
        setPasswordMsg({ type: "error", text: "Zbyt wiele prób. Spróbuj ponownie za chwilę." });
      } else if (code === "auth/requires-recent-login") {
        setPasswordMsg({ type: "error", text: "Sesja wygasła. Wyloguj się i zaloguj ponownie." });
      } else {
        setPasswordMsg({ type: "error", text: "Błąd zmiany hasła. Spróbuj ponownie." });
      }
    } finally {
      setChangingPassword(false);
    }
  }

  const displayName = user?.name || user?.email || "Administrator";
  const nameParts = displayName.split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
  const initials = (firstName[0] || "?").toUpperCase() + (lastName[0] || "").toUpperCase();

  function getRoleBadge(role?: string) {
    if (!role) return { label: "Kierowca", color: "#60A5FA", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" };
    const r = role.toLowerCase();
    if (r === "admin" || r === "administrator") {
      return { label: "Administrator", color: "#F87171", bg: "rgba(220,38,38,0.15)", border: "rgba(220,38,38,0.4)" };
    }
    if (r === "dygacz") {
      return { label: "Dygacz", color: "#F472B6", bg: "rgba(244,114,182,0.15)", border: "rgba(244,114,182,0.4)" };
    }
    // driver, DRIVER — niebieski
    return { label: "Kierowca", color: "#60A5FA", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" };
  }

  const roleBadge = getRoleBadge(user?.role);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Wróć</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mój profil</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.displayName}>{displayName}</Text>
          <View style={s.badgesRow}>
            <View style={s.activeBadge}>
              <Text style={s.activeBadgeText}>✓ Aktywny</Text>
            </View>
            <View style={[s.roleBadge, { backgroundColor: roleBadge.bg, borderColor: roleBadge.border }]}>
              <Text style={[s.roleBadgeText, { color: roleBadge.color }]}>{roleBadge.label}</Text>
            </View>
          </View>
        </View>

        {/* Dane */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Dane konta</Text>

          <View style={s.row}>
            <Text style={s.rowLabel}>Imię</Text>
            <Text style={s.rowValue}>{firstName || "—"}</Text>
          </View>
          <View style={s.divider} />

          <View style={s.row}>
            <Text style={s.rowLabel}>Nazwisko</Text>
            <Text style={s.rowValue}>{lastName || "—"}</Text>
          </View>
          <View style={s.divider} />

          <View style={s.row}>
            <Text style={s.rowLabel}>Email</Text>
            <Text style={s.rowValue}>{user?.email || "—"}</Text>
          </View>
          <View style={s.divider} />

          <View style={s.row}>
            <Text style={s.rowLabel}>Rola</Text>
            <Text style={[s.rowValue, { color: roleBadge.color }]}>{roleBadge.label}</Text>
          </View>
          <View style={s.divider} />

          <View style={s.row}>
            <Text style={s.rowLabel}>Status</Text>
            <Text style={[s.rowValue, { color: "#4ADE80" }]}>Aktywny</Text>
          </View>
          {user?.phone ? (
            <>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.rowLabel}>Telefon</Text>
                <Text style={s.rowValue}>{user.phone}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Zmiana hasła */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Zmiana hasła</Text>

          {/* Komunikat */}
          {passwordMsg && (
            <View style={[s.msgBox, passwordMsg.type === "success" ? s.msgSuccess : s.msgError]}>
              <Text style={[s.msgText, passwordMsg.type === "success" ? s.msgTextSuccess : s.msgTextError]}>
                {passwordMsg.type === "success" ? "✓ " : "⚠ "}{passwordMsg.text}
              </Text>
            </View>
          )}

          {/* Obecne hasło */}
          <Text style={s.fieldLabel}>Obecne hasło</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={currentPassword}
              onChangeText={(v) => { setCurrentPassword(v); setPasswordMsg(null); }}
              placeholder="Wpisz obecne hasło"
              placeholderTextColor="#4A5568"
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowCurrent(!showCurrent)}>
              <Text style={s.eyeIcon}>{showCurrent ? "🙈" : "👁"}</Text>
            </TouchableOpacity>
          </View>

          {/* Nowe hasło */}
          <Text style={s.fieldLabel}>Nowe hasło</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setPasswordMsg(null); }}
              placeholder="Min. 6 znaków"
              placeholderTextColor="#4A5568"
              secureTextEntry={!showNew}
              autoCapitalize="none"
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowNew(!showNew)}>
              <Text style={s.eyeIcon}>{showNew ? "🙈" : "👁"}</Text>
            </TouchableOpacity>
          </View>

          {/* Powtórz nowe hasło */}
          <Text style={s.fieldLabel}>Powtórz nowe hasło</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); setPasswordMsg(null); }}
              placeholder="Powtórz nowe hasło"
              placeholderTextColor="#4A5568"
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
            />
            <TouchableOpacity style={s.eyeBtn} onPress={() => setShowConfirm(!showConfirm)}>
              <Text style={s.eyeIcon}>{showConfirm ? "🙈" : "👁"}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.changeBtn, changingPassword && s.changeBtnDisabled]}
            onPress={handleChangePassword}
            disabled={changingPassword}
            activeOpacity={0.85}
          >
            {changingPassword ? (
              <ActivityIndicator color="#0D1B2A" size="small" />
            ) : (
              <Text style={s.changeBtnText}>Zmień hasło</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Wyloguj */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>🚪 Wyloguj się</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.select({ android: 40, ios: 54, default: 20 }),
    paddingBottom: 12,
    backgroundColor: "#1B2838",
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  backBtn: {},
  backText: { color: "#8899AA", fontSize: 14, fontWeight: "600" },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  content: { padding: 20 },
  // Avatar
  avatarWrap: { alignItems: "center", paddingVertical: 24 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#1E3A5F",
    borderWidth: 3,
    borderColor: "#F5A623",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: { color: "#F5A623", fontSize: 28, fontWeight: "800" },
  displayName: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginBottom: 10 },
  badgesRow: { flexDirection: "row", gap: 8 },
  activeBadge: {
    backgroundColor: "rgba(74,222,128,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.4)",
  },
  activeBadgeText: { color: "#4ADE80", fontSize: 12, fontWeight: "700" },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleBadgeText: { fontSize: 12, fontWeight: "700" },
  // Karta
  card: {
    backgroundColor: "#162030",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: {
    color: "#F5A623",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowLabel: { color: "#8899AA", fontSize: 14 },
  rowValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#2A3A4A" },
  // Formularz zmiany hasła
  fieldLabel: {
    color: "#AABBCC",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
  },
  inputRow: {
    position: "relative",
  },
  input: {
    backgroundColor: "#1E2D3D",
    color: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    paddingRight: 46,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  eyeIcon: { fontSize: 18 },
  changeBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  changeBtnDisabled: { opacity: 0.6 },
  changeBtnText: { color: "#0D1B2A", fontWeight: "800", fontSize: 15 },
  // Komunikat
  msgBox: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
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
  msgText: { fontSize: 13, fontWeight: "600" },
  msgTextSuccess: { color: "#4ADE80" },
  msgTextError: { color: "#F87171" },
  // Wyloguj
  logoutBtn: {
    backgroundColor: "rgba(248,113,113,0.12)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    paddingVertical: 16,
    alignItems: "center",
  },
  logoutText: { color: "#F87171", fontSize: 15, fontWeight: "700" },
});
