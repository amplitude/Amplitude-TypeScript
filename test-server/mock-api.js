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
 * Build the CDN URL for the source map based on the parsed URL info
 * Example: analytics-browser-2.33.5-min.js.gz → https://cdn.amplitude.com/libs/analytics-browser-2.33.5-min.js.map
 */
function getSourceMapCdnUrl(parsedUrl) {
  const { packageName, version, suffix } = parsedUrl;
  
  // Supported packages
  const supportedPatterns = ['analytics-browser'];
  const supportedSuffixes = ['min', 'gtm-min'];
  
  if (!supportedPatterns.includes(packageName) || !supportedSuffixes.includes(suffix)) {
    return null;
  }
  
  // Build the source map URL: {package}-{version}-{suffix}.js.map
  return `https://cdn.amplitude.com/libs/${packageName}-${version}-${suffix}.js.map`;
}

/**
 * Fetch source map from CDN
 */
async function fetchSourceMapFromCdn(sourceMapUrl) {
  const response = await fetch(sourceMapUrl);
  
  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
      throw new Error(`Source map not found at CDN. The source map for this version may not have been uploaded yet. URL: ${sourceMapUrl}`);
    }
    throw new Error(`Failed to fetch source map: ${response.status} ${response.statusText}`);
  }
  
  const text = await response.text();
  return JSON.parse(text);
}

/**
 * Convert a raw JS source path to a clean relative path
 * Example: ../../../analytics-core/lib/esm/diagnostics/diagnostics-client.js
 *       -> packages/analytics-core/lib/esm/diagnostics/diagnostics-client.js
 */
function cleanJsSourcePath(jsSourcePath) {
  // Extract the package path from the source
  const packageMatch = jsSourcePath.match(/(?:\.\.\/)*([a-z-]+\/lib\/(?:esm|cjs)\/.+\.js)$/i);
  
  if (packageMatch) {
    return `packages/${packageMatch[1]}`;
  }
  
  // For node_modules or other external paths
  const nodeModulesMatch = jsSourcePath.match(/node_modules\/(.+)$/);
  if (nodeModulesMatch) {
    return `node_modules/${nodeModulesMatch[1]}`;
  }
  
  return jsSourcePath;
}

/**
 * Convert a JS source path to its TypeScript equivalent
 * Example: ../../../analytics-core/lib/esm/diagnostics/diagnostics-client.js
 *       -> analytics-core/src/diagnostics/diagnostics-client.ts
 * 
 * The source paths in the source map are relative paths that typically look like:
 * - ../../../analytics-core/lib/esm/diagnostics/diagnostics-client.js
 * - ../../../../node_modules/.pnpm/...
 */
function resolveTypeScriptSource(jsSourcePath) {
  // Extract the package path from the source
  // Pattern: ../../../{package}/lib/esm/{rest}.js or similar
  const packageMatch = jsSourcePath.match(/(?:\.\.\/)*([a-z-]+)\/lib\/(?:esm|cjs)\/(.+)\.js$/i);
  
  if (!packageMatch) {
    // Could be a node_modules path or other external source
    return {
      relativePath: null,
      jsRelativePath: cleanJsSourcePath(jsSourcePath),
      exists: false,
      isExternal: true,
      hasIntermediateSourceMap: false,
      intermediateSourceMapPath: null
    };
  }
  
  const packageName = packageMatch[1];
  const filePath = packageMatch[2];
  const tsRelativePath = `${packageName}/src/${filePath}.ts`;
  const jsRelativePath = `${packageName}/lib/esm/${filePath}.js`;
  const absoluteTsPath = path.join(packagesDir, tsRelativePath);
  
  // Check for intermediate source map (JS -> TS)
  // Note: This checks if it exists locally. For CDN, it would need to be uploaded.
  const jsMapPath = path.join(packagesDir, `${jsRelativePath}.map`);
  const intermediateSourceMapExistsLocally = fs.existsSync(jsMapPath);
  const intermediateSourceMapPath = `packages/${jsRelativePath}.map`;
  
  // For now, we don't have intermediate source maps on CDN, so always false
  // TODO: Check if intermediate source map exists on CDN when implemented
  const hasIntermediateSourceMap = false;
  
  // Check if the TS file exists locally
  if (fs.existsSync(absoluteTsPath)) {
    return {
      relativePath: tsRelativePath,
      jsRelativePath: `packages/${jsRelativePath}`,
      absolutePath: absoluteTsPath,
      exists: true,
      isExternal: false,
      hasIntermediateSourceMap,
      intermediateSourceMapPath
    };
  }
  
  // Try .tsx extension for React components
  const tsxRelativePath = `${packageName}/src/${filePath}.tsx`;
  const absoluteTsxPath = path.join(packagesDir, tsxRelativePath);
  if (fs.existsSync(absoluteTsxPath)) {
    return {
      relativePath: tsxRelativePath,
      jsRelativePath: `packages/${jsRelativePath}`,
      absolutePath: absoluteTsxPath,
      exists: true,
      isExternal: false,
      hasIntermediateSourceMap,
      intermediateSourceMapPath
    };
  }
  
  // Return the expected path even if it doesn't exist locally
  return {
    relativePath: tsRelativePath,
    jsRelativePath: `packages/${jsRelativePath}`,
    absolutePath: absoluteTsPath,
    exists: false,
    isExternal: false,
    hasIntermediateSourceMap,
    intermediateSourceMapPath
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

    // Get the source map CDN URL
    const sourceMapUrl = getSourceMapCdnUrl(parsed);
    if (!sourceMapUrl) {
      res.statusCode = 400;
      res.end(JSON.stringify({ 
        success: false, 
        error: `Unsupported package or suffix: ${parsed.packageName}-${parsed.suffix}. Currently supported: analytics-browser-min, analytics-browser-gtm-min` 
      }));
      return;
    }

    let consumer = null;
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

      // Resolve the TypeScript source file
      const tsSource = resolveTypeScriptSource(original.source);
      
      // Build GitHub link using the version from the URL for accurate tag linking
      const githubBaseUrl = `https://github.com/amplitude/Amplitude-TypeScript/blob/@amplitude/analytics-browser@${parsed.version}/packages`;
      
      // GitHub link to TS file (without line number since we don't have accurate TS line from intermediate source map)
      const tsGithubLink = tsSource.relativePath 
        ? `${githubBaseUrl}/${tsSource.relativePath}`
        : null;

      res.end(JSON.stringify({
        success: true,
        compiledJs: {
          source: original.source,
          relativePath: tsSource.jsRelativePath,
          line: original.line,
          column: original.column,
          name: original.name
        },
        typescript: {
          relativePath: tsSource.relativePath ? `packages/${tsSource.relativePath}` : null,
          absolutePath: tsSource.absolutePath,
          exists: tsSource.exists,
          isExternal: tsSource.isExternal,
          hasIntermediateSourceMap: tsSource.hasIntermediateSourceMap,
          intermediateSourceMapPath: tsSource.intermediateSourceMapPath,
          githubLink: tsGithubLink
        },
        minified: {
          url: parsed.originalUrl,
          line: parsed.line,
          column: parsed.column
        },
        sourceMapUrl
      }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ 
        success: false, 
        error: `Error processing source map: ${error.message}`,
        sourceMapUrl 
      }));
    } finally {
      // Clean up the consumer if it was created and has destroy method
      if (consumer && typeof consumer.destroy === 'function') {
        try {
          consumer.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
      }
    }
  });
} 