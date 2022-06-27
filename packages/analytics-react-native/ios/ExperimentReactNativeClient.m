#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ExperimentReactNativeClient, NSObject)

RCT_EXTERN_METHOD(getApplicationContext: (RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
