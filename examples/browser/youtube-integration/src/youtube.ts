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

const YoutubePlayerStateRevMapping = Object.fromEntries(Object.entries(YoutubePlayerState).map(([k, v]) => [v, k]));

const VideoQuality:{[key: string] : any} = {
    "tiny" : "144p",
    "small" : "240p",
    "medium" : "360p",
    "large" : "480p",
    "hd720" : "720p",
    "hd1080" : "1080p",
    "highres" : "highres"
}

export class YouTubeAnalytics implements EnrichmentPlugin {
  name = 'youtube-analytics';
  type = PluginType.ENRICHMENT as const;
  currentId = 100;
  config!: BrowserConfig;

  private playerState: any;

  constructor(player: any, amplitude: any) {
    console.log(player);
    this.onReady = this.onReady.bind(this);
    this.onVideoStateChange = this.onVideoStateChange.bind(this);
    this.onPlaybackQualityChange = this.onPlaybackQualityChange.bind(this);
    this.onPlaybackRateChange = this.onPlaybackRateChange.bind(this);

    player.addEventListener('onReady', this.onReady);
    player.addEventListener('onStateChange', this.onVideoStateChange);
    player.addEventListener('onPlaybackQualityChange', this.onPlaybackQualityChange)
    player.addEventListener('onPlaybackRateChange', this.onPlaybackRateChange)

    this.setPlayerState(player);
  }

  onReady(event: any) {
    // reset global state trackers
    const player = event.target;
    this.setPlayerState(player);
  }

  setPlayerState(player: any) {
    this.playerState = {
      state: player?.getPlayerState?.(),
      rate: player?.getPlaybackRate?.(),
      quality: VideoQuality?.[player?.getPlaybackQuality?.()],
      currentTime: player?.getCurrentTime?.(),
    };
  }

  onVideoStateChange(youtubeEvent: any) {
    console.log(youtubeEvent)
    const player = youtubeEvent.target;
    var eventProperties = {
      currentTime: this.timecode(player.getCurrentTime()),
      currentTimeInSec: player.getCurrentTime(),
      duration: this.timecode(player.getDuration()),
      durationInSec: player.getDuration(),
      mediaReferenceTime: this.timecode(player.getMediaReferenceTime()),
      mediaReferenceTimeInSec: player.getMediaReferenceTime(),
      quality: VideoQuality[player.getPlaybackQuality()],
      rate: player.getPlaybackRate(),
      url: player.getVideoUrl(),
      volume: player.getVolume(),
      author: player.getVideoData().author,
      title: player.getVideoData().title,
      video_id: player.getVideoData().video_id,
      prevPlayerState: YoutubePlayerStateRevMapping?.[this.playerState.state],
      prevPlayerRate: this.playerState.rate,
      prevPlayerQuality: this.playerState.Quality,
      prevCurrentTime: this.timecode?.(this.playerState.currentTime),
      prevCurrentTimeInSec: this.playerState.currentTime,
    }
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
    this.setPlayerState(player);
  }

  onPlaybackQualityChange(youtubeEvent: any) {
    console.log(youtubeEvent)
    const player = youtubeEvent.target;
    var eventProperties = {
      currentTime: this.timecode(player.getCurrentTime()),
      currentTimeInSec: player.getCurrentTime(),
      duration: this.timecode(player.getDuration()),
      durationInSec: player.getDuration(),
      mediaReferenceTime: this.timecode(player.getMediaReferenceTime()),
      mediaReferenceTimeInSec: player.getMediaReferenceTime(),
      quality: VideoQuality[youtubeEvent.data],
      rate: player.getPlaybackRate(),
      url: player.getVideoUrl(),
      volume: player.getVolume(),
      author: player.getVideoData().author,
      title: player.getVideoData().title,
      video_id: player.getVideoData().video_id,
      prevPlayerState: YoutubePlayerStateRevMapping?.[this.playerState.state],
      prevPlayerRate: this.playerState.rate,
      prevPlayerQuality: this.playerState.Quality,
      prevCurrentTime: this.timecode?.(this.playerState.currentTime),
      prevCurrentTimeInSec: this.playerState.currentTime,
    }
    amplitude.track("Video Quality Updated", eventProperties);
    this.setPlayerState(player);
  }

  onPlaybackRateChange(youtubeEvent: any) {
    console.log(youtubeEvent)
    const player = youtubeEvent.target;
    var eventProperties = {
      currentTime: this.timecode(player.getCurrentTime()),
      currentTimeInSec: player.getCurrentTime(),
      duration: this.timecode(player.getDuration()),
      durationInSec: player.getDuration(),
      mediaReferenceTime: this.timecode(player.getMediaReferenceTime()),
      mediaReferenceTimeInSec: player.getMediaReferenceTime(),
      quality: VideoQuality[player.getPlaybackQuality()],
      rate: youtubeEvent.data,
      url: player.getVideoUrl(),
      volume: player.getVolume(),
      author: player.getVideoData().author,
      title: player.getVideoData().title,
      video_id: player.getVideoData().video_id,
      prevPlayerState: YoutubePlayerStateRevMapping?.[this.playerState.state],
      prevPlayerRate: this.playerState.rate,
      prevPlayerQuality: this.playerState.Quality,
      prevCurrentTime: this.timecode?.(this.playerState.currentTime),
      prevCurrentTimeInSec: this.playerState.currentTime,
    }
    amplitude.track("Video Playback Rate Updated", eventProperties);
    this.setPlayerState(player);
  }

  /** 
   * Convert time from seconds to the timecode format xx:xx:xx
   */
  timecode(time: number): string {
      console.log(time);
      var h = Math.floor(time / 3600);
      var m = Math.floor(time % 3600 / 60);
      var s = Math.floor(time % 3600 % 60);
      var hDisplay = h > 0 ? (("0" + h).slice(-2) + ":") : "";
      var mDisplay = m >= 0 ? (("0" + m).slice(-2) + ":") : "";
      var sDisplay = s >= 0 ? ("0" + s).slice(-2) : "";
      return hDisplay + mDisplay + sDisplay;
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
