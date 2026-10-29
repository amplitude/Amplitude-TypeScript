package com.amplitude.pluginsessionreplayreactnative

import com.amplitude.android.sessionreplay.SessionReplay
import com.amplitude.android.sessionreplay.config.MaskLevel
import com.amplitude.android.sessionreplay.config.PrivacyConfig
import com.amplitude.common.Logger
import com.amplitude.common.android.LogcatLogger
import com.amplitude.core.ServerZone
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class PluginSessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private lateinit var sessionReplay: SessionReplay
  private var shouldStart = false

  @ReactMethod
  fun getInterfaceSignalState(promise: Promise) {
    val state = WritableNativeMap().apply {
      putBoolean("isProviding", shouldStart && ::sessionReplay.isInitialized && sessionReplay.shouldRecord())
      putString("sessionId", if (::sessionReplay.isInitialized) sessionReplay.getSessionId().toString() else "-1")
      putString("deviceId", if (::sessionReplay.isInitialized) sessionReplay.getDeviceId() else null)
    }
    promise.resolve(state)
  }

  // Native SDK callbacks are forwarded directly; JS owns observation history.
  private fun emitInterfaceSignal(type: String) {
    if (!reactContext.hasActiveCatalystInstance()) return
    val signal = Arguments.createMap().apply {
      putString("type", type)
      putDouble("timestamp", System.currentTimeMillis().toDouble())
    }
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("PluginSessionReplayReactNativeInterfaceSignal", signal)
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Double) {}

  override fun getName(): String {
    return "PluginSessionReplayReactNative"
  }

  @ReactMethod
  fun setup(apiKey: String, deviceId: String?, sessionId: Double, serverZone: String?, sampleRate: Double, enableRemoteConfig: Boolean, logLevel: Int, autoStart: Boolean, maskLevel: String) {
    emitInterfaceSignal("stateChanged")
    shouldStart = autoStart
    LogcatLogger.logger.logMode = when (logLevel) {
        0 -> Logger.LogMode.OFF
        1 -> Logger.LogMode.ERROR
        2 -> Logger.LogMode.WARN
        3 -> Logger.LogMode.INFO
        4 -> Logger.LogMode.DEBUG
        else -> Logger.LogMode.WARN
    }

    val mappedMaskLevel = when (maskLevel.lowercase()) {
        "light" -> MaskLevel.LIGHT
        "medium" -> MaskLevel.MEDIUM
        "conservative" -> MaskLevel.CONSERVATIVE
        else -> MaskLevel.MEDIUM
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
        Mask Level: $maskLevel
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
      autoStart = autoStart,
      privacyConfig = PrivacyConfig(maskLevel = mappedMaskLevel),
      uiChangeCallback = { emitInterfaceSignal("interfaceChanged") }
    )
  }

  @ReactMethod
  fun setSessionId(sessionId: Double) {
    emitInterfaceSignal("stateChanged")
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
    emitInterfaceSignal("stateChanged")
    shouldStart = true
    sessionReplay.start()
  }

  @ReactMethod
  fun stop() {
    emitInterfaceSignal("stateChanged")
    shouldStart = false
    sessionReplay.stop()
  }

  @ReactMethod
  fun flush() {
    sessionReplay.flush()
  }

  @ReactMethod
  fun teardown() {
    emitInterfaceSignal("stateChanged")
    shouldStart = false
    sessionReplay.shutdown()
  }

  override fun invalidate() {
    shouldStart = false
    if (::sessionReplay.isInitialized) {
      sessionReplay.shutdown()
    }
  }
}
