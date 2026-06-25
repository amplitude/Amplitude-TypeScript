package com.amplitude.sessionreplayreactnative

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

// Plain ReactPackage using only APIs present in every supported RN version, so
// older legacy-arch apps keep building unchanged (no peerDependencies floor).
class SessionReplayReactNativePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(SessionReplayReactNativeModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(SessionReplayReactNativeViewManager())
  }
}
