package com.amplitude.sessionreplayreactnative.fabric

import com.amplitude.android.sessionreplay.SessionReplay
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.AMPMaskComponentViewManagerDelegate
import com.facebook.react.viewmanagers.AMPMaskComponentViewManagerInterface
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/**
 * New-Architecture manager for `<AmpMaskView>` (native name AMPMaskComponentView).
 * Registered by the newarch [com.amplitude.sessionreplayreactnative.SessionReplayReactNativePackage]
 * in place of the legacy [com.amplitude.sessionreplayreactnative.SessionReplayReactNativeViewManager],
 * which keeps serving old-architecture builds unchanged (oldarch source set).
 *
 * Same base class ([ReactViewManager] — the host view is a bare [ReactViewGroup],
 * a NORMAL layout node) and same self-tagging model as the legacy manager; the
 * codegen [AMPMaskComponentViewManagerDelegate] routes the `mask` prop on Fabric.
 */
@ReactModule(name = AmpMaskViewManager.NAME)
class AmpMaskViewManager :
  ReactViewManager(),
  AMPMaskComponentViewManagerInterface<ReactViewGroup> {

  private val delegate = AMPMaskComponentViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<ReactViewGroup> = delegate

  override fun getName(): String = NAME

  /**
   * Same mask values as the legacy `mask` prop: `amp-mask`/`amp-block` mask or
   * block this subtree, `amp-unmask` exempts it. Unknown values fail safe to
   * masking.
   */
  override fun setMask(view: ReactViewGroup, value: String?) {
    when (value) {
      "amp-unmask" -> SessionReplay.unmask(view)
      "amp-block" -> SessionReplay.block(view)
      else -> SessionReplay.mask(view)
    }
  }

  companion object {
    const val NAME = "AMPMaskComponentView"
  }
}
