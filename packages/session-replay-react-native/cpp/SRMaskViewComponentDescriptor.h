#pragma once

#include "SRMaskViewShadowNode.h"

#include <react/debug/react_native_assert.h>
#include <react/renderer/components/view/YogaLayoutableShadowNode.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>

namespace facebook::react {

// Replaces the codegen typedef of the same name (patched on Android; iOS binds
// via +componentDescriptorProvider). adopt() runs after updateYogaProps() on
// every create/clone so display:contents is authoritative.
class SRMaskViewComponentDescriptor final
    : public ConcreteComponentDescriptor<SRMaskViewContentsShadowNode> {
 public:
  using ConcreteComponentDescriptor::ConcreteComponentDescriptor;

  void adopt(ShadowNode& shadowNode) const override {
    react_native_assert(
        dynamic_cast<SRMaskViewContentsShadowNode*>(&shadowNode));
    auto& contentsNode = static_cast<SRMaskViewContentsShadowNode&>(shadowNode);
    contentsNode.applyContentsDisplay();
    ConcreteComponentDescriptor::adopt(shadowNode);
  }
};

} // namespace facebook::react
