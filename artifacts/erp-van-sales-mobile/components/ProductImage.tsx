import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { getActiveApiUrl, getSessionSid } from "@/lib/api";
import { getLocalImagePath } from "@/lib/sync";

type Stage = "local" | "remote" | "placeholder";

// Renders a product photo offline-first: shows the pre-cached local image,
// falls back to the remote (authenticated) URL, then to a placeholder icon.
export function ProductImage({
  imageUrl,
  localUri,
  size = 56,
  radius = 10,
  colors,
  iconSize,
}: {
  imageUrl?: string | null;
  localUri?: string | null;
  size?: number;
  radius?: number;
  colors: any;
  iconSize?: number;
}) {
  const local = localUri || getLocalImagePath(imageUrl);
  const hasImage = !!(localUri || imageUrl) && !!local;
  const [stage, setStage] = useState<Stage>(hasImage ? "local" : "placeholder");
  const [remoteUri, setRemoteUri] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string> | undefined>(undefined);

  useEffect(() => {
    setStage(hasImage ? "local" : "placeholder");
  }, [hasImage]);

  const prepareRemote = async () => {
    if (!imageUrl) { setStage("placeholder"); return; }
    try {
      const sid = await getSessionSid();
      const base = await getActiveApiUrl();
      const full = imageUrl.startsWith("http") ? imageUrl : `${base}${imageUrl}`;
      setRemoteUri(full);
      setHeaders(sid ? { Cookie: `connect.sid=${sid}` } : undefined);
      setStage("remote");
    } catch {
      setStage("placeholder");
    }
  };

  const boxStyle = { width: size, height: size, borderRadius: radius };

  if (stage === "placeholder") {
    return (
      <View style={[styles.ph, boxStyle, { backgroundColor: colors.secondary }]}>
        <Feather name="package" size={iconSize ?? Math.round(size * 0.42)} color={colors.mutedForeground} />
      </View>
    );
  }

  if (stage === "remote") {
    return (
      <Image
        source={remoteUri ? { uri: remoteUri, headers } : undefined}
        style={boxStyle}
        contentFit="cover"
        transition={150}
        onError={() => setStage("placeholder")}
      />
    );
  }

  return (
    <Image
      source={local ? { uri: local } : undefined}
      style={boxStyle}
      contentFit="cover"
      transition={150}
      onError={prepareRemote}
    />
  );
}

const styles = StyleSheet.create({
  ph: { alignItems: "center", justifyContent: "center" },
});
