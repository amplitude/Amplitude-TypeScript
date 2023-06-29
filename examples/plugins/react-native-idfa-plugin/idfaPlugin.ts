import { Types } from '@amplitude/analytics-react-native';
import ReactNativeIdfaAaid from '@sparkfabrik/react-native-idfa-aaid';

export default class IdfaPlugin implements Types.BeforePlugin {
  name = 'idfa';
  type = 'before' as const;
  idfa: string | null = null;

  async setup(_config: Types.Config): Promise<undefined> {
    try {
      const info = await ReactNativeIdfaAaid.getAdvertisingInfo();
      this.idfa = info.id;
    } catch (e) {
      console.log(e);
    }
    return undefined;
  }

  async execute(context: Types.Event): Promise<Types.Event> {
    if (this.idfa) {
      context.idfa = this.idfa;
    }
    return context;
  }
}
