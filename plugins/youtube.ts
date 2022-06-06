import { BrowserConfig, EnrichmentPlugin, Event, PluginType } from '@amplitude/analytics-types';
import { init, track, add} from '@amplitude/analytics-browser';


export class YouTubeAnalytics implements EnrichmentPlugin {
  name = 'youtube-analytics';
  type = PluginType.ENRICHMENT as const;
  currentId = 100;
  config!: BrowserConfig;

  constructor(player: any) {
      player.addEventListener('onStateChange', function(ytEvent: any) {
          // Convert Youtube Event Data to Our Event, don't have to use the function though
          console.log(ytEvent)
        //   event = this.convertYoutubeEventToAmplitudeEvent(ytEvent)
        //   track(event)
      })
  }

  // function to convert youtube data to our BaseEvent
//   convertYoutubeEventToAmplitudeEvent(youtubeEvent) : Event {

//   }
  
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
