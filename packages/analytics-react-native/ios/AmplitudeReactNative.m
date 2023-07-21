#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AmplitudeReactNative, NSObject)

RCT_EXTERN_METHOD(getApplicationContext: (NSDictionary*)options resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getLegacySessionData: (NSString*)instanceName resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getLegacyEvents: (NSString*)instanceName resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getLegacyIdentifies: (NSString*)instanceName resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getLegacyInterceptedIdentifies: (NSString*)instanceName resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
