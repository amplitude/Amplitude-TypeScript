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