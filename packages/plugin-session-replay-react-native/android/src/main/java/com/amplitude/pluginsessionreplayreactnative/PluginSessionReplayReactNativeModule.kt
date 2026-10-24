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
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.bridge.LifecycleEventListener
import java.util.concurrent.atomic.AtomicLong

class PluginSessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private lateinit var sessionReplay: SessionReplay
  private var deviceId: String? = null
  private var signalSessionId = "-1"
  private var signalActive = false
  private val signalGeneration = AtomicLong(0)
  private val lastUiChangeTime = AtomicLong(0)

  init { reactContext.addLifecycleEventListener(this) }

  override fun onHostResume() { signalGeneration.incrementAndGet() }
  override fun onHostPause() { signalGeneration.incrementAndGet() }
  override fun onHostDestroy() { signalGeneration.incrementAndGet() }

  @ReactMethod
  fun getInterfaceSignalState(promise: Promise) {
    val state = WritableNativeMap().apply {
      putBoolean("isProviding", signalActive && ::sessionReplay.isInitialized && sessionReplay.shouldRecord())
      putDouble("lastChangeTime", lastUiChangeTime.get().toDouble())
      putDouble("generation", signalGeneration.get().toDouble())
      putString("sessionId", signalSessionId)
      putString("deviceId", deviceId)
    }
    promise.resolve(state)
  }

  override fun getName(): String {
    return "PluginSessionReplayReactNative"
  }

  @ReactMethod
  fun setup(apiKey: String, deviceId: String?, sessionId: Double, serverZone: String?, sampleRate: Double, enableRemoteConfig: Boolean, logLevel: Int, autoStart: Boolean, maskLevel: String) {
    signalGeneration.incrementAndGet()
    this.deviceId = deviceId
    signalSessionId = sessionId.toLong().toString()
    signalActive = true
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
      uiChangeCallback = { lastUiChangeTime.set(System.currentTimeMillis()) }
    )
  }

  @ReactMethod
  fun setSessionId(sessionId: Double) {
    if (signalSessionId != sessionId.toLong().toString()) signalGeneration.incrementAndGet()
    signalSessionId = sessionId.toLong().toString()
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
    signalGeneration.incrementAndGet()
    signalActive = true
    sessionReplay.start()
  }

  @ReactMethod
  fun stop() {
    signalGeneration.incrementAndGet()
    sessionReplay.stop()
  }

  @ReactMethod
  fun flush() {
    sessionReplay.flush()
  }

  @ReactMethod
  fun teardown() {
    signalGeneration.incrementAndGet()
    signalActive = false
    sessionReplay.shutdown()
  }

  override fun invalidate() {
    signalGeneration.incrementAndGet()
    signalActive = false
    reactContext.removeLifecycleEventListener(this)
    if (::sessionReplay.isInitialized) {
      sessionReplay.shutdown()
    }
  }
}
