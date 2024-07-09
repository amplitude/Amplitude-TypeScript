import { QueuedEvent, addToQueue } from '../src/frustration-analytics';
import * as constants from '../src/constants';

import { BrowserClient } from '@amplitude/analytics-types';

describe('frustration-analytics', () => {
  const createMockEvent = ({
    timestamp = 0,
    element = document.createElement('div') as Element,
    event = {},
    shouldTrackEvent = true,
  }): QueuedEvent => ({
    timestamp,
    type: 'click',
    element,
    event,
    shouldTrackEvent,
  });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  afterEach(() => {
    document.getElementsByTagName('body')[0].innerHTML = '';
    jest.clearAllMocks();
  });

  describe('addToQueue', () => {
    test('A single click event is captured as an Element Click Event', async () => {
      const mockAmplitude = {
        track: jest.fn(),
      };
      addToQueue(createMockEvent({}), mockAmplitude as unknown as BrowserClient);
      await wait(1100);

      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        expect.any(Object),
        expect.any(Object),
      );
    });
    test('Multiple trackable click events are captured as a Rage Click', async () => {
      const mockAmplitude = {
        track: jest.fn(),
      };
      const mockEvent = createMockEvent({});
      for (let i = 0; i < 5; i++) {
        addToQueue({ ...mockEvent, timestamp: i }, mockAmplitude as unknown as BrowserClient);
      }
      await wait(1100);

      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        constants.AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
        { '[Amplitude] Number of clicks': 5 },
        { time: 0 },
      );
    });
    test('Multiple not trackable click events are captured as a Rage Click', async () => {
      const mockAmplitude = {
        track: jest.fn(),
      };
      const mockEvent = createMockEvent({ shouldTrackEvent: false });
      for (let i = 0; i < 5; i++) {
        addToQueue({ ...mockEvent, timestamp: i }, mockAmplitude as unknown as BrowserClient);
      }
      await wait(1100);

      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        constants.AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
        { '[Amplitude] Number of clicks': 5 },
        { time: 0 },
      );
    });
    test('Clicking on an Input, waiting, and then clicking on a Buttonx5 should send Element Clicked and Rage Click', async () => {
      const mockAmplitude = {
        track: jest.fn(),
      };
      const inputClick = createMockEvent({ element: document.createElement('input') });
      const buttonClick = createMockEvent({ element: document.createElement('button'), timestamp: 1 });

      addToQueue(inputClick, mockAmplitude as unknown as BrowserClient);
      await wait(1100);
      for (let i = 0; i < 5; i++) {
        addToQueue({ ...buttonClick, timestamp: buttonClick.timestamp + 0 }, mockAmplitude as unknown as BrowserClient);
      }
      await wait(1100);

      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 0 },
      );
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        2,
        constants.AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
        { '[Amplitude] Number of clicks': 5 },
        { time: 1 },
      );
    });
    test('Clicking on an Input, and a Buttonx5 should send Element Clicked and Rage Click', async () => {
      const mockAmplitude = {
        track: jest.fn(),
      };
      const inputClick = createMockEvent({ element: document.createElement('input') });
      const buttonClick = createMockEvent({ element: document.createElement('button'), timestamp: 1 });
      addToQueue(inputClick, mockAmplitude as unknown as BrowserClient);
      for (let i = 0; i < 5; i++) {
        addToQueue({ ...buttonClick, timestamp: buttonClick.timestamp + 0 }, mockAmplitude as unknown as BrowserClient);
      }
      await wait(1100);

      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 0 },
      );
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        2,
        constants.AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
        { '[Amplitude] Number of clicks': 5 },
        { time: 1 },
      );
    });
    test('Clicking on a Buttonx5 and then an Input should send Rage Click and Element Clicked', async () => {
      const mockAmplitude = {
        track: jest.fn(),
      };
      const inputClick = createMockEvent({ element: document.createElement('input') });
      const buttonClick = createMockEvent({ element: document.createElement('button'), timestamp: 1 });
      for (let i = 0; i < 5; i++) {
        addToQueue({ ...buttonClick, timestamp: buttonClick.timestamp + i }, mockAmplitude as unknown as BrowserClient);
      }
      addToQueue(inputClick, mockAmplitude as unknown as BrowserClient);
      await wait(1100);

      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        constants.AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
        { '[Amplitude] Number of clicks': 5 },
        { time: 1 },
      );
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        2,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 0 },
      );
    });
    test('Clicking on a Button, Input and Button should send Element Clicked x3', async () => {
      const mockAmplitude = {
        track: jest.fn(),
      };
      const inputClick = createMockEvent({ element: document.createElement('input') });
      const buttonClick = createMockEvent({ element: document.createElement('button'), timestamp: 1 });
      const inputClick2 = createMockEvent({ element: document.createElement('input'), timestamp: 2 });
      addToQueue(inputClick, mockAmplitude as unknown as BrowserClient);
      addToQueue(buttonClick, mockAmplitude as unknown as BrowserClient);
      addToQueue(inputClick2, mockAmplitude as unknown as BrowserClient);

      await wait(1100);

      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 0 },
      );
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        2,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 1 },
      );
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 2 },
      );
    });

    test('Clicking on 5 different elements within 1 second should send Element Clicked x5', async () => {
      const mockAmplitude = {
        track: jest.fn(),
      };
      const inputClick = createMockEvent({ element: document.createElement('input') });
      const buttonClick = createMockEvent({ element: document.createElement('button'), timestamp: 1 });
      const divClick = createMockEvent({ element: document.createElement('div'), timestamp: 2 });
      const anchorClick = createMockEvent({ element: document.createElement('a'), timestamp: 3 });
      const pClick = createMockEvent({ element: document.createElement('p'), timestamp: 4 });
      addToQueue(inputClick, mockAmplitude as unknown as BrowserClient);
      addToQueue(buttonClick, mockAmplitude as unknown as BrowserClient);
      addToQueue(divClick, mockAmplitude as unknown as BrowserClient);
      addToQueue(anchorClick, mockAmplitude as unknown as BrowserClient);
      addToQueue(pClick, mockAmplitude as unknown as BrowserClient);

      await wait(1100);

      expect(mockAmplitude.track).toHaveBeenCalledTimes(5);
      // inputClick
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 0 },
      );
      // buttonClick
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        2,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 1 },
      );
      // divClick
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 2 },
      );
      // anchorClick
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        4,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 3 },
      );
      // pClick
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        5,
        constants.AMPLITUDE_ELEMENT_CLICKED_EVENT,
        {},
        { time: 4 },
      );
    });
  });
});
