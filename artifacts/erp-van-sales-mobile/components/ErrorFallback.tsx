import { Feather } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, PressableScale } from "@/components/ui";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();

  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      console.error("Failed to restart app:", restartError);
      resetError();
    }
  };

  const formatErrorDetails = (): string => {
    let details = `Error: ${error.message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  const monoFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {__DEV__ ? (
        <PressableScale
          onPress={() => setIsModalVisible(true)}
          accessibilityLabel="View error details"
          accessibilityRole="button"
          style={[
            styles.topButton,
            {
              top: insets.top + 16,
              backgroundColor: c.surface,
            },
          ]}
        >
          <Feather name="alert-circle" size={20} color={c.text} />
        </PressableScale>
      ) : null}

      <View style={styles.content}>
        <Text style={[styles.title, { color: c.text }]}>
          Something went wrong
        </Text>

        <Text style={[styles.message, { color: c.textMuted }]}>
          Please reload the app to continue.
        </Text>

        <AppButton
          label="Try Again"
          size="lg"
          onPress={handleRestart}
          style={styles.button}
        />
      </View>

      {__DEV__ ? (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: c.scrim }]}>
            <View
              style={[
                styles.modalContainer,
                { backgroundColor: c.bg },
              ]}
            >
              <View
                style={[
                  styles.modalHeader,
                  { borderBottomColor: c.hairline },
                ]}
              >
                <Text style={[styles.modalTitle, { color: c.text }]}>
                  Error Details
                </Text>
                <PressableScale
                  onPress={() => setIsModalVisible(false)}
                  accessibilityLabel="Close error details"
                  accessibilityRole="button"
                  style={styles.closeButton}
                >
                  <Feather name="x" size={24} color={c.text} />
                </PressableScale>
              </View>

              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={[
                  styles.modalScrollContent,
                  { paddingBottom: insets.bottom + 16 },
                ]}
                showsVerticalScrollIndicator
              >
                <View
                  style={[
                    styles.errorContainer,
                    { backgroundColor: c.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.errorText,
                      {
                        color: c.text,
                        fontFamily: monoFont,
                      },
                    ]}
                    selectable
                  >
                    {formatErrorDetails()}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    maxWidth: 600,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    textAlign: "center",
    lineHeight: 40,
  },
  message: {
    fontSize: 16,
    fontFamily: fonts.regular,
    textAlign: "center",
    lineHeight: 24,
  },
  topButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  button: {
    minWidth: 200,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "90%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: fonts.semibold,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  errorContainer: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    padding: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    width: "100%",
  },
});
