#import "React/RCTBridgeModule.h"
@interface RCT_EXTERN_MODULE(MigrationModule, NSObject)

RCT_EXTERN_METHOD(prepareLegacyDatabase: (NSString*)instanceName version:(NSString*)version resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end