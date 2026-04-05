import { View, Text, StyleSheet } from "react-native";
import AdminHeader from "../../components/AdminHeader";
import AdminBottomNav from "../../components/AdminBottomNav";

export default function TachografScreen() {
  return (
    <View style={s.root}>
      <AdminHeader pageTitle="Tachograf" />
      <View style={s.body}>
        <Text style={s.icon}>📟</Text>
        <Text style={s.title}>Tachograf</Text>
        <Text style={s.sub}>Moduł w przygotowaniu</Text>
      </View>
      <AdminBottomNav />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D1B2A" },
  body: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  icon: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: "700", color: "#F5A623" },
  sub: { fontSize: 14, color: "#687076" },
});
