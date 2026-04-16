/**
 * pushNotifications.ts
 * Obsługa push notifications przez Expo Notifications.
 * - Rejestracja tokenu urządzenia przy logowaniu
 * - Zapis tokenu w Firestore (users/{uid}.expoPushToken)
 * - Wysyłanie powiadomień push przez Expo Push API
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { doc, updateDoc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "./firebase";

// Konfiguracja domyślna dla powiadomień
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Rejestruje token push dla urządzenia i zapisuje go w Firestore.
 * Wywołaj po zalogowaniu użytkownika.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[push] Brak uprawnień do powiadomień");
      return null;
    }

    // Pobierz token Expo Push
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "c7960728-8165-40ee-8ddb-d0394fed6524", // z app.json extra.eas.projectId
    });
    const token = tokenData.data;

    // Zapisz token w Firestore
    await updateDoc(doc(db, "users", userId), {
      expoPushToken: token,
      pushTokenUpdatedAt: new Date().toISOString(),
    });

    console.log("[push] Token zarejestrowany:", token);
    return token;
  } catch (err) {
    console.warn("[push] Błąd rejestracji tokenu:", err);
    return null;
  }
}

/**
 * Wysyła push notification przez Expo Push API.
 * Używa fetch do Expo Push API (działa na Android/iOS/web).
 */
async function sendExpoPush(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: expoPushToken,
        sound: "default",
        title,
        body,
        data: data || {},
        priority: "high",
        channelId: "default",
      }),
    });
  } catch (err) {
    console.warn("[push] Błąd wysyłania push:", err);
  }
}

/**
 * Pobierz token push użytkownika z Firestore po email.
 */
async function getTokenByEmail(email: string): Promise<string | null> {
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      return data.expoPushToken || null;
    }
  } catch {}
  return null;
}

/**
 * Pobierz token push użytkownika z Firestore po userId.
 */
async function getTokenByUserId(userId: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (snap.exists()) {
      return snap.data().expoPushToken || null;
    }
  } catch {}
  return null;
}

/**
 * Wyślij push do kierowcy gdy wniosek urlopowy został zatwierdzony.
 */
export async function pushLeaveApproved(
  employeeEmail: string,
  dateFrom: string,
  dateTo: string
): Promise<void> {
  const token = await getTokenByEmail(employeeEmail);
  if (!token) return;
  await sendExpoPush(
    token,
    "✅ Urlop zatwierdzony",
    `Twój wniosek urlopowy (${dateFrom} – ${dateTo}) został zatwierdzony.`,
    { type: "leave_approved", dateFrom, dateTo }
  );
}

/**
 * Wyślij push do kierowcy gdy wniosek urlopowy został odrzucony.
 */
export async function pushLeaveRejected(
  employeeEmail: string,
  dateFrom: string,
  dateTo: string
): Promise<void> {
  const token = await getTokenByEmail(employeeEmail);
  if (!token) return;
  await sendExpoPush(
    token,
    "❌ Wniosek odrzucony",
    `Twój wniosek urlopowy (${dateFrom} – ${dateTo}) został odrzucony.`,
    { type: "leave_rejected", dateFrom, dateTo }
  );
}

/**
 * Wyślij push do adminów gdy nowy wniosek urlopowy.
 */
export async function pushNewLeaveRequest(
  employeeName: string,
  dateFrom: string,
  dateTo: string
): Promise<void> {
  try {
    // Pobierz wszystkich adminów (wszystkie warianty roli)
    const q = query(collection(db, "users"), where("role", "in", ["admin", "administrator", "ADMIN"]));
    const snap = await getDocs(q);
    const pushes: Promise<void>[] = [];
    snap.docs.forEach((d) => {
      const token = d.data().expoPushToken;
      if (token) {
        pushes.push(sendExpoPush(
          token,
          "📋 Nowy wniosek urlopowy",
          `${employeeName} złożył wniosek: ${dateFrom} – ${dateTo}`,
          { type: "new_leave_request" }
        ));
      }
    });
    await Promise.all(pushes);
  } catch {}
}

/**
 * Wyślij push do pracownika gdy admin dodał nową umowę.
 * Szuka tokenu po emailu pracownika.
 */
export async function pushContractAdded(
  employeeEmail: string,
  employmentType?: string
): Promise<void> {
  const token = await getTokenByEmail(employeeEmail);
  if (!token) return;
  const typeLabel = employmentType ? ` (${employmentType})` : "";
  await sendExpoPush(
    token,
    "📄 Nowa umowa",
    `Administrator dodał nową umowę do Twojego konta${typeLabel}.`,
    { type: "contract_added" }
  );
}

/**
 * Wyślij push do odbiorcy nowej wiadomości czatu.
 */
export async function pushNewChatMessage(
  recipientUserId: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  const token = await getTokenByUserId(recipientUserId);
  if (!token) return;
  await sendExpoPush(
    token,
    `💬 ${senderName}`,
    messagePreview.length > 80 ? messagePreview.substring(0, 80) + "..." : messagePreview,
    { type: "chat_message" }
  );
}
