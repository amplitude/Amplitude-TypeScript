package com.amplitude.pluginsessionreplayreactnative

import com.amplitude.android.sessionreplay.SessionReplay
import com.amplitude.common.Logger
import com.amplitude.common.android.LogcatLogger
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap

class PluginSessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private lateinit var sessionReplay: SessionReplay
  private var isInitialized = false

  override fun getName(): String {
    return "PluginSessionReplayReactNative"
  }

  @ReactMethod
  fun setup(apiKey: String, deviceId: String?, sessionId: Double, sampleRate: Double, enableRemoteConfig: Boolean) {
      LogcatLogger.logger.logMode = Logger.LogMode.DEBUG
      sessionReplay = SessionReplay(
        apiKey,
        reactContext.applicationContext,
        deviceId ?: "",
        sessionId.toLong(),
        logger = LogcatLogger.logger,
        sampleRate = sampleRate,
        enableRemoteConfig = enableRemoteConfig,
      )
    isInitialized = true
  }

  @ReactMethod
  fun setSessionId(sessionId: Double) {
    if (isInitialized) {
      sessionReplay.setSessionId(sessionId.toLong())
    }
  }

  @ReactMethod
  fun getSessionId(promise: Promise) {
    if (isInitialized) {
      promise.resolve(sessionReplay.getSessionId().toDouble())
    }
    promise.resolve(-1)
  }

  @ReactMethod
  fun getSessionReplayProperties(promise: Promise) {
    val map: WritableMap = WritableNativeMap()
    if (isInitialized) {
      val properties: Map<String, Any> = sessionReplay.getSessionReplayProperties()
      for ((key, value) in properties) {
        when (value) {
          is String -> map.putString(key, value)
          is Int -> map.putInt(key, value)
          is Long -> map.putDouble(key, value.toDouble())
          is Double -> map.putDouble(key, value)
          is Boolean -> map.putBoolean(key, value)
        }
      }
      promise.resolve(map)
      return
    }
    promise.resolve(map)
  }

  @ReactMethod
  fun flush() {
    if (isInitialized) {
      sessionReplay.flush()
    }
  }

  @ReactMethod
  fun teardown() {
    if (isInitialized) {
      sessionReplay.shutdown()
      isInitialized = false
    }
  }

  override fun invalidate() {
    if (isInitialized) {
      sessionReplay.shutdown()
      isInitialized = false
    }
  }
}
