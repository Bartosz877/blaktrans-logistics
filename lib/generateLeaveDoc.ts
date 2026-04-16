/**
 * generateLeaveDoc.ts
 * Generuje wniosek urlopowy jako DOCX (Open XML) i uploaduje do Firebase Storage.
 * Działa na Android/iOS (Hermes) i web.
 * Używa: docx (jszip) + Firebase Storage uploadBytes
 *
 * Układ zgodny z szablonem:
 *   - Prawy górny róg: "Nowy Dwór Gdański, DD.MM.YYYY"
 *   - Lewy blok: imię/nazwisko + stanowisko
 *   - Prawy blok (wcięty): dane firmy (Blaktrans Logistics Sp. z o.o., adres, NIP)
 *   - Wyśrodkowany tytuł (bold): "Wniosek o urlop wypoczynkowy"
 *   - Treść: "Zwracam się z uprzejmą prośbą o udzielenie mi urlopu wypoczynkowego..."
 *   - Podpis pracownika (prawy)
 *   - Sekcja pracodawcy: "Wyrażam zgodę..." + podpis pracodawcy (prawy)
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from "docx";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export interface LeaveDocData {
  employeeId: string;
  employeeName: string;
  position: string;
  companyName: string;
  dateFrom: string;
  dateTo: string;
  workdays: number;
  leaveType: string;
  reason?: string;
  submittedAt: string; // ISO date string lub DD.MM.YYYY
}

/** Formatuje datę ISO (YYYY-MM-DD) lub DD.MM.YYYY na DD.MM.YYYY */
function formatDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  // Jeśli już w formacie DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) return dateStr;
  // Jeśli ISO: YYYY-MM-DD
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return dateStr;
}

/**
 * Generuje DOCX wniosku urlopowego i uploaduje do Firebase Storage.
 * Zwraca URL do pobrania.
 */
export async function generateAndUploadLeaveDoc(
  data: LeaveDocData,
  leaveRequestId: string
): Promise<string> {
  const doc = buildDocument(data);

  // Generuj jako base64 (działa na Hermes/React Native bez Node.js Buffer)
  const base64 = await Packer.toBase64String(doc);

  // Zdekoduj base64 na Uint8Array
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Upload do Firebase Storage
  const safeName = data.employeeName.replace(/\s+/g, "_");
  const fileName = `wniosek_urlopowy_${safeName}_${Date.now()}.docx`;
  const storageRef = ref(storage, `leave_requests/${leaveRequestId}/${fileName}`);

  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await uploadBytes(storageRef, blob, {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const url = await getDownloadURL(storageRef);
  return url;
}

// ─── Stałe firmy ─────────────────────────────────────────────────────────────
const COMPANY_LINE1 = "Blaktrans Logistics Sp. z o.o.";
const COMPANY_LINE2 = "ul. Władysława Broniewskiego 4";
const COMPANY_LINE3 = "82-100 Nowy Dwór Gdański";
const COMPANY_LINE4 = "NIP: 5792292066";
const CITY = "Nowy Dwór Gdański";

// Rozmiar czcionki w half-points (22 = 11pt, 24 = 12pt)
const FONT_SIZE = 22; // 11pt
const FONT_SIZE_TITLE = 24; // 12pt

function buildDocument(data: LeaveDocData): Document {
  const dateFormatted = formatDate(data.submittedAt);
  const dateFrom = formatDate(data.dateFrom);
  const dateTo = formatDate(data.dateTo);

  // Typ urlopu – "wypoczynkowy" lub inny
  const leaveTypeLower = data.leaveType
    ? data.leaveType.toLowerCase()
    : "wypoczynkowy";

  // Wcięcie dla bloku firmy (prawy blok w lewej kolumnie)
  const companyIndent = { left: 4320 }; // ~7.6cm

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 2.54cm
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          // ── Wiersz 1: miejscowość i data (prawy) ──────────────────────────
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `${CITY}, ${dateFormatted}`,
                size: FONT_SIZE,
              }),
            ],
          }),

          // ── Wiersz 2: imię i nazwisko (lewy) ─────────────────────────────
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: data.employeeName,
                size: FONT_SIZE,
              }),
            ],
          }),

          // ── Wiersz 3: stanowisko (lewy) ───────────────────────────────────
          new Paragraph({
            spacing: { after: 480 },
            children: [
              new TextRun({
                text: `Stanowisko: ${data.position}`,
                size: FONT_SIZE,
              }),
            ],
          }),

          // ── Blok firmy (prawy, wcięty) ────────────────────────────────────
          new Paragraph({
            indent: companyIndent,
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [
              new TextRun({ text: COMPANY_LINE1, size: FONT_SIZE }),
            ],
          }),
          new Paragraph({
            indent: companyIndent,
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [
              new TextRun({ text: COMPANY_LINE2, size: FONT_SIZE }),
            ],
          }),
          new Paragraph({
            indent: companyIndent,
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [
              new TextRun({ text: COMPANY_LINE3, size: FONT_SIZE }),
            ],
          }),
          new Paragraph({
            indent: companyIndent,
            alignment: AlignmentType.CENTER,
            spacing: { after: 720 },
            children: [
              new TextRun({ text: COMPANY_LINE4, size: FONT_SIZE }),
            ],
          }),

          // ── Tytuł ─────────────────────────────────────────────────────────
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
            children: [
              new TextRun({
                text: `Wniosek o urlop ${leaveTypeLower}`,
                bold: true,
                size: FONT_SIZE_TITLE,
              }),
            ],
          }),

          // ── Treść wniosku ─────────────────────────────────────────────────
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `Zwracam się z uprzejmą prośbą o udzielenie mi urlopu ${leaveTypeLower} w wymiarze`,
                size: FONT_SIZE,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: data.reason ? 240 : 720 },
            children: [
              new TextRun({
                text: `${data.workdays} ${dniLabel(data.workdays)} w terminie od ${dateFrom} do ${dateTo}.`,
                size: FONT_SIZE,
              }),
            ],
          }),

          // ── Uzasadnienie (opcjonalne) ─────────────────────────────────────
          ...(data.reason
            ? [
                new Paragraph({
                  spacing: { after: 720 },
                  children: [
                    new TextRun({
                      text: `Uzasadnienie: ${data.reason}`,
                      size: FONT_SIZE,
                    }),
                  ],
                }),
              ]
            : []),

          // ── Podpis pracownika (prawy) ─────────────────────────────────────
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: "…………………………………………………………",
                size: FONT_SIZE,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 960 },
            children: [
              new TextRun({
                text: "(podpis pracownika)",
                italics: true,
                size: FONT_SIZE - 2,
              }),
            ],
          }),

          // ── Sekcja pracodawcy ─────────────────────────────────────────────
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `Wyrażam zgodę na udzielenie urlopu ${leaveTypeLower} w wymiarze i terminie wskazanym`,
                size: FONT_SIZE,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 720 },
            children: [
              new TextRun({
                text: "we wniosku.",
                size: FONT_SIZE,
              }),
            ],
          }),

          // ── Podpis pracodawcy (prawy) ─────────────────────────────────────
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: "…………………………………………………………",
                size: FONT_SIZE,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 },
            children: [
              new TextRun({
                text: "(podpis pracodawcy)",
                italics: true,
                size: FONT_SIZE - 2,
              }),
            ],
          }),
        ],
      },
    ],
  });
}

/** Zwraca "dni" lub "dzień" w zależności od liczby */
function dniLabel(n: number): string {
  if (n === 1) return "dzień";
  if (n >= 2 && n <= 4) return "dni";
  return "dni";
}
