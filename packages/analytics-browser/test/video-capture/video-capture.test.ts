/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return -- jest expectations */
import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { EmbeddedVideoPlayer, VideoState } from '@amplitude/analytics-core';
import { VideoCapture, trackVideo } from '../../src/video-capture/video-capture';
import { currentVideoObserver, resetMockVideoObserver } from './mock-video-observer';

const mockGetHeartbeatInstance = jest.fn();

jest.mock('@amplitude/analytics-core', () => {
  const actual = jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core');
  const { MockVideoObserver } = jest.requireActual<typeof import('./mock-video-observer')>('./mock-video-observer');
  return {
    ...actual,
    VideoObserver: MockVideoObserver,
    getHeartbeatInstance: (client: Parameters<typeof actual.getHeartbeatInstance>[0]) =>
      mockGetHeartbeatInstance(client),
  };
});

describe('VideoCapture', () => {
  let mockAmplitude: AmplitudeBrowser;

  /** Flush resetHeartbeat's setTimeout(0) macrotask before asserting track calls. */
  async function flushHeartbeat() {
    await jest.advanceTimersByTimeAsync(0);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    resetMockVideoObserver();
    mockGetHeartbeatInstance.mockImplementation(
      jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core').getHeartbeatInstance,
    );
    mockAmplitude = {
      track: jest.fn().mockReturnValue({ promise: Promise.resolve({ event: {}, code: 200, message: 'success' }) }),
    } as unknown as AmplitudeBrowser;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('kitchen sink', () => {
    it('should track start and stop events', async () => {
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
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        'Video Content Started',
        {
          duration: 10,
          hello: 'world',
          number: 123,
          play_id: expect.any(String),
          position: 0,
          start_time: 0,
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
        },
      );
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        2,
        'Video Content Stopped',
        {
          duration: 10,
          hello: 'world',
          number: 123,
          play_id: expect.any(String),
          position: 0,
          start_time: 0,
          watch_duration: 0,
          percent_completed: 0,
          stop_reason: 'timeout',
        },
        {
          delay: { id: expect.any(String), timeout: 3_600_000 },
          insert_id: expect.any(String),
        },
      );

      // mock a pause event
      previousState = nextState;
      nextState = { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, position: 5 };
      currentVideoObserver!.emitStateChange(previousState, nextState);
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        'Video Content Stopped',
        {
          duration: 10,
          hello: 'world',
          number: 123,
          play_id: expect.any(String),
          position: 5,
          start_time: 0,
          watch_duration: 0,
          percent_completed: 50,
          stop_reason: 'paused',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
        },
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
    it('should capture start and stop events', async () => {
      const stopVideoCapture = trackVideo(mockAmplitude, document.createElement('video'), {
        vendor: 'mux',
        extraEventProperties: { hello: 'world', number: 123 },
      });
      expect(currentVideoObserver!.vendor).toBe('mux');
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        'Video Content Started',
        {
          duration: 10,
          hello: 'world',
          number: 123,
          play_id: expect.any(String),
          position: 0,
          start_time: 0,
          view_session_id: expect.any(String),
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
        },
      );
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, position: 5 },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        'Video Content Stopped',
        {
          duration: 10,
          hello: 'world',
          number: 123,
          play_id: expect.any(String),
          position: 5,
          start_time: 0,
          watch_duration: 0,
          percent_completed: 50,
          stop_reason: 'paused',
          view_session_id: expect.any(String),
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
        },
      );
      typeof stopVideoCapture === 'function' && stopVideoCapture();
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 } },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);
    });

    it('should capture start and stop events with embedded video player', async () => {
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
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        'Video Content Started',
        {
          duration: 10,
          play_id: expect.any(String),
          position: 0,
          start_time: 0,
          view_session_id: expect.any(String),
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
        },
      );
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, position: 5 },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        'Video Content Stopped',
        {
          duration: 10,
          play_id: expect.any(String),
          position: 5,
          start_time: 0,
          watch_duration: 0,
          percent_completed: 50,
          stop_reason: 'paused',
          view_session_id: expect.any(String),
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
        },
      );
      typeof stopVideoCapture === 'function' && stopVideoCapture();
    });

    it('should return an error if the video element is not specified', () => {
      const stopVideoCapture = trackVideo(mockAmplitude, null as unknown as HTMLVideoElement);
      expect(stopVideoCapture).toBeInstanceOf(Error);
    });
  });

  describe('stops capturing when track fails', () => {
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, last_position: undefined },
    };
    const pausedState: VideoState = { playbackState: 'paused', lastEvent: undefined };

    let heartbeatStop: jest.Mock;
    let track: jest.Mock;
    let trackNoDelay: jest.Mock;
    let capture: VideoCapture;

    beforeEach(() => {
      heartbeatStop = jest.fn();
      track = jest.fn().mockResolvedValue({ code: 200, event: {} });
      trackNoDelay = jest.fn().mockResolvedValue({ code: 200, event: {} });
      mockGetHeartbeatInstance.mockReturnValue({
        track,
        trackNoDelay,
        stop: heartbeatStop,
        update: jest.fn(),
      });
      capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .start();
    });

    afterEach(() => {
      capture.stop();
    });

    it('should call stop when trackNoDelay rejects on video start', async () => {
      trackNoDelay.mockRejectedValue(new Error('trackNoDelay failed'));

      currentVideoObserver!.emitStateChange(pausedState, playingState);
      await Promise.resolve();

      expect(heartbeatStop).toHaveBeenCalled();
    });

    it('should call stop when track rejects on video start', async () => {
      track.mockRejectedValue(new Error('track failed'));

      currentVideoObserver!.emitStateChange(pausedState, playingState);
      await Promise.resolve();

      expect(heartbeatStop).toHaveBeenCalled();
    });

    it('should call stop when trackNoDelay rejects on video stop', async () => {
      capture.stop();
      trackNoDelay
        .mockResolvedValueOnce({ code: 200, event: {} })
        .mockRejectedValueOnce(new Error('trackNoDelay failed'));
      capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .captureVideoStopped()
        .start();

      currentVideoObserver!.emitStateChange(pausedState, playingState);
      await Promise.resolve();
      currentVideoObserver!.emitStateChange(playingState, {
        playbackState: 'paused',
        lastEvent: { duration: 10, last_position: 5 },
        position: 5,
      });
      await Promise.resolve();

      expect(heartbeatStop).toHaveBeenCalled();
    });
  });

  describe('parseStartEventProperties()', () => {
    it('should parse start event properties', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStartEventProperties({
          playbackState: 'playing',
          lastEvent: { duration: 10, start_time: 2, last_position: 5 },
          position: 5,
        }),
      ).toEqual({
        duration: 10,
        start_time: 2,
        position: 5,
      });
    });

    it('should parse start event properties with empty lastEvent', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStartEventProperties({
          playbackState: 'playing',
        }),
      ).toEqual({
        duration: 0,
        start_time: 0,
        position: 0,
      });
    });
  });

  describe('parseStopEventProperties()', () => {
    it('should parse stop event properties', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'paused',
          lastEvent: { duration: 10, start_time: 2, last_position: 5 },
          position: 5,
          watchTime: 30,
        }),
      ).toEqual({
        duration: 10,
        start_time: 2,
        position: 5,
        watch_duration: 30,
        percent_completed: 50,
      });
    });

    it('should parse stop event properties with empty lastEvent', () => {
      const capture = new VideoCapture(mockAmplitude);
      const properties = capture.parseStopEventProperties({
        playbackState: 'paused',
      });
      expect(properties).toEqual({
        duration: 0,
        start_time: 0,
        position: 0,
        watch_duration: 0,
        percent_completed: NaN,
      });
    });
  });
});
