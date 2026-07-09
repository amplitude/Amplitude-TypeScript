package com.amplitude.sessionreplayreactnative

import android.view.View
import com.amplitude.android.sessionreplay.SessionReplay

/**
 * Default [SRMaskingPrimitive] bridging the masking seam to the Amplitude
 * Session Replay Android SDK's existing tag-based hooks:
 *
 *  - `mask(view, "mask")`  -> [SessionReplay.mask]
 *  - `mask(view, "block")` -> [SessionReplay.block]
 *  - `unmask(view)`        -> [SessionReplay.unmask]
 *  - `reset(view)`         -> `view.tag = null` (the SDK hooks are tag-based;
 *                             clearing the tag returns the view to "inherit")
 *
 * Registered on the UI thread at SDK init
 * ([SessionReplayReactNativeModule.setup]); registration replays intents
 * recorded before init, so mount-before-init masking still applies.
 */
class SRDefaultMaskingPrimitive : SRMaskingPrimitive {
  override fun mask(view: View, level: String) {
    when (level) {
      "block" -> SessionReplay.block(view)
      // Default mask level is "mask"; unknown levels fail safe to masking.
      else -> SessionReplay.mask(view)
    }
  }

  override fun unmask(view: View) {
    SessionReplay.unmask(view)
  }

  override fun reset(view: View) {
    view.tag = null
  }
}
