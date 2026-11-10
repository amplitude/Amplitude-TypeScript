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
  @Volatile private var recordingRequested = false
  @Volatile private var invalidated = false
  @Volatile private var uiChangeReceiver: Any? = null
  private var listenerCount = 0

  private fun emitUiChange(receiver: Any) {
    val timestamp = System.currentTimeMillis().toDouble()
    synchronized(this) {
      if (listenerCount == 0 || uiChangeReceiver !== receiver || invalidated || !recordingRequested ||
        !reactContext.hasActiveReactInstance()) return
      try {
        val signal = Arguments.createMap().apply { putDouble("timestamp", timestamp) }
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("amplitudeSessionReplayUiChange", signal)
      } catch (_: RuntimeException) {
        // The React instance can be destroyed between the check and the emission.
      }
    }
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

    synchronized(this) {
      uiChangeReceiver = null
      recordingRequested = false
    }
    if (::sessionReplay.isInitialized) sessionReplay.shutdown()
    val receiver = Any()
    synchronized(this) {
      if (invalidated) return
      uiChangeReceiver = receiver
      recordingRequested = autoStart
    }
    // Capture may report a UI change before its constructor/start call returns.
    try {
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
        uiChangeCallback = { emitUiChange(receiver) }
      )
    } catch (error: Exception) {
      synchronized(this) {
        if (uiChangeReceiver === receiver) {
          uiChangeReceiver = null
          recordingRequested = false
        }
      }
      throw error
    }
  }

  @ReactMethod
  fun isRecording(promise: Promise) {
    promise.resolve(recordingRequested && ::sessionReplay.isInitialized && sessionReplay.shouldRecord())
  }

  @ReactMethod
  fun addListener(eventName: String) {
    synchronized(this) {
      if (!invalidated) listenerCount++
    }
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    synchronized(this) {
      listenerCount = (listenerCount - count.toInt().coerceAtLeast(0)).coerceAtLeast(0)
    }
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
    val (receiver, previousRequest) = synchronized(this) {
      if (invalidated) return
      val previousRequest = recordingRequested
      recordingRequested = true
      Pair(uiChangeReceiver, previousRequest)
    }
    try {
      sessionReplay.start()
    } catch (error: Exception) {
      synchronized(this) {
        if (!invalidated && uiChangeReceiver === receiver) recordingRequested = previousRequest
      }
      throw error
    }
  }

  @ReactMethod
  fun stop() {
    recordingRequested = false
    sessionReplay.stop()
  }

  @ReactMethod
  fun flush() {
    sessionReplay.flush()
  }

  @ReactMethod
  fun teardown() {
    synchronized(this) { uiChangeReceiver = null }
    recordingRequested = false
    sessionReplay.shutdown()
  }

  override fun invalidate() {
    synchronized(this) {
      invalidated = true
      uiChangeReceiver = null
      listenerCount = 0
    }
    recordingRequested = false
    if (::sessionReplay.isInitialized) {
      sessionReplay.shutdown()
    }
  }
}
