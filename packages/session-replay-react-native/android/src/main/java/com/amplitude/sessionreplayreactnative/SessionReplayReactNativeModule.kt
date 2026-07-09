package com.amplitude.sessionreplayreactnative

import com.amplitude.android.sessionreplay.SessionReplay
import com.amplitude.android.sessionreplay.config.MaskLevel
import com.amplitude.android.sessionreplay.config.PrivacyConfig
import com.amplitude.common.Logger
import com.amplitude.common.android.LogcatLogger
import com.amplitude.core.ServerZone
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.bridge.ReadableMap

// `@ReactMethod` is required on the legacy architecture and ignored on the new
// one, so it stays on the overrides below.
class SessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  SessionReplayReactNativeSpec(reactContext) {
  private lateinit var sessionReplay: SessionReplay
  @Volatile private var invalidated = false

  override fun getName(): String {
    return NAME
  }

  @ReactMethod
  override fun setup(config: ReadableMap, promise: Promise) {
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
        apiKey = apiKey,
        context = reactContext.applicationContext,
        deviceId = deviceId ?: "",
        sessionId = sessionId,
        optOut = optOut,
        sampleRate = sampleRate,
        logger = LogcatLogger.logger,
        enableRemoteConfig = enableRemoteConfig,
        serverZone = when (serverZone) {
          "EU" -> ServerZone.EU
          else -> ServerZone.US
        },
        // Deferred to the UI-thread block below so primitive registration can
        // be ordered before start(); behaviorally identical to SDK autoStart.
        autoStart = false,
        privacyConfig = PrivacyConfig(maskLevel = maskLevel),
      )

      // Register the primitive, start capture, and resolve in ONE UI-thread
      // block: the registry is UI-thread-only, and registration must precede
      // start() on the capture (UI) thread so an early capture frame can't
      // snapshot SRMaskView children before their masking intents apply.
      // Re-registering on repeated setup() calls is harmless.
      UiThreadUtil.runOnUiThread {
        if (invalidated) {
          promise.reject("SETUP_ERROR", "Session Replay module was invalidated before setup completed", null)
          return@runOnUiThread
        }
        try {
          SRMaskingRegistry.setPrimitive(SRDefaultMaskingPrimitive())
          if (autoStart) {
            sessionReplay.start()
          }
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("SETUP_ERROR", e.message, e)
        }
      }
    } catch (e: Exception) {
      promise.reject("SETUP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setSessionId(sessionId: Double, promise: Promise) {
    try {
      sessionReplay.setSessionId(sessionId.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setDeviceId(deviceId: String?, promise: Promise) {
    try {
      sessionReplay.setDeviceId(deviceId ?: "")
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_DEVICE_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun getSessionId(promise: Promise) {
    try {
      promise.resolve(sessionReplay.getSessionId().toDouble())
    } catch (e: Exception) {
      promise.reject("GET_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun getSessionReplayProperties(promise: Promise) {
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
  override fun start(promise: Promise) {
    try {
      sessionReplay.start()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("START_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun stop(promise: Promise) {
    try {
      sessionReplay.stop()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("STOP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun flush(promise: Promise) {
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
    invalidated = true
    // Serialize teardown with the deferred setup() block: both run on the UI
    // queue, so a mid-setup invalidate can no longer interleave — shutdown
    // always runs either before the block (flag rejects it) or after start()
    // (normal stop).
    UiThreadUtil.runOnUiThread {
      if (::sessionReplay.isInitialized) {
        sessionReplay.shutdown()
      }
    }
  }

  companion object {
    const val NAME = "AMPNativeSessionReplay"
  }
}
