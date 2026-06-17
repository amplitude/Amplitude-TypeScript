/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/unbound-method -- jest expectations */
import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { EmbeddedVideoPlayer, VideoState } from '@amplitude/analytics-core';
import { VideoCapture, trackVideo } from '../../src/video-capture/video-capture';
import { currentVideoObserver, resetMockVideoObserver } from './mock-video-observer';

const createTrackResult = (...args: unknown[]) => {
  const event =
    typeof args[0] === 'string'
      ? {
          event_type: args[0],
          event_properties: args[1],
          ...((args[2] as Record<string, unknown>) ?? {}),
        }
      : args[0];
  return { promise: Promise.resolve({ code: 200, event }) };
};

jest.mock('@amplitude/analytics-core', () => {
  const actual = jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core');
  const { MockVideoObserver } = jest.requireActual<typeof import('./mock-video-observer')>('./mock-video-observer');
  return {
    ...actual,
    VideoObserver: MockVideoObserver,
  };
});

describe('VideoCapture', () => {
  let mockAmplitude: AmplitudeBrowser;

  beforeEach(() => {
    resetMockVideoObserver();
    mockAmplitude = {
      track: jest.fn(createTrackResult),
    } as unknown as AmplitudeBrowser;
  });

  describe('kitchen sink', () => {
    it('should track start and stop events', () => {
      const capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .captureVideoStopped()
        .withExtraEventProperties({
          hello: 'world',
          number: 123,
        })
        .start();

      // mock a play event
      let previousState: VideoState = { playbackState: 'paused', lastEvent: undefined };
      let nextState: VideoState = { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } };
      currentVideoObserver!.emitStateChange(previousState, nextState);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'Video Content Started',
          event_properties: {
            duration: 10,
            hello: 'world',
            number: 123,
          },
        }),
      );

      // mock a pause event
      previousState = nextState;
      nextState = { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, watchTime: 5, position: 5 };
      currentVideoObserver!.emitStateChange(previousState, nextState);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        'Video Content Stopped',
        expect.objectContaining({
          duration: 10,
          hello: 'world',
          number: 123,
          watch_duration: 5,
          position: 5,
          percent_completed: 50,
        }),
        expect.objectContaining({ delay_timeout: 0 }),
      );
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);

      // stop the capture
      capture.stop();

      // mock another play event
      previousState = nextState;
      nextState = { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } };
      currentVideoObserver!.emitStateChange(previousState, nextState);

      // assert that the track method was not called again
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);
    });

    it('should flush the pending stop event when capture stops while playing', () => {
      jest.useFakeTimers();
      const capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .captureVideoStopped()
        .start();

      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined }, watchTime: 5, position: 5 },
      );
      capture.stop();

      expect(mockAmplitude.track).toHaveBeenCalledWith(
        'Video Content Stopped',
        expect.objectContaining({
          watch_duration: 5,
          position: 5,
          percent_completed: 50,
        }),
        expect.objectContaining({ delay_timeout: 0 }),
      );
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);

      jest.advanceTimersByTime(60_000);
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it('should pulse the delayed stop event once per minute', () => {
      jest.useFakeTimers();
      const capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .start();

      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(500);
      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(59_500);
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);

      capture.stop();
      jest.useRealTimers();
    });
  });

  describe('withEmbeddedPlayer()', () => {
    it('should capture start and stop events', () => {
      const dummyPlayer = {};
      new VideoCapture(mockAmplitude)
        .withEmbeddedPlayer(dummyPlayer as unknown as EmbeddedVideoPlayer)
        .withVendor('mux')
        .start();
      expect(currentVideoObserver!.isEmbedded).toBe(true);
      expect(currentVideoObserver!.vendor).toBe('mux');
    });
  });

  describe('withVendor()', () => {
    it('should capture start and stop events', () => {
      const videoCapture = new VideoCapture(mockAmplitude).withVendor('mux');
      expect((videoCapture as unknown as { vendor: string }).vendor).toBe('mux');
    });
  });

  describe('start()', () => {
    it('should throw an error if neither withVideoElement nor withEmbeddedPlayer was called', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(() => capture.start()).toThrow(/withVideoElement/g);
    });

    it('should throw an error if both video element and embedded video player are specified', () => {
      const capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .withEmbeddedPlayer({} as unknown as EmbeddedVideoPlayer);
      expect(() => capture.start()).toThrow(/withVideoElement/g);
    });
  });

  describe('trackVideo()', () => {
    beforeEach(() => {
      resetMockVideoObserver();
    });
    it('should capture start and stop events', () => {
      const stopVideoCapture = trackVideo(mockAmplitude, document.createElement('video'), {
        vendor: 'mux',
        extraEventProperties: { hello: 'world', number: 123 },
      });
      expect(currentVideoObserver!.vendor).toBe('mux');
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'Video Content Started',
          event_properties: {
            duration: 10,
            hello: 'world',
            number: 123,
            view_session_id: expect.any(String),
          },
        }),
      );
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, watchTime: 5, position: 5 },
      );
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        'Video Content Stopped',
        expect.objectContaining({
          duration: 10,
          hello: 'world',
          number: 123,
          view_session_id: expect.any(String),
          watch_duration: 5,
          position: 5,
          percent_completed: 50,
        }),
        expect.objectContaining({ delay_timeout: 0 }),
      );
      typeof stopVideoCapture === 'function' && stopVideoCapture();
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 } },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);
    });

    it('should capture start and stop events with embedded video player', () => {
      const stopVideoCapture = trackVideo(mockAmplitude, {
        onPlay: jest.fn(),
        onPause: jest.fn(),
        onEnded: jest.fn(),
        onError: jest.fn(),
      } as unknown as EmbeddedVideoPlayer);
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'Video Content Started',
          event_properties: {
            duration: 10,
            view_session_id: expect.any(String),
          },
        }),
      );
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, watchTime: 5, position: 5 },
      );
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        'Video Content Stopped',
        expect.objectContaining({
          duration: 10,
          view_session_id: expect.any(String),
          watch_duration: 5,
          position: 5,
          percent_completed: 50,
        }),
        expect.objectContaining({ delay_timeout: 0 }),
      );
      typeof stopVideoCapture === 'function' && stopVideoCapture();
    });

    it('should return an error if the video element is not specified', () => {
      const stopVideoCapture = trackVideo(mockAmplitude, null as unknown as HTMLVideoElement);
      expect(stopVideoCapture).toBeInstanceOf(Error);
    });
  });
});
