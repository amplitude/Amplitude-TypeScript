
declare module '@amplitude/analytics-types' {
    import { BaseEvent, IdentifyEvent } from "@amplitude/analytics-types";

    export interface BaseEvent {
        global_user_properties?: { [key: string]: any } | undefined;
    }

    export interface IdentifyEvent {
        global_user_properties?: { [key: string]: any } | undefined;
    }
}