import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const INTERFACE_CHANGE_EVENT = 'AmplitudeSessionReplayInterfaceChanged';
const INTERFACE_SIGNAL_PROVIDER_EVENT = 'AmplitudeSessionReplayInterfaceSignalProviderChanged';

interface InterfaceChangeEvent {
  time: number;
}

interface InterfaceSignalProviderEvent {
  isProviding: boolean;
}

interface InterfaceSignalHandlers {
  onInterfaceChanged: (time: number) => void;
  onProviderChanged: (isProviding: boolean) => void;
}

export function subscribeToSessionReplayInterfaceSignals(handlers: InterfaceSignalHandlers): () => void {
  const nativeSessionReplay = NativeModules.AMPNativeSessionReplay;
  if (Platform.OS !== 'ios' || !nativeSessionReplay) {
    return () => undefined;
  }

  const emitter = new NativeEventEmitter(nativeSessionReplay);
  const changeSubscription = emitter.addListener(INTERFACE_CHANGE_EVENT, (event: InterfaceChangeEvent) => {
    if (typeof event.time === 'number') {
      handlers.onInterfaceChanged(event.time);
    }
  });
  const providerSubscription = emitter.addListener(
    INTERFACE_SIGNAL_PROVIDER_EVENT,
    (event: InterfaceSignalProviderEvent) => {
      handlers.onProviderChanged(event.isProviding === true);
    },
  );

  return () => {
    changeSubscription.remove();
    providerSubscription.remove();
  };
}
