import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { getDb } from "@/lib/db";
import { useColors } from "@/hooks/useColors";
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
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

function UpdateCard() {
  const colors = useColors();
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
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.updateRow}>
        <Feather name="smartphone" size={16} color={colors.mutedForeground} />
        <Text style={[styles.updateLabel, { color: colors.mutedForeground }]}>
          الإصدار الحالي:{" "}
          <Text style={{ color: colors.foreground, fontFamily: "Cairo_700Bold" }}>
            {currentVersion} (build {currentBuildNumber})
          </Text>
        </Text>
      </View>

      {status === "up-to-date" && (
        <View style={styles.updateRow}>
          <Feather name="check-circle" size={16} color="#22c55e" />
          <Text style={[styles.updateLabel, { color: "#22c55e" }]}>
            أنت على أحدث إصدار
          </Text>
        </View>
      )}

      {status === "update-available" && info && (
        <View style={styles.updateRow}>
          <Feather name="alert-circle" size={16} color="#f59e0b" />
          <Text style={[styles.updateLabel, { color: "#f59e0b" }]}>
            يوجد تحديث جديد: {info.tag}
          </Text>
        </View>
      )}

      {status === "error" && (
        <Text style={styles.errorText}>تعذّر الاتصال بالخادم للتحقق من التحديثات</Text>
      )}

      <View style={styles.updateButtons}>
        {status !== "update-available" && (
          <TouchableOpacity
            style={[
              styles.checkBtn,
              { borderColor: colors.primary },
              status === "checking" && { opacity: 0.6 },
            ]}
            onPress={checkUpdate}
            disabled={status === "checking"}
          >
            {status === "checking" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="refresh-cw" size={14} color={colors.primary} />
            )}
            <Text style={[styles.checkBtnText, { color: colors.primary }]}>
              {status === "checking" ? "جارٍ الفحص..." : "تحقق من التحديثات"}
            </Text>
          </TouchableOpacity>
        )}

        {status === "update-available" && (
          <>
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={openDownload}
            >
              <Feather name="download" size={14} color="#fff" />
              <Text style={styles.downloadBtnText}>تنزيل التحديث</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.checkBtn, { borderColor: colors.border }]}
              onPress={checkUpdate}
            >
              <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
              <Text style={[styles.checkBtnText, { color: colors.mutedForeground }]}>
                إعادة الفحص
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
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

  const fmt = (n: number) => n.toLocaleString("fr-DZ") + " د.ج";

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.greeting, { color: colors.foreground }]}>
          مرحباً{user?.fullName ? ` ${user.fullName}` : ""}
        </Text>
        {stats && (
          <>
            <View
              style={[styles.truckCard, { backgroundColor: colors.primary }]}
            >
              <Feather name="truck" size={20} color="#fff" />
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.truckName}>{stats.truckName}</Text>
                <Text style={styles.truckSub}>رصيد الصندوق</Text>
              </View>
              <Text style={styles.truckCash}>{fmt(stats.truckCash)}</Text>
            </View>

            <View style={styles.grid}>
              <StatCard
                icon="file-text"
                label="فواتير اليوم"
                value={String(stats.todayInvoices)}
                color="#f97316"
              />
              <StatCard
                icon="dollar-sign"
                label="مبيعات اليوم"
                value={fmt(stats.todayTotal)}
                color="#22c55e"
              />
              <StatCard
                icon="users"
                label="العملاء"
                value={String(stats.totalClients)}
                color="#3b82f6"
              />
              <StatCard
                icon="clock"
                label="في الانتظار"
                value={String(stats.pendingSync)}
                color={stats.pendingSync > 0 ? "#f59e0b" : "#22c55e"}
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
    fontFamily: "Cairo_700Bold",
    textAlign: "right",
  },
  truckCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 10,
  },
  truckName: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Cairo_700Bold",
    textAlign: "right",
  },
  truckSub: {
    color: "#ffffff99",
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    textAlign: "right",
  },
  truckCash: { color: "#fff", fontSize: 18, fontFamily: "Cairo_700Bold" },
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
  statValue: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Cairo_400Regular" },

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
    fontFamily: "Cairo_400Regular",
    textAlign: "right",
    flex: 1,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "#ef4444",
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
    fontFamily: "Cairo_600SemiBold",
  },
  downloadBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#22c55e",
    justifyContent: "center",
    flex: 1,
  },
  downloadBtnText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: "#fff",
  },
});
