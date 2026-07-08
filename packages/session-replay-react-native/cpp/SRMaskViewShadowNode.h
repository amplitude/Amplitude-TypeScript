#pragma once

#include <react/renderer/components/AmpSessionReplaySpec/EventEmitters.h>
#include <react/renderer/components/AmpSessionReplaySpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {

// Named distinctly from codegen's SRMaskViewShadowNode typealias to avoid ODR
// clashes with generated ShadowNodes.h while reusing the same component name.
extern const char SRMaskViewComponentName[];

// The JS component passes style={display:'contents'}; RN's own
// updateYogaProps() (run inside the base constructors) parses it into the
// Yoga style and sets ShadowNodeTraits::ForceFlattenView. We never mutate the
// Yoga style in C++ — the only customization is unsetting ForceFlattenView
// after each construction so the Android/iOS host view stays mounted (the
// session-replay SDK needs a real view to tag for masking) while Yoga still
// lays the children out as if the host didn't exist.
//
// This mirrors the pattern shipped by Expensify react-native-live-markdown
// (MarkdownTextInputDecoratorShadowNode) and Expo's expo-modules-core
// (ExpoViewShadowNode's disableForceFlatten): a post-constructor hook invoked
// from BOTH constructors (create + clone), no ComponentDescriptor::adopt()
// override, no Yoga style writes.
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
  // Runs after the base constructors (and therefore after updateYogaProps(),
  // which re-sets ForceFlattenView on every clone that carries new props).
  // Must be called from every constructor. Besides the trait unset it also
  // eagerly re-owns this node's Yoga children — a workaround for an upstream
  // RN 0.77-0.82 display:contents crash; see the .cpp for details.
  void initialize();
};

} // namespace facebook::react
