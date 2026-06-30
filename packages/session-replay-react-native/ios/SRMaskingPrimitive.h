#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Recorder-agnostic masking primitive. A concrete implementation is registered
/// by the Session Replay SDK (Part 2). Until then the registry is inert.
@protocol SRMaskingPrimitive <NSObject>
- (void)maskView:(UIView *)view level:(NSString *)level;
- (void)unmaskView:(UIView *)view;
/// Return the view to "inherit" — no longer explicitly masked or unmasked.
- (void)resetView:(UIView *)view;
@end

/// Indirection between the Fabric `SRMaskView` and the concrete masking
/// primitive. The registry records each live view's masking intent and replays
/// it when a primitive registers, so views masked before registration are still
/// applied (without a JS re-render).
@interface SRMaskingRegistry : NSObject
@property (class, nonatomic, nullable, strong) id<SRMaskingPrimitive> primitive;
+ (void)maskView:(UIView *)view level:(NSString *)level;
+ (void)unmaskView:(UIView *)view;
+ (void)resetView:(UIView *)view;
@end

NS_ASSUME_NONNULL_END
