package com.amplitude.sessionreplayreactnative

import com.amplitude.sessionreplayreactnative.fabric.SRMaskViewManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager


class SessionReplayReactNativePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(SessionReplayReactNativeModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    val managers = mutableListOf<ViewManager<*, *>>(SessionReplayReactNativeViewManager())
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      managers.add(SRMaskViewManager())
    }
    return managers
  }
}
