package com.amplitude.sessionreplayreactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableMap

// Legacy-arch counterpart of the codegen spec: same method signatures so the
// module's `override`s compile against both bases.
abstract class SessionReplayReactNativeSpec(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  abstract fun setup(config: ReadableMap, promise: Promise)
  abstract fun setSessionId(sessionId: Double, promise: Promise)
  abstract fun setDeviceId(deviceId: String?, promise: Promise)
  abstract fun getSessionId(promise: Promise)
  abstract fun getSessionReplayProperties(promise: Promise)
  abstract fun start(promise: Promise)
  abstract fun stop(promise: Promise)
  abstract fun flush(promise: Promise)
}
