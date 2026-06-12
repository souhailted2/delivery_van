import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

// ─────────────────────────────────────────────────────────────
// Thermal text receipt (80mm / 42-char) — must match the format
// produced by the web/desktop store (artifacts/erp-van-sales/src/lib/rawbt.ts)
// so receipts handed to customers look identical regardless of source.
// Shared as a .txt file → the RawBT app renders/prints it over Bluetooth.
// ─────────────────────────────────────────────────────────────

export interface ReceiptItem {
  productName: string;
  priceType: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ReceiptInvoice {
  invoiceNumber: string;
  createdAt: string;
  clientName: string;
  truckName: string;
  paymentType: string;
  totalAmount: number;
  items: ReceiptItem[];
}

const LINE = 42; // chars wide for 80mm thermal

function rep(char: string, n: number) {
  return char.repeat(Math.max(0, n));
}

function center(text: string) {
  const pad = Math.max(0, Math.floor((LINE - text.length) / 2));
  return rep(" ", pad) + text;
}

function pair(label: string, value: string) {
  const gap = LINE - label.length - value.length;
  return label + rep(" ", Math.max(1, gap)) + value;
}

function formatDZD(amount: number) {
  return amount.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " دج";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-DZ", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function buildInvoiceText(inv: ReceiptInvoice): string {
  const lines: string[] = [];
  const sep = rep("=", LINE);
  const dash = rep("-", LINE);

  lines.push(sep);
  lines.push(center("Allal Store"));
  lines.push(center("الجزائر"));
  lines.push(sep);
  lines.push("");
  lines.push(pair("رقم الفاتورة :", inv.invoiceNumber));
  lines.push(pair("التاريخ:", formatDate(inv.createdAt)));
  lines.push(pair("العميل:", inv.clientName));
  lines.push(pair("الشاحنة:", inv.truckName));
  lines.push(pair("الدفع:", inv.paymentType === "cash" ? "نقداً" : "آجل"));
  lines.push("");
  lines.push(dash);
  lines.push(pair("الصنف", "كمية   سعر    مجموع"));
  lines.push(dash);

  for (const item of inv.items) {
    const nums = `${item.quantity}   ${item.unitPrice.toFixed(0).padStart(6)}  ${item.subtotal.toFixed(0).padStart(7)}`;
    const maxName = LINE - nums.length - 1;
    const safeName = item.productName ?? "منتج محذوف";
    const name = safeName.length > maxName
      ? safeName.slice(0, maxName - 1) + "…"
      : safeName;
    lines.push(pair(name, nums));
  }

  lines.push(dash);
  lines.push("");
  lines.push(pair("المجموع الإجمالي:", formatDZD(inv.totalAmount)));
  lines.push(pair("", inv.paymentType === "cash" ? "✓ تم الدفع نقداً" : "◌ مبلغ مؤجّل"));
  lines.push("");
  lines.push(sep);
  lines.push(center("شكراً على ثقتكم"));
  lines.push(center(`${inv.items.length} صنف — ${inv.items.reduce((s, i) => s + i.quantity, 0)} وحدة`));
  lines.push(sep);
  lines.push("");

  return lines.join("\n");
}

// Write the receipt to a .txt file in the cache and open the share sheet so the
// user can send it to RawBT (or any other target) for Bluetooth thermal printing.
export async function printInvoiceReceipt(inv: ReceiptInvoice): Promise<void> {
  const text = buildInvoiceText(inv);
  const safe = inv.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "") || "receipt";
  const file = new File(Paths.cache, `facture-${safe}.txt`);
  try { if (file.exists) file.delete(); } catch {}
  file.create();
  file.write(text);

  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error("المشاركة غير متاحة على هذا الجهاز");

  await Sharing.shareAsync(file.uri, {
    mimeType: "text/plain",
    dialogTitle: "طباعة الإيصال عبر RawBT",
    UTI: "public.plain-text",
  });
}
