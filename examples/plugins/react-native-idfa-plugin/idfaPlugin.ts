import { Types } from '@amplitude/analytics-react-native';
import { NativeModules } from 'react-native';

interface IdfaPluginNative {
  requestTrackingAuthorization(): Promise<number>;
  getIdfa(): Promise<string | null>;
}

export default class IdfaPlugin implements Types.BeforePlugin {
  name = 'logging';
  type = Types.PluginType.BEFORE as any;
  idfaPluginNative: IdfaPluginNative | undefined;

  async setup(_config: Types.Config): Promise<undefined> {
    this.idfaPluginNative = NativeModules.IdfaPlugin as IdfaPluginNative;
    await this.idfaPluginNative.requestTrackingAuthorization();
    return undefined;
  }

  async execute(context: Types.Event): Promise<Types.Event> {
    const idfa = await this.idfaPluginNative?.getIdfa();
    if (idfa) {
      context.idfa = idfa;
    }
    return context;
  }
}
