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
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../_layout";
import DriverHeader from "../../components/DriverHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

// ─── Types ───────────────────────────────────────────────────
interface Contract {
  id: string;
  employeeId: string;
  employmentType: string;
  contractFrom: string;
  contractTo: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  isActive?: boolean;
  createdAt?: any;
}

interface Employee {
  id: string;
  email: string;
  uid?: string;
}

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

function formatDate(raw: string | null | undefined): string {
  if (!raw || raw === "bezterminowa") return raw === "bezterminowa" ? "Bezterminowa" : "—";
  return raw;
}

function daysUntil(raw: string | null | undefined): number | null {
  const dt = parseDate(raw);
  if (!dt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((dt.getTime() - today.getTime()) / 86400000);
}

function urgencyColor(days: number | null): string {
  if (days === null) return "#687076";
  if (days < 0) return "#F87171";
  if (days <= 7) return "#F87171";
  if (days <= 30) return "#F5A623";
  return "#4ADE80";
}

function getFileIcon(type?: string) {
  if (type === "pdf") return "📄";
  if (type === "doc" || type === "docx") return "📝";
  return "📎";
}

// ─── Screen ──────────────────────────────────────────────────
export default function UmowaScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.uid || user?.email) loadContracts();
  }, [user?.uid]);

  async function loadContracts() {
    setLoading(true);
    setError("");
    try {
      // Znajdź employeeId dla zalogowanego użytkownika
      let empId: string | null = null;

      if (user?.email) {
        try {
          const q = query(collection(db, "employees"), where("email", "==", user.email.toLowerCase()));
          const snap = await getDocs(q);
          if (!snap.empty) empId = snap.docs[0].id;
        } catch {}
      }

      if (!empId && user?.uid) {
        try {
          const q = query(collection(db, "employees"), where("uid", "==", user.uid));
          const snap = await getDocs(q);
          if (!snap.empty) empId = snap.docs[0].id;
        } catch {}
      }

      if (!empId) {
        setError("Nie znaleziono danych pracownika.");
        setLoading(false);
        return;
      }

      // Pobierz umowy z kolekcji contracts
      let contractList: Contract[] = [];
      try {
        const q = query(
          collection(db, "contracts"),
          where("employeeId", "==", empId),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        contractList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contract));
      } catch {
        try {
          const q = query(collection(db, "contracts"), where("employeeId", "==", empId));
          const snap = await getDocs(q);
          contractList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contract));
        } catch {}
      }

      setContracts(contractList);
    } catch (e: any) {
      setError("Błąd ładowania umów: " + (e.message || e));
    }
    setLoading(false);
  }

  function openFile(url: string) {
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      import("expo-linking").then(({ openURL }) => openURL(url)).catch(() => {});
    }
  }

  // Podziel umowy na aktywne i archiwalne
  const activeContracts = contracts.filter((c) => c.isActive !== false);
  const archivedContracts = contracts.filter((c) => c.isActive === false);

  return (
    <View style={s.container}>
      <DriverHeader />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Nagłówek */}
        <View style={s.pageHeader}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>← Wróć</Text>
          </TouchableOpacity>
          <Text style={s.pageTitle}>📄 Moja umowa</Text>
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color="#F5A623" />
            <Text style={s.loadingText}>Ładowanie umów...</Text>
          </View>
        ) : error ? (
          <View style={s.errorWrap}>
            <Text style={s.errorText}>⚠️ {error}</Text>
          </View>
        ) : (
          <>
            {/* ─── Aktualna umowa ─── */}
            <Text style={s.sectionTitle}>📋 Aktualna umowa</Text>
            {activeContracts.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyIcon}>📄</Text>
                <Text style={s.emptyTitle}>Brak aktywnej umowy</Text>
                <Text style={s.emptyDesc}>Administrator nie dodał jeszcze Twojej umowy.</Text>
              </View>
            ) : (
              activeContracts.map((c) => {
                const days = daysUntil(c.contractTo);
                const color = urgencyColor(days);
                return (
                  <View key={c.id} style={s.contractCard}>
                    <View style={s.contractHeader}>
                      <View style={s.activeBadge}>
                        <Text style={s.activeBadgeText}>✓ Aktywna</Text>
                      </View>
                    </View>
                    <View style={s.detailsBlock}>
                      <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Rodzaj umowy</Text>
                        <Text style={s.detailValue}>{c.employmentType || "—"}</Text>
                      </View>
                      <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Obowiązuje od</Text>
                        <Text style={s.detailValue}>{formatDate(c.contractFrom)}</Text>
                      </View>
                      <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Obowiązuje do</Text>
                        <Text style={[s.detailValue, days !== null && days <= 30 && { color, fontWeight: "700" }]}>
                          {c.contractTo === "bezterminowa" ? "Bezterminowa" : formatDate(c.contractTo)}
                        </Text>
                      </View>
                      {days !== null && days >= 0 && days <= 30 && (
                        <View style={[s.warningBanner, { borderColor: `${color}55`, backgroundColor: `${color}11` }]}>
                          <Text style={[s.warningText, { color }]}>⚠️ Umowa wygasa za {days} dni</Text>
                        </View>
                      )}
                      {days !== null && days < 0 && (
                        <View style={[s.warningBanner, { borderColor: "#F8717155", backgroundColor: "#F8717111" }]}>
                          <Text style={[s.warningText, { color: "#F87171" }]}>⚠️ Umowa wygasła</Text>
                        </View>
                      )}
                    </View>

                    {/* Plik umowy */}
                    {c.fileUrl ? (
                      <View style={s.fileSection}>
                        <Text style={s.fileSectionTitle}>📎 Plik umowy</Text>
                        <TouchableOpacity
                          style={s.downloadBtn}
                          onPress={() => openFile(c.fileUrl!)}
                          activeOpacity={0.8}
                        >
                          <Text style={s.downloadBtnIcon}>{getFileIcon(c.fileType)}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={s.downloadBtnName} numberOfLines={1}>{c.fileName || "Plik umowy"}</Text>
                            <Text style={s.downloadBtnType}>{c.fileType?.toUpperCase() || "PLIK"}</Text>
                          </View>
                          <Text style={s.downloadBtnAction}>Pobierz →</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={s.noFileNote}>
                        <Text style={s.noFileText}>Brak pliku umowy — skontaktuj się z administratorem.</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {/* ─── Archiwum umów ─── */}
            <Text style={[s.sectionTitle, { marginTop: 24 }]}>🗂 Archiwum poprzednich umów</Text>
            {archivedContracts.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyIcon}>🗂</Text>
                <Text style={s.emptyTitle}>Brak archiwalnych umów</Text>
                <Text style={s.emptyDesc}>Poprzednie zakończone umowy pojawią się tutaj.</Text>
              </View>
            ) : (
              archivedContracts.map((c) => (
                <View key={c.id} style={[s.contractCard, s.contractCardArchived]}>
                  <View style={s.contractHeader}>
                    <View style={s.archivedBadge}>
                      <Text style={s.archivedBadgeText}>Zakończona</Text>
                    </View>
                  </View>
                  <View style={s.detailsBlock}>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Rodzaj umowy</Text>
                      <Text style={s.detailValue}>{c.employmentType || "—"}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Od</Text>
                      <Text style={s.detailValue}>{formatDate(c.contractFrom)}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Do</Text>
                      <Text style={s.detailValue}>
                        {c.contractTo === "bezterminowa" ? "Bezterminowa" : formatDate(c.contractTo)}
                      </Text>
                    </View>
                  </View>
                  {c.fileUrl ? (
                    <View style={s.fileSection}>
                      <TouchableOpacity
                        style={s.downloadBtnSmall}
                        onPress={() => openFile(c.fileUrl!)}
                        activeOpacity={0.8}
                      >
                        <Text style={s.downloadBtnSmallIcon}>{getFileIcon(c.fileType)}</Text>
                        <Text style={s.downloadBtnSmallName} numberOfLines={1}>{c.fileName || "Plik umowy"}</Text>
                        <Text style={s.downloadBtnSmallAction}>Pobierz →</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(245,166,35,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
  },
  backBtnText: { color: "#F5A623", fontSize: 13, fontWeight: "700" },
  pageTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  loadingText: { color: "#8899AA", marginTop: 12, fontSize: 14 },
  errorWrap: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
  },
  errorText: { color: "#F87171", fontSize: 14 },
  sectionTitle: { color: "#F5A623", fontSize: 14, fontWeight: "700", marginBottom: 12 },
  emptyCard: {
    backgroundColor: "#162030",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E2D3D",
    marginBottom: 12,
  },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  emptyDesc: { color: "#8899AA", fontSize: 13, textAlign: "center" },
  contractCard: {
    backgroundColor: "#162030",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1E2D3D",
  },
  contractCardArchived: {
    opacity: 0.75,
    borderColor: "#1A2A3A",
  },
  contractHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(74,222,128,0.15)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.4)",
  },
  activeBadgeText: { color: "#4ADE80", fontSize: 12, fontWeight: "700" },
  archivedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(136,153,170,0.1)",
    borderWidth: 1,
    borderColor: "rgba(136,153,170,0.3)",
  },
  archivedBadgeText: { color: "#8899AA", fontSize: 12, fontWeight: "700" },
  detailsBlock: {
    backgroundColor: "#0D1B2A",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D3D",
  },
  detailLabel: { color: "#8899AA", fontSize: 13 },
  detailValue: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  warningBanner: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  warningText: { fontSize: 13, fontWeight: "700" },
  fileSection: {
    marginTop: 4,
  },
  fileSectionTitle: { color: "#8899AA", fontSize: 12, fontWeight: "700", marginBottom: 8 },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(245,166,35,0.1)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.35)",
  },
  downloadBtnIcon: { fontSize: 22 },
  downloadBtnName: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  downloadBtnType: { color: "#8899AA", fontSize: 11 },
  downloadBtnAction: { color: "#F5A623", fontSize: 13, fontWeight: "700" },
  downloadBtnSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(136,153,170,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  downloadBtnSmallIcon: { fontSize: 16 },
  downloadBtnSmallName: { flex: 1, color: "#CCDDEE", fontSize: 12 },
  downloadBtnSmallAction: { color: "#8899AA", fontSize: 12, fontWeight: "700" },
  noFileNote: {
    paddingVertical: 8,
  },
  noFileText: { color: "#4A5568", fontSize: 12, fontStyle: "italic" },
});
