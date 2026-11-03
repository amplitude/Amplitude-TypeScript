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
  @Volatile private var sessionReplay: SessionReplay? = null
  // shouldRecord() reports sampling eligibility even while capture is stopped.
  // Track start/stop intent so signal availability also respects autoStart=false.
  @Volatile private var shouldStart = false
  @Volatile private var replayGeneration = 0

  // Android delivers events on the shared device emitter. These no-op methods
  // let NativeEventEmitter attach; iOS uses RCTEventEmitter for the same names.
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Double) {}

  @ReactMethod
  fun getInterfaceSignalState(promise: Promise) {
    val replay = sessionReplay
    val state = WritableNativeMap().apply {
      putBoolean("isProviding", reportInterfaceSignal())
      putString("sessionId", replay?.getSessionId()?.toString() ?: "-1")
      putString("deviceId", replay?.getDeviceId())
    }
    promise.resolve(state)
  }

  private var reportedProviding = false

  // Check availability and forward an optional UI/identity event in one synchronized report.
  // Detaching an active recorder must report a stop even before its first state query.
  @Synchronized
  private fun reportInterfaceSignal(
    interfaceChanged: Boolean = false,
    identityChanged: Boolean = false,
    detached: Boolean = false,
  ): Boolean {
    val currentlyProviding = shouldStart && sessionReplay?.shouldRecord() == true
    val isProviding = !detached && currentlyProviding
    val availabilityChanged = isProviding != reportedProviding || (detached && currentlyProviding)
    reportedProviding = isProviding

    val eventTypes = mutableListOf<String>()
    if (availabilityChanged) eventTypes.add(if (isProviding) "startProviding" else "stopProviding")
    if (interfaceChanged) eventTypes.add("interfaceChanged")
    if (identityChanged) eventTypes.add("identityChanged")
    if (eventTypes.isEmpty() || !reactContext.hasActiveCatalystInstance()) return isProviding
    val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    for (eventType in eventTypes) {
      val signal = Arguments.createMap().apply {
        putString("type", eventType)
        putDouble("timestamp", System.currentTimeMillis().toDouble())
      }
      emitter.emit("PluginSessionReplayReactNativeInterfaceSignal", signal)
    }
    return isProviding
  }

  override fun getName(): String {
    return "PluginSessionReplayReactNative"
  }

  @ReactMethod
  fun setup(apiKey: String, deviceId: String?, sessionId: Double, serverZone: String?, sampleRate: Double, enableRemoteConfig: Boolean, logLevel: Int, autoStart: Boolean, maskLevel: String) {
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

    val generation = ++replayGeneration
    reportInterfaceSignal(detached = true)
    sessionReplay?.shutdown()
    shouldStart = autoStart
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
      uiChangeCallback = {
        if (generation == replayGeneration) {
          reportInterfaceSignal(interfaceChanged = true)
        }
      }
    )
    reportInterfaceSignal()
  }

  @ReactMethod
  fun setSessionId(sessionId: Double) {
    val replay = sessionReplay
    val changed = replay != null && replay.getSessionId() != sessionId.toLong()
    replay?.setSessionId(sessionId.toLong())
    reportInterfaceSignal(identityChanged = changed)
  }

  @ReactMethod
  fun getSessionId(promise: Promise) {
    promise.resolve(sessionReplay?.getSessionId()?.toDouble() ?: -1.0)
  }

  @ReactMethod
  fun getSessionReplayProperties(promise: Promise) {
    val properties: Map<String, Any> = sessionReplay?.getSessionReplayProperties() ?: emptyMap()
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
    shouldStart = true
    sessionReplay?.start()
    reportInterfaceSignal()
  }

  @ReactMethod
  fun stop() {
    shouldStart = false
    sessionReplay?.stop()
    reportInterfaceSignal()
  }

  @ReactMethod
  fun flush() {
    sessionReplay?.flush()
  }

  @ReactMethod
  fun teardown() {
    replayGeneration++
    reportInterfaceSignal(detached = true)
    shouldStart = false
    sessionReplay?.shutdown()
    sessionReplay = null
  }

  override fun invalidate() {
    replayGeneration++
    reportedProviding = false
    shouldStart = false
    sessionReplay?.shutdown()
    sessionReplay = null
  }
}
