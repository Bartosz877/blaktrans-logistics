import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import AdminHeader from "../../components/AdminHeader";
import AdminBottomNav from "../../components/AdminBottomNav";
import { useRouter } from "expo-router";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  actorName: string;
  actorRole?: string;
  read: boolean;
  createdAt: any;
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

export default function PowiadomieniaScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

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

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={s.container}>
      <AdminHeader />
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 20 }}>
          {notifications.map((n) => (
            <TouchableOpacity
              key={n.id}
              style={[s.card, !n.read && s.cardUnread]}
              onPress={() => markRead(n.id)}
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
                <Text style={s.cardBody} numberOfLines={2}>{n.body}</Text>
                <View style={s.cardMeta}>
                  <Text style={s.metaActor} numberOfLines={1}>{n.actorName}</Text>
                  {n.actorRole && (
                    <View style={s.roleBadge}>
                      <Text style={s.roleBadgeText}>{n.actorRole}</Text>
                    </View>
                  )}
                  <Text style={s.metaDate}>{formatDate(n.createdAt)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <AdminBottomNav />
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
    padding: 14,
    marginBottom: 10,
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
  cardBody: { color: "#8899AA", fontSize: 13, lineHeight: 18, marginBottom: 8 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaActor: { color: "#F5A623", fontSize: 12, fontWeight: "600" },
  roleBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: { color: "#8899AA", fontSize: 10, fontWeight: "600" },
  metaDate: { color: "#4A5568", fontSize: 11, marginLeft: "auto" },
});
