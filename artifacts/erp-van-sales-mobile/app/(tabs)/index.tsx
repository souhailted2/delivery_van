import { Redirect } from "expo-router";

// ALLAL Mobile is a truck-driver app only. The default tab route redirects to
// the truck dashboard (the admin/ERP dashboard was removed).
export default function TabsIndex() {
  return <Redirect href="/(tabs)/truck-dashboard" />;
}
