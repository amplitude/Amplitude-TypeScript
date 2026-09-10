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
        '[Amplitude] Content Started',
        {
          duration: 10,
          hello: 'world',
          number: 123,
          play_id: expect.any(String),
          position: 0,
          start_time: 0,
          delivery_mode: 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        2,
        '[Amplitude] Content Stopped',
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
          delivery_mode: 'video',
        },
        {
          delay: { id: expect.any(String), timeout: 3_600_000 },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );

      // mock a pause event
      previousState = nextState;
      nextState = { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, position: 5 };
      currentVideoObserver!.emitStateChange(previousState, nextState);
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Content Stopped',
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
          delivery_mode: 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
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
    it('should capture start and stop events', async () => {
      const videoCapture = new VideoCapture(mockAmplitude).withVendor('mux');
      expect((videoCapture as unknown as { vendor: string }).vendor).toBe('mux');
    });
    it('should capture start and stop events with mux properties', async () => {
      const capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .withVendor('mux')
        .captureVideoStarted()
        .captureVideoStopped()
        .start();

      const muxLastEvent = {
        duration: 10,
        last_position: 0,
        mux_playback_id: 'playback-id',
        mux_video_id: 'video-id',
        mux_video_title: 'video-title',
      };
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: muxLastEvent, position: 0 },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Content Started',
        expect.objectContaining({
          mux_playback_id: 'playback-id',
          mux_video_id: 'video-id',
          mux_video_title: 'video-title',
        }),
        expect.any(Object),
      );

      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: muxLastEvent, position: 0 },
        {
          playbackState: 'paused',
          lastEvent: { ...muxLastEvent, last_position: 5, percent_completed: 20, stop_reason: 'paused' },
          position: 5,
        },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Content Stopped',
        expect.objectContaining({
          mux_playback_id: 'playback-id',
          mux_video_id: 'video-id',
          mux_video_title: 'video-title',
          stop_reason: 'paused',
          percent_completed: 50,
        }),
        expect.any(Object),
      );
      capture.stop();
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
        '[Amplitude] Content Started',
        {
          duration: 10,
          hello: 'world',
          number: 123,
          play_id: expect.any(String),
          position: 0,
          start_time: 0,
          view_session_id: expect.any(String),
          delivery_mode: 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, position: 5 },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Content Stopped',
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
          delivery_mode: 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
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
        '[Amplitude] Content Started',
        {
          duration: 10,
          play_id: expect.any(String),
          position: 0,
          start_time: 0,
          view_session_id: expect.any(String),
          delivery_mode: 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 }, position: 5 },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Content Stopped',
        {
          duration: 10,
          play_id: expect.any(String),
          position: 5,
          start_time: 0,
          watch_duration: 0,
          percent_completed: 50,
          stop_reason: 'paused',
          view_session_id: expect.any(String),
          delivery_mode: 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );
      typeof stopVideoCapture === 'function' && stopVideoCapture();
    });

    it('should return an error if the video element is not specified', () => {
      const stopVideoCapture = trackVideo(mockAmplitude, null as unknown as HTMLVideoElement);
      expect(stopVideoCapture).toBeInstanceOf(Error);
    });

    it('should set delivery_mode to audio for an HTML audio element', async () => {
      const stopVideoCapture = trackVideo(mockAmplitude, document.createElement('audio'));
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Content Started',
        expect.objectContaining({ delivery_mode: 'audio' }),
        expect.any(Object),
      );
      typeof stopVideoCapture === 'function' && stopVideoCapture();
    });
  });

  describe('buffering (waiting state)', () => {
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, last_position: 0 },
      position: 0,
      watchTime: 5,
    };
    const waitingState: VideoState = {
      playbackState: 'waiting',
      lastEvent: { duration: 10, last_position: 5 },
      position: 5,
      watchTime: 5,
    };
    const pausedState: VideoState = {
      playbackState: 'paused',
      lastEvent: { duration: 10, last_position: 5 },
      position: 5,
      watchTime: 5,
    };

    it('should not split the play session across buffering', async () => {
      new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .captureVideoStopped()
        .start();

      currentVideoObserver!.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();

      const playId = (mockAmplitude.track as jest.Mock).mock.calls[0][1].play_id;

      currentVideoObserver!.emitStateChange(playingState, waitingState);
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);

      currentVideoObserver!.emitStateChange(waitingState, {
        ...playingState,
        position: 6,
        watchTime: 6,
      });
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);
      expect((mockAmplitude.track as jest.Mock).mock.calls.every((call) => call[1].play_id === playId)).toBe(true);

      currentVideoObserver!.emitStateChange({ ...playingState, position: 6, watchTime: 6 }, pausedState);
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Content Stopped',
        expect.objectContaining({
          play_id: playId,
          stop_reason: 'paused',
        }),
        expect.any(Object),
      );
    });

    it('should record completed playback as ended when pause precedes ended', async () => {
      const video = document.createElement('video');
      new VideoCapture(mockAmplitude).withVideoElement(video).captureVideoStarted().captureVideoStopped().start();

      currentVideoObserver!.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      Object.defineProperty(video, 'ended', { configurable: true, value: true });
      currentVideoObserver!.emitStateChange(playingState, pausedState);
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({
          stop_reason: 'ended',
          position: 5,
          watch_duration: 5,
        }),
        expect.objectContaining({ delay: { id: expect.any(String) } }),
      );
    });

    it('should record an error when pause precedes the error state', async () => {
      const video = document.createElement('video');
      new VideoCapture(mockAmplitude).withVideoElement(video).captureVideoStarted().captureVideoStopped().start();

      currentVideoObserver!.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();
      currentVideoObserver!.emitStateChange(playingState, waitingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      Object.defineProperty(video, 'error', {
        configurable: true,
        value: { code: 2, message: 'network' },
      });
      currentVideoObserver!.emitStateChange(waitingState, pausedState);
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({
          stop_reason: 'error',
          error_message: 'Media element error (code 2): network',
          position: 5,
          watch_duration: 5,
        }),
        expect.objectContaining({ delay: { id: expect.any(String) } }),
      );
    });

    it('should record a media error without a message when pause precedes the error state', async () => {
      const video = document.createElement('video');
      new VideoCapture(mockAmplitude).withVideoElement(video).captureVideoStarted().captureVideoStopped().start();

      currentVideoObserver!.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      Object.defineProperty(video, 'error', {
        configurable: true,
        value: { code: 4, message: '' },
      });
      currentVideoObserver!.emitStateChange(playingState, pausedState);
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({
          stop_reason: 'error',
          error_message: 'Media element error (code 4)',
        }),
        expect.any(Object),
      );
    });

    it('should end a stalled play session when the media element errors', async () => {
      new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .captureVideoStopped()
        .start();

      currentVideoObserver!.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();
      currentVideoObserver!.emitStateChange(playingState, waitingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      currentVideoObserver!.emitStateChange(waitingState, {
        ...waitingState,
        playbackState: 'error',
        errorMessage: 'Media element error (code 2): network',
      });
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({
          stop_reason: 'error',
          error_message: 'Media element error (code 2): network',
          position: 5,
          watch_duration: 5,
        }),
        expect.objectContaining({ delay: { id: expect.any(String) } }),
      );

      // the session is closed out, so the 1-hour delayed stop event no longer heartbeats
      jest.clearAllMocks();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(mockAmplitude.track).not.toHaveBeenCalled();
    });

    it('should heartbeat the delayed stop event with the latest playback progress', async () => {
      new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .captureVideoStopped()
        .start();

      currentVideoObserver!.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();

      currentVideoObserver!.emitStateChange(playingState, {
        ...playingState,
        position: 8,
        watchTime: 8,
      });
      jest.clearAllMocks();

      // the delayed stop event is re-sent on the next heartbeat
      await jest.advanceTimersByTimeAsync(60_000);
      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({
          position: 8,
          watch_duration: 8,
          percent_completed: 80,
          stop_reason: 'timeout',
        }),
        expect.objectContaining({ delay: { id: expect.any(String), timeout: 3_600_000 } }),
      );
    });
  });

  describe('session start_time', () => {
    // getVideoData reports start_time as the playhead at the time of the event, so a pause
    // partway through playback reports the stop position rather than where playback began
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, start_time: 2, last_position: 2 },
      position: 2,
      watchTime: 0,
    };
    const pausedState: VideoState = {
      playbackState: 'paused',
      lastEvent: { duration: 10, start_time: 7, last_position: 7 },
      position: 7,
      watchTime: 5,
    };

    function startCapture() {
      new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .captureVideoStarted()
        .captureVideoStopped()
        .start();
      return currentVideoObserver!;
    }

    it('should report where playback began on the flushed stop event', async () => {
      const observer = startCapture();
      observer.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();

      observer.emitStateChange(playingState, pausedState);
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Content Stopped',
        expect.objectContaining({ start_time: 2, position: 7, stop_reason: 'paused' }),
        expect.any(Object),
      );
    });

    it('should report where playback began on the heartbeated stop event', async () => {
      const observer = startCapture();
      observer.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();

      // buffering keeps the session open but moves the playhead
      observer.emitStateChange(playingState, {
        playbackState: 'waiting',
        lastEvent: { duration: 10, start_time: 5, last_position: 5 },
        position: 5,
        watchTime: 3,
      });
      jest.clearAllMocks();

      await jest.advanceTimersByTimeAsync(60_000);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({ start_time: 2, position: 5, stop_reason: 'timeout' }),
        expect.objectContaining({ delay: { id: expect.any(String), timeout: 3_600_000 } }),
      );
    });

    it('should report the new start_time after playback restarts', async () => {
      const observer = startCapture();
      observer.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playingState);
      await flushHeartbeat();
      observer.emitStateChange(playingState, pausedState);
      await flushHeartbeat();
      jest.clearAllMocks();

      const replayState: VideoState = {
        playbackState: 'playing',
        lastEvent: { duration: 10, start_time: 7, last_position: 7 },
        position: 7,
        watchTime: 5,
      };
      observer.emitStateChange(pausedState, replayState);
      await flushHeartbeat();
      observer.emitStateChange(replayState, {
        playbackState: 'ended',
        lastEvent: { duration: 10, start_time: 10, last_position: 10 },
        position: 10,
        watchTime: 8,
      });
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenLastCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({ start_time: 7, position: 10, stop_reason: 'ended' }),
        expect.any(Object),
      );
    });
  });

  describe('stops capturing when track fails', () => {
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, last_position: undefined },
    };
    const pausedState: VideoState = { playbackState: 'paused', lastEvent: undefined };

    /** The "[Amplitude] Content Stopped" event flushed by stop(). */
    const untrackedStopEvent = expect.objectContaining({
      event_type: '[Amplitude] Content Stopped',
      event_properties: expect.objectContaining({ stop_reason: 'untracked' }),
    });

    let track: jest.Mock;
    let trackNoDelay: jest.Mock;
    let capture: VideoCapture;

    beforeEach(() => {
      track = jest.fn().mockResolvedValue({ code: 200, event: {} });
      trackNoDelay = jest.fn().mockResolvedValue({ code: 200, event: {} });
      mockGetHeartbeatInstance.mockReturnValue({
        track,
        trackNoDelay,
        stop: jest.fn(),
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

    it('should stop when trackNoDelay rejects on video start', async () => {
      trackNoDelay.mockRejectedValue(new Error('trackNoDelay failed'));

      currentVideoObserver!.emitStateChange(pausedState, playingState);
      await jest.advanceTimersByTimeAsync(0);

      expect(trackNoDelay).toHaveBeenCalledWith(untrackedStopEvent);

      // the observer is detached, so no further events are captured
      trackNoDelay.mockClear();
      track.mockClear();
      currentVideoObserver!.emitStateChange(pausedState, playingState);
      expect(trackNoDelay).not.toHaveBeenCalled();
      expect(track).not.toHaveBeenCalled();
    });

    it('should stop when track rejects on video start', async () => {
      track.mockRejectedValue(new Error('track failed'));

      currentVideoObserver!.emitStateChange(pausedState, playingState);
      await jest.advanceTimersByTimeAsync(0);

      expect(trackNoDelay).toHaveBeenCalledWith(untrackedStopEvent);
    });

    it('should stop when trackNoDelay rejects on video stop', async () => {
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
      await jest.advanceTimersByTimeAsync(0);
      currentVideoObserver!.emitStateChange(playingState, {
        playbackState: 'paused',
        lastEvent: { duration: 10, last_position: 5 },
        position: 5,
      });
      await jest.advanceTimersByTimeAsync(0);

      // the stop event was already flushed with stop_reason "paused", so tearing down
      // the capture must not send it a second time
      expect(trackNoDelay).toHaveBeenCalledTimes(2);
      expect(trackNoDelay).not.toHaveBeenCalledWith(untrackedStopEvent);
    });
  });

  describe('stop()', () => {
    const idleState: VideoState = { playbackState: 'paused', lastEvent: undefined };
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, last_position: 0 },
      position: 4,
      watchTime: 4,
    };

    function startCapture(extraEventProperties: Record<string, string> = {}) {
      const capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .withExtraEventProperties(extraEventProperties)
        .captureVideoStarted()
        .captureVideoStopped()
        .start();
      return { capture, observer: currentVideoObserver! };
    }

    it('should flush the delayed stop event when stopped mid-play', async () => {
      const { capture, observer } = startCapture();
      observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      capture.stop();
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({ stop_reason: 'untracked', position: 4, watch_duration: 4 }),
        expect.objectContaining({ delay: { id: expect.any(String) } }),
      );

      // the flushed event is ingested, so it is no longer heartbeated
      jest.clearAllMocks();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(mockAmplitude.track).not.toHaveBeenCalled();
    });

    it('should not send a stop event when playback already stopped', async () => {
      const { capture, observer } = startCapture();
      observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();
      observer.emitStateChange(playingState, { ...playingState, playbackState: 'paused' });
      await flushHeartbeat();
      jest.clearAllMocks();

      capture.stop();
      await flushHeartbeat();

      expect(mockAmplitude.track).not.toHaveBeenCalled();
    });

    it('should be safe to call multiple times', async () => {
      const { capture, observer } = startCapture();
      observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      capture.stop();
      capture.stop();
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
    });

    it('should keep delayed events queued by other captures on the same client', async () => {
      const first = startCapture({ video: 'first' });
      const second = startCapture({ video: 'second' });
      first.observer.emitStateChange(idleState, playingState);
      second.observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();

      first.capture.stop();
      await flushHeartbeat();
      jest.clearAllMocks();

      // the second capture's delayed stop event is still heartbeated
      await jest.advanceTimersByTimeAsync(60_000);
      expect(mockAmplitude.track).toHaveBeenCalledTimes(1);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Content Stopped',
        expect.objectContaining({ video: 'second', stop_reason: 'timeout' }),
        expect.objectContaining({ delay: { id: expect.any(String), timeout: 3_600_000 } }),
      );
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
        delivery_mode: 'video',
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
        delivery_mode: 'video',
      });
    });

    it('should keep vendor metadata and drop empty or recomputed fields', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStartEventProperties({
          playbackState: 'playing',
          lastEvent: {
            duration: 10,
            start_time: 2,
            last_position: 5,
            percent_completed: 50,
            stop_reason: 'paused',
            mux_playback_id: 'playback-id',
            mux_video_id: 'video-id',
            mux_video_title: 'video-title',
            mux_session_id: null,
            video_id: undefined,
          },
          position: 5,
        }),
      ).toEqual({
        duration: 10,
        start_time: 2,
        position: 5,
        delivery_mode: 'video',
        mux_playback_id: 'playback-id',
        mux_video_id: 'video-id',
        mux_video_title: 'video-title',
      });
    });

    it('should set delivery_mode to audio for an audio element', () => {
      const capture = new VideoCapture(mockAmplitude).withVideoElement(document.createElement('audio'));
      expect(
        capture.parseStartEventProperties({
          playbackState: 'playing',
        }),
      ).toEqual({
        duration: 0,
        start_time: 0,
        position: 0,
        delivery_mode: 'audio',
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
        delivery_mode: 'video',
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
        percent_completed: 0,
        delivery_mode: 'video',
      });
    });

    it('should keep vendor metadata without inheriting the player event percent_completed or stop_reason', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'paused',
          lastEvent: {
            duration: 10,
            start_time: 2,
            last_position: 5,
            percent_completed: 20,
            stop_reason: 'paused',
            mux_playback_id: 'playback-id',
          },
          position: 5,
          watchTime: 30,
        }),
      ).toEqual({
        duration: 10,
        start_time: 2,
        position: 5,
        watch_duration: 30,
        percent_completed: 50,
        delivery_mode: 'video',
        mux_playback_id: 'playback-id',
      });
    });

    it('should report 0 percent_completed when duration is 0', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'paused',
          lastEvent: { duration: 0, last_position: 0 },
          position: 5,
        }).percent_completed,
      ).toBe(0);
    });

    it('should report 0 percent_completed when duration is Infinity (live)', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'paused',
          lastEvent: { duration: Infinity, last_position: 30 },
          position: 30,
        }).percent_completed,
      ).toBe(0);
    });

    it('should clamp percent_completed to 100 when position exceeds duration', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'ended',
          lastEvent: { duration: 10, last_position: 12 },
          position: 12,
        }).percent_completed,
      ).toBe(100);
    });
  });
});
