/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return -- jest expectations */
import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { EmbeddedVideoPlayer, VideoState } from '@amplitude/analytics-core';
import { VideoCapture, trackVideo } from '../../src/video-capture/video-capture';
import { currentVideoObserver, resetMockVideoObserver } from './mock-video-observer';

const mockGetHeartbeatInstance = jest.fn();
const mockGetGlobalScope = jest.fn();

jest.mock('@amplitude/analytics-core', () => {
  const actual = jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core');
  const { MockVideoObserver } = jest.requireActual<typeof import('./mock-video-observer')>('./mock-video-observer');
  return {
    ...actual,
    VideoObserver: MockVideoObserver,
    getHeartbeatInstance: (client: Parameters<typeof actual.getHeartbeatInstance>[0]) =>
      mockGetHeartbeatInstance(client),
    getGlobalScope: () => mockGetGlobalScope(),
  };
});

describe('VideoCapture', () => {
  let mockAmplitude: AmplitudeBrowser;

  /** Flush resetHeartbeat's setTimeout(0) macrotask before asserting track calls. */
  async function flushHeartbeat() {
    await jest.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    resetMockVideoObserver();
    mockGetHeartbeatInstance.mockImplementation(
      jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core').getHeartbeatInstance,
    );
    mockGetGlobalScope.mockImplementation(
      jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core').getGlobalScope,
    );
    mockAmplitude = {
      track: jest.fn().mockReturnValue({ promise: Promise.resolve({ event: {}, code: 200, message: 'success' }) }),
      flush: jest.fn(),
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
      let nextState: VideoState = { playbackState: 'playing', lastEvent: { duration: 10, position: undefined } };
      currentVideoObserver!.emitStateChange(previousState, nextState);
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Stream Started',
        {
          '[Streaming] Duration Sec': 10,
          hello: 'world',
          number: 123,
          '[Streaming] Play ID': expect.any(String),
          '[Streaming] Position Sec': 0,
          '[Streaming] Play Time Total Sec': 0,
          '[Streaming] Media Type': 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        2,
        '[Amplitude] Stream Stopped',
        {
          '[Streaming] Duration Sec': 10,
          hello: 'world',
          number: 123,
          '[Streaming] Play ID': expect.any(String),
          '[Streaming] Position Sec': 0,
          '[Streaming] Play Time Sec': 0,
          '[Streaming] Play Time Total Sec': 0,
          '[Streaming] Percent Completed': 0,
          '[Streaming] Stop Reason': 'timeout',
          '[Streaming] Media Type': 'video',
        },
        {
          delay: { id: expect.any(String), timeout: 3_600_000 },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );

      // mock a pause event
      previousState = nextState;
      nextState = { playbackState: 'paused', lastEvent: { duration: 10, position: 5 }, position: 5 };
      currentVideoObserver!.emitStateChange(previousState, nextState);
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Stream Stopped',
        {
          '[Streaming] Duration Sec': 10,
          hello: 'world',
          number: 123,
          '[Streaming] Play ID': expect.any(String),
          '[Streaming] Position Sec': 5,
          '[Streaming] Play Time Sec': 0,
          '[Streaming] Play Time Total Sec': 0,
          '[Streaming] Percent Completed': 50,
          '[Streaming] Stop Reason': 'paused',
          '[Streaming] Media Type': 'video',
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
      nextState = { playbackState: 'playing', lastEvent: { duration: 10, position: undefined } };
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
        position: 0,
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
        '[Amplitude] Stream Started',
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
          lastEvent: { ...muxLastEvent, position: 5, percent_completed: 20, stop_reason: 'paused' },
          position: 5,
        },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          mux_playback_id: 'playback-id',
          mux_video_id: 'video-id',
          mux_video_title: 'video-title',
          '[Streaming] Stop Reason': 'paused',
          '[Streaming] Percent Completed': 50,
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
        { playbackState: 'playing', lastEvent: { duration: 10, position: undefined } },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Stream Started',
        {
          '[Streaming] Duration Sec': 10,
          hello: 'world',
          number: 123,
          '[Streaming] Play ID': expect.any(String),
          '[Streaming] Position Sec': 0,
          '[Streaming] Play Time Total Sec': 0,
          '[Streaming] Stream Session ID': expect.any(String),
          '[Streaming] Media Type': 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, position: 5 }, position: 5 },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Stream Stopped',
        {
          '[Streaming] Duration Sec': 10,
          hello: 'world',
          number: 123,
          '[Streaming] Play ID': expect.any(String),
          '[Streaming] Position Sec': 5,
          '[Streaming] Play Time Sec': 0,
          '[Streaming] Play Time Total Sec': 0,
          '[Streaming] Percent Completed': 50,
          '[Streaming] Stop Reason': 'paused',
          '[Streaming] Stream Session ID': expect.any(String),
          '[Streaming] Media Type': 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );
      typeof stopVideoCapture === 'function' && stopVideoCapture();
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: { duration: 10, position: 5 } },
        { playbackState: 'playing', lastEvent: { duration: 10, position: undefined } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);
    });

    it('should start a new stream session when playback restarts after ending', async () => {
      trackVideo(mockAmplitude, document.createElement('video'));
      const endedState: VideoState = {
        playbackState: 'ended',
        lastEvent: { duration: 10, position: 10, stop_reason: 'ended' },
        position: 10,
      };

      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, position: 0 } },
      );
      await flushHeartbeat();
      const firstSessionId = (mockAmplitude.track as jest.Mock).mock.calls[0][1][
        '[Streaming] Stream Session ID'
      ] as string;

      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, position: 0 } },
        endedState,
      );
      await flushHeartbeat();

      currentVideoObserver!.emitStateChange(endedState, {
        playbackState: 'playing',
        lastEvent: { duration: 10, position: 0 },
      });
      await flushHeartbeat();

      const restartCall = (mockAmplitude.track as jest.Mock).mock.calls.find(
        (call) =>
          call[0] === '[Amplitude] Stream Started' && call[1]['[Streaming] Stream Session ID'] !== firstSessionId,
      );
      expect(restartCall?.[1]['[Streaming] Stream Session ID']).toEqual(expect.any(String));
      expect(restartCall?.[1]['[Streaming] Stream Session ID']).not.toBe(firstSessionId);
    });

    it('should measure play_time per play and play_time_total per stream session', async () => {
      trackVideo(mockAmplitude, document.createElement('video'));
      const observer = currentVideoObserver!;

      const playing = (watchTime: number): VideoState => ({
        playbackState: 'playing',
        lastEvent: { duration: 20, position: watchTime },
        position: watchTime,
        watchTime,
      });
      const paused = (watchTime: number): VideoState => ({
        playbackState: 'paused',
        lastEvent: { duration: 20, position: watchTime, stop_reason: 'paused' },
        position: watchTime,
        watchTime,
      });

      observer.emitStateChange({ playbackState: 'paused', lastEvent: undefined }, playing(0));
      await flushHeartbeat();
      observer.emitStateChange(playing(0), playing(5));
      observer.emitStateChange(playing(5), paused(5));
      await flushHeartbeat();

      const firstPlayId = (mockAmplitude.track as jest.Mock).mock.calls[0][1]['[Streaming] Play ID'] as string;
      const sessionId = (mockAmplitude.track as jest.Mock).mock.calls[0][1]['[Streaming] Stream Session ID'] as string;
      expect(mockAmplitude.track).toHaveBeenLastCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Play ID': firstPlayId,
          '[Streaming] Stream Session ID': sessionId,
          '[Streaming] Play Time Sec': 5,
          '[Streaming] Play Time Total Sec': 5,
          '[Streaming] Stop Reason': 'paused',
        }),
        expect.any(Object),
      );

      jest.clearAllMocks();
      observer.emitStateChange(paused(5), playing(5));
      await flushHeartbeat();
      const secondPlayId = (mockAmplitude.track as jest.Mock).mock.calls[0][1]['[Streaming] Play ID'] as string;
      expect(secondPlayId).not.toBe(firstPlayId);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Stream Started',
        expect.objectContaining({
          '[Streaming] Play ID': secondPlayId,
          '[Streaming] Stream Session ID': sessionId,
          '[Streaming] Play Time Total Sec': 5,
        }),
        expect.any(Object),
      );
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Play ID': secondPlayId,
          '[Streaming] Stream Session ID': sessionId,
          '[Streaming] Play Time Sec': 0,
          '[Streaming] Play Time Total Sec': 5,
          '[Streaming] Stop Reason': 'timeout',
        }),
        expect.any(Object),
      );

      observer.emitStateChange(playing(5), playing(8));
      jest.clearAllMocks();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Play ID': secondPlayId,
          '[Streaming] Stream Session ID': sessionId,
          '[Streaming] Play Time Sec': 3,
          '[Streaming] Play Time Total Sec': 8,
          '[Streaming] Stop Reason': 'timeout',
        }),
        expect.objectContaining({ delay: { id: expect.any(String), timeout: 3_600_000 } }),
      );

      const ended: VideoState = {
        playbackState: 'ended',
        lastEvent: { duration: 20, position: 8, stop_reason: 'ended' },
        position: 8,
        watchTime: 8,
      };
      observer.emitStateChange(playing(8), ended);
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenLastCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Play ID': secondPlayId,
          '[Streaming] Stream Session ID': sessionId,
          '[Streaming] Play Time Sec': 3,
          '[Streaming] Play Time Total Sec': 8,
          '[Streaming] Stop Reason': 'ended',
        }),
        expect.any(Object),
      );

      jest.clearAllMocks();
      observer.emitStateChange(ended, playing(8));
      await flushHeartbeat();
      const restarted = (mockAmplitude.track as jest.Mock).mock.calls[0][1] as {
        '[Streaming] Play ID': string;
        '[Streaming] Stream Session ID': string;
      };
      expect(restarted['[Streaming] Play ID']).not.toBe(secondPlayId);
      expect(restarted['[Streaming] Stream Session ID']).not.toBe(sessionId);

      observer.emitStateChange(playing(8), playing(12));
      observer.emitStateChange(playing(12), paused(12));
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenLastCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Play ID': restarted['[Streaming] Play ID'],
          '[Streaming] Stream Session ID': restarted['[Streaming] Stream Session ID'],
          '[Streaming] Play Time Sec': 4,
          '[Streaming] Play Time Total Sec': 4,
          '[Streaming] Stop Reason': 'paused',
        }),
        expect.any(Object),
      );
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
        { playbackState: 'playing', lastEvent: { duration: 10, position: undefined } },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Stream Started',
        {
          '[Streaming] Duration Sec': 10,
          '[Streaming] Play ID': expect.any(String),
          '[Streaming] Position Sec': 0,
          '[Streaming] Play Time Total Sec': 0,
          '[Streaming] Stream Session ID': expect.any(String),
          '[Streaming] Media Type': 'video',
        },
        {
          delay: { id: expect.any(String) },
          insert_id: expect.any(String),
          time: expect.any(Number),
        },
      );
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, position: 5 }, position: 5 },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Stream Stopped',
        {
          '[Streaming] Duration Sec': 10,
          '[Streaming] Play ID': expect.any(String),
          '[Streaming] Position Sec': 5,
          '[Streaming] Play Time Sec': 0,
          '[Streaming] Play Time Total Sec': 0,
          '[Streaming] Percent Completed': 50,
          '[Streaming] Stop Reason': 'paused',
          '[Streaming] Stream Session ID': expect.any(String),
          '[Streaming] Media Type': 'video',
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

    it('should set media_type to audio for an HTML audio element', async () => {
      const stopVideoCapture = trackVideo(mockAmplitude, document.createElement('audio'));
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: undefined },
        { playbackState: 'playing', lastEvent: { duration: 10, position: undefined } },
      );
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Stream Started',
        expect.objectContaining({ '[Streaming] Media Type': 'audio' }),
        expect.any(Object),
      );
      typeof stopVideoCapture === 'function' && stopVideoCapture();
    });
  });

  describe('buffering (waiting state)', () => {
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, position: 0 },
      position: 0,
      watchTime: 5,
    };
    const waitingState: VideoState = {
      playbackState: 'waiting',
      lastEvent: { duration: 10, position: 5 },
      position: 5,
      watchTime: 5,
    };
    const pausedState: VideoState = {
      playbackState: 'paused',
      lastEvent: { duration: 10, position: 5 },
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

      const playId = (mockAmplitude.track as jest.Mock).mock.calls[0][1]['[Streaming] Play ID'];

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
      expect(
        (mockAmplitude.track as jest.Mock).mock.calls.every((call) => call[1]['[Streaming] Play ID'] === playId),
      ).toBe(true);

      currentVideoObserver!.emitStateChange({ ...playingState, position: 6, watchTime: 6 }, pausedState);
      await flushHeartbeat();
      expect(mockAmplitude.track).toHaveBeenCalledTimes(3);
      expect(mockAmplitude.track).toHaveBeenNthCalledWith(
        3,
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Play ID': playId,
          '[Streaming] Stop Reason': 'paused',
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
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Stop Reason': 'error',
          '[Streaming] Error Message': 'Media element error (code 2): network',
          '[Streaming] Position Sec': 5,
          '[Streaming] Play Time Sec': 5,
          '[Streaming] Play Time Total Sec': 5,
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
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Position Sec': 8,
          '[Streaming] Play Time Sec': 8,
          '[Streaming] Play Time Total Sec': 8,
          '[Streaming] Percent Completed': 80,
          '[Streaming] Stop Reason': 'timeout',
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
      lastEvent: { duration: 10, position: 2 },
      position: 2,
      watchTime: 0,
    };
    const pausedState: VideoState = {
      playbackState: 'paused',
      lastEvent: { duration: 10, position: 7 },
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
        '[Amplitude] Stream Stopped',
        expect.objectContaining({ '[Streaming] Position Sec': 7, '[Streaming] Stop Reason': 'paused' }),
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
        lastEvent: { duration: 10, position: 5 },
        position: 5,
        watchTime: 3,
      });
      jest.clearAllMocks();

      await jest.advanceTimersByTimeAsync(60_000);
      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({ '[Streaming] Position Sec': 5, '[Streaming] Stop Reason': 'timeout' }),
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
        lastEvent: { duration: 10, position: 7 },
        position: 7,
        watchTime: 5,
      };
      observer.emitStateChange(pausedState, replayState);
      await flushHeartbeat();
      observer.emitStateChange(replayState, {
        playbackState: 'ended',
        lastEvent: { duration: 10, position: 10 },
        position: 10,
        watchTime: 8,
      });
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenLastCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({ '[Streaming] Position Sec': 10, '[Streaming] Stop Reason': 'ended' }),
        expect.any(Object),
      );
    });
  });

  describe('stops capturing when track fails', () => {
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, position: undefined },
    };
    const pausedState: VideoState = { playbackState: 'paused', lastEvent: undefined };

    /** The "[Amplitude] Stream Stopped" event flushed by stop(). */
    const untrackedStopEvent = expect.objectContaining({
      event_type: '[Amplitude] Stream Stopped',
      event_properties: expect.objectContaining({ '[Streaming] Stop Reason': 'untracked' }),
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
        beforePageHide: jest.fn().mockReturnValue(jest.fn()),
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
        lastEvent: { duration: 10, position: 5 },
        position: 5,
      });
      await jest.advanceTimersByTimeAsync(0);

      // the stop event was already flushed with stop_reason "paused", so tearing down
      // the capture must not send it a second time
      expect(trackNoDelay).toHaveBeenCalledTimes(2);
      expect(trackNoDelay).not.toHaveBeenCalledWith(untrackedStopEvent);
    });
  });

  describe('page lifecycle', () => {
    const idleState: VideoState = { playbackState: 'paused', lastEvent: undefined };
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, position: 0 },
      position: 4,
      watchTime: 4,
    };

    function dispatchPageHide(persisted: boolean) {
      const event = new Event('pagehide');
      Object.defineProperty(event, 'persisted', { value: persisted });
      window.dispatchEvent(event);
    }

    function startCapture(extraEventProperties: Record<string, string> = {}) {
      const capture = new VideoCapture(mockAmplitude)
        .withVideoElement(document.createElement('video'))
        .withExtraEventProperties(extraEventProperties)
        .captureVideoStarted()
        .captureVideoStopped()
        .start();
      return { capture, observer: currentVideoObserver! };
    }

    it('should flush a stream stopped event when the page is not persisted', async () => {
      const { observer } = startCapture();
      observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushHeartbeat();

      expect(mockAmplitude.track).toHaveBeenCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Stop Reason': 'ended',
          '[Streaming] Position Sec': 4,
          '[Streaming] Play Time Sec': 4,
          '[Streaming] Play Time Total Sec': 4,
        }),
        expect.objectContaining({ delay: { id: expect.any(String) } }),
      );
    });

    it('should end a capture that starts after the heartbeat is already listening', async () => {
      const first = startCapture({ video: 'first' });
      first.observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();

      // the shared heartbeat registered pagehide while tracking the first play
      const second = startCapture({ video: 'second' });
      second.observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushHeartbeat();

      const stopped = (mockAmplitude.track as jest.Mock).mock.calls.filter(
        (call) => call[0] === '[Amplitude] Stream Stopped',
      );
      expect(stopped).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([
            '[Amplitude] Stream Stopped',
            expect.objectContaining({ video: 'first', '[Streaming] Stop Reason': 'ended' }),
          ]),
          expect.arrayContaining([
            '[Amplitude] Stream Stopped',
            expect.objectContaining({ video: 'second', '[Streaming] Stop Reason': 'ended' }),
          ]),
        ]),
      );
      expect(stopped.every((call) => call[1]['[Streaming] Stop Reason'] === 'ended')).toBe(true);
    });

    it('should not stop when the page is persisted in the back/forward cache', async () => {
      const { observer } = startCapture();
      observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      dispatchPageHide(true);
      await flushHeartbeat();

      expect(mockAmplitude.track).not.toHaveBeenCalled();
    });

    it('should stop listening to page lifecycle events once stopped', async () => {
      const { capture, observer } = startCapture();
      observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();
      capture.stop();
      await flushHeartbeat();
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushHeartbeat();

      expect(mockAmplitude.track).not.toHaveBeenCalled();
      expect(mockAmplitude.flush).not.toHaveBeenCalled();
    });

    it('should not listen to page lifecycle events when there is no global scope', async () => {
      mockGetGlobalScope.mockReturnValue(undefined);
      const { observer } = startCapture();
      observer.emitStateChange(idleState, playingState);
      await flushHeartbeat();
      jest.clearAllMocks();

      dispatchPageHide(false);
      await flushHeartbeat();

      // the heartbeat may still send its queued delayed stop event, but the capture
      // itself never ends the play session
      expect(mockAmplitude.track).not.toHaveBeenCalledWith(
        '[Amplitude] Stream Stopped',
        expect.objectContaining({ '[Streaming] Stop Reason': 'ended' }),
        expect.anything(),
      );
    });
  });

  describe('stop()', () => {
    const idleState: VideoState = { playbackState: 'paused', lastEvent: undefined };
    const playingState: VideoState = {
      playbackState: 'playing',
      lastEvent: { duration: 10, position: 0 },
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
        '[Amplitude] Stream Stopped',
        expect.objectContaining({
          '[Streaming] Stop Reason': 'untracked',
          '[Streaming] Position Sec': 4,
          '[Streaming] Play Time Sec': 4,
          '[Streaming] Play Time Total Sec': 4,
        }),
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
        '[Amplitude] Stream Stopped',
        expect.objectContaining({ video: 'second', '[Streaming] Stop Reason': 'timeout' }),
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
          lastEvent: { duration: 10, position: 5 },
          position: 5,
        }),
      ).toEqual({
        duration: 10,
        position: 5,
        media_type: 'video',
        play_time_total: 0,
      });
    });

    it('should parse start event properties with empty lastEvent', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStartEventProperties({
          playbackState: 'playing',
        }),
      ).toEqual({
        duration: undefined,
        position: 0,
        media_type: 'video',
        play_time_total: 0,
      });
    });

    it('should keep vendor metadata and drop empty or recomputed fields', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStartEventProperties({
          playbackState: 'playing',
          lastEvent: {
            duration: 10,
            position: 5,
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
        position: 5,
        media_type: 'video',
        play_time_total: 0,
        mux_playback_id: 'playback-id',
        mux_video_id: 'video-id',
        mux_video_title: 'video-title',
      });
    });

    it('should set media_type to audio for an audio element', () => {
      const capture = new VideoCapture(mockAmplitude).withVideoElement(document.createElement('audio'));
      expect(
        capture.parseStartEventProperties({
          playbackState: 'playing',
        }),
      ).toEqual({
        duration: undefined,
        position: 0,
        media_type: 'audio',
        play_time_total: 0,
      });
    });
  });

  describe('parseStopEventProperties()', () => {
    it('should parse stop event properties', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'paused',
          lastEvent: { duration: 10, position: 5 },
          position: 5,
          watchTime: 30,
        }),
      ).toEqual({
        duration: 10,
        position: 5,
        play_time: 30,
        play_time_total: 30,
        percent_completed: 50,
        media_type: 'video',
      });
    });

    it('should parse stop event properties with empty lastEvent', () => {
      const capture = new VideoCapture(mockAmplitude);
      const properties = capture.parseStopEventProperties({
        playbackState: 'paused',
      });
      expect(properties).toEqual({
        duration: undefined,
        position: 0,
        play_time: 0,
        play_time_total: 0,
        percent_completed: 0,
        media_type: 'video',
      });
    });

    it('should keep vendor metadata without inheriting the player event percent_completed or stop_reason', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'paused',
          lastEvent: {
            duration: 10,
            position: 5,
            percent_completed: 20,
            stop_reason: 'paused',
            mux_playback_id: 'playback-id',
          },
          position: 5,
          watchTime: 30,
        }),
      ).toEqual({
        duration: 10,
        position: 5,
        play_time: 30,
        play_time_total: 30,
        percent_completed: 50,
        media_type: 'video',
        mux_playback_id: 'playback-id',
      });
    });

    it('should report 0 percent_completed when duration is 0', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'paused',
          lastEvent: { duration: undefined, position: 0 },
          position: 5,
        }).percent_completed,
      ).toBe(0);
    });

    it('should report 0 percent_completed when duration is Infinity (live)', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'paused',
          lastEvent: { duration: Infinity, position: 30 },
          position: 30,
        }).percent_completed,
      ).toBe(0);
    });

    it('should clamp percent_completed to 100 when position exceeds duration', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(
        capture.parseStopEventProperties({
          playbackState: 'ended',
          lastEvent: { duration: 10, position: 12 },
          position: 12,
        }).percent_completed,
      ).toBe(100);
    });
  });

  describe('toAnalyticsEventProperties()', () => {
    it('should return an empty object when event properties are missing', () => {
      const capture = new VideoCapture(mockAmplitude);
      expect(capture.toAnalyticsEventProperties(undefined)).toEqual({});
    });
  });
});
