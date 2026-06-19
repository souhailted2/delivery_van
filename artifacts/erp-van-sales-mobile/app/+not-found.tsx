import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

export default function NotFoundScreen() {
  const t = useTheme();
  const c = t.color;

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <Text style={[styles.title, { color: c.text }]}>
          This screen doesn&apos;t exist.
        </Text>

        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: c.brand }]}>
            Go to home screen!
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.bold,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
});
