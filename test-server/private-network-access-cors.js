/**
 * Chrome Local Network Access / Private Network Access: a public page (e.g.
 * https://amplitude.com) may not load a script from a host that resolves to
 * loopback unless the dev server answers the preflight with
 * Access-Control-Allow-Private-Network: true (and normal CORS origin rules).
 *
 * Mount with `configurePrivateNetworkAccessCorsMiddleware(server.middlewares)`
 * as the first Connect middleware on the Vite dev/preview server.
 */
export function configurePrivateNetworkAccessCorsMiddleware(middlewares) {
  middlewares.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      const acrm = req.headers['access-control-request-method'];
      if (acrm) {
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET,HEAD,OPTIONS,PUT,POST,PATCH,DELETE',
        );
      }
      const acrh = req.headers['access-control-request-headers'];
      if (acrh) {
        res.setHeader('Access-Control-Allow-Headers', acrh);
      }
      // Use 200 (not 204): this middleware runs before mock-api; OPTIONS to
      // /api/status/* must match the status mock and network-capture e2e tests.
      res.statusCode = 200;
      res.end();
      return;
    }
    next();
  });
}
