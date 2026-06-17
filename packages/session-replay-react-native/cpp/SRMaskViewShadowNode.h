#pragma once

#include <react/renderer/components/SRMaskViewSpec/EventEmitters.h>
#include <react/renderer/components/SRMaskViewSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {

extern const char SRMaskViewComponentName[];

class SRMaskViewShadowNode final
    : public ConcreteViewShadowNode<
          SRMaskViewComponentName,
          SRMaskViewProps,
          SRMaskViewEventEmitter> {
 public:
  SRMaskViewShadowNode(
      const ShadowNodeFragment& fragment,
      const ShadowNodeFamily::Shared& family,
      ShadowNodeTraits traits)
      : ConcreteViewShadowNode(fragment, family, traits) {
    initialize();
  }

  SRMaskViewShadowNode(
      const ShadowNode& sourceShadowNode,
      const ShadowNodeFragment& fragment)
      : ConcreteViewShadowNode(sourceShadowNode, fragment) {
    initialize();
  }

 private:
  void initialize();
};

} // namespace facebook::react
