/**
 * On-device harness for autocapture frustration interactions.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 *
 * Skipped on old architecture (NEW_ARCH=0): `@react-native-harness/ui` is
 * TurboModule-only. See jest.harness.config.mjs.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as React from 'react';
import { describe, it, afterEach, render, expect } from 'react-native-harness';
import { screen, userEvent } from '@react-native-harness/ui';
import { DEFAULT_RAGE_CLICK_THRESHOLD, DEFAULT_RAGE_CLICK_WINDOW_MS, getGlobalScope } from '@amplitude/analytics-core';
import { createInstance, Types, ampCapture } from '@amplitude/analytics-react-native';
import { View, Button } from 'react-native';
import { createEventCapture, EventCapture } from '../helpers/event-capture';

const API_KEY = 'dummyApiKey';
const ERROR_CLICK_DELAY_MS = 50;

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler: () => ErrorHandler | undefined;
  setGlobalHandler: (handler: ErrorHandler) => void;
};
type GlobalWithErrorUtils = NonNullable<ReturnType<typeof getGlobalScope>> & {
  ErrorUtils?: ErrorUtilsLike;
};
type ShutdownableClient = Types.ReactNativeClient & {
  shutdown?: () => void;
};

let client: Types.ReactNativeClient;
let capture: EventCapture;
let previousErrorHandler: ErrorHandler | undefined;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getErrorUtils(): ErrorUtilsLike | undefined {
  return (getGlobalScope() as GlobalWithErrorUtils | undefined)?.ErrorUtils;
}

/**
 * The SDK chains to whatever handler is installed when it starts. React Native's
 * default handler reports a fatal error and drops the harness bridge, so swap in
 * a no-op before init and restore it afterward.
 */
function silenceNativeErrorHandler() {
  const errorUtils = getErrorUtils();
  if (!errorUtils?.getGlobalHandler || !errorUtils.setGlobalHandler) {
    return;
  }
  previousErrorHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler(() => undefined);
}

function restoreNativeErrorHandler() {
  const errorUtils = getErrorUtils();
  const handler = previousErrorHandler;
  previousErrorHandler = undefined;
  if (handler && errorUtils?.setGlobalHandler) {
    errorUtils.setGlobalHandler(handler);
  }
}

function emitUnhandledError(error: unknown) {
  getErrorUtils()?.getGlobalHandler()?.(error, true);
}

function FrustrationButton({ onPress }: { onPress?: () => void }) {
  return React.createElement(
    View,
    {
      style: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      },
    },
    React.createElement(Button, {
      testID: 'frustration-button',
      title: 'Press me',
      accessibilityLabel: 'Frustration button',
      onPress: ampCapture(
        () => {
          onPress?.();
        },
        {
          testID: 'frustration-button',
          component: 'FrustrationButton',
          element: 'Button',
          accessibilityLabel: 'Frustration button',
          action: 'Press',
        },
      ),
    }),
  );
}

async function initClient(frustrationInteractions?: boolean) {
  silenceNativeErrorHandler();
  client = createInstance();
  capture = createEventCapture();
  client.add(capture.plugin);

  const options: Types.ReactNativeOptions = {
    flushQueueSize: 1,
    flushIntervalMillis: 1,
    logLevel: Types.LogLevel.None,
    attribution: {
      disabled: true,
    },
    autocapture: {
      appLifecycles: false,
      sessions: false,
      screenViews: false,
      elementInteractions: false,
      frustrationInteractions,
    },
  };

  await client.init(API_KEY, 'harness-user', options).promise;
}

describe('autocapture.frustrationInteractions', () => {
  afterEach(() => {
    (client as ShutdownableClient | undefined)?.shutdown?.();
    capture?.clear();
    restoreNativeErrorHandler();
  });

  it('triggers an error click when a button is pressed and an error happens within 100ms', async () => {
    await initClient(true);
    await render(
      React.createElement(FrustrationButton, {
        onPress: () => {
          setTimeout(() => emitUnhandledError(new Error('Harness press failed')), ERROR_CLICK_DELAY_MS);
        },
      }),
    );

    const button = await screen.findByTestId('frustration-button');
    await userEvent.press(button);

    await capture.waitForEvents(1);
    expect(capture.events).toHaveLength(1);
    expect(capture.events[0].event_type).toBe('[Amplitude] Error Click');
    expect(capture.events[0].event_properties).toEqual(
      expect.objectContaining({
        '[Amplitude] Kind': 'error',
        '[Amplitude] Message': 'Harness press failed',
        '[Amplitude] Target Accessibility Label': 'Frustration button',
        '[Amplitude] Action': 'Press',
        '[Amplitude] Target Component': 'FrustrationButton',
        '[Amplitude] Target Element': 'Button',
        '[Amplitude] Target Test ID': 'frustration-button',
      }),
    );
  });

  it('triggers a rage click when a button is pressed 4 times within the rage click threshold', async () => {
    await initClient(true);
    await render(React.createElement(FrustrationButton));

    const button = await screen.findByTestId('frustration-button');
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
      await userEvent.press(button);
    }

    await capture.waitForEvents(1, DEFAULT_RAGE_CLICK_WINDOW_MS + 2_000);
    expect(capture.events).toHaveLength(1);
    expect(capture.events[0].event_type).toBe('[Amplitude] Rage Click');
    expect(capture.events[0].event_properties).toEqual(
      expect.objectContaining({
        '[Amplitude] Click Count': DEFAULT_RAGE_CLICK_THRESHOLD,
        '[Amplitude] Target Accessibility Label': 'Frustration button',
        '[Amplitude] Action': 'Press',
        '[Amplitude] Target Component': 'FrustrationButton',
        '[Amplitude] Target Element': 'Button',
        '[Amplitude] Target Test ID': 'frustration-button',
      }),
    );
  });

  it('triggers no error click or rage click if frustration interactions is not enabled', async () => {
    await initClient();
    await render(
      React.createElement(FrustrationButton, {
        onPress: () => {
          setTimeout(() => emitUnhandledError(new Error('Harness press failed')), ERROR_CLICK_DELAY_MS);
        },
      }),
    );

    const button = await screen.findByTestId('frustration-button');
    for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
      await userEvent.press(button);
    }

    await wait(DEFAULT_RAGE_CLICK_WINDOW_MS + ERROR_CLICK_DELAY_MS + 200);
    expect(capture.events).toHaveLength(0);
  });
});
