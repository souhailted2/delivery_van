import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MoneyText, PressableScale } from "@/components/ui";
import { Client, getDb } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { formatMoney } from "@/lib/money";
import { fonts, motion } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

const TIER_LABEL: Record<string, string> = { retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة" };
const TIERS = ["retail", "half_wholesale", "wholesale"] as const;
const DAY = 86_400_000;

type HealthKey = "new" | "healthy" | "watch" | "atrisk" | "problem";
type Tone = "success" | "warning" | "danger" | "muted";

interface RecentInvoice { sync_id: string; total_amount?: number; payment_type?: string; created_at?: string; }
interface Staple { name: string; qty: number; inStock: boolean; missing: boolean; }
interface Intel {
  count: number; daysSince: number | null; cadence: number | null;
  status: "new" | "active" | "atrisk" | "dormant";
  creditPct: number | null; trendDecline: boolean;
  lastInvoice: { amount: number; credit: boolean; ts: number } | null;
  staples: Staple[];
  debt: number; limit: number | null; headroom: number | null;
  limitStatus: "none" | "within" | "near" | "at" | "over";
  state: HealthKey; reasons: string[]; action: string;
}

const median = (arr: number[]) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const STATE_META: Record<HealthKey, { label: string; tone: Tone; icon: any }> = {
  healthy: { label: "علاقة سليمة", tone: "success", icon: "check-circle" },
  watch: { label: "تحتاج انتباه", tone: "warning", icon: "eye" },
  atrisk: { label: "علاقة معرّضة للخطر", tone: "warning", icon: "alert-triangle" },
  problem: { label: "علاقة حرجة", tone: "danger", icon: "alert-octagon" },
  new: { label: "عميل جديد", tone: "muted", icon: "user-plus" },
};

const LIMIT_LABEL: Record<string, string> = { within: "ضمن الحدود", near: "قريب من السقف", at: "بلغ السقف", over: "تجاوز السقف" };

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
  const fade = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) { setLoading(false); return; }
    const cl = await db.getFirstAsync<Client>("SELECT * FROM clients WHERE sync_id = ? AND is_deleted = 0", [syncId]);
    setClient(cl ?? null);
    if (!cl) { setLoading(false); return; }

    const idMatch = "(i.client_sync_id = ? OR i.client_id = ?)";
    const params = [syncId, cl.id ?? -1];

    const rows = await db.getAllAsync<{ sync_id: string; total_amount: number; payment_type: string; created_at: string }>(
      `SELECT i.sync_id, i.total_amount, i.payment_type, i.created_at FROM invoices i
       WHERE ${idMatch} AND i.is_deleted = 0 ORDER BY i.created_at ASC`, params);
    const inv = rows.map(r => ({ sync_id: r.sync_id, amount: Number(r.total_amount ?? 0), credit: r.payment_type === "credit", ts: Date.parse(r.created_at) })).filter(r => Number.isFinite(r.ts));

    const topRows = await db.getAllAsync<{ product_id: number | null; product_name: string; total_qty: number }>(
      `SELECT MAX(ii.product_id) as product_id, ii.product_name as product_name, COALESCE(SUM(ii.quantity),0) as total_qty
       FROM invoice_items ii JOIN invoices i ON (ii.invoice_sync_id = i.sync_id OR ii.invoice_id = i.id)
       WHERE ${idMatch} AND i.is_deleted = 0 AND ii.product_name IS NOT NULL
       GROUP BY ii.product_name ORDER BY total_qty DESC LIMIT 6`, params);

    const lastSync = inv.length ? inv[inv.length - 1].sync_id : null;
    const lastItemNames = new Set<string>();
    if (lastSync) {
      const li = await db.getAllAsync<{ product_name: string }>("SELECT DISTINCT product_name FROM invoice_items WHERE invoice_sync_id = ? AND product_name IS NOT NULL", [lastSync]);
      li.forEach(r => lastItemNames.add(r.product_name));
    }
    const stockSet = new Set<number>();
    if (user?.truckId != null) {
      const st = await db.getAllAsync<{ product_id: number }>("SELECT product_id FROM truck_stock WHERE truck_id = ? AND quantity > 0", [user.truckId]);
      st.forEach(r => { if (r.product_id != null) stockSet.add(r.product_id); });
    }
    const rec = await db.getAllAsync<RecentInvoice>(
      `SELECT i.sync_id, i.total_amount, i.payment_type, i.created_at FROM invoices i
       WHERE ${idMatch} AND i.is_deleted = 0 ORDER BY i.created_at DESC LIMIT 8`, params);
    setRecent(rec);

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

    const reasons: string[] = [];
    if (status === "dormant" || status === "atrisk") reasons.push(`لم يشترِ منذ ${daysSince} يوماً${cadence != null ? ` (المعتاد كل ${Math.round(cadence)} أيام)` : ""}`);
    if (limitStatus === "over") reasons.push("تجاوز سقف الآجل");
    else if (limitStatus === "at") reasons.push("بلغ سقف الآجل");
    else if (limitStatus === "near") reasons.push("اقترب من سقف الآجل");
    if (trendDecline) reasons.push("انخفاض ملحوظ في حجم الطلبات");
    if (state === "healthy") reasons.push(`يشتري بانتظام${cadence != null ? ` (كل ${Math.round(cadence)} أيام)` : ""}`);
    if (state === "new") reasons.push("لا يوجد سجل شراء كافٍ بعد");

    const action = { problem: "حصّل الدين أولاً — بيع نقداً فقط", atrisk: "أعد التواصل وحصّل قبل أي بيع آجل", watch: "اعرض عليه المنتجات الغائبة عن آخر طلب", healthy: "علاقة جيدة — اعرض عليه منتجاته المعتادة", new: "ابنِ العلاقة — سجّل أول طلب" }[state];

    const staples: Staple[] = topRows.slice(0, 5).map(r => ({ name: r.product_name, qty: Math.round(Number(r.total_qty ?? 0)), inStock: r.product_id != null && stockSet.has(r.product_id), missing: !lastItemNames.has(r.product_name) }));

    setIntel({ count: n, daysSince, cadence, status, creditPct, trendDecline, lastInvoice: n ? { amount: inv[n - 1].amount, credit: inv[n - 1].credit, ts: inv[n - 1].ts } : null, staples, debt, limit, headroom, limitStatus, state, reasons, action });
    setLoading(false);
  }, [syncId, user?.truckId]);

  useRefreshOnFocus(load);

  // One purposeful entrance: content fades/rises in when data is ready.
  useEffect(() => {
    if (!loading) {
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: motion.duration.normal, easing: motion.easing.out, useNativeDriver: true }).start();
    }
  }, [loading, intel, fade]);

  const updateTier = async (tier: string) => {
    if (!client || client.client_type === tier) return;
    const db = await getDb();
    if (!db) return;
    await db.runAsync("UPDATE clients SET client_type = ?, _pending = 1, updated_at = ? WHERE sync_id = ?", [tier, new Date().toISOString(), client.sync_id]);
    setClient({ ...client, client_type: tier });
    triggerSync();
  };

  const tones = (tone: Tone) => ({
    success: { fg: c.successText, tint: c.successTint, solid: c.success },
    warning: { fg: c.warningText, tint: c.warningTint, solid: c.warning },
    danger: { fg: c.dangerText, tint: c.dangerTint, solid: c.danger },
    muted: { fg: c.textMuted, tint: c.surfaceElevated, solid: c.hairline },
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
          <Animated.ScrollView style={{ opacity: fade }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {/* ── TIER 1 — VERDICT HERO (state-tinted, dominant) ── */}
            {intel && (() => {
              const meta = STATE_META[intel.state];
              const tc = tones(meta.tone);
              const owes = credit < 0;
              return (
                <View style={[styles.hero, { backgroundColor: tc.tint, borderBottomColor: tc.solid }]}>
                  <View style={styles.heroTop}>
                    <View style={[styles.av, { backgroundColor: c.brandTint, borderColor: c.brandBorder }]}>
                      <Text style={[styles.avText, { color: c.brandText }]}>{client.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text style={[styles.heroName, { color: c.text }]} numberOfLines={1}>{client.name}</Text>
                      <Text style={[styles.heroMeta, { color: c.textMuted }]}>{TIER_LABEL[client.client_type ?? "retail"]}{client.phone ? ` · ${client.phone}` : ""}</Text>
                    </View>
                  </View>

                  <View style={styles.stateRow}>
                    <Feather name={meta.icon} size={18} color={tc.fg} />
                    <Text style={[styles.stateWord, { color: tc.fg }]}>{meta.label}</Text>
                  </View>
                  {intel.reasons.length > 0 && (
                    <Text style={[styles.stateSub, { color: c.textMuted }]}>{intel.reasons.join(" · ")}</Text>
                  )}

                  {/* gating money — dominant */}
                  <View style={styles.moneyBlock}>
                    {owes ? (
                      <>
                        <Text style={[styles.moneyLabel, { color: c.textMuted }]}>مدين بـ</Text>
                        <MoneyText amount={intel.debt} tone="negative" size="display" />
                      </>
                    ) : credit > 0 ? (
                      <>
                        <Text style={[styles.moneyLabel, { color: c.textMuted }]}>رصيد دائن</Text>
                        <MoneyText amount={credit} tone="positive" absolute size="display" />
                      </>
                    ) : (
                      <Text style={[styles.moneyClear, { color: c.textMuted }]}>الحساب خالص</Text>
                    )}
                    {intel.limit != null ? (
                      <Text style={[styles.headroom, { color: intel.limitStatus === "within" ? c.textMuted : intel.limitStatus === "over" ? c.dangerText : c.warningText }]}>
                        المتاح للآجل {formatMoney(Math.max(0, intel.headroom ?? 0))} — {LIMIT_LABEL[intel.limitStatus] ?? ""}
                      </Text>
                    ) : (
                      <Text style={[styles.headroom, { color: c.textFaint }]}>بدون سقف للآجل</Text>
                    )}
                  </View>

                  {/* the move */}
                  <View style={[styles.action, { backgroundColor: c.brandTint, borderColor: c.brandBorder }]}>
                    <Feather name="zap" size={14} color={c.brandText} />
                    <Text style={[styles.actionText, { color: c.brandText }]}>{intel.action}</Text>
                  </View>
                </View>
              );
            })()}

            {/* ── TIER 2 — what to do (quiet, flowing) ── */}
            {intel && (
              <View style={styles.flow}>
                {/* purchasing rhythm — one quiet line */}
                {intel.lastInvoice && (
                  <Text style={[styles.rhythm, { color: c.textMuted }]}>
                    {intel.cadence != null ? `يشتري كل ~${Math.round(intel.cadence)} أيام · ` : ""}آخر فاتورة {formatMoney(intel.lastInvoice.amount)} ({intel.lastInvoice.credit ? "آجل" : "نقد"}){intel.daysSince != null ? ` قبل ${intel.daysSince} يوماً` : ""}
                  </Text>
                )}

                {/* staples — emphasis strip, not a card */}
                {intel.staples.length > 0 && (
                  <>
                    <Text style={[styles.flowLabel, { color: c.textFaint }]}>اعرض عليه الآن</Text>
                    <View style={styles.strip}>
                      {intel.staples.map((s, i) => {
                        const t2 = s.inStock ? tones("success") : s.missing ? tones("warning") : null;
                        return (
                          <View key={s.name + i} style={[styles.pchip, t2 ? { backgroundColor: t2.tint } : { backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairline }]}>
                            {s.inStock ? <Feather name="check" size={11} color={c.successText} /> : s.missing ? <Feather name="corner-up-left" size={11} color={c.warningText} /> : null}
                            <Text style={[styles.pchipText, { color: t2 ? t2.fg : c.text }]}>{s.name}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* tier — demoted, small */}
                <View style={styles.tierRow}>
                  {TIERS.map(tier => {
                    const active = (client.client_type ?? "retail") === tier;
                    return (
                      <PressableScale key={tier} style={[styles.tierChip, { backgroundColor: active ? c.brand : "transparent", borderColor: active ? c.brand : c.hairline }]} onPress={() => updateTier(tier)}>
                        <Text style={[styles.tierChipText, { color: active ? c.onBrand : c.textMuted }]}>{TIER_LABEL[tier]}</Text>
                      </PressableScale>
                    );
                  })}
                </View>

                {/* ── TIER 3 — evidence (quiet reference rows, no cards) ── */}
                <View style={[styles.divider, { backgroundColor: c.hairline }]} />
                {intel.creditPct != null && (
                  <View style={styles.refRow}>
                    <Text style={[styles.refV, { color: c.textMuted }]}>{intel.creditPct}% آجل{intel.limit != null ? ` · سقف ${formatMoney(intel.limit)}` : ""}</Text>
                    <Text style={[styles.refK, { color: c.textFaint }]}>الآجل</Text>
                  </View>
                )}
                {recent.length > 0 && <Text style={[styles.flowLabel, { color: c.textFaint, marginTop: 6 }]}>آخر الفواتير</Text>}
                {recent.map((inv, i) => (
                  <PressableScale key={inv.sync_id} onPress={() => router.push(`/invoice/${inv.sync_id}`)} style={[styles.refRow, { borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.hairline }]}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                      <MoneyText amount={inv.total_amount ?? 0} size="footnote" />
                      <Text style={[styles.refK, { color: c.textFaint }]}>· {inv.payment_type === "credit" ? "آجل" : "نقد"}</Text>
                    </View>
                    <Text style={[styles.refK, { color: c.textMuted }]}>{inv.created_at ? new Date(inv.created_at).toLocaleDateString("ar-DZ") : "—"}</Text>
                  </PressableScale>
                ))}
              </View>
            )}
          </Animated.ScrollView>

          {/* sticky action bar */}
          <View style={[styles.actionbar, { backgroundColor: c.rail, borderTopColor: c.hairline, paddingBottom: insets.bottom + 12 }]}>
            <PressableScale style={[styles.cta, { backgroundColor: c.brand, ...t.elevation.glow }]} haptic onPress={() => router.push({ pathname: "/invoice/new", params: { clientSyncId: client.sync_id } })}>
              <Feather name="plus" size={18} color={c.onBrand} />
              <Text style={[styles.ctaText, { color: c.onBrand }]}>بيع جديد</Text>
            </PressableScale>
            {client.phone ? (
              <PressableScale style={[styles.icb, { backgroundColor: c.surface, borderColor: c.hairline }]} accessibilityLabel="اتصال" onPress={() => Linking.openURL(`tel:${client.phone}`)}>
                <Feather name="phone" size={18} color={c.brandText} />
              </PressableScale>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 17, fontFamily: fonts.bold },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },

  // Hero
  hero: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, borderBottomWidth: 1 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  av: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 18, fontFamily: fonts.bold },
  heroName: { fontSize: 17, fontFamily: fonts.bold, textAlign: "right" },
  heroMeta: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right", marginTop: 2 },
  stateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 16 },
  stateWord: { fontSize: 22, fontFamily: fonts.bold },
  stateSub: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right", marginTop: 6, lineHeight: 19 },
  moneyBlock: { alignItems: "flex-end", marginTop: 16 },
  moneyLabel: { fontSize: 11, fontFamily: fonts.semibold, marginBottom: 1 },
  moneyClear: { fontSize: 20, fontFamily: fonts.bold },
  headroom: { fontSize: 12, fontFamily: fonts.semibold, marginTop: 7 },
  action: { flexDirection: "row-reverse", alignItems: "center", gap: 7, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  actionText: { flex: 1, fontSize: 13, fontFamily: fonts.bold, textAlign: "right" },

  // Flow (tier 2 + 3)
  flow: { paddingHorizontal: 14, paddingTop: 12 },
  rhythm: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right", lineHeight: 20 },
  flowLabel: { fontSize: 9.5, fontFamily: fonts.semibold, letterSpacing: 0.6, textAlign: "right", marginTop: 14, marginBottom: 8 },
  strip: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  pchip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  pchipText: { fontSize: 11, fontFamily: fonts.semibold },
  tierRow: { flexDirection: "row-reverse", gap: 6, marginTop: 16 },
  tierChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
  tierChipText: { fontSize: 11, fontFamily: fonts.semibold },
  divider: { height: 1, marginTop: 16 },
  refRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 9 },
  refK: { fontSize: 11, fontFamily: fonts.regular },
  refV: { fontSize: 12, fontFamily: fonts.semibold },

  // Action bar
  actionbar: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1 },
  cta: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14 },
  ctaText: { fontSize: 16, fontFamily: fonts.bold },
  icb: { width: 50, height: 50, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
