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
  var maskLevel: String = "medium"
    private set

  fun setMaskingProps(enabled: Boolean, unmask: Boolean, maskLevel: String) {
    val maskingPropsChanged =
      this.enabled != enabled || this.unmask != unmask || this.maskLevel != maskLevel

    this.enabled = enabled
    this.unmask = unmask
    this.maskLevel = maskLevel

    if (maskingPropsChanged) {
      applyMaskingToChildren()
    }
  }

  override fun addView(child: View, index: Int) {
    super.addView(child, index)
    applyMaskingToChild(child)
  }

  override fun removeView(view: View) {
    SRMaskingRegistry.unmask(view)
    super.removeView(view)
  }

  private fun applyMaskingToChildren() {
    for (i in 0 until childCount) {
      applyMaskingToChild(getChildAt(i))
    }
  }

  private fun applyMaskingToChild(child: View) {
    if (!enabled || unmask) {
      SRMaskingRegistry.unmask(child)
      return
    }

    SRMaskingRegistry.mask(child, maskLevel)
  }
}
