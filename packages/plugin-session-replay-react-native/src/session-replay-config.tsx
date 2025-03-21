import { LogLevel } from "@amplitude/analytics-types";

export interface SessionReplayConfig {
    sampleRate?: number;
    enableRemoteConfig?: boolean;
    logLevel?: LogLevel;
}

export const getDefaultConfig = () => {
    return {
        sampleRate: 0,
        enableRemoteConfig: true,
        logLevel: LogLevel.Warn,
    };
}