package com.amplitude.sessionreplayreactnative.fabric

import com.amplitude.sessionreplayreactnative.SRMaskingRegistry
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.SRMaskViewManagerDelegate
import com.facebook.react.viewmanagers.SRMaskViewManagerInterface

@ReactModule(name = SRMaskViewManager.NAME)
class SRMaskViewManager :
  ViewGroupManager<SRMaskView>(),
  SRMaskViewManagerInterface<SRMaskView> {

  private val delegate = SRMaskViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<SRMaskView> = delegate

  override fun getName(): String = NAME

  override fun createViewInstance(reactContext: ThemedReactContext): SRMaskView =
    SRMaskView(reactContext)

  override fun setEnabled(view: SRMaskView, value: Boolean) {
    view.setMaskingProps(value, view.unmask, view.maskLevel)
  }

  override fun setUnmask(view: SRMaskView, value: Boolean) {
    view.setMaskingProps(view.enabled, value, view.maskLevel)
  }

  override fun setMaskLevel(view: SRMaskView, value: String?) {
    view.setMaskingProps(view.enabled, view.unmask, value ?: "mask")
  }

  override fun onDropViewInstance(view: SRMaskView) {
    super.onDropViewInstance(view)
    // R5: reset all children when the host view is dropped.
    for (i in 0 until view.childCount) {
      SRMaskingRegistry.reset(view.getChildAt(i))
    }
  }

  companion object {
    const val NAME = "SRMaskView"
  }
}
