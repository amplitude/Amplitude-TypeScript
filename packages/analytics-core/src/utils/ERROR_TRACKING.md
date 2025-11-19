# Error Tracking in Amplitude SDK

This document explains how the Amplitude SDK tracks and reports uncaught errors to diagnostics.

## Overview

The SDK automatically captures and reports uncaught errors that originate from Amplitude code, helping us identify issues before they impact customers.

## How It Works

The error tracking system uses three detection methods:

### 1. **Execution Context Tracking** (Primary Method)
When SDK code is executing, we mark the execution context. Any error that occurs during this time is automatically identified as an SDK error.

```typescript
// Errors thrown during this execution are automatically tracked
await amplitude.track('event_name', { property: 'value' });
```

### 2. **Error Marker** (For Intentional Errors)
Errors that are intentionally thrown by the SDK are marked with a unique Symbol.

```typescript
// In SDK code
throw new AmplitudeError('Something went wrong', {
  component: 'BrowserClient',
  method: 'init'
});
```

### 3. **Stack Trace Analysis** (Fallback)
As a fallback, we analyze the stack trace to detect if the error originated from Amplitude SDK files. This works even with minified code.

## For SDK Developers

### Creating Amplitude-Specific Errors

Use `AmplitudeError` for intentional errors:

```typescript
import { AmplitudeError } from '@amplitude/analytics-core';

throw new AmplitudeError('Failed to initialize', {
  reason: 'Invalid API key',
  apiKey: apiKey.substring(0, 8) + '...'
});
```

### Wrapping Functions for Error Tracking

Wrap functions to automatically track their execution:

```typescript
import { wrapWithErrorTracking } from '@amplitude/analytics-core';

class MyPlugin {
  execute(event: Event) {
    return wrapWithErrorTracking(async () => {
      // Your code here
      // Any errors thrown will be tracked
      return processEvent(event);
    }, 'MyPlugin.execute')();
  }
}
```

### Using the Decorator

For class methods, use the `@trackErrors` decorator:

```typescript
import { trackErrors } from '@amplitude/analytics-core';

class MyPlugin {
  @trackErrors('MyPlugin')
  async execute(event: Event) {
    // Any errors thrown here will be tracked
    return processEvent(event);
  }
}
```

### Safe Execution Utilities

For non-critical operations where errors should be caught:

```typescript
import { safeExecute, safeExecuteAsync } from '@amplitude/analytics-core';

// Synchronous
const result = safeExecute(
  () => riskyOperation(),
  'OptionalFeature',
  (error) => console.warn('Optional feature failed:', error)
);

// Asynchronous
const result = await safeExecuteAsync(
  async () => await fetchData(),
  'DataLoader',
  (error) => console.warn('Failed to load data:', error)
);
```

## What Gets Reported

When an uncaught SDK error occurs, the following information is sent to diagnostics:

```typescript
{
  event_name: 'sdk.uncaught_error',
  event_properties: {
    message: 'Error message',
    name: 'Error',
    type: 'TypeError',
    stack: 'Full stack trace...',
    detection_method: 'execution_tracking,marked',
    execution_context: 'AmplitudeBrowser.track',
    error_location: 'https://example.com/app.js',
    error_line: 42,
    error_column: 10
  }
}
```

Additionally, a counter is incremented:
- `sdk.uncaught_errors.total` - Total count of uncaught errors
- `sdk.unhandled_rejections.total` - Total count of unhandled promise rejections

## Privacy & Performance

- **Customer errors are NOT reported** - Only errors from SDK code are captured
- **Stack traces are truncated** - Default max length is 2000 characters
- **Error messages are truncated** - Default max length is 500 characters
- **Sampling respected** - Follows the diagnostics sample rate
- **Minimal overhead** - Only checks errors that actually occur
- **No infinite loops** - Error handler itself is protected against errors

## Configuration

Error tracking is automatically enabled when diagnostics is enabled. You can configure it:

```typescript
import { setupAmplitudeErrorTracking } from '@amplitude/analytics-browser';

const cleanup = setupAmplitudeErrorTracking(diagnosticsClient, {
  enableStackTraceAnalysis: true,  // Enable fallback detection
  captureStackTraces: true,        // Include stack traces in reports
  maxMessageLength: 500,           // Max error message length
  maxStackLength: 2000            // Max stack trace length
});

// Later, cleanup when shutting down
cleanup();
```

## Testing Error Tracking

To test error tracking in your plugin or feature:

```typescript
import { 
  getExecutionTracker, 
  isAmplitudeOriginatedError 
} from '@amplitude/analytics-core';

// Check if execution is being tracked
const tracker = getExecutionTracker();
expect(tracker.isExecuting()).toBe(true);

// Verify error is marked
const error = new Error('Test');
markAsAmplitudeError(error);
expect(isAmplitudeOriginatedError(error)).toBe(true);
```

## Examples

### Example 1: Network Request with Error Tracking

```typescript
import { wrapWithErrorTracking, AmplitudeError } from '@amplitude/analytics-core';

async function sendEvent(event: Event) {
  return wrapWithErrorTracking(async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(event)
    });
    
    if (!response.ok) {
      throw new AmplitudeError('Failed to send event', {
        status: response.status,
        statusText: response.statusText
      });
    }
    
    return response.json();
  }, 'NetworkClient.sendEvent')();
}
```

### Example 2: Plugin with Error Tracking

```typescript
import { Plugin, Event, wrapWithErrorTracking } from '@amplitude/analytics-core';

export class MyPlugin implements Plugin {
  name = 'my-plugin';
  type = 'enrichment' as const;

  async execute(event: Event) {
    return wrapWithErrorTracking(async () => {
      // Add custom properties
      event.event_properties = {
        ...event.event_properties,
        custom_prop: await this.fetchCustomData()
      };
      
      return event;
    }, 'MyPlugin.execute')();
  }
  
  private async fetchCustomData() {
    // If this throws, it will be tracked
    const response = await fetch('/api/custom-data');
    return response.json();
  }
}
```

### Example 3: Wrapping Object Methods

```typescript
import { wrapObjectMethods } from '@amplitude/analytics-core';

class StorageManager {
  save(key: string, value: any) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  
  load(key: string) {
    return JSON.parse(localStorage.getItem(key) || 'null');
  }
}

// Wrap all methods
const storage = wrapObjectMethods(new StorageManager(), 'StorageManager');

// Now all methods are tracked
storage.save('key', { data: 'value' });
```

## Troubleshooting

**Q: Why aren't my errors being reported?**

A: Check that:
1. Diagnostics is enabled (`enableDiagnostics: true`)
2. Sample rate includes your session (`diagnosticsSampleRate > 0`)
3. The error is originating from SDK code (not customer code)
4. Error tracking was initialized (`setupAmplitudeErrorTracking` was called)

**Q: How do I test error tracking locally?**

A:
```typescript
// Set diagnostics sample rate to 100%
amplitude._setDiagnosticsSampleRate(1);

// Initialize
await amplitude.init('api-key');

// Trigger an error in SDK code
// (You may need to inject a throw statement for testing)
```

**Q: Will this capture errors from my application code?**

A: No, only errors that occur during SDK execution or have SDK files in their stack trace are captured. Your application errors remain private.
