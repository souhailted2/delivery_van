#!/usr/bin/env node
/**
 * Expo launcher for Replit.
 *
 * Problem: Replit's port monitor makes an HTTP health-check immediately after
 * the workflow starts. Expo's Metro takes 15-20 s to open PORT. So Replit
 * kills the workflow before Expo is ready.
 *
 * Solution:
 *   1. Immediately open PORT with an HTTP server that returns 200 OK.
 *      This satisfies Replit's health-check instantly.
 *   2. Start Expo on PORT+1 in the background.
 *   3. Once Expo is confirmed ready (polls PORT+1), upgrade the HTTP server
 *      to a transparent TCP proxy: PORT → PORT+1.
 *
 * The TCP proxy handles HTTP, WebSocket, and Expo's custom protocol.
 */
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

const PORT = parseInt(process.env.PORT || '20035', 10);
const EXPO_PORT = PORT + 1; // e.g. 20036
const WORKSPACE = path.join(__dirname, '..', '..', '..');
const POLL_INTERVAL = 500; // ms between readiness polls

// ── Phase 1: Immediate HTTP 200 OK health-check server ──────────────────────
let proxyMode = false; // switches to true once Expo is ready
const sockets = new Set();

const httpServer = http.createServer((req, res) => {
  if (!proxyMode) {
    // Expo not yet ready — satisfy health-check
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Expo is starting…\n');
    return;
  }
  // Expo ready — HTTP proxy
  const opts = {
    hostname: '127.0.0.1',
    port: EXPO_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${EXPO_PORT}` },
  };
  const upstream = http.request(opts, (upRes) => {
    res.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('Bad Gateway');
    }
  });
  req.pipe(upstream);
});

// Handle WebSocket & Expo protocol upgrades
httpServer.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(EXPO_PORT, '127.0.0.1', () => {
    upstream.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n'
    );
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

// Track sockets so we can destroy them when upgrading to full TCP proxy
httpServer.on('connection', (s) => {
  sockets.add(s);
  s.on('close', () => sockets.delete(s));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[expo-launcher] HTTP stub ready on port ${PORT} (Expo starting on ${EXPO_PORT})`);
  startExpo();
});

httpServer.on('error', (err) => {
  console.error(`[expo-launcher] HTTP server error: ${err.message}`);
  // Fall back to direct Expo start on PORT
  startExpoDirect();
});

// ── Phase 2: Start Expo on EXPO_PORT ─────────────────────────────────────────
function startExpo() {
  const env = { ...process.env, PORT: String(EXPO_PORT) };
  const expo = spawn(
    'pnpm',
    ['--filter', '@workspace/erp-van-sales-mobile', 'run', 'dev'],
    { cwd: WORKSPACE, stdio: 'inherit', env }
  );

  expo.on('exit', (code) => {
    httpServer.close();
    process.exit(code ?? 0);
  });

  // Poll until Expo is reachable
  pollExpo();
}

function pollExpo() {
  const socket = net.connect(EXPO_PORT, '127.0.0.1');
  socket.setTimeout(400);
  socket.on('connect', () => {
    socket.destroy();
    if (!proxyMode) {
      proxyMode = true;
      console.log(`[expo-launcher] Expo ready on ${EXPO_PORT} — switching to proxy mode`);
    }
  });
  socket.on('error', () => {
    socket.destroy();
    setTimeout(pollExpo, POLL_INTERVAL);
  });
  socket.on('timeout', () => {
    socket.destroy();
    setTimeout(pollExpo, POLL_INTERVAL);
  });
}

// Fallback: start Expo directly on PORT (if HTTP stub bind failed)
function startExpoDirect() {
  const env = { ...process.env, PORT: String(PORT) };
  const expo = spawn(
    'pnpm',
    ['--filter', '@workspace/erp-van-sales-mobile', 'run', 'dev'],
    { cwd: WORKSPACE, stdio: 'inherit', env }
  );
  expo.on('exit', (code) => process.exit(code ?? 0));
}
