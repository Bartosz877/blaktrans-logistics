import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../app/_layout";
import { logout } from "../lib/auth";

interface AdminHeaderProps {
  pageTitle?: string;
}

export default function AdminHeader({ pageTitle }: AdminHeaderProps) {
  const { user, setUser } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Subskrybuj nieprzeczytane powiadomienia
  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      where("read", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setUnreadCount(snap.size);
    });
    return () => unsub();
  }, []);

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
    router.push("/(admin)/profil");
  }

  function handleInbox() {
    setMenuVisible(false);
    router.push("/(admin)/czat");
  }

  function handleNotifications() {
    router.push("/(admin)/powiadomienia");
  }

  const displayName = user?.name || user?.email || "Administrator";

  const topPadding = Platform.select({
    android: (StatusBar.currentHeight ?? 24) + 8,
    web: 14,
    ios: 50,
    default: 14,
  });

  return (
    <>
      <View style={[s.header, { paddingTop: topPadding }]}>
        {/* Lewa strona */}
        <View style={s.left}>
          <Text style={s.greeting}>Witaj,</Text>
          <Text style={s.name} numberOfLines={1} ellipsizeMode="tail">
            {displayName}
          </Text>
          <View style={s.badgesRow}>
            <View style={s.activeBadge}>
              <Text style={s.activeBadgeText}>● Aktywny</Text>
            </View>
            <View style={s.adminBadge}>
              <Text style={s.adminBadgeText}>Administrator</Text>
            </View>
          </View>
        </View>

        {/* Prawa strona: 3 ikony */}
        <View style={s.iconsRow}>
          {/* Czat */}
          <TouchableOpacity
            style={s.iconBtn}
            onPress={handleInbox}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={s.iconText}>💬</Text>
          </TouchableOpacity>

          {/* Powiadomienia z badge */}
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

          {/* Menu */}
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
            <TouchableOpacity style={s.menuItem} onPress={handleInbox}>
              <Text style={s.menuIcon}>💬</Text>
              <Text style={s.menuText}>Czat</Text>
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
    paddingBottom: 12,
    backgroundColor: "#1B2838",
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  left: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  greeting: {
    color: "#8899AA",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 1,
  },
  badgesRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 5,
    flexWrap: "wrap",
  },
  activeBadge: {
    backgroundColor: "rgba(74,222,128,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.35)",
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4ADE80",
  },
  adminBadge: {
    backgroundColor: "rgba(220,38,38,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.4)",
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#F87171",
  },
  iconsRow: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    flexShrink: 0,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#1E2D3D",
    borderWidth: 1.5,
    borderColor: "#C8960C",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  iconText: {
    fontSize: 16,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#F87171",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#1B2838",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 110,
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
    paddingVertical: 13,
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
