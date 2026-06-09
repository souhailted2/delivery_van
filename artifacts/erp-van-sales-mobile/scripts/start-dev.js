#!/usr/bin/env node
/**
 * Dev wrapper: opens a stub HTTP server on PORT immediately so Replit's
 * port monitor is satisfied, then hands off to `expo start` on the same port.
 * Strategy: stub binds → Replit detects → stub closes → expo starts on same port.
 */
const http = require('http');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '20035', 10);
const REPLIT_EXPO_DEV_DOMAIN = process.env.REPLIT_EXPO_DEV_DOMAIN || '';
const EXPO_PACKAGER_PROXY_URL = process.env.EXPO_PACKAGER_PROXY_URL || '';
const EXPO_PUBLIC_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN || '';
const EXPO_PUBLIC_REPL_ID = process.env.EXPO_PUBLIC_REPL_ID || '';
const REACT_NATIVE_PACKAGER_HOSTNAME = process.env.REACT_NATIVE_PACKAGER_HOSTNAME || '';

// Step 1: Immediately open PORT with a stub that returns 200
const stub = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('starting...\n');
});

stub.listen(PORT, '0.0.0.0', () => {
  console.log(`[start-dev] Stub server open on port ${PORT}`);

  // Step 2: After a short delay (giving Replit time to detect), hand off to Expo
  setTimeout(() => {
    stub.close(() => {
      console.log(`[start-dev] Stub closed, starting Expo on port ${PORT}`);
      launchExpo();
    });
    // Force-destroy any keep-alive connections so close() resolves quickly
    stub.closeAllConnections?.();
  }, 5000);
});

stub.on('error', (err) => {
  console.error(`[start-dev] Stub error: ${err.message}`);
  launchExpo();
});

function launchExpo() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    REPLIT_EXPO_DEV_DOMAIN,
    EXPO_PACKAGER_PROXY_URL,
    EXPO_PUBLIC_DOMAIN,
    EXPO_PUBLIC_REPL_ID,
    REACT_NATIVE_PACKAGER_HOSTNAME,
  };

  const expo = spawn(
    'pnpm',
    ['exec', 'expo', 'start', '--localhost', '--port', String(PORT)],
    { stdio: 'inherit', env }
  );

  expo.on('exit', (code) => process.exit(code ?? 0));
}
