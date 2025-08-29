package com.amplitude.pluginsessionreplayreactnative

import com.amplitude.android.sessionreplay.SessionReplay
import com.amplitude.common.Logger
import com.amplitude.common.android.LogcatLogger
import com.amplitude.core.ServerZone
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap

class PluginSessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private lateinit var sessionReplay: SessionReplay

  override fun getName(): String {
    return "PluginSessionReplayReactNative"
  }

  @ReactMethod
  fun setup(apiKey: String, deviceId: String?, sessionId: Double, serverZone: String?, sampleRate: Double, enableRemoteConfig: Boolean, logLevel: Int, autoStart: Boolean) {
    LogcatLogger.logger.logMode = when (logLevel) {
        0 -> Logger.LogMode.OFF
        1 -> Logger.LogMode.ERROR
        2 -> Logger.LogMode.WARN
        3 -> Logger.LogMode.INFO
        4 -> Logger.LogMode.DEBUG
        else -> Logger.LogMode.WARN
    }

    LogcatLogger.logger.debug("""
        setup:
        API Key: $apiKey
        Device Id: $deviceId
        Session Id: $sessionId
        Server Zone: ${serverZone ?: "NULL"}
        Sample Rate: $sampleRate
        Enable Remote Config: $enableRemoteConfig
        Log Level: $logLevel
        Auto Start: $autoStart
    """.trimIndent())

    sessionReplay = SessionReplay(
      apiKey,
      reactContext.applicationContext,
      deviceId ?: "",
      sessionId.toLong(),
      logger = LogcatLogger.logger,
      sampleRate = sampleRate,
      enableRemoteConfig = enableRemoteConfig,
      serverZone = when (serverZone) {
        "EU" -> ServerZone.EU
        else -> ServerZone.US
      },
      autoStart = autoStart
    )
  }

  @ReactMethod
  fun setSessionId(sessionId: Double) {
    sessionReplay.setSessionId(sessionId.toLong())
  }

  @ReactMethod
  fun getSessionId(promise: Promise) {
    promise.resolve(sessionReplay.getSessionId().toDouble())
  }

  @ReactMethod
  fun getSessionReplayProperties(promise: Promise) {
    val properties: Map<String, Any> = sessionReplay.getSessionReplayProperties()
    val map: WritableMap = WritableNativeMap()
    for ((key, value) in properties) {
      if (value is String) {
        map.putString(key, value)
      } else if (value is Int) {
        map.putInt(key, value)
      } else if (value is Long) {
        map.putDouble(key, value.toDouble())
      } else if (value is Double) {
        map.putDouble(key, value)
      } else if (value is Boolean) {
        map.putBoolean(key, value)
      }
    }
    promise.resolve(map)
  }
  
  @ReactMethod
  fun start() {
    sessionReplay.start()
  }

  @ReactMethod
  fun stop() {
    sessionReplay.stop()
  }

  @ReactMethod
  fun flush() {
    sessionReplay.flush()
  }

  @ReactMethod
  fun teardown() {
    sessionReplay.shutdown()
  }

  override fun invalidate() {
    if (::sessionReplay.isInitialized) {
      sessionReplay.shutdown()
    }
  }
}
