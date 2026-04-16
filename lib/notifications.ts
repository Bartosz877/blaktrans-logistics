import { addDoc, collection, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Struktura powiadomienia w Firestore.
 *
 * Pola odbiorcy (WYMAGANE dla poprawnego filtrowania):
 *   - forRole:       'admin' | 'driver' | 'dygacz'  — rola odbiorcy
 *   - recipientId:   UID konkretnego użytkownika (jeśli powiadomienie jest osobiste)
 *   - recipientRole: alias forRole — dla spójności z zapytaniami
 *
 * Pola kontekstu:
 *   - notificationType: kategoria zdarzenia (np. 'leave_request', 'leave_approved')
 *   - relatedEntityId:  ID powiązanego dokumentu (np. leaveRequestId)
 *   - employeeEmail:    email pracownika (do wyszukiwania userId)
 */
async function createNotification(
  type: string,
  title: string,
  body: string,
  options?: {
    forRole?: string;
    recipientId?: string;
    employeeEmail?: string;
    leaveRequestId?: string;
    relatedEntityId?: string;
    notificationType?: string;
    actorName?: string;
    actorRole?: string;
  }
): Promise<void> {
  try {
    await addDoc(collection(db, "notifications"), {
      type,
      title,
      body,
      read: false,
      createdAt: serverTimestamp(),
      // Odbiorca — zawsze ustawiaj forRole
      forRole: options?.forRole ?? "admin",
      // recipientId — UID konkretnego użytkownika (dla powiadomień osobistych)
      ...(options?.recipientId ? { recipientId: options.recipientId } : {}),
      // Kontekst
      ...(options?.employeeEmail ? { employeeEmail: options.employeeEmail } : {}),
      ...(options?.leaveRequestId ? { leaveRequestId: options.leaveRequestId, relatedEntityId: options.leaveRequestId } : {}),
      ...(options?.relatedEntityId ? { relatedEntityId: options.relatedEntityId } : {}),
      ...(options?.notificationType ? { notificationType: options.notificationType } : {}),
      ...(options?.actorName ? { actorName: options.actorName } : {}),
      ...(options?.actorRole ? { actorRole: options.actorRole } : {}),
    });
  } catch (err) {
    console.warn("[notifications] Błąd zapisu:", err);
  }
}

/**
 * Znajdź userId po emailu pracownika
 */
async function findUserIdByEmail(email: string): Promise<string | null> {
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].id;
  } catch {}
  return null;
}

// ─── Helpery dla konkretnych zdarzeń ─────────────────────────

/**
 * Nowy wniosek urlopowy — powiadomienie TYLKO dla admina.
 * Kierowca NIE dostaje powiadomienia o własnym wniosku.
 */
export async function notifyNewLeaveRequest(
  employeeName: string,
  dateFrom: string,
  dateTo: string,
  leaveRequestId?: string
) {
  await createNotification(
    "leave_request",
    "📋 Nowy wniosek urlopowy",
    `${employeeName} złożył wniosek urlopowy: ${dateFrom} – ${dateTo}`,
    {
      forRole: "admin",
      leaveRequestId,
      notificationType: "leave_request",
      actorName: employeeName,
    }
  );
}

/**
 * Urlop zatwierdzony — powiadomienie TYLKO dla konkretnego kierowcy.
 * Admin NIE dostaje tego powiadomienia.
 */
export async function notifyLeaveApproved(
  employeeName: string,
  dateFrom: string,
  dateTo: string,
  employeeEmail?: string,
  leaveRequestId?: string
) {
  let recipientId: string | undefined;
  if (employeeEmail) {
    recipientId = (await findUserIdByEmail(employeeEmail)) ?? undefined;
  }
  await createNotification(
    "leave_approved",
    "✅ Urlop zatwierdzony",
    `Twój wniosek urlopowy (${dateFrom} – ${dateTo}) został zatwierdzony.`,
    {
      forRole: "driver",
      recipientId,
      employeeEmail,
      leaveRequestId,
      notificationType: "leave_approved",
    }
  );
}

/**
 * Urlop odrzucony — powiadomienie TYLKO dla konkretnego kierowcy.
 * Admin NIE dostaje tego powiadomienia.
 */
export async function notifyLeaveRejected(
  employeeName: string,
  dateFrom: string,
  dateTo: string,
  employeeEmail?: string,
  leaveRequestId?: string
) {
  let recipientId: string | undefined;
  if (employeeEmail) {
    recipientId = (await findUserIdByEmail(employeeEmail)) ?? undefined;
  }
  await createNotification(
    "leave_rejected",
    "❌ Wniosek odrzucony",
    `Twój wniosek urlopowy (${dateFrom} – ${dateTo}) został odrzucony.`,
    {
      forRole: "driver",
      recipientId,
      employeeEmail,
      leaveRequestId,
      notificationType: "leave_rejected",
    }
  );
}

/**
 * Nowa umowa — powiadomienie TYLKO dla konkretnego pracownika.
 * Admin NIE dostaje tego powiadomienia.
 * @param employeeEmail  email pracownika (do wyszukania recipientId)
 * @param employeeName   imię i nazwisko pracownika
 * @param contractId     ID dokumentu umowy w kolekcji contracts
 * @param employmentType rodzaj umowy (np. "umowa o pracę")
 */
export async function notifyContractAdded(
  employeeEmail: string,
  employeeName: string,
  contractId: string,
  employmentType?: string
): Promise<void> {
  // Znajdź UID pracownika po emailu
  let recipientId: string | undefined;
  if (employeeEmail) {
    recipientId = (await findUserIdByEmail(employeeEmail)) ?? undefined;
  }
  const typeLabel = employmentType ? ` (${employmentType})` : "";
  await createNotification(
    "contract_added",
    "📄 Nowa umowa",
    `Administrator dodał nową umowę do Twojego konta${typeLabel}.`,
    {
      forRole: "driver",
      recipientId,
      employeeEmail,
      relatedEntityId: contractId,
      notificationType: "contract_added",
      actorName: employeeName,
    }
  );
}

/** Nowy pracownik — powiadomienie dla admina */
export function notifyEmployeeAdded(employeeName: string, role: string) {
  return createNotification(
    "employee_added",
    "👤 Nowy pracownik",
    `Dodano pracownika: ${employeeName} (${role})`,
    { forRole: "admin", notificationType: "employee_added" }
  );
}

/** Nowy wpis licznika — powiadomienie dla admina */
export function notifyMileageEntry(addedByName: string, vehicleLabel: string, km: number) {
  return createNotification(
    "mileage_entry",
    "📏 Nowy wpis licznika",
    `${addedByName} dodał(a) stan licznika: ${km.toLocaleString()} km (${vehicleLabel})`,
    { forRole: "admin", notificationType: "mileage_entry" }
  );
}

/** Nowa usterka — powiadomienie dla admina */
export function notifyFaultReport(vehicleLabel: string, description: string) {
  return createNotification(
    "fault_report",
    "🔧 Nowa usterka pojazdu",
    `Zgłoszono usterkę (${vehicleLabel}): ${description}`,
    { forRole: "admin", notificationType: "fault_report" }
  );
}
