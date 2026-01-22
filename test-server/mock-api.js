import fs from 'fs';
import path from 'path';
import { SourceMapConsumer } from 'source-map';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packagesDir = path.resolve(__dirname, '..', 'packages');

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
 * Parse a CDN URL to extract package name and file suffix
 * Example: https://cdn.amplitude.com/libs/analytics-browser-2.33.5-min.js.gz:1:54975
 * Returns: { packageName: 'analytics-browser', suffix: 'min', line: 1, column: 54975 }
 */
function parseCdnUrl(stacktraceLine) {
  // Pattern: https://cdn.amplitude.com/libs/{name}-{version}-{suffix}.js.gz:{line}:{column}
  // The suffix could be 'min' or 'gtm-min' etc.
  const regex = /https?:\/\/cdn\.amplitude\.com\/libs\/([a-z-]+)-[\d.]+-([a-z-]+)\.js(?:\.gz|\.br)?:(\d+):(\d+)/i;
  const match = stacktraceLine.match(regex);
  
  if (!match) {
    return null;
  }
  
  return {
    packageName: match[1],
    suffix: match[2],
    line: parseInt(match[3], 10),
    column: parseInt(match[4], 10),
    originalUrl: stacktraceLine
  };
}

/**
 * Map CDN URL info to local source map path
 * 
 * Mappings (based on scripts/publish/upload-to-s3.js):
 * - analytics-browser-{ver}-min.js.gz → packages/analytics-browser/lib/scripts/amplitude-min.js.map
 * - analytics-browser-gtm-{ver}-min.js.gz → packages/analytics-browser/lib/scripts/amplitude-gtm-min.js.map
 */
function getSourceMapPath(parsedUrl) {
  const { packageName, suffix } = parsedUrl;
  
  // Handle analytics-browser package
  if (packageName === 'analytics-browser') {
    if (suffix === 'min') {
      return path.join(packagesDir, 'analytics-browser', 'lib', 'scripts', 'amplitude-min.js.map');
    }
    if (suffix === 'gtm-min') {
      return path.join(packagesDir, 'analytics-browser', 'lib', 'scripts', 'amplitude-gtm-min.js.map');
    }
  }
  
  // Handle analytics-browser-gtm (from gtm-snippet package) - Milestone 2
  // analytics-browser-gtm-wrapper-{ver}.min.js.br → packages/gtm-snippet/lib/scripts/analytics-browser-gtm-wrapper.min.js.map
  
  return null;
}

/**
 * Convert a JS source path to its TypeScript equivalent and resolve the absolute path
 * Example: ../../../analytics-core/lib/esm/diagnostics/diagnostics-client.js
 *       -> packages/analytics-core/src/diagnostics/diagnostics-client.ts
 */
function resolveTypeScriptSource(jsSourcePath, sourceMapPath) {
  // The source path is relative to the source map file location
  const sourceMapDir = path.dirname(sourceMapPath);
  const absoluteJsPath = path.resolve(sourceMapDir, jsSourcePath);
  
  // Convert lib/esm/ or lib/cjs/ to src/ and .js to .ts
  let tsPath = absoluteJsPath
    .replace(/\/lib\/esm\//, '/src/')
    .replace(/\/lib\/cjs\//, '/src/')
    .replace(/\.js$/, '.ts');
  
  // Check if the TS file exists
  if (fs.existsSync(tsPath)) {
    return {
      absolutePath: tsPath,
      relativePath: path.relative(packagesDir, tsPath),
      exists: true
    };
  }
  
  // Try .tsx extension for React components
  const tsxPath = tsPath.replace(/\.ts$/, '.tsx');
  if (fs.existsSync(tsxPath)) {
    return {
      absolutePath: tsxPath,
      relativePath: path.relative(packagesDir, tsxPath),
      exists: true
    };
  }
  
  // Return the expected path even if it doesn't exist
  return {
    absolutePath: tsPath,
    relativePath: path.relative(packagesDir, tsPath),
    exists: false
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

    // Get the source map path
    const sourceMapPath = getSourceMapPath(parsed);
    if (!sourceMapPath) {
      res.statusCode = 400;
      res.end(JSON.stringify({ 
        success: false, 
        error: `Unsupported package or suffix: ${parsed.packageName}-${parsed.suffix}. Currently supported: analytics-browser-min, analytics-browser-gtm-min` 
      }));
      return;
    }

    // Check if source map exists
    if (!fs.existsSync(sourceMapPath)) {
      res.statusCode = 404;
      res.end(JSON.stringify({ 
        success: false, 
        error: `Source map not found at ${sourceMapPath}. Have you run 'pnpm build'?`,
        sourceMapPath 
      }));
      return;
    }

    try {
      // Read and parse source map
      const rawSourceMap = fs.readFileSync(sourceMapPath, 'utf-8');
      const consumer = await new SourceMapConsumer(JSON.parse(rawSourceMap));

      // Look up the original position
      const original = consumer.originalPositionFor({
        line: parsed.line,
        column: parsed.column
      });

      consumer.destroy();

      if (!original.source) {
        res.end(JSON.stringify({
          success: false,
          error: 'Could not find original position for the given line and column',
          minified: {
            url: parsed.originalUrl,
            line: parsed.line,
            column: parsed.column
          },
          sourceMapPath
        }));
        return;
      }

      // Resolve the TypeScript source file
      const tsSource = resolveTypeScriptSource(original.source, sourceMapPath);
      
      // Build GitHub link
      const githubBaseUrl = 'https://github.com/amplitude/Amplitude-TypeScript/blob/main/packages';
      const githubLink = tsSource.relativePath 
        ? `${githubBaseUrl}/${tsSource.relativePath}#L${original.line}`
        : null;

      res.end(JSON.stringify({
        success: true,
        original: {
          source: original.source,
          line: original.line,
          column: original.column,
          name: original.name
        },
        typescript: {
          relativePath: tsSource.relativePath,
          absolutePath: tsSource.absolutePath,
          exists: tsSource.exists,
          githubLink
        },
        minified: {
          url: parsed.originalUrl,
          line: parsed.line,
          column: parsed.column
        },
        sourceMapPath
      }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ 
        success: false, 
        error: `Error processing source map: ${error.message}`,
        sourceMapPath 
      }));
    }
  });
} 