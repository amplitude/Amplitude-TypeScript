import { Types } from '@amplitude/analytics-react-native';
import GetLocation, { Location } from 'react-native-get-location';

// https://github.com/douglasjunior/react-native-get-location#install - install steps, usage.
export default class LocationPlugin implements Types.BeforePlugin {
  name = 'getLocation';
  type = Types.PluginType.BEFORE as any;
  config: Types.Config | undefined;
  location: Location | undefined;

  async setup(config: Types.Config): Promise<undefined> {
    this.config = config;
    GetLocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 30000,
      rationale: {
        title: 'Location permission',
        message: 'The app needs the permission to request your location.',
        buttonPositive: 'Ok',
      },
    })
      .then((location) => {
        this.location = location;
      })
      .catch((e) => {
        config?.loggerProvider?.error(e);
      });

    return undefined;
  }

  async execute(context: Types.Event): Promise<Types.Event> {
    if (this.location) {
      context.location_lat = this.location.latitude;
      context.location_lng = this.location.longitude;
    }
    return context;
  }
}
