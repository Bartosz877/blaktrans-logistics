import { useEffect, useState } from "react";
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
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../_layout";
import DriverHeader from "../../components/DriverHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";

// ─── Types ───────────────────────────────────────────────────
interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  workType: string;
  status: string;
  contractFrom?: string;
  contractTo?: string;
  employmentType?: string;
  driverLicenseExpiry?: string;
  driverCardExpiry?: string;
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year?: string;
  plate: string;
  status?: string;
  ocExpiry?: string;
  acExpiry?: string;
  inspectionExpiry?: string;
  currentMileage?: string;
}

interface ContractFile {
  id: string;
  employeeId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedAt?: any;
}

interface LeaveRequest {
  id: string;
  dateFrom: string;
  dateTo: string;
  type?: string;
  status: "pending" | "approved" | "rejected";
}

// ─── Helpers ─────────────────────────────────────────────────
function parseDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  // Obsługa DD.MM.RRRR
  const parts = dateStr.trim().split(".");
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
  }
  // Obsługa ISO
  const iso = new Date(dateStr);
  if (!isNaN(iso.getTime())) return iso;
  return null;
}

function daysUntil(dateStr?: string): number | null {
  const d = parseDate(dateStr);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function urgencyColor(days: number | null): string {
  if (days === null) return "#8899AA";
  if (days < 0) return "#F87171";
  if (days <= 14) return "#F87171";
  if (days <= 30) return "#F5A623";
  return "#4ADE80";
}

function leaveStatusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case "approved": return { label: "Zatwierdzony", color: "#4ADE80" };
    case "rejected": return { label: "Odrzucony", color: "#F87171" };
    default: return { label: "Oczekuje", color: "#F5A623" };
  }
}

// ─── Sekcja: Pusty stan ───────────────────────────────────────
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.emptyRow}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

// ─── Sekcja: Wiersz danych ────────────────────────────────────
function DataRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={s.dataRow}>
      <Text style={s.dataLabel}>{label}</Text>
      <Text style={[s.dataValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

// ─── Sekcja: Nagłówek sekcji ──────────────────────────────────
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionIcon}>{icon}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Główny ekran ─────────────────────────────────────────────
export default function DriverDashboard() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    if (user?.uid) loadData();
  }, [user?.uid]);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([
        loadEmployee(),
      ]);
    } catch {}
    setLoading(false);
  }

  async function loadEmployee() {
    if (!user?.email && !user?.uid) return;

    let emp: Employee | null = null;

    // Próba 1: szukaj po email
    if (user?.email) {
      try {
        const q = query(
          collection(db, "employees"),
          where("email", "==", user.email.toLowerCase())
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          emp = { id: d.id, ...d.data() } as Employee;
        }
      } catch {}
    }

    // Próba 2: szukaj po uid (jeśli employees mają pole uid)
    if (!emp && user?.uid) {
      try {
        const q = query(
          collection(db, "employees"),
          where("uid", "==", user.uid)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0];
          emp = { id: d.id, ...d.data() } as Employee;
        }
      } catch {}
    }

    if (!emp) return;
    setEmployee(emp);

    // Załaduj pojazd przypisany do tego pracownika
    await loadVehicle(emp.id);
    // Załaduj pliki umowy
    await loadContractFiles(emp.id);
    // Załaduj urlopy
    await loadLeaves(emp.id);
  }

  async function loadVehicle(empId: string) {
    try {
      const q = query(
        collection(db, "vehicles"),
        where("assignedEmployeeId", "==", empId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        setVehicle({ id: d.id, ...d.data() } as Vehicle);
      }
    } catch {}
  }

  async function loadContractFiles(empId: string) {
    try {
      const q = query(
        collection(db, "contractFiles"),
        where("employeeId", "==", empId)
      );
      const snap = await getDocs(q);
      setContractFiles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContractFile)));
    } catch {}
  }

  async function loadLeaves(empId: string) {
    try {
      let snap;
      try {
        const q = query(
          collection(db, "leaveRequests"),
          where("employeeId", "==", empId),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        snap = await getDocs(q);
      } catch {
        const q = query(
          collection(db, "leaveRequests"),
          where("employeeId", "==", empId)
        );
        snap = await getDocs(q);
      }
      setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest)));
    } catch {}
  }

  function openFile(url: string) {
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      import("expo-linking").then(({ openURL }) => openURL(url)).catch(() => {});
    }
  }

  const bottomPad = Platform.select({
    web: 6,
    default: Math.max(insets.bottom, 8),
  });

  if (loading) {
    return (
      <View style={s.container}>
        <DriverHeader />
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={s.loadingText}>Ładowanie danych...</Text>
        </View>
      </View>
    );
  }

  // ─── Dane do sekcji ─────────────────────────────────────────
  const licenseExpiry = employee?.driverLicenseExpiry;
  const cardExpiry = employee?.driverCardExpiry;
  const licenseDays = daysUntil(licenseExpiry);
  const cardDays = daysUntil(cardExpiry);

  const contractDays = daysUntil(employee?.contractTo);

  // Najbliższy aktywny urlop
  const activeLeave = leaves.find((l) => l.status === "approved" || l.status === "pending");

  return (
    <View style={s.container}>
      <DriverHeader />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomPad + 16 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ─── Sekcja: Przypisany pojazd ─── */}
        <View style={s.card}>
          <SectionHeader icon="🚛" title="Przypisany pojazd" />
          {vehicle ? (
            <View style={s.cardBody}>
              <View style={s.vehicleTopRow}>
                <View style={s.vehicleIconWrap}>
                  <Text style={s.vehicleIconText}>🚛</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.vehicleName}>
                    {vehicle.brand} {vehicle.model}
                    {vehicle.year ? ` (${vehicle.year})` : ""}
                  </Text>
                  <Text style={s.vehiclePlate}>{vehicle.plate}</Text>
                </View>
                {vehicle.status && (
                  <View style={[s.statusBadge, { backgroundColor: "rgba(74,222,128,0.15)", borderColor: "rgba(74,222,128,0.35)" }]}>
                    <Text style={[s.statusBadgeText, { color: "#4ADE80" }]}>{vehicle.status}</Text>
                  </View>
                )}
              </View>
              <View style={s.divider} />
              {vehicle.currentMileage && (
                <DataRow label="Przebieg" value={`${vehicle.currentMileage} km`} />
              )}
              {vehicle.ocExpiry && (() => {
                const days = daysUntil(vehicle.ocExpiry);
                return (
                  <DataRow
                    label="OC do"
                    value={`${formatDate(vehicle.ocExpiry)}${days !== null ? ` (${days < 0 ? "po terminie" : `${days} dni`})` : ""}`}
                    valueColor={urgencyColor(days)}
                  />
                );
              })()}
              {vehicle.inspectionExpiry && (() => {
                const days = daysUntil(vehicle.inspectionExpiry);
                return (
                  <DataRow
                    label="Przegląd do"
                    value={`${formatDate(vehicle.inspectionExpiry)}${days !== null ? ` (${days < 0 ? "po terminie" : `${days} dni`})` : ""}`}
                    valueColor={urgencyColor(days)}
                  />
                );
              })()}
            </View>
          ) : (
            <View style={s.cardBody}>
              <EmptyState icon="🚛" text="Brak przypisanego pojazdu" />
            </View>
          )}
        </View>

        {/* ─── Sekcja: Ważność dokumentów ─── */}
        <View style={s.card}>
          <SectionHeader icon="📋" title="Ważność dokumentów" />
          <View style={s.cardBody}>
            {/* Prawo jazdy / Kod 95 */}
            <View style={s.docRow}>
              <View style={s.docIconWrap}>
                <Text style={s.docIcon}>🪪</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.docName}>Prawo jazdy / Kod 95</Text>
                {licenseExpiry ? (
                  <Text style={[s.docExpiry, { color: urgencyColor(licenseDays) }]}>
                    Ważne do: {formatDate(licenseExpiry)}
                    {licenseDays !== null && (
                      <Text style={{ fontWeight: "700" }}>
                        {licenseDays < 0 ? "  ⚠️ Wygasło" : licenseDays <= 30 ? `  (${licenseDays} dni)` : ""}
                      </Text>
                    )}
                  </Text>
                ) : (
                  <Text style={s.docMissing}>Brak danych</Text>
                )}
              </View>
              {licenseDays !== null && (
                <View style={[s.docBadge, { backgroundColor: `${urgencyColor(licenseDays)}22`, borderColor: `${urgencyColor(licenseDays)}66` }]}>
                  <Text style={[s.docBadgeText, { color: urgencyColor(licenseDays) }]}>
                    {licenseDays < 0 ? "Wygasło" : `${licenseDays} dni`}
                  </Text>
                </View>
              )}
            </View>

            <View style={s.docDivider} />

            {/* Karta kierowcy / Tachograf */}
            <View style={s.docRow}>
              <View style={s.docIconWrap}>
                <Text style={s.docIcon}>📟</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.docName}>Karta kierowcy / Tachograf</Text>
                {cardExpiry ? (
                  <Text style={[s.docExpiry, { color: urgencyColor(cardDays) }]}>
                    Ważna do: {formatDate(cardExpiry)}
                    {cardDays !== null && (
                      <Text style={{ fontWeight: "700" }}>
                        {cardDays < 0 ? "  ⚠️ Wygasła" : cardDays <= 30 ? `  (${cardDays} dni)` : ""}
                      </Text>
                    )}
                  </Text>
                ) : (
                  <Text style={s.docMissing}>Brak danych</Text>
                )}
              </View>
              {cardDays !== null && (
                <View style={[s.docBadge, { backgroundColor: `${urgencyColor(cardDays)}22`, borderColor: `${urgencyColor(cardDays)}66` }]}>
                  <Text style={[s.docBadgeText, { color: urgencyColor(cardDays) }]}>
                    {cardDays < 0 ? "Wygasła" : `${cardDays} dni`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ─── Sekcja: Umowa ─── */}
        <View style={s.card}>
          <SectionHeader icon="📄" title="Umowa" />
          <View style={s.cardBody}>
            {employee?.contractFrom || employee?.contractTo || employee?.employmentType ? (
              <>
                {employee.employmentType && (
                  <DataRow label="Rodzaj umowy" value={employee.employmentType} />
                )}
                {employee.contractFrom && (
                  <DataRow label="Od" value={formatDate(employee.contractFrom)} />
                )}
                {employee.contractTo ? (
                  <DataRow
                    label="Do"
                    value={formatDate(employee.contractTo)}
                    valueColor={contractDays !== null && contractDays <= 30 ? urgencyColor(contractDays) : undefined}
                  />
                ) : (
                  <DataRow label="Do" value="Bezterminowa" />
                )}
                {contractDays !== null && contractDays <= 30 && contractDays >= 0 && (
                  <View style={s.contractWarning}>
                    <Text style={s.contractWarningText}>
                      ⚠️ Umowa wygasa za {contractDays} dni
                    </Text>
                  </View>
                )}
                {contractDays !== null && contractDays < 0 && (
                  <View style={[s.contractWarning, { backgroundColor: "rgba(248,113,113,0.1)", borderColor: "rgba(248,113,113,0.3)" }]}>
                    <Text style={[s.contractWarningText, { color: "#F87171" }]}>
                      ⚠️ Umowa wygasła
                    </Text>
                  </View>
                )}

                {/* Pliki umowy */}
                {contractFiles.length > 0 && (
                  <>
                    <View style={s.divider} />
                    <Text style={s.filesLabel}>📎 Pliki umowy</Text>
                    {contractFiles.map((f) => (
                      <TouchableOpacity
                        key={f.id}
                        style={s.fileRow}
                        onPress={() => openFile(f.fileUrl)}
                      >
                        <Text style={s.fileIcon}>
                          {f.fileType === "pdf" ? "📄" : f.fileType === "doc" || f.fileType === "docx" ? "📝" : "📎"}
                        </Text>
                        <Text style={s.fileName} numberOfLines={1}>{f.fileName}</Text>
                        <Text style={s.fileOpen}>Otwórz →</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            ) : (
              <EmptyState icon="📄" text="Brak danych umowy" />
            )}
          </View>
        </View>

        {/* ─── Sekcja: Urlop ─── */}
        <View style={s.card}>
          <SectionHeader icon="🏖️" title="Urlop" />
          <View style={s.cardBody}>
            {leaves.length === 0 ? (
              <EmptyState icon="🏖️" text="Brak zaplanowanych urlopów" />
            ) : (
              leaves.slice(0, 3).map((leave) => {
                const { label, color } = leaveStatusLabel(leave.status);
                return (
                  <View key={leave.id} style={s.leaveRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.leaveType}>{leave.type || "Urlop wypoczynkowy"}</Text>
                      <Text style={s.leaveDates}>
                        {formatDate(leave.dateFrom)} — {formatDate(leave.dateTo)}
                      </Text>
                    </View>
                    <View style={[s.leaveBadge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
                      <Text style={[s.leaveBadgeText, { color }]}>{label}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

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

// ─── Style ───────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D1B2A",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 10,
    gap: 8,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "#8899AA",
    fontSize: 14,
  },

  // ─── Karta ───
  card: {
    backgroundColor: "#1B2838",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    overflow: "hidden",
    marginBottom: 2,
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 2,
  },

  // ─── Nagłówek sekcji ───
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
    marginBottom: 2,
  },
  sectionIcon: {
    fontSize: 14,
  },
  sectionTitle: {
    color: "#F5A623",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // ─── Pusty stan ───
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  emptyIcon: {
    fontSize: 20,
    opacity: 0.4,
  },
  emptyText: {
    color: "#687076",
    fontSize: 13,
    fontStyle: "italic",
  },

  // ─── Wiersz danych ───
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D3D",
  },
  dataLabel: {
    color: "#8899AA",
    fontSize: 12,
  },
  dataValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
    marginLeft: 8,
  },

  // ─── Pojazd ───
  vehicleTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  vehicleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  vehicleIconText: {
    fontSize: 18,
  },
  vehicleName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  vehiclePlate: {
    color: "#F5A623",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },

  // ─── Dokumenty ───
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
  },
  docIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: "#1E2D3D",
    justifyContent: "center",
    alignItems: "center",
  },
  docIcon: {
    fontSize: 15,
  },
  docName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  docExpiry: {
    fontSize: 11,
    marginTop: 1,
  },
  docMissing: {
    color: "#687076",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 1,
  },
  docBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  docBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  docDivider: {
    height: 1,
    backgroundColor: "#1E2D3D",
    marginVertical: 2,
  },

  // ─── Umowa ───
  contractWarning: {
    backgroundColor: "rgba(245,166,35,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  contractWarningText: {
    color: "#F5A623",
    fontSize: 12,
    fontWeight: "600",
  },
  filesLabel: {
    color: "#8899AA",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 6,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D3D",
  },
  fileIcon: {
    fontSize: 16,
  },
  fileName: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
  },
  fileOpen: {
    color: "#F5A623",
    fontSize: 12,
    fontWeight: "600",
  },

  // ─── Urlop ───
  leaveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D3D",
  },
  leaveType: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  leaveDates: {
    color: "#8899AA",
    fontSize: 11,
    marginTop: 1,
  },
  leaveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  leaveBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },

  // ─── Divider ───
  divider: {
    height: 1,
    backgroundColor: "#2A3A4A",
    marginVertical: 5,
  },
  // ─── Stały dolny pasek nawigacji ───
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
  tileIcon: {
    fontSize: 20,
  },
  tileLabel: {
    color: "#8899AA",
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 12,
  },
  tileLabelActive: {
    color: "#F5A623",
  },
});
