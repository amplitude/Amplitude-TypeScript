#pragma once

#include <react/renderer/components/AmpSessionReplaySpec/EventEmitters.h>
#include <react/renderer/components/AmpSessionReplaySpec/Props.h>
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
      : ConcreteViewShadowNode(fragment, family, traits) {}

  SRMaskViewContentsShadowNode(
      const ShadowNode& sourceShadowNode,
      const ShadowNodeFragment& fragment)
      : ConcreteViewShadowNode(sourceShadowNode, fragment) {}

  // Applied from ComponentDescriptor::adopt() after updateYogaProps() on every
  // create/clone so display:contents survives prop-driven Yoga style resets.
  void applyContentsDisplay();
};

} // namespace facebook::react
