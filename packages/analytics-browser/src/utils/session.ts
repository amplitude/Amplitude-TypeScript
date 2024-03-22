import { isAttributionTrackingEnabled } from '@amplitude/analytics-client-common';
import { BaseEvent, BrowserConfig, Event, Session as ISession, Storage, UserSession } from '@amplitude/analytics-types';
import { DEFAULT_SESSION_END_EVENT, DEFAULT_SESSION_START_EVENT } from 'src/constants';
import { createTrackEvent } from './utils/event-builder';
import { isNewSession } from '@amplitude/analytics-client-common';

class Session implements ISession {
    config: BrowserConfig;
    storage: Storage<UserSession>;
    constructor(config: BrowserConfig, storage: Storage<UserSession>) {
      this.config = config;
      this.storage = storage;
    }

    startNewSessionIfNeeded(timestamp: number, sessionId: number, event: Event) {
        const currentTime = Date.now();
        const isEventInNewSession = isNewSession(this.config.sessionTimeout, this.config.lastEventTime);
        const shouldFireSessionEvent = 
            event.event_type !== DEFAULT_SESSION_START_EVENT &&
            event.event_type !== DEFAULT_SESSION_END_EVENT &&
            (!event.session_id || event.session_id === this.getSessionId()) &&
            isEventInNewSession

        if (!shouldFireSessionEvent) return false;

        let sessionEvent: BaseEvent[] = [];

        const trackSessionEvent = isAttributionTrackingEnabled(this.config.defaultTracking);
        
        if (trackSessionEvent) {
            /*if (previousSessionId && lastEventTime) {
                this.track(DEFAULT_SESSION_END_EVENT, undefined, {
                  device_id: this.previousSessionDeviceId,
                  event_id: ++lastEventId,
                  session_id: previousSessionId,
                  time: lastEventTime + 1,
                  user_id: this.previousSessionUserId,
                });
              }*/
            const eventOptions = {
                device_id: ''
            }
            const sessionEndEvent = createTrackEvent(DEFAULT_SESSION_END_EVENT, undefined, eventOptions);
            sessionEvent.push(sessionEndEvent);
        }

        this.setSessionid(0);
        
        const eventOptions = {
            device_id: ''
        }
        const sessionStartEvent = createTrackEvent(DEFAULT_SESSION_END_EVENT, undefined, eventOptions);
        sessionEvent.push(sessionStartEvent);
    }

    setSessionid(sessionId: number): void {
        throw new Error('Method not implemented.');
    }
    
    getSessionId(): number {
        return 0
    }

    refreshSessionTime(): void {
        throw new Error('Method not implemented.');
    }

    setLastEventId(): void {
        throw new Error('Method not implemented.');
    }
    
    getAndSetNextEventId(): number {
        throw new Error('Method not implemented.');
    }
}  