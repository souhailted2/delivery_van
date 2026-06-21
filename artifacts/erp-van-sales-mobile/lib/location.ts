import * as Location from "expo-location";

export interface Coords { latitude: number; longitude: number; }

/**
 * Request foreground location permission and read the current position.
 * Returns null if permission is denied or the fix fails — callers show a message.
 */
export async function captureLocation(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}
