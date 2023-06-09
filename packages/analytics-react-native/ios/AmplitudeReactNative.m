#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AmplitudeReactNative, NSObject)

RCT_EXTERN_METHOD(getApplicationContext: (Bool)shouldTrackAdid resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
