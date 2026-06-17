package com.amplitude.sessionreplayreactnative.fabric

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp

class SRMaskViewManager : ViewGroupManager<SRMaskView>() {
  override fun getName(): String = "SRMaskView"

  override fun createViewInstance(reactContext: ThemedReactContext): SRMaskView {
    return SRMaskView(reactContext)
  }

  @ReactProp(name = "enabled", defaultBoolean = true)
  fun setEnabled(view: SRMaskView, enabled: Boolean) {
    view.setMaskingProps(enabled, view.unmask, view.maskLevel)
  }

  @ReactProp(name = "unmask", defaultBoolean = false)
  fun setUnmask(view: SRMaskView, unmask: Boolean) {
    view.setMaskingProps(view.enabled, unmask, view.maskLevel)
  }

  @ReactProp(name = "maskLevel")
  fun setMaskLevel(view: SRMaskView, maskLevel: String) {
    view.setMaskingProps(view.enabled, view.unmask, maskLevel)
  }
}
