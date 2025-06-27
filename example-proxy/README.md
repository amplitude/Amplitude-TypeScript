# Amplitude Proxy Server

Example Express server acts as a proxy for Amplitude analytics, allowing you to intercept, log, and forward Amplitude tracking requests.

## Features

- ✅ Proxy single Amplitude events
- ✅ Proxy batch Amplitude events  
- ✅ CORS support for browser requests
- ✅ Request logging and debugging
- ✅ Health check endpoint
- ✅ Test page for validation
- ✅ Request monitoring and debugging

## Quick Start

### Option 1: Run from Root Directory

```bash
# From the project root directory
npm run proxy        # Start the proxy server
npm run proxy:dev    # Start with auto-restart (development)
```

### Option 2: Run from Example Directory

```bash
# Navigate to the example-proxy directory
cd example-proxy

# Install dependencies (if not already installed)
npm install

# Start the proxy server
npm start

# Or for development with auto-restart
npm run dev
```

The server will start on `http://localhost:3001` by default.

### 3. Configure Your Amplitude SDK

Update your Amplitude SDK configuration to use the proxy server:

```javascript
// Browser SDK
amplitude.getInstance().init('YOUR_API_KEY', null, {
    serverUrl: 'http://localhost:3001',
    serverZone: 'US'
});

// Node.js SDK
const { Amplitude } = require('@amplitude/analytics-node');
const amplitude = Amplitude.init('YOUR_API_KEY', {
    serverUrl: 'http://localhost:3001'
});
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check endpoint |
| `/2/httpapi` | POST | Proxy for single Amplitude events |
| `/batch` | POST | Proxy for batch Amplitude events |
| `/debug/requests` | GET | View logged requests (last 50) |
| `/debug/requests` | DELETE | Clear request logs |
| `/test` | GET | Test page with Amplitude SDK |

## Usage Examples

### Testing with the Test Page

1. Start the server: `npm run proxy` (from root) or `npm start` (from example-proxy)
2. Visit: `http://localhost:3001/test`
3. Click "Send Test Event" or "Send Batch Events"
4. Check the console for logged requests

### Viewing Request Logs

```bash
# View recent requests
curl http://localhost:3001/debug/requests

# Clear request logs
curl -X DELETE http://localhost:3001/debug/requests
```

### Health Check

```bash
curl http://localhost:3001/health
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |

## Development

For development with auto-restart:

```bash
# From root directory
npm run proxy:dev

# Or from example-proxy directory
cd example-proxy
npm run dev
```

## Integration with Amplitude SDKs

### Browser SDK

```html
<script src="https://cdn.amplitude.com/libs/amplitude-8.21.0-min.gz.js"></script>
<script>
    amplitude.getInstance().init('YOUR_API_KEY', null, {
        serverUrl: 'http://localhost:3001',
        serverZone: 'US'
    });
    
    // Send events
    amplitude.getInstance().logEvent('Button Clicked', {
        button_name: 'test_button'
    });
</script>
```

### Node.js SDK

```javascript
const { Amplitude } = require('@amplitude/analytics-node');

const amplitude = Amplitude.init('YOUR_API_KEY', {
    serverUrl: 'http://localhost:3001'
});

amplitude.track('User Action', {
    action_type: 'login',
    user_id: '12345'
});
```

## Monitoring and Debugging

The proxy server provides several ways to monitor and debug requests:

1. **Console Logging**: All requests are logged to the console with emojis for easy identification
2. **Request Log**: In-memory storage of recent requests accessible via `/debug/requests`
3. **Morgan Logging**: HTTP request logging middleware
4. **Error Handling**: Detailed error responses with original Amplitude error details

## Security Considerations

⚠️ **Important**: This proxy server is intended for development and testing purposes. For production use:

- Add authentication/authorization
- Implement rate limiting
- Use HTTPS
- Add request validation
- Consider using a proper logging solution instead of in-memory storage
- Add environment-specific configurations

## Troubleshooting

### Common Issues

1. **CORS Errors**: The server includes CORS middleware, but ensure your client is making requests to the correct URL
2. **Port Already in Use**: Change the PORT environment variable or kill the process using the port
3. **Amplitude API Errors**: Check your API key and ensure the request format matches Amplitude's API specification

### Debug Mode

Enable more verbose logging by setting the NODE_ENV environment variable:

```bash
NODE_ENV=development npm run proxy
```

## Project Structure

```
example-proxy/
├── amplitude-proxy-server.js  # Main server file
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## License

MIT License - see the main project license for details. 
