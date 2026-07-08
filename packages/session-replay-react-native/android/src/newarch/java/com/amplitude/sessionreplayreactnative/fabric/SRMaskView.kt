package com.amplitude.sessionreplayreactnative.fabric

import android.content.Context
import android.view.View
import com.amplitude.sessionreplayreactnative.SRMaskingRegistry
import com.facebook.react.uimanager.PointerEvents
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
    // The widened frame (see expandBoundsToChildrenUnion) necessarily spans
    // from the host's Fabric-assigned origin to the children's far corner, so
    // it overlaps sibling views that have nothing to do with this mask. The
    // host must therefore never participate in touch targeting itself:
    // BOX_NONE makes RN's TouchTargetHelper skip the host (only its children
    // can be targets) and lets misses fall through to views underneath.
    // Children are unaffected. This view is never created from a JS
    // pointerEvents prop, so nothing else writes this field.
    setPointerEvents(PointerEvents.BOX_NONE)
  }

  // Belt-and-braces with the init{} setter: TouchTargetHelper consults this
  // accessor, and it must stay BOX_NONE even if some future code path (e.g.
  // view recycling's resetPointerEvents) rewrites the backing field.
  override fun getPointerEvents(): PointerEvents = PointerEvents.BOX_NONE

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
  // the origin (left, top) must stay Fabric-assigned (a display:contents host
  // is always placed at its parent's origin), because Fabric positions the
  // children with GRANDPARENT-relative frames — the host sitting at (0,0) is
  // exactly what makes those frames land at the right pixels. Only
  // right/bottom grow, and child extents must NOT be offset by the host
  // origin: child.right/bottom are already expressed in the same coordinate
  // space as the host's own frame. The widened frame exists purely for the
  // session-replay capture gate (width>0 && height>0); it inevitably overlaps
  // unrelated siblings, which is why the host is pointer-events BOX_NONE (see
  // init) and must never be a touch target itself.
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

    val newRight = maxChildRight
    val newBottom = maxChildBottom

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
