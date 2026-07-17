#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

// Plain-ObjC seam between the Fabric AMPMaskComponentView (ObjC++) and the
// AmplitudeSessionReplay Swift pod: `@import AmplitudeSessionReplay` is only
// reliable from ObjC (.m) translation units, so the amp_isBlocked calls live
// here instead of in the .mm.
@interface AmpMaskApplier : NSObject

// 'amp-unmask' exempts the view; 'amp-mask'/'amp-block'/unknown values fail
// safe to masking. Same mapping as the legacy AMPMaskComponentViewManager.
+ (void)applyMask:(NSString *)mask toView:(UIView *)view;

// Resets a view about to be recycled to the masked (fail-closed) state, so a
// reused native instance cannot inherit a previous incarnation's UNMASKED
// marker and expose content before updateProps re-applies its real mask value.
+ (void)resetView:(UIView *)view;

@end

NS_ASSUME_NONNULL_END
