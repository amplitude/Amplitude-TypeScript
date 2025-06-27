const express = require('express');
const cors = require('cors');
const axios = require('axios');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Amplitude API endpoints
const AMPLITUDE_API_BASE = 'https://api2.amplitude.com';
const AMPLITUDE_BATCH_API = 'https://api2.amplitude.com/batch';

// Store for tracking requests (in-memory for demo purposes)
const requestLog = [];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy endpoint for single events
app.post('/2/httpapi', async (req, res) => {
  try {
    console.log('📊 Received Amplitude event:', JSON.stringify(req.body, null, 2));
    
    // Log the request
    requestLog.push({
      timestamp: new Date().toISOString(),
      type: 'single_event',
      data: req.body
    });

    // Forward to Amplitude API
    const response = await axios.post(AMPLITUDE_API_BASE + '/2/httpapi', req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Amplitude-Proxy-Server/1.0'
      }
    });

    console.log('✅ Forwarded to Amplitude successfully');
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('❌ Error forwarding to Amplitude:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to forward to Amplitude',
      details: error.response?.data || error.message
    });
  }
});

// Proxy endpoint for batch events
app.post('/batch', async (req, res) => {
  try {
    console.log('📦 Received Amplitude batch events:', JSON.stringify(req.body, null, 2));
    
    // Log the request
    requestLog.push({
      timestamp: new Date().toISOString(),
      type: 'batch_events',
      data: req.body
    });

    // Forward to Amplitude batch API
    const response = await axios.post(AMPLITUDE_BATCH_API, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Amplitude-Proxy-Server/1.0'
      }
    });

    console.log('✅ Forwarded batch to Amplitude successfully');
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('❌ Error forwarding batch to Amplitude:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to forward batch to Amplitude',
      details: error.response?.data || error.message
    });
  }
});

// Debug endpoint to view logged requests
app.get('/debug/requests', (req, res) => {
  res.json({
    total_requests: requestLog.length,
    requests: requestLog.slice(-50) // Last 50 requests
  });
});

// Clear debug logs
app.delete('/debug/requests', (req, res) => {
  requestLog.length = 0;
  res.json({ message: 'Request log cleared' });
});

// Serve a simple test page
app.get('/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Amplitude Proxy Test</title>
        <script src="https://cdn.amplitude.com/libs/amplitude-8.21.0-min.gz.js"></script>
    </head>
    <body>
        <h1>Amplitude Proxy Test Page</h1>
        <p>This page tests the Amplitude proxy server.</p>
        <button onclick="sendTestEvent()">Send Test Event</button>
        <button onclick="sendBatchEvents()">Send Batch Events</button>
        <div id="status"></div>

        <script>
            // Initialize Amplitude with proxy server
            amplitude.getInstance().init('YOUR_API_KEY', null, {
                serverUrl: 'http://localhost:${PORT}',
                serverZone: 'US'
            });

            function sendTestEvent() {
                amplitude.getInstance().logEvent('Test Event', {
                    source: 'proxy_test',
                    timestamp: Date.now()
                });
                document.getElementById('status').innerHTML = '<p>✅ Test event sent!</p>';
            }

            function sendBatchEvents() {
                // Send multiple events
                for (let i = 0; i < 3; i++) {
                    amplitude.getInstance().logEvent('Batch Test Event', {
                        batch_index: i,
                        source: 'proxy_test',
                        timestamp: Date.now()
                    });
                }
                document.getElementById('status').innerHTML = '<p>✅ Batch events sent!</p>';
            }
        </script>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Amplitude Proxy Server running on http://localhost:${PORT}`);
  console.log(`📊 Single events: http://localhost:${PORT}/2/httpapi`);
  console.log(`📦 Batch events: http://localhost:${PORT}/batch`);
  console.log(`🔍 Debug logs: http://localhost:${PORT}/debug/requests`);
  console.log(`🧪 Test page: http://localhost:${PORT}/test`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});

module.exports = app; 