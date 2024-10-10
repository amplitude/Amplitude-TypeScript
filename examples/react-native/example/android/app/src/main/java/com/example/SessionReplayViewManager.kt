package com.example

import android.view.ViewGroup
import com.amplitude.android.sessionreplay.Constants
import com.amplitude.android.sessionreplay.SessionReplay
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewManager

class SessionReplayViewManager : ReactViewManager() {

    override fun getName(): String {
        return "RCTAmpMaskView"
    }

    @ReactProp(name = "mask")
    fun setMask(view: ViewGroup, ampMask: String) {
        when (ampMask) {
            Constants.TagMask -> SessionReplay.mask(view)
            Constants.TagUnmask -> SessionReplay.unmask(view)
            Constants.TagBlock -> SessionReplay.block(view)
        }
    }
}