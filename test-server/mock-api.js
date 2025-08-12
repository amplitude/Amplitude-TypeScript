// Mock API endpoints for Vite dev server
export function createMockApi() {
  return {
    name: 'mock-api',
    configureServer(server) {
      // Status code endpoint - responds with the status code specified in the URL
      server.middlewares.use((req, res, next) => {
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
      server.middlewares.use('/api/test', (req, res) => {
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
      server.middlewares.use('/api/cors-error', (req, res) => {
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
  };
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