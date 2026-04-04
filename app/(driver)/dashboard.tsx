import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../_layout";
import { logout } from "../../lib/auth";
import { router } from "expo-router";

export default function DriverDashboard() {
  const { user } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/login");
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Panel Kierowcy</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={s.logout}>Wyloguj</Text>
        </TouchableOpacity>
      </View>
      <View style={s.body}>
        <Text style={s.name}>{user?.name || user?.email}</Text>
        <Text style={s.info}>Panel kierowcy — w budowie</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#162030",
  },
  title: { color: "#F5A623", fontSize: 20, fontWeight: "700" },
  logout: { color: "#8899AA", fontSize: 14 },
  body: { flex: 1, justifyContent: "center", alignItems: "center" },
  name: { color: "#FFFFFF", fontSize: 18, marginBottom: 8 },
  info: { color: "#8899AA", fontSize: 14 },
});
