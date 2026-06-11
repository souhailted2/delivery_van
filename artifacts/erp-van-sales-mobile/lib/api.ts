import * as SecureStore from "expo-secure-store";

export const API_URL =
  process.env["EXPO_PUBLIC_API_URL"] ?? "https://deleveri.alllal.com";

const SESSION_KEY = "erp_session_sid";
const SERVER_URL_KEY = "erp_server_url";
const TRUCK_CREDENTIALS_KEY = "erp_truck_credentials";

export async function getSessionSid(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function saveSession(setCookieHeader: string | null): Promise<void> {
  if (!setCookieHeader) return;
  const match = setCookieHeader.match(/connect\.sid=([^;]+)/);
  if (match?.[1]) {
    await SecureStore.setItemAsync(SESSION_KEY, match[1]);
  }
}

export async function saveSessionSid(sid: string): Promise<void> {
  const clean = sid.startsWith("s%3A") || sid.startsWith("s:")
    ? sid
    : `s%3A${sid}`;
  await SecureStore.setItemAsync(SESSION_KEY, clean);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function saveTruckCredentials(truckName: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(TRUCK_CREDENTIALS_KEY, JSON.stringify({ truckName, password }));
}

export async function getTruckCredentials(): Promise<{ truckName: string; password: string } | null> {
  const raw = await SecureStore.getItemAsync(TRUCK_CREDENTIALS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function clearTruckCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(TRUCK_CREDENTIALS_KEY);
}

export async function saveServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(SERVER_URL_KEY, url.replace(/\/$/, ""));
}

export async function getActiveApiUrl(): Promise<string> {
  const stored = await SecureStore.getItemAsync(SERVER_URL_KEY);
  return stored ?? API_URL;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const [sid, baseUrl] = await Promise.all([getSessionSid(), getActiveApiUrl()]);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (sid) headers["Cookie"] = `connect.sid=${sid}`;

  return fetch(`${baseUrl}/api${path}`, { ...options, headers });
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function checkOnline(): Promise<boolean> {
  try {
    const baseUrl = await getActiveApiUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${baseUrl}/api/healthz`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
