import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { router, usePathname } from "expo-router";

export default function AdminBottomNav() {
  const pathname = usePathname();

  const tabs = [
    { key: "statystyki", label: "Statystyki", icon: "📊", route: "/(admin)/statystyki" },
    { key: "kadry",      label: "Kadry",      icon: "👥", route: "/(admin)/kadry" },
    { key: "pojazdy",    label: "Pojazdy",    icon: "🚛", route: "/(admin)/pojazdy" },
    { key: "tachograf",  label: "Tachograf",  icon: "📟", route: "/(admin)/tachograf" },
  ];

  function isActive(key: string) {
    return pathname.includes(key);
  }

  // Safe area bottom padding:
  // Android z gestami nawigacji: ~16-20px
  // Web: brak paska systemowego
  // iOS: obsługiwane przez SafeAreaView w natywnym APK
  const bottomPad = Platform.select({
    android: 20,
    web: 6,
    ios: 0,
    default: 6,
  });

  return (
    <View style={[s.bottomNav, { paddingBottom: bottomPad }]}>
      {tabs.map((tab) => {
        const active = isActive(tab.key);
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.navItem}
            onPress={() => router.replace(tab.route as any)}
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
          >
            <Text style={[s.navIcon, active && s.navIconActive]}>{tab.icon}</Text>
            <Text style={[s.navLabel, active && s.navLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#1B2838",
    borderTopWidth: 1,
    borderTopColor: "#2A3A4A",
    paddingTop: 10,
    // paddingBottom ustawiane dynamicznie
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  navIcon: { fontSize: 20, marginBottom: 2, opacity: 0.45 },
  navIconActive: { opacity: 1 },
  navLabel: { fontSize: 10, color: "#687076", fontWeight: "600" },
  navLabelActive: { color: "#F5A623" },
});
