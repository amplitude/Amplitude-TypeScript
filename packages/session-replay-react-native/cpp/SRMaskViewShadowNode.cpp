#include "SRMaskViewShadowNode.h"

#include <react/renderer/core/ShadowNodeTraits.h>
#include <yoga/style/Style.h>

namespace facebook::react {

extern const char SRMaskViewComponentName[] = "SRMaskView";

void SRMaskViewShadowNode::initialize() {
  traits_.unset(ShadowNodeTraits::Trait::ForceFlattenView);

  auto style = yogaNode_.style();
  style.setDisplay(yoga::Display::Contents);
  yogaNode_.setStyle(style);
}

} // namespace facebook::react
