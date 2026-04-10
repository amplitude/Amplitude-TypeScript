/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/unbound-method -- jest expectations */
import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { EmbeddedVideoPlayer, VideoState } from '@amplitude/analytics-core';
import { VideoCapture, trackVideo } from '../../src/video-capture/video-capture';
import { currentVideoObserver, resetMockVideoObserver } from './mock-video-observer';

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
      track: jest.fn(),
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
      expect(mockAmplitude.track).toHaveBeenCalledWith('Video Content Started', {
        duration: 10,
        hello: 'world',
        number: 123,
      });

      // mock a pause event
      previousState = nextState;
      nextState = { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 } };
      currentVideoObserver!.emitStateChange(previousState, nextState);
      expect(mockAmplitude.track).toHaveBeenCalledWith('Video Content Stopped', {
        duration: 10,
        last_position: 5,
        hello: 'world',
        number: 123,
      });
      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);

      // stop the capture
      capture.stop();

      // mock another play event
      previousState = nextState;
      nextState = { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } };
      currentVideoObserver!.emitStateChange(previousState, nextState);

      // assert that the track method was not called again
      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);
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
      expect(mockAmplitude.track).toHaveBeenCalledWith('Video Content Started', {
        duration: 10,
        hello: 'world',
        number: 123,
      });
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledWith('Video Content Stopped', {
        duration: 10,
        last_position: 5,
        hello: 'world',
        number: 123,
      });
      stopVideoCapture();
      currentVideoObserver!.emitStateChange(
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 } },
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledTimes(2);
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
      expect(mockAmplitude.track).toHaveBeenCalledWith('Video Content Started', {
        duration: 10,
      });
      currentVideoObserver!.emitStateChange(
        { playbackState: 'playing', lastEvent: { duration: 10, last_position: undefined } },
        { playbackState: 'paused', lastEvent: { duration: 10, last_position: 5 } },
      );
      expect(mockAmplitude.track).toHaveBeenCalledWith('Video Content Stopped', {
        duration: 10,
        last_position: 5,
      });
      stopVideoCapture();
    });
  });
});
