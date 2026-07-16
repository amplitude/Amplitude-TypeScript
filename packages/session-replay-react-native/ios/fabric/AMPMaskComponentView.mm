// Guard first (before any #import): the podspec compiles ios/** on both
// architectures and this file must be a no-op on old-arch installs.
#ifdef RCT_NEW_ARCH_ENABLED

#import "AMPMaskComponentView.h"

#import "../AmpMaskApplier.h"

#import <React/RCTComponentViewFactory.h>
#import <react/renderer/components/AmpSessionReplaySpec/ComponentDescriptors.h>
#import <react/renderer/components/AmpSessionReplaySpec/Props.h>
#import <react/renderer/components/AmpSessionReplaySpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

// Fabric host view for `<AmpMaskView>` (native name AMPMaskComponentView) on
// the New Architecture. A NORMAL layout node: default RCTViewComponentView
// layout, codegen-generated ComponentDescriptor (plain Yoga, no custom
// ShadowNode). Its only job is to tag ITSELF for the Session Replay recorder —
// the same self-tagging model as the legacy Paper manager
// (RCTAmpMaskViewManager.m), which keeps serving old-architecture apps under
// the same component name. Registering this class makes Fabric resolve the
// name here instead of falling back to the legacy-interop shim, whose
// out-of-band re-parenting mis-renders nested mask/unmask subtrees.
@interface AMPMaskComponentView () <RCTAMPMaskComponentViewViewProtocol>
@end

@implementation AMPMaskComponentView

+ (void)load
{
  [RCTComponentViewFactory.currentComponentViewFactory registerComponentViewClass:self];
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const AMPMaskComponentViewProps>();
    _props = defaultProps;
  }
  return self;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<AMPMaskComponentViewComponentDescriptor>();
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newViewProps = *std::static_pointer_cast<const AMPMaskComponentViewProps>(props);
  [super updateProps:props oldProps:oldProps];
  // Applied unconditionally (not diffed): a recycled instance is reset in
  // prepareForRecycle and must be re-tagged on every (re)mount.
  [AmpMaskApplier applyMask:[NSString stringWithUTF8String:newViewProps.mask.c_str()] toView:self];
}

- (void)prepareForRecycle
{
  // Fabric reuses component-view instances under new tags; reset to the
  // masked (fail-closed) state so a recycled view never inherits a stale
  // UNMASKED marker before updateProps re-applies its real mask value.
  [AmpMaskApplier resetView:self];
  [super prepareForRecycle];
}

@end

// extern "C": RN <= 0.76 generates RCTThirdPartyFabricComponentsProvider.mm
// declaring this lookup function with C linkage; without it the app link on
// those versions fails with "Undefined symbols: _AMPMaskComponentViewCls".
// RN >= 0.77 resolves the class by name (NSClassFromString) and ignores this.
extern "C" Class AMPMaskComponentViewCls(void)
{
  return AMPMaskComponentView.class;
}

#endif // RCT_NEW_ARCH_ENABLED
