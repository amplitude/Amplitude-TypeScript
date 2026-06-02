package com.amplitude.reactnative

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule

const val CONNECTIVITY_MODULE_NAME = "AmplitudeReactNativeConnectivity"
private const val CONNECTIVITY_EVENT_NAME = "AmplitudeNetworkConnectivityChanged"

/**
 * Connectivity-only native module bridged back to JS as
 * [CONNECTIVITY_MODULE_NAME]. It is intentionally separate from the
 * request/response [AmplitudeReactNativeModule] so its callback lifecycle stays
 * isolated.
 *
 * Connectivity is monitored with [ConnectivityManager]. `registerDefaultNetworkCallback`
 * is API 24+, while `minSdkVersion` is 21, so we fall back to
 * `registerNetworkCallback(NetworkRequest, callback)` on API 21–23.
 */
@ReactModule(name = CONNECTIVITY_MODULE_NAME)
class AmplitudeReactNativeConnectivityModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val connectivityManager: ConnectivityManager?
        get() = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // Last known connectivity state, used to seed JS and to dedupe.
    @Volatile
    private var isConnected = true

    override fun getName(): String {
        return CONNECTIVITY_MODULE_NAME
    }

    // Required so `NativeEventEmitter` doesn't warn on the JS side. The actual
    // registration is lazy (see [registerNetworkCallback]).
    @ReactMethod
    fun addListener(eventName: String) {
        registerNetworkCallback()
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // No-op: we keep the single callback registered for the lifetime of the
        // module and unregister it in invalidate()/onCatalystInstanceDestroy().
    }

    /**
     * Returns the current connectivity state. The network callback only fires on
     * subsequent changes, so JS reads this once on setup to seed the initial
     * `offline` value.
     */
    @ReactMethod
    fun getNetworkConnectivityStatus(promise: Promise) {
        promise.resolve(Arguments.createMap().apply { putBoolean("isConnected", currentConnectivity()) })
    }

    @Synchronized
    private fun registerNetworkCallback() {
        if (networkCallback != null) {
            return
        }
        val manager = connectivityManager ?: return

        // Seed the current state so we don't wait for the first change to know
        // whether we're online.
        isConnected = currentConnectivity()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handleConnectivityChange(true)
            }

            override fun onLost(network: Network) {
                handleConnectivityChange(false)
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                handleConnectivityChange(
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                )
            }
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                manager.registerDefaultNetworkCallback(callback)
            } else {
                val request = NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build()
                manager.registerNetworkCallback(request, callback)
            }
            networkCallback = callback
        } catch (e: SecurityException) {
            // Some devices throw if ACCESS_NETWORK_STATE is missing; leave the
            // callback unregistered and rely on the seeded state.
        }
    }

    @Synchronized
    private fun unregisterNetworkCallback() {
        val callback = networkCallback ?: return
        try {
            connectivityManager?.unregisterNetworkCallback(callback)
        } catch (e: IllegalArgumentException) {
            // Callback was not registered; ignore.
        }
        networkCallback = null
    }

    private fun handleConnectivityChange(connected: Boolean) {
        // Dedupe repeated same-state callbacks (e.g. onCapabilitiesChanged firing
        // multiple times) so JS doesn't flush-storm.
        if (isConnected == connected) {
            return
        }
        isConnected = connected
        emitConnectivityChange(connected)
    }

    private fun emitConnectivityChange(connected: Boolean) {
        if (!reactContext.hasActiveCatalystInstance()) {
            return
        }
        val params: WritableMap = Arguments.createMap().apply { putBoolean("isConnected", connected) }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(CONNECTIVITY_EVENT_NAME, params)
    }

    private fun currentConnectivity(): Boolean {
        val manager = connectivityManager ?: return true
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = manager.activeNetwork ?: return false
            val capabilities = manager.getNetworkCapabilities(network) ?: return false
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } else {
            @Suppress("DEPRECATION")
            manager.activeNetworkInfo?.isConnected ?: false
        }
    }

    override fun invalidate() {
        unregisterNetworkCallback()
        super.invalidate()
    }

    @Deprecated("Deprecated in Java")
    override fun onCatalystInstanceDestroy() {
        unregisterNetworkCallback()
        @Suppress("DEPRECATION")
        super.onCatalystInstanceDestroy()
    }
}
