import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../_layout";
import DriverHeader from "../../components/DriverHeader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { generateAndUploadLeaveDoc } from "../../lib/generateLeaveDoc";

// ─── Types ───────────────────────────────────────────────────
interface OccupiedRange {
  employeeId: string;
  employeeName: string;
  dateFrom: string;
  dateTo: string;
}

// ─── Helpers ─────────────────────────────────────────────────
function toDateObj(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    const d = parseInt(parts[2]);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
  }
  return null;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function countWorkdays(from: string, to: string): number {
  const start = toDateObj(from);
  const end = toDateObj(to);
  if (!start || !end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const MONTH_NAMES = [
  "Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
  "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień",
];
const DAY_NAMES_SHORT = ["Pn","Wt","Śr","Cz","Pt","Sb","Nd"];

// ─── Calendar Component ───────────────────────────────────────
function Calendar({
  year,
  month,
  selectedFrom,
  selectedTo,
  occupied,
  onSelectDate,
}: {
  year: number;
  month: number; // 0-indexed
  selectedFrom: string;
  selectedTo: string;
  occupied: OccupiedRange[];
  onSelectDate: (date: string) => void;
}) {
  // Build days array
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = lastDay.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function getOccupiedInfo(dateStr: string): string | null {
    for (const r of occupied) {
      const from = toDateObj(r.dateFrom);
      const to = toDateObj(r.dateTo);
      const d = toDateObj(dateStr);
      if (from && to && d && d >= from && d <= to) return r.employeeName;
    }
    return null;
  }

  function isSelected(dateStr: string): boolean {
    if (!selectedFrom) return false;
    if (!selectedTo) return dateStr === selectedFrom;
    const d = toDateObj(dateStr);
    const from = toDateObj(selectedFrom);
    const to = toDateObj(selectedTo);
    if (!d || !from || !to) return false;
    return d >= from && d <= to;
  }

  function isStart(dateStr: string): boolean { return dateStr === selectedFrom; }
  function isEnd(dateStr: string): boolean { return dateStr === selectedTo; }

  const today = toISODate(new Date());

  return (
    <View style={cs.calWrap}>
      {/* Day headers */}
      <View style={cs.calHeaderRow}>
        {DAY_NAMES_SHORT.map((d) => (
          <View key={d} style={cs.calHeaderCell}>
            <Text style={[cs.calHeaderText, d === "Sb" || d === "Nd" ? cs.weekend : null]}>{d}</Text>
          </View>
        ))}
      </View>
      {/* Cells */}
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={cs.calRow}>
          {cells.slice(week * 7, week * 7 + 7).map((day, idx) => {
            if (!day) return <View key={idx} style={cs.calCell} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const occupiedBy = getOccupiedInfo(dateStr);
            const selected = isSelected(dateStr);
            const start = isStart(dateStr);
            const end = isEnd(dateStr);
            const isToday = dateStr === today;
            const isWeekend = idx === 5 || idx === 6;
            const isPast = dateStr < today;

            return (
              <TouchableOpacity
                key={idx}
                style={[
                  cs.calCell,
                  selected && cs.calCellSelected,
                  (start || end) && cs.calCellEndpoint,
                  occupiedBy && !selected && cs.calCellOccupied,
                  isToday && !selected && cs.calCellToday,
                  isPast && cs.calCellPast,
                ]}
                onPress={() => !isPast && onSelectDate(dateStr)}
                disabled={isPast}
                activeOpacity={0.7}
              >
                <Text style={[
                  cs.calDayText,
                  selected && cs.calDayTextSelected,
                  isWeekend && !selected && cs.calDayWeekend,
                  isPast && cs.calDayPast,
                ]}>
                  {day}
                </Text>
                {occupiedBy && (
                  <Text style={cs.calOccupiedDot} numberOfLines={1}>●</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      {/* Legend */}
      {occupied.length > 0 && (
        <View style={cs.legendWrap}>
          <Text style={cs.legendTitle}>Zajęte terminy:</Text>
          {occupied.map((r, i) => (
            <Text key={i} style={cs.legendItem}>
              ● {r.employeeName}: {r.dateFrom} — {r.dateTo}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  calWrap: { marginTop: 8 },
  calHeaderRow: { flexDirection: "row", marginBottom: 4 },
  calHeaderCell: { flex: 1, alignItems: "center", paddingVertical: 4 },
  calHeaderText: { color: "#8899AA", fontSize: 11, fontWeight: "600" },
  weekend: { color: "#F5A623" },
  calRow: { flexDirection: "row", marginBottom: 2 },
  calCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    margin: 1,
    position: "relative",
  },
  calCellSelected: { backgroundColor: "rgba(245,166,35,0.25)" },
  calCellEndpoint: { backgroundColor: "#F5A623" },
  calCellOccupied: { backgroundColor: "rgba(248,113,113,0.15)" },
  calCellToday: { borderWidth: 1, borderColor: "#F5A623" },
  calCellPast: { opacity: 0.35 },
  calDayText: { color: "#FFFFFF", fontSize: 13, fontWeight: "500" },
  calDayTextSelected: { color: "#0D1B2A", fontWeight: "700" },
  calDayWeekend: { color: "#F5A623" },
  calDayPast: { color: "#4A5A6A" },
  calOccupiedDot: { color: "#F87171", fontSize: 7, position: "absolute", bottom: 1 },
  legendWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#2A3A4A" },
  legendTitle: { color: "#8899AA", fontSize: 11, fontWeight: "600", marginBottom: 4 },
  legendItem: { color: "#F87171", fontSize: 11, marginBottom: 2 },
});

// ─── Main Screen ─────────────────────────────────────────────
export default function WniosekUrlopowyScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const today = new Date();

  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedFrom, setSelectedFrom] = useState("");
  const [selectedTo, setSelectedTo] = useState("");
  const [reason, setReason] = useState("");
  const [leaveType, setLeaveType] = useState("Urlop wypoczynkowy");
  const [occupied, setOccupied] = useState<OccupiedRange[]>([]);
  const [employee, setEmployee] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const bottomPad = Platform.select({ web: 6, default: Math.max(insets.bottom, 8) });

  // Załaduj dane pracownika i zajęte terminy
  useEffect(() => {
    loadEmployee();
    loadOccupied();
  }, [user?.uid]);

  async function loadEmployee() {
    if (!user?.email && !user?.uid) return;
    try {
      if (user?.email) {
        const q = query(collection(db, "employees"), where("email", "==", user.email));
        const snap = await getDocs(q);
        if (!snap.empty) { setEmployee({ id: snap.docs[0].id, ...snap.docs[0].data() }); return; }
      }
      if (user?.uid) {
        const q = query(collection(db, "employees"), where("uid", "==", user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) { setEmployee({ id: snap.docs[0].id, ...snap.docs[0].data() }); }
      }
    } catch {}
  }

  async function loadOccupied() {
    try {
      const snap = await getDocs(query(
        collection(db, "leaveRequests"),
        where("status", "==", "approved")
      ));
      const ranges: OccupiedRange[] = snap.docs.map((d) => {
        const data = d.data();
        const name = data.employeeName || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "Pracownik";
        return {
          employeeId: data.employeeId || "",
          employeeName: name,
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
        };
      }).filter((r) => r.dateFrom && r.dateTo);
      setOccupied(ranges);
    } catch {}
  }

  function handleSelectDate(dateStr: string) {
    if (!selectedFrom || (selectedFrom && selectedTo)) {
      setSelectedFrom(dateStr);
      setSelectedTo("");
    } else {
      if (dateStr < selectedFrom) {
        setSelectedTo(selectedFrom);
        setSelectedFrom(dateStr);
      } else {
        setSelectedTo(dateStr);
      }
    }
  }

  const workdays = selectedFrom && selectedTo ? countWorkdays(selectedFrom, selectedTo) : 0;

  async function handleSubmit() {
    if (!selectedFrom || !selectedTo) {
      Alert.alert("Błąd", "Wybierz datę początku i końca urlopu.");
      return;
    }
    if (!employee) {
      Alert.alert("Błąd", "Nie znaleziono danych pracownika.");
      return;
    }

    setSubmitting(true);
    try {
      const empName = `${employee.firstName || ""} ${employee.lastName || ""}`.trim();
      const leaveData = {
        employeeId: employee.id,
        employeeEmail: user?.email || "",
        employeeName: empName,
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        dateFrom: selectedFrom,
        dateTo: selectedTo,
        type: leaveType,
        reason: reason.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
        workdays,
        position: employee.workType || employee.position || "Kierowca",
        companyName: "Blaktrans Logistics",
      };

      const docRef = await addDoc(collection(db, "leaveRequests"), leaveData);

      // Generuj dokument DOCX i uploaduj do Storage
      let docUrl = "";
      let docPath = "";
      try {
        const today2 = new Date();
        const todayStr = `${today2.getDate().toString().padStart(2,"0")}.${(today2.getMonth()+1).toString().padStart(2,"0")}.${today2.getFullYear()}`;
        // Wyodrębnij typ urlopu (np. "Urlop wypoczynkowy" -> "wypoczynkowy")
        const leaveTypeWord = leaveType
          .replace(/^urlop\s*/i, "")
          .trim() || "wypoczynkowy";
        docUrl = await generateAndUploadLeaveDoc({
          employeeId: employee.id,
          employeeName: empName,
          position: employee.workType || (employee as any).position || "Kierowca",
          companyName: "Blaktrans Logistics Sp. z o.o.",
          dateFrom: selectedFrom,
          dateTo: selectedTo,
          workdays,
          leaveType: leaveTypeWord,
          reason: reason.trim(),
          submittedAt: todayStr,
        }, docRef.id);
        // Zapisz URL dokumentu w rekordzie wniosku
        const { updateDoc, doc } = await import("firebase/firestore");
        await updateDoc(doc(db, "leaveRequests", docRef.id), { docUrl });
      } catch (docErr) {
        console.warn("Doc generation failed (non-critical):", docErr);
      }

      // Dodaj powiadomienie dla admina
      try {
        await addDoc(collection(db, "notifications"), {
          type: "leave_request",
          title: "Nowy wniosek urlopowy",
          message: `${empName} złożył wniosek urlopowy: ${selectedFrom} — ${selectedTo}`,
          leaveRequestId: docRef.id,
          employeeId: employee.id,
          employeeName: empName,
          forRole: "admin",
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch {}

      setSuccess(true);
      // Przekieruj po 2 sekundy
      setTimeout(() => {
        router.replace("/(driver)/sprawy" as any);
      }, 2000);
    } catch (err) {
      console.error("Submit error:", err);
      Alert.alert("Błąd", "Nie udało się złożyć wniosku. Spróbuj ponownie.");
    }
    setSubmitting(false);
  }

  if (success) {
    return (
      <View style={s.container}>
        <DriverHeader />
        <View style={s.successWrap}>
          <Text style={s.successIcon}>✅</Text>
          <Text style={s.successTitle}>Wniosek złożony!</Text>
          <Text style={s.successDesc}>Twój wniosek urlopowy został wysłany do administratora.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <DriverHeader />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomPad + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nagłówek */}
        <View style={s.pageHeader}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backBtnText}>← Wróć</Text>
          </TouchableOpacity>
          <Text style={s.pageTitle}>Wniosek urlopowy</Text>
        </View>

        {/* Typ urlopu */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Rodzaj urlopu</Text>
          <View style={s.typeRow}>
            {["Urlop wypoczynkowy", "Urlop na żądanie", "Urlop bezpłatny"].map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.typeBtn, leaveType === t && s.typeBtnActive]}
                onPress={() => setLeaveType(t)}
              >
                <Text style={[s.typeBtnText, leaveType === t && s.typeBtnTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Kalendarz */}
        <View style={s.card}>
          <View style={s.calNav}>
            <TouchableOpacity
              style={s.calNavBtn}
              onPress={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                else setCalMonth(m => m - 1);
              }}
            >
              <Text style={s.calNavText}>‹</Text>
            </TouchableOpacity>
            <Text style={s.calMonthLabel}>{MONTH_NAMES[calMonth]} {calYear}</Text>
            <TouchableOpacity
              style={s.calNavBtn}
              onPress={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                else setCalMonth(m => m + 1);
              }}
            >
              <Text style={s.calNavText}>›</Text>
            </TouchableOpacity>
          </View>

          <Calendar
            year={calYear}
            month={calMonth}
            selectedFrom={selectedFrom}
            selectedTo={selectedTo}
            occupied={occupied}
            onSelectDate={handleSelectDate}
          />

          {/* Instrukcja */}
          <Text style={s.calHint}>
            {!selectedFrom
              ? "Dotknij daty aby wybrać początek urlopu"
              : !selectedTo
              ? "Dotknij daty aby wybrać koniec urlopu"
              : `Wybrany zakres: ${selectedFrom} — ${selectedTo} (${workdays} dni roboczych)`}
          </Text>
        </View>

        {/* Wybrany zakres */}
        {selectedFrom && selectedTo && (
          <View style={s.card}>
            <Text style={s.cardLabel}>Wybrany termin</Text>
            <View style={s.rangeRow}>
              <View style={s.rangeBox}>
                <Text style={s.rangeLabel}>Od</Text>
                <Text style={s.rangeValue}>{selectedFrom}</Text>
              </View>
              <Text style={s.rangeDash}>—</Text>
              <View style={s.rangeBox}>
                <Text style={s.rangeLabel}>Do</Text>
                <Text style={s.rangeValue}>{selectedTo}</Text>
              </View>
              <View style={s.rangeBox}>
                <Text style={s.rangeLabel}>Dni rob.</Text>
                <Text style={[s.rangeValue, { color: "#F5A623" }]}>{workdays}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Uzasadnienie (opcjonalne) */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Uzasadnienie (opcjonalne)</Text>
          <TextInput
            style={s.textInput}
            value={reason}
            onChangeText={setReason}
            placeholder="Wpisz uzasadnienie..."
            placeholderTextColor="#4A5A6A"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Przycisk wyślij */}
        <TouchableOpacity
          style={[s.submitBtn, (!selectedFrom || !selectedTo || submitting) && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!selectedFrom || !selectedTo || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#0D1B2A" />
          ) : (
            <Text style={s.submitBtnText}>Wyślij wniosek urlopowy</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* ─── Stały dolny pasek nawigacji ─── */}
      <View style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity style={s.tile} activeOpacity={0.75} onPress={() => router.push("/(driver)/pojazd" as any)}>
          <Text style={s.tileIcon}>🚛</Text>
          <Text style={s.tileLabel}>Pojazd</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tile, s.tileActive]} activeOpacity={0.75} onPress={() => router.push("/(driver)/sprawy" as any)}>
          <Text style={s.tileIcon}>📋</Text>
          <Text style={[s.tileLabel, s.tileLabelActive]}>Sprawy{"\n"}Pracownicze</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.tile} activeOpacity={0.75} onPress={() => router.push("/(driver)/tachograf" as any)}>
          <Text style={s.tileIcon}>⏰</Text>
          <Text style={s.tileLabel}>Tachograf{"\n"}i Czas Pracy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.tile} activeOpacity={0.75} onPress={() => router.push("/(driver)/dashboard" as any)}>
          <Text style={s.tileIcon}>📊</Text>
          <Text style={s.tileLabel}>Statystyki</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Style ───────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  successIcon: { fontSize: 56 },
  successTitle: { color: "#4ADE80", fontSize: 22, fontWeight: "700" },
  successDesc: { color: "#8899AA", fontSize: 14, textAlign: "center" },

  pageHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  backBtn: { padding: 4 },
  backBtnText: { color: "#F5A623", fontSize: 14, fontWeight: "600" },
  pageTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },

  card: {
    backgroundColor: "#1B2838",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    padding: 14,
    gap: 10,
  },
  cardLabel: { color: "#8899AA", fontSize: 12, fontWeight: "600" },

  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    backgroundColor: "#0D1B2A",
  },
  typeBtnActive: { borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.15)" },
  typeBtnText: { color: "#8899AA", fontSize: 12, fontWeight: "600" },
  typeBtnTextActive: { color: "#F5A623" },

  calNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calNavBtn: { padding: 8 },
  calNavText: { color: "#F5A623", fontSize: 22, fontWeight: "700" },
  calMonthLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  calHint: { color: "#8899AA", fontSize: 11, textAlign: "center", marginTop: 4 },

  rangeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rangeBox: { flex: 1, alignItems: "center" },
  rangeLabel: { color: "#8899AA", fontSize: 11, fontWeight: "600" },
  rangeValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 2 },
  rangeDash: { color: "#8899AA", fontSize: 16 },

  textInput: {
    backgroundColor: "#0D1B2A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    color: "#FFFFFF",
    fontSize: 13,
    padding: 10,
    minHeight: 70,
  },

  submitBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#0D1B2A", fontSize: 15, fontWeight: "700" },

  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#0D1B2A",
    borderTopWidth: 1,
    borderTopColor: "#2A3A4A",
    paddingTop: 10,
    paddingHorizontal: 8,
    gap: 4,
  },
  tile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 4,
  },
  tileActive: {
    backgroundColor: "rgba(245,166,35,0.12)",
  },
  tileIcon: { fontSize: 24 },
  tileLabel: {
    color: "#8899AA",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 14,
  },
  tileLabelActive: {
    color: "#F5A623",
  },
});
