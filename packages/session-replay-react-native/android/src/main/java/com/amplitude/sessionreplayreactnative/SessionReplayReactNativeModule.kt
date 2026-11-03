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
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

// `@ReactMethod` is required on the legacy architecture and ignored on the new
// one, so it stays on the overrides below.
class SessionReplayReactNativeModule(private val reactContext: ReactApplicationContext) :
  SessionReplayReactNativeSpec(reactContext) {
  private data class NativeConfig(
    val apiKey: String,
    val deviceId: String?,
    val customSessionId: String,
    val serverZone: String,
    val sampleRate: Double,
    val enableRemoteConfig: Boolean,
    val optOut: Boolean,
    val maskLevel: MaskLevel,
  )

  @Volatile private var sessionReplay: SessionReplay? = null
  private var nativeConfig: NativeConfig? = null
  // shouldRecord() alone does not account for setup/start/stop state.
  @Volatile private var shouldStart = false
  @Volatile private var replayGeneration = 0

  // Android uses the shared device emitter; iOS uses these spec methods to
  // manage RCTEventEmitter observation.
  @ReactMethod
  override fun addListener(eventName: String) {}

  @ReactMethod
  override fun removeListeners(count: Double) {}

  @ReactMethod
  override fun getInterfaceSignalState(promise: Promise) {
    try {
      // The SDK instance is deliberately absent while opted out, but opting out
      // does not clear identity. Keep recording state instance-derived while
      // falling back to the retained configuration for identity.
      val replay = sessionReplay
      val config = nativeConfig
      val state = Arguments.createMap().apply {
        putBoolean("isProviding", reportInterfaceSignal())
        putString("sessionId", replay?.getCustomSessionId() ?: config?.customSessionId ?: "-1")
        // The SDK is constructed with "" for a null device id; report null so the
        // value matches iOS and the opted-out fallback.
        val deviceId = replay?.getDeviceId()?.takeIf { it.isNotEmpty() } ?: config?.deviceId
        if (deviceId == null) putNull("deviceId") else putString("deviceId", deviceId)
      }
      promise.resolve(state)
    } catch (e: Exception) {
      promise.reject("INTERFACE_SIGNAL_ERROR", e.message, e)
    }
  }

  private var reportedProviding = false

  // Check availability and forward an optional UI/identity event in one synchronized report.
  // Detaching an active recorder must report a stop even before its first state query.
  @Synchronized
  private fun reportInterfaceSignal(type: String? = null, detached: Boolean = false): Boolean {
    val currentlyProviding = shouldStart && sessionReplay?.shouldRecord() == true
    val isProviding = !detached && currentlyProviding
    val availabilityChanged = isProviding != reportedProviding || (detached && currentlyProviding)
    reportedProviding = isProviding

    val eventTypes = mutableListOf<String>()
    if (availabilityChanged) eventTypes.add(if (isProviding) "startProviding" else "stopProviding")
    if (type != null) eventTypes.add(type)
    if (eventTypes.isEmpty() || !reactContext.hasActiveCatalystInstance()) return isProviding
    val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    for (eventType in eventTypes) {
      val signal = Arguments.createMap().apply {
        putString("type", eventType)
        putDouble("timestamp", System.currentTimeMillis().toDouble())
      }
      emitter.emit("AMPNativeSessionReplayInterfaceSignal", signal)
    }
    return isProviding
  }

  override fun getName(): String {
    return NAME
  }

  @ReactMethod
  override fun setup(config: ReadableMap, promise: Promise) {
    try {
      val apiKey = config.getString("apiKey") ?: throw IllegalArgumentException("apiKey is required")
      val deviceId = config.getString("deviceId")
      val customSessionId = config.getString("customSessionId")
        ?: throw IllegalArgumentException("customSessionId is required")
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
          Custom Session Id: $customSessionId
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
        customSessionId = customSessionId,
        serverZone = serverZone,
        sampleRate = sampleRate,
        enableRemoteConfig = enableRemoteConfig,
        optOut = optOut,
        maskLevel = maskLevel,
      )
      rebootSessionReplay(requireNotNull(nativeConfig))
      shouldStart = false
      reportInterfaceSignal()

      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SETUP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setCustomSessionId(customSessionId: String, promise: Promise) {
    try {
      val currentConfig = requireNotNull(nativeConfig)
      val currentId = sessionReplay?.getCustomSessionId() ?: currentConfig.customSessionId
      sessionReplay?.setCustomSessionId(customSessionId)
      nativeConfig = currentConfig.copy(customSessionId = customSessionId)
      reportInterfaceSignal(if (currentId != customSessionId) "identityChanged" else null)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_CUSTOM_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun getDeviceId(promise: Promise) {
    promise.resolve(sessionReplay?.getDeviceId())
  }

  @ReactMethod
  override fun getCustomSessionId(promise: Promise) {
    try {
      promise.resolve(sessionReplay?.getCustomSessionId() ?: nativeConfig?.customSessionId ?: "-1")
    } catch (e: Exception) {
      promise.reject("GET_CUSTOM_SESSION_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun setDeviceId(deviceId: String?, promise: Promise) {
    try {
      val currentConfig = requireNotNull(nativeConfig)
      val currentId = sessionReplay?.getDeviceId() ?: currentConfig.deviceId.orEmpty()
      sessionReplay?.setDeviceId(deviceId ?: "")
      nativeConfig = currentConfig.copy(deviceId = deviceId)
      reportInterfaceSignal(if (currentId != deviceId.orEmpty()) "identityChanged" else null)
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
      reportInterfaceSignal()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_OPT_OUT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  override fun start(promise: Promise) {
    try {
      shouldStart = true
      sessionReplay?.start()
      reportInterfaceSignal()
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
      reportInterfaceSignal()
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
      replayGeneration++
      reportInterfaceSignal(detached = true)
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
    replayGeneration++
    reportedProviding = false
    sessionReplay?.shutdown()
    sessionReplay = null
    nativeConfig = null
    shouldStart = false
  }

  private fun rebootSessionReplay(config: NativeConfig) {
    val nextGeneration = replayGeneration + 1
    val nextSessionReplay = if (config.optOut) {
      LogcatLogger.logger.debug("skipping SessionReplay init because optOut=true")
      null
    } else {
      createSessionReplay(config, nextGeneration)
    }
    replayGeneration = nextGeneration
    reportInterfaceSignal(detached = true)
    sessionReplay?.shutdown()
    sessionReplay = nextSessionReplay
  }

  private fun createSessionReplay(config: NativeConfig, generation: Int): SessionReplay {
    val sessionReplay = SessionReplay(
      apiKey = config.apiKey,
      context = reactContext.applicationContext,
      deviceId = config.deviceId ?: "",
      sessionId = -1L,
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
      uiChangeCallback = {
        if (generation == replayGeneration) {
          reportInterfaceSignal("interfaceChanged")
        }
      },
    )
    sessionReplay.setCustomSessionId(config.customSessionId)
    return sessionReplay
  }

  companion object {
    const val NAME = "AMPNativeSessionReplay"
  }
}
