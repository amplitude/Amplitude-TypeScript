/**
 * On-device harness for autocapture element interactions.
 *
 * Runs on a real device/simulator (not Jest/Node).
 * Requires react-native-harness + examples/react-native/app built and installed.
 *
 * Skipped on old architecture (NEW_ARCH=0): `@react-native-harness/ui` is
 * TurboModule-only. See jest.harness.config.mjs.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, beforeEach, afterEach, render, expect } from 'react-native-harness';
import { screen, userEvent } from '@react-native-harness/ui';
import { createInstance, Types, ampCapture } from '@amplitude/analytics-react-native';
import { createEventCapture, EventCapture } from '../helpers/event-capture';
import { View, Button } from 'react-native';

const API_KEY = 'dummyApiKey';
let client: Types.ReactNativeClient;

function ButtonHarness() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Button
        testID="my-button"
        title="Press me"
        accessibilityLabel="Button accessibility label"
        onPress={ampCapture(
          () => {
            console.log('Button pressed');
          },
          {
            testID: 'my-button',
            component: 'ButtonHarness',
            element: 'Button',
            accessibilityLabel: 'Button accessibility label',
            action: 'press',
          },
        )}
      />
    </View>
  );
}

describe('autocapture.elementInteractions', () => {
  let capture: EventCapture;

  beforeEach(async () => {
    client = createInstance();
    capture = createEventCapture();
    client.add(capture.plugin);

    await client.init(API_KEY, 'harness-user', {
      flushQueueSize: 1,
      logLevel: Types.LogLevel.None,
      attribution: {
        disabled: true,
      },
      autocapture: {
        appLifecycles: false,
        sessions: false,
        screenViews: false,
        elementInteractions: true,
      },
    } as any).promise;
  });

  afterEach(() => {
    capture.clear();
  });

  it('tracks onPress event on button', async () => {
    render(<ButtonHarness />);
    const button = await screen.findByTestId('my-button');
    await userEvent.press(button);
    await capture.waitForEvents(1);
    expect(capture.events).toHaveLength(1);
    expect(capture.events[0].event_type).toBe('[Amplitude] Element Interacted');
    expect(capture.events[0].event_properties).toEqual({
      '[Amplitude] Target Accessibility Label': 'Button accessibility label',
      '[Amplitude] Target View Class': 'ButtonHarness',
      '[Amplitude] Target Element': 'Button',
      '[Amplitude] Target Test ID': 'my-button',
      '[Amplitude] Action': 'press',
    });
  });
});


describe('autocapture.elementInteractions is undefined', () => {
  let capture: EventCapture;

  beforeEach(async () => {
    client = createInstance();
    capture = createEventCapture();
    client.add(capture.plugin);

    await client.init(API_KEY, 'harness-user', {
      flushQueueSize: 1,
      logLevel: Types.LogLevel.None,
      attribution: {
        disabled: true,
      },
    } as any).promise;
  });

  afterEach(() => {
    capture.clear();
  });

  it('onPress event is not tracked', async () => {
    render(<ButtonHarness />);
    const button = await screen.findByTestId('my-button');
    await userEvent.press(button);
    await capture.waitForEvents(0, 1_000);
    expect(capture.events).toHaveLength(0);
  });
});
