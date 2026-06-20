import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
  useFonts,
} from "@expo-google-fonts/cairo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { I18nManager } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { useUpdateCheck } from "@/lib/useUpdateCheck";
import { getDb, isBootstrapNeeded } from "@/lib/db";

I18nManager.forceRTL(true);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { user, loading: authLoading } = useAuth();
  const [bootstrapChecked, setBootstrapChecked] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        if (db) {
          const needed = await isBootstrapNeeded(db);
          setNeedsBootstrap(needed);
        }
      } catch {
        // If DB check fails, proceed normally so the app isn't blocked
      } finally {
        setBootstrapChecked(true);
      }
    })();
  }, []);

  // Auto-check for updates once per day — only when authenticated
  useUpdateCheck(!!user);

  useEffect(() => {
    if (!bootstrapChecked || authLoading) return;
    if (needsBootstrap) {
      router.replace("/setup");
    }
  }, [bootstrapChecked, authLoading, needsBootstrap]);

  if (!bootstrapChecked || authLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="setup" />
      <Stack.Screen name="(tabs)" redirect={!user} />
      <Stack.Screen name="login" />
      <Stack.Screen name="invoice/new" options={{ presentation: "modal" }} />
      <Stack.Screen name="invoice/[syncId]" />
      <Stack.Screen name="client/[syncId]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <SyncProvider>
                  <RootLayoutNav />
                </SyncProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
