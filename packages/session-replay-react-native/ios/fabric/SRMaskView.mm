#import "SRMaskView.h"

#import "../SRMaskingPrimitive.h"
#import "../../cpp/SRMaskViewComponentDescriptor.h"

#ifdef RCT_NEW_ARCH_ENABLED

#import <React/RCTComponentViewFactory.h>
#import <react/renderer/components/AmpSessionReplaySpec/EventEmitters.h>
#import <react/renderer/components/AmpSessionReplaySpec/Props.h>
#import <react/renderer/components/AmpSessionReplaySpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface SRMaskView () <RCTSRMaskViewViewProtocol>
@end

@implementation SRMaskView {
  BOOL _enabled;
  BOOL _unmask;
  NSString *_maskLevel;
}

+ (void)load
{
  [RCTComponentViewFactory.currentComponentViewFactory registerComponentViewClass:self];
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const SRMaskViewProps>();
    _props = defaultProps;
    _enabled = YES;
    _unmask = NO;
    _maskLevel = @"mask";
    self.clipsToBounds = NO;
  }
  return self;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<SRMaskViewComponentDescriptor>();
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newViewProps = *std::static_pointer_cast<const SRMaskViewProps>(props);

  _enabled = newViewProps.enabled;
  _unmask = newViewProps.unmask;
  _maskLevel = [NSString stringWithUTF8String:newViewProps.maskLevel.c_str()];

  [super updateProps:props oldProps:oldProps];
  [self reapplyMaskingToAllChildren];
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  [super mountChildComponentView:childComponentView index:index];
  [self applyMaskingToChild:childComponentView];
  [self expandFrameToChildrenUnion];
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  [SRMaskingRegistry resetView:childComponentView];
  [super unmountChildComponentView:childComponentView index:index];
  [self expandFrameToChildrenUnion];
}

- (void)prepareForRecycle
{
  for (UIView *subview in self.subviews) {
    [SRMaskingRegistry resetView:subview];
  }
  [super prepareForRecycle];
}

- (void)reapplyMaskingToAllChildren
{
  for (UIView *subview in self.subviews) {
    [self applyMaskingToChild:subview];
  }
}

- (void)applyMaskingToChild:(UIView *)childView
{
  if (!_enabled) {
    [SRMaskingRegistry resetView:childView];
    return;
  }

  if (_unmask) {
    [SRMaskingRegistry unmaskView:childView];
    return;
  }

  [SRMaskingRegistry maskView:childView level:_maskLevel ?: @"mask"];
}

#pragma mark - Frame widening (accessibility)

// This host is intentionally zero-sized: its Yoga node is display:contents-style
// layout-transparent, so Fabric assigns it a degenerate (w=0,h=0) frame while the
// children keep real host-relative frames outside our bounds (clipsToBounds=NO).
// iOS's accessibility machinery prunes zero-sized views TOGETHER WITH their
// descendants, which made everything inside <AmpMask>/<AmpUnmask> invisible to
// VoiceOver/XCUITest/a11y tree dumps. Accessibility-only remedies do not work:
// overriding -accessibilityFrame and/or -accessibilityElements was verified
// ineffective on-device — the AX snapshot culls this host by its REAL frame
// before consulting either API. So mirror the Android fix (SRMaskView.kt
// expandBoundsToChildrenUnion): widen the host's real frame to enclose its
// children without ever moving its origin (children are host-relative; moving
// the origin would shift them on screen). Yoga layout is unaffected (UIKit
// frames never feed back into Fabric layout), and the widened frame cannot
// swallow touches because -hitTest:withEvent: below returns nil whenever the
// host itself would be the target (the iOS analogue of Android's BOX_NONE).
// Re-widen wherever the degenerate frame can be (re)applied or the children's
// extent can change: host layout metrics updates, child mount/unmount, and
// -layoutSubviews (UIKit marks the host as needing layout when a subview's
// frame changes, which covers child-only Fabric layout transactions).
- (void)expandFrameToChildrenUnion
{
  if (self.subviews.count == 0) {
    return;
  }

  CGFloat maxChildRight = 0;
  CGFloat maxChildBottom = 0;
  for (UIView *child in self.subviews) {
    maxChildRight = MAX(maxChildRight, CGRectGetMaxX(child.frame));
    maxChildBottom = MAX(maxChildBottom, CGRectGetMaxY(child.frame));
  }

  // Children are host-relative, so the enclosing size is just their max extent.
  // Clamp to a 1pt minimum so a child at fully negative coordinates can never
  // produce a degenerate frame that the accessibility traversal would prune.
  CGSize newSize = CGSizeMake(MAX(maxChildRight, 1), MAX(maxChildBottom, 1));
  CGRect frame = self.frame;
  if (!CGSizeEqualToSize(frame.size, newSize)) {
    frame.size = newSize;
    self.frame = frame;
  }
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  // super re-applies the degenerate Fabric frame; widen right after.
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self expandFrameToChildrenUnion];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  [self expandFrameToChildrenUnion];
}

- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event
{
  UIView *hitView = [super hitTest:point withEvent:event];
  if (hitView == self) {
    return nil;
  }
  return hitView;
}

@end

Class SRMaskViewCls(void)
{
  return SRMaskView.class;
}

#endif // RCT_NEW_ARCH_ENABLED
