import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../_layout";

interface Conversation {
  id: string;
  participants: string[];
  participantNames: string[];
  lastMessage: string;
  lastMessageAt: any;
  unread?: number;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: any;
}

interface Employee {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  uid?: string;
}

export default function SkrzynkaScreen() {
  const { user } = useAuth();
  const [view, setView] = useState<"list" | "conversation" | "new">("list");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadConversations();
    loadEmployees();
  }, []);

  async function loadConversations() {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "conversations"), orderBy("lastMessageAt", "desc"))
      );
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation));
      // Filtruj tylko rozmowy z udziałem aktualnego użytkownika
      const mine = all.filter(
        (c) => c.participants?.includes(user?.uid || "") || c.participants?.includes(user?.email || "")
      );
      setConversations(mine.length > 0 ? mine : all.slice(0, 10));
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployees() {
    try {
      const snap = await getDocs(collection(db, "employees"));
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
    } catch {}
  }

  function openConversation(conv: Conversation) {
    setActiveConv(conv);
    setView("conversation");
    loadMessages(conv.id);
  }

  async function loadMessages(convId: string) {
    try {
      const snap = await getDocs(
        query(collection(db, "conversations", convId, "messages"), orderBy("createdAt", "asc"))
      );
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
    } catch {
      setMessages([]);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !activeConv) return;
    setSending(true);
    try {
      const msgData = {
        senderId: user?.uid || user?.email || "",
        senderName: user?.name || user?.email || "Administrator",
        text: newMessage.trim(),
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "conversations", activeConv.id, "messages"), msgData);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), ...msgData, createdAt: new Date() },
      ]);
      setNewMessage("");
    } catch {}
    setSending(false);
  }

  async function startNewConversation(emp: Employee) {
    const empName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email || "Pracownik";
    const myName = user?.name || user?.email || "Administrator";
    try {
      const docRef = await addDoc(collection(db, "conversations"), {
        participants: [user?.uid || user?.email || "", emp.uid || emp.email || emp.id],
        participantNames: [myName, empName],
        lastMessage: "",
        lastMessageAt: serverTimestamp(),
      });
      const newConv: Conversation = {
        id: docRef.id,
        participants: [user?.uid || "", emp.uid || emp.id],
        participantNames: [myName, empName],
        lastMessage: "",
        lastMessageAt: new Date(),
      };
      setActiveConv(newConv);
      setMessages([]);
      setView("conversation");
    } catch {}
  }

  function formatTime(ts: any): string {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "teraz";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
  }

  // ─── Widok: Lista rozmów ──────────────────────────────────────
  if (view === "list") {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>← Wróć</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Skrzynka odbiorcza</Text>
          <TouchableOpacity style={s.newBtn} onPress={() => setView("new")}>
            <Text style={s.newBtnText}>+ Nowa</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#F5A623" />
          </View>
        ) : conversations.length === 0 ? (
          <View style={s.center}>
            <Text style={s.emptyIcon}>📬</Text>
            <Text style={s.emptyTitle}>Brak wiadomości</Text>
            <Text style={s.emptyDesc}>Rozpocznij nową rozmowę klikając + Nowa</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {conversations.map((conv) => {
              const otherName = conv.participantNames?.find(
                (n) => n !== (user?.name || user?.email)
              ) || conv.participantNames?.[0] || "Rozmowa";
              const initials = otherName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
              return (
                <TouchableOpacity
                  key={conv.id}
                  style={s.convItem}
                  onPress={() => openConversation(conv)}
                >
                  <View style={s.convAvatar}>
                    <Text style={s.convAvatarText}>{initials}</Text>
                  </View>
                  <View style={s.convInfo}>
                    <Text style={s.convName}>{otherName}</Text>
                    <Text style={s.convLast} numberOfLines={1}>
                      {conv.lastMessage || "Brak wiadomości"}
                    </Text>
                  </View>
                  <Text style={s.convTime}>{formatTime(conv.lastMessageAt)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  // ─── Widok: Nowa rozmowa ──────────────────────────────────────
  if (view === "new") {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setView("list")} style={s.backBtn}>
            <Text style={s.backText}>← Wróć</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Nowa rozmowa</Text>
          <View style={{ width: 60 }} />
        </View>
        <Text style={s.sectionLabel}>Wybierz pracownika:</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {employees.map((emp) => {
            const name = `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || emp.email || "Pracownik";
            const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
            return (
              <TouchableOpacity
                key={emp.id}
                style={s.convItem}
                onPress={() => startNewConversation(emp)}
              >
                <View style={s.convAvatar}>
                  <Text style={s.convAvatarText}>{initials}</Text>
                </View>
                <View style={s.convInfo}>
                  <Text style={s.convName}>{name}</Text>
                  <Text style={s.convLast}>{emp.email || "brak emaila"}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ─── Widok: Rozmowa ───────────────────────────────────────────
  const otherName = activeConv?.participantNames?.find(
    (n) => n !== (user?.name || user?.email)
  ) || "Rozmowa";

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => { setView("list"); setActiveConv(null); }} style={s.backBtn}>
          <Text style={s.backText}>← Wróć</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{otherName}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={s.center}>
            <Text style={s.emptyDesc}>Brak wiadomości. Napisz pierwszą!</Text>
          </View>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.uid || msg.senderId === user?.email;
            return (
              <View key={msg.id} style={[s.msgWrap, isMe ? s.msgWrapMe : s.msgWrapOther]}>
                {!isMe && (
                  <Text style={s.msgSender}>{msg.senderName}</Text>
                )}
                <View style={[s.msgBubble, isMe ? s.msgBubbleMe : s.msgBubbleOther]}>
                  <Text style={[s.msgText, isMe ? s.msgTextMe : s.msgTextOther]}>
                    {msg.text}
                  </Text>
                </View>
                <Text style={[s.msgTime, isMe ? { textAlign: "right" } : {}]}>
                  {formatTime(msg.createdAt)}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Pole wpisywania */}
      <View style={s.inputRow}>
        <TextInput
          style={s.msgInput}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Napisz wiadomość..."
          placeholderTextColor="#4A6080"
          multiline
        />
        <TouchableOpacity
          style={[s.sendBtn, !newMessage.trim() && s.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#0D1B2A" size="small" />
          ) : (
            <Text style={s.sendBtnText}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: "#1B2838",
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4A",
  },
  backBtn: {},
  backText: { color: "#8899AA", fontSize: 14, fontWeight: "600" },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  newBtn: {
    backgroundColor: "#F5A623",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  newBtnText: { color: "#0D1B2A", fontWeight: "800", fontSize: 13 },
  sectionLabel: {
    color: "#8899AA",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  // Lista rozmów
  convItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1B2838",
    gap: 14,
  },
  convAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1E3A5F",
    borderWidth: 2,
    borderColor: "#F5A623",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  convAvatarText: { color: "#F5A623", fontSize: 15, fontWeight: "800" },
  convInfo: { flex: 1 },
  convName: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", marginBottom: 3 },
  convLast: { color: "#8899AA", fontSize: 13 },
  convTime: { color: "#687076", fontSize: 12 },
  // Wiadomości
  messagesContent: { padding: 16, gap: 8 },
  msgWrap: { maxWidth: "80%" },
  msgWrapMe: { alignSelf: "flex-end", alignItems: "flex-end" },
  msgWrapOther: { alignSelf: "flex-start", alignItems: "flex-start" },
  msgSender: { color: "#8899AA", fontSize: 11, marginBottom: 3, paddingLeft: 4 },
  msgBubble: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  msgBubbleMe: { backgroundColor: "#F5A623" },
  msgBubbleOther: { backgroundColor: "#162030", borderWidth: 1, borderColor: "#2A3A4A" },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextMe: { color: "#0D1B2A", fontWeight: "600" },
  msgTextOther: { color: "#FFFFFF" },
  msgTime: { color: "#687076", fontSize: 11, marginTop: 3, paddingHorizontal: 4 },
  // Pole wpisywania
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    backgroundColor: "#1B2838",
    borderTopWidth: 1,
    borderTopColor: "#2A3A4A",
    gap: 10,
  },
  msgInput: {
    flex: 1,
    backgroundColor: "#162030",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F5A623",
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "#2A3A4A" },
  sendBtnText: { color: "#0D1B2A", fontSize: 18, fontWeight: "800" },
  // Puste stany
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyDesc: { color: "#8899AA", fontSize: 14, textAlign: "center" },
});
