import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Zapisz powiadomienie do kolekcji `notifications` w Firestore.
 * Pole `read: false` — odczytywane przez AdminHeader (dzwoneczek).
 */
async function createNotification(type: string, title: string, body: string): Promise<void> {
  try {
    await addDoc(collection(db, "notifications"), {
      type,
      title,
      body,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[notifications] Błąd zapisu:", err);
  }
}

// ─── Helpery dla konkretnych zdarzeń ─────────────────────────

/** Urlop zatwierdzony */
export function notifyLeaveApproved(employeeName: string, dateFrom: string, dateTo: string) {
  return createNotification(
    "leave_approved",
    "Urlop zatwierdzony",
    `Zatwierdzono urlop dla ${employeeName}: ${dateFrom} – ${dateTo}`
  );
}

/** Urlop odrzucony */
export function notifyLeaveRejected(employeeName: string, dateFrom: string, dateTo: string) {
  return createNotification(
    "leave_rejected",
    "Urlop odrzucony",
    `Odrzucono wniosek urlopowy dla ${employeeName}: ${dateFrom} – ${dateTo}`
  );
}

/** Nowy pracownik */
export function notifyEmployeeAdded(employeeName: string, role: string) {
  return createNotification(
    "employee_added",
    "Nowy pracownik",
    `Dodano pracownika: ${employeeName} (${role})`
  );
}

/** Nowy wpis licznika */
export function notifyMileageEntry(addedByName: string, vehicleLabel: string, km: number) {
  return createNotification(
    "mileage_entry",
    "Nowy wpis licznika",
    `${addedByName} dodał(a) stan licznika: ${km.toLocaleString()} km (${vehicleLabel})`
  );
}

/** Nowa usterka */
export function notifyFaultReport(vehicleLabel: string, description: string) {
  return createNotification(
    "fault_report",
    "Nowa usterka pojazdu",
    `Zgłoszono usterkę (${vehicleLabel}): ${description}`
  );
}
