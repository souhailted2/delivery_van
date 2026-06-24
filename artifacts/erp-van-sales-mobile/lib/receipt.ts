import { File, Paths } from "expo-file-system";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import { formatMoney } from "./money";

// ─────────────────────────────────────────────────────────────
// Thermal text receipt (80mm / 42-char) — must match the format
// produced by the web/desktop store (artifacts/erp-van-sales/src/lib/rawbt.ts)
// so receipts handed to customers look identical regardless of source.
// Shared as a .txt file → the RawBT app renders/prints it over Bluetooth.
//
// PRINTABILITY RULES (do not regress — see PRINTING.md):
//   • Latin digits + dot decimal ONLY. Never rely on Intl/toLocale* here: on
//     Hermes/Android `ar-DZ` can emit Arabic-Indic digits (٠١٢) and `fr-DZ`
//     emits comma + narrow-no-break-space — all of which print as garbage on
//     thermal printers. Money goes through formatMoney (locale-independent).
//   • ASCII-only symbols. No ✓ ◌ … — × • etc.; cheap thermal printers can't
//     render them. The only non-ASCII content left is the Arabic TEXT itself,
//     which RawBT must render as an image (Image/Graphics mode).
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

export interface ReceiptReturn {
  returnNumber: string;
  createdAt: string;
  type: "void" | "client_return";
  clientName: string;
  truckName: string;
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

// Locale-independent money: Latin digits, dot decimal, space grouping + " DZD".
function formatDZD(amount: number) {
  return formatMoney(amount);
}

// Locale-independent date: dd/MM/yyyy HH:mm with guaranteed Latin digits.
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function formatDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Quantities are numeric(10,3): show integers plainly, trim trailing zeros.
function fmtQty(q: number) {
  const n = Number(q);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

// One item line: name on the left, "qty  unitPrice  subtotal" right-aligned.
// Unit price + subtotal show 2 decimals so the printed lines visibly sum to the
// printed total (which is also 2 decimals via formatDZD).
function itemLine(item: ReceiptItem): string {
  const q = fmtQty(item.quantity).padStart(3);
  const up = Number(item.unitPrice ?? 0).toFixed(2).padStart(8);
  const st = Number(item.subtotal ?? 0).toFixed(2).padStart(9);
  const nums = `${q} ${up} ${st}`; // 22 chars
  const maxName = LINE - nums.length - 1;
  const safeName = item.productName ?? "منتج محذوف";
  const name = safeName.length > maxName ? safeName.slice(0, maxName - 2) + ".." : safeName;
  return pair(name, nums);
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
  lines.push(pair("الصنف", "كمية   سعر     مجموع"));
  lines.push(dash);

  for (const item of inv.items) lines.push(itemLine(item));

  lines.push(dash);
  lines.push("");
  lines.push(pair("المجموع الإجمالي:", formatDZD(inv.totalAmount)));
  lines.push(pair("", inv.paymentType === "cash" ? "* تم الدفع نقداً" : "* مبلغ مؤجّل"));
  lines.push("");
  lines.push(sep);
  lines.push(center("شكراً على ثقتكم"));
  lines.push(center(`${inv.items.length} صنف - ${inv.items.reduce((s, i) => s + i.quantity, 0)} وحدة`));
  lines.push(sep);
  lines.push("");

  return lines.join("\n");
}

export function buildReturnText(ret: ReceiptReturn): string {
  const lines: string[] = [];
  const sep = rep("=", LINE);
  const dash = rep("-", LINE);
  const typeStr = ret.type === "client_return" ? "مرتجع من عميل" : "إلغاء فاتورة";

  lines.push(sep);
  lines.push(center("Allal Store"));
  lines.push(center("الجزائر"));
  lines.push(center("*** إيصال مرتجع ***"));
  lines.push(sep);
  lines.push("");
  lines.push(pair("رقم المرتجع:", ret.returnNumber));
  lines.push(pair("التاريخ:", formatDate(ret.createdAt)));
  lines.push(pair("النوع:", typeStr));
  lines.push(pair("العميل:", ret.clientName));
  lines.push(pair("الشاحنة:", ret.truckName));
  lines.push("");
  lines.push(dash);
  lines.push(pair("الصنف", "كمية   سعر     مجموع"));
  lines.push(dash);

  for (const item of ret.items) lines.push(itemLine(item));

  lines.push(dash);
  lines.push("");
  lines.push(pair("المجموع المُرجَع:", formatDZD(ret.totalAmount)));
  lines.push("");
  lines.push(sep);
  lines.push(center("شكراً على ثقتكم"));
  lines.push(center(`${ret.items.length} صنف - ${ret.items.reduce((s, i) => s + i.quantity, 0)} وحدة مُرجعة`));
  lines.push(sep);
  lines.push("");

  return lines.join("\n");
}

// Fallback only: write the receipt to a .txt and open the share sheet. Used
// when RawBT's direct scheme isn't handled (e.g. RawBT not installed) so the
// user can still route the receipt somewhere.
async function shareReceiptFile(text: string, baseName: string): Promise<void> {
  const safe = baseName.replace(/[^a-zA-Z0-9_-]/g, "") || "receipt";
  const file = new File(Paths.cache, `${safe}.txt`);
  // overwrite:true makes create idempotent — no fragile pre-delete dance.
  file.create({ overwrite: true });
  file.write(text);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("تعذّرت الطباعة: تطبيق RawBT غير مثبّت، والمشاركة غير متاحة على هذا الجهاز.");
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: "text/plain",
    dialogTitle: "طباعة الإيصال عبر RawBT",
    UTI: "public.plain-text",
  });
}

// Primary path: hand the receipt text STRAIGHT to RawBT via its documented URL
// scheme — ACTION_VIEW on `rawbt:<utf8 text>` (ref https://rawbt.ru/intents.html,
// demo 402d/DemoRawBtPrinter: `String url = "rawbt:" + textToPrint`). This is the
// only handoff that actually prints. The previous approach — sharing a .txt file
// via the share sheet — sent RawBT a stream attachment it ignores, so nothing
// printed. The receipt text is ASCII + Arabic + digits + `= - : . / *` only, none
// of which `Uri.parse` treats as a delimiter (no `# ? %`), so it passes through
// intact; we deliberately do NOT URL-encode (RawBT prints the payload verbatim).
async function printReceiptText(text: string, baseName: string): Promise<void> {
  try {
    await Linking.openURL("rawbt:" + text);
    return;
  } catch {
    // RawBT didn't handle the scheme (not installed / no handler) — fall back.
  }
  await shareReceiptFile(text, baseName);
}

export async function printInvoiceReceipt(inv: ReceiptInvoice): Promise<void> {
  await printReceiptText(buildInvoiceText(inv), `facture-${inv.invoiceNumber}`);
}

export async function printReturnReceipt(ret: ReceiptReturn): Promise<void> {
  await printReceiptText(buildReturnText(ret), `retour-${ret.returnNumber}`);
}
