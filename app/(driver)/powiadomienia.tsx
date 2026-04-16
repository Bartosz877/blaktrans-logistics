import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import DriverHeader from "../../components/DriverHeader";
import { useRouter } from "expo-router";
import { useAuth } from "../_layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  message?: string;
  actorName?: string;
  actorRole?: string;
  read: boolean;
  createdAt: any;
  leaveRequestId?: string;
  forRole?: string;
  userId?: string;
  recipientId?: string;
}

function typeIcon(type: string): string {
  switch (type) {
    case "leave_request": return "📅";
    case "leave_approved": return "✅";
    case "leave_rejected": return "❌";
    case "mileage_entry": return "📏";
    case "fault_report": return "🔧";
    case "employee_added": return "👤";
    case "vehicle_added": return "🚚";
    case "contract_uploaded": return "📄";
    default: return "🔔";
  }
}

function formatDate(createdAt: any): string {
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

// ─── Modal potwierdzenia usunięcia ─────────────────────────────
// Zastępuje Alert.alert, który na web (react-native-web) jest pustą funkcją
function DeleteConfirmModal({
  visible,
  title,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={dm.overlay} onPress={onCancel}>
        <Pressable style={dm.box} onPress={(e) => e.stopPropagation()}>
          <Text style={dm.icon}>🗑</Text>
          <Text style={dm.heading}>Usuń powiadomienie</Text>
          <Text style={dm.desc} numberOfLines={3}>
            {title}
          </Text>
          <Text style={dm.warning}>Tej operacji nie można cofnąć.</Text>
          <View style={dm.btns}>
            <TouchableOpacity style={dm.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={dm.cancelText}>Anuluj</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dm.deleteBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={dm.deleteText}>Usuń</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function PowiadomieniaScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Notification | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    // Kierowca / Dygacz widzi TYLKO swoje powiadomienia (forRole=driver + recipientId lub userId)
    const q = query(
      collection(db, "notifications"),
      where("forRole", "==", "driver"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification));
      // Filtruj: tylko powiadomienia z recipientId === uid lub userId === uid
      const filtered = all.filter((n) => {
        if (n.recipientId) return n.recipientId === user!.uid;
        if (n.userId) return n.userId === user!.uid;
        return false; // broadcast bez adresata - nie pokazuj
      });
      setNotifications(filtered);
      setLoading(false);
    }, (err) => {
      console.warn("[powiadomienia] Błąd zapytania:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  async function markRead(id: string) {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch {}
  }

  async function markAllRead() {
    try {
      const unread = notifications.filter((n) => !n.read);
      const batch = writeBatch(db);
      for (const n of unread) {
        batch.update(doc(db, "notifications", n.id), { read: true });
      }
      await batch.commit();
    } catch {}
  }

  async function confirmDeleteExecute() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "notifications", deleteTarget.id));
      // Usuń z lokalnego stanu natychmiast — onSnapshot też zaktualizuje, ale to jest szybsze
      setNotifications((prev) => prev.filter((n) => n.id !== deleteTarget.id));
    } catch (err) {
      console.warn("[powiadomienia] Błąd usuwania:", err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function handleNotificationPress(n: Notification) {
    markRead(n.id);
    switch (n.type) {
      case "leave_approved":
      case "leave_rejected":
      case "leave_request": {
        const leaveId = n.leaveRequestId;
        if (leaveId) {
          router.push(`/(driver)/sprawy?leaveId=${leaveId}` as any);
        } else {
          router.push("/(driver)/sprawy" as any);
        }
        break;
      }
      case "contract_added": {
        // Przekieruj do ekranu umowy pracownika
        router.push("/(driver)/umowa" as any);
        break;
      }
      default:
        break;
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <View style={s.container}>
      <DriverHeader />
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>← Wróć</Text>
        </TouchableOpacity>
        <Text style={s.pageTitle}>🔔 Powiadomienia{unreadCount > 0 ? ` (${unreadCount})` : ""}</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={s.markAllBtn}>
            <Text style={s.markAllText}>Oznacz wszystkie</Text>
          </TouchableOpacity>
        )}
      </View>
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyText}>Brak powiadomień</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 16 }}
        >
          {notifications.map((n) => (
            <View key={n.id} style={[s.card, !n.read && s.cardUnread]}>
              <TouchableOpacity
                style={s.cardMain}
                onPress={() => handleNotificationPress(n)}
                activeOpacity={0.8}
              >
                <View style={s.cardLeft}>
                  <Text style={s.icon}>{typeIcon(n.type)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.cardHeader}>
                    <Text style={[s.cardTitle, !n.read && s.cardTitleUnread]} numberOfLines={1}>
                      {n.title}
                    </Text>
                    {!n.read && <View style={s.unreadDot} />}
                  </View>
                  <Text style={s.cardBody} numberOfLines={2}>{n.body || n.message || ""}</Text>
                  <View style={s.cardMeta}>
                    {n.actorName ? <Text style={s.metaActor} numberOfLines={1}>{n.actorName}</Text> : null}
                    {n.actorRole && (
                      <View style={s.roleBadge}>
                        <Text style={s.roleBadgeText}>{n.actorRole}</Text>
                      </View>
                    )}
                    <Text style={s.metaDate}>{formatDate(n.createdAt)}</Text>
                  </View>
                  {(n.type === "leave_approved" || n.type === "leave_rejected") && (
                    <Text style={s.tapHint}>Dotknij, aby zobaczyć wniosek →</Text>
                  )}
                </View>
              </TouchableOpacity>
              {/* Przycisk usunięcia — otwiera Modal (działa na web i na telefonie) */}
              <TouchableOpacity
                style={s.deleteBtn}
                onPress={() => setDeleteTarget(n)}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={s.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Modal potwierdzenia usunięcia */}
      <DeleteConfirmModal
        visible={!!deleteTarget}
        title={deleteTarget?.title ?? ""}
        onConfirm={confirmDeleteExecute}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  backBtn: { paddingVertical: 4, paddingRight: 8 },
  backBtnText: { color: "#F5A623", fontSize: 14, fontWeight: "700" },
  pageTitle: { flex: 1, color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  markAllBtn: {
    backgroundColor: "rgba(245,166,35,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  markAllText: { color: "#F5A623", fontSize: 12, fontWeight: "700" },
  emptyText: { color: "#687076", fontSize: 15, fontStyle: "italic" },
  card: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
    overflow: "hidden",
    alignItems: "stretch",
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    padding: 14,
    gap: 12,
    alignItems: "flex-start",
  },
  cardUnread: {
    backgroundColor: "rgba(245,166,35,0.06)",
    borderColor: "rgba(245,166,35,0.25)",
  },
  cardLeft: { paddingTop: 2 },
  icon: { fontSize: 22 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  cardTitle: { color: "#8899AA", fontSize: 14, fontWeight: "600", flex: 1 },
  cardTitleUnread: { color: "#FFFFFF" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F5A623" },
  cardBody: { color: "#8899AA", fontSize: 13, lineHeight: 18, marginBottom: 4 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 },
  metaActor: { color: "#F5A623", fontSize: 12, fontWeight: "600" },
  roleBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: { color: "#8899AA", fontSize: 10, fontWeight: "600" },
  metaDate: { color: "#4A5568", fontSize: 11, marginLeft: "auto" },
  tapHint: { color: "#F5A623", fontSize: 11, fontStyle: "italic", marginTop: 2 },
  deleteBtn: {
    width: 48,
    justifyContent: "center",
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(248,113,113,0.06)",
  },
  deleteIcon: { fontSize: 18 },
});

// Styl modala potwierdzenia
const dm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  box: {
    backgroundColor: "#1B2838",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  icon: { fontSize: 36, marginBottom: 12 },
  heading: {
    color: "#F87171",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  desc: {
    color: "#CCDDEE",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 6,
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
    fontWeight: "700",
  },
});
