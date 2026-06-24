package com.amplitude.sessionreplayreactnative

import android.view.View

interface SRMaskingPrimitive {
  fun mask(view: View, level: String)
  fun unmask(view: View)
  fun clearForView(view: View)
}

object SRMaskingRegistry {
  @JvmStatic
  var primitive: SRMaskingPrimitive? = null
    private set

  private var warnedUnregistered = false

  @JvmStatic
  fun setPrimitive(value: SRMaskingPrimitive?) {
    primitive = value
  }

  @JvmStatic
  fun mask(view: View, level: String) {
    val p = primitive
    if (p != null) {
      p.mask(view, level)
      return
    }
    warnUnregisteredOnce()
  }

  @JvmStatic
  fun unmask(view: View) {
    val p = primitive
    if (p != null) {
      p.unmask(view)
      return
    }
    warnUnregisteredOnce()
  }

  @JvmStatic
  fun clearForView(view: View) {
    val p = primitive
    if (p != null) {
      p.clearForView(view)
      return
    }
    warnUnregisteredOnce()
  }

  private fun warnUnregisteredOnce() {
    if (!warnedUnregistered && BuildConfig.DEBUG) {
      warnedUnregistered = true
      android.util.Log.w(
        "SRMaskingRegistry",
        "No masking primitive registered. Masking calls are no-ops until the Session Replay SDK registers one.",
      )
    }
  }
}
