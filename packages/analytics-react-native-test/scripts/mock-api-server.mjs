/**
 * Minimal host HTTP server for on-device harness tests.
 *
 * Routes:
 *   /api/status/:code       — same shape as test-server/mock-api.js (network tracking)
 *   /diagnostics/capture    — stands in for the Amplitude diagnostics service; records POSTs
 *   /diagnostics/requests   — GET recorded diagnostics POSTs, DELETE to clear
 *
 * Bind 0.0.0.0 so iOS Simulator (localhost) and Android emulator (10.0.2.2) can reach it.
 * Keep MOCK_API_PORT in sync with test/helpers/mock-api.ts.
 */
import http from 'node:http';

export const MOCK_API_PORT = 9876;

/** @type {http.Server | undefined} */
let server;

/** @type {Array<{ headers: Record<string, string | string[] | undefined>, body: string }>} */
let diagnosticsRequests = [];

const statusMessage = (statusCode) => {
  const messages = {
    200: 'OK',
    500: 'Internal Server Error',
  };
  return messages[statusCode] || `Status ${statusCode}`;
};

const sendJson = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const requestListener = async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-ApiKey');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (url.pathname === '/diagnostics/capture') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method not allowed', method: req.method });
      return;
    }
    diagnosticsRequests.push({ headers: req.headers, body: await readBody(req) });
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === '/diagnostics/requests') {
    if (req.method === 'DELETE') {
      diagnosticsRequests = [];
      sendJson(res, 200, { requests: [] });
      return;
    }
    sendJson(res, 200, { requests: diagnosticsRequests });
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/status\/(\d+)$/);
  if (!statusMatch) {
    sendJson(res, 404, { error: 'not found', path: url.pathname });
    return;
  }

  const statusCode = Number.parseInt(statusMatch[1], 10);
  sendJson(res, statusCode, {
    status: statusCode,
    message: statusMessage(statusCode),
    method: req.method,
    timestamp: new Date().toISOString(),
    url: req.url,
  });
};

/**
 * @param {{ logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void } }} [options]
 */
export const startMockApiServer = (options = {}) =>
  new Promise((resolve, reject) => {
    if (server?.listening) {
      options.logger?.info?.(`Mock API already listening on :${MOCK_API_PORT}`);
      resolve(server);
      return;
    }

    diagnosticsRequests = [];
    server = http.createServer((req, res) => {
      void requestListener(req, res);
    });
    server.once('error', reject);
    server.listen(MOCK_API_PORT, '0.0.0.0', () => {
      options.logger?.info?.(`Mock API listening on http://0.0.0.0:${MOCK_API_PORT}`);
      resolve(server);
    });
  });

/**
 * @param {{ logger?: { info?: (...args: unknown[]) => void } }} [options]
 */
export const stopMockApiServer = (options = {}) =>
  new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    const current = server;
    server = undefined;
    current.close(() => {
      options.logger?.info?.('Mock API stopped');
      resolve();
    });
  });
