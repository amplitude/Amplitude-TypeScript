import { SourceMapConsumer } from 'source-map';
import https from 'https';

// Mock API endpoints for Vite dev server
export function createMockApi() {
  return {
    name: 'mock-api',
    configureServer(server) {
      configureMockApiMiddleware(server.middlewares);
      configureUnminifyMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      configureMockApiMiddleware(server.middlewares);
      configureUnminifyMiddleware(server.middlewares);
    }
  };
}

// Function to configure mock API middleware that can be used by both dev and preview servers
export function configureMockApiMiddleware(middlewares) {
  // Status code endpoint - responds with the status code specified in the URL
  middlewares.use((req, res, next) => {
    const statusMatch = req.url.match(/^\/api\/status\/(\d+)/);
    
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1]);
      
      // Parse sleep parameter from query string
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sleepMs = parseInt(url.searchParams.get('sleep')) || 0;
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Authorization', 'SECRET TOKEN, THIS SHOULD NEVER BE CAPTURED BY AMPLITUDE');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
      }

      // Create response based on status code
      const response = {
        status: statusCode,
        message: getStatusMessage(statusCode),
        method: req.method,
        timestamp: new Date().toISOString(),
        url: req.url,
        sleep: sleepMs
      };

      // If sleep parameter is provided, delay the response
      if (sleepMs > 0) {
        setTimeout(() => {
          res.statusCode = statusCode;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(response));
        }, sleepMs);
      } else {
        // Set the status code from the URL
        res.statusCode = statusCode;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(response));
      }
      
      return;
    }
    
    next();
  });

  // Simple test endpoint
  middlewares.use('/api/test', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'GET') {
      res.end(JSON.stringify({ 
        message: 'Hello from mock API!',
        method: 'GET',
        timestamp: new Date().toISOString()
      }));
    } else if (req.method === 'POST') {
      res.end(JSON.stringify({ 
        message: 'Data received!',
        method: 'POST',
        timestamp: new Date().toISOString()
      }));
    }
  });

  // CORS error endpoint - only allows CORS from non-localhost domains
  middlewares.use('/api/cors-error', (req, res) => {
    const origin = req.headers.origin;
    
    // Set CORS headers only for non-localhost origins
    if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        res.statusCode = 200;
        res.end();
      } else {
        res.statusCode = 403; // Forbidden for localhost
        res.end();
      }
      return;
    }
    
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method === 'GET') {
      res.end(JSON.stringify({ 
        message: 'This endpoint only allows CORS from non-localhost domains',
        method: 'GET',
        timestamp: new Date().toISOString(),
        note: 'This should cause a CORS error when accessed from localhost',
        origin: origin || 'No origin header'
      }));
    } else if (req.method === 'POST') {
      res.end(JSON.stringify({ 
        message: 'This endpoint only allows CORS from non-localhost domains',
        method: 'POST',
        timestamp: new Date().toISOString(),
        note: 'This should cause a CORS error when accessed from localhost',
        origin: origin || 'No origin header'
      }));
    }
  });
}

// Helper function to get status message
function getStatusMessage(statusCode) {
  const messages = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    409: 'Conflict',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  return messages[statusCode] || `Status ${statusCode}`;
}

/**
 * Parse a CDN URL to extract package name, version, and file suffix
 * Example: https://cdn.amplitude.com/libs/analytics-browser-2.33.5-min.js.gz:1:54975
 * Returns: { packageName: 'analytics-browser', version: '2.33.5', suffix: 'min', line: 1, column: 54975 }
 */
function parseCdnUrl(stacktraceLine) {
  // Pattern: https://cdn.amplitude.com/libs/{name}-{version}-{suffix}.js.gz:{line}:{column}
  // The suffix could be 'min' or 'gtm-min' etc.
  const regex = /https?:\/\/cdn\.amplitude\.com\/libs\/([a-z-]+)-([\d.]+)-([a-z-]+)\.js(?:\.gz|\.br)?:(\d+):(\d+)/i;
  const match = stacktraceLine.match(regex);
  
  if (!match) {
    return null;
  }
  
  return {
    packageName: match[1],
    version: match[2],
    suffix: match[3],
    line: parseInt(match[4], 10),
    column: parseInt(match[5], 10),
    originalUrl: stacktraceLine
  };
}

/**
 * Build CDN URL for the source map based on parsed URL info
 * Example: analytics-browser-2.33.5-min.js.gz → https://cdn.amplitude.com/libs/analytics-browser-2.33.5-min.js.map
 */
function getSourceMapCdnUrl(parsedUrl) {
  const { packageName, version, suffix } = parsedUrl;
  return `https://cdn.amplitude.com/libs/${packageName}-${version}-${suffix}.js.map`;
}

/**
 * Fetch source map from CDN using Node.js https module
 */
function fetchSourceMapFromCdn(sourceMapUrl) {
  return new Promise((resolve, reject) => {
    https.get(sourceMapUrl, (res) => {
      const { statusCode } = res;
      
      if (statusCode === 404 || statusCode === 403) {
        res.resume(); // Consume response to free up memory
        const error = new Error('SOURCE_MAP_NOT_FOUND');
        error.status = statusCode;
        error.sourceMapUrl = sourceMapUrl;
        reject(error);
        return;
      }
      
      if (statusCode !== 200) {
        res.resume();
        reject(new Error(`Failed to fetch source map: ${statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse source map JSON: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Network error fetching source map: ${err.message}`));
    });
  });
}

/**
 * Clean up source path from flattened source map
 * The flattened source map paths are relative to packages/{package}/lib/scripts/
 * Example: ../../../analytics-core/src/diagnostics/diagnostics-client.ts
 *       -> packages/analytics-core/src/diagnostics/diagnostics-client.ts
 * Example: ../../../src/index.ts (same package)
 *       -> packages/analytics-browser/src/index.ts
 */
function resolveSourcePath(sourcePath, parsedUrl) {
  // Handle node_modules paths - these are external dependencies
  if (sourcePath.includes('node_modules')) {
    return {
      relativePath: sourcePath,
      isExternal: true,
      isTypeScript: false
    };
  }

  // Clean up the relative path
  // Paths like ../../../analytics-core/src/... need to be converted to packages/analytics-core/src/...
  // Paths like ../../../src/... refer to the same package (e.g., analytics-browser)
  let cleanPath = sourcePath;
  
  // Remove leading ../ segments and extract the package-relative path
  const pathParts = sourcePath.split('/');
  let i = 0;
  while (i < pathParts.length && pathParts[i] === '..') {
    i++;
  }
  
  const remainingPath = pathParts.slice(i).join('/');
  
  // Check if this is a path within a specific package (e.g., analytics-core/src/...)
  // or within the current package (e.g., src/...)
  if (remainingPath.startsWith('src/')) {
    // This is a path within the current package (e.g., analytics-browser)
    cleanPath = `packages/${parsedUrl.packageName}/${remainingPath}`;
  } else {
    // This is a path to another package (e.g., analytics-core/src/...)
    cleanPath = `packages/${remainingPath}`;
  }

  const isTypeScript = cleanPath.endsWith('.ts') || cleanPath.endsWith('.tsx');

  return {
    relativePath: cleanPath,
    isExternal: false,
    isTypeScript
  };
}

/**
 * Configure the unminify API middleware
 */
export function configureUnminifyMiddleware(middlewares) {
  middlewares.use('/api/unminify', async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ success: false, error: 'Method not allowed. Use POST.' }));
      return;
    }

    // Read request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let requestData;
    try {
      requestData = JSON.parse(body);
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, error: 'Invalid JSON body' }));
      return;
    }

    const { stacktraceLine } = requestData;
    if (!stacktraceLine) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, error: 'Missing stacktraceLine in request body' }));
      return;
    }

    // Parse the CDN URL
    const parsed = parseCdnUrl(stacktraceLine);
    if (!parsed) {
      res.statusCode = 400;
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Could not parse stack trace line. Expected format: https://cdn.amplitude.com/libs/{package}-{version}-{suffix}.js.gz:{line}:{column}' 
      }));
      return;
    }

    // Build the source map CDN URL
    const sourceMapUrl = getSourceMapCdnUrl(parsed);

    let consumer;
    try {
      // Fetch source map from CDN
      const rawSourceMap = await fetchSourceMapFromCdn(sourceMapUrl);
      consumer = await new SourceMapConsumer(rawSourceMap);

      // Look up the original position
      const original = consumer.originalPositionFor({
        line: parsed.line,
        column: parsed.column
      });

      if (!original.source) {
        res.end(JSON.stringify({
          success: false,
          error: 'Could not find original position for the given line and column',
          minified: {
            url: parsed.originalUrl,
            line: parsed.line,
            column: parsed.column
          },
          sourceMapUrl
        }));
        return;
      }

      // Resolve the source path (now directly from flattened source map)
      const sourceInfo = resolveSourcePath(original.source, parsed);
      
      // Build GitHub link using the version tag from the CDN URL
      // The tag is always @amplitude/{cdnPackageName}@{version} (e.g., @amplitude/analytics-browser@2.33.5)
      let githubLink = null;
      if (sourceInfo.relativePath && !sourceInfo.isExternal) {
        const tag = `@amplitude/${parsed.packageName}@${parsed.version}`;
        githubLink = `https://github.com/amplitude/Amplitude-TypeScript/blob/${encodeURIComponent(tag)}/${sourceInfo.relativePath}#L${original.line}`;
      }

      res.end(JSON.stringify({
        success: true,
        original: {
          source: original.source,
          line: original.line,
          column: original.column,
          name: original.name
        },
        typescript: {
          relativePath: sourceInfo.relativePath,
          isExternal: sourceInfo.isExternal,
          isTypeScript: sourceInfo.isTypeScript,
          githubLink
        },
        minified: {
          url: parsed.originalUrl,
          line: parsed.line,
          column: parsed.column
        },
        sourceMapUrl
      }));
    } catch (error) {
      if (error.message === 'SOURCE_MAP_NOT_FOUND') {
        res.statusCode = 404;
        res.end(JSON.stringify({ 
          success: false, 
          error: 'Source map not found on CDN',
          sourceMapNotFound: true,
          sourceMapUrl,
          instructions: {
            summary: `The source map for version ${parsed.version} has not been uploaded to CDN yet.`,
            steps: [
              `1. Build the package: cd packages/${parsed.packageName} && pnpm build`,
              `2. Find the source map: packages/${parsed.packageName}/lib/scripts/amplitude-${parsed.suffix}.js.map`,
              `3. Upload to S3/CDN with the name: ${parsed.packageName}-${parsed.version}-${parsed.suffix}.js.map`
            ]
          }
        }));
      } else {
        res.statusCode = 500;
        res.end(JSON.stringify({ 
          success: false, 
          error: `Error processing source map: ${error.message}`,
          sourceMapUrl 
        }));
      }
    } finally {
      if (consumer && typeof consumer.destroy === 'function') {
        consumer.destroy();
      }
    }
  });
} 