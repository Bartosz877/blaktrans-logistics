import { useState, useEffect, useCallback } from "react";
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
  Image,
} from "react-native";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import AdminHeader from "../../components/AdminHeader";
import AdminBottomNav from "../../components/AdminBottomNav";
import { notifyMileageEntry } from "../../lib/notifications";
import { useAuth } from "../_layout";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

// ─── Types ───────────────────────────────────────────────────
interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: string;
  plate: string;
  vin: string;
  dmc: string;
  payload: string;
  status: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  photoUrl?: string;
  photoPath?: string;
  // Terminy
  ocExpiry?: string;
  acExpiry?: string;
  udtExpiry?: string;
  inspectionExpiry?: string;
  // Licznik i olej
  currentMileage?: string;
  lastOilChangeMileage?: string;
  oilChangeInterval?: string;
  createdAt?: any;
}

interface MileageEntry {
  id: string;
  vehicleId: string;
  mileage: number;
  addedBy: string;
  addedByName: string;
  note?: string;
  createdAt: any;
}

interface Fault {
  id: string;
  vehicleId: string;
  title: string;
  description?: string;
  status: string;
  reportedBy?: string;
  createdAt: any;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

// ─── Helpers ─────────────────────────────────────────────────
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split(".");
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function urgencyColor(days: number | null): string {
  if (days === null) return "#8899AA";
  if (days < 0) return "#F87171";
  if (days <= 7) return "#F87171";
  if (days <= 30) return "#F5A623";
  return "#4ADE80";
}

function formatDate(d?: string): string {
  if (!d) return "—";
  return d;
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "aktywny": case "active": return "#4ADE80";
    case "w naprawie": case "repair": return "#F5A623";
    case "nieaktywny": case "inactive": return "#F87171";
    default: return "#8899AA";
  }
}

function oilStatus(vehicle: Vehicle): { label: string; color: string; remaining: number | null } {
  const current = parseInt(vehicle.currentMileage || "0");
  const lastChange = parseInt(vehicle.lastOilChangeMileage || "0");
  const interval = parseInt(vehicle.oilChangeInterval || "15000");
  if (!vehicle.currentMileage || !vehicle.lastOilChangeMileage) {
    return { label: "Brak danych", color: "#8899AA", remaining: null };
  }
  const driven = current - lastChange;
  const remaining = interval - driven;
  if (remaining <= 0) return { label: `Wymiana oleju! (${Math.abs(remaining)} km po terminie)`, color: "#F87171", remaining };
  if (remaining <= 2000) return { label: `Wymiana oleju za ${remaining} km`, color: "#F5A623", remaining };
  return { label: `Olej OK (${remaining} km do wymiany)`, color: "#4ADE80", remaining };
}

// ─── Formularz pojazdu ────────────────────────────────────────
const VEHICLE_STATUSES = ["Aktywny", "W naprawie", "Nieaktywny"];
const OIL_INTERVALS = ["30000", "20000", "15000"];

interface VehicleFormProps {
  visible: boolean;
  onClose: () => void;
  onSave: (vehicle: Omit<Vehicle, "id">) => Promise<void>;
  initial?: Vehicle | null;
  employees: Employee[];
}

function VehicleFormModal({ visible, onClose, onSave, initial, employees }: VehicleFormProps) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [dmc, setDmc] = useState("");
  const [payload, setPayload] = useState("");
  const [status, setStatus] = useState("Aktywny");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState("");
  const [assignedEmployeeName, setAssignedEmployeeName] = useState("");
  const [ocExpiry, setOcExpiry] = useState("");
  const [acExpiry, setAcExpiry] = useState("");
  const [udtExpiry, setUdtExpiry] = useState("");
  const [inspectionExpiry, setInspectionExpiry] = useState("");
  const [currentMileage, setCurrentMileage] = useState("");
  const [lastOilChangeMileage, setLastOilChangeMileage] = useState("");
  const [oilChangeInterval, setOilChangeInterval] = useState("15000");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showOilPicker, setShowOilPicker] = useState(false);

  useEffect(() => {
    if (initial) {
      setBrand(initial.brand || "");
      setModel(initial.model || "");
      setYear(initial.year || "");
      setPlate(initial.plate || "");
      setVin(initial.vin || "");
      setDmc(initial.dmc || "");
      setPayload(initial.payload || "");
      setStatus(initial.status || "Aktywny");
      setAssignedEmployeeId(initial.assignedEmployeeId || "");
      setAssignedEmployeeName(initial.assignedEmployeeName || "");
      setOcExpiry(initial.ocExpiry || "");
      setAcExpiry(initial.acExpiry || "");
      setUdtExpiry(initial.udtExpiry || "");
      setInspectionExpiry(initial.inspectionExpiry || "");
      setCurrentMileage(initial.currentMileage || "");
      setLastOilChangeMileage(initial.lastOilChangeMileage || "");
      setOilChangeInterval(initial.oilChangeInterval || "15000");
      setPhotoUrl(initial.photoUrl || "");
      setPhotoPath(initial.photoPath || "");
    } else {
      setBrand(""); setModel(""); setYear(""); setPlate(""); setVin("");
      setDmc(""); setPayload(""); setStatus("Aktywny");
      setAssignedEmployeeId(""); setAssignedEmployeeName("");
      setOcExpiry(""); setAcExpiry(""); setUdtExpiry(""); setInspectionExpiry("");
      setCurrentMileage(""); setLastOilChangeMileage(""); setOilChangeInterval("15000");
      setPhotoUrl(""); setPhotoPath("");
    }
  }, [initial, visible]);

  // Dekodowanie base64 → Uint8Array bez atob (działa na Hermes/Android)
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

  async function handlePhotoUpload() {
    if (Platform.OS === "web") {
      // Web: natywny input[type=file]
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
          const path = `vehicles/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          setPhotoUrl(url);
          setPhotoPath(path);
        } catch (err) {
          console.error("Photo upload error (web):", err);
        }
        setUploading(false);
      };
      input.click();
    } else {
      // Android / iOS: expo-image-picker
      try {
        // Poproś o uprawnienia
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          console.warn("Brak uprawnień do galerii.");
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: "images",
          allowsEditing: true,
          quality: 0.8,
          base64: false,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) return;
        const asset = result.assets[0];

        setUploading(true);
        try {
          // Odczytaj plik jako base64
          const base64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const bytes = base64ToUint8Array(base64);

          // Ustal nazwę pliku i mime type
          const ext = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
          const fileName = `photo_${Date.now()}.${ext}`;
          const mimeType = asset.mimeType || `image/${ext}`;
          const path = `vehicles/${fileName}`;

          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, bytes, { contentType: mimeType });
          const url = await getDownloadURL(storageRef);
          setPhotoUrl(url);
          setPhotoPath(path);
        } catch (err) {
          console.error("Photo upload error (native):", err);
        }
        setUploading(false);
      } catch (err) {
        console.error("ImagePicker error:", err);
        setUploading(false);
      }
    }
  }

  async function handleRemovePhoto() {
    if (photoPath) {
      try {
        await deleteObject(ref(storage, photoPath));
      } catch {}
    }
    setPhotoUrl("");
    setPhotoPath("");
  }

  async function handleSave() {
    if (!brand.trim() || !plate.trim()) return;
    setSaving(true);
    await onSave({
      brand: brand.trim(),
      model: model.trim(),
      year: year.trim(),
      plate: plate.trim().toUpperCase(),
      vin: vin.trim().toUpperCase(),
      dmc: dmc.trim(),
      payload: payload.trim(),
      status,
      assignedEmployeeId,
      assignedEmployeeName,
      ocExpiry,
      acExpiry,
      udtExpiry,
      inspectionExpiry,
      currentMileage,
      lastOilChangeMileage,
      oilChangeInterval,
      photoUrl,
      photoPath,
    });
    setSaving(false);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={fm.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={fm.sheetWrap}
      >
        <View style={fm.sheet}>
          <View style={fm.sheetHeader}>
            <Text style={fm.sheetTitle}>{initial ? "✏️ Edytuj pojazd" : "🚛 Dodaj pojazd"}</Text>
            <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
              <Text style={fm.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">

            {/* Zdjęcie pojazdu */}
            <Text style={fm.sectionTitle}>📷 Zdjęcie pojazdu</Text>
            <View style={fm.photoRow}>
              {photoUrl ? (
                <View style={fm.photoPreview}>
                  <Image source={{ uri: photoUrl }} style={fm.photoImg} resizeMode="cover" />
                  <TouchableOpacity style={fm.removePhotoBtn} onPress={handleRemovePhoto}>
                    <Text style={fm.removePhotoBtnText}>🗑 Usuń</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={fm.uploadPhotoBtn} onPress={handlePhotoUpload} disabled={uploading}>
                  {uploading ? (
                    <ActivityIndicator color="#F5A623" />
                  ) : (
                    <>
                      <Text style={fm.uploadPhotoIcon}>📷</Text>
                      <Text style={fm.uploadPhotoText}>Dodaj zdjęcie</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Dane podstawowe */}
            <Text style={fm.sectionTitle}>🚛 Dane pojazdu</Text>
            <Text style={fm.label}>Marka *</Text>
            <TextInput style={fm.input} value={brand} onChangeText={setBrand} placeholder="np. DAF, Volvo, MAN" placeholderTextColor="#4A5568" />
            <Text style={fm.label}>Model *</Text>
            <TextInput style={fm.input} value={model} onChangeText={setModel} placeholder="np. XF, FH, TGX" placeholderTextColor="#4A5568" />
            <Text style={fm.label}>Rok produkcji</Text>
            <TextInput style={fm.input} value={year} onChangeText={setYear} placeholder="np. 2020" placeholderTextColor="#4A5568" keyboardType="numeric" />
            <Text style={fm.label}>Numer rejestracyjny *</Text>
            <TextInput style={fm.input} value={plate} onChangeText={setPlate} placeholder="np. GDA 12345" placeholderTextColor="#4A5568" autoCapitalize="characters" />
            <Text style={fm.label}>VIN</Text>
            <TextInput style={fm.input} value={vin} onChangeText={setVin} placeholder="17-znakowy numer VIN" placeholderTextColor="#4A5568" autoCapitalize="characters" />
            <Text style={fm.label}>DMC (kg)</Text>
            <TextInput style={fm.input} value={dmc} onChangeText={setDmc} placeholder="np. 40000" placeholderTextColor="#4A5568" keyboardType="numeric" />
            <Text style={fm.label}>Ładowność (kg)</Text>
            <TextInput style={fm.input} value={payload} onChangeText={setPayload} placeholder="np. 24000" placeholderTextColor="#4A5568" keyboardType="numeric" />

            {/* Status */}
            <Text style={fm.label}>Status</Text>
            <TouchableOpacity style={fm.picker} onPress={() => setShowStatusPicker(true)}>
              <Text style={fm.pickerText}>{status}</Text>
              <Text style={fm.pickerArrow}>▼</Text>
            </TouchableOpacity>
            {showStatusPicker && (
              <View style={fm.dropdownList}>
                {VEHICLE_STATUSES.map((s) => (
                  <TouchableOpacity key={s} style={fm.dropdownItem} onPress={() => { setStatus(s); setShowStatusPicker(false); }}>
                    <Text style={[fm.dropdownItemText, status === s && fm.dropdownItemActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Przypisany pracownik */}
            <Text style={fm.label}>Przypisany pracownik</Text>
            <TouchableOpacity style={fm.picker} onPress={() => setShowEmployeePicker(true)}>
              <Text style={fm.pickerText}>{assignedEmployeeName || "Wybierz pracownika..."}</Text>
              <Text style={fm.pickerArrow}>▼</Text>
            </TouchableOpacity>
            {showEmployeePicker && (
              <View style={fm.dropdownList}>
                <TouchableOpacity style={fm.dropdownItem} onPress={() => { setAssignedEmployeeId(""); setAssignedEmployeeName(""); setShowEmployeePicker(false); }}>
                  <Text style={fm.dropdownItemText}>— Brak przypisania —</Text>
                </TouchableOpacity>
                {employees.map((emp) => (
                  <TouchableOpacity key={emp.id} style={fm.dropdownItem} onPress={() => {
                    setAssignedEmployeeId(emp.id);
                    setAssignedEmployeeName(`${emp.firstName} ${emp.lastName}`);
                    setShowEmployeePicker(false);
                  }}>
                    <Text style={[fm.dropdownItemText, assignedEmployeeId === emp.id && fm.dropdownItemActive]}>
                      {emp.firstName} {emp.lastName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Terminy */}
            <Text style={fm.sectionTitle}>📅 Terminy ubezpieczeń i przeglądów</Text>
            <Text style={fm.label}>OC ważne do (DD.MM.RRRR)</Text>
            <TextInput style={fm.input} value={ocExpiry} onChangeText={setOcExpiry} placeholder="DD.MM.RRRR" placeholderTextColor="#4A5568" />
            <Text style={fm.label}>AC ważne do (DD.MM.RRRR)</Text>
            <TextInput style={fm.input} value={acExpiry} onChangeText={setAcExpiry} placeholder="DD.MM.RRRR" placeholderTextColor="#4A5568" />
            <Text style={fm.label}>UDT ważne do (DD.MM.RRRR)</Text>
            <TextInput style={fm.input} value={udtExpiry} onChangeText={setUdtExpiry} placeholder="DD.MM.RRRR" placeholderTextColor="#4A5568" />
            <Text style={fm.label}>Przegląd techniczny ważny do (DD.MM.RRRR)</Text>
            <TextInput style={fm.input} value={inspectionExpiry} onChangeText={setInspectionExpiry} placeholder="DD.MM.RRRR" placeholderTextColor="#4A5568" />

            {/* Licznik i olej */}
            <Text style={fm.sectionTitle}>🔧 Licznik i wymiana oleju</Text>
            <Text style={fm.label}>Aktualny stan licznika (km)</Text>
            <TextInput style={fm.input} value={currentMileage} onChangeText={setCurrentMileage} placeholder="np. 350000" placeholderTextColor="#4A5568" keyboardType="numeric" />
            <Text style={fm.label}>Stan licznika przy ostatniej wymianie oleju (km)</Text>
            <TextInput style={fm.input} value={lastOilChangeMileage} onChangeText={setLastOilChangeMileage} placeholder="np. 335000" placeholderTextColor="#4A5568" keyboardType="numeric" />
            <Text style={fm.label}>Interwał wymiany oleju (km)</Text>
            <TouchableOpacity style={fm.picker} onPress={() => setShowOilPicker(true)}>
              <Text style={fm.pickerText}>{oilChangeInterval} km</Text>
              <Text style={fm.pickerArrow}>▼</Text>
            </TouchableOpacity>
            {showOilPicker && (
              <View style={fm.dropdownList}>
                {OIL_INTERVALS.map((i) => (
                  <TouchableOpacity key={i} style={fm.dropdownItem} onPress={() => { setOilChangeInterval(i); setShowOilPicker(false); }}>
                    <Text style={[fm.dropdownItemText, oilChangeInterval === i && fm.dropdownItemActive]}>{i} km</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Przycisk zapisu */}
            <TouchableOpacity
              style={[fm.saveBtn, (!brand.trim() || !plate.trim() || saving) && fm.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!brand.trim() || !plate.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator color="#0D1B2A" />
              ) : (
                <Text style={fm.saveBtnText}>✅ {initial ? "Zapisz zmiany" : "Dodaj pojazd"}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose}>
              <Text style={fm.cancelBtnText}>Anuluj</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Modal Liczniki ───────────────────────────────────────────
interface MileageModalProps {
  visible: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  currentUser: { uid: string; name: string };
  onMileageAdded?: (vehicleId: string, newMileage: string) => void;
}

function MileageModal({ visible, onClose, vehicle, currentUser, onMileageAdded }: MileageModalProps) {
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [mileage, setMileage] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && vehicle) loadEntries();
  }, [visible, vehicle]);

  async function loadEntries() {
    if (!vehicle) return;
    setLoading(true);
    try {
      const q = query(collection(db, "mileageEntries"), where("vehicleId", "==", vehicle.id), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MileageEntry)));
    } catch {}
    setLoading(false);
  }

  function formatEntryDate(createdAt: any): string {
    if (!createdAt) return "";
    try {
      const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      const day = String(d.getDate()).padStart(2, "0");
      const mon = String(d.getMonth() + 1).padStart(2, "0");
      const yr = d.getFullYear();
      const hr = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${day}.${mon}.${yr} ${hr}:${min}`;
    } catch { return ""; }
  }

  async function addEntry() {
    if (!vehicle || !mileage.trim()) return;
    setSaving(true);
    try {
      const km = parseInt(mileage);
      await addDoc(collection(db, "mileageEntries"), {
        vehicleId: vehicle.id,
        mileage: km,
        addedBy: currentUser.uid,
        addedByName: currentUser.name,
        note: note.trim(),
        createdAt: serverTimestamp(),
      });
      // Zaktualizuj aktualny licznik w pojeździe
      await updateDoc(doc(db, "vehicles", vehicle.id), { currentMileage: mileage.trim() });
      // Powiadom rodzica o nowym stanie licznika
      if (onMileageAdded) onMileageAdded(vehicle.id, mileage.trim());
      // Powiadomienie systemowe
      try {
        const vLabel = vehicle.brand ? `${vehicle.brand} ${vehicle.model || ""} (${vehicle.plate || ""})`.trim() : "Pojazd";
        await notifyMileageEntry(currentUser.name || "Administrator", vLabel, km);
      } catch {}
      setMileage("");
      setNote("");
      await loadEntries();
    } catch {}
    setSaving(false);
  }

  async function deleteEntry(id: string) {
    if (!vehicle) return;
    try {
      await deleteDoc(doc(db, "mileageEntries", id));
      // Przelicz aktualny licznik po usunięciu — ustaw na najnowszy pozostały wpis
      const remaining = entries.filter((e) => e.id !== id);
      setEntries(remaining);
      const newMileage = remaining.length > 0 ? String(remaining[0].mileage) : "";
      await updateDoc(doc(db, "vehicles", vehicle.id), { currentMileage: newMileage });
      if (onMileageAdded) onMileageAdded(vehicle.id, newMileage);
    } catch {}
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={mm.overlay} onPress={onClose} />
      <View style={mm.sheet}>
        <View style={mm.header}>
          <Text style={mm.title}>📏 Liczniki — {vehicle?.plate}</Text>
          <TouchableOpacity onPress={onClose} style={mm.closeBtn}>
            <Text style={mm.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {/* Dodaj wpis */}
          <Text style={mm.sectionTitle}>Dodaj odczyt licznika</Text>
          <TextInput
            style={mm.input}
            value={mileage}
            onChangeText={setMileage}
            placeholder="Stan licznika (km)"
            placeholderTextColor="#4A5568"
            keyboardType="numeric"
          />
          <TextInput
            style={mm.input}
            value={note}
            onChangeText={setNote}
            placeholder="Notatka (opcjonalnie)"
            placeholderTextColor="#4A5568"
          />
          <TouchableOpacity
            style={[mm.addBtn, (!mileage.trim() || saving) && mm.addBtnDisabled]}
            onPress={addEntry}
            disabled={!mileage.trim() || saving}
          >
            {saving ? <ActivityIndicator color="#0D1B2A" /> : <Text style={mm.addBtnText}>+ Dodaj odczyt</Text>}
          </TouchableOpacity>

          {/* Historia */}
          <Text style={mm.sectionTitle}>Historia odczytów</Text>
          {loading ? (
            <ActivityIndicator color="#F5A623" style={{ marginTop: 20 }} />
          ) : entries.length === 0 ? (
            <Text style={mm.emptyText}>Brak historii odczytów</Text>
          ) : (
            entries.map((e) => (
              <View key={e.id} style={mm.entryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={mm.entryMileage}>{e.mileage.toLocaleString()} km</Text>
                  <Text style={mm.entryMeta}>{e.addedByName}</Text>
                  {formatEntryDate((e as any).createdAt) ? (
                    <Text style={[mm.entryMeta, { color: "#4A5568" }]}>{formatEntryDate((e as any).createdAt)}</Text>
                  ) : null}
                  {e.note ? <Text style={mm.entryNote}>{e.note}</Text> : null}
                </View>
                <TouchableOpacity style={mm.deleteBtn} onPress={() => deleteEntry(e.id)}>
                  <Text style={mm.deleteBtnText}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Modal Usterki ────────────────────────────────────────────
interface FaultsModalProps {
  visible: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
}

function FaultsModal({ visible, onClose, vehicle }: FaultsModalProps) {
  const [faults, setFaults] = useState<Fault[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && vehicle) loadFaults();
  }, [visible, vehicle]);

  async function loadFaults() {
    if (!vehicle) return;
    setLoading(true);
    try {
      const q = query(collection(db, "faults"), where("vehicleId", "==", vehicle.id), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setFaults(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Fault)));
    } catch {}
    setLoading(false);
  }

  function getFaultStatusColor(status: string) {
    switch (status) {
      case "new": case "nowa": return "#F87171";
      case "in_progress": case "w trakcie": return "#F5A623";
      case "resolved": case "naprawiona": return "#4ADE80";
      default: return "#8899AA";
    }
  }

  function getFaultStatusLabel(status: string) {
    switch (status) {
      case "new": return "Nowa";
      case "in_progress": return "W trakcie";
      case "resolved": return "Naprawiona";
      default: return status;
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={fm.overlay} onPress={onClose} />
      <View style={[mm.sheet, { top: "20%" }]}>
        <View style={mm.header}>
          <Text style={mm.title}>🔧 Usterki — {vehicle?.plate}</Text>
          <TouchableOpacity onPress={onClose} style={mm.closeBtn}>
            <Text style={mm.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {loading ? (
            <ActivityIndicator color="#F5A623" style={{ marginTop: 20 }} />
          ) : faults.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={{ color: "#4ADE80", fontSize: 16, fontWeight: "700", marginTop: 12 }}>Brak usterek</Text>
              <Text style={{ color: "#8899AA", fontSize: 13, marginTop: 4 }}>Pojazd nie ma zgłoszonych usterek</Text>
            </View>
          ) : (
            faults.map((fault) => {
              const color = getFaultStatusColor(fault.status);
              return (
                <View key={fault.id} style={fault_s.card}>
                  <View style={fault_s.cardTop}>
                    <Text style={fault_s.title}>{fault.title}</Text>
                    <View style={[fault_s.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
                      <Text style={[fault_s.badgeText, { color }]}>{getFaultStatusLabel(fault.status)}</Text>
                    </View>
                  </View>
                  {fault.description ? <Text style={fault_s.desc}>{fault.description}</Text> : null}
                  {fault.reportedBy ? <Text style={fault_s.meta}>Zgłosił: {fault.reportedBy}</Text> : null}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Karta pojazdu ────────────────────────────────────────────
interface VehicleCardProps {
  vehicle: Vehicle;
  onEdit: (v: Vehicle) => void;
  onDelete: (v: Vehicle) => void;
  onMileage: (v: Vehicle) => void;
  onFaults: (v: Vehicle) => void;
}

function VehicleCard({ vehicle, onEdit, onDelete, onMileage, onFaults }: VehicleCardProps) {
  const statusColor = getStatusColor(vehicle.status);
  const oil = oilStatus(vehicle);

  // Zbierz terminy
  const terms = [
    { label: "OC", date: vehicle.ocExpiry },
    { label: "AC", date: vehicle.acExpiry },
    { label: "UDT", date: vehicle.udtExpiry },
    { label: "Przegląd", date: vehicle.inspectionExpiry },
  ].filter((t) => t.date);

  const urgentTerms = terms.filter((t) => {
    const d = daysUntil(t.date);
    return d !== null && d <= 30;
  });

  return (
    <View style={vc.card}>
      {/* Nagłówek karty */}
      <View style={vc.cardTop}>
        {vehicle.photoUrl ? (
          <Image source={{ uri: vehicle.photoUrl }} style={vc.photo} resizeMode="cover" />
        ) : (
          <View style={vc.photoPlaceholder}>
            <Text style={vc.photoPlaceholderText}>🚛</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={vc.brandModel}>{vehicle.brand} {vehicle.model}</Text>
          <Text style={vc.plate}>{vehicle.plate}</Text>
          {vehicle.assignedEmployeeName ? (
            <Text style={vc.assigned}>👤 {vehicle.assignedEmployeeName}</Text>
          ) : null}
        </View>
        <View style={[vc.statusBadge, { backgroundColor: `${statusColor}22`, borderColor: `${statusColor}55` }]}>
          <Text style={[vc.statusText, { color: statusColor }]}>{vehicle.status}</Text>
        </View>
      </View>

      {/* Dane */}
      <View style={vc.dataRow}>
        {vehicle.year ? <Text style={vc.dataChip}>📅 {vehicle.year}</Text> : null}
        {vehicle.vin ? <Text style={vc.dataChip}>VIN: {vehicle.vin.substring(0, 8)}...</Text> : null}
        {vehicle.dmc ? <Text style={vc.dataChip}>DMC: {vehicle.dmc} kg</Text> : null}
      </View>

      {/* Status oleju */}
      {vehicle.currentMileage && (
        <View style={[vc.oilRow, { borderLeftColor: oil.color }]}>
          <Text style={[vc.oilText, { color: oil.color }]}>🔧 {oil.label}</Text>
        </View>
      )}

      {/* Pilne terminy */}
      {urgentTerms.length > 0 && (
        <View style={vc.termsRow}>
          {urgentTerms.map((t) => {
            const d = daysUntil(t.date);
            const color = urgencyColor(d);
            return (
              <View key={t.label} style={[vc.termBadge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
                <Text style={[vc.termText, { color }]}>{t.label}: {d !== null && d < 0 ? "Wygasło" : `${d} dni`}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Przyciski akcji */}
      <View style={vc.actionsRow}>
        <TouchableOpacity style={vc.actionBtn} onPress={() => onEdit(vehicle)}>
          <Text style={vc.actionBtnText}>✏️ Edytuj</Text>
        </TouchableOpacity>
        <TouchableOpacity style={vc.actionBtn} onPress={() => onMileage(vehicle)}>
          <Text style={vc.actionBtnText}>📏 Liczniki</Text>
        </TouchableOpacity>
        <TouchableOpacity style={vc.actionBtn} onPress={() => onFaults(vehicle)}>
          <Text style={vc.actionBtnText}>🔧 Usterki</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[vc.actionBtn, vc.deleteBtn]} onPress={() => onDelete(vehicle)}>
          <Text style={vc.deleteBtnText}>🗑 Usuń</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Modal potwierdzenia usunięcia ────────────────────────────
function ConfirmDeleteModal({ visible, vehicle, onConfirm, onCancel }: {
  visible: boolean;
  vehicle: Vehicle | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={cd.overlay} onPress={onCancel} />
      <View style={cd.box}>
        <Text style={cd.icon}>🗑️</Text>
        <Text style={cd.title}>Usuń pojazd</Text>
        <Text style={cd.desc}>
          Czy na pewno chcesz usunąć pojazd{"\n"}
          <Text style={{ color: "#F5A623", fontWeight: "700" }}>
            {vehicle?.brand} {vehicle?.model} ({vehicle?.plate})
          </Text>?{"\n"}
          Tej operacji nie można cofnąć.
        </Text>
        <View style={cd.btnRow}>
          <TouchableOpacity style={cd.cancelBtn} onPress={onCancel}>
            <Text style={cd.cancelBtnText}>Anuluj</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cd.confirmBtn} onPress={onConfirm}>
            <Text style={cd.confirmBtnText}>Usuń</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Główny ekran Pojazdy ─────────────────────────────────────
export default function PojazdyScreen() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [mileageVehicle, setMileageVehicle] = useState<Vehicle | null>(null);
  const [showMileage, setShowMileage] = useState(false);
  const [faultsVehicle, setFaultsVehicle] = useState<Vehicle | null>(null);
  const [showFaults, setShowFaults] = useState(false);

  // Callback po dodaniu/usunięciu wpisu licznika — aktualizuje pojazd w liście
  function handleMileageAdded(vehicleId: string, newMileage: string) {
    setVehicles((prev) =>
      prev.map((v) => v.id === vehicleId ? { ...v, currentMileage: newMileage } : v)
    );
    // Odśwież też mileageVehicle jeśli jest otwarty
    setMileageVehicle((prev) => prev?.id === vehicleId ? { ...prev, currentMileage: newMileage } : prev);
  }

  // Pobierz dane przy starcie
  useEffect(() => {
    loadVehicles();
    loadEmployees();
  }, []);

  async function loadVehicles() {
    setLoading(true);
    try {
      const q = query(collection(db, "vehicles"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle)));
    } catch {
      // Fallback bez orderBy jeśli brak indeksu
      try {
        const snap = await getDocs(collection(db, "vehicles"));
        setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle)));
      } catch {}
    }
    setLoading(false);
  }

  async function loadEmployees() {
    try {
      const snap = await getDocs(collection(db, "employees"));
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
    } catch {}
  }

  async function handleSaveVehicle(data: Omit<Vehicle, "id">) {
    if (editVehicle) {
      // Edycja
      await updateDoc(doc(db, "vehicles", editVehicle.id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
      setVehicles((prev) =>
        prev.map((v) => v.id === editVehicle.id ? { ...v, ...data } : v)
      );
    } else {
      // Dodanie
      const docRef = await addDoc(collection(db, "vehicles"), {
        ...data,
        createdAt: serverTimestamp(),
      });
      setVehicles((prev) => [{ id: docRef.id, ...data } as Vehicle, ...prev]);
    }
    setEditVehicle(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    // Usuń zdjęcie ze Storage jeśli istnieje
    if (deleteTarget.photoPath) {
      try {
        await deleteObject(ref(storage, deleteTarget.photoPath));
      } catch {}
    }
    // Usuń z Firestore
    await deleteDoc(doc(db, "vehicles", deleteTarget.id));
    setVehicles((prev) => prev.filter((v) => v.id !== deleteTarget.id));
    setDeleteTarget(null);
    setShowDeleteModal(false);
  }

  function openEdit(vehicle: Vehicle) {
    setEditVehicle(vehicle);
    setShowForm(true);
  }

  function openDelete(vehicle: Vehicle) {
    setDeleteTarget(vehicle);
    setShowDeleteModal(true);
  }

  function openMileage(vehicle: Vehicle) {
    setMileageVehicle(vehicle);
    setShowMileage(true);
  }

  function openFaults(vehicle: Vehicle) {
    setFaultsVehicle(vehicle);
    setShowFaults(true);
  }

  // Filtrowanie
  const filtered = vehicles.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      v.brand?.toLowerCase().includes(q) ||
      v.model?.toLowerCase().includes(q) ||
      v.plate?.toLowerCase().includes(q) ||
      v.assignedEmployeeName?.toLowerCase().includes(q)
    );
  });

  // Statystyki
  const total = vehicles.length;
  const active = vehicles.filter((v) => v.status?.toLowerCase() === "aktywny").length;
  const repair = vehicles.filter((v) => v.status?.toLowerCase() === "w naprawie").length;

  return (
    <View style={s.container}>
      <AdminHeader pageTitle="Pojazdy" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Statystyki */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{total}</Text>
            <Text style={s.statLabel}>Wszystkie</Text>
          </View>
          <View style={[s.statCard, { borderColor: "rgba(74,222,128,0.3)" }]}>
            <Text style={[s.statNum, { color: "#4ADE80" }]}>{active}</Text>
            <Text style={s.statLabel}>Aktywne</Text>
          </View>
          <View style={[s.statCard, { borderColor: "rgba(245,166,35,0.3)" }]}>
            <Text style={[s.statNum, { color: "#F5A623" }]}>{repair}</Text>
            <Text style={s.statLabel}>W naprawie</Text>
          </View>
        </View>

        {/* Wyszukiwarka i przycisk Dodaj */}
        <View style={s.searchRow}>
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Szukaj pojazdu..."
              placeholderTextColor="#4A5568"
            />
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => { setEditVehicle(null); setShowForm(true); }}
          >
            <Text style={s.addBtnText}>+ Dodaj</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.countText}>
          Pojazdy: <Text style={{ color: "#F5A623", fontWeight: "700" }}>{total}</Text>
          {"  "}Aktywne: <Text style={{ color: "#4ADE80", fontWeight: "700" }}>{active}</Text>
        </Text>

        {/* Lista pojazdów */}
        {loading ? (
          <ActivityIndicator color="#F5A623" size="large" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>🚛</Text>
            <Text style={s.emptyTitle}>{search ? "Brak wyników" : "Brak pojazdów"}</Text>
            <Text style={s.emptyDesc}>
              {search ? "Zmień kryteria wyszukiwania" : "Dodaj pierwszy pojazd do floty"}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {filtered.map((v) => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                onEdit={openEdit}
                onDelete={openDelete}
                onMileage={openMileage}
                onFaults={openFaults}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <AdminBottomNav />

      {/* Formularz dodawania/edycji */}
      <VehicleFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditVehicle(null); }}
        onSave={handleSaveVehicle}
        initial={editVehicle}
        employees={employees}
      />

      {/* Modal potwierdzenia usunięcia */}
      <ConfirmDeleteModal
        visible={showDeleteModal}
        vehicle={deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteModal(false); setDeleteTarget(null); }}
      />

      {/* Modal Liczniki */}
      <MileageModal
        visible={showMileage}
        onClose={() => { setShowMileage(false); setMileageVehicle(null); }}
        vehicle={mileageVehicle}
        currentUser={{ uid: user?.uid || "admin", name: user?.name || "Administrator" }}
        onMileageAdded={handleMileageAdded}
      />

      {/* Modal Usterki */}
      <FaultsModal
        visible={showFaults}
        onClose={() => { setShowFaults(false); setFaultsVehicle(null); }}
        vehicle={faultsVehicle}
      />
    </View>
  );
}

// ─── Style główne ─────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1A2A3A",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
  },
  statNum: { color: "#F5A623", fontSize: 22, fontWeight: "800" },
  statLabel: { color: "#8899AA", fontSize: 11, marginTop: 2 },
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
    alignItems: "center",
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A2A3A",
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    height: 46,
  },
  searchIcon: { fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14 },
  addBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 14,
    paddingHorizontal: 18,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnText: { color: "#0D1B2A", fontWeight: "800", fontSize: 14 },
  countText: {
    color: "#8899AA",
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  emptyWrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginTop: 16 },
  emptyDesc: { color: "#8899AA", fontSize: 14, marginTop: 6, textAlign: "center" },
});

// ─── Style karty pojazdu ──────────────────────────────────────
const vc = StyleSheet.create({
  card: {
    backgroundColor: "#1A2A3A",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  photo: { width: 64, height: 64, borderRadius: 12 },
  photoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#2A3A4A",
    justifyContent: "center",
    alignItems: "center",
  },
  photoPlaceholderText: { fontSize: 28 },
  brandModel: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  plate: { color: "#F5A623", fontSize: 14, fontWeight: "800", marginTop: 2 },
  assigned: { color: "#8899AA", fontSize: 12, marginTop: 3 },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  dataRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  dataChip: {
    backgroundColor: "#0D1B2A",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    color: "#8899AA",
    fontSize: 11,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  oilRow: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 8,
  },
  oilText: { fontSize: 12, fontWeight: "600" },
  termsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  termBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  termText: { fontSize: 11, fontWeight: "700" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  actionBtn: {
    backgroundColor: "#2A3A4A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#3A4A5A",
  },
  actionBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  deleteBtn: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderColor: "rgba(248,113,113,0.3)",
  },
  deleteBtnText: { color: "#F87171", fontSize: 12, fontWeight: "600" },
});

// ─── Style formularza ─────────────────────────────────────────
const fm = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    top: "5%",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1A2A3A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  sheetTitle: { color: "#F5A623", fontSize: 18, fontWeight: "800" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(248,113,113,0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
  },
  closeBtnText: { color: "#F87171", fontSize: 16, fontWeight: "700" },
  sectionTitle: {
    color: "#F5A623",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  label: { color: "#8899AA", fontSize: 12, marginBottom: 4, marginTop: 10 },
  input: {
    backgroundColor: "#0D1B2A",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  picker: {
    backgroundColor: "#0D1B2A",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  pickerText: { color: "#FFFFFF", fontSize: 14 },
  pickerArrow: { color: "#F5A623", fontSize: 12 },
  dropdownList: {
    backgroundColor: "#0D1B2A",
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A2A3A",
  },
  dropdownItemText: { color: "#FFFFFF", fontSize: 14 },
  dropdownItemActive: { color: "#F5A623", fontWeight: "700" },
  photoRow: { marginTop: 4 },
  photoPreview: { position: "relative" },
  photoImg: { width: "100%", height: 160, borderRadius: 12 },
  removePhotoBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(248,113,113,0.85)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  removePhotoBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  uploadPhotoBtn: {
    backgroundColor: "#0D1B2A",
    borderRadius: 12,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#2A3A4A",
    borderStyle: "dashed",
    gap: 6,
  },
  uploadPhotoIcon: { fontSize: 28 },
  uploadPhotoText: { color: "#8899AA", fontSize: 13 },
  saveBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 24,
  },
  saveBtnDisabled: { backgroundColor: "#2A3A4A", opacity: 0.5 },
  saveBtnText: { color: "#0D1B2A", fontSize: 15, fontWeight: "800" },
  cancelBtn: {
    backgroundColor: "#2A3A4A",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 10,
  },
  cancelBtnText: { color: "#8899AA", fontSize: 14, fontWeight: "600" },
});

// ─── Style modalu Liczniki ────────────────────────────────────
const mm = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    top: "15%",
    backgroundColor: "#1A2A3A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  title: { color: "#F5A623", fontSize: 16, fontWeight: "800" },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(248,113,113,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: { color: "#F87171", fontSize: 14, fontWeight: "700" },
  sectionTitle: { color: "#8899AA", fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
  input: {
    backgroundColor: "#0D1B2A",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#2A3A4A",
    marginBottom: 8,
  },
  addBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  addBtnDisabled: { backgroundColor: "#2A3A4A", opacity: 0.5 },
  addBtnText: { color: "#0D1B2A", fontWeight: "800", fontSize: 14 },
  emptyText: { color: "#4A5568", fontSize: 13, fontStyle: "italic", textAlign: "center", marginTop: 20 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
    gap: 8,
  },
  entryMileage: { color: "#F5A623", fontSize: 15, fontWeight: "700" },
  entryMeta: { color: "#8899AA", fontSize: 12 },
  entryNote: { color: "#FFFFFF", fontSize: 12, marginTop: 2 },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(248,113,113,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
  },
  deleteBtnText: { fontSize: 14 },
});

// ─── Style modalu Usterki ─────────────────────────────────────
const fault_s = StyleSheet.create({
  card: {
    backgroundColor: "#0D1B2A",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  title: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", flex: 1, marginRight: 8 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  desc: { color: "#8899AA", fontSize: 12, marginBottom: 4 },
  meta: { color: "#4A5568", fontSize: 11 },
});

// ─── Style modalu potwierdzenia usunięcia ─────────────────────
const cd = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  box: {
    position: "absolute",
    top: "30%",
    left: 32,
    right: 32,
    backgroundColor: "#1A2A3A",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  icon: { fontSize: 36, marginBottom: 8 },
  title: { color: "#F87171", fontSize: 18, fontWeight: "800", marginBottom: 8 },
  desc: { color: "#8899AA", fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  btnRow: { flexDirection: "row", gap: 12, width: "100%" },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#2A3A4A",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: "#8899AA", fontWeight: "700" },
  confirmBtn: {
    flex: 1,
    backgroundColor: "rgba(248,113,113,0.15)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.4)",
  },
  confirmBtnText: { color: "#F87171", fontWeight: "800" },
});
