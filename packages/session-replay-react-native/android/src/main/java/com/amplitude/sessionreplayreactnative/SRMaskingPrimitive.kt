package com.amplitude.sessionreplayreactnative

import android.view.View
import java.util.WeakHashMap

/**
 * Recorder-agnostic masking primitive. A concrete implementation is registered
 * by the Session Replay SDK (Part 2). Until then [SRMaskingRegistry] is inert.
 */
interface SRMaskingPrimitive {
  fun mask(view: View, level: String)
  fun unmask(view: View)

  /** Return the view to "inherit" — no longer explicitly masked or unmasked. */
  fun reset(view: View)
}

/**
 * Indirection between the Fabric `SRMaskView` and the concrete masking
 * primitive. Records each live view's masking intent and replays it when a
 * primitive registers, so views masked before registration are still applied
 * (without a JS re-render).
 *
 * Single-threaded (main/UI thread) use, so no locking.
 */
object SRMaskingRegistry {

  /**
   * A single view's masking intent so it can be replayed onto a primitive that
   * registers after the view was masked/unmasked.
   */
  private sealed interface Intent {
    data class Mask(val level: String) : Intent
    object Unmask : Intent
  }

  @JvmStatic
  var primitive: SRMaskingPrimitive? = null
    private set

  private var warnedUnregistered = false

  /**
   * Weak-keyed map of view -> intent. Weak keys let views GC naturally without
   * leaking.
   */
  private val intents = WeakHashMap<View, Intent>()

  @JvmStatic
  fun setPrimitive(value: SRMaskingPrimitive?) {
    primitive = value
    if (value == null) {
      return
    }
    // Replay every recorded intent onto the newly registered primitive so views
    // masked before registration get applied (without a JS re-render).
    for ((view, intent) in intents) {
      when (intent) {
        is Intent.Mask -> value.mask(view, intent.level)
        Intent.Unmask -> value.unmask(view)
      }
    }
  }

  @JvmStatic
  fun mask(view: View, level: String) {
    intents[view] = Intent.Mask(level)
    primitive?.mask(view, level) ?: warnUnregisteredOnce()
  }

  @JvmStatic
  fun unmask(view: View) {
    intents[view] = Intent.Unmask
    primitive?.unmask(view) ?: warnUnregisteredOnce()
  }

  @JvmStatic
  fun reset(view: View) {
    // reset means "return to inherit" — no longer a tracked intent.
    intents.remove(view)
    primitive?.reset(view) ?: warnUnregisteredOnce()
  }

  private fun warnUnregisteredOnce() {
    if (!warnedUnregistered && BuildConfig.DEBUG) {
      warnedUnregistered = true
      android.util.Log.w(
        "SRMaskingRegistry",
        "No masking primitive registered; masking calls are recorded and will " +
          "replay once a primitive registers.",
      )
    }
  }
}
