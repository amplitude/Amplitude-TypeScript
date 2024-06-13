jest.mock('@amplitude/analytics-remote-config', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const originalModule = jest.requireActual('@amplitude/analytics-browser');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return {
        ...originalModule,
        createRemoteConfigFetch: jest.fn().mockImplementation(() => ({
            getRemoteConfig: jest.fn().mockImplementation(() => {
                // Mock it as no remote config is set
                // Thus return an empty object
                return Promise.resolve({});
            })
        }))
    }
});
