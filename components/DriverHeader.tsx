import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../app/_layout";
import { logout } from "../lib/auth";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DriverHeader() {
  const { user, setUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Subskrybuj nieprzeczytane powiadomienia TYLKO dla tego użytkownika (forRole=driver + recipientId)
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "notifications"),
      where("read", "==", false),
      where("forRole", "==", "driver")
    );
    const unsub = onSnapshot(q, (snap) => {
      // Filtruj po stronie klienta: osobiste (recipientId) lub broadcast (brak recipientId/userId)
      const count = snap.docs.filter((d) => {
        const data = d.data();
        if (data.recipientId) return data.recipientId === user!.uid;
        if (data.userId) return data.userId === user!.uid;
        return false; // broadcast bez adresata - nie licz
      }).length;
      setUnreadCount(count);
    }, (err) => {
      console.warn("[DriverHeader] Błąd badge:", err);
    });
    return () => unsub();
  }, [user?.uid]);

  async function handleLogout() {
    setMenuVisible(false);
    try {
      await logout();
      setUser(null);
      router.replace("/(auth)/login");
    } catch {}
  }

  function handleProfile() {
    setMenuVisible(false);
    router.push("/(driver)/profil" as any);
  }

  function handleNotifications() {
    setMenuVisible(false);
    router.push("/(driver)/powiadomienia" as any);
  }

  function handleChat() {
    router.push("/(driver)/czat" as any);
  }

  const displayName = user?.name || user?.email || "Użytkownik";

  // Oblicz label i kolor roli
  const roleInfo = (() => {
    const r = (user?.role || "").toLowerCase();
    if (r === "administrator" || r === "admin") {
      return { label: "Administrator", color: "#F87171", bg: "rgba(220,38,38,0.15)", border: "rgba(220,38,38,0.4)" };
    }
    if (r === "dygacz") {
      return { label: "Dygacz", color: "#F472B6", bg: "rgba(244,114,182,0.15)", border: "rgba(244,114,182,0.4)" };
    }
    // DRIVER, driver, Kierowca — niebieski
    return { label: "Kierowca", color: "#60A5FA", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" };
  })();

  // Używaj safe area insets zamiast StatusBar.currentHeight
  const topPad = Platform.select({
    web: 10,
    ios: insets.top > 0 ? insets.top : 44,
    default: insets.top > 0 ? insets.top : 24,
  });

  return (
    <>
      <View style={[s.header, { paddingTop: topPad }]}>
        {/* Lewa strona — kompaktowa */}
        <View style={s.left}>
          <View style={s.nameRow}>
            <Text style={s.greeting}>Witaj, </Text>
            <Text style={s.name} numberOfLines={1} ellipsizeMode="tail">
              {displayName}
            </Text>
          </View>
          <View style={s.badgesRow}>
            <View style={s.activeBadge}>
              <Text style={s.activeBadgeText}>● Aktywny</Text>
            </View>
            <View style={[s.roleBadge, { backgroundColor: roleInfo.bg, borderColor: roleInfo.border }]}>
              <Text style={[s.roleBadgeText, { color: roleInfo.color }]}>{roleInfo.label}</Text>
            </View>
          </View>
        </View>

        {/* Prawa strona: 3 ikony */}
        <View style={s.iconsRow}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={handleChat}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={s.iconText}>💬</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.iconBtn}
            onPress={handleNotifications}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={s.iconText}>🔔</Text>
            {unreadCount > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>
                  {unreadCount > 99 ? "99+" : String(unreadCount)}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => setMenuVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={s.iconText}>≡</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dropdown menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setMenuVisible(false)}>
          <View style={s.menuBox}>
            <TouchableOpacity style={s.menuItem} onPress={handleProfile}>
              <Text style={s.menuIcon}>👤</Text>
              <Text style={s.menuText}>Mój profil</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleNotifications}>
              <Text style={s.menuIcon}>🔔</Text>
              <Text style={s.menuText}>
                Powiadomienia{unreadCount > 0 ? ` (${unreadCount})` : ""}
              </Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleLogout}>
              <Text style={s.menuIcon}>🚪</Text>
              <Text style={[s.menuText, { color: "#F87171" }]}>Wyloguj</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#1B2838",
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  left: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "nowrap",
    overflow: "hidden",
  },
  greeting: {
    color: "#8899AA",
    fontSize: 12,
    fontWeight: "500",
  },
  name: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
    flexWrap: "wrap",
  },
  activeBadge: {
    backgroundColor: "rgba(74,222,128,0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.35)",
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#4ADE80",
  },
  roleBadge: {
    backgroundColor: "rgba(245,166,35,0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.4)",
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#F5A623",
  },
  iconsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    flexShrink: 0,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#1E2D3D",
    borderWidth: 1.5,
    borderColor: "#C8960C",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  iconText: {
    fontSize: 15,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#F87171",
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: "#1B2838",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 100,
    paddingRight: 14,
  },
  menuBox: {
    backgroundColor: "#1B2838",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    minWidth: 200,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
  },
  menuIcon: { fontSize: 17 },
  menuText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#2A3A4A",
    marginHorizontal: 12,
  },
});
