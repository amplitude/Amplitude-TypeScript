// Status update types
export const StatusType = {
    PENDING: 'pending',
    COMPLETE: 'complete',
    ERROR: 'error',
    ERROR_DETECTED: 'error_detected'
};

// Status messages
export const StatusMessages = {
    SESSION_REPLAY: {
        PENDING: 'Initializing Session Replay SDK...',
        COMPLETE: 'Session Replay SDK initialized successfully',
        ERROR: 'Session Replay SDK initialization failed',
        ERROR_DETECTED: 'Error Detected while sending payload'
    },
    ANALYTICS: {
        PENDING: 'Initializing Analytics SDK...',
        COMPLETE: 'Analytics SDK initialized successfully',
        ERROR: 'Analytics SDK initialization failed',
        ERROR_DETECTED: 'Error Detected while sending payload',
    },
};

// Helper function to update status
export function updateStatus(elementId, status, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.className = `status ${status}`;
        element.textContent = message;
    }
}

// Status update functions for each component
export function updateSessionReplayStatus(status) {
    updateStatus('session-replay-status', status, StatusMessages.SESSION_REPLAY[status.toUpperCase()]);
}

export function updateAnalyticsStatus(status) {
    updateStatus('analytics-status', status, StatusMessages.ANALYTICS[status.toUpperCase()]);
}