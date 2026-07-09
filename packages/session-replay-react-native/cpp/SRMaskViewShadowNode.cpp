#include "SRMaskViewShadowNode.h"

#include <react/renderer/core/ShadowNodeFragment.h>
#include <react/renderer/core/ShadowNodeTraits.h>
#include <yoga/Yoga.h>

namespace facebook::react {

void SRMaskViewContentsShadowNode::initialize() {
  // display:contents comes from the JS style prop and is already in
  // yogaNode_'s style (parsed by RN's own updateYogaProps(), which also set
  // ForceFlattenView). We never write the Yoga style in C++; the only trait
  // customization is keeping the host view mounted (the session-replay SDK
  // needs a real view to tag for masking) while Yoga still lays the children
  // out as if the host didn't exist.
  if (YGNodeStyleGetDisplay(&yogaNode_) != YGDisplayContents) {
    return;
  }

  traits_.unset(ShadowNodeTraits::Trait::ForceFlattenView);

  // Workaround for an upstream Yoga display:contents bug present in
  // RN 0.77-0.82 (fixed by facebook/react-native#56422, shipped in 0.86 and
  // backports): because contents nodes are skipped by Yoga's layout
  // traversal, their children are cloned through side channels
  // (cleanupContentsNodesRecursively / layoutAbsoluteDescendants) that call
  // cloneChildrenIfNeeded() on a contents node even when it is clean and
  // belongs to an already-committed (sealed) tree. If this node was cloned
  // without re-adopting its children, that fires the ShadowNode clone
  // callback on the sealed node and SIGABRTs debug builds
  // (Sealable::ensureUnsealed). Defuse the precondition: eagerly take
  // ownership of every Yoga child at construction time (we are unsealed
  // here), so cloneChildrenIfNeeded() on this node is always a no-op later.
  // This mirrors what YogaLayoutableShadowNode::cloneChildInPlace() does
  // lazily during layout, just moved to a legal (unsealed) point in time.
  auto yogaChildren = yogaNode_.getChildren(); // copy: replaceChild mutates
  for (yoga::Node* childYogaNode : yogaChildren) {
    if (childYogaNode->getOwner() == &yogaNode_) {
      continue;
    }
    auto& childShadowNode = *static_cast<YogaLayoutableShadowNode*>(
        childYogaNode->getContext());
    auto clonedChildShadowNode = childShadowNode.clone(
        {ShadowNodeFragment::propsPlaceholder(),
         ShadowNodeFragment::childrenPlaceholder(),
         childShadowNode.getState()});
    // Public replaceChild() performs the same Yoga bookkeeping as RN's
    // private cloneChildInPlace(): swaps the ShadowNode child and re-owns
    // the fresh clone's Yoga node under yogaNode_.
    replaceChild(childShadowNode, clonedChildShadowNode);
  }
}

} // namespace facebook::react
