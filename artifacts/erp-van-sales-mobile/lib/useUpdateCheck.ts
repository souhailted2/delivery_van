import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { apiGet } from "@/lib/api";

const LAST_CHECK_KEY = "update_check_date";

interface AppVersionInfo {
  tag: string;
  buildNumber: number;
  downloadUrl: string;
  releaseUrl: string;
}

/**
 * Automatically checks for a new APK version once per day on app start.
 * Shows a native Alert if a newer build is available.
 * Uses AsyncStorage to throttle: at most one check per calendar day.
 *
 * Call this hook only when the user is authenticated (i.e. inside RootLayoutNav
 * after the auth guard passes), so unauthenticated sessions never hit the API.
 */
export function useUpdateCheck(enabled: boolean) {
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current) return;
    ran.current = true;

    const check = async () => {
      try {
        // Throttle: skip if already checked today
        const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
        const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
        if (lastCheck === today) return;

        // Mark as checked for today before the network call so fast re-mounts
        // don't fire a second request.
        await AsyncStorage.setItem(LAST_CHECK_KEY, today);

        const data = await apiGet<AppVersionInfo>("/app/version");

        const currentBuild: number =
          (Constants.expoConfig?.android?.versionCode as number | undefined) ?? 0;

        if (data.buildNumber <= currentBuild) return; // already up to date

        // Show alert with download option
        Alert.alert(
          "يوجد تحديث جديد",
          `الإصدار ${data.tag} متاح الآن.\nهل تريد تنزيل التحديث؟`,
          [
            {
              text: "تنزيل",
              onPress: () => Linking.openURL(data.downloadUrl),
            },
            {
              text: "لاحقاً",
              style: "cancel",
            },
          ],
          { cancelable: true }
        );
      } catch {
        // Silent fail — update check is best-effort
      }
    };

    // Small delay so the app UI is fully rendered before showing an alert
    const timer = setTimeout(check, 3000);
    return () => clearTimeout(timer);
  }, [enabled]);
}
