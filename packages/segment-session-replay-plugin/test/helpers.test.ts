import { getSessionId, setSessionId, updateSessionIdAndAddProperties } from '../src/helpers';
import Cookie from 'js-cookie';
import * as sessionReplay from '@amplitude/session-replay-browser';
import { COOKIE_NAME } from '../src/constants';
import { Context } from '@segment/analytics-next';
import * as helpers from '../src/helpers';

jest.mock('@amplitude/session-replay-browser');
jest.mock('js-cookie');

describe('getSessionId()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    // When the SDK returns a sessionId, return that sessionId even if the cookie returns a different sessionId
    {
      sessionReplaySdkSessionId: 1,
      cookieSessionId: '2',
      expectedReturn: 1,
      expectedSdkCalls: 1,
      expectedCookieCalls: 0,
    },
    // When the SDK returns undefined, fall back to fetching the sessionId from the cookie
    {
      sessionReplaySdkSessionId: undefined,
      cookieSessionId: '2',
      expectedReturn: 2,
      expectedSdkCalls: 1,
      expectedCookieCalls: 1,
    },
    // When the SDK returns undefined and the cookie returns undefined, return undefined
    {
      sessionReplaySdkSessionId: undefined,
      cookieSessionId: undefined,
      expectedReturn: undefined,
      expectedSdkCalls: 1,
      expectedCookieCalls: 1,
    },
    // When the SDK returns a non-number sessionId, return undefined
    {
      sessionReplaySdkSessionId: 'not a number',
      cookieSessionId: '2',
      expectedReturn: undefined,
      expectedSdkCalls: 1,
      expectedCookieCalls: 0,
    },
    // When the cookie returns a non-number sessionId, return undefined
    {
      sessionReplaySdkSessionId: undefined,
      cookieSessionId: 'not a number',
      expectedReturn: undefined,
      expectedSdkCalls: 1,
      expectedCookieCalls: 1,
    },
  ])(
    'should return $expectedReturn when the SDK returns $sessionReplaySdkSessionId and the stored sessionId returns $cookieSessionId',
    ({ sessionReplaySdkSessionId, cookieSessionId, expectedReturn, expectedSdkCalls, expectedCookieCalls }) => {
      // Arrange
      const cookieGetMock = jest.fn().mockReturnValue(cookieSessionId);
      (Cookie.get as jest.Mock) = cookieGetMock;
      (sessionReplay.getSessionId as jest.Mock).mockReturnValue(sessionReplaySdkSessionId);

      // Act
      const result = getSessionId();

      // Assert
      expect(cookieGetMock).toHaveBeenCalledTimes(expectedCookieCalls);
      expect(sessionReplay.getSessionId).toHaveBeenCalledTimes(expectedSdkCalls);
      expect(result).toEqual(expectedReturn);
    },
  );
});

describe('setSessionId()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      sessionId: 1,
      deviceId: 'deviceId',
    },
    {
      sessionId: 1,
      deviceId: undefined,
    },
  ])(
    'should set the sessionId in the Session Replay SDK and store the sessionId in the cookie',
    async ({ sessionId, deviceId }) => {
      // Arrange
      const cookieSetMock = jest.fn().mockReturnValue(sessionId);
      (Cookie.set as jest.Mock) = cookieSetMock;
      (sessionReplay.setSessionId as jest.Mock).mockResolvedValue(sessionId);

      // Act
      await setSessionId(sessionId, deviceId);

      // Assert
      expect(cookieSetMock).toHaveBeenCalledTimes(1);
      expect(cookieSetMock).toHaveBeenCalledWith(COOKIE_NAME, sessionId.toString());

      expect(sessionReplay.setSessionId).toHaveBeenCalledTimes(1);
      expect(sessionReplay.setSessionId).toHaveBeenCalledWith(sessionId, deviceId);
    },
  );
});

describe('updateSessionIdAndAddProperties()', () => {
  let getSessionIdSpy: jest.SpyInstance;
  let setSessionIdSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    getSessionIdSpy = jest.spyOn(helpers, 'getSessionId').mockReturnValue(undefined);
    setSessionIdSpy = jest.spyOn(helpers, 'setSessionId').mockResolvedValue(undefined);
  });

  afterEach(() => {
    getSessionIdSpy.mockRestore();
    setSessionIdSpy.mockRestore();
  });

  it.each([
    // Combine context properties and session replay properties
    {
      contextProperties: { 'context-property': 'context-value' },
      sessionReplayProperties: { 'session-replay-property': 'session-replay-value' },
      expectedProperties: { 'context-property': 'context-value', 'session-replay-property': 'session-replay-value' },
    },
    // Empty context properties
    {
      contextProperties: {},
      sessionReplayProperties: { 'session-replay-property': 'session-replay-value' },
      expectedProperties: { 'session-replay-property': 'session-replay-value' },
    },
    // Empty session replay properties
    {
      contextProperties: { 'context-property': 'context-value' },
      sessionReplayProperties: {},
      expectedProperties: { 'context-property': 'context-value' },
    },
    // Empty context properties and session replay properties
    {
      contextProperties: {},
      sessionReplayProperties: {},
      expectedProperties: {},
    },
    // Overlapping context properties and session replay properties should use the context properties
    {
      contextProperties: { 'test-property': 'context-value' },
      sessionReplayProperties: { 'test-property': 'session-replay-value' },
      expectedProperties: { 'test-property': 'context-value' },
    },
  ])(
    'should call context.updateEvent() with the event properties and session replay properties',
    async ({ contextProperties, sessionReplayProperties, expectedProperties }) => {
      // Arrange
      const updateEventMock = jest.fn();
      const context = {
        event: {
          properties: contextProperties,
          integrations: {
            'Actions Amplitude': {
              session_id: 1,
            },
          },
        },
        updateEvent: updateEventMock,
      } as unknown as Context;

      (sessionReplay.getSessionReplayProperties as jest.Mock).mockReturnValue(sessionReplayProperties);

      // Act
      await updateSessionIdAndAddProperties(context, 'deviceId');

      // Assert
      expect(updateEventMock).toHaveBeenCalledTimes(1);
      expect(updateEventMock).toHaveBeenCalledWith('properties', expectedProperties);
    },
  );

  it('should call setSessionId() with the Segment event.integrations.Actions Amplitude.session_id if it is greater than the current sessionId', async () => {
    // Arrange
    const nextSessionId = 2;
    const currentSessionId = 1;

    const updateEventMock = jest.fn();
    const context = {
      event: {
        properties: {},
        integrations: {
          'Actions Amplitude': {
            session_id: nextSessionId,
          },
        },
      },
      updateEvent: updateEventMock,
    } as unknown as Context;

    getSessionIdSpy.mockReturnValue(currentSessionId);
    setSessionIdSpy.mockResolvedValue(null);

    // Act
    await updateSessionIdAndAddProperties(context, 'deviceId');

    // Assert
    expect(setSessionIdSpy).toHaveBeenCalledTimes(1);
    expect(setSessionIdSpy).toHaveBeenCalledWith(nextSessionId, 'deviceId');
  });

  it.each([
    {
      description: 'if the nextSessionId is less than the current sessionId',
      currentSessionId: 1,
      nextSessionId: 0,
      expectedSessionId: 1,
      expectedCallsToSetSessionId: 0,
    },
    {
      description: 'if the nextSessionId is equal to the current sessionId',
      currentSessionId: 1,
      nextSessionId: 1,
      expectedSessionId: 1,
      expectedCallsToSetSessionId: 0,
    },
    {
      description: 'if the session_id is not defined in the event integrations',
      currentSessionId: 1,
      nextSessionId: undefined,
      expectedSessionId: 1,
    },
  ])('should not call setSessionId() $description', async ({ currentSessionId, nextSessionId }) => {
    // Arrange
    const updateEventMock = jest.fn();
    const context = {
      event: {
        properties: {},
        integrations: {
          'Actions Amplitude': {
            session_id: nextSessionId,
          },
        },
      },
      updateEvent: updateEventMock,
    } as unknown as Context;

    getSessionIdSpy.mockReturnValue(currentSessionId);
    setSessionIdSpy.mockResolvedValue(null);

    // Act
    await updateSessionIdAndAddProperties(context, 'deviceId');

    // Assert
    expect(setSessionIdSpy).toHaveBeenCalledTimes(0);
  });
});
