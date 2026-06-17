#pragma once

#include "SRMaskViewShadowNode.h"

#include <react/renderer/core/ConcreteComponentDescriptor.h>

namespace facebook::react {

class SRMaskViewCustomComponentDescriptor final
    : public ConcreteComponentDescriptor<SRMaskViewContentsShadowNode> {
 public:
  using ConcreteComponentDescriptor::ConcreteComponentDescriptor;
};

} // namespace facebook::react
