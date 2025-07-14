# @amplitude/segment-session-replay-plugin-react-native

Amplitude Segment Session Replay Plugin for React Native

## Installation

```sh
npm install @amplitude/segment-session-replay-plugin-react-native
```

### Dependencies

This plugin requires the following dependencies to be installed:

```sh
npm install @amplitude/session-replay-react-native @segment/analytics-react-native
```

**Important**: This plugin requires the `@segment/analytics-react-native-plugin-amplitude-session` plugin to extract session IDs from Amplitude integration data. Make sure to add this plugin to your Segment client **before** adding the session replay plugin.

## Usage

### Segment Session Replay Plugin

Add the segment session replay plugin to your Segment Analytics instance to automatically integrate Amplitude Session Replay with your Segment events.

```js
import { createSegmentSessionReplayPlugin } from '@amplitude/segment-session-replay-plugin-react-native';
import { createClient } from '@segment/analytics-react-native';
import { AmplitudeSessionPlugin } from '@segment/analytics-react-native-plugin-amplitude-session';

// Initialize Segment client
const segmentClient = createClient({
  writeKey: 'YOUR_SEGMENT_WRITE_KEY',
});

// Configure session replay plugin
const sessionReplayConfig = {
  apiKey: 'YOUR_AMPLITUDE_API_KEY',
  deviceId: 'YOUR_DEVICE_ID'
};

// Add the Amplitude session plugin first (required for session ID extraction)
await segmentClient.add({ plugin: new AmplitudeSessionPlugin() });

// Add the session replay plugin to Segment
await segmentClient.add(createSegmentSessionReplayPlugin(sessionReplayConfig));
```

### Plugin Configuration

The plugin accepts a `SessionReplayConfig` object

### Automatic Integration

The plugin automatically:

1. **Initializes Session Replay**: Sets up Amplitude Session Replay with your configuration
2. **Syncs Session Data**: Updates session ID and device ID for each Segment event
3. **Enriches Events**: Adds session replay properties to track and screen events
4. **Manages Lifecycle**: Handles start/stop operations for session replay

### Event Processing

The plugin processes the following Segment event types:
- `TrackEvent`: Adds session replay properties to track events
- `ScreenEvent`: Adds session replay properties to screen events

For these events, the plugin:
- Extracts session ID from event properties or Amplitude integration data
- Extracts device ID from event context or anonymous ID
- Adds session replay properties to the event before sending to Segment

