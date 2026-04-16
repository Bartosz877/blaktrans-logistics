import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../_layout";
import DriverHeader from "../../components/DriverHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname, useLocalSearchParams } from "expo-router";

// ─── Types ───────────────────────────────────────────────────
interface LeaveRequest {
  id: string;
  employeeId?: string;
  employeeName?: string;
  firstName?: string;
  lastName?: string;
  dateFrom: string;
  dateTo: string;
  type?: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  createdAt?: any;
  docUrl?: string;
  docPath?: string;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  contractFrom?: string;
  contractTo?: string;
  employmentType?: string;
}

// ─── Helpers ─────────────────────────────────────────────────
function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  // Try YYYY-MM-DD
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

function statusLabel(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "approved": return { label: "Zaakceptowany", color: "#4ADE80", bg: "rgba(74,222,128,0.15)" };
    case "rejected": return { label: "Odrzucony", color: "#F87171", bg: "rgba(248,113,113,0.15)" };
    default: return { label: "Oczekujący", color: "#F5A623", bg: "rgba(245,166,35,0.15)" };
  }
}

function createdAtLabel(ts: any): string {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `Złożono: ${d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  } catch {
    return "";
  }
}

// ─── Main Screen ─────────────────────────────────────────────────
export default function SprawyScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ leaveId?: string }>();
  const [loading, setLoading] = useState(true);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [highlightLeaveId, setHighlightLeaveId] = useState<string | null>(null);

  const bottomPad = Platform.select({ web: 6, default: Math.max(insets.bottom, 8) });

  // Załaduj dane pracownika
  useEffect(() => {
    if (!user?.email && !user?.uid) return;
    loadEmployee();
  }, [user?.uid]);

  async function loadEmployee() {
    try {
      // Szukaj po email
      if (user?.email) {
        const q = query(collection(db, "employees"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          setEmployee({ id: d.id, ...d.data() } as Employee);
          return;
        }
      }
      // Szukaj po uid
      if (user?.uid) {
        const q = query(collection(db, "employees"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          setEmployee({ id: d.id, ...d.data() } as Employee);
        }
      }
    } catch (err) {
      console.error("loadEmployee error:", err);
    }
  }

  // Subskrybuj wnioski urlopowe w czasie rzeczywistym
  useEffect(() => {
    if (!user?.email && !user?.uid) {
      setLoading(false);
      return;
    }

    // Szukaj po employeeId lub email
    const identifier = user.email || user.uid;
    const field = user.email ? "employeeEmail" : "employeeId";

    let unsub: (() => void) | null = null;

    async function subscribe() {
      try {
        // Próba z orderBy
        const q = query(
          collection(db, "leaveRequests"),
          where(field, "==", identifier),
          orderBy("createdAt", "desc")
        );
        unsub = onSnapshot(q, (snap) => {
          setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest)));
          setLoading(false);
        }, async () => {
          // Fallback bez orderBy
          try {
            const q2 = query(collection(db, "leaveRequests"), where(field, "==", identifier));
            const snap2 = await getDocs(q2);
            setLeaves(snap2.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest)));
          } catch {}
          setLoading(false);
        });
      } catch {
        setLoading(false);
      }
    }

    subscribe();
    return () => { if (unsub) unsub(); };
  }, [user?.uid, user?.email]);

  // Obsługa leaveId z URL (z powiadomień)
  useEffect(() => {
    if (params.leaveId) {
      setHighlightLeaveId(params.leaveId);
      // Wyczyść highlight po 5 sekundach
      const t = setTimeout(() => setHighlightLeaveId(null), 5000);
      return () => clearTimeout(t);
    }
  }, [params.leaveId]);

  return (
    <View style={s.container}>
      <DriverHeader />
      {/* Pasek z guzikiem Wróć */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>← Wróć</Text>
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Sprawy Pracownicze</Text>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomPad + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Dwa duże kafelki ─── */}
        <View style={s.bigTilesRow}>
          <TouchableOpacity
            style={s.bigTile}
            activeOpacity={0.8}
            onPress={() => router.push("/(driver)/wniosek-urlopowy" as any)}
          >
            <Text style={s.bigTileIcon}>📝</Text>
            <Text style={s.bigTileTitle}>Wyślij wniosek{"\n"}urlopowy</Text>
            <Text style={s.bigTileDesc}>Złóż wniosek o urlop{"\n"}wypoczynkowy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.bigTile}
            activeOpacity={0.8}
            onPress={() => router.push("/(driver)/umowa" as any)}
          >
            <Text style={s.bigTileIcon}>📄</Text>
            <Text style={s.bigTileTitle}>Sprawdź swoją{"\n"}umowę</Text>
            <Text style={s.bigTileDesc}>Dane z Twojej aktualnej{"\n"}umowy</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Historia wniosków ─── */}
        <Text style={s.sectionTitle}>🗓 Moje wnioski urlopowe</Text>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="small" color="#F5A623" />
          </View>
        ) : leaves.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>Brak złożonych wniosków urlopowych</Text>
          </View>
        ) : (
          leaves.map((leave) => {
            const { label, color, bg } = statusLabel(leave.status);
            const submitted = createdAtLabel(leave.createdAt);
            return (
              <View key={leave.id} style={[s.leaveCard, highlightLeaveId === leave.id && s.leaveCardHighlight]}>
                <View style={s.leaveCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.leaveDates}>
                      {formatDate(leave.dateFrom)} — {formatDate(leave.dateTo)}
                    </Text>
                    {submitted ? (
                      <Text style={s.leaveSubmitted}>{submitted}</Text>
                    ) : null}
                    {leave.type ? (
                      <Text style={s.leaveType}>{leave.type}</Text>
                    ) : null}
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: bg, borderColor: `${color}55` }]}>
                    <Text style={[s.statusBadgeText, { color }]}>{label}</Text>
                  </View>
                </View>
                {leave.docUrl ? (
                  <TouchableOpacity
                    style={s.docBtn}
                    onPress={() => openDoc(leave.docUrl!)}
                  >
                    <Text style={s.docBtnText}>📎 Pobierz dokument</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

       {/* ─── Stały dolny pasek nawigacji ─── */}
      <View style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity
          style={[s.tile, pathname.includes("/pojazd") && s.tileActive]}
          activeOpacity={0.75}
          onPress={() => router.push("/(driver)/pojazd" as any)}
        >
          <Text style={s.tileIcon}>🚛</Text>
          <Text style={[s.tileLabel, pathname.includes("/pojazd") && s.tileLabelActive]}>Pojazd</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tile, pathname.includes("/sprawy") && s.tileActive]}
          activeOpacity={0.75}
          onPress={() => router.push("/(driver)/sprawy" as any)}
        >
          <Text style={s.tileIcon}>📋</Text>
          <Text style={[s.tileLabel, pathname.includes("/sprawy") && s.tileLabelActive]}>{"Sprawy\nPracownicze"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tile, pathname.includes("/tachograf") && s.tileActive]}
          activeOpacity={0.75}
          onPress={() => router.push("/(driver)/tachograf" as any)}
        >
          <Text style={s.tileIcon}>⏰</Text>
          <Text style={[s.tileLabel, pathname.includes("/tachograf") && s.tileLabelActive]}>{"Tachograf\ni Czas Pracy"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tile, pathname.includes("/dashboard") && s.tileActive]}
          activeOpacity={0.75}
          onPress={() => router.push("/(driver)/dashboard" as any)}
        >
          <Text style={s.tileIcon}>📊</Text>
          <Text style={[s.tileLabel, pathname.includes("/dashboard") && s.tileLabelActive]}>Statystyki</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function openDoc(url: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.open(url, "_blank");
  } else {
    import("expo-linking").then(({ openURL }) => openURL(url)).catch(() => {});
  }
}

// ─── Style ───────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  scroll: { flex: 1 },
  scrollContent: { padding: 10, gap: 8 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  backBtn: { paddingVertical: 4, paddingRight: 8 },
  backBtnText: { color: "#F5A623", fontSize: 14, fontWeight: "700" },
  topBarTitle: { flex: 1, color: "#FFFFFF", fontSize: 16, fontWeight: "800" },

  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#0D1B2A",
    borderTopWidth: 1,
    borderTopColor: "#2A3A4A",
    paddingTop: 8,
    paddingHorizontal: 6,
    gap: 2,
  },
  tile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 10,
    gap: 3,
  },
  tileActive: {
    backgroundColor: "rgba(245,166,35,0.12)",
  },
  tileIcon: { fontSize: 20 },
  tileLabel: {
    color: "#8899AA",
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 12,
  },
  tileLabelActive: { color: "#F5A623" },

  bigTilesRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 2,
  },
  bigTile: {
    flex: 1,
    backgroundColor: "#1B2838",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    padding: 12,
    alignItems: "center",
    gap: 6,
    minHeight: 110,
    justifyContent: "center",
  },
  bigTileIcon: { fontSize: 28 },
  bigTileTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
  },
  bigTileDesc: {
    color: "#8899AA",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
  },

  sectionTitle: {
    color: "#F5A623",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
    marginBottom: 4,
  },

  loadingWrap: { alignItems: "center", paddingVertical: 24 },
  emptyWrap: {
    backgroundColor: "#1B2838",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    padding: 20,
    alignItems: "center",
  },
  emptyText: { color: "#8899AA", fontSize: 13 },

  leaveCard: {
    backgroundColor: "#1B2838",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    padding: 14,
    gap: 8,
  },
  leaveCardHighlight: {
    borderColor: "#F5A623",
    borderWidth: 2,
    backgroundColor: "rgba(245,166,35,0.08)",
  },
  leaveCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  leaveDates: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  leaveSubmitted: {
    color: "#8899AA",
    fontSize: 12,
    marginTop: 2,
  },
  leaveType: {
    color: "#8899AA",
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  docBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(245,166,35,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
    alignSelf: "flex-start",
  },
  docBtnText: {
    color: "#F5A623",
    fontSize: 12,
    fontWeight: "600",
  },
});
