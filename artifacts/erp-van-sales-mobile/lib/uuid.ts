export function newSyncId(): string {
  const ts = Date.now().toString(36);
  try {
    const bytes = new Uint8Array(12);
    (globalThis.crypto as Crypto).getRandomValues(bytes);
    return ts + "-" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback: combine timestamp (µs), performance counter, and four Math.random() words
    const perf = (typeof performance !== "undefined" ? performance.now() : 0).toString(36).replace(".", "");
    const r = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
    return `${ts}-${perf}-${r()}${r()}${r()}`;
  }
}
