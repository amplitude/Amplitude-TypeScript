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
    this.enabled = enabled
    this.unmask = unmask
    this.maskLevel = maskLevel
  }

  override fun addView(child: View, index: Int) {
    super.addView(child, index)
    applyMaskingToChild(child)
  }

  override fun removeView(view: View) {
    SRMaskingRegistry.unmask(view)
    super.removeView(view)
  }

  private fun applyMaskingToChild(child: View) {
    if (!enabled) {
      return
    }

    if (unmask) {
      SRMaskingRegistry.unmask(child)
      return
    }

    SRMaskingRegistry.mask(child, maskLevel)
  }
}
