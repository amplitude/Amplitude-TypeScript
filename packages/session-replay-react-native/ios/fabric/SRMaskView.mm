#import "SRMaskView.h"

#import "../SRMaskingPrimitive.h"

#ifdef RCT_NEW_ARCH_ENABLED

#import <react/renderer/components/SRMaskViewSpec/ComponentDescriptors.h>
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
  [super load];
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const SRMaskViewProps>();
    _props = defaultProps;
    _enabled = YES;
    _unmask = NO;
    _maskLevel = @"medium";
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
  NSString *newMaskLevel = [NSString stringWithUTF8String:newViewProps.maskLevel.c_str()];
  BOOL maskingPropsChanged =
      _enabled != newViewProps.enabled || _unmask != newViewProps.unmask ||
      ![_maskLevel isEqualToString:newMaskLevel];

  _enabled = newViewProps.enabled;
  _unmask = newViewProps.unmask;
  _maskLevel = newMaskLevel;

  [super updateProps:props oldProps:oldProps];

  if (maskingPropsChanged) {
    [self applyMaskingToChildren];
  }
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  [super mountChildComponentView:childComponentView index:index];
  [self applyMaskingToChild:childComponentView];
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  [SRMaskingRegistry unmaskView:childComponentView];
  [super unmountChildComponentView:childComponentView index:index];
}

- (void)applyMaskingToChildren
{
  for (UIView *childView in self.subviews) {
    [self applyMaskingToChild:childView];
  }
}

- (void)applyMaskingToChild:(UIView *)childView
{
  if (!_enabled || _unmask) {
    [SRMaskingRegistry unmaskView:childView];
    return;
  }

  [SRMaskingRegistry maskView:childView level:_maskLevel ?: @"medium"];
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
