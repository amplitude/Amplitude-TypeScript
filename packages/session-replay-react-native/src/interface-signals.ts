import { NativeEventEmitter, Platform } from 'react-native';
import { NativeSessionReplay } from './native-module';

export const INTERFACE_CHANGE_EVENT = 'AmplitudeSessionReplayInterfaceChanged';
export const INTERFACE_SIGNAL_PROVIDER_EVENT = 'AmplitudeSessionReplayInterfaceSignalProviderChanged';

export interface InterfaceChangeEvent {
  time: number;
}

export interface InterfaceSignalProviderEvent {
  isProviding: boolean;
}

export interface InterfaceSignalSubscription {
  remove(): void;
}

export interface InterfaceSignalHandlers {
  onInterfaceChanged: (event: InterfaceChangeEvent) => void;
  onProviderChanged?: (event: InterfaceSignalProviderEvent) => void;
}

export function subscribeToInterfaceSignals(handlers: InterfaceSignalHandlers): InterfaceSignalSubscription {
  if (Platform.OS !== 'ios') {
    return { remove: () => undefined };
  }

  const emitter = new NativeEventEmitter(NativeSessionReplay as any);
  const changeSubscription = emitter.addListener(INTERFACE_CHANGE_EVENT, handlers.onInterfaceChanged);
  const providerSubscription = handlers.onProviderChanged
    ? emitter.addListener(INTERFACE_SIGNAL_PROVIDER_EVENT, handlers.onProviderChanged)
    : undefined;

  return {
    remove: () => {
      changeSubscription.remove();
      providerSubscription?.remove();
    },
  };
}
