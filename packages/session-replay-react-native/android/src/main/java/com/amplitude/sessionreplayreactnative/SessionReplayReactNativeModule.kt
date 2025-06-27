package com.amplitude.sessionreplayreactnative

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
import com.facebook.react.bridge.ReadableMap

class SessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private lateinit var sessionReplay: SessionReplay

  override fun getName(): String {
    return "NativeSessionReplay"
  }

  @ReactMethod
  fun setup(config: ReadableMap, promise: Promise) {
    try {
      val apiKey = config.getString("apiKey") ?: throw IllegalArgumentException("apiKey is required")
      val deviceId = config.getString("deviceId")
      val sessionId = config.getDouble("sessionId").toLong()
      val serverZone = config.getString("serverZone") ?: "US"
      val sampleRate = config.getDouble("sampleRate")
      val enableRemoteConfig = config.getBoolean("enableRemoteConfig")
      val logLevel = config.getInt("logLevel")
      val autoStart = config.getBoolean("autoStart")
      val optOut = config.getBoolean("optOut")
      val maskLevel = when ((config.getString("maskLevel") ?: "medium").lowercase()) {
        "light" -> MaskLevel.LIGHT
        "medium" -> MaskLevel.MEDIUM
        "conservative" -> MaskLevel.CONSERVATIVE
        else -> MaskLevel.MEDIUM
      }

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
          Server Zone: $serverZone
          Sample Rate: $sampleRate
          Enable Remote Config: $enableRemoteConfig
          Log Level: $logLevel
          Auto Start: $autoStart
          Mask Level: $maskLevel
          Opt Out: $optOut
      """.trimIndent())

      sessionReplay = SessionReplay(
        apiKey,
        reactContext.applicationContext,
        deviceId ?: "",
        sessionId,
        logger = LogcatLogger.logger,
        sampleRate = sampleRate,
        enableRemoteConfig = enableRemoteConfig,
        serverZone = when (serverZone) {
          "EU" -> ServerZone.EU
          else -> ServerZone.US
        },
        autoStart = autoStart,
        privacyConfig = PrivacyConfig(maskLevel = maskLevel),
      )
      
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SETUP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setSessionId(sessionId: Double, promise: Promise) {
    try {
      sessionReplay.setSessionId(sessionId.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setDeviceId(deviceId: String?, promise: Promise) {
    try {
      sessionReplay.setDeviceId(deviceId ?: "")
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_DEVICE_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getSessionId(promise: Promise) {
    try {
      promise.resolve(sessionReplay.getSessionId().toDouble())
    } catch (e: Exception) {
      promise.reject("GET_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getSessionReplayProperties(promise: Promise) {
    try {
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
    } catch (e: Exception) {
      promise.reject("GET_PROPERTIES_ERROR", e.message, e)
    }
  }
  
  @ReactMethod
  fun start(promise: Promise) {
    try {
      sessionReplay.start()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("START_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      sessionReplay.stop()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("STOP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun flush(promise: Promise) {
    try {
      sessionReplay.flush()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("FLUSH_ERROR", e.message, e)
    }
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
