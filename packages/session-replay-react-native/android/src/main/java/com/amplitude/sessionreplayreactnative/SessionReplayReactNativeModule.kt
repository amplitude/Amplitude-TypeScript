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
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.bridge.ReadableMap

private data class StoredSessionReplayConfig(
  val apiKey: String,
  val deviceId: String,
  val sessionId: Long,
  val serverZone: String,
  val sampleRate: Double,
  val enableRemoteConfig: Boolean,
  val maskLevel: MaskLevel,
)

// `@ReactMethod` is required on the legacy architecture and ignored on the new
// one, so it stays on the overrides below.
class SessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  SessionReplayReactNativeSpec(reactContext) {
  private var sessionReplay: SessionReplay? = null
  private var lastConfig: StoredSessionReplayConfig? = null
  // Matches Flutter: preserve "was started" across opt-out so opt-in can resume.
  private var wasStarted: Boolean = false
  private var optedOut: Boolean = false

  override fun getName(): String {
    return NAME
  }

  @ReactMethod
  override fun setup(config: ReadableMap, promise: Promise) {
    try {
      val apiKey = config.getString("apiKey") ?: throw IllegalArgumentException("apiKey is required")
      val deviceId = config.getString("deviceId") ?: ""
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

      lastConfig = StoredSessionReplayConfig(
        apiKey = apiKey,
        deviceId = deviceId,
        sessionId = sessionId,
        serverZone = serverZone,
        sampleRate = sampleRate,
        enableRemoteConfig = enableRemoteConfig,
        maskLevel = maskLevel,
      )
      optedOut = optOut
      wasStarted = autoStart && !optOut
      createSessionReplay(optOut = optOut, autoStart = autoStart)

      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SETUP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setSessionId(sessionId: Double, promise: Promise) {
    try {
      val id = sessionId.toLong()
      lastConfig = lastConfig?.copy(sessionId = id)
      sessionReplay?.setSessionId(id)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setDeviceId(deviceId: String?, promise: Promise) {
    try {
      val id = deviceId ?: ""
      lastConfig = lastConfig?.copy(deviceId = id)
      sessionReplay?.setDeviceId(id)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_DEVICE_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun getSessionId(promise: Promise) {
    try {
      val id = sessionReplay?.getSessionId() ?: lastConfig?.sessionId
      if (id == null) {
        promise.reject("GET_SESSION_ID_ERROR", "SessionReplay is not initialized", null)
        return
      }
      promise.resolve(id.toDouble())
    } catch (e: Exception) {
      promise.reject("GET_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun getSessionReplayProperties(promise: Promise) {
    try {
      if (optedOut) {
        promise.resolve(WritableNativeMap())
        return
      }
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
    } catch (e: Exception) {
      promise.reject("GET_PROPERTIES_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun start(promise: Promise) {
    try {
      if (optedOut) {
        LogcatLogger.logger.debug("start skipped: opted out")
        promise.resolve(null)
        return
      }
      val replay = sessionReplay
      if (replay == null) {
        promise.reject("START_ERROR", "SessionReplay is not initialized", null)
        return
      }
      wasStarted = true
      replay.start()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("START_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun stop(promise: Promise) {
    try {
      wasStarted = false
      sessionReplay?.stop()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("STOP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun flush(promise: Promise) {
    try {
      sessionReplay?.flush()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("FLUSH_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun teardown(promise: Promise) {
    try {
      sessionReplay?.shutdown()
      sessionReplay = null
      lastConfig = null
      wasStarted = false
      optedOut = false
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("TEARDOWN_ERROR", e.message, e)
    }
  }

  // Until session-replay-android exposes a public runtime setter (SDKA-78),
  // match Flutter: shutdown() without stop() so buffered data is not flushed,
  // then recreate on opt-in. Do not use stop()/start() as a stand-in.
  @ReactMethod
  override fun setOptOut(optOut: Boolean, promise: Promise) {
    try {
      if (lastConfig == null) {
        promise.reject("SET_OPT_OUT_ERROR", "SessionReplay is not initialized", null)
        return
      }
      optedOut = optOut
      if (optOut) {
        LogcatLogger.logger.debug(
          "setOptOut(true): shutting down native SessionReplay without stop()/flush (Flutter workaround until SDKA-78)",
        )
        sessionReplay?.shutdown()
        sessionReplay = null
      } else if (sessionReplay == null) {
        LogcatLogger.logger.debug(
          "setOptOut(false): recreating native SessionReplay; resume start=$wasStarted",
        )
        createSessionReplay(optOut = false, autoStart = false)
        if (wasStarted) {
          sessionReplay?.start()
        }
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_OPT_OUT_ERROR", e.message, e)
    }
  }

  override fun invalidate() {
    sessionReplay?.shutdown()
    sessionReplay = null
  }

  private fun createSessionReplay(optOut: Boolean, autoStart: Boolean) {
    val config = lastConfig ?: throw IllegalStateException("SessionReplay config is missing")
    sessionReplay = SessionReplay(
      apiKey = config.apiKey,
      context = reactContext.applicationContext,
      deviceId = config.deviceId,
      sessionId = config.sessionId,
      optOut = optOut,
      sampleRate = config.sampleRate,
      logger = LogcatLogger.logger,
      enableRemoteConfig = config.enableRemoteConfig,
      serverZone = when (config.serverZone) {
        "EU" -> ServerZone.EU
        else -> ServerZone.US
      },
      autoStart = autoStart,
      privacyConfig = PrivacyConfig(maskLevel = config.maskLevel),
    )
  }

  companion object {
    const val NAME = "AMPNativeSessionReplay"
  }
}
