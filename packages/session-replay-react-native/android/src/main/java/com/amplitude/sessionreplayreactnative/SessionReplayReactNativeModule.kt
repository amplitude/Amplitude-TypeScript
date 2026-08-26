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
import com.facebook.react.bridge.ReadableMap

// `@ReactMethod` is required on the legacy architecture and ignored on the new
// one, so it stays on the overrides below.
class SessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  SessionReplayReactNativeSpec(reactContext) {
  private data class NativeConfig(
    val apiKey: String,
    val deviceId: String?,
    val sessionId: Long,
    val serverZone: String,
    val sampleRate: Double,
    val enableRemoteConfig: Boolean,
    val optOut: Boolean,
    val maskLevel: MaskLevel,
  )

  private var sessionReplay: SessionReplay? = null
  private var nativeConfig: NativeConfig? = null
  private var shouldStart = false

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
          Mask Level: $maskLevel
          Opt Out: $optOut
      """.trimIndent())

      nativeConfig = NativeConfig(
        apiKey = apiKey,
        deviceId = deviceId,
        sessionId = sessionId,
        serverZone = serverZone,
        sampleRate = sampleRate,
        enableRemoteConfig = enableRemoteConfig,
        optOut = optOut,
        maskLevel = maskLevel,
      )
      rebootSessionReplay(requireNotNull(nativeConfig))
      shouldStart = false

      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SETUP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setSessionId(sessionId: Double, promise: Promise) {
    try {
      nativeConfig = requireNotNull(nativeConfig).copy(sessionId = sessionId.toLong())
      sessionReplay?.setSessionId(sessionId.toLong())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setDeviceId(deviceId: String?, promise: Promise) {
    try {
      nativeConfig = requireNotNull(nativeConfig).copy(deviceId = deviceId)
      sessionReplay?.setDeviceId(deviceId ?: "")
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_DEVICE_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setOptOut(optOut: Boolean, promise: Promise) {
    try {
      val currentConfig = requireNotNull(nativeConfig)
      if (currentConfig.optOut == optOut) {
        promise.resolve(null)
        return
      }

      // session-replay-android has no public runtime opt-out setter, so retain
      // the bridge config and skip constructing the native SDK while opted out.
      // Create the next instance before shutting the current one down so a
      // constructor failure leaves native state unchanged (and retryable).
      val updatedConfig = currentConfig.copy(optOut = optOut)
      rebootSessionReplay(updatedConfig)
      nativeConfig = updatedConfig
      if (shouldStart && !optOut) {
        sessionReplay?.start()
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_OPT_OUT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun getSessionId(promise: Promise) {
    try {
      val sessionId = sessionReplay?.getSessionId() ?: nativeConfig?.sessionId
        ?: throw IllegalStateException("SessionReplay is not initialized")
      promise.resolve(sessionId.toDouble())
    } catch (e: Exception) {
      promise.reject("GET_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun start(promise: Promise) {
    try {
      shouldStart = true
      sessionReplay?.start()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("START_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun stop(promise: Promise) {
    try {
      shouldStart = false
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
      nativeConfig = null
      shouldStart = false
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("TEARDOWN_ERROR", e.message, e)
    }
  }

  override fun invalidate() {
    sessionReplay?.shutdown()
    sessionReplay = null
    nativeConfig = null
    shouldStart = false
  }

  private fun rebootSessionReplay(config: NativeConfig) {
    val nextSessionReplay = if (config.optOut) {
      LogcatLogger.logger.debug("skipping SessionReplay init because optOut=true")
      null
    } else {
      createSessionReplay(config)
    }
    sessionReplay?.shutdown()
    sessionReplay = nextSessionReplay
  }

  private fun createSessionReplay(config: NativeConfig): SessionReplay {
    return SessionReplay(
      apiKey = config.apiKey,
      context = reactContext.applicationContext,
      deviceId = config.deviceId ?: "",
      sessionId = config.sessionId,
      optOut = config.optOut,
      sampleRate = config.sampleRate,
      logger = LogcatLogger.logger,
      enableRemoteConfig = config.enableRemoteConfig,
      serverZone = when (config.serverZone) {
        "EU" -> ServerZone.EU
        else -> ServerZone.US
      },
      autoStart = false,
      privacyConfig = PrivacyConfig(maskLevel = config.maskLevel),
    )
  }

  companion object {
    const val NAME = "AMPNativeSessionReplay"
  }
}
