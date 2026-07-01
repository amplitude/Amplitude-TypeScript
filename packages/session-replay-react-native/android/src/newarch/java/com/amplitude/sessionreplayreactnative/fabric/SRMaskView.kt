package com.amplitude.sessionreplayreactnative.fabric

import android.content.Context
import android.view.View
import com.amplitude.sessionreplayreactnative.SRMaskingRegistry
import com.facebook.react.views.view.ReactViewGroup

class SRMaskView(context: Context) : ReactViewGroup(context) {
  var enabled: Boolean = true
    private set
  var unmask: Boolean = false
    private set
  var maskLevel: String = "mask"
    private set

  // Re-entrancy guard: setLeftTopRightBottom() can itself trigger another
  // layout pass; without this we could recurse through onLayout -> expand ->
  // onLayout.
  private var expanding = false

  // Task 0.4b (O3 mitigation): the Yoga node is `display:contents`, so Fabric's
  // SurfaceMountingManager.updateLayout() calls View.layout(x, y, x, y) on this
  // host -> a 0x0 native frame. The session-replay-android capture gate
  // (View.shouldCapture(): width>0 && height>0) then drops this host AND never
  // traverses its (already mask-tagged) children, so the masked subtree
  // vanishes from the replay. To restore capture WITHOUT changing Yoga layout,
  // we widen ONLY this host view's native frame to the union of its children's
  // frames. View.layout()/setLeftTopRightBottom are final, but onLayout() is an
  // overridable hook that runs after the frame is set, and the (final) public
  // setLeftTopRightBottom() can be CALLED to re-set the frame. Children keep
  // their own Fabric-assigned positions (ReactViewGroup.onLayout is a no-op, so
  // widening the parent never repositions them) and the Yoga tree is untouched,
  // so sibling/child layout is unchanged (Task 0.3 neutrality preserved).
  private val childLayoutChangeListener =
    OnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
      if (left != oldLeft || top != oldTop || right != oldRight || bottom != oldBottom) {
        // A child's frame arrived/changed after our own layout pass. Re-expand.
        expandBoundsToChildrenUnion()
      }
    }

  fun setMaskingProps(enabled: Boolean, unmask: Boolean, maskLevel: String) {
    this.enabled = enabled
    this.unmask = unmask
    this.maskLevel = maskLevel
    reapplyMaskingToAllChildren()
  }

  override fun addView(child: View, index: Int) {
    super.addView(child, index)
    applyMaskingToChild(child)
    child.addOnLayoutChangeListener(childLayoutChangeListener)
    expandBoundsToChildrenUnion()
  }

  override fun removeView(view: View) {
    view.removeOnLayoutChangeListener(childLayoutChangeListener)
    SRMaskingRegistry.reset(view)
    super.removeView(view)
    expandBoundsToChildrenUnion()
  }

  override fun removeViewAt(index: Int) {
    val child = getChildAt(index)
    child?.removeOnLayoutChangeListener(childLayoutChangeListener)
    child?.let { SRMaskingRegistry.reset(it) }
    super.removeViewAt(index)
    expandBoundsToChildrenUnion()
  }

  // Fabric drives layout by calling the (final) View.layout(l,t,r,b) from
  // SurfaceMountingManager.updateLayout() (RN 0.77.2). For a display:contents
  // host that frame is degenerate (r==l, b==t -> 0x0). onLayout runs right
  // after the frame is applied; here we widen it to enclose the children.
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    expandBoundsToChildrenUnion()
  }

  // Widen this host's native frame so it encloses its children (width>0 && height>0
  // => shouldCapture passes) WITHOUT moving the host. Coordinate spaces differ:
  // this host's left/top/right/bottom are in its PARENT's space, whereas each
  // child's left/top/right/bottom are in THIS host's space (a child's edges are
  // relative to its parent, i.e. the host). So we must NOT union them directly.
  // Children are positioned relative to the host, so moving the host (changing
  // left/top) would shift every child in absolute/parent space and break layout
  // neutrality (Task 0.3). Instead we keep the Fabric-assigned origin (left, top)
  // and only grow right/bottom: the enclosing size is the max child right/bottom
  // in host-space, translated to parent-space by adding the host origin. This is
  // correct regardless of the host's parent offset and idempotent across layout
  // passes. (Children laid out at negative host-space coords — above/left of the
  // host origin — cannot be enclosed without moving the host and thus shifting
  // siblings; normal RN layout never produces those.)
  private fun expandBoundsToChildrenUnion() {
    if (expanding) return
    if (childCount == 0) return

    // Max child extent in this host's own coordinate space.
    var maxChildRight = 0
    var maxChildBottom = 0
    for (i in 0 until childCount) {
      val c = getChildAt(i) ?: continue
      if (c.right > maxChildRight) maxChildRight = c.right
      if (c.bottom > maxChildBottom) maxChildBottom = c.bottom
    }

    // Translate to parent-space without moving the host origin (left, top fixed).
    val newRight = left + maxChildRight
    val newBottom = top + maxChildBottom

    if (newRight != right || newBottom != bottom) {
      expanding = true
      try {
        setLeftTopRightBottom(left, top, newRight, newBottom)
      } finally {
        expanding = false
      }
    }
  }

  private fun reapplyMaskingToAllChildren() {
    for (i in 0 until childCount) {
      applyMaskingToChild(getChildAt(i))
    }
  }

  private fun applyMaskingToChild(child: View) {
    if (!enabled) {
      SRMaskingRegistry.reset(child)
      return
    }

    if (unmask) {
      SRMaskingRegistry.unmask(child)
      return
    }

    SRMaskingRegistry.mask(child, maskLevel)
  }
}
