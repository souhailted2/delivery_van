export function newSyncId(): string {
  const ts = Date.now().toString(36);
  try {
    const bytes = new Uint8Array(12);
    (globalThis.crypto as Crypto).getRandomValues(bytes);
    return ts + "-" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return ts + "-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}
