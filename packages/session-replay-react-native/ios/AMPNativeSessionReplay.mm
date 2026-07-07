#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AMPNativeSessionReplay, NSObject)

RCT_EXTERN_METHOD(flush:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSessionId:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSessionReplayProperties:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setSessionId:(nonnull NSNumber)sessionId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setDeviceId:(NSString)deviceId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setup:(NSDictionary *)config resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(start:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

@end

#ifdef RCT_NEW_ARCH_ENABLED
// Bind the Swift module to the codegen TurboModule interface. A named category is
// required because a Swift class cannot gain protocol conformance via an anonymous
// class extension.
#import <AmpSessionReplaySpec/AmpSessionReplaySpec.h>

@interface AMPNativeSessionReplay (TurboModule) <RCTTurboModule>
@end

@implementation AMPNativeSessionReplay (TurboModule)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAmpSessionReplaySpecJSI>(params);
}

@end
#endif
