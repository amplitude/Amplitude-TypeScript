/**
 * Minimal host HTTP server for on-device network-tracking harness tests.
 * Serves `/api/status/:code` (same shape as test-server/mock-api.js).
 *
 * Bind 0.0.0.0 so iOS Simulator (localhost) and Android emulator (10.0.2.2) can reach it.
 * Keep MOCK_API_PORT in sync with test/helpers/mock-api.ts.
 */
import http from 'node:http';

export const MOCK_API_PORT = 9876;

/** @type {http.Server | undefined} */
let server;

const statusMessage = (statusCode) => {
  const messages = {
    200: 'OK',
    500: 'Internal Server Error',
  };
  return messages[statusCode] || `Status ${statusCode}`;
};

const requestListener = (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const statusMatch = url.pathname.match(/^\/api\/status\/(\d+)$/);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (!statusMatch) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'not found', path: url.pathname }));
    return;
  }

  const statusCode = Number.parseInt(statusMatch[1], 10);
  const body = {
    status: statusCode,
    message: statusMessage(statusCode),
    method: req.method,
    timestamp: new Date().toISOString(),
    url: req.url,
  };

  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
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

    server = http.createServer(requestListener);
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
