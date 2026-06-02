#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(AmplitudeReactNativeConnectivity, RCTEventEmitter)

RCT_EXTERN_METHOD(getNetworkConnectivityStatus: (RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
