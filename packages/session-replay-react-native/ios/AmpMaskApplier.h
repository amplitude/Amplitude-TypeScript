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

// Clears masking state on a view about to be recycled so a reused native
// instance cannot leak a previous incarnation's mask/unmask marker.
+ (void)resetView:(UIView *)view;

@end

NS_ASSUME_NONNULL_END
