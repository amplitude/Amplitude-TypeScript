import * as sessionReplay from '@amplitude/session-replay-browser';
import * as amplitude from '@amplitude/analytics-browser';
import { 
    StatusType, 
    updateSessionReplayStatus, 
    updateAnalyticsStatus, 
} from './status-updater.js';
import { setupEventListeners } from './event-listeners.js';

// Configuration
const apiKey = import.meta.env.VITE_SESSION_REPLAY_API_KEY;
const userId = import.meta.env.VITE_SESSION_REPLAY_USER_ID;
const deviceId = 'session-replay-test-' + Date.now();
const sessionId = Date.now();

// Make SDKs available globally for tests
window.sessionReplaySDK = sessionReplay;
window.amplitudeSDK = amplitude;

// Initialize SDKs
async function initializeSDKs() {
    
    // Initialize Analytics SDK
    updateAnalyticsStatus(StatusType.PENDING);
    try {
        await amplitude.init(apiKey, {
            deviceId,
            sessionId,
            fetchRemoteConfig: false,
            serverUrl: 'https://api.stag2.amplitude.com/2/httpapi',
            userId,
        }).promise;
        updateAnalyticsStatus(StatusType.COMPLETE);

        // Setup event listeners after SDK initialization
        setupEventListeners();

    } catch (error) {
        console.error('Analytics SDK initialization error:', error);
        updateAnalyticsStatus(StatusType.ERROR);
        throw error; // Re-throw to prevent integration test
    }

    // Initialize Session Replay SDK
    updateSessionReplayStatus(StatusType.PENDING);
    try {
        await sessionReplay.init(apiKey, {
            deviceId,
            sessionId,
            serverUrl: 'https://api.stag2.amplitude.com/2/httpapi',
            configServerUrl: 'https://sr-client-cfg.stag2.amplitude.com/config',
            trackServerUrl: 'https://api-sr.stag2.amplitude.com/sessions/v2/track',
            sampleRate: 1,
        }).promise;
        updateSessionReplayStatus(StatusType.COMPLETE);
    } catch (error) {
        console.error('Session Replay SDK initialization error:', error);
        updateSessionReplayStatus(StatusType.ERROR);
        throw error; // Re-throw to prevent Analytics SDK initialization
    }
}

// Save the original fetch
const originalFetch = window.fetch;

// Replace fetch with a wrapper
window.fetch = async (...args) => {
  const [url] = args;
  try {
    const response = await originalFetch(...args);

    // Log response status for configServerUrl
    if (url.includes('https://api.stag2.amplitude.com/2/httpapi') && !response.ok) {
        updateAnalyticsStatus(StatusType.ERROR_DETECTED);
        console.error("Amplitude Error:", responseBody.message);      
    }
    if ((url.includes('https://sr-client-cfg.stag2.amplitude.com/config') || url.includes('https://api-sr.stag2.amplitude.com/sessions/v2/track')) && !response.ok) {
        updateSessionReplayStatus(StatusType.ERROR_DETECTED);
        console.error("Amplitude Error:", responseBody.message);      
    }
    return response;
  } catch (err) {
    updateAnalyticsStatus(StatusType.ERROR_DETECTED);
    updateSessionReplayStatus(StatusType.ERROR_DETECTED);
    console.error('Unknown error', err);
    throw err;
  }
};

// Start initialization
initializeSDKs(); 