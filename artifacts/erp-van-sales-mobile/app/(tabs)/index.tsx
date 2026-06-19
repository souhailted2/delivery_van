import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { MoneyText, PressableScale } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { getDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { fonts } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { apiGet } from "@/lib/api";

interface Stats {
  todayInvoices: number;
  todayTotal: number;
  pendingSync: number;
  truckCash: number;
  truckName: string;
  totalClients: number;
}

interface AppVersionInfo {
  tag: string;
  buildNumber: number;
  name?: string;
  publishedAt?: string;
  downloadUrl: string;
  releaseUrl: string;
}

type UpdateStatus = "idle" | "checking" | "up-to-date" | "update-available" | "error";

function StatCard({
  icon,
  label,
  value,
  accent,
  accentTint,
  t,
}: {
  icon: any;
  label: string;
  value: string;
  accent: string;
  accentTint: string;
  t: Theme;
}) {
  const c = t.color;
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: c.surface, borderColor: c.hairline },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: accentTint }]}>
        <Feather name={icon} size={22} color={accent} />
      </View>
      <Text style={[styles.statValue, { color: c.text }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

function UpdateCard() {
  const t = useTheme();
  const c = t.color;
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [info, setInfo] = useState<AppVersionInfo | null>(null);

  // Current installed build — versionCode from app.json (android.versionCode)
  const currentBuildNumber: number =
    (Constants.expoConfig?.android?.versionCode as number | undefined) ?? 0;
  const currentVersion = Constants.expoConfig?.version ?? "1.0.0";

  const checkUpdate = async () => {
    setStatus("checking");
    setInfo(null);
    try {
      const data = await apiGet<AppVersionInfo>("/app/version");
      setInfo(data);
      if (data.buildNumber > currentBuildNumber) {
        setStatus("update-available");
      } else {
        setStatus("up-to-date");
      }
    } catch {
      setStatus("error");
    }
  };

  const openDownload = () => {
    if (info?.downloadUrl) {
      Linking.openURL(info.downloadUrl);
    }
  };

  return (
    <View
      style={[
        styles.updateCard,
        { backgroundColor: c.surface, borderColor: c.hairline },
      ]}
    >
      <View style={styles.updateRow}>
        <Feather name="smartphone" size={16} color={c.textMuted} />
        <Text style={[styles.updateLabel, { color: c.textMuted }]}>
          الإصدار الحالي:{" "}
          <Text style={{ color: c.text, fontFamily: fonts.bold }}>
            {currentVersion} (build {currentBuildNumber})
          </Text>
        </Text>
      </View>

      {status === "up-to-date" && (
        <View style={styles.updateRow}>
          <Feather name="check-circle" size={16} color={c.success} />
          <Text style={[styles.updateLabel, { color: c.success }]}>
            أنت على أحدث إصدار
          </Text>
        </View>
      )}

      {status === "update-available" && info && (
        <View style={styles.updateRow}>
          <Feather name="alert-circle" size={16} color={c.warning} />
          <Text style={[styles.updateLabel, { color: c.warning }]}>
            يوجد تحديث جديد: {info.tag}
          </Text>
        </View>
      )}

      {status === "error" && (
        <Text style={[styles.errorText, { color: c.danger }]}>تعذّر الاتصال بالخادم للتحقق من التحديثات</Text>
      )}

      <View style={styles.updateButtons}>
        {status !== "update-available" && (
          <PressableScale
            style={[
              styles.checkBtn,
              { borderColor: c.brand },
              status === "checking" && { opacity: 0.6 },
            ]}
            onPress={checkUpdate}
            disabled={status === "checking"}
          >
            {status === "checking" ? (
              <ActivityIndicator size="small" color={c.brand} />
            ) : (
              <Feather name="refresh-cw" size={14} color={c.brand} />
            )}
            <Text style={[styles.checkBtnText, { color: c.brand }]}>
              {status === "checking" ? "جارٍ الفحص..." : "تحقق من التحديثات"}
            </Text>
          </PressableScale>
        )}

        {status === "update-available" && (
          <>
            <PressableScale
              style={[styles.downloadBtn, { backgroundColor: c.success }]}
              onPress={openDownload}
            >
              <Feather name="download" size={14} color={c.onColor} />
              <Text style={[styles.downloadBtnText, { color: c.onColor }]}>تنزيل التحديث</Text>
            </PressableScale>
            <PressableScale
              style={[styles.checkBtn, { borderColor: c.hairline }]}
              onPress={checkUpdate}
            >
              <Feather name="refresh-cw" size={14} color={c.textMuted} />
              <Text style={[styles.checkBtnText, { color: c.textMuted }]}>
                إعادة الفحص
              </Text>
            </PressableScale>
          </>
        )}
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const t = useTheme();
  const c = t.color;
  const { user } = useAuth();
  const { triggerSync, pending } = useSync();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      const db = await getDb();
      if (!db) {
        setLoading(false);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const [invRow, totalRow, clientRow, truckRow] = await Promise.all([
        db.getFirstAsync<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM invoices WHERE created_at >= ? AND is_deleted = 0",
          [todayStr]
        ),
        db.getFirstAsync<{ total: number }>(
          "SELECT SUM(total_amount) as total FROM invoices WHERE created_at >= ? AND is_deleted = 0",
          [todayStr]
        ),
        db.getFirstAsync<{ cnt: number }>(
          "SELECT COUNT(*) as cnt FROM clients WHERE is_deleted = 0"
        ),
        db.getFirstAsync<{ name: string; cash_balance: number }>(
          user?.truckId
            ? "SELECT name, cash_balance FROM trucks WHERE id = ? AND is_deleted = 0"
            : "SELECT name, cash_balance FROM trucks WHERE is_deleted = 0 LIMIT 1",
          user?.truckId ? [user.truckId] : []
        ),
      ]);

      setStats({
        todayInvoices: invRow?.cnt ?? 0,
        todayTotal: totalRow?.total ?? 0,
        pendingSync: pending,
        truckCash: truckRow?.cash_balance ?? 0,
        truckName: truckRow?.name ?? "—",
        totalClients: clientRow?.cnt ?? 0,
      });
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, [pending]);

  if (user?.role === "truck") {
    return <Redirect href="/(tabs)/truck-dashboard" />;
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              triggerSync();
              loadStats();
            }}
            tintColor={c.brand}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.greeting, { color: c.text }]}>
          مرحباً{user?.fullName ? ` ${user.fullName}` : ""}
        </Text>
        {stats && (
          <>
            <View
              style={[styles.truckCard, { backgroundColor: c.surface, borderColor: c.brandBorder, ...t.elevation.glow }]}
            >
              <View style={[styles.truckIcon, { backgroundColor: c.brandTint }]}>
                <Feather name="truck" size={20} color={c.brandBright} />
              </View>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.truckName, { color: c.text }]}>{stats.truckName}</Text>
                <Text style={[styles.truckSub, { color: c.textMuted }]}>رصيد الصندوق</Text>
              </View>
              <MoneyText amount={stats.truckCash} size="title" />
            </View>

            <View style={styles.grid}>
              <StatCard
                icon="file-text"
                label="فواتير اليوم"
                value={String(stats.todayInvoices)}
                accent={c.brandBright}
                accentTint={c.brandTint}
                t={t}
              />
              <StatCard
                icon="dollar-sign"
                label="مبيعات اليوم"
                value={formatMoney(stats.todayTotal)}
                accent={c.success}
                accentTint={c.successTint}
                t={t}
              />
              <StatCard
                icon="users"
                label="العملاء"
                value={String(stats.totalClients)}
                accent={c.brandBright}
                accentTint={c.brandTint}
                t={t}
              />
              <StatCard
                icon="clock"
                label="في الانتظار"
                value={String(stats.pendingSync)}
                accent={stats.pendingSync > 0 ? c.warning : c.success}
                accentTint={stats.pendingSync > 0 ? c.warningTint : c.successTint}
                t={t}
              />
            </View>
          </>
        )}

        <UpdateCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16, paddingBottom: 100 },
  greeting: {
    fontSize: 20,
    fontFamily: fonts.bold,
    textAlign: "right",
  },
  truckCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  truckIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  truckName: {
    fontSize: 16,
    fontFamily: fonts.bold,
    textAlign: "right",
  },
  truckSub: {
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: "right",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    width: "47%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 16, fontFamily: fonts.bold },
  statLabel: { fontSize: 12, fontFamily: fonts.regular },

  updateCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  updateRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  updateLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: "right",
    flex: 1,
  },
  errorText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    textAlign: "right",
  },
  updateButtons: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 2,
  },
  checkBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: "center",
  },
  checkBtnText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  downloadBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    justifyContent: "center",
    flex: 1,
  },
  downloadBtnText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
});
