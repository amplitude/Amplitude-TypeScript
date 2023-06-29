#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AmplitudeReactNative, NSObject)

RCT_EXTERN_METHOD(getApplicationContext: (NSDictionary*)options resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
