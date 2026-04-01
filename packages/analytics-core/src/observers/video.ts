import { trackHtmlVideo, trackMuxEmbeddedVideo } from '../video-analytics/track-video';
import type { VideoHandler, VideoEvent, MuxEmbeddedPlayer, MuxElement } from '../video-analytics/types';

type VideoState = 'playing' | 'paused' | 'ended' | 'error';

type Vendor = 'mux'; // | 'vimeo' | 'youtube' | 'other'

type State = {
  videoState: VideoState;
  errorMessage?: string;
  lastEvent?: VideoEvent;
};

type VideoObserverParams = {
  videoEl: HTMLVideoElement | MuxEmbeddedPlayer | MuxElement;
  onStateChange: (previousState: State, nextState: State) => void;
  vendor?: Vendor;
  isEmbedded?: boolean;
  customMetadata?: Record<string, string | number | boolean>;
};

export class VideoObserver {
  private state: State = {
    videoState: 'paused',
  };

  private untrack: () => void;
  private onStateChange: (previousState: State, nextState: State) => void;
  private handler: VideoHandler = {
    onPlay: (evt: VideoEvent) => {
      this.updateState('playing', evt);
    },
    onPause: (evt: VideoEvent) => {
      this.updateState('paused', evt);
    },
    onEnded: (evt: VideoEvent) => {
      this.updateState('ended', evt);
    },
    onError: () => {
      this.updateState('error');
    },
  };

  constructor({ videoEl, onStateChange, vendor, isEmbedded }: VideoObserverParams) {
    if (isEmbedded) {
      // TODO: support embedded iFrame video with no Vendor
      this.untrack = trackMuxEmbeddedVideo(videoEl as MuxEmbeddedPlayer, this.handler);
    } else {
      this.untrack = trackHtmlVideo(videoEl as HTMLVideoElement, this.handler, vendor);
    }
    this.onStateChange = onStateChange;
  }

  private updateState(videoState: VideoState, event?: VideoEvent) {
    const previousState = this.state;
    const nextState = {
      videoState,
      lastEvent: event,
    };
    this.onStateChange(previousState, nextState);
    this.state = nextState;
  }

  destroy() {
    this.untrack();
  }
}
