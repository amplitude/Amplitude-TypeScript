#import "SRMaskView.h"

#import "../SRMaskingPrimitive.h"
#import "../../cpp/SRMaskViewComponentDescriptor.h"

#ifdef RCT_NEW_ARCH_ENABLED

#import <React/RCTComponentViewFactory.h>
#import <react/renderer/components/SRMaskViewSpec/EventEmitters.h>
#import <react/renderer/components/SRMaskViewSpec/Props.h>
#import <react/renderer/components/SRMaskViewSpec/RCTComponentViewHelpers.h>

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
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  [SRMaskingRegistry resetView:childComponentView];
  [super unmountChildComponentView:childComponentView index:index];
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
