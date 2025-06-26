package com.amplitude.sessionreplayreactnative

import android.view.ViewGroup
import com.amplitude.android.sessionreplay.SessionReplay
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewManager

class SessionReplayReactNativeViewManager : ReactViewManager() {

    override fun getName(): String {
        return "RCTAmpMaskView"
    }

    @ReactProp(name = "mask")
    fun setMask(view: ViewGroup, ampMask: String) {
        when (ampMask) {
            "amp-mask" -> SessionReplay.mask(view)
            "amp-unmask" -> SessionReplay.unmask(view)
            "amp-block" -> SessionReplay.block(view)
        }
    }
}
