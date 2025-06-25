#import <React/RCTViewManager.h>
#import <React/RCTView.h>
@import AmplitudeSessionReplay;

@interface RCTAmpMaskViewManager : RCTViewManager
@end

@implementation RCTAmpMaskViewManager

RCT_EXPORT_MODULE(RCTAmpMaskView)

- (UIView *)view
{
  return [[RCTView alloc] init];
}

RCT_CUSTOM_VIEW_PROPERTY(mask, NSString, RCTView)
{
  NSString* mask = [RCTConvert NSString:json];
  if ([mask isEqualToString:@"amp-mask"]) {
    view.amp_isBlocked = true;
  } else if ([mask isEqualToString:@"amp-block"]) {
    view.amp_isBlocked = true;
  } else if ([mask isEqualToString:@"amp-unmask"]) {
    view.amp_isBlocked = false;
  }
}

@end
