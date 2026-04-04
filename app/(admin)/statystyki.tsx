import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import AdminHeader from "../../components/AdminHeader";
import AdminBottomNav from "../../components/AdminBottomNav";

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
  firstName?: string;
  lastName?: string;
  name?: string;
  status: string;
  psychTestExpiry?: string;
  driverCardExpiry?: string;
  driverLicenseExpiry?: string;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  plate?: string;
  regNumber?: string;
  ocExpiry?: string;
  acExpiry?: string;
  udtExpiry?: string;
  inspectionExpiry?: string;
  techInspection?: string;
  currentMileage?: string;
  lastOilChangeMileage?: string;
  oilChangeInterval?: string;
}

interface LeaveRequest {
  id: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  firstName?: string;
  lastName?: string;
  employeeName?: string;
}

interface Fault {
  id: string;
  vehicleId: string;
  description: string;
  status: string;
  vehiclePlate?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
}

interface VehicleAlert {
  vehicleId: string;
  brand: string;
  model: string;
  plate: string;
  alertType: "OC" | "AC" | "UDT" | "Przegląd" | "Wymiana oleju";
  status: "zbliża się" | "wygasło" | "po terminie" | "do wymiany";
  daysLeft?: number;
  kmLeft?: number;
  date?: string;
}

function empName(e: Employee): string {
  if (e.firstName && e.lastName) return `${e.firstName} ${e.lastName}`;
  return e.name || e.id;
}

function vehiclePlate(v: Vehicle): string {
  return v.plate || v.regNumber || "—";
}

// ─── Komponent sekcji z limitem i "Pokaż więcej" ─────────────
function Section({
  title,
  titleColor,
  borderColor,
  children,
  count,
  emptyText,
  items,
  renderItem,
}: {
  title: string;
  titleColor: string;
  borderColor: string;
  children?: React.ReactNode;
  count?: number;
  emptyText?: string;
  items?: any[];
  renderItem?: (item: any, idx: number, total: number) => React.ReactNode;
}) {
  const LIMIT = 5;
  const [expanded, setExpanded] = useState(false);

  const displayItems = items
    ? expanded ? items : items.slice(0, LIMIT)
    : undefined;
  const hasMore = items ? items.length > LIMIT : false;

  return (
    <View style={[sec.card, { borderColor }]}>
      <Text style={[sec.title, { color: titleColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {title}{count !== undefined ? ` (${count})` : ""}
      </Text>
      {children}
      {displayItems !== undefined && (
        displayItems.length === 0 ? (
          <Text style={sec.emptyText}>{emptyText || "Brak danych"}</Text>
        ) : (
          <>
            {displayItems.map((item, idx) =>
              renderItem ? renderItem(item, idx, displayItems.length) : null
            )}
            {hasMore && (
              <TouchableOpacity
                style={sec.showMoreBtn}
                onPress={() => setExpanded((e) => !e)}
              >
                <Text style={sec.showMoreText}>
                  {expanded
                    ? "▲ Zwiń"
                    : `▼ Pokaż więcej (${items!.length - LIMIT})`}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )
      )}
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function StatystykiScreen() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [faults, setFaults] = useState<Fault[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [empSnap, vehSnap, leaveSnap, faultSnap] = await Promise.all([
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "vehicles")),
        getDocs(collection(db, "leaveRequests")),
        getDocs(collection(db, "faults")),
      ]);
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
      setVehicles(vehSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle)));
      setLeaves(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest)));
      setFaults(faultSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Fault)));
    } catch {}
    setLoading(false);
  }

  // ─── Obliczenia pracownicy ───────────────────────────────────
  const activeEmp = employees.filter((e) => e.status === "active" || e.status === "Aktywny").length;
  const onLeaveEmp = employees.filter((e) => e.status === "on_leave" || e.status === "Urlop" || e.status === "Na urlopie").length;
  const l4Emp = employees.filter((e) => e.status === "l4" || e.status === "L4").length;
  const pendingLeave = leaves.filter((l) => l.status === "pending").length;

  // ─── Kończące się dokumenty (30 dni) ─────────────────────────
  const expiringDocs = (() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items: { id: string; name: string; type: string; date: string; daysLeft: number }[] = [];
    for (const emp of employees) {
      const fullName = empName(emp);
      const licDate = parseDate(emp.psychTestExpiry || emp.driverLicenseExpiry);
      if (licDate && licDate <= in30) {
        const daysLeft = Math.ceil((licDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        items.push({ id: emp.id + "_lic", name: fullName, type: "Prawo jazdy / Kod 95", date: (emp.psychTestExpiry || emp.driverLicenseExpiry)!, daysLeft });
      }
      const cardDate = parseDate(emp.driverCardExpiry);
      if (cardDate && cardDate <= in30) {
        const daysLeft = Math.ceil((cardDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        items.push({ id: emp.id + "_card", name: fullName, type: "Karta Kierowcy / Tachograf", date: emp.driverCardExpiry!, daysLeft });
      }
    }
    return items.sort((a, b) => a.daysLeft - b.daysLeft);
  })();

  // ─── Zbliżające się urlopy (7 dni) ───────────────────────────
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

  // ─── Alerty pojazdów ─────────────────────────────────────────
  const vehicleAlerts = (() => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const alerts: VehicleAlert[] = [];
    for (const v of vehicles) {
      const plate = vehiclePlate(v);
      const terminy: { alertType: VehicleAlert["alertType"]; date: string | undefined }[] = [
        { alertType: "OC", date: v.ocExpiry },
        { alertType: "AC", date: v.acExpiry },
        { alertType: "UDT", date: v.udtExpiry },
        { alertType: "Przegląd", date: v.inspectionExpiry || v.techInspection },
      ];
      for (const { alertType, date } of terminy) {
        if (!date) continue;
        const d = parseDate(date);
        if (!d) continue;
        const daysLeft = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (d <= in30) {
          alerts.push({ vehicleId: v.id, brand: v.brand || "—", model: v.model || "", plate, alertType, status: daysLeft <= 0 ? "wygasło" : "zbliża się", daysLeft, date });
        }
      }
      if (v.currentMileage && v.lastOilChangeMileage && v.oilChangeInterval) {
        const current = parseInt(v.currentMileage) || 0;
        const lastOil = parseInt(v.lastOilChangeMileage) || 0;
        const interval = parseInt(v.oilChangeInterval) || 15000;
        const kmLeft = (lastOil + interval) - current;
        if (kmLeft <= 2000) {
          alerts.push({ vehicleId: v.id, brand: v.brand || "—", model: v.model || "", plate, alertType: "Wymiana oleju", status: kmLeft <= 0 ? "po terminie" : "do wymiany", kmLeft });
        }
      }
    }
    return alerts.sort((a, b) => {
      const aExp = a.status === "wygasło" || a.status === "po terminie" ? 0 : 1;
      const bExp = b.status === "wygasło" || b.status === "po terminie" ? 0 : 1;
      if (aExp !== bExp) return aExp - bExp;
      if (a.daysLeft !== undefined && b.daysLeft !== undefined) return a.daysLeft - b.daysLeft;
      return 0;
    });
  })();

  // ─── Usterki aktywne ─────────────────────────────────────────
  const activeFaults = faults.filter(
    (f) => f.status === "new" || f.status === "Nowa" || f.status === "in_progress" || f.status === "W trakcie"
  );

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color="#F5A623" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <AdminHeader />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>📊 Statystyki</Text>

        {/* Pracownicy */}
        <View style={[sec.card, { borderColor: "rgba(245,166,35,0.2)" }]}>
          <Text style={[sec.title, { color: "#F5A623" }]} numberOfLines={1}>
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
              <Text style={{ fontSize: 14 }}>⏳</Text>
              <Text style={s.alertText}>
                {pendingLeave} {pendingLeave === 1 ? "wniosek" : "wnioski"} urlopowe czekają na decyzję
              </Text>
            </View>
          )}
        </View>

        {/* Kończące się dokumenty */}
        <Section
          title="📄 Kończące się dokumenty (30 dni)"
          titleColor="#F87171"
          borderColor="rgba(248,113,113,0.25)"
          items={expiringDocs}
          emptyText="Brak kończących się dokumentów"
          renderItem={(doc, idx, total) => (
            <View key={doc.id} style={[s.listRow, idx < total - 1 && s.listRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.listName} numberOfLines={1}>{doc.name}</Text>
                <Text style={s.listSub} numberOfLines={1}>{doc.type} • do: {doc.date}</Text>
              </View>
              <View style={[s.badge, {
                backgroundColor: doc.daysLeft <= 0 ? "rgba(248,113,113,0.2)" : doc.daysLeft <= 7 ? "rgba(248,113,113,0.15)" : "rgba(245,158,11,0.15)",
                borderColor: doc.daysLeft <= 0 ? "rgba(248,113,113,0.4)" : doc.daysLeft <= 7 ? "rgba(248,113,113,0.3)" : "rgba(245,158,11,0.3)",
              }]}>
                <Text style={[s.badgeText, { color: doc.daysLeft <= 7 ? "#F87171" : "#FBBF24" }]}>
                  {doc.daysLeft <= 0 ? "Wygasło" : `${doc.daysLeft} dni`}
                </Text>
              </View>
            </View>
          )}
        />

        {/* Zbliżające się urlopy */}
        <Section
          title="📅 Zbliżające się urlopy (7 dni)"
          titleColor="#60A5FA"
          borderColor="rgba(96,165,250,0.2)"
          items={upcomingLeaves}
          emptyText="Brak zbliżających się urlopów"
          renderItem={(l, idx, total) => (
            <View key={l.id} style={[s.listRow, idx < total - 1 && s.listRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.listName} numberOfLines={1}>
                  {l.firstName && l.lastName ? `${l.firstName} ${l.lastName}` : l.employeeName || "Pracownik"}
                </Text>
                <Text style={[s.listSub, { color: "#60A5FA" }]}>{l.dateFrom} – {l.dateTo}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: "rgba(96,165,250,0.15)", borderColor: "rgba(96,165,250,0.3)" }]}>
                <Text style={[s.badgeText, { color: "#60A5FA" }]}>Urlop</Text>
              </View>
            </View>
          )}
        />

        {/* Pojazdy — alerty */}
        <Section
          title="🚚 Pojazdy — zbliżające się terminy"
          titleColor="#F5A623"
          borderColor="rgba(245,166,35,0.2)"
          count={vehicleAlerts.length}
          items={vehicleAlerts}
          emptyText="Brak zbliżających się terminów (30 dni)"
          renderItem={(alert, idx, total) => {
            const expired = alert.status === "wygasło" || alert.status === "po terminie";
            const urgent = !expired && alert.daysLeft !== undefined && alert.daysLeft <= 7;
            const badgeBg = expired ? "rgba(248,113,113,0.2)" : urgent ? "rgba(248,113,113,0.15)" : "rgba(245,158,11,0.15)";
            const badgeBorder = expired ? "rgba(248,113,113,0.4)" : urgent ? "rgba(248,113,113,0.3)" : "rgba(245,158,11,0.3)";
            const badgeColor = expired || urgent ? "#F87171" : "#FBBF24";
            let badgeLabel = "";
            if (alert.alertType === "Wymiana oleju") {
              badgeLabel = alert.status === "po terminie"
                ? `Olej: po term. (${Math.abs(alert.kmLeft || 0).toLocaleString()} km)`
                : `Olej: ${(alert.kmLeft || 0).toLocaleString()} km`;
            } else {
              badgeLabel = expired ? `${alert.alertType}: Wygasło` : `${alert.alertType}: ${alert.daysLeft} dni`;
            }
            return (
              <View key={`${alert.vehicleId}_${alert.alertType}`} style={[s.listRow, idx < total - 1 && s.listRowBorder]}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "nowrap", overflow: "hidden" }}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700", flexShrink: 1, flex: 1 }}>{alert.brand} {alert.model}</Text>
                  <Text style={{ color: "#F5A623", fontSize: 12, fontWeight: "600", flexShrink: 0 }}>·</Text>
                  <Text style={{ color: "#F5A623", fontSize: 12, fontWeight: "600", flexShrink: 0 }} numberOfLines={1}>{alert.plate}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: badgeBg, borderColor: badgeBorder, flexShrink: 0 }]}>
                  <Text style={[s.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Usterki */}
        <Section
          title="🔧 Usterki"
          titleColor="#F87171"
          borderColor="rgba(248,113,113,0.2)"
          count={activeFaults.length}
          items={activeFaults}
          emptyText="Brak aktywnych usterek"
          renderItem={(f, idx, total) => (
            <View key={f.id} style={[s.listRow, idx < total - 1 && s.listRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.listName} numberOfLines={1}>
                  {f.vehicleBrand && f.vehicleModel ? `${f.vehicleBrand} ${f.vehicleModel}` : f.vehiclePlate || "Pojazd"}
                </Text>
                <Text style={s.listSub} numberOfLines={1}>{f.description}</Text>
              </View>
              <View style={[s.badge, {
                backgroundColor: f.status === "in_progress" || f.status === "W trakcie" ? "rgba(245,158,11,0.15)" : "rgba(248,113,113,0.15)",
                borderColor: f.status === "in_progress" || f.status === "W trakcie" ? "rgba(245,158,11,0.3)" : "rgba(248,113,113,0.3)",
              }]}>
                <Text style={[s.badgeText, { color: f.status === "in_progress" || f.status === "W trakcie" ? "#FBBF24" : "#F87171" }]}>
                  {f.status === "in_progress" || f.status === "W trakcie" ? "W trakcie" : "Nowa"}
                </Text>
              </View>
            </View>
          )}
        />
      </ScrollView>
      <AdminBottomNav />
    </View>
  );
}

// ─── Style sekcji ─────────────────────────────────────────────
const sec = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  emptyText: { color: "#687076", fontSize: 13, fontStyle: "italic" },
  showMoreBtn: {
    marginTop: 10,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(245,166,35,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
  },
  showMoreText: { color: "#F5A623", fontSize: 13, fontWeight: "700" },
});

// ─── Style główne ─────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  center: { justifyContent: "center", alignItems: "center" },
  pageTitle: { fontSize: 22, fontWeight: "800", color: "#F5A623", marginBottom: 16, letterSpacing: 0.5 },
  row3: { flexDirection: "row", gap: 10 },
  statBox: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center" },
  statNum: { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  statLabel: { color: "#8899AA", fontSize: 11, fontWeight: "600" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 8, padding: 10 },
  alertText: { color: "#FBBF24", fontSize: 12, fontWeight: "600", flex: 1 },
  listRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  listName: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  listSub: { color: "#8899AA", fontSize: 12 },
  badge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
