import * as amplitude from '@amplitude/analytics-browser';

// Function to log events to the event log
function logEventToEventLog(eventType, eventProperties = {}) {
    const eventLog = document.getElementById('event-log');
    if (!eventLog) return;

    // Remove the placeholder text if it exists
    const placeholder = eventLog.querySelector('div[style*="color: #666"]');
    if (placeholder) {
        eventLog.removeChild(placeholder);
    }

    const eventDiv = document.createElement('div');
    eventDiv.className = 'event-item';
    
    // Format the event properties
    const propertiesText = Object.entries(eventProperties)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(', ');

    eventDiv.textContent = `${eventType}${propertiesText ? ` - ${propertiesText}` : ''}`;
    eventLog.appendChild(eventDiv);
    eventLog.scrollTop = eventLog.scrollHeight;
}

export function setupEventListeners() {
    // Form input tracking
    document.getElementById('text-input')?.addEventListener('input', (e) => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('form_input', { 
            field: 'text-input', 
            value: e.target.value,
            properties
        });
        logEventToEventLog('form_input', { field: 'text-input', value: e.target.value });
    });

    document.getElementById('email-input')?.addEventListener('input', (e) => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('form_input', { 
            field: 'email-input', 
            value: e.target.value,
            ...properties,
        });
        logEventToEventLog('form_input', { field: 'email-input', value: e.target.value });
    });

    document.getElementById('select-input')?.addEventListener('change', (e) => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('form_input', { 
            field: 'select-input', 
            value: e.target.value,
            ...properties,
        });
        logEventToEventLog('form_input', { field: 'select-input', value: e.target.value });
    });

    document.getElementById('textarea-input')?.addEventListener('input', (e) => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('form_input', { 
            field: 'textarea-input', 
            value: e.target.value,
            ...properties,
        });
        logEventToEventLog('form_input', { field: 'textarea-input', value: e.target.value });
    });

    // Form submission tracking
    document.getElementById('test-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('form_submitted', {
            ...properties,
        });
        logEventToEventLog('form_submitted');
    });

    // Page view tracking
    document.getElementById('track-page-view')?.addEventListener('click', () => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('page_view', {
            ...properties,
        });
        logEventToEventLog('page_view');
    });

    // Custom event tracking
    document.getElementById('track-custom-event')?.addEventListener('click', () => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('custom_event', {
            ...properties
        });
        logEventToEventLog('custom_event');
    });

    // Purchase event tracking
    document.getElementById('track-purchase')?.addEventListener('click', () => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('purchase', {
            ...properties
        });
        logEventToEventLog('purchase');
    });

    // Signup event tracking
    document.getElementById('track-signup')?.addEventListener('click', () => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('signup', {
            ...properties
        });
        logEventToEventLog('signup');
    });

    // Login event tracking
    document.getElementById('track-login')?.addEventListener('click', () => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        amplitude.track('login', {
            ...properties
        });
        logEventToEventLog('login');
    });

    // Form clear button
    document.getElementById('clear-form')?.addEventListener('click', () => {
        const form = document.getElementById('test-form');
        if (form) {
            form.reset();
            const sessionReplay = window.sessionReplaySDK;
            const properties = sessionReplay.getSessionReplayProperties();
            amplitude.track('form_cleared', {
                ...properties
            });
            logEventToEventLog('form_cleared');
        }
    });

    // Get current properties button
    document.getElementById('get-current-properties')?.addEventListener('click', () => {
        const sessionReplay = window.sessionReplaySDK;
        const properties = sessionReplay.getSessionReplayProperties();
        const propertiesDisplay = document.getElementById('properties-display');

        if (propertiesDisplay) {
            const formattedProperties = Object.entries(properties)
                .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                .join('\n');
            propertiesDisplay.textContent = formattedProperties;
        }
    });
} 