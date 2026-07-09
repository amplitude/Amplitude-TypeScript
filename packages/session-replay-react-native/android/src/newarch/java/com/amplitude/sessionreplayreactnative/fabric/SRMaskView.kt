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
    //
    // CROSS-VERSION CONSTRAINT (do not "simplify" either way): ReactViewGroup
    // is Java with getPointerEvents()/setPointerEvents() through RN 0.80 and
    // a Kotlin `var pointerEvents` property from RN 0.81, so neither an
    // accessor override (`override fun` vs `override var`) nor an explicit
    // setPointerEvents(...) call compiles against both. Property-assignment
    // syntax is the one shape that resolves on every version: Kotlin
    // synthesizes the property from the Java accessor pair on <= 0.80 and
    // binds the real property on 0.81+. Re-asserted in onLayout below so a
    // recycling reset can never be observed by capture or touch.
    pointerEvents = PointerEvents.BOX_NONE
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
    // Re-assert touch transparency in case a recycling path reset the field
    // (version-agnostic replacement for an accessor override; see init).
    pointerEvents = PointerEvents.BOX_NONE
    expandBoundsToChildrenUnion()
  }

  // Widen this host's native frame to enclose its children WITHOUT moving it.
  //
  // Measured coordinate model (SDKRN-33, RN 0.77.2 Fabric, on-device):
  // children are ALWAYS host-relative — a child renders at
  // (host.left + child.left, host.top + child.top), standard Android. The
  // host's Fabric-assigned degenerate frame is (X,Y,X,Y) where (X,Y) is the
  // accumulated origin of any flattened views between the host and its
  // mounted parent: (0,0) for top-level masks (where host-relative and
  // parent-space coincide numerically), non-zero for e.g. an AmpUnmask nested
  // inside an AmpMask through a flattened <View>, a mask inside a list row,
  // or a mask whose child uses negative offsets. Therefore the enclosing
  // extent in parent space is origin + max child extent. The origin must
  // never move (children would shift on screen), so children at negative
  // host-relative coordinates cannot be enclosed; the extents are clamped so
  // the frame is never degenerate or inverted while children exist — the
  // session-replay capture gate (width>0 && height>0) is the whole point of
  // the widening. The widened frame can overlap unrelated siblings, which is
  // why the host is pointer-events BOX_NONE (see init) and must never be a
  // touch target itself.
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

    // Children are host-relative, so parent-space extent = origin + extent.
    // Clamp to a 1px minimum so a child at fully negative coordinates can
    // never produce a zero/inverted frame that the capture gate would drop.
    val newRight = left + maxOf(maxChildRight, 1)
    val newBottom = top + maxOf(maxChildBottom, 1)

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
