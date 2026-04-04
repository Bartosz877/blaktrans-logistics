import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../_layout";
import { logout } from "../../lib/auth";

export default function ProfilScreen() {
  const { user } = useAuth();

  async function handleLogout() {
    try {
      await logout();
      router.replace("/(auth)/login");
    } catch {}
  }

  const displayName = user?.name || user?.email || "Administrator";
  const nameParts = displayName.split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";
  const initials = (firstName[0] || "?").toUpperCase() + (lastName[0] || "").toUpperCase();

  function getRoleBadge(role?: string) {
    if (!role) return { label: "Administrator", color: "#F87171", bg: "rgba(220,38,38,0.15)", border: "rgba(220,38,38,0.4)" };
    const r = role.toLowerCase();
    if (r === "admin" || r === "administrator") {
      return { label: "Administrator", color: "#F87171", bg: "rgba(220,38,38,0.15)", border: "rgba(220,38,38,0.4)" };
    }
    if (r === "driver") {
      return { label: "Kierowca", color: "#60A5FA", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" };
    }
    return { label: role, color: "#F5A623", bg: "rgba(245,166,35,0.15)", border: "rgba(245,166,35,0.4)" };
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
    paddingTop: 20,
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
