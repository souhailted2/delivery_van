import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MoneyText, PressableScale } from "@/components/ui";
import { Client, getDb } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { formatMoney } from "@/lib/money";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

const TIER_LABEL: Record<string, string> = {
  retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة",
};
const TIERS = ["retail", "half_wholesale", "wholesale"] as const;
const DAY = 86_400_000;

type HealthKey = "new" | "healthy" | "watch" | "atrisk" | "problem";
type Tone = "success" | "warning" | "danger" | "muted";

interface RecentInvoice { sync_id: string; total_amount?: number; payment_type?: string; created_at?: string; }
interface Staple { name: string; qty: number; inStock: boolean; missing: boolean; }
interface Intel {
  count: number;
  daysSince: number | null;
  cadence: number | null;            // avg days between purchases (null if <3 invoices)
  status: "new" | "active" | "atrisk" | "dormant";
  creditPct: number | null;          // share of last-10 invoices on credit
  trendDecline: boolean;
  allTimeTotal: number;
  lastInvoice: { amount: number; credit: boolean; ts: number } | null;
  staples: Staple[];
  debt: number;
  limit: number | null;
  headroom: number | null;
  limitStatus: "none" | "within" | "near" | "at" | "over";
  state: HealthKey;
  reasons: string[];
  action: string;
}

const median = (arr: number[]) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const STATE_META: Record<HealthKey, { label: string; tone: Tone; icon: any }> = {
  healthy: { label: "علاقة سليمة", tone: "success", icon: "check-circle" },
  watch: { label: "انتباه", tone: "warning", icon: "eye" },
  atrisk: { label: "علاقة معرّضة للخطر", tone: "warning", icon: "alert-triangle" },
  problem: { label: "علاقة حرجة", tone: "danger", icon: "alert-octagon" },
  new: { label: "عميل جديد", tone: "muted", icon: "user-plus" },
};

export default function ClientProfileScreen() {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { triggerSync } = useSync();
  const { syncId } = useLocalSearchParams<{ syncId: string }>();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [intel, setIntel] = useState<Intel | null>(null);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) { setLoading(false); return; }

    const cl = await db.getFirstAsync<Client>(
      "SELECT * FROM clients WHERE sync_id = ? AND is_deleted = 0",
      [syncId]
    );
    setClient(cl ?? null);
    if (!cl) { setLoading(false); return; }

    const idMatch = "(i.client_sync_id = ? OR i.client_id = ?)";
    const params = [syncId, cl.id ?? -1];

    // All invoices (asc) — the fact base for cadence / status / reliance / trend.
    const rows = await db.getAllAsync<{ sync_id: string; total_amount: number; payment_type: string; created_at: string }>(
      `SELECT i.sync_id, i.total_amount, i.payment_type, i.created_at
       FROM invoices i WHERE ${idMatch} AND i.is_deleted = 0 ORDER BY i.created_at ASC`,
      params
    );
    const inv = rows
      .map(r => ({ sync_id: r.sync_id, amount: Number(r.total_amount ?? 0), credit: r.payment_type === "credit", ts: Date.parse(r.created_at) }))
      .filter(r => Number.isFinite(r.ts));

    // Top staples (with product_id for stock match).
    const topRows = await db.getAllAsync<{ product_id: number | null; product_name: string; total_qty: number }>(
      `SELECT MAX(ii.product_id) as product_id, ii.product_name as product_name, COALESCE(SUM(ii.quantity),0) as total_qty
       FROM invoice_items ii JOIN invoices i ON (ii.invoice_sync_id = i.sync_id OR ii.invoice_id = i.id)
       WHERE ${idMatch} AND i.is_deleted = 0 AND ii.product_name IS NOT NULL
       GROUP BY ii.product_name ORDER BY total_qty DESC LIMIT 6`,
      params
    );

    // Items on the most recent invoice → "missing from last order".
    const lastSync = inv.length ? inv[inv.length - 1].sync_id : null;
    const lastItemNames = new Set<string>();
    if (lastSync) {
      const li = await db.getAllAsync<{ product_name: string }>(
        "SELECT DISTINCT product_name FROM invoice_items WHERE invoice_sync_id = ? AND product_name IS NOT NULL",
        [lastSync]
      );
      li.forEach(r => lastItemNames.add(r.product_name));
    }

    // Truck stock for this driver's truck → "available in the truck now".
    const stockSet = new Set<number>();
    if (user?.truckId != null) {
      const st = await db.getAllAsync<{ product_id: number }>(
        "SELECT product_id FROM truck_stock WHERE truck_id = ? AND quantity > 0",
        [user.truckId]
      );
      st.forEach(r => { if (r.product_id != null) stockSet.add(r.product_id); });
    }

    // Recent list for the history section.
    const rec = await db.getAllAsync<RecentInvoice>(
      `SELECT i.sync_id, i.total_amount, i.payment_type, i.created_at
       FROM invoices i WHERE ${idMatch} AND i.is_deleted = 0 ORDER BY i.created_at DESC LIMIT 10`,
      params
    );
    setRecent(rec);

    // ── Derive the fact-based relationship intelligence ──────────────────────
    const now = Date.now();
    const n = inv.length;
    const lastTs = n ? inv[n - 1].ts : null;
    const firstTs = n ? inv[0].ts : null;
    const daysSince = lastTs != null ? Math.floor((now - lastTs) / DAY) : null;
    const cadence = n >= 3 && firstTs != null && lastTs != null ? (lastTs - firstTs) / (n - 1) / DAY : null;

    let status: Intel["status"];
    if (n === 0 || daysSince == null) status = "new";
    else if (cadence != null) status = daysSince <= cadence ? "active" : daysSince <= 2 * cadence ? "atrisk" : "dormant";
    else status = daysSince <= 14 ? "active" : daysSince <= 30 ? "atrisk" : "dormant";

    const last10 = inv.slice(-10);
    const creditPct = last10.length >= 3 ? Math.round((last10.filter(x => x.credit).length / last10.length) * 100) : null;

    // Trend: only a significant + sustained decline counts (≥6 invoices).
    let trendDecline = false;
    if (n >= 6) {
      const last2 = inv.slice(-2).map(x => x.amount);
      const R = median(last2);
      const windowVals = inv.filter(x => { const age = (now - x.ts) / DAY; return age >= 30 && age <= 120; }).map(x => x.amount);
      const baseVals = windowVals.length >= 2 ? windowVals : inv.slice(0, -2).map(x => x.amount);
      const B = median(baseVals);
      if (B > 0 && R <= 0.6 * B && last2.every(v => v < 0.75 * B)) trendDecline = true;
    }

    const credit = Number(cl.credit_balance ?? 0);
    const owes = credit < 0;
    const debt = Math.max(0, -credit);
    const limit = cl.credit_limit != null ? Number(cl.credit_limit) : null;
    const headroom = limit != null ? limit - debt : null;
    let limitStatus: Intel["limitStatus"];
    if (limit == null) limitStatus = "none";
    else if (headroom! < 0) limitStatus = "over";
    else if (headroom === 0) limitStatus = "at";
    else if (headroom! <= 0.25 * limit) limitStatus = "near";
    else limitStatus = "within";

    let state: HealthKey;
    if (n === 0) state = "new";
    else if (limitStatus === "over" || (status === "dormant" && owes)) state = "problem";
    else if (status === "dormant" || limitStatus === "at" || (status === "atrisk" && owes)) state = "atrisk";
    else if (status === "atrisk" || trendDecline || limitStatus === "near") state = "watch";
    else state = "healthy";

    // Reasons (max 3) drawn only from real triggers.
    const reasons: string[] = [];
    if (status === "dormant" || status === "atrisk") {
      reasons.push(`لم يشترِ منذ ${daysSince} يوماً${cadence != null ? ` (المعتاد كل ${Math.round(cadence)} أيام)` : ""}`);
    }
    if (limitStatus === "over") reasons.push("تجاوز سقف الآجل");
    else if (limitStatus === "at") reasons.push("بلغ سقف الآجل");
    else if (limitStatus === "near") reasons.push("اقترب من سقف الآجل");
    if (trendDecline) reasons.push("انخفاض ملحوظ في حجم الطلبات");
    if (state === "healthy") reasons.push(`يشتري بانتظام${cadence != null ? ` (كل ${Math.round(cadence)} أيام)` : ""}`);
    if (state === "new") reasons.push("لا يوجد سجل شراء كافٍ بعد");

    const action = {
      problem: "حصّل الدين أولاً — بيع نقداً فقط",
      atrisk: "أعد التواصل وحصّل قبل أي بيع آجل",
      watch: "اعرض عليه المنتجات الغائبة عن آخر طلب",
      healthy: "علاقة جيدة — اعرض عليه منتجاته المعتادة",
      new: "ابنِ العلاقة — سجّل أول طلب",
    }[state];

    const staples: Staple[] = topRows.slice(0, 5).map(r => ({
      name: r.product_name,
      qty: Math.round(Number(r.total_qty ?? 0)),
      inStock: r.product_id != null && stockSet.has(r.product_id),
      missing: !lastItemNames.has(r.product_name),
    }));

    setIntel({
      count: n, daysSince, cadence, status, creditPct, trendDecline,
      allTimeTotal: inv.reduce((s, x) => s + x.amount, 0),
      lastInvoice: n ? { amount: inv[n - 1].amount, credit: inv[n - 1].credit, ts: inv[n - 1].ts } : null,
      staples, debt, limit, headroom, limitStatus, state, reasons, action,
    });
    setLoading(false);
  }, [syncId, user?.truckId]);

  useRefreshOnFocus(load);

  const updateTier = async (tier: string) => {
    if (!client || client.client_type === tier) return;
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      "UPDATE clients SET client_type = ?, _pending = 1, updated_at = ? WHERE sync_id = ?",
      [tier, new Date().toISOString(), client.sync_id]
    );
    setClient({ ...client, client_type: tier });
    triggerSync();
  };

  const toneColor = (tone: Tone) => ({
    success: { fg: c.successText, tint: c.successTint, solid: c.success },
    warning: { fg: c.warningText, tint: c.warningTint, solid: c.warning },
    danger: { fg: c.dangerText, tint: c.dangerTint, solid: c.danger },
    muted: { fg: c.textMuted, tint: c.surfaceElevated, solid: c.textMuted },
  }[tone]);

  const credit = Number(client?.credit_balance ?? 0);

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { backgroundColor: c.rail, borderBottomColor: c.hairline }]}>
        <PressableScale onPress={() => router.back()} hitSlop={10} accessibilityLabel="رجوع">
          <Feather name="arrow-right" size={22} color={c.text} />
        </PressableScale>
        <Text style={[styles.title, { color: c.text }]}>ملف العميل</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={c.brand} /></View>
      ) : !client ? (
        <View style={styles.center}>
          <Feather name="user-x" size={40} color={c.textFaint} />
          <Text style={[styles.emptyText, { color: c.textMuted }]}>العميل غير موجود</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 24 }}>
            {/* Identity */}
            <View style={[styles.headerCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <View style={styles.idRow}>
                <View style={[styles.avatar, { backgroundColor: c.brandTint, borderColor: c.brandBorder }]}>
                  <Text style={[styles.avatarText, { color: c.brandText }]}>{client.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.clientName, { color: c.text }]} numberOfLines={1}>{client.name}</Text>
                  <Text style={[styles.idMeta, { color: c.textMuted }]}>
                    {TIER_LABEL[client.client_type ?? "retail"]}{client.phone ? ` · ${client.phone}` : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.tierEditRow}>
                {TIERS.map(tier => {
                  const active = (client.client_type ?? "retail") === tier;
                  return (
                    <PressableScale
                      key={tier}
                      style={[styles.tierEditChip, { backgroundColor: active ? c.brand : c.surfaceElevated, borderColor: active ? c.brand : c.hairline }]}
                      onPress={() => updateTier(tier)}
                    >
                      <Text style={[styles.tierEditChipText, { color: active ? c.onBrand : c.text }]}>{TIER_LABEL[tier]}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            {/* ── Relationship state band (first 3 seconds) ── */}
            {intel && (() => {
              const meta = STATE_META[intel.state];
              const tc = toneColor(meta.tone);
              return (
                <View style={[styles.band, { backgroundColor: c.surface, borderColor: c.hairline, borderRightColor: tc.solid }]}>
                  <View style={[styles.stateChip, { backgroundColor: tc.tint, borderColor: tc.solid }]}>
                    <Feather name={meta.icon} size={13} color={tc.fg} />
                    <Text style={[styles.stateChipText, { color: tc.fg }]}>{meta.label}</Text>
                  </View>
                  {intel.reasons.length > 0 && (
                    <Text style={[styles.reason, { color: c.textMuted }]}>{intel.reasons.join(" · ")}</Text>
                  )}
                  <View style={[styles.actionLine, { backgroundColor: c.brandTint, borderColor: c.brandBorder }]}>
                    <Feather name="zap" size={13} color={c.brandText} />
                    <Text style={[styles.actionText, { color: c.brandText }]}>{intel.action}</Text>
                  </View>
                </View>
              );
            })()}

            {/* ── Decision row: balance owed + credit headroom ── */}
            {intel && (
              <View style={styles.drow}>
                <View style={[styles.stat, { backgroundColor: c.surface, borderColor: credit < 0 ? c.danger : c.hairline }]}>
                  <Text style={[styles.statK, { color: c.textMuted }]}>الرصيد المستحق</Text>
                  {credit < 0
                    ? <MoneyText amount={credit} tone="negative" absolute size="headline" />
                    : credit > 0
                      ? <MoneyText amount={credit} tone="positive" absolute size="headline" />
                      : <MoneyText amount={0} tone="muted" size="headline" />}
                  <Text style={[styles.statHint, { color: c.textFaint }]}>{credit < 0 ? "مدين" : credit > 0 ? "رصيد دائن" : "خالص"}</Text>
                </View>
                <View style={[styles.stat, { backgroundColor: c.surface, borderColor: (intel.limitStatus === "near" || intel.limitStatus === "at") ? c.warning : intel.limitStatus === "over" ? c.danger : c.hairline }]}>
                  <Text style={[styles.statK, { color: c.textMuted }]}>المتاح من الآجل</Text>
                  {intel.limit == null
                    ? <Text style={[styles.noLimit, { color: c.text }]}>بدون سقف</Text>
                    : <MoneyText amount={Math.max(0, intel.headroom ?? 0)} tone={intel.limitStatus === "within" ? "neutral" : "negative"} size="headline" />}
                  {intel.limit != null && (
                    <>
                      <View style={[styles.bar, { backgroundColor: c.hairline }]}>
                        <View style={{ height: "100%", width: `${Math.max(0, Math.min(1, (intel.headroom ?? 0) / intel.limit)) * 100}%`, backgroundColor: intel.limitStatus === "within" ? c.success : intel.limitStatus === "over" ? c.danger : c.warning }} />
                      </View>
                      <Text style={[styles.statHint, { color: c.textFaint }]}>
                        {intel.limitStatus === "within" ? "ضمن الحدود" : intel.limitStatus === "near" ? "قريب من السقف" : intel.limitStatus === "at" ? "بلغ السقف" : "تجاوز السقف"} · {formatMoney(intel.limit)}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* ── Purchasing snapshot ── */}
            {intel && (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Text style={styles.lbl}>نشاط الشراء</Text>
                <KV k="آخر شراء" theme={t} v={intel.daysSince == null ? "لا يوجد" : `منذ ${intel.daysSince} يوماً`} />
                <KV k="معدّل الشراء" theme={t}
                  v={intel.cadence != null ? `كل ~${Math.round(intel.cadence)} أيام` : "غير كافٍ"}
                  tag={intel.status === "active" ? undefined : intel.status === "atrisk" ? { text: "متأخر", tone: "warning" } : intel.status === "dormant" ? { text: "متوقف", tone: "danger" } : undefined} />
                {intel.lastInvoice && (
                  <View style={styles.kv}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                      <MoneyText amount={intel.lastInvoice.amount} size="footnote" />
                      <Text style={[styles.kvK, { color: c.textFaint }]}>· {intel.lastInvoice.credit ? "آجل" : "نقد"}</Text>
                    </View>
                    <Text style={[styles.kvK, { color: c.textMuted }]}>آخر فاتورة</Text>
                  </View>
                )}
                <View style={[styles.kv, { borderTopWidth: 1, borderTopColor: c.hairline, paddingTop: 8, marginTop: 2 }]}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                    <MoneyText amount={intel.allTimeTotal} tone="brand" size="footnote" />
                    <Text style={[styles.kvK, { color: c.textFaint }]}>· {intel.count} فاتورة</Text>
                  </View>
                  <Text style={[styles.kvK, { color: c.textMuted }]}>إجمالي المشتريات</Text>
                </View>
              </View>
            )}

            {/* ── Product preferences ── */}
            {intel && intel.staples.length > 0 && (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Text style={styles.lbl}>ما الذي أعرضه عليه</Text>
                {intel.staples.map((s, i) => (
                  <View key={s.name + i} style={[styles.staple, { borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.hairline }]}>
                    {s.inStock
                      ? <Tag text="متوفر في الشاحنة" tone="success" theme={t} />
                      : s.missing
                        ? <Tag text="غاب عن آخر طلب" tone="warning" theme={t} />
                        : <View style={[styles.qtyPill, { backgroundColor: c.brandTint }]}><Text style={[styles.qtyPillText, { color: c.brandText }]}>{s.qty}</Text></View>}
                    <Text style={[styles.stapleName, { color: c.text }]} numberOfLines={1}>{s.name}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Credit detail ── */}
            {intel && (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Text style={styles.lbl}>تفاصيل الآجل</Text>
                <View style={styles.kv}><MoneyText amount={intel.debt} tone={intel.debt > 0 ? "negative" : "muted"} size="footnote" /><Text style={[styles.kvK, { color: c.textMuted }]}>مدين بـ</Text></View>
                <View style={styles.kv}>{intel.limit != null ? <MoneyText amount={intel.limit} size="footnote" /> : <Text style={[styles.kvV, { color: c.text }]}>بدون سقف</Text>}<Text style={[styles.kvK, { color: c.textMuted }]}>سقف الآجل</Text></View>
                {intel.creditPct != null && (
                  <View style={styles.kv}><Text style={[styles.kvV, { color: c.text }]}>{intel.creditPct}% آجل · {100 - intel.creditPct}% نقد</Text><Text style={[styles.kvK, { color: c.textMuted }]}>نمط الدفع (آخر 10)</Text></View>
                )}
              </View>
            )}

            {/* ── History ── */}
            <Text style={[styles.sectionTitle, { color: c.text }]}>سجل الفواتير</Text>
            {recent.length === 0 ? (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline, alignItems: "center", paddingVertical: 24 }]}>
                <Feather name="file-text" size={32} color={c.textFaint} />
                <Text style={[styles.emptyText, { color: c.textMuted, marginTop: 8 }]}>لا توجد فواتير</Text>
              </View>
            ) : (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline, padding: 0 }]}>
                {recent.map((inv, idx) => (
                  <PressableScale
                    key={inv.sync_id}
                    style={[styles.invRow, idx < recent.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.hairline }]}
                    onPress={() => router.push(`/invoice/${inv.sync_id}`)}
                  >
                    <Feather name="chevron-left" size={18} color={c.textMuted} />
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <MoneyText amount={inv.total_amount ?? 0} size="bodyStrong" />
                      <Text style={[styles.invDate, { color: c.textMuted }]}>
                        {inv.created_at ? new Date(inv.created_at).toLocaleDateString("ar-DZ") : "—"}{"  •  "}{inv.payment_type === "credit" ? "آجل" : "نقد"}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
              </View>
            )}
          </ScrollView>

          {/* ── Sticky action bar ── */}
          <View style={[styles.actionbar, { backgroundColor: c.rail, borderTopColor: c.hairline, paddingBottom: insets.bottom + 12 }]}>
            <PressableScale
              style={[styles.cta, { backgroundColor: c.brand, ...t.elevation.glow }]}
              onPress={() => router.push({ pathname: "/invoice/new", params: { clientSyncId: client.sync_id } })}
              haptic
            >
              <Feather name="plus" size={18} color={c.onBrand} />
              <Text style={[styles.ctaText, { color: c.onBrand }]}>بيع جديد</Text>
            </PressableScale>
            {client.phone ? (
              <PressableScale
                style={[styles.icb, { backgroundColor: c.surface, borderColor: c.hairline }]}
                onPress={() => Linking.openURL(`tel:${client.phone}`)}
                accessibilityLabel="اتصال"
              >
                <Feather name="phone" size={18} color={c.brandText} />
              </PressableScale>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

function KV({ k, v, theme, tag }: { k: string; v: string; theme: ReturnType<typeof useTheme>; tag?: { text: string; tone: Tone } }) {
  const c = theme.color;
  const toneFg = tag ? (tag.tone === "warning" ? c.warningText : tag.tone === "danger" ? c.dangerText : tag.tone === "success" ? c.successText : c.textMuted) : c.text;
  return (
    <View style={styles.kv}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
        <Text style={[styles.kvV, { color: tag ? toneFg : c.text }]}>{v}</Text>
      </View>
      <Text style={[styles.kvK, { color: c.textMuted }]}>{k}</Text>
    </View>
  );
}

function Tag({ text, tone, theme }: { text: string; tone: Tone; theme: ReturnType<typeof useTheme> }) {
  const c = theme.color;
  const map = {
    success: { bg: c.successTint, fg: c.successText },
    warning: { bg: c.warningTint, fg: c.warningText },
    danger: { bg: c.dangerTint, fg: c.dangerText },
    muted: { bg: c.surfaceElevated, fg: c.textMuted },
  }[tone];
  return <View style={[styles.tag, { backgroundColor: map.bg }]}><Text style={[styles.tagText, { color: map.fg }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontFamily: fonts.bold },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },

  headerCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  idRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, fontFamily: fonts.bold },
  clientName: { fontSize: 17, fontFamily: fonts.bold, textAlign: "right" },
  idMeta: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right", marginTop: 2 },
  tierEditRow: { flexDirection: "row-reverse", gap: 6 },
  tierEditChip: { flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  tierEditChipText: { fontSize: 12, fontFamily: fonts.semibold },

  band: { borderRadius: 14, borderWidth: 1, borderRightWidth: 3, padding: 13, gap: 8 },
  stateChip: { alignSelf: "flex-end", flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  stateChipText: { fontSize: 12, fontFamily: fonts.bold },
  reason: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right", lineHeight: 19 },
  actionLine: { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  actionText: { flex: 1, fontSize: 12, fontFamily: fonts.semibold, textAlign: "right" },

  drow: { flexDirection: "row-reverse", gap: 10 },
  stat: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "flex-end", gap: 4 },
  statK: { fontSize: 11, fontFamily: fonts.regular },
  statHint: { fontSize: 10, fontFamily: fonts.regular },
  noLimit: { fontSize: 15, fontFamily: fonts.bold },
  bar: { height: 5, borderRadius: 3, alignSelf: "stretch", overflow: "hidden", marginTop: 2 },

  card: { borderRadius: 14, borderWidth: 1, padding: 13 },
  lbl: { fontSize: 10, letterSpacing: 0.5, color: "#5A6473", fontFamily: fonts.semibold, marginBottom: 8, textAlign: "right" },
  kv: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  kvK: { fontSize: 11, fontFamily: fonts.regular },
  kvV: { fontSize: 12, fontFamily: fonts.semibold },

  staple: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 9 },
  stapleName: { flex: 1, fontSize: 13, fontFamily: fonts.semibold, textAlign: "right", marginRight: 10 },
  qtyPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7, minWidth: 34, alignItems: "center" },
  qtyPillText: { fontSize: 12, fontFamily: fonts.bold },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 10, fontFamily: fonts.bold },

  sectionTitle: { fontSize: 15, fontFamily: fonts.bold, textAlign: "right" },
  invRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 13 },
  invDate: { fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },

  actionbar: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1 },
  cta: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14 },
  ctaText: { fontSize: 16, fontFamily: fonts.bold },
  icb: { width: 50, height: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
