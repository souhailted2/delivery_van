export interface InvoiceItem {
  productName: string;
  priceType: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  createdAt: string;
  clientName: string;
  truckName: string;
  paymentType: string;
  totalAmount: number;
  items: InvoiceItem[];
}

export interface ReturnItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ReturnData {
  id: number;
  createdAt?: string;
  type: string;
  clientName?: string | null;
  truckName?: string | null;
  totalAmount: number;
  items: ReturnItem[];
}

// ─────────────────────────────────────────────────────────────
// Text receipt builder (UTF-8, shared as .txt → RawBT renders)
// ─────────────────────────────────────────────────────────────

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
  return amount.toLocaleString("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DZD";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-DZ", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildInvoiceText(inv: InvoiceData): string {
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

function buildReturnText(ret: ReturnData): string {
  const lines: string[] = [];
  const sep = rep("=", LINE);
  const dash = rep("-", LINE);
  const typeStr = ret.type === "client_return" ? "مرتجع من عميل" : "مرتجع من شاحنة";

  lines.push(sep);
  lines.push(center("Allal Store"));
  lines.push(center("الجزائر"));
  lines.push(center("*** إيصال مرتجع ***"));
  lines.push(sep);
  lines.push("");
  lines.push(pair("رقم المرتجع:", `#${ret.id}`));
  lines.push(pair("التاريخ:", ret.createdAt ? formatDate(ret.createdAt) : "-"));
  lines.push(pair("النوع:", typeStr));
  lines.push(pair("العميل:", ret.clientName || "-"));
  lines.push(pair("الشاحنة:", ret.truckName || "-"));
  lines.push("");
  lines.push(dash);
  lines.push(pair("الصنف", "كمية   سعر    مجموع"));
  lines.push(dash);

  for (const item of ret.items) {
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
  lines.push(pair("المجموع الإجمالي:", formatDZD(ret.totalAmount)));
  lines.push("");
  lines.push(sep);
  lines.push(center("شكراً على ثقتكم"));
  lines.push(center(`${ret.items.length} صنف — ${ret.items.reduce((s, i) => s + i.quantity, 0)} وحدة مُرجعة`));
  lines.push(sep);
  lines.push("");

  return lines.join("\n");
}

async function shareText(text: string, filename: string): Promise<void> {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const file = new File([blob], `${filename}.txt`, { type: "text/plain" });

  if (
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      // المستخدم ألغى أو فشل — ننتقل للتنزيل
    }
  }

  // Fallback: download .txt
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function printInvoiceText(inv: InvoiceData): Promise<void> {
  await shareText(buildInvoiceText(inv), `فاتورة-${inv.invoiceNumber}`);
}

export async function printReturnText(ret: ReturnData): Promise<void> {
  await shareText(buildReturnText(ret), `مرتجع-${ret.id}`);
}
