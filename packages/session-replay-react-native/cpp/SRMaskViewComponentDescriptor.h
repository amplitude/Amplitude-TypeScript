#pragma once

#include "SRMaskViewShadowNode.h"

#include <react/renderer/core/ConcreteComponentDescriptor.h>

namespace facebook::react {

// Replaces the codegen typedef of the same name (patched on Android; iOS binds
// via +componentDescriptorProvider). Exists only to bind the custom
// SRMaskViewContentsShadowNode class — no adopt() override; the ShadowNode's
// own constructors handle the ForceFlattenView unset (see
// SRMaskViewShadowNode.h).
class SRMaskViewComponentDescriptor final
    : public ConcreteComponentDescriptor<SRMaskViewContentsShadowNode> {
 public:
  using ConcreteComponentDescriptor::ConcreteComponentDescriptor;
};

} // namespace facebook::react
