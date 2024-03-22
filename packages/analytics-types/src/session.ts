import { Event } from "./event";

export interface Session {
    startNewSessionIfNeeded(timestamp: number, sessionId: number, event: Event): void;
    setSessionid(sessionId:number): void;
    getSessionId(): number;
    setLastEventId():void;
    getAndSetNextEventId():number;
    refreshSessionTime():void;
}