import { trackHtmlVideo, trackEmbeddedVideo } from '../video-analytics/track-video';
import type {
  VideoHandler,
  VideoEvent,
  EmbeddedVideoPlayer,
  MuxElement,
  Vendor,
  TimeUpdateEvent,
} from '../video-analytics/types';

export type { Vendor };

type PlaybackState = 'playing' | 'paused' | 'ended' | 'error' | 'seeking' | 'waiting';

export type State = {
  playbackState: PlaybackState;
  errorMessage?: string;
  lastEvent?: VideoEvent;
  watchTime?: number;
  position?: number | null;
  isSeeking?: boolean;
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

  private waitingInterval: ReturnType<typeof setTimeout> | null = null;
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
    onSeeking: () => {
      const nextState: State = {
        ...this.state,
        isSeeking: true,
      };
      this.updateState(nextState);
    },
    onSeeked: (event: VideoEvent) => {
      const nextState: State = {
        ...this.state,
        isSeeking: false,
        position: event.last_position,
      };
      this.updateState(nextState);
    },
    onError: (errorMessage: string) => {
      this.updateStateWithError(errorMessage);
    },
    onTimeUpdate: (evt: TimeUpdateEvent) => {
      this.updateTime(evt);
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
      ...previousState,
      playbackState: 'error',
      errorMessage: error,
    };
    this.updateState(nextState);
  }

  private updatePlaybackState(playbackState: PlaybackState, event: VideoEvent) {
    const nextState: State = {
      ...this.state,
      playbackState,
      lastEvent: event,
      position: event.last_position,
    };
    this.updateState(nextState);

    if (playbackState === 'playing') {
      // if it's in a playing state, but the playhead is not moving,
      // then transition playback from 'playing' to 'waiting'
      // (the "waiting" listener isn't reliable, so this is a fallback)
      this.waitingInterval && clearInterval(this.waitingInterval);
      let prevPosition: number | null | undefined = this.state.position;
      this.waitingInterval = setInterval(() => {
        if (typeof prevPosition === 'number' && prevPosition === this.state.position) {
          this.updatePlaybackState('waiting', event);
        }
        prevPosition = this.state.position;
      }, 1_000);
    } else {
      this.waitingInterval && clearInterval(this.waitingInterval);
    }
  }

  private updateTime(event: TimeUpdateEvent) {
    const lastVideoEvent = this.state.lastEvent;
    const isWaiting = this.state.playbackState === 'waiting';
    const isPlaying = this.state.playbackState === 'playing';
    if (!lastVideoEvent || (!isPlaying && !isWaiting)) {
      return;
    }
    const isSeeking = event.isSeeking || this.state.isSeeking;
    const lastPosition = this.state.position ?? 0;
    const nextPosition = event.position;
    if (isSeeking) {
      this.state = {
        ...this.state,
        position: nextPosition,
      };
      return;
    }
    const timeDelta = nextPosition - lastPosition;
    const nextState: State = {
      ...this.state,
      playbackState: 'playing',
      position: nextPosition,
      watchTime: (this.state.watchTime ?? 0) + timeDelta,
    };
    this.updateState(nextState);
  }

  private updateState(nextState: State) {
    const previousState = this.state;
    this.state = nextState;
    this.stateChangeHandler(previousState, nextState);
  }

  destroy() {
    this.untrack();
  }
}
