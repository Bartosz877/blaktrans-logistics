import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter as _useRouter } from "expo-router";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db, storage, secondaryAuth } from "../../lib/firebase";
import { createUserWithEmailAndPassword, signOut as secondarySignOut } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useRef } from "react";
import AdminHeader from "../../components/AdminHeader";
import AdminBottomNav from "../../components/AdminBottomNav";
import { notifyLeaveApproved, notifyLeaveRejected, notifyEmployeeAdded, notifyContractAdded } from "../../lib/notifications";
import { pushContractAdded } from "../../lib/pushNotifications";
import { deleteUserAccount, suspendUserAccount, unsuspendUserAccount } from "../../lib/adminAuth";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

// ─── Types ───────────────────────────────────────────────────
interface Employee {
  id: string;
  uid?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  phone: string;
  employmentType: string;
  workType: string;
  birthDate?: string;
  contractFrom?: string;
  contractTo?: string;
  driverLicenseExpiry: string;
  driverCardExpiry: string;
  suspended?: boolean;
}

interface ContractFile {
  id: string;
  employeeId: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  uploadedAt: any;
  fileType: string;
}

interface Contract {
  id: string;
  employeeId: string;
  employeeName?: string;
  employmentType: string;
  contractFrom: string;
  contractTo: string; // "bezterminowa" or DD.MM.RRRR
  fileUrl?: string;
  fileName?: string;
  storagePath?: string;
  fileType?: string;
  createdAt?: any;
  isActive?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────
function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "aktywny":
    case "active":
      return "#4ADE80";
    case "urlop":
    case "leave":
    case "na urlopie":
      return "#F5A623";
    case "l4":
    case "sick":
      return "#F87171";
    case "nieaktywny":
    case "inactive":
      return "#687076";
    default:
      return "#8899AA";
  }
}

function getStatusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case "active": return "Aktywny";
    case "leave":
    case "on_leave": return "Urlop";
    case "sick":
    case "l4": return "L4";
    case "inactive": return "Nieaktywny";
    default: return status || "Aktywny";
  }
}

// Mapowanie stanowiska na rolę Firebase
function workTypeToRole(workType: string): string {
  switch (workType) {
    case "Administrator": return "ADMIN";
    case "Dygacz": return "dygacz";
    case "Kierowca":
    default: return "DRIVER";
  }
}

// ─── Formularz ────────────────────────────────────────────────
const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  workType: "Kierowca",
  birthDate: "",
  driverLicenseExpiry: "",
  driverCardExpiry: "",
  status: "Aktywny",
  password: "",
  passwordConfirm: "",
};

// Tylko 3 role zgodnie z wymaganiami
const WORK_TYPE_OPTIONS = ["Kierowca", "Dygacz", "Administrator"];
const EMPLOYMENT_OPTIONS = ["umowa o pracę", "B2B", "umowa zlecenie", "umowa o dzieło"];
const STATUS_OPTIONS = ["Aktywny", "Nieaktywny", "Na urlopie", "L4"];

// ─── Pole formularza ─────────────────────────────────────────
function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  required = false,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  required?: boolean;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={ms.fieldWrap}>
      <Text style={ms.fieldLabel}>{label}{required ? " *" : ""}</Text>
      <TextInput
        style={ms.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#4A6080"
        keyboardType={keyboardType}
        autoCapitalize="none"
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}

// ─── Dropdown selector ────────────────────────────────────────
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={ms.fieldWrap}>
      <Text style={ms.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={ms.selectBtn}
        onPress={() => setOpen(true)}
      >
        <Text style={ms.selectBtnText}>{value}</Text>
        <Text style={ms.selectArrow}>▼</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={ms.selectOverlay} onPress={() => setOpen(false)}>
          <View style={ms.selectBox}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[ms.selectOption, value === opt && ms.selectOptionActive]}
                onPress={() => { onChange(opt); setOpen(false); }}
              >
                <Text style={[ms.selectOptionText, value === opt && ms.selectOptionTextActive]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Modal potwierdzenia usunięcia (zamiast Alert.alert) ──────
function DeleteConfirmModal({
  visible,
  name,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={dc.overlay} onPress={onCancel}>
        <View style={dc.box}>
          <Text style={dc.icon}>🗑</Text>
          <Text style={dc.title}>Usuń pracownika</Text>
          <Text style={dc.desc}>Czy na pewno chcesz usunąć{"\n"}<Text style={dc.name}>{name}</Text>?</Text>
          <Text style={dc.warning}>Tej operacji nie można cofnąć.</Text>
          <View style={dc.btns}>
            <TouchableOpacity style={dc.cancelBtn} onPress={onCancel}>
              <Text style={dc.cancelText}>Anuluj</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dc.deleteBtn} onPress={onConfirm}>
              <Text style={dc.deleteText}>Usuń</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Modal formularza (Dodaj / Edytuj) ────────────────────────
function EmployeeFormModal({
  visible,
  onClose,
  onSaved,
  editEmployee,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editEmployee?: Employee | null;
}) {
  const isEdit = !!editEmployee;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (editEmployee) {
      setForm({
        firstName: editEmployee.firstName || "",
        lastName: editEmployee.lastName || "",
        email: editEmployee.email || "",
        phone: editEmployee.phone || "",
        workType: editEmployee.workType || "Kierowca",
        birthDate: editEmployee.birthDate || "",
        driverLicenseExpiry: editEmployee.driverLicenseExpiry || "",
        driverCardExpiry: editEmployee.driverCardExpiry || "",
        status: editEmployee.status || "Aktywny",
        password: "",
        passwordConfirm: "",
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setErrorMsg("");
  }, [editEmployee, visible]);

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setErrorMsg("Imię i nazwisko są wymagane.");
      return;
    }
    if (!form.email.trim()) {
      setErrorMsg("Email jest wymagany.");
      return;
    }
    // Walidacja hasła tylko przy tworzeniu nowego użytkownika
    if (!isEdit) {
      if (!form.password) {
        setErrorMsg("Hasło jest wymagane przy tworzeniu konta.");
        return;
      }
      if (form.password.length < 6) {
        setErrorMsg("Hasło musi mieć co najmniej 6 znaków.");
        return;
      }
      if (form.password !== form.passwordConfirm) {
        setErrorMsg("Hasła nie są zgodne.");
        return;
      }
    }
    setErrorMsg("");
    setSaving(true);
    try {
      const role = workTypeToRole(form.workType);
      const emailLower = form.email.trim().toLowerCase();
      const data = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        email: emailLower,
        phone: form.phone.trim(),
        workType: form.workType,
        birthDate: form.birthDate.trim(),
        driverLicenseExpiry: form.driverLicenseExpiry.trim(),
        driverCardExpiry: form.driverCardExpiry.trim(),
        status: form.status,
        role,
        updatedAt: serverTimestamp(),
      };

      if (isEdit && editEmployee) {
        // Edycja: tylko aktualizuj dane pracownika (bez zmiany hasła)
        await updateDoc(doc(db, "employees", editEmployee.id), data);
      } else {
        // Nowy pracownik: utwórz konto Firebase Auth używając SECONDARY auth
        // (secondaryAuth nie zmienia sesji aktualnie zalogowanego admina)
        const cred = await createUserWithEmailAndPassword(
          secondaryAuth,
          emailLower,
          form.password
        );
        const uid = cred.user.uid;

        // Wyloguj z secondary auth — nie potrzebujemy tej sesji
        try { await secondarySignOut(secondaryAuth); } catch {}

        // Utwórz dokument w kolekcji employees z uid
        const empRef = await addDoc(collection(db, "employees"), {
          ...data,
          uid,
          createdAt: serverTimestamp(),
        });

        // Utwórz dokument w kolekcji users (wymagany przez _layout.tsx)
        await setDoc(doc(db, "users", uid), {
          uid,
          email: emailLower,
          role,
          name: `${form.firstName.trim()} ${form.lastName.trim()}`,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
          employeeId: empRef.id,
          createdAt: serverTimestamp(),
        });
      }

      onSaved();
      onClose();
    } catch (e: any) {
      // Przyjazne komunikaty błędów Firebase Auth
      const code = e?.code || "";
      if (code === "auth/email-already-in-use") {
        setErrorMsg("Ten adres email jest już zarejestrowany w systemie.");
      } else if (code === "auth/invalid-email") {
        setErrorMsg("Nieprawidłowy format adresu email.");
      } else if (code === "auth/weak-password") {
        setErrorMsg("Hasło jest zbyt słabe. Użyj co najmniej 6 znaków.");
      } else {
        setErrorMsg("Nie udało się zapisać: " + (e.message || e));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#0D1B2A" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Nagłówek modalu */}
        <View style={ms.modalHeader}>
          <Text style={ms.modalTitle}>{isEdit ? "Edytuj pracownika" : "Dodaj pracownika"}</Text>
          <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
            <Text style={ms.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={ms.scroll}
          contentContainerStyle={ms.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {errorMsg ? (
            <View style={ms.errorBox}>
              <Text style={ms.errorText}>⚠️ {errorMsg}</Text>
            </View>
          ) : null}

          {/* Dane osobowe */}
          <FormField label="Imię" value={form.firstName} onChangeText={(v) => setField("firstName", v)} placeholder="Imię" required />
          <FormField label="Nazwisko" value={form.lastName} onChangeText={(v) => setField("lastName", v)} placeholder="Nazwisko" required />
          <FormField label="Email * (login)" value={form.email} onChangeText={(v) => setField("email", v)} placeholder="email@firma.pl" keyboardType="email-address" />
          <FormField label="Telefon" value={form.phone} onChangeText={(v) => setField("phone", v)} placeholder="Numer telefonu" keyboardType="phone-pad" />

          {/* Hasło — tylko przy tworzeniu nowego konta */}
          {!isEdit && (
            <>
              <View style={ms.sectionHeader}>
                <Text style={ms.sectionIcon}>🔐</Text>
                <Text style={ms.sectionTitle}>Hasło do konta</Text>
              </View>
              <FormField
                label="Hasło *"
                value={form.password}
                onChangeText={(v) => setField("password", v)}
                placeholder="Min. 6 znaków"
                secureTextEntry
                required
              />
              <FormField
                label="Powtórz hasło *"
                value={form.passwordConfirm}
                onChangeText={(v) => setField("passwordConfirm", v)}
                placeholder="Powtórz hasło"
                secureTextEntry
                required
              />
            </>
          )}

          {/* Stanowisko — tylko 3 opcje */}
          <SelectField label="Stanowisko" value={form.workType} options={WORK_TYPE_OPTIONS} onChange={(v) => setField("workType", v)} />

          {/* Data urodzenia */}
          <FormField label="Data urodzenia" value={form.birthDate} onChangeText={(v) => setField("birthDate", v)} placeholder="DD.MM.RRRR" />

          {/* Ważność dokumentów */}
          <View style={ms.sectionHeader}>
            <Text style={ms.sectionIcon}>📄</Text>
            <Text style={ms.sectionTitle}>Ważność dokumentów i uprawnień</Text>
          </View>

          <FormField label="Prawo jazdy / Kod 95 (ważne do)" value={form.driverLicenseExpiry} onChangeText={(v) => setField("driverLicenseExpiry", v)} placeholder="DD.MM.RRRR" />
          <FormField label="Karta Kierowcy / Tachograf (ważna do)" value={form.driverCardExpiry} onChangeText={(v) => setField("driverCardExpiry", v)} placeholder="DD.MM.RRRR" />

          {/* Status */}
          <Text style={ms.statusLabel}>Status</Text>
          <View style={ms.statusRow}>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[ms.statusChip, form.status === opt && ms.statusChipActive]}
                onPress={() => setField("status", opt)}
              >
                <Text style={[ms.statusChipText, form.status === opt && ms.statusChipTextActive]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 20 }} />

          {/* Przyciski */}
          <TouchableOpacity
            style={ms.saveBtn}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#0D1B2A" size="small" />
            ) : (
              <Text style={ms.saveBtnText}>
                {isEdit ? "✏️ Zapisz zmiany" : "✅ Dodaj pracownika"}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={ms.cancelBtn} onPress={onClose}>
            <Text style={ms.cancelBtnText}>Anuluj</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Karta pracownika ─────────────────────────────────────────
function EmployeeCard({
  emp,
  onEdit,
  onDelete,
  onSuspend,
  onUnsuspend,
}: {
  emp: Employee;
  onEdit: () => void;
  onDelete: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
}) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const statusColor = getStatusColor(emp.status);
  const statusLabel = getStatusLabel(emp.status);
  const fullName = emp.firstName && emp.lastName
    ? `${emp.firstName} ${emp.lastName}`
    : emp.firstName || emp.lastName || "—";

  // Kolor stanowiska: Dygacz różowy, Kierowca niebieski, Administrator czerwony
  const roleColor = (() => {
    const wt = (emp.workType || "").toLowerCase();
    if (wt === "dygacz") return "#F472B6";
    if (wt === "administrator") return "#F87171";
    return "#60A5FA"; // Kierowca — niebieski
  })();

  function handleDeletePress(e: any) {
    e.stopPropagation?.();
    setShowDeleteModal(true);
  }

  function handleConfirmDelete() {
    setShowDeleteModal(false);
    onDelete();
  }

  function handleSuspendPress(e: any) {
    e.stopPropagation?.();
    if (emp.suspended) {
      onUnsuspend();
    } else {
      onSuspend();
    }
  }

  return (
    <>
      <TouchableOpacity style={s.empCard} onPress={onEdit} activeOpacity={0.8}>
        {/* Avatar */}
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {(emp.firstName?.[0] || "?").toUpperCase()}
            {(emp.lastName?.[0] || "").toUpperCase()}
          </Text>
        </View>

        <View style={s.empInfo}>
          <Text style={s.empName}>{fullName}</Text>
          <Text style={[s.empRole, { color: roleColor }]}>{emp.workType || "—"}</Text>
          {emp.email ? <Text style={s.empEmail}>{emp.email}</Text> : null}
          {emp.phone ? <Text style={s.empPhone}>📞 {emp.phone}</Text> : null}
          <View style={s.empTagsRow}>
            {emp.employmentType ? (
              <View style={s.tag}>
                <Text style={s.tagText}>{emp.employmentType}</Text>
              </View>
            ) : null}
            {emp.driverLicenseExpiry ? (
              <View style={[s.tag, s.tagDoc]}>
                <Text style={s.tagText}>PJ: {emp.driverLicenseExpiry}</Text>
              </View>
            ) : null}
            {emp.driverCardExpiry ? (
              <View style={[s.tag, s.tagDoc]}>
                <Text style={s.tagText}>KK: {emp.driverCardExpiry}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.empActions}>
          <View style={[s.statusBadge, { borderColor: statusColor }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <TouchableOpacity
            style={[s.suspendBtn, emp.suspended && s.suspendBtnActive]}
            onPress={handleSuspendPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={s.suspendBtnText}>{emp.suspended ? "🔓" : "🔒"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.deleteBtn}
            onPress={handleDeletePress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={s.deleteBtnText}>🗑</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Modal potwierdzenia usunięcia */}
      <DeleteConfirmModal
        visible={showDeleteModal}
        name={fullName}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </>
  );
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

function formatDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  return raw;
}

// ─── Typy dla zakładek ────────────────────────────────────────
interface ScheduleEntry {
  id?: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  status: "praca" | "urlop" | "l4" | "wolne";
}

interface LeaveRequest {
  id: string;
  employeeId?: string;
  employeeName?: string;
  employeeEmail?: string;
  firstName?: string;
  lastName?: string;
  dateFrom: string;
  dateTo: string;
  type?: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  createdAt?: any;
  docUrl?: string;
}

// ─── Zakładka Grafik ──────────────────────────────────────────
function GrafikTab({ employees }: { employees: Employee[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [schedule, setSchedule] = useState<Record<string, string>>({}); // date -> status
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  // Lokalny stan zmian (niezapisanych) — kopia robocza
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

  const MONTH_NAMES = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
    "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  const DAY_NAMES = ["Pn","Wt","Śr","Cz","Pt","Sb","Nd"];

  // Załaduj grafik dla wybranego pracownika i miesiąca
  useEffect(() => {
    if (!selectedEmp) return;
    loadSchedule();
  }, [selectedEmp, year, month]);

  async function loadSchedule() {
    if (!selectedEmp) return;
    setLoading(true);
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
      const snap = await getDocs(
        query(
          collection(db, "schedule"),
          where("employeeId", "==", selectedEmp.id),
          where("month", "==", monthStr)
        )
      );
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.date) map[data.date] = data.status;
      });
      setSchedule(map);
    } catch {
      // Fallback — załaduj wszystko dla pracownika
      try {
        const snap = await getDocs(
          query(collection(db, "schedule"), where("employeeId", "==", selectedEmp.id))
        );
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.date) map[data.date] = data.status;
        });
        setSchedule(map);
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  // Zmiana dnia — tylko lokalnie (nie zapisuje od razu do Firebase)
  function setDayStatus(dateStr: string, status: string) {
    setSchedule((prev) => ({ ...prev, [dateStr]: status }));
    setPendingChanges((prev) => ({ ...prev, [dateStr]: status }));
  }

  // Zbiorczy zapis wszystkich zmian do Firebase
  async function saveSchedule() {
    if (!selectedEmp || Object.keys(pendingChanges).length === 0) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
      const writes = Object.entries(pendingChanges).map(([dateStr, status]) => {
        const docId = `${selectedEmp.id}_${dateStr}`;
        return setDoc(doc(db, "schedule", docId), {
          employeeId: selectedEmp.id,
          employeeName: `${selectedEmp.firstName || ""} ${selectedEmp.lastName || ""}`.trim(),
          date: dateStr,
          month: monthStr,
          status,
          updatedAt: serverTimestamp(),
        });
      });
      await Promise.all(writes);
      setPendingChanges({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {}
    setSaving(false);
  }

  // Generuj dni miesiąca
  function getDaysInMonth() {
    const days: { date: Date; dateStr: string; dayOfWeek: number }[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      // 0=Nd, 1=Pn, ..., 6=Sb -> konwertuj na 0=Pn, ..., 6=Nd
      const dow = (date.getDay() + 6) % 7;
      days.push({ date, dateStr, dayOfWeek: dow });
    }
    return days;
  }

  const days = getDaysInMonth();
  const firstDow = days[0]?.dayOfWeek ?? 0;

  function getStatusStyle(status: string) {
    switch (status) {
      case "praca": return { bg: "rgba(74,222,128,0.18)", border: "rgba(74,222,128,0.4)", color: "#4ADE80" };
      case "urlop": return { bg: "rgba(245,166,35,0.18)", border: "rgba(245,166,35,0.4)", color: "#F5A623" };
      case "l4": return { bg: "rgba(248,113,113,0.18)", border: "rgba(248,113,113,0.4)", color: "#F87171" };
      default: return { bg: "transparent", border: "#2A3A4A", color: "#687076" };
    }
  }

  const STATUS_CYCLE: ("praca" | "urlop" | "l4" | "wolne")[] = ["praca", "urlop", "l4", "wolne"];

  function cycleStatus(dateStr: string) {
    const current = schedule[dateStr] || "wolne";
    const idx = STATUS_CYCLE.indexOf(current as any);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    setDayStatus(dateStr, next);
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      {/* Wybór pracownika */}
      <View style={gt.section}>
        <Text style={gt.sectionTitle}>👤 Pracownik</Text>
        <TouchableOpacity style={gt.pickerBtn} onPress={() => setShowEmpPicker(true)}>
          <Text style={gt.pickerBtnText}>
            {selectedEmp
              ? `${selectedEmp.firstName || ""} ${selectedEmp.lastName || ""}`.trim()
              : "Wybierz pracownika..."}
          </Text>
          <Text style={gt.pickerArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Wybór miesiąca */}
      <View style={gt.monthRow}>
        <TouchableOpacity
          style={gt.monthBtn}
          onPress={() => {
            if (month === 0) { setMonth(11); setYear(y => y - 1); }
            else setMonth(m => m - 1);
          }}
        >
          <Text style={gt.monthBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={gt.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity
          style={gt.monthBtn}
          onPress={() => {
            if (month === 11) { setMonth(0); setYear(y => y + 1); }
            else setMonth(m => m + 1);
          }}
        >
          <Text style={gt.monthBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Legenda */}
      <View style={gt.legend}>
        {[{s:"praca",l:"Praca"},{s:"urlop",l:"Urlop"},{s:"l4",l:"L4"},{s:"wolne",l:"Wolne"}].map(({s,l}) => {
          const st = getStatusStyle(s);
          return (
            <View key={s} style={gt.legendItem}>
              <View style={[gt.legendDot, { backgroundColor: st.color }]} />
              <Text style={gt.legendText}>{l}</Text>
            </View>
          );
        })}
      </View>

      {/* Kalendarz */}
      {!selectedEmp ? (
        <View style={gt.emptyWrap}>
          <Text style={gt.emptyIcon}>📅</Text>
          <Text style={gt.emptyText}>Wybierz pracownika, aby zobaczyć grafik</Text>
        </View>
      ) : loading ? (
        <View style={gt.emptyWrap}>
          <ActivityIndicator color="#F5A623" />
          <Text style={gt.emptyText}>Ładowanie grafiku...</Text>
        </View>
      ) : (
        <View style={gt.calendarWrap}>
          {/* Nagłówki dni tygodnia */}
          <View style={gt.calHeader}>
            {DAY_NAMES.map((d) => (
              <View key={d} style={gt.calHeaderCell}>
                <Text style={gt.calHeaderText}>{d}</Text>
              </View>
            ))}
          </View>
          {/* Siatka dni */}
          <View style={gt.calGrid}>
            {/* Puste komórki przed pierwszym dniem */}
            {Array.from({ length: firstDow }).map((_, i) => (
              <View key={`empty-${i}`} style={gt.calCell} />
            ))}
            {days.map(({ dateStr, date, dayOfWeek }) => {
              const status = schedule[dateStr] || "wolne";
              const st = getStatusStyle(status);
              const isToday = dateStr === `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
              const isWeekend = dayOfWeek >= 5;
              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    gt.calCell,
                    { backgroundColor: st.bg, borderColor: st.border },
                    isToday && gt.calCellToday,
                  ]}
                  onPress={() => cycleStatus(dateStr)}
                  disabled={saving}
                >
                  <Text style={[
                    gt.calCellNum,
                    { color: isWeekend ? "#F87171" : (status !== "wolne" ? st.color : "#8899AA") },
                    isToday && { fontWeight: "900" },
                  ]}>
                    {date.getDate()}
                  </Text>
                  {status !== "wolne" && (
                    <Text style={[gt.calCellStatus, { color: st.color }]}>
                      {status === "praca" ? "P" : status === "urlop" ? "U" : "L4"}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Przycisk Zapisz grafik */}
      {selectedEmp && (
        <View style={gt.saveSection}>
          {saveSuccess && (
            <View style={gt.successRow}>
              <Text style={gt.successText}>✅ Grafik zapisany pomyślnie!</Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              gt.saveBtn,
              Object.keys(pendingChanges).length === 0 && gt.saveBtnDisabled,
            ]}
            onPress={saveSchedule}
            disabled={saving || Object.keys(pendingChanges).length === 0}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#0D1B2A" />
            ) : (
              <Text style={gt.saveBtnText}>
                💾 Zapisz grafik
                {Object.keys(pendingChanges).length > 0
                  ? ` (${Object.keys(pendingChanges).length} zmian)`
                  : ""}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Modal wyboru pracownika */}
      <Modal visible={showEmpPicker} transparent animationType="fade" onRequestClose={() => setShowEmpPicker(false)}>
        <Pressable style={gt.pickerOverlay} onPress={() => setShowEmpPicker(false)}>
          <View style={gt.pickerBox}>
            <Text style={gt.pickerTitle}>Wybierz pracownika</Text>
            <ScrollView>
              {employees.map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  style={[
                    gt.pickerItem,
                    selectedEmp?.id === emp.id && gt.pickerItemActive,
                  ]}
                  onPress={() => { setSelectedEmp(emp); setShowEmpPicker(false); }}
                >
                  <View style={gt.pickerAvatar}>
                    <Text style={gt.pickerAvatarText}>
                      {(emp.firstName?.[0] || "?").toUpperCase()}
                      {(emp.lastName?.[0] || "").toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={gt.pickerItemName}>
                      {`${emp.firstName || ""} ${emp.lastName || ""}`.trim()}
                    </Text>
                    <Text style={[gt.pickerItemRole, {
                      color: (emp.workType || "").toLowerCase() === "dygacz" ? "#F472B6"
                           : (emp.workType || "").toLowerCase() === "administrator" ? "#F87171"
                           : "#60A5FA"
                    }]}>{emp.workType || "—"}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ─── Zakładka Urlopy ─────────────────────────────────────────────────
function UrlopTab({ initialLeaveId, onLeaveOpened }: { initialLeaveId?: string | null; onLeaveOpened?: () => void }) {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selected, setSelected] = useState<LeaveRequest | null>(null);

  useEffect(() => { loadLeaves(); }, []);

  // Otwórz konkretny wniosek gdy przekazano initialLeaveId (z powiadomienia)
  useEffect(() => {
    if (!initialLeaveId || loading) return;
    const leave = leaves.find((l) => l.id === initialLeaveId);
    if (leave) {
      setSelected(leave);
      onLeaveOpened?.();
    }
  }, [initialLeaveId, leaves, loading]);

  async function loadLeaves() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "leaveRequests"), orderBy("createdAt", "desc"))
      );
      setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest)));
    } catch {
      try {
        const snap = await getDocs(collection(db, "leaveRequests"));
        setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRequest)));
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  async function updateLeaveStatus(id: string, status: "approved" | "rejected") {
    try {
      await updateDoc(doc(db, "leaveRequests", id), { status, updatedAt: serverTimestamp() });
      setLeaves((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
      if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status } : null);

      // Powiadomienie o zmianie statusu urlopu
      const leaveItem = leaves.find((l) => l.id === id) || selected;
      const empName = leaveItem ? `${leaveItem.firstName || ""} ${leaveItem.lastName || ""}`.trim() : "Pracownik";
      try {
        const empEmail = (leaveItem as any)?.employeeEmail || "";
        if (status === "approved") {
          await notifyLeaveApproved(empName, leaveItem?.dateFrom || "", leaveItem?.dateTo || "", empEmail || undefined, id);
        } else {
          await notifyLeaveRejected(empName, leaveItem?.dateFrom || "", leaveItem?.dateTo || "", empEmail || undefined, id);
        }
      } catch {}

      // Automatyczny wpis urlopu do grafiku po zatwierdzeniu
      if (status === "approved") {
        const leave = leaves.find((l) => l.id === id) || selected;
        if (leave && leave.employeeId && leave.dateFrom && leave.dateTo) {
          try {
            function parseDMY(s: string): Date | null {
              const p = s.split(".");
              if (p.length !== 3) return null;
              return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
            }
            const from = parseDMY(leave.dateFrom);
            const to = parseDMY(leave.dateTo);
            if (from && to) {
              const writes: Promise<any>[] = [];
              const cur = new Date(from);
              while (cur <= to) {
                const y = cur.getFullYear();
                const m = String(cur.getMonth() + 1).padStart(2, "0");
                const d = String(cur.getDate()).padStart(2, "0");
                const dateStr = `${y}-${m}-${d}`;
                const docId = `${leave.employeeId}_${dateStr}`;
                writes.push(
                  setDoc(doc(db, "schedule", docId), {
                    employeeId: leave.employeeId,
                    date: dateStr,
                    status: "urlop",
                    leaveRequestId: id,
                    updatedAt: serverTimestamp(),
                  })
                );
                cur.setDate(cur.getDate() + 1);
              }
              await Promise.all(writes);
            }
          } catch (schedErr) {
            console.warn("B\u0142\u0105d zapisu urlopu do grafiku:", schedErr);
          }
        }
      }
    } catch {}
  }

  async function deleteLeave(id: string) {
    try {
      await deleteDoc(doc(db, "leaveRequests", id));
      setLeaves((prev) => prev.filter((l) => l.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {}
  }

  function getLeaveStatusStyle(status: string) {
    switch (status) {
      case "approved": return { color: "#4ADE80", bg: "rgba(74,222,128,0.15)", border: "rgba(74,222,128,0.35)", label: "Zatwierdzony" };
      case "rejected": return { color: "#F87171", bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.35)", label: "Odrzucony" };
      default: return { color: "#F5A623", bg: "rgba(245,166,35,0.15)", border: "rgba(245,166,35,0.35)", label: "Oczekujący" };
    }
  }

  function empNameFromLeave(l: LeaveRequest): string {
    if (l.firstName && l.lastName) return `${l.firstName} ${l.lastName}`;
    return l.employeeName || "—";
  }

  const filtered = leaves.filter((l) => filter === "all" || l.status === filter);
  const pendingCount = leaves.filter((l) => l.status === "pending").length;

  if (selected) {
    const st = getLeaveStatusStyle(selected.status);
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity style={ut.backRow} onPress={() => setSelected(null)}>
          <Text style={ut.backText}>← Wróć do listy</Text>
        </TouchableOpacity>

        <View style={ut.detailCard}>
          <View style={ut.detailHeader}>
            <Text style={ut.detailName}>{empNameFromLeave(selected)}</Text>
            <View style={[ut.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
              <Text style={[ut.statusBadgeText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>

          <View style={ut.detailRow}>
            <Text style={ut.detailLabel}>Typ urlopu</Text>
            <Text style={ut.detailValue}>{selected.type || "Urlop wypoczynkowy"}</Text>
          </View>
          <View style={ut.detailDivider} />
          <View style={ut.detailRow}>
            <Text style={ut.detailLabel}>Od</Text>
            <Text style={ut.detailValue}>{formatDate(selected.dateFrom)}</Text>
          </View>
          <View style={ut.detailDivider} />
          <View style={ut.detailRow}>
            <Text style={ut.detailLabel}>Do</Text>
            <Text style={ut.detailValue}>{formatDate(selected.dateTo)}</Text>
          </View>
          {selected.reason ? (
            <>
              <View style={ut.detailDivider} />
              <View style={ut.detailRow}>
                <Text style={ut.detailLabel}>Powód</Text>
                <Text style={[ut.detailValue, { flex: 1 }]}>{selected.reason}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Plik wniosku */}
        {selected.docUrl ? (
          <View style={ut.docSection}>
            <Text style={ut.docSectionTitle}>📎 Plik wniosku</Text>
            <View style={ut.docBtnRow}>
              <TouchableOpacity
                style={ut.docPreviewBtn}
                onPress={() => {
                  const url = selected.docUrl!;
                  if (Platform.OS === "web") {
                    if (typeof window !== "undefined") window.open(url, "_blank");
                  } else {
                    import("expo-linking").then(({ openURL }) => openURL(url)).catch(() => {});
                  }
                }}
              >
                <Text style={ut.docPreviewBtnText}>👁 Podgląd</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ut.docDownloadBtn}
                onPress={() => {
                  const url = selected.docUrl!;
                  if (Platform.OS === "web") {
                    if (typeof window !== "undefined") {
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "wniosek_urlopowy.docx";
                      a.click();
                    }
                  } else {
                    import("expo-linking").then(({ openURL }) => openURL(url)).catch(() => {});
                  }
                }}
              >
                <Text style={ut.docDownloadBtnText}>⬇ Pobierz</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={ut.docSection}>
            <Text style={ut.docSectionTitle}>📎 Plik wniosku</Text>
            <Text style={ut.docMissing}>Brak pliku wniosku</Text>
          </View>
        )}

        {selected.status === "pending" && (
          <View style={ut.actionRow}>
            <TouchableOpacity
              style={[ut.actionBtn, ut.approveBtn]}
              onPress={() => updateLeaveStatus(selected.id, "approved")}
            >
              <Text style={ut.approveBtnText}>✓ Zatwierdź</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ut.actionBtn, ut.rejectBtn]}
              onPress={() => updateLeaveStatus(selected.id, "rejected")}
            >
              <Text style={ut.rejectBtnText}>✕ Odrzuć</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          style={ut.deleteLeaveBtn}
          onPress={() => deleteLeave(selected.id)}
        >
          <Text style={ut.deleteLeaveBtnText}>🗑 Usuń wniosek</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Filtry */}
      <View style={ut.filterRow}>
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[ut.filterBtn, filter === f && ut.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[ut.filterBtnText, filter === f && ut.filterBtnTextActive]}>
              {f === "all" ? `Wszystkie (${leaves.length})` :
               f === "pending" ? `Oczekujące (${pendingCount})` :
               f === "approved" ? "Zatwierdzone" : "Odrzucone"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color="#F5A623" />
          <Text style={s.loadingText}>Ładowanie wniosków...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>🏖️</Text>
          <Text style={s.emptyTitle}>Brak wniosków urlopowych</Text>
          <Text style={s.emptyDesc}>Wnioski urlopowe pracowników pojawią się tutaj</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
          {filtered.map((leave) => {
            const st = getLeaveStatusStyle(leave.status);
            return (
              <TouchableOpacity
                key={leave.id}
                style={ut.leaveCard}
                onPress={() => setSelected(leave)}
                activeOpacity={0.8}
              >
                <View style={ut.leaveCardTop}>
                  <View style={ut.leaveAvatar}>
                    <Text style={ut.leaveAvatarText}>
                      {(empNameFromLeave(leave)[0] || "?").toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ut.leaveName}>{empNameFromLeave(leave)}</Text>
                    <Text style={ut.leaveType}>{leave.type || "Urlop wypoczynkowy"}</Text>
                  </View>
                  <View style={[ut.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
                    <Text style={[ut.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
                <View style={ut.leaveDates}>
                  <Text style={ut.leaveDateText}>📅 {formatDate(leave.dateFrom)} — {formatDate(leave.dateTo)}</Text>
                </View>
                {leave.status === "pending" && (
                  <View style={ut.quickActions}>
                    <TouchableOpacity
                      style={[ut.quickBtn, ut.approveBtn]}
                      onPress={() => updateLeaveStatus(leave.id, "approved")}
                    >
                      <Text style={ut.approveBtnText}>✓ Zatwierdź</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[ut.quickBtn, ut.rejectBtn]}
                      onPress={() => updateLeaveStatus(leave.id, "rejected")}
                    >
                      <Text style={ut.rejectBtnText}>✕ Odrzuć</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={ut.deleteLeaveSmallBtn}
                  onPress={() => deleteLeave(leave.id)}
                >
                  <Text style={ut.deleteLeaveSmallText}>🗑 Usuń</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Zakładka Umowy ───────────────────────────────────────────
const EMPTY_CONTRACT_FORM = {
  employeeId: "",
  employmentType: "umowa o pracę",
  contractFrom: "",
  contractTo: "",
};

function UmowyTab({ employees }: { employees: Employee[] }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY_CONTRACT_FORM });
  const [addFile, setAddFile] = useState<{ name: string; url: string; storagePath: string; type: string } | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Edycja umowy
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_CONTRACT_FORM });
  const [editFile, setEditFile] = useState<{ name: string; url: string; storagePath: string; type: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editUploading, setEditUploading] = useState(false);

  useEffect(() => { loadContracts(); }, []);

  async function loadContracts() {
    setLoadingContracts(true);
    try {
      const snap = await getDocs(
        query(collection(db, "contracts"), orderBy("createdAt", "desc"))
      );
      setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contract)));
    } catch {
      try {
        const snap = await getDocs(collection(db, "contracts"));
        setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contract)));
      } catch {}
    }
    setLoadingContracts(false);
  }

  function setAddField(key: string, value: string) {
    setAddForm((prev) => ({ ...prev, [key]: value }));
  }

  async function pickFile() {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await uploadFileWeb(file);
      };
      input.click();
    } else {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        await uploadFileNative(result.assets[0]);
      } catch (err) {
        console.error("DocumentPicker error:", err);
      }
    }
  }

  async function uploadFileWeb(file: any) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const storagePath = `contracts/new/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setAddFile({ name: file.name, url, storagePath, type: ext });
    } catch (err) {
      console.error("Upload error (web):", err);
      setAddError("Nie udało się przesłać pliku.");
    }
    setUploading(false);
  }

  function base64ToUint8Array(base64: string): Uint8Array {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup: Record<string, number> = {};
    for (let i = 0; i < chars.length; i++) lookup[chars[i]] = i;
    const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
    const len = Math.floor((clean.length * 3) / 4);
    const bytes = new Uint8Array(len);
    let byteIndex = 0;
    for (let i = 0; i < clean.length; i += 4) {
      const a = lookup[clean[i]] ?? 0;
      const b = lookup[clean[i + 1]] ?? 0;
      const c = lookup[clean[i + 2]] ?? 0;
      const d = lookup[clean[i + 3]] ?? 0;
      bytes[byteIndex++] = (a << 2) | (b >> 4);
      if (clean[i + 2] !== "=") bytes[byteIndex++] = ((b & 15) << 4) | (c >> 2);
      if (clean[i + 3] !== "=") bytes[byteIndex++] = ((c & 3) << 6) | d;
    }
    return bytes.slice(0, byteIndex);
  }

  async function uploadFileNative(asset: DocumentPicker.DocumentPickerAsset) {
    setUploading(true);
    try {
      const fileName = asset.name;
      const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
      const storagePath = `contracts/new/${Date.now()}_${fileName}`;
      const storageRef = ref(storage, storagePath);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToUint8Array(base64);
      const mimeType = asset.mimeType || "application/octet-stream";
      await uploadBytes(storageRef, bytes, { contentType: mimeType });
      const url = await getDownloadURL(storageRef);
      setAddFile({ name: fileName, url, storagePath, type: ext });
    } catch (err) {
      console.error("Upload error (native):", err);
      setAddError("Nie udało się przesłać pliku.");
    }
    setUploading(false);
  }

  async function handleAddContract() {
    if (!addForm.employeeId) { setAddError("Wybierz pracownika."); return; }
    if (!addForm.contractFrom.trim()) { setAddError("Podaj datę początku umowy."); return; }
    setAddError("");
    setAddSaving(true);
    try {
      const emp = employees.find((e) => e.id === addForm.employeeId);
      const employeeName = emp ? `${emp.firstName} ${emp.lastName}` : "";
      // Oblicz isActive: umowa aktywna jeśli contractTo jest puste lub w przyszłości
      const toDate = addForm.contractTo.trim() ? parseDate(addForm.contractTo.trim()) : null;
      const isActive = !toDate || toDate >= new Date();
      const contractData: any = {
        employeeId: addForm.employeeId,
        employeeName,
        employmentType: addForm.employmentType,
        contractFrom: addForm.contractFrom.trim(),
        contractTo: addForm.contractTo.trim() || "bezterminowa",
        isActive,
        createdAt: serverTimestamp(),
      };
      if (addFile) {
        contractData.fileUrl = addFile.url;
        contractData.fileName = addFile.name;
        contractData.storagePath = addFile.storagePath;
        contractData.fileType = addFile.type;
      }
      const docRef = await addDoc(collection(db, "contracts"), contractData);
      const newContract: Contract = {
        id: docRef.id,
        ...contractData,
        createdAt: new Date(),
      };
      setContracts((prev) => [newContract, ...prev]);
      setShowAddModal(false);
      setAddForm({ ...EMPTY_CONTRACT_FORM });
      setAddFile(null);

      // Powiadomienie in-app + push dla pracownika (nie dla admina)
      const empEmail = emp?.email || "";
      if (empEmail) {
        // In-app notification zapisane w Firestore
        notifyContractAdded(
          empEmail,
          employeeName,
          docRef.id,
          addForm.employmentType
        ).catch(() => {});
        // Push notification na telefon
        pushContractAdded(empEmail, addForm.employmentType).catch(() => {});
      }
    } catch (err: any) {
      setAddError("Nie udało się zapisać umowy: " + (err.message || err));
    }
    setAddSaving(false);
  }

  async function handleDeleteContract(contract: Contract) {
    setDeletingId(contract.id);
    try {
      if (contract.storagePath) {
        try { await deleteObject(ref(storage, contract.storagePath)); } catch {}
      }
      await deleteDoc(doc(db, "contracts", contract.id));
      setContracts((prev) => prev.filter((c) => c.id !== contract.id));
    } catch {}
    setDeletingId(null);
    setDeleteConfirmId(null);
  }

  // Otwórz modal edycji z podstawionymi danymi
  function openEditModal(contract: Contract) {
    setEditContract(contract);
    setEditForm({
      employeeId: contract.employeeId,
      employmentType: contract.employmentType || "umowa o pracę",
      contractFrom: contract.contractFrom || "",
      contractTo: contract.contractTo === "bezterminowa" ? "" : (contract.contractTo || ""),
    });
    // Jeśli umowa ma plik — pokaż go jako aktualny
    setEditFile(
      contract.fileUrl
        ? { name: contract.fileName || "Plik umowy", url: contract.fileUrl, storagePath: contract.storagePath || "", type: contract.fileType || "pdf" }
        : null
    );
    setEditError("");
  }

  async function pickEditFile() {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setEditUploading(true);
        try {
          const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
          const storagePath = `contracts/${editForm.employeeId || "edit"}/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          setEditFile({ name: file.name, url, storagePath, type: ext });
        } catch { setEditError("Nie udało się przesłać pliku."); }
        setEditUploading(false);
      };
      input.click();
    } else {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        const asset = result.assets[0];
        setEditUploading(true);
        try {
          const fileName = asset.name;
          const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
          const storagePath = `contracts/${editForm.employeeId || "edit"}/${Date.now()}_${fileName}`;
          const storageRef = ref(storage, storagePath);
          const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
          const bytes = base64ToUint8Array(base64);
          const mimeType = asset.mimeType || "application/octet-stream";
          await uploadBytes(storageRef, bytes, { contentType: mimeType });
          const url = await getDownloadURL(storageRef);
          setEditFile({ name: fileName, url, storagePath, type: ext });
        } catch { setEditError("Nie udało się przesłać pliku."); }
        setEditUploading(false);
      } catch (err) { console.error("DocumentPicker error:", err); }
    }
  }

  async function handleEditContract() {
    if (!editContract) return;
    if (!editForm.employeeId) { setEditError("Wybierz pracownika."); return; }
    if (!editForm.contractFrom.trim()) { setEditError("Podaj datę początku umowy."); return; }
    setEditError("");
    setEditSaving(true);
    try {
      const emp = employees.find((e) => e.id === editForm.employeeId);
      const employeeName = emp ? `${emp.firstName} ${emp.lastName}` : (editContract.employeeName || "");
      const toDate = editForm.contractTo.trim() ? parseDate(editForm.contractTo.trim()) : null;
      const isActive = !toDate || toDate >= new Date();

      const updateData: any = {
        employeeId: editForm.employeeId,
        employeeName,
        employmentType: editForm.employmentType,
        contractFrom: editForm.contractFrom.trim(),
        contractTo: editForm.contractTo.trim() || "bezterminowa",
        isActive,
        updatedAt: serverTimestamp(),
      };

      // Jeśli wybrano nowy plik — usuń stary ze Storage (jeśli inny) i zapisz nowy
      if (editFile && editFile.url !== editContract.fileUrl) {
        // Usuń stary plik ze Storage jeśli istnieje i jest inny
        if (editContract.storagePath && editContract.storagePath !== editFile.storagePath) {
          try { await deleteObject(ref(storage, editContract.storagePath)); } catch {}
        }
        updateData.fileUrl = editFile.url;
        updateData.fileName = editFile.name;
        updateData.storagePath = editFile.storagePath;
        updateData.fileType = editFile.type;
      } else if (!editFile) {
        // Admin usunął plik — wyczyść pola pliku
        if (editContract.storagePath) {
          try { await deleteObject(ref(storage, editContract.storagePath)); } catch {}
        }
        updateData.fileUrl = null;
        updateData.fileName = null;
        updateData.storagePath = null;
        updateData.fileType = null;
      }
      // Jeśli editFile === stary plik (url się nie zmienił) — nie ruszaj Storage

      await updateDoc(doc(db, "contracts", editContract.id), updateData);

      // Zaktualizuj lokalny stan
      setContracts((prev) =>
        prev.map((c) =>
          c.id === editContract.id
            ? { ...c, ...updateData, updatedAt: new Date() }
            : c
        )
      );
      setEditContract(null);
    } catch (err: any) {
      setEditError("Nie udało się zaktualizować umowy: " + (err.message || err));
    }
    setEditSaving(false);
  }

  function openFile(url: string) {
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      import("expo-linking").then(({ openURL }) => openURL(url)).catch(() => {});
    }
  }

  function getFileIcon(type?: string) {
    if (type === "pdf") return "📄";
    if (type === "doc" || type === "docx") return "📝";
    return "📎";
  }

  // Pogrupuj umowy po pracowniku
  const byEmployee: Record<string, Contract[]> = {};
  contracts.forEach((c) => {
    if (!byEmployee[c.employeeId]) byEmployee[c.employeeId] = [];
    byEmployee[c.employeeId].push(c);
  });

  // Kończące się umowy (aktywne, do 30 dni)
  const expiringSoon = contracts.filter((c) => {
    if (!c.isActive) return false;
    const d = daysUntil(c.contractTo);
    return d !== null && d >= 0 && d <= 30;
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Przycisk Dodaj umowę */}
      <View style={ct.addContractBar}>
        <TouchableOpacity style={ct.addContractBtn} onPress={() => { setShowAddModal(true); setAddForm({ ...EMPTY_CONTRACT_FORM }); setAddFile(null); setAddError(""); }}>
          <Text style={ct.addContractBtnText}>+ Dodaj umowę</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
        {/* Kończące się umowy */}
        {expiringSoon.length > 0 && (
          <View style={ct.alertSection}>
            <Text style={ct.alertTitle}>⚠️ Kończące się umowy (30 dni)</Text>
            {expiringSoon.map((c) => {
              const days = daysUntil(c.contractTo);
              const color = urgencyColor(days);
              return (
                <View key={c.id} style={ct.alertRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={ct.alertName}>{c.employeeName || c.employeeId}</Text>
                    <Text style={ct.alertSub}>{c.employmentType} · do: {formatDate(c.contractTo)}</Text>
                  </View>
                  <View style={[ct.daysBadge, { backgroundColor: `${color}22`, borderColor: `${color}66` }]}>
                    <Text style={[ct.daysBadgeText, { color }]}>{days} dni</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Lista umów */}
        <Text style={ct.listTitle}>📋 Wszystkie umowy ({contracts.length})</Text>
        {loadingContracts ? (
          <ActivityIndicator size="small" color="#F5A623" style={{ marginTop: 20 }} />
        ) : contracts.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>Brak umów</Text>
            <Text style={s.emptyDesc}>Dodaj pierwszą umowę klikając "+ Dodaj umowę"</Text>
          </View>
        ) : (
          contracts.map((c) => {
            const days = daysUntil(c.contractTo);
            const color = urgencyColor(days);
            const emp = employees.find((e) => e.id === c.employeeId);
            const fullName = c.employeeName || (emp ? `${emp.firstName} ${emp.lastName}` : c.employeeId);
            return (
              <View key={c.id} style={[ct.contractCard, !c.isActive && { opacity: 0.65 }]}>
                <View style={ct.contractTop}>
                  <View style={ct.contractAvatar}>
                    <Text style={ct.contractAvatarText}>
                      {(fullName[0] || "?").toUpperCase()}
                      {(fullName.split(" ")[1]?.[0] || "").toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ct.contractName}>{fullName}</Text>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      <View style={[ct.statusBadge, c.isActive ? ct.statusActive : ct.statusArchived]}>
                        <Text style={[ct.statusBadgeText, c.isActive ? { color: "#4ADE80" } : { color: "#8899AA" }]}>
                          {c.isActive ? "Aktywna" : "Archiwum"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {days !== null && c.isActive && (
                    <View style={[ct.daysBadge, { backgroundColor: `${color}22`, borderColor: `${color}66` }]}>
                      <Text style={[ct.daysBadgeText, { color }]}>
                        {days < 0 ? "Wygasła" : `${days} dni`}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={ct.contractDetails}>
                  <View style={ct.contractRow}>
                    <Text style={ct.contractLabel}>Rodzaj umowy</Text>
                    <Text style={ct.contractValue}>{c.employmentType || "—"}</Text>
                  </View>
                  <View style={ct.contractRow}>
                    <Text style={ct.contractLabel}>Od</Text>
                    <Text style={ct.contractValue}>{formatDate(c.contractFrom) || "—"}</Text>
                  </View>
                  <View style={ct.contractRow}>
                    <Text style={ct.contractLabel}>Do</Text>
                    <Text style={[ct.contractValue, days !== null && days <= 30 && c.isActive && { color, fontWeight: "700" }]}>
                      {c.contractTo === "bezterminowa" ? "Bezterminowa" : formatDate(c.contractTo)}
                    </Text>
                  </View>
                </View>
                {/* Plik umowy */}
                {c.fileUrl ? (
                  <View style={ct.filesSection}>
                    <TouchableOpacity style={ct.fileRow} onPress={() => openFile(c.fileUrl!)}>
                      <Text style={ct.fileIcon}>{getFileIcon(c.fileType)}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={ct.fileName} numberOfLines={1}>{c.fileName || "Plik umowy"}</Text>
                        <Text style={ct.fileType}>{c.fileType?.toUpperCase()}</Text>
                      </View>
                      <Text style={{ color: "#F5A623", fontSize: 12, fontWeight: "700" }}>Otwórz →</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {/* Przyciski akcji */}
                <View style={ct.contractActionRow}>
                  <TouchableOpacity
                    style={ct.editContractBtn}
                    onPress={() => openEditModal(c)}
                  >
                    <Text style={ct.editContractBtnText}>✏️ Edytuj</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={ct.deleteContractBtn}
                    onPress={() => setDeleteConfirmId(c.id)}
                    disabled={deletingId === c.id}
                  >
                    {deletingId === c.id ? (
                      <ActivityIndicator size="small" color="#F87171" />
                    ) : (
                      <Text style={ct.deleteContractBtnText}>🗑 Usuń</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal potwierdzenia usunięcia */}
      <Modal visible={!!deleteConfirmId} transparent animationType="fade" onRequestClose={() => setDeleteConfirmId(null)}>
        <View style={ct.modalOverlay}>
          <View style={ct.modalBox}>
            <Text style={ct.modalTitle}>Usuń umowę?</Text>
            <Text style={ct.modalDesc}>Tej operacji nie można cofnąć. Plik zostanie również usunięty.</Text>
            <View style={ct.modalBtns}>
              <TouchableOpacity style={ct.modalCancelBtn} onPress={() => setDeleteConfirmId(null)}>
                <Text style={ct.modalCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ct.modalDeleteBtn}
                onPress={() => {
                  const c = contracts.find((x) => x.id === deleteConfirmId);
                  if (c) handleDeleteContract(c);
                }}
              >
                <Text style={ct.modalDeleteText}>Usuń</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal dodawania umowy */}
      <Modal visible={showAddModal} animationType="slide" transparent={false} onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#0D1B2A" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={ms.modalHeader}>
            <Text style={ms.modalTitle}>Dodaj umowę</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)} style={ms.closeBtn}>
              <Text style={ms.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={ms.scroll} contentContainerStyle={ms.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {addError ? (
              <View style={ms.errorBox}><Text style={ms.errorText}>⚠️ {addError}</Text></View>
            ) : null}

            {/* Wybór pracownika */}
            <Text style={ct.addFormLabel}>Pracownik *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {employees.map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  style={[ct.empChip, addForm.employeeId === emp.id && ct.empChipActive]}
                  onPress={() => setAddField("employeeId", emp.id)}
                >
                  <Text style={[ct.empChipText, addForm.employeeId === emp.id && ct.empChipTextActive]}>
                    {emp.firstName} {emp.lastName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Rodzaj umowy */}
            <Text style={ct.addFormLabel}>Rodzaj umowy *</Text>
            <View style={ct.empChipRow}>
              {EMPLOYMENT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[ct.empChip, addForm.employmentType === opt && ct.empChipActive]}
                  onPress={() => setAddField("employmentType", opt)}
                >
                  <Text style={[ct.empChipText, addForm.employmentType === opt && ct.empChipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Daty */}
            <FormField
              label="Umowa od *"
              value={addForm.contractFrom}
              onChangeText={(v) => setAddField("contractFrom", v)}
              placeholder="DD.MM.RRRR"
            />
            <FormField
              label="Umowa do (puste = bezterminowa)"
              value={addForm.contractTo}
              onChangeText={(v) => setAddField("contractTo", v)}
              placeholder="DD.MM.RRRR lub zostaw puste"
            />

            {/* Plik umowy */}
            <Text style={ct.addFormLabel}>Plik umowy (opcjonalnie)</Text>
            <TouchableOpacity
              style={ct.uploadBtn}
              onPress={pickFile}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#F5A623" />
              ) : addFile ? (
                <Text style={ct.uploadBtnText}>✅ {addFile.name}</Text>
              ) : (
                <Text style={ct.uploadBtnText}>+ Wybierz plik (PDF/DOC)</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 20 }} />

            <TouchableOpacity
              style={[ms.saveBtn, addSaving && { opacity: 0.6 }]}
              onPress={handleAddContract}
              disabled={addSaving}
            >
              {addSaving ? (
                <ActivityIndicator size="small" color="#0D1B2A" />
              ) : (
                <Text style={ms.saveBtnText}>Zapisz umowę</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 30 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal edycji umowy */}
      <Modal visible={!!editContract} animationType="slide" transparent={false} onRequestClose={() => setEditContract(null)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#0D1B2A" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={ms.modalHeader}>
            <Text style={ms.modalTitle}>✏️ Edytuj umowę</Text>
            <TouchableOpacity onPress={() => setEditContract(null)} style={ms.closeBtn}>
              <Text style={ms.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={ms.scroll} contentContainerStyle={ms.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {editError ? (
              <View style={ms.errorBox}><Text style={ms.errorText}>⚠️ {editError}</Text></View>
            ) : null}

            {/* Wybór pracownika */}
            <Text style={ct.addFormLabel}>Pracownik *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {employees.map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  style={[ct.empChip, editForm.employeeId === emp.id && ct.empChipActive]}
                  onPress={() => setEditForm((prev) => ({ ...prev, employeeId: emp.id }))}
                >
                  <Text style={[ct.empChipText, editForm.employeeId === emp.id && ct.empChipTextActive]}>
                    {emp.firstName} {emp.lastName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Rodzaj umowy */}
            <Text style={ct.addFormLabel}>Rodzaj umowy *</Text>
            <View style={ct.empChipRow}>
              {EMPLOYMENT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[ct.empChip, editForm.employmentType === opt && ct.empChipActive]}
                  onPress={() => setEditForm((prev) => ({ ...prev, employmentType: opt }))}
                >
                  <Text style={[ct.empChipText, editForm.employmentType === opt && ct.empChipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Daty */}
            <FormField
              label="Umowa od *"
              value={editForm.contractFrom}
              onChangeText={(v) => setEditForm((prev) => ({ ...prev, contractFrom: v }))}
              placeholder="DD.MM.RRRR"
            />
            <FormField
              label="Umowa do (puste = bezterminowa)"
              value={editForm.contractTo}
              onChangeText={(v) => setEditForm((prev) => ({ ...prev, contractTo: v }))}
              placeholder="DD.MM.RRRR lub zostaw puste"
            />

            {/* Plik umowy */}
            <Text style={ct.addFormLabel}>Plik umowy</Text>
            <TouchableOpacity
              style={ct.uploadBtn}
              onPress={pickEditFile}
              disabled={editUploading}
            >
              {editUploading ? (
                <ActivityIndicator size="small" color="#F5A623" />
              ) : editFile ? (
                <Text style={ct.uploadBtnText}>✅ {editFile.name}</Text>
              ) : (
                <Text style={ct.uploadBtnText}>+ Wybierz plik (PDF/DOC)</Text>
              )}
            </TouchableOpacity>
            {editFile && (
              <TouchableOpacity
                style={{ marginTop: 6, alignSelf: "flex-start" }}
                onPress={() => setEditFile(null)}
              >
                <Text style={{ color: "#F87171", fontSize: 12 }}>✕ Usuń plik</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 20 }} />

            <TouchableOpacity
              style={[ms.saveBtn, editSaving && { opacity: 0.6 }]}
              onPress={handleEditContract}
              disabled={editSaving}
            >
              {editSaving ? (
                <ActivityIndicator size="small" color="#0D1B2A" />
              ) : (
                <Text style={ms.saveBtnText}>Zapisz zmiany</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 30 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Główny ekran Kadry ───────────────────────────────────────
export default function KadryScreen() {
  const params = useLocalSearchParams<{ tab?: string; leaveId?: string }>();
  const [activeTab, setActiveTab] = useState<"lista" | "grafik" | "urlopy" | "umowy">("lista");
  const [pendingLeaveId, setPendingLeaveId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [searchText, setSearchText] = useState("");
  const [deleteError, setDeleteError] = useState("");

  // Obsługa parametrów URL (np. z powiadomień)
  useEffect(() => {
    if (params.tab === "urlopy") {
      setActiveTab("urlopy");
      if (params.leaveId) {
        setPendingLeaveId(params.leaveId);
      }
    } else if (params.tab === "lista") {
      setActiveTab("lista");
    }
  }, [params.tab, params.leaveId]);

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "employees"), orderBy("lastName", "asc"))
      );
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
    } catch {
      try {
        const snap = await getDocs(collection(db, "employees"));
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
      } catch {
        setDeleteError("Nie udało się pobrać listy pracowników.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(emp: Employee) {
    try {
      // 1. Usuń konto z Firebase Auth + users (przez adminAuth)
      const uid = emp.uid;
      if (uid) {
        await deleteUserAccount(uid, emp.email);
      } else {
        // Brak uid w employees — szukaj w users po email
        try {
          const q = query(collection(db, "users"), where("email", "==", emp.email));
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            await deleteUserAccount(d.id, emp.email);
          }
        } catch (userErr) {
          console.warn("[delete] Błąd szukania users po email:", userErr);
        }
      }

      // 2. Usuń rekord z kolekcji employees
      await deleteDoc(doc(db, "employees", emp.id));

      // 3. Usuń z lokalnego stanu natychmiast
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
      // Odśwież z Firebase w tle
      loadEmployees();
    } catch (e: any) {
      setDeleteError("Nie udało się usunąć pracownika: " + e.message);
    }
  }

  async function handleSuspend(emp: Employee) {
    try {
      const uid = emp.uid;
      if (!uid) {
        // Szukaj uid w users po email
        const q = query(collection(db, "users"), where("email", "==", emp.email));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          await suspendUserAccount(d.id);
        }
      } else {
        await suspendUserAccount(uid);
      }
      // Zaktualizuj employees.suspended
      await updateDoc(doc(db, "employees", emp.id), { suspended: true });
      setEmployees((prev) =>
        prev.map((e) => (e.id === emp.id ? { ...e, suspended: true } : e))
      );
    } catch (e: any) {
      setDeleteError("Nie udało się zawiesić konta: " + e.message);
    }
  }

  async function handleUnsuspend(emp: Employee) {
    try {
      const uid = emp.uid;
      if (!uid) {
        const q = query(collection(db, "users"), where("email", "==", emp.email));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          await unsuspendUserAccount(d.id);
        }
      } else {
        await unsuspendUserAccount(uid);
      }
      await updateDoc(doc(db, "employees", emp.id), { suspended: false });
      setEmployees((prev) =>
        prev.map((e) => (e.id === emp.id ? { ...e, suspended: false } : e))
      );
    } catch (e: any) {
      setDeleteError("Nie udało się odwiesić konta: " + e.message);
    }
  }

  function openAdd() {
    setEditEmployee(null);
    setShowFormModal(true);
  }

  function openEdit(emp: Employee) {
    setEditEmployee(emp);
    setShowFormModal(true);
  }

  const filteredEmployees = employees.filter((emp) => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return (
      emp.firstName?.toLowerCase().includes(q) ||
      emp.lastName?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q) ||
      emp.phone?.toLowerCase().includes(q)
    );
  });

  const activeCount = employees.filter(
    (e) => e.status?.toLowerCase() === "aktywny" || e.status?.toLowerCase() === "active"
  ).length;

  return (
    <View style={s.container}>
      {/* Wspólny header admina */}
      <AdminHeader />

      {/* Zakładki */}
      <View style={s.tabs}>
        {(["lista", "grafik", "urlopy", "umowy"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === "lista" ? "Lista" : tab === "grafik" ? "Grafik" : tab === "urlopy" ? "Urlopy" : "Umowy"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Zawartość zakładek */}
      {activeTab === "lista" && (
        <View style={{ flex: 1 }}>
          {/* Pasek narzędzi */}
          <View style={s.listToolbar}>
            <View style={s.searchWrap}>
              <Text style={s.searchIcon}>🔍</Text>
              <TextInput
                style={s.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Szukaj pracownika..."
                placeholderTextColor="#4A5568"
                autoCapitalize="none"
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText("")}>
                  <Text style={s.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={s.addBtn} onPress={openAdd}>
              <Text style={s.addBtnText}>+ Dodaj</Text>
            </TouchableOpacity>
          </View>

          {/* Licznik */}
          <View style={s.countRow}>
            <Text style={s.countText}>
              Pracownicy: <Text style={s.countNum}>{employees.length}</Text>
              {"  "}
              Aktywni: <Text style={{ color: "#4ADE80", fontWeight: "700" }}>{activeCount}</Text>
            </Text>
          </View>

          {/* Błąd usuwania */}
          {deleteError ? (
            <View style={s.errorRow}>
              <Text style={s.errorText}>⚠️ {deleteError}</Text>
              <TouchableOpacity onPress={() => setDeleteError("")}>
                <Text style={s.errorClose}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Lista */}
          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator size="large" color="#F5A623" />
              <Text style={s.loadingText}>Ładowanie pracowników...</Text>
            </View>
          ) : filteredEmployees.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>👥</Text>
              <Text style={s.emptyTitle}>
                {searchText ? "Brak wyników" : "Brak pracowników"}
              </Text>
              <Text style={s.emptyDesc}>
                {searchText
                  ? `Nie znaleziono pracownika dla: "${searchText}"`
                  : "Dodaj pierwszego pracownika klikając + Dodaj"}
              </Text>
            </View>
          ) : (
            <ScrollView style={s.list} contentContainerStyle={s.listContent}>
              {filteredEmployees.map((emp) => (
                <EmployeeCard
                  key={emp.id}
                  emp={emp}
                  onEdit={() => openEdit(emp)}
                  onDelete={() => handleDelete(emp)}
                  onSuspend={() => handleSuspend(emp)}
                  onUnsuspend={() => handleUnsuspend(emp)}
                />
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      )}

      {activeTab === "grafik" && <GrafikTab employees={employees} />}
      {activeTab === "urlopy" && <UrlopTab initialLeaveId={pendingLeaveId} onLeaveOpened={() => setPendingLeaveId(null)} />}
      {activeTab === "umowy" && <UmowyTab employees={employees} />}

      {/* Dolna nawigacja */}
      <AdminBottomNav />

      {/* Modal formularza */}
      <EmployeeFormModal
        visible={showFormModal}
        onClose={() => { setShowFormModal(false); setEditEmployee(null); }}
        onSaved={loadEmployees}
        editEmployee={editEmployee}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#1B2838",
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#F5A623",
  },
  tabText: { color: "#687076", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#F5A623" },
  listToolbar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    alignItems: "center",
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#162030",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchIcon: { fontSize: 14, color: "#687076" },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14 },
  searchClear: { color: "#687076", fontSize: 14, paddingHorizontal: 4 },
  addBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnText: { color: "#0D1B2A", fontWeight: "800", fontSize: 14 },
  countRow: { paddingHorizontal: 16, paddingBottom: 6 },
  countText: { color: "#8899AA", fontSize: 13 },
  countNum: { color: "#FFFFFF", fontWeight: "700" },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(248,113,113,0.12)",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
  },
  errorText: { color: "#F87171", fontSize: 13, flex: 1 },
  errorClose: { color: "#F87171", fontSize: 16, paddingLeft: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  empCard: {
    flexDirection: "row",
    backgroundColor: "#162030",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderColor: "#1E2D3D",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1E3A5F",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#F5A623",
    flexShrink: 0,
  },
  avatarText: { color: "#F5A623", fontSize: 15, fontWeight: "800" },
  empInfo: { flex: 1 },
  empName: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  empRole: { color: "#F5A623", fontSize: 12, fontWeight: "600", marginBottom: 2 },
  empEmail: { color: "#8899AA", fontSize: 12, marginBottom: 1 },
  empPhone: { color: "#8899AA", fontSize: 12, marginBottom: 4 },
  empTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  tag: {
    backgroundColor: "#1E2D3D",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagDoc: { backgroundColor: "rgba(245,166,35,0.12)" },
  tagText: { color: "#8899AA", fontSize: 10, fontWeight: "600" },
  empActions: { alignItems: "flex-end", gap: 8, flexShrink: 0 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "700" },
  suspendBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "rgba(251,191,36,0.1)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.3)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  suspendBtnActive: {
    backgroundColor: "rgba(74,222,128,0.1)",
    borderColor: "rgba(74,222,128,0.3)",
  },
  suspendBtnText: { fontSize: 16 },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "rgba(248,113,113,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtnText: { fontSize: 16 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: "#8899AA", fontSize: 14 },
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  emptyDesc: { color: "#8899AA", fontSize: 14, textAlign: "center", lineHeight: 20 },
  skeletonWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  skeletonIcon: { fontSize: 48, marginBottom: 16 },
  skeletonTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", marginBottom: 8 },
  skeletonDesc: { color: "#8899AA", fontSize: 14, textAlign: "center" },
});

// ─── Style modalu formularza ──────────────────────────────────
const ms = StyleSheet.create({
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#0D1B2A",
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  modalTitle: {
    color: "#F5A623",
    fontSize: 20,
    fontWeight: "800",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(248,113,113,0.15)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    color: "#F87171",
    fontSize: 16,
    fontWeight: "700",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  errorBox: {
    backgroundColor: "rgba(248,113,113,0.12)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
  },
  errorText: { color: "#F87171", fontSize: 13 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    marginBottom: 4,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: {
    color: "#F5A623",
    fontSize: 14,
    fontWeight: "700",
  },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: "#162030",
    color: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  selectBtn: {
    backgroundColor: "#162030",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  selectBtnText: { color: "#FFFFFF", fontSize: 15 },
  selectArrow: { color: "#F5A623", fontSize: 12 },
  selectOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  selectBox: {
    backgroundColor: "#1B2838",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    overflow: "hidden",
  },
  selectOption: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  selectOptionActive: { backgroundColor: "rgba(245,166,35,0.12)" },
  selectOptionText: { color: "#FFFFFF", fontSize: 15 },
  selectOptionTextActive: { color: "#F5A623", fontWeight: "700" },
  statusLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 4,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  statusChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#162030",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  statusChipActive: {
    backgroundColor: "rgba(245,166,35,0.15)",
    borderColor: "#F5A623",
  },
  statusChipText: { color: "#8899AA", fontSize: 13, fontWeight: "600" },
  statusChipTextActive: { color: "#F5A623" },
  saveBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  saveBtnText: {
    color: "#0D1B2A",
    fontSize: 16,
    fontWeight: "800",
  },
  cancelBtn: {
    backgroundColor: "#162030",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  cancelBtnText: {
    color: "#8899AA",
    fontSize: 15,
    fontWeight: "600",
  },
});

// ─── Style modalu potwierdzenia usunięcia ─────────────────────
const dc = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  box: {
    backgroundColor: "#1B2838",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
  },
  icon: { fontSize: 36, marginBottom: 12 },
  title: {
    color: "#F87171",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  desc: {
    color: "#CCDDEE",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 6,
  },
  name: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  warning: {
    color: "#687076",
    fontSize: 12,
    marginBottom: 24,
    textAlign: "center",
  },
  btns: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#162030",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  cancelText: {
    color: "#8899AA",
    fontSize: 15,
    fontWeight: "600",
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: "rgba(248,113,113,0.15)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.5)",
  },
  deleteText: {
    color: "#F87171",
    fontSize: 15,
    fontWeight: "800",
  },
});

// ─── Style zakładki Grafik ────────────────────────────────────
const gt = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  sectionTitle: { color: "#F5A623", fontSize: 13, fontWeight: "700", marginBottom: 6 },
  pickerBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#162030",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  pickerBtnText: { color: "#FFFFFF", fontSize: 15 },
  pickerArrow: { color: "#F5A623", fontSize: 12 },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#162030",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  monthBtnText: { color: "#F5A623", fontSize: 20, fontWeight: "700" },
  monthLabel: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  legend: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#8899AA", fontSize: 11 },
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: "#8899AA", fontSize: 14, textAlign: "center" },
  calendarWrap: { paddingHorizontal: 12 },
  calHeader: { flexDirection: "row", marginBottom: 4 },
  calHeaderCell: { flex: 1, alignItems: "center", paddingVertical: 4 },
  calHeaderText: { color: "#8899AA", fontSize: 11, fontWeight: "700" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: {
    width: "14.28%",
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  calCellToday: { borderColor: "#F5A623", borderWidth: 2 },
  calCellNum: { fontSize: 12, fontWeight: "600" },
  calCellStatus: { fontSize: 8, fontWeight: "800", marginTop: 1 },
  savingRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", padding: 8 },
  savingText: { color: "#F5A623", fontSize: 12 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  pickerBox: {
    backgroundColor: "#1B2838",
    borderRadius: 16,
    padding: 16,
    maxHeight: 400,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  pickerTitle: { color: "#F5A623", fontSize: 16, fontWeight: "700", marginBottom: 12 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  pickerItemActive: { backgroundColor: "rgba(245,166,35,0.12)" },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1E3A5F",
    borderWidth: 2,
    borderColor: "#F5A623",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerAvatarText: { color: "#F5A623", fontSize: 12, fontWeight: "800" },
  pickerItemName: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  pickerItemRole: { color: "#8899AA", fontSize: 12 },
  saveSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  saveBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveBtnDisabled: {
    backgroundColor: "#2A3A4A",
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#0D1B2A",
    fontSize: 15,
    fontWeight: "800",
  },
  successRow: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.35)",
    alignItems: "center",
  },
  successText: {
    color: "#4ADE80",
    fontSize: 13,
    fontWeight: "700",
  },
});

// ─── Style zakładki Urlopy ────────────────────────────────────
const ut = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    flexWrap: "wrap",
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#162030",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  filterBtnActive: {
    backgroundColor: "rgba(245,166,35,0.15)",
    borderColor: "#F5A623",
  },
  filterBtnText: { color: "#8899AA", fontSize: 12, fontWeight: "600" },
  filterBtnTextActive: { color: "#F5A623" },
  leaveCard: {
    backgroundColor: "#162030",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E2D3D",
  },
  leaveCardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  leaveAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1E3A5F",
    borderWidth: 2,
    borderColor: "#F5A623",
    justifyContent: "center",
    alignItems: "center",
  },
  leaveAvatarText: { color: "#F5A623", fontSize: 13, fontWeight: "800" },
  leaveName: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  leaveType: { color: "#8899AA", fontSize: 12 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  leaveDates: { marginBottom: 6 },
  leaveDateText: { color: "#8899AA", fontSize: 12 },
  quickActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  quickBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
  },
  actionRow: { flexDirection: "row", gap: 12, padding: 16 },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  approveBtn: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderColor: "rgba(74,222,128,0.4)",
  },
  approveBtnText: { color: "#4ADE80", fontSize: 14, fontWeight: "700" },
  rejectBtn: {
    backgroundColor: "rgba(248,113,113,0.15)",
    borderColor: "rgba(248,113,113,0.4)",
  },
  rejectBtnText: { color: "#F87171", fontSize: 14, fontWeight: "700" },
  backRow: { paddingVertical: 8, marginBottom: 8 },
  backText: { color: "#8899AA", fontSize: 14, fontWeight: "600" },
  detailCard: {
    backgroundColor: "#162030",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E2D3D",
    marginBottom: 16,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  detailName: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  detailLabel: { color: "#8899AA", fontSize: 13 },
  detailValue: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  detailDivider: { height: 1, backgroundColor: "#2A3A4A" },
  deleteLeaveBtn: {
    marginTop: 12,
    backgroundColor: "rgba(248,113,113,0.1)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
  },
  deleteLeaveBtnText: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "700",
  },
  deleteLeaveSmallBtn: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(248,113,113,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    alignSelf: "flex-start",
  },
  deleteLeaveSmallText: {
    color: "#F87171",
    fontSize: 12,
    fontWeight: "600",
  },
  docSection: {
    backgroundColor: "#162030",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E2D3D",
    marginBottom: 12,
  },
  docSectionTitle: {
    color: "#F5A623",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  docBtnRow: {
    flexDirection: "row",
    gap: 10,
  },
  docPreviewBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "rgba(245,166,35,0.1)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.35)",
  },
  docPreviewBtnText: {
    color: "#F5A623",
    fontSize: 13,
    fontWeight: "700",
  },
  docDownloadBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "rgba(74,222,128,0.1)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.35)",
  },
  docDownloadBtnText: {
    color: "#4ADE80",
    fontSize: 13,
    fontWeight: "700",
  },
  docMissing: {
    color: "#8899AA",
    fontSize: 12,
    fontStyle: "italic",
  },
});

// ─── Style zakładki Umowy ─────────────────────────────────────
const ct = StyleSheet.create({
  alertSection: {
    backgroundColor: "rgba(248,113,113,0.08)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
  },
  alertTitle: { color: "#F87171", fontSize: 14, fontWeight: "700", marginBottom: 10 },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(248,113,113,0.15)",
    gap: 8,
  },
  alertName: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  alertSub: { color: "#8899AA", fontSize: 11 },
  daysBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  daysBadgeText: { fontSize: 11, fontWeight: "700" },
  listTitle: { color: "#F5A623", fontSize: 14, fontWeight: "700", marginBottom: 10 },
  contractCard: {
    backgroundColor: "#162030",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E2D3D",
  },
  contractTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  contractAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1E3A5F",
    borderWidth: 2,
    borderColor: "#F5A623",
    justifyContent: "center",
    alignItems: "center",
  },
  contractAvatarText: { color: "#F5A623", fontSize: 12, fontWeight: "800" },
  contractName: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  contractRole: { color: "#8899AA", fontSize: 12 },
  contractDetails: {
    backgroundColor: "#0D1B2A",
    borderRadius: 10,
    padding: 10,
  },
  contractRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D3D",
  },
  contractLabel: { color: "#8899AA", fontSize: 12 },
  contractValue: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  filesSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#2A3A4A",
  },
  filesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  filesTitle: { color: "#8899AA", fontSize: 12, fontWeight: "700" },
  uploadBtn: {
    backgroundColor: "rgba(245,166,35,0.15)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.4)",
  },
  uploadBtnText: { color: "#F5A623", fontSize: 11, fontWeight: "700" },
  noFilesText: { color: "#4A5568", fontSize: 12, fontStyle: "italic" },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D3D",
  },
  fileIcon: { fontSize: 18 },
  fileName: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  fileType: { color: "#8899AA", fontSize: 10 },
  deleteFileBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(248,113,113,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteFileBtnText: { fontSize: 14 },
  // Nowe style dla UmowyTab
  addContractBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E2D3D",
  },
  addContractBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  addContractBtnText: { color: "#0D1B2A", fontSize: 13, fontWeight: "800" },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusActive: { backgroundColor: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.3)" },
  statusArchived: { backgroundColor: "rgba(136,153,170,0.1)", borderColor: "rgba(136,153,170,0.3)" },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  contractActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  editContractBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.4)",
    backgroundColor: "rgba(245,166,35,0.1)",
    alignItems: "center",
  },
  editContractBtnText: { color: "#F5A623", fontSize: 12, fontWeight: "700" },
  deleteContractBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    backgroundColor: "rgba(248,113,113,0.08)",
    alignItems: "center",
  },
  deleteContractBtnText: { color: "#F87171", fontSize: 12, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: "#162030",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "#1E2D3D",
  },
  modalTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginBottom: 8 },
  modalDesc: { color: "#8899AA", fontSize: 13, marginBottom: 20 },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    alignItems: "center",
  },
  modalCancelText: { color: "#8899AA", fontSize: 14, fontWeight: "700" },
  modalDeleteBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#F87171",
    alignItems: "center",
  },
  modalDeleteText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  addFormLabel: { color: "#8899AA", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  empChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  empChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    backgroundColor: "#162030",
    marginRight: 6,
    marginBottom: 6,
  },
  empChipActive: {
    borderColor: "#F5A623",
    backgroundColor: "rgba(245,166,35,0.15)",
  },
  empChipText: { color: "#8899AA", fontSize: 12 },
  empChipTextActive: { color: "#F5A623", fontWeight: "700" },
});
