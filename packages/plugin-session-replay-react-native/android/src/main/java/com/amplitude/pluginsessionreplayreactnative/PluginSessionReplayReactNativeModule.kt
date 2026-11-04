package com.amplitude.pluginsessionreplayreactnative

import android.os.Handler
import android.os.Looper
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
  // SDK start/stop work is dispatched asynchronously. Gate signal availability
  // immediately on bridge intent, including autoStart=false and a pending stop.
  @Volatile private var shouldStart = false
  @Volatile private var replayGeneration = 0

  private val signalHandler = Handler(Looper.getMainLooper())
  private var signalObservers = 0
  private var signalSequence = 0L
  private var reportedProviding = false
  private var reportedSessionId: String? = null
  private var reportedDeviceId: String? = null
  private var hasReportedState = false

  // The SDK has no availability callback. Observe asynchronous start/sampling/
  // memory changes while JS is subscribed, including when the UI is motionless.
  private val checkSignalState = object : Runnable {
    override fun run() {
      synchronized(this@PluginSessionReplayReactNativeModule) {
        if (signalObservers == 0) return
        reportInterfaceSignal()
        signalHandler.postDelayed(this, 100L)
      }
    }
  }

  @ReactMethod
  @Synchronized
  fun observeInterfaceSignals(promise: Promise) {
    try {
      val initial = reportInterfaceSignal(snapshot = true)
      signalObservers++
      if (signalObservers == 1) signalHandler.post(checkSignalState)
      promise.resolve(initial)
    } catch (e: Exception) {
      promise.reject("INTERFACE_SIGNAL_ERROR", e.message, e)
    }
  }

  @ReactMethod
  @Synchronized
  fun stopObservingInterfaceSignals() {
    signalObservers = (signalObservers - 1).coerceAtLeast(0)
    if (signalObservers == 0) signalHandler.removeCallbacks(checkSignalState)
  }

  @Synchronized
  private fun reportInterfaceSignal(
    interfaceChanged: Boolean = false,
    identityChanged: Boolean = false,
    detached: Boolean = false,
    snapshot: Boolean = false,
  ): WritableMap {
    val replay = sessionReplay
    val sessionId = replay?.getSessionId()?.toString() ?: "-1"
    val deviceId = replay?.getDeviceId()?.takeIf { it.isNotEmpty() }
    val currentlyProviding = shouldStart && replay?.shouldRecord() == true
    val isProviding = !detached && currentlyProviding
    val availabilityChanged = isProviding != reportedProviding || (detached && currentlyProviding)
    val changedIdentity = identityChanged ||
      (hasReportedState && (sessionId != reportedSessionId || deviceId != reportedDeviceId))
    reportedProviding = isProviding
    reportedSessionId = sessionId
    reportedDeviceId = deviceId
    hasReportedState = true
    val signal = Arguments.createMap().apply {
      putBoolean("interfaceChanged", interfaceChanged)
      putBoolean("identityChanged", changedIdentity)
      putBoolean("isProviding", isProviding)
      putString("sessionId", sessionId)
      if (deviceId == null) putNull("deviceId") else putString("deviceId", deviceId)
      putDouble("timestamp", System.currentTimeMillis().toDouble())
      putDouble("sequence", (++signalSequence).toDouble())
    }
    if (signalObservers > 0 && (snapshot || availabilityChanged || interfaceChanged || changedIdentity) &&
      reactContext.hasActiveCatalystInstance()) {
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("PluginSessionReplayReactNativeInterfaceSignal", if (snapshot) signal.copy() else signal)
    }
    return signal
  }

  override fun getName(): String {
    return "PluginSessionReplayReactNative"
  }

  @ReactMethod
  @Synchronized
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
    reportInterfaceSignal(snapshot = true)
  }

  @ReactMethod
  @Synchronized
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
  @Synchronized
  fun start() {
    shouldStart = true
    sessionReplay?.start()
    reportInterfaceSignal()
  }

  @ReactMethod
  @Synchronized
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
  @Synchronized
  fun teardown() {
    replayGeneration++
    reportInterfaceSignal(detached = true)
    shouldStart = false
    sessionReplay?.shutdown()
    sessionReplay = null
  }

  @Synchronized
  override fun invalidate() {
    signalObservers = 0
    signalHandler.removeCallbacks(checkSignalState)
    replayGeneration++
    reportedProviding = false
    shouldStart = false
    sessionReplay?.shutdown()
    sessionReplay = null
  }
}
