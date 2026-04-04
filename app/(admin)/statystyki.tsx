import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../_layout";
import { logout } from "../../lib/auth";

// ─── Helpers ─────────────────────────────────────────────────
function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split(".");
    const dt = new Date(`${y}-${m}-${d}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const dt = new Date(raw.substring(0, 10));
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

// ─── Types ───────────────────────────────────────────────────
interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  psychTestExpiry?: string;
  driverCardExpiry?: string;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  regNumber: string;
  techInspection?: string;
  udtExpiry?: string;
  ocExpiry?: string;
}

interface LeaveRequest {
  id: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  firstName?: string;
  lastName?: string;
}

// ─── Main Component ──────────────────────────────────────────
export default function StatystykiScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [empSnap, vehSnap, leaveSnap] = await Promise.all([
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "vehicles")),
        getDocs(collection(db, "leaveRequests")),
      ]);
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
      setVehicles(vehSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle)));
      setLeaves(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest)));
    } catch (e) {
      // Dane niedostępne — pokaż puste statystyki
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      router.replace("/(auth)/login");
    } catch {
      Alert.alert("Błąd", "Nie udało się wylogować.");
    }
  }

  // ─── Obliczenia ─────────────────────────────────────────────
  const activeEmp = employees.filter((e) => e.status === "active").length;
  const onLeaveEmp = employees.filter((e) => e.status === "on_leave").length;
  const l4Emp = employees.filter((e) => e.status === "l4").length;
  const pendingLeave = leaves.filter((l) => l.status === "pending").length;

  // Kończące się dokumenty (30 dni)
  const expiringDocs = (() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items: { id: string; name: string; type: string; date: string; daysLeft: number }[] = [];
    for (const emp of employees) {
      const fullName = `${emp.firstName} ${emp.lastName}`;
      const psychDate = parseDate(emp.psychTestExpiry);
      if (psychDate && psychDate <= in30) {
        const daysLeft = Math.ceil((psychDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        items.push({ id: emp.id + "_psych", name: fullName, type: "Prawo jazdy / Kod 95", date: emp.psychTestExpiry!, daysLeft });
      }
      const cardDate = parseDate(emp.driverCardExpiry);
      if (cardDate && cardDate <= in30) {
        const daysLeft = Math.ceil((cardDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        items.push({ id: emp.id + "_card", name: fullName, type: "Karta Kierowcy / Tachograf", date: emp.driverCardExpiry!, daysLeft });
      }
    }
    return items.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  })();

  // Zbliżające się urlopy (7 dni)
  const upcomingLeaves = (() => {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return leaves.filter((l) => {
      if (l.status !== "approved") return false;
      const d = parseDate(l.dateFrom);
      if (!d) return false;
      return d >= now && d <= in7;
    });
  })();

  // Pojazdy ze zbliżającymi się terminami (30 dni)
  const expiringVehicles = (() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const result: { v: Vehicle; expiring: { label: string; date: string; daysLeft: number }[] }[] = [];
    for (const v of vehicles) {
      const expiring: { label: string; date: string; daysLeft: number }[] = [];
      const checks = [
        { label: "Przegląd", date: v.techInspection },
        { label: "UDT", date: v.udtExpiry },
        { label: "OC", date: v.ocExpiry },
      ];
      for (const { label, date } of checks) {
        const d = parseDate(date);
        if (d && d <= in30) {
          const daysLeft = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          expiring.push({ label, date: date!, daysLeft });
        }
      }
      if (expiring.length > 0) {
        result.push({ v, expiring: expiring.sort((a, b) => a.daysLeft - b.daysLeft) });
      }
    }
    return result.sort((a, b) => a.expiring[0].daysLeft - b.expiring[0].daysLeft);
  })();

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color="#F5A623" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Witaj,</Text>
          <Text style={s.name}>
            {user?.firstName} {user?.lastName}
          </Text>
          <View style={s.adminBadge}>
            <Text style={s.adminBadgeText}>✅ Administrator</Text>
          </View>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>Wyloguj</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.pageTitle}>📊 Statystyki</Text>

        {/* Pracownicy */}
        <View style={[s.card, { borderColor: "rgba(245,166,35,0.2)" }]}>
          <Text style={[s.cardTitle, { color: "#F5A623" }]}>
            👥 Pracownicy ({employees.length})
          </Text>
          <View style={s.row3}>
            <View style={[s.statBox, { backgroundColor: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.3)" }]}>
              <Text style={[s.statNum, { color: "#4ADE80" }]}>{activeEmp}</Text>
              <Text style={s.statLabel}>Aktywni</Text>
            </View>
            <View style={[s.statBox, { backgroundColor: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.3)" }]}>
              <Text style={[s.statNum, { color: "#FBBF24" }]}>{onLeaveEmp}</Text>
              <Text style={s.statLabel}>Na urlopie</Text>
            </View>
            <View style={[s.statBox, { backgroundColor: "rgba(168,85,247,0.1)", borderColor: "rgba(168,85,247,0.3)" }]}>
              <Text style={[s.statNum, { color: "#C084FC" }]}>{l4Emp}</Text>
              <Text style={s.statLabel}>L4</Text>
            </View>
          </View>
          {pendingLeave > 0 && (
            <View style={s.alertRow}>
              <Text style={{ fontSize: 16 }}>⏳</Text>
              <Text style={s.alertText}>
                {pendingLeave} wniosków urlopowych czeka na decyzję
              </Text>
            </View>
          )}
        </View>

        {/* Kończące się dokumenty */}
        <View style={[s.card, { borderColor: "rgba(248,113,113,0.25)" }]}>
          <Text style={[s.cardTitle, { color: "#F87171" }]}>
            📄 Kończące się dokumenty (30 dni)
          </Text>
          {expiringDocs.length === 0 ? (
            <Text style={s.emptyText}>Brak kończących się dokumentów</Text>
          ) : (
            expiringDocs.map((doc, idx) => (
              <View
                key={doc.id}
                style={[
                  s.listRow,
                  idx < expiringDocs.length - 1 && s.listRowBorder,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.listName}>{doc.name}</Text>
                  <Text style={s.listSub}>
                    {doc.type} • ważne do: {doc.date}
                  </Text>
                </View>
                <View
                  style={[
                    s.badge,
                    {
                      backgroundColor:
                        doc.daysLeft <= 0
                          ? "rgba(248,113,113,0.2)"
                          : doc.daysLeft <= 7
                          ? "rgba(248,113,113,0.15)"
                          : "rgba(245,158,11,0.15)",
                      borderColor:
                        doc.daysLeft <= 0
                          ? "rgba(248,113,113,0.4)"
                          : doc.daysLeft <= 7
                          ? "rgba(248,113,113,0.3)"
                          : "rgba(245,158,11,0.3)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.badgeText,
                      {
                        color:
                          doc.daysLeft <= 7 ? "#F87171" : "#FBBF24",
                      },
                    ]}
                  >
                    {doc.daysLeft <= 0 ? "Wygasło" : `${doc.daysLeft} dni`}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Zbliżające się urlopy */}
        <View style={[s.card, { borderColor: "rgba(96,165,250,0.2)" }]}>
          <Text style={[s.cardTitle, { color: "#60A5FA" }]}>
            📅 Zbliżające się urlopy (7 dni)
          </Text>
          {upcomingLeaves.length === 0 ? (
            <Text style={s.emptyText}>Brak zbliżających się urlopów</Text>
          ) : (
            upcomingLeaves.map((l, idx) => (
              <View
                key={l.id}
                style={[
                  s.listRow,
                  idx < upcomingLeaves.length - 1 && s.listRowBorder,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.listName}>
                    {l.firstName} {l.lastName}
                  </Text>
                  <Text style={[s.listSub, { color: "#60A5FA" }]}>
                    {l.dateFrom} – {l.dateTo}
                  </Text>
                </View>
                <View
                  style={[
                    s.badge,
                    {
                      backgroundColor: "rgba(96,165,250,0.15)",
                      borderColor: "rgba(96,165,250,0.3)",
                    },
                  ]}
                >
                  <Text style={[s.badgeText, { color: "#60A5FA" }]}>
                    Urlop
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Pojazdy — zbliżające się terminy */}
        <View style={[s.card, { borderColor: "rgba(245,166,35,0.2)" }]}>
          <Text style={[s.cardTitle, { color: "#F5A623" }]}>
            🚚 Pojazdy — zbliżające się terminy
          </Text>
          {expiringVehicles.length === 0 ? (
            <Text style={s.emptyText}>
              Brak zbliżających się terminów (30 dni)
            </Text>
          ) : (
            expiringVehicles.map(({ v, expiring }, idx) => (
              <View
                key={v.id}
                style={[
                  s.listRow,
                  idx < expiringVehicles.length - 1 && s.listRowBorder,
                  { flexDirection: "column", alignItems: "flex-start" },
                ]}
              >
                <Text style={s.listName}>
                  {v.brand} {v.model}
                </Text>
                <Text style={[s.listSub, { color: "#F5A623", marginBottom: 6 }]}>
                  {v.regNumber}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {expiring.map((e) => (
                    <View
                      key={e.label}
                      style={[
                        s.badge,
                        {
                          backgroundColor:
                            e.daysLeft <= 0
                              ? "rgba(248,113,113,0.2)"
                              : e.daysLeft <= 7
                              ? "rgba(248,113,113,0.15)"
                              : "rgba(245,158,11,0.15)",
                          borderColor:
                            e.daysLeft <= 0
                              ? "rgba(248,113,113,0.4)"
                              : e.daysLeft <= 7
                              ? "rgba(248,113,113,0.3)"
                              : "rgba(245,158,11,0.3)",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.badgeText,
                          {
                            color:
                              e.daysLeft <= 7 ? "#F87171" : "#FBBF24",
                          },
                        ]}
                      >
                        {e.label}: {e.daysLeft <= 0 ? "Wygasło" : `${e.daysLeft} dni`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Podsumowanie floty */}
        <View style={[s.card, { borderColor: "rgba(96,165,250,0.2)" }]}>
          <Text style={[s.cardTitle, { color: "#60A5FA" }]}>
            🚛 Flota pojazdów
          </Text>
          <View style={s.row2}>
            <View
              style={[
                s.statBox,
                {
                  backgroundColor: "rgba(96,165,250,0.1)",
                  borderColor: "rgba(96,165,250,0.3)",
                },
              ]}
            >
              <Text style={[s.statNum, { color: "#60A5FA" }]}>
                {vehicles.length}
              </Text>
              <Text style={s.statLabel}>Wszystkich</Text>
            </View>
            <View
              style={[
                s.statBox,
                {
                  backgroundColor: "rgba(248,113,113,0.1)",
                  borderColor: "rgba(248,113,113,0.3)",
                },
              ]}
            >
              <Text style={[s.statNum, { color: "#F87171" }]}>
                {expiringVehicles.length}
              </Text>
              <Text style={s.statLabel}>Wymaga uwagi</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
    backgroundColor: "#1B2838",
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  greeting: { color: "#8899AA", fontSize: 13 },
  name: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    backgroundColor: "rgba(74,222,128,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  adminBadgeText: { fontSize: 12, fontWeight: "700", color: "#4ADE80" },
  logoutBtn: {
    backgroundColor: "#2A3A4A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutText: { color: "#AABBCC", fontSize: 13, fontWeight: "600" },
  pageTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F5A623",
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 12,
  },
  row3: { flexDirection: "row", gap: 10 },
  row2: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  statNum: { fontSize: 26, fontWeight: "900" },
  statLabel: { fontSize: 11, color: "#9BA1A6", marginTop: 2 },
  alertRow: {
    marginTop: 10,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  alertText: { fontSize: 13, color: "#FBBF24", fontWeight: "700", flex: 1 },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  listRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  listName: { fontSize: 13, fontWeight: "800", color: "#ECEDEE" },
  listSub: { fontSize: 11, color: "#9BA1A6", marginTop: 2 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  emptyText: { fontSize: 13, color: "#687076", fontStyle: "italic" },
});
