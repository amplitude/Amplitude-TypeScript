#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PluginSessionReplayReactNative, NSObject)

RCT_EXTERN_METHOD(setup:(NSString)apiKey deviceId:(NSString)deviceId sessionId:(nonnull NSNumber)sessionId sampleRate:(float)sampleRate enableRemoteConfig:(BOOL)enableRemoteConfig logLevel:(int)logLevel resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setSessionId:(nonnull NSNumber)sessionId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSessionId:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSessionReplayProperties:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(start:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(flush:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(teardown:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

@end
