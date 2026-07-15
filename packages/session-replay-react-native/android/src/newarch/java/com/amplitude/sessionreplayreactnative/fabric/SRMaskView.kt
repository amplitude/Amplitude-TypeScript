package com.amplitude.sessionreplayreactnative.fabric

import android.content.Context
import android.view.View
import com.amplitude.sessionreplayreactnative.SRMaskingRegistry
import com.facebook.react.views.view.ReactViewGroup

/**
 * Fabric host view for the layout-transparent mask component. Its Yoga node is
 * `display:contents`, so Fabric assigns it a 0x0 native frame; the view
 * compensates in two ways that must not affect the Yoga layout of its children:
 * disabled child clipping (a 0x0 host would otherwise clip children invisible)
 * and [expandBoundsToChildrenUnion], which widens only this host's own frame so
 * the session-replay capture gate (width>0 && height>0) doesn't drop the
 * (mask-tagged) subtree.
 */
class SRMaskView(context: Context) : ReactViewGroup(context) {
  var enabled: Boolean = true
    private set
  var unmask: Boolean = false
    private set
  var maskLevel: String = "mask"
    private set

  // Guards recursion: setLeftTopRightBottom() can trigger another onLayout.
  private var expanding = false

  init {
    clipChildren = false
    clipToPadding = false
  }

  // Children can be laid out after the host's own layout pass; re-widen then.
  private val childLayoutChangeListener =
    OnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
      if (left != oldLeft || top != oldTop || right != oldRight || bottom != oldBottom) {
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

  // Fabric applies the degenerate 0x0 frame via the final View.layout();
  // onLayout is the hook that runs right after, where we can re-widen it.
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    expandBoundsToChildrenUnion()
  }

  // Widen this host's native frame to enclose its children WITHOUT moving it:
  // the origin (left, top) must stay Fabric-assigned, because children are
  // positioned relative to the host — moving it would shift them on screen and
  // break layout neutrality. Only right/bottom grow. Child coordinates are in
  // host-space, so the parent-space extent is host origin + max child extent.
  // (Children at negative host-space coords can't be enclosed without moving
  // the host; normal RN layout never produces those.)
  private fun expandBoundsToChildrenUnion() {
    if (expanding) return
    if (childCount == 0) return

    var maxChildRight = 0
    var maxChildBottom = 0
    for (i in 0 until childCount) {
      val c = getChildAt(i) ?: continue
      if (c.right > maxChildRight) maxChildRight = c.right
      if (c.bottom > maxChildBottom) maxChildBottom = c.bottom
    }

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

  // Called from SRMaskViewManager.onDropViewInstance. Fabric can drop the host
  // without routing children through removeView*; detach their listeners (which
  // close over — and would keep alive — this host) and reset their masking.
  fun onHostDropped() {
    for (i in 0 until childCount) {
      val child = getChildAt(i) ?: continue
      child.removeOnLayoutChangeListener(childLayoutChangeListener)
      SRMaskingRegistry.reset(child)
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
