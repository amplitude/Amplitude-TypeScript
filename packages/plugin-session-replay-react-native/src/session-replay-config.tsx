export interface SessionReplayConfig {
    sampleRate?: number;
    enableRemoteConfig?: boolean;
}

export const getDefaultConfig = () => {
    return {
        sampleRate: 1,
        enableRemoteConfig: true,
    };
}