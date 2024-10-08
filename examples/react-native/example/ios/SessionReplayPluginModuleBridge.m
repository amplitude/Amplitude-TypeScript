//
// SessionReplayPluginModule.m
//  example
//
//  Created by Curtis Liu on 10/7/24.
//
// To export a module named SessionReplayPluginModule
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SessionReplayPluginModule, NSObject)

RCT_EXTERN_METHOD(setup:(NSString)apiKey deviceId:(NSString)deviceId sessionId:(nonnull NSNumber)sessionId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setSessionId:(nonnull NSNumber) resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSessionId:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSessionReplayProperties:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(flush:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(teardown:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

@end

