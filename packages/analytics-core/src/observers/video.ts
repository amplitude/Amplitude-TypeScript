import { trackHtmlVideo, trackEmbeddedVideo } from '../video-analytics/track-video';
import type { VideoHandler, VideoEvent, EmbeddedVideoPlayer, MuxElement } from '../video-analytics/types';

type PlaybackState = 'playing' | 'paused' | 'ended' | 'error';

export type Vendor = 'mux'; // | 'vimeo' | 'youtube' | 'other'

export type State = {
  playbackState: PlaybackState;
  errorMessage?: string;
  lastEvent?: VideoEvent;
};

export type VideoObserverParams = {
  videoEl: HTMLVideoElement | EmbeddedVideoPlayer | MuxElement;
  onStateChange: (previousState: State, nextState: State) => void;
  vendor?: Vendor;
  isEmbedded?: boolean;
};

export class VideoObserver {
  private state: State = {
    playbackState: 'paused',
  };

  private untrack: () => void;
  private onStateChange: (previousState: State, nextState: State) => void;
  private handler: VideoHandler = {
    onPlay: (evt: VideoEvent) => {
      this.updatePlaybackState('playing', evt);
    },
    onPause: (evt: VideoEvent) => {
      this.updatePlaybackState('paused', evt);
    },
    onEnded: (evt: VideoEvent) => {
      this.updatePlaybackState('ended', evt);
    },
    onError: (errorMessage: string) => {
      this.updateStateWithError(errorMessage);
    },
  };

  constructor({ videoEl, onStateChange, vendor, isEmbedded }: VideoObserverParams) {
    this.onStateChange = onStateChange;
    if (isEmbedded) {
      this.untrack = trackEmbeddedVideo(videoEl as EmbeddedVideoPlayer, this.handler, vendor);
    } else {
      this.untrack = trackHtmlVideo(videoEl as HTMLVideoElement, this.handler, vendor);
    }
  }

  private stateChangeHandler(previousState: State, nextState: State) {
    try {
      this.onStateChange(previousState, nextState);
    } catch (_error) {
      // Swallow callback errors to keep observer state consistent.
    }
  }

  private updateStateWithError(error: string) {
    const previousState = this.state;
    const nextState: State = {
      playbackState: 'error',
      errorMessage: error,
      lastEvent: undefined,
    };
    this.state = nextState;
    this.stateChangeHandler(previousState, nextState);
  }

  private updatePlaybackState(playbackState: PlaybackState, event?: VideoEvent) {
    const previousState = this.state;
    const nextState: State = {
      playbackState,
      lastEvent: event,
    };
    this.state = nextState;
    this.stateChangeHandler(previousState, nextState);
  }

  destroy() {
    this.untrack();
  }
}
