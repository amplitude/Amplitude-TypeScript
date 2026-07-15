#import "AmpMaskApplier.h"
@import AmplitudeSessionReplay;

@implementation AmpMaskApplier

+ (void)applyMask:(NSString *)mask toView:(UIView *)view
{
  view.amp_isBlocked = ![mask isEqualToString:@"amp-unmask"];
}

+ (void)resetView:(UIView *)view
{
  view.amp_isBlocked = false;
}

@end
