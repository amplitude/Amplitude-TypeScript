import { BrowserConfig, EnrichmentPlugin, Event, PluginType } from '@amplitude/analytics-types';
import { track } from '../../../../packages/analytics-browser/src';

const YoutubePlayerState = {
    BUFFERING: 3,
    CUED: 5,
    ENDED: 0,
    PAUSED: 2,
    PLAYING: 1,
    UNSTARTED: -1
}

export class YouTubeAnalytics implements EnrichmentPlugin {
  name = 'youtube-analytics';
  type = PluginType.ENRICHMENT as const;
  currentId = 100;
  config!: BrowserConfig;

  constructor(player: any, amplitude: any) {
      console.log(player);
      player.addEventListener('onStateChange', this.onVideoStateChange);
      player.addEventListener('onPlaybackQualityChange', this.onPlaybackQualityChange)
      player.addEventListener('onPlaybackRateChange', this.onPlaybackRateChange)

  }

  onVideoStateChange(youtubeEvent: any) {
    console.log(youtubeEvent)
    const player = youtubeEvent.target;
    var eventProperties = {
        currentTime: player.getCurrentTime(),
        duration: player.getDuration(),
        mediaReferenceTime: player.getMediaReferenceTime(),
        quality: player.getPlaybackQuality(),
        rate: player.getPlaybackRate(),
        url: player.getVideoUrl(),
        volume: player.getVolume()
    }
    console.log(eventProperties);
    switch (youtubeEvent.data) {
        case YoutubePlayerState.UNSTARTED:
            amplitude.track("Video UNSTARTED", eventProperties);
            break;
        case YoutubePlayerState.ENDED:
            amplitude.track("Video Completed", eventProperties);
            break;
        case YoutubePlayerState.PLAYING:
            amplitude.track("Video Resumed", eventProperties);
            break;
        case YoutubePlayerState.PAUSED:
            amplitude.track("Video Paused", eventProperties);
            break;
        case YoutubePlayerState.BUFFERING:
            amplitude.track("Video Beffering", eventProperties);
            break;
        case YoutubePlayerState.CUED:
            amplitude.track("Video Cued", eventProperties);
            break;
    }

  }

  onPlaybackQualityChange(youtubeEvent: any) {
    console.log(youtubeEvent)
    const player = youtubeEvent.target;
    var eventProperties = {
        currentTime: player.getCurrentTime(),
        duration: player.getDuration(),
        mediaReferenceTime: player.getMediaReferenceTime(),
        quality: youtubeEvent.data,
        rate: player.getPlaybackRate(),
        url: player.getVideoUrl(),
        volume: player.getVolume(),
    }
    amplitude.track("Video Quality Updated", eventProperties);
  }

  onPlaybackRateChange(youtubeEvent: any) {
    console.log(youtubeEvent)
    const player = youtubeEvent.target;
    var eventProperties = {
        currentTime: player.getCurrentTime(),
        duration: player.getDuration(),
        mediaReferenceTime: player.getMediaReferenceTime(),
        quality: player.getPlaybackQuality(),
        rate: youtubeEvent.data,
        url: player.getVideoUrl(),
        volume: player.getVolume(),
    }
    amplitude.track("Video Playback Rate Updated", eventProperties);
  }
  
  /**
   * setup() is called on plugin installation
   */
  setup(config: BrowserConfig): Promise<undefined> {
     this.config = config;
     return Promise.resolve(undefined);
  }
   
  /**
   * execute() is called on each event instrumented
   */
  execute(event: Event): Promise<Event> {
    // no-op for now
    return new Promise((resolve) => {
        return resolve(event);
    });
  }
}
