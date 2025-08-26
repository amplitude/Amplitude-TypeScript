import {
  BrowserClient,
  returnWrapper,
  Plugin,
  BrowserOptions,
  AmplitudeReturn,
  Result,
  EventOptions,
  IIdentify,
  IRevenue,
  BaseEvent,
  TransportType,
  AnalyticsIdentity,
} from '@amplitude/analytics-core';

export class FakeBrowserClient implements BrowserClient {
  // BrowserClient specific methods
  init(apiKey: string, options?: BrowserOptions): AmplitudeReturn<void>;
  init(apiKey: string, userId?: string, options?: BrowserOptions): AmplitudeReturn<void>;
  init(
    apiKey: string,
    userIdOrOptions?: string | BrowserOptions,
    maybeOptions?: BrowserOptions,
  ): AmplitudeReturn<void> {
    console.log('FakeBrowserClient.init called with:', { apiKey, userIdOrOptions, maybeOptions });
    return returnWrapper(Promise.resolve());
  }

  setTransport(transport: TransportType): void {
    console.log('FakeBrowserClient.setTransport called with:', { transport });
  }

  add(plugin: Plugin): AmplitudeReturn<void> {
    console.log('FakeBrowserClient.add called with:', { plugin });
    return returnWrapper(Promise.resolve());
  }

  getIdentity(): AnalyticsIdentity {
    console.log('FakeBrowserClient.getIdentity called');
    return {
      userId: undefined,
      deviceId: undefined,
      userProperties: undefined,
    };
  }

  getOptOut(): boolean | undefined {
    console.log('FakeBrowserClient.getOptOut called');
    return false;
  }

  // CoreClient methods
  remove(pluginName: string): AmplitudeReturn<void> {
    console.log('FakeBrowserClient.remove called with:', { pluginName });
    return returnWrapper(Promise.resolve());
  }

  track(
    eventInput: BaseEvent | string,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ): AmplitudeReturn<Result> {
    console.log('FakeBrowserClient.track called with:', { eventInput, eventProperties, eventOptions });
    return returnWrapper(
      Promise.resolve({
        code: 200,
        message: 'Event tracked successfully',
        event: {
          event_type: typeof eventInput === 'string' ? eventInput : eventInput.event_type,
        },
      }),
    );
  }

  logEvent(
    eventInput: BaseEvent | string,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ): AmplitudeReturn<Result> {
    console.log('FakeBrowserClient.logEvent called with:', { eventInput, eventProperties, eventOptions });
    return this.track(eventInput, eventProperties, eventOptions);
  }

  identify(identify: IIdentify, eventOptions?: EventOptions): AmplitudeReturn<Result> {
    console.log('FakeBrowserClient.identify called with:', { identify, eventOptions });
    return returnWrapper(
      Promise.resolve({
        code: 200,
        message: 'Identify event tracked successfully',
        event: {
          event_type: '$identify',
        },
      }),
    );
  }

  groupIdentify(
    groupType: string,
    groupName: string | string[],
    identify: IIdentify,
    eventOptions?: EventOptions,
  ): AmplitudeReturn<Result> {
    console.log('FakeBrowserClient.groupIdentify called with:', { groupType, groupName, identify, eventOptions });
    return returnWrapper(
      Promise.resolve({
        code: 200,
        message: 'Group identify event tracked successfully',
        event: {
          event_type: '$groupidentify',
        },
      }),
    );
  }

  setGroup(groupType: string, groupName: string | string[], eventOptions?: EventOptions): AmplitudeReturn<Result> {
    console.log('FakeBrowserClient.setGroup called with:', { groupType, groupName, eventOptions });
    return returnWrapper(
      Promise.resolve({
        code: 200,
        message: 'Set group event tracked successfully',
        event: {
          event_type: '$setgroup',
        },
      }),
    );
  }

  revenue(revenue: IRevenue, eventOptions?: EventOptions): AmplitudeReturn<Result> {
    console.log('FakeBrowserClient.revenue called with:', { revenue, eventOptions });
    return returnWrapper(
      Promise.resolve({
        code: 200,
        message: 'Revenue event tracked successfully',
        event: {
          event_type: '$revenue',
        },
      }),
    );
  }

  setOptOut(optOut: boolean): void {
    console.log('FakeBrowserClient.setOptOut called with:', { optOut });
  }

  flush(): AmplitudeReturn<void> {
    console.log('FakeBrowserClient.flush called');
    return returnWrapper(Promise.resolve());
  }

  // Client methods (from Client interface)
  getUserId(): string | undefined {
    console.log('FakeBrowserClient.getUserId called');
    return undefined;
  }

  setUserId(userId: string | undefined): void {
    console.log('FakeBrowserClient.setUserId called with:', { userId });
  }

  getDeviceId(): string | undefined {
    console.log('FakeBrowserClient.getDeviceId called');
    return undefined;
  }

  setDeviceId(deviceId: string): void {
    console.log('FakeBrowserClient.setDeviceId called with:', { deviceId });
  }

  getSessionId(): number | undefined {
    console.log('FakeBrowserClient.getSessionId called');
    return undefined;
  }

  setSessionId(sessionId: number): void {
    console.log('FakeBrowserClient.setSessionId called with:', { sessionId });
  }

  extendSession(): void {
    console.log('FakeBrowserClient.extendSession called');
  }

  reset(): void {
    console.log('FakeBrowserClient.reset called');
  }
}
