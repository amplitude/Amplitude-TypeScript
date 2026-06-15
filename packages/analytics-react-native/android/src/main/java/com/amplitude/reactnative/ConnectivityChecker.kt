package com.amplitude.reactnative

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build

/**
 * Framework-free connectivity logic extracted from
 * [AmplitudeReactNativeConnectivityModule] so it can be unit-tested with
 * Robolectric without React Native on the classpath. The module owns the React
 * bridge (promise resolution + event emission); this class owns everything that
 * only depends on the Android networking APIs.
 *
 * Connectivity is monitored with [ConnectivityManager]. `registerDefaultNetworkCallback`
 * is API 24+, while `minSdkVersion` is 21, so we fall back to
 * `registerNetworkCallback(NetworkRequest, callback)` on API 21–23.
 *
 * @param onConnectivityChanged invoked (off the registration thread) whenever the
 *   connectivity state actually changes — repeated same-state callbacks are deduped.
 */
internal class ConnectivityChecker(
    private val context: Context,
    private val onConnectivityChanged: (Boolean) -> Unit,
) {
    private val connectivityManager: ConnectivityManager?
        get() = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // Last known connectivity state, used to seed JS and to dedupe.
    @Volatile
    internal var isConnected = true
        private set

    /**
     * Lazily registers the network callback. Idempotent: a second call while a
     * callback is already registered is a no-op.
     */
    @Synchronized
    fun start() {
        if (networkCallback != null) {
            return
        }
        val manager = connectivityManager ?: return

        // Seed the current state so we don't wait for the first change to know
        // whether we're online.
        isConnected = currentConnectivity()

        // Re-derive the real state from the active network on every event rather than
        // trusting the event type: onAvailable can fire before the network is VALIDATED
        // (or for a captive portal), and the API 21-23 request-based callback reports
        // onLost for a non-default network while another is still up. currentConnectivity()
        // reflects the active, validated network in both cases.
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handleConnectivityChange(currentConnectivity())
            }

            override fun onLost(network: Network) {
                handleConnectivityChange(currentConnectivity())
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                handleConnectivityChange(currentConnectivity())
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
    fun stop() {
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
        onConnectivityChanged(connected)
    }

    // Reads the device's current online state from the active network. Best-effort:
    // assumes online (true) whenever it can't tell — no ConnectivityManager, or a query
    // that throws (missing ACCESS_NETWORK_STATE -> SecurityException, or a device
    // ConnectivityManager crash; see Amplitude-Kotlin issues #220/#197) — so we never
    // pin the SDK offline and wrongly suppress sends.
    fun currentConnectivity(): Boolean {
        try {
            val manager = connectivityManager ?: return true
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val network = manager.activeNetwork ?: return false
                val capabilities = manager.getNetworkCapabilities(network) ?: return false
                hasInternetCapability(capabilities)
            } else {
                @Suppress("DEPRECATION")
                manager.activeNetworkInfo?.isConnected ?: false
            }
        } catch (t: Throwable) {
            return true
        }
    }

    // Decides whether a given network counts as usable internet (shared by the seed and live capability-change events).
    internal fun hasInternetCapability(capabilities: NetworkCapabilities): Boolean {
        // NET_CAPABILITY_INTERNET: the network advertises internet access (still true on a captive portal).
        val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // NET_CAPABILITY_VALIDATED: Android probed and confirmed real internet (false on a captive portal); added in API 23 (M), so 21-22 require INTERNET only.
            hasInternet && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } else {
            hasInternet
        }
    }
}
