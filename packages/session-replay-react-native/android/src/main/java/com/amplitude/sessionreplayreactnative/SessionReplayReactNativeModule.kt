package com.amplitude.sessionreplayreactnative

import android.os.Handler
import android.os.Looper
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
import com.facebook.react.bridge.WritableMap
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
  @Volatile private var nativeConfig: NativeConfig? = null
  // Gate availability immediately while asynchronous SDK start/stop work is pending.
  @Volatile private var shouldStart = false
  @Volatile private var replayGeneration = 0

  // Android uses the shared device emitter; iOS uses these spec methods to
  // manage RCTEventEmitter observation.
  @ReactMethod
  override fun addListener(eventName: String) {}

  @ReactMethod
  override fun removeListeners(count: Double) {}

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
      synchronized(this@SessionReplayReactNativeModule) {
        if (signalObservers == 0) return
        reportInterfaceSignal()
        signalHandler.postDelayed(this, 100L)
      }
    }
  }

  @ReactMethod
  @Synchronized
  override fun observeInterfaceSignals(promise: Promise) {
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
  override fun stopObservingInterfaceSignals() {
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
    val config = nativeConfig
    val sessionId = replay?.getCustomSessionId() ?: config?.customSessionId ?: "-1"
    val deviceId = (replay?.getDeviceId() ?: config?.deviceId)?.takeIf { it.isNotEmpty() }
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
        .emit("AMPNativeSessionReplayInterfaceSignal", if (snapshot) signal.copy() else signal)
    }
    return signal
  }

  override fun getName(): String {
    return NAME
  }

  @ReactMethod
  @Synchronized
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
  @Synchronized
  override fun setCustomSessionId(customSessionId: String, promise: Promise) {
    try {
      val currentConfig = requireNotNull(nativeConfig)
      val currentId = sessionReplay?.getCustomSessionId() ?: currentConfig.customSessionId
      sessionReplay?.setCustomSessionId(customSessionId)
      nativeConfig = currentConfig.copy(customSessionId = customSessionId)
      reportInterfaceSignal(identityChanged = currentId != customSessionId)
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
  @Synchronized
  override fun setDeviceId(deviceId: String?, promise: Promise) {
    try {
      val currentConfig = requireNotNull(nativeConfig)
      val currentId = sessionReplay?.getDeviceId() ?: currentConfig.deviceId.orEmpty()
      sessionReplay?.setDeviceId(deviceId ?: "")
      nativeConfig = currentConfig.copy(deviceId = deviceId)
      reportInterfaceSignal(identityChanged = currentId != deviceId.orEmpty())
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SET_DEVICE_ID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  @Synchronized
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
  @Synchronized
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
  @Synchronized
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
  @Synchronized
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

  @Synchronized
  override fun invalidate() {
    signalObservers = 0
    signalHandler.removeCallbacks(checkSignalState)
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
          reportInterfaceSignal(interfaceChanged = true)
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
