#pragma once

#include <react/renderer/components/SRMaskViewSpec/EventEmitters.h>
#include <react/renderer/components/SRMaskViewSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {

// Named distinctly from codegen's SRMaskViewShadowNode typealias to avoid ODR
// clashes with generated ShadowNodes.h while reusing the same component name.
extern const char SRMaskViewComponentName[];

class SRMaskViewContentsShadowNode final
    : public ConcreteViewShadowNode<
          SRMaskViewComponentName,
          SRMaskViewProps,
          SRMaskViewEventEmitter> {
 public:
  SRMaskViewContentsShadowNode(
      const ShadowNodeFragment& fragment,
      const ShadowNodeFamily::Shared& family,
      ShadowNodeTraits traits)
      : ConcreteViewShadowNode(fragment, family, traits) {
    initialize();
  }

  SRMaskViewContentsShadowNode(
      const ShadowNode& sourceShadowNode,
      const ShadowNodeFragment& fragment)
      : ConcreteViewShadowNode(sourceShadowNode, fragment) {
    initialize();
  }

 private:
  void initialize();
};

} // namespace facebook::react
