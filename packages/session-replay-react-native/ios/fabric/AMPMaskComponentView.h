// Whole file is guarded: the podspec compiles ios/** unconditionally, and this
// header must be a no-op on old-architecture installs where the Fabric headers
// (React/RCTViewComponentView.h) do not exist.
#ifdef RCT_NEW_ARCH_ENABLED

#import <React/RCTViewComponentView.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface AMPMaskComponentView : RCTViewComponentView

@end

NS_ASSUME_NONNULL_END

#endif // RCT_NEW_ARCH_ENABLED
