/**
 * czat.tsx — ekran czatu
 *
 * Naprawione problemy:
 * 1. Nieskończony spinner: query z orderBy("createdAt") wymaga złożonego indeksu
 *    w Firestore. Zastąpiono pobieraniem bez orderBy + sortowaniem po stronie klienta.
 * 2. conversationId "broadcast_uid" było unikalne per user — wiadomości ogólne
 *    używają teraz stałego ID "general".
 * 3. loadingMessages resetowany do false nawet gdy onSnapshot zwróci błąd.
 * 4. Usunięto kafelek "Czat ogólny" — zastąpiono klasycznym układem komunikatora.
 */

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  where,
  limit,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../_layout";
import DriverHeader from "../../components/DriverHeader";

import { useRouter } from "expo-router";

// ─── Types ───────────────────────────────────────────────────
interface UserPresence {
  uid: string;
  name: string;
  role: string;
  lastSeen: any;
  online: boolean;
}

interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  createdAt: any;
  conversationId: string;
}

// ─── Helpers ─────────────────────────────────────────────────
function roleLabel(role: string): string {
  if (role === "ADMIN" || role === "administrator") return "Administrator";
  if (role === "DRIVER" || role === "driver" || role === "Kierowca") return "Kierowca";
  if (role === "Dygacz" || role === "dygacz") return "Dygacz";
  return role || "Użytkownik";
}

function roleBadgeColor(role: string): string {
  if (role === "ADMIN" || role === "administrator") return "#F87171";
  if (role === "dygacz" || role === "Dygacz") return "#F472B6";
  if (role === "DRIVER" || role === "driver") return "#60A5FA";
  return "#FBBF24";
}

function presenceLabel(p: UserPresence): string {
  if (p.online) return "aktywny teraz";
  if (!p.lastSeen) return "nieaktywny";
  try {
    const d = p.lastSeen.toDate ? p.lastSeen.toDate() : new Date(p.lastSeen);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 2) return "aktywny teraz";
    if (diffMin < 60) return `${diffMin} min temu`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} godz. temu`;
    return `${Math.floor(diffH / 24)} dni temu`;
  } catch { return "nieaktywny"; }
}

function formatMsgTime(createdAt: any): string {
  if (!createdAt) return "";
  try {
    const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return ""; }
}

function makeConversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

// ─── Cache danych użytkowników ───────────────────────────────
interface UserCache {
  name: string;
  role: string;
  email: string;
}

// ─── Main Component ──────────────────────────────────────────
export default function CzatScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserPresence | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [showUserPicker, setShowUserPicker] = useState(false);
  // Cache: uid → {name, role, email} — uzupełnia brakujące dane starych wiadomości
  const [userCache, setUserCache] = useState<Record<string, UserCache>>({});
  const scrollRef = useRef<ScrollView>(null);

  // ─── Presence — zapisz że jesteśmy online ────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const presenceRef = doc(db, "presence", user.uid);
    setDoc(presenceRef, {
      uid: user.uid,
      name: user.name || user.email || "Administrator",
      role: user.role || "ADMIN",
      online: true,
      lastSeen: serverTimestamp(),
    }, { merge: true }).catch(() => {});
    return () => {
      setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    };
  }, [user?.uid]);

  // ─── Lista użytkowników z presence ───────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      collection(db, "presence"),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() } as UserPresence))
          .filter((u) => u.uid !== user.uid)
          .sort((a, b) => {
            if (a.online && !b.online) return -1;
            if (!a.online && b.online) return 1;
            try {
              const ta = a.lastSeen?.toDate ? a.lastSeen.toDate().getTime() : 0;
              const tb = b.lastSeen?.toDate ? b.lastSeen.toDate().getTime() : 0;
              return tb - ta;
            } catch { return 0; }
          });
        setUsers(list);
      },
      () => {} // ignoruj błędy presence
    );
    return () => unsub();
  }, [user?.uid]);

  // ─── Pobierz dane użytkownika z Firestore do cache ──────────
  async function fetchUserToCache(uid: string) {
    if (!uid || userCache[uid]) return;
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const d = snap.data();
        const name = d.name ||
          `${d.firstName || ""} ${d.lastName || ""}`.trim() ||
          d.displayName ||
          d.email ||
          "Użytkownik";
        setUserCache((prev) => ({
          ...prev,
          [uid]: { name, role: d.role || "driver", email: d.email || "" },
        }));
      }
    } catch { /* ignoruj */ }
  }

  // ─── Wiadomości — BEZ orderBy (unika wymogu indeksu złożonego) ─
  // Sortowanie odbywa się po stronie klienta.
  useEffect(() => {
    if (!user?.uid) return;

    const convId = selectedUser
      ? makeConversationId(user.uid, selectedUser.uid)
      : "general"; // stały ID dla czatu ogólnego

    setLoadingMessages(true);
    setMessages([]);

    const q = query(
      collection(db, "messages"),
      where("conversationId", "==", convId),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
          // Sortuj po stronie klienta — brak wymogu indeksu złożonego
          .sort((a, b) => {
            try {
              const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds || 0) * 1000;
              const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds || 0) * 1000;
              return ta - tb;
            } catch { return 0; }
          });
        setMessages(msgs);
        setLoadingMessages(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
        // Pobierz dane autorów do cache dla wiadomości bez senderName
        const missingUids = [...new Set(
          msgs
            .filter((m) => !m.senderName && m.senderId)
            .map((m) => m.senderId)
        )];
        missingUids.forEach(fetchUserToCache);
      },
      (err) => {
        // Błąd Firestore — wyłącz spinner, pokaż pusty czat
        console.warn("[czat] onSnapshot error:", err);
        setLoadingMessages(false);
      }
    );

    return () => unsub();
  }, [selectedUser?.uid, user?.uid]);

  // ─── Wyślij wiadomość ────────────────────────────────────────
  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || !user?.uid || sending) return;
    setSending(true);
    try {
      const convId = selectedUser
        ? makeConversationId(user.uid, selectedUser.uid)
        : "general";
      // Pobierz pełne dane z cache lub z user — zawsze zapisuj imię, nazwisko i rolę
      const cached = userCache[user.uid];
      const senderName = user.name || cached?.name || user.email || "Administrator";
      const senderRole = user.role || cached?.role || "ADMIN";
      await addDoc(collection(db, "messages"), {
        text: trimmed,
        senderId: user.uid,
        senderName,
        senderRole,
        conversationId: convId,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (err) {
      console.warn("[czat] sendMessage error:", err);
    }
    setSending(false);
  }

  // ─── Wybierz rozmówcę ────────────────────────────────────────
  function selectUser(u: UserPresence | null) {
    setSelectedUser(u);
    setShowUserPicker(false);
  }

  // ─── Render ──────────────────────────────────────────────────
  const convTitle = selectedUser ? selectedUser.name : "Czat ogólny";
  const convSub = selectedUser
    ? presenceLabel(selectedUser)
    : `${users.filter((u) => u.online).length} aktywnych`;
  const convDotColor = selectedUser?.online ? "#4ADE80" : undefined;

  return (
    <View style={s.container}>
      <DriverHeader />

      {/* ── Nagłówek czatu ── */}
      <View style={s.chatHeader}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>

        {/* Awatar / inicjał */}
        <View style={[s.headerAvatar, selectedUser && { borderColor: convDotColor || "rgba(255,255,255,0.2)" }]}>
          {selectedUser ? (
            <Text style={s.headerAvatarText}>{selectedUser.name.charAt(0).toUpperCase()}</Text>
          ) : (
            <Text style={{ fontSize: 18 }}>💬</Text>
          )}
          {selectedUser && (
            <View style={[s.headerOnlineDot, { backgroundColor: selectedUser.online ? "#4ADE80" : "#374151" }]} />
          )}
        </View>

        {/* Tytuł + status */}
        <TouchableOpacity style={s.headerTitleWrap} onPress={() => setShowUserPicker(true)} activeOpacity={0.7}>
          <Text style={s.headerTitle} numberOfLines={1}>{convTitle}</Text>
          <Text style={[s.headerSub, convDotColor ? { color: convDotColor } : undefined]} numberOfLines={1}>
            {convSub} ▾
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Obszar wiadomości + pole wpisywania ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Lista wiadomości */}
        {loadingMessages ? (
          <View style={s.center}>
            <ActivityIndicator color="#F5A623" size="small" />
            <Text style={s.loadingText}>Ładowanie wiadomości…</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={s.msgList}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <View style={s.emptyHint}>
                <Text style={s.emptyHintText}>
                  {selectedUser
                    ? `Napisz pierwszą wiadomość do ${selectedUser.name}`
                    : "Napisz wiadomość — pojawi się tutaj"}
                </Text>
              </View>
            )}

            {messages.map((msg) => {
              const isMine = msg.senderId === user?.uid;
              // Rozwiąż dane autora: z wiadomości → z cache Firestore → fallback
              const cached = userCache[msg.senderId];
              const displayName = msg.senderName || cached?.name || msg.senderId?.slice(0, 8) || "Użytkownik";
              const displayRole = msg.senderRole || cached?.role || "driver";
              const initials = displayName.charAt(0).toUpperCase();
              return (
                <View key={msg.id} style={[s.msgRow, isMine ? s.msgRowMine : s.msgRowOther]}>
                  {/* Awatar — zawsze widoczny po lewej dla cudzych, po prawej dla własnych */}
                  {!isMine && (
                    <View style={s.msgAvatar}>
                      <Text style={s.msgAvatarText}>{initials}</Text>
                    </View>
                  )}
                  <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleOther]}>
                    {/* Nagłówek z imieniem i rolą — zawsze widoczny dla WSZYSTKICH wiadomości */}
                    <View style={s.bubbleHeader}>
                      <Text style={[
                        s.bubbleSenderName,
                        isMine ? { color: "#F5A623" } : undefined,
                      ]} numberOfLines={1}>
                        {isMine ? `${displayName} (Ty)` : displayName}
                      </Text>
                      <View style={[s.rolePill, {
                        borderColor: roleBadgeColor(displayRole) + "60",
                        backgroundColor: roleBadgeColor(displayRole) + "18",
                      }]}>
                        <Text style={[s.rolePillText, { color: roleBadgeColor(displayRole) }]}>
                          {roleLabel(displayRole)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[s.bubbleText, isMine ? s.bubbleTextMine : s.bubbleTextOther]}>
                      {msg.text}
                    </Text>
                    <Text style={[s.bubbleTime, isMine && { textAlign: "right" }]}>
                      {formatMsgTime(msg.createdAt)}
                    </Text>
                  </View>
                  {isMine && (
                    <View style={s.msgAvatar}>
                      <Text style={s.msgAvatarText}>{initials}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Pole wpisywania — zawsze widoczne i aktywne */}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder={selectedUser ? `Wiadomość do ${selectedUser.name}…` : "Napisz wiadomość…"}
            placeholderTextColor="#4A5568"
            multiline
            maxLength={500}
            blurOnSubmit={false}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator color="#0D1B2A" size="small" />
            ) : (
              <Text style={s.sendBtnText}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      

      {/* ── Modal wyboru rozmówcy ── */}
      <Modal
        visible={showUserPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUserPicker(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setShowUserPicker(false)}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Wybierz rozmówcę</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)}>
                <Text style={s.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Czat ogólny */}
            <TouchableOpacity
              style={[s.pickerItem, !selectedUser && s.pickerItemActive]}
              onPress={() => selectUser(null)}
            >
              <View style={[s.pickerAvatar, { backgroundColor: "rgba(245,166,35,0.12)" }]}>
                <Text style={{ fontSize: 18 }}>💬</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pickerName}>Czat ogólny</Text>
                <Text style={s.pickerSub}>{users.filter((u) => u.online).length} aktywnych użytkowników</Text>
              </View>
              {!selectedUser && <Text style={{ color: "#F5A623", fontSize: 16 }}>✓</Text>}
            </TouchableOpacity>

            {/* Lista użytkowników */}
            {users.length === 0 ? (
              <Text style={s.pickerEmpty}>Brak innych użytkowników w systemie</Text>
            ) : (
              users.map((u) => (
                <TouchableOpacity
                  key={u.uid}
                  style={[s.pickerItem, selectedUser?.uid === u.uid && s.pickerItemActive]}
                  onPress={() => selectUser(u)}
                >
                  <View style={[s.pickerAvatar, { backgroundColor: u.online ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.05)" }]}>
                    <Text style={s.pickerAvatarText}>{(u.name || "?").charAt(0).toUpperCase()}</Text>
                    <View style={[s.pickerOnlineDot, { backgroundColor: u.online ? "#4ADE80" : "#374151" }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickerName} numberOfLines={1}>{u.name}</Text>
                    <Text style={[s.pickerSub, u.online ? { color: "#4ADE80" } : undefined]} numberOfLines={1}>
                      {presenceLabel(u)}
                    </Text>
                  </View>
                  <View style={[s.rolePill, {
                    borderColor: roleBadgeColor(u.role) + "60",
                    backgroundColor: roleBadgeColor(u.role) + "18",
                  }]}>
                    <Text style={[s.rolePillText, { color: roleBadgeColor(u.role) }]}>{roleLabel(u.role)}</Text>
                  </View>
                  {selectedUser?.uid === u.uid && <Text style={{ color: "#F5A623", fontSize: 16, marginLeft: 6 }}>✓</Text>}
                </TouchableOpacity>
              ))
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Style ───────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1B2A" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 10 },
  loadingText: { color: "#687076", fontSize: 13 },

  // Nagłówek czatu
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#1B2838",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 10,
  },
  backBtn: { paddingRight: 2 },
  backBtnText: { color: "#F5A623", fontSize: 22, fontWeight: "700", lineHeight: 26 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    flexShrink: 0,
  },
  headerAvatarText: { color: "#F5A623", fontSize: 16, fontWeight: "700" },
  headerOnlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#1B2838",
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  headerSub: { color: "#687076", fontSize: 12, marginTop: 1 },

  // Lista wiadomości
  msgList: { padding: 14, paddingBottom: 8, flexGrow: 1 },

  emptyHint: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyHintText: { color: "#4A5568", fontSize: 13, textAlign: "center", lineHeight: 20 },

  // Wiersze wiadomości
  msgRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-end", gap: 8 },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },
  msgAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(245,166,35,0.12)",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(245,166,35,0.25)",
    flexShrink: 0,
  },
  msgAvatarText: { color: "#F5A623", fontSize: 12, fontWeight: "700" },

  // Dymki
  bubble: { maxWidth: "75%", borderRadius: 14, padding: 10 },
  bubbleMine: {
    backgroundColor: "rgba(245,166,35,0.18)",
    borderWidth: 1, borderColor: "rgba(245,166,35,0.3)",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    borderBottomLeftRadius: 4,
  },
  bubbleHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" },
  bubbleSenderName: { color: "#F5A623", fontSize: 12, fontWeight: "700" },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: "#FFFFFF" },
  bubbleTextOther: { color: "#E2E8F0" },
  bubbleTime: { color: "#4A5568", fontSize: 10, marginTop: 4 },

  // Pill roli
  rolePill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  rolePillText: { fontSize: 10, fontWeight: "700" },

  // Pole wpisywania
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    gap: 8,
    backgroundColor: "#1B2838",
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    color: "#FFFFFF",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "#F5A623",
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: "rgba(245,166,35,0.25)" },
  sendBtnText: { color: "#0D1B2A", fontSize: 18, fontWeight: "700" },

  // Modal wyboru rozmówcy
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "#1B2838",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  pickerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  pickerClose: { color: "#687076", fontSize: 20, fontWeight: "700" },
  pickerEmpty: {
    color: "#687076", fontSize: 13, fontStyle: "italic",
    textAlign: "center", paddingVertical: 24, paddingHorizontal: 20,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  pickerItemActive: { backgroundColor: "rgba(245,166,35,0.07)" },
  pickerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(245,166,35,0.2)",
    position: "relative",
    flexShrink: 0,
  },
  pickerAvatarText: { color: "#F5A623", fontSize: 16, fontWeight: "700" },
  pickerOnlineDot: {
    position: "absolute",
    bottom: -1, right: -1,
    width: 12, height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#1B2838",
  },
  pickerName: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  pickerSub: { color: "#687076", fontSize: 12, marginTop: 2 },
});
