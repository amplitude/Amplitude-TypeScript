export interface SessionReplayConfig {
    sampleRate?: number;
    enableRemoteConfig?: boolean;
}

export const getDefaultConfig = () => {
    return {
        sampleRate: 0,
        enableRemoteConfig: true,
    };
}