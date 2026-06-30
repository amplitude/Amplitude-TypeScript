package com.amplitude.sessionreplayreactnative

import com.amplitude.sessionreplayreactnative.fabric.SRMaskViewManager
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager

// BaseReactPackage (RN >= 0.74) registers the module as a TurboModule. It lives in
// the newarch source set so it is compiled only when the New Architecture is
// enabled; legacy-arch apps on older RN never reference it.
class SessionReplayReactNativePackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == SessionReplayReactNativeModule.NAME) {
      SessionReplayReactNativeModule(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        SessionReplayReactNativeModule.NAME to ReactModuleInfo(
          SessionReplayReactNativeModule.NAME, // name
          SessionReplayReactNativeModule.NAME, // className
          false, // canOverrideExistingModule
          false, // needsEagerInit
          false, // isCxxModule
          true, // isTurboModule
        ),
      )
    }
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(SessionReplayReactNativeViewManager(), SRMaskViewManager())
  }
}
