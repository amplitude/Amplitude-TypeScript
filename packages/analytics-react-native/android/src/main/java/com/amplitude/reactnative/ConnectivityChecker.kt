package com.amplitude.reactnative

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
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
 * Connectivity is monitored with [ConnectivityManager] on API 23+; below that
 * [currentConnectivity] best-effort reports online.
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

    // Last known connectivity state, used to dedupe repeated same-state callbacks.
    @Volatile
    internal var isConnected = true
        private set

    /**
     * Lazily registers the network callback. Idempotent: a second call while a
     * callback is already registered is a no-op.
     */
    @Synchronized
    @SuppressLint("ObsoleteSdkInt")
    fun start() {
        if (networkCallback != null) {
            return
        }
        // Offline mode requires API 23+; below that leave monitoring unregistered and rely
        // on the best-effort online seed.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return
        }
        val manager = connectivityManager ?: return

        isConnected = currentConnectivity()

        // Re-derive the real state from the active network on every event rather than
        // trusting the event type: onAvailable can fire before the network is VALIDATED
        // (or for a captive portal), and the API 23 request-based callback reports onLost
        // for a non-default network while another is still up. currentConnectivity()
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
        } catch (e: RuntimeException) {
            // Registration can throw SecurityException (missing ACCESS_NETWORK_STATE) or
            // RuntimeException ("Too many NetworkRequests filed" at the per-uid limit). Leave
            // the callback unregistered and best-effort report online so a failed probe never
            // pins the SDK offline.
            isConnected = true
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
    // assumes online (true) whenever it can't tell — no ConnectivityManager, missing
    // ACCESS_NETWORK_STATE, or a query that throws (SecurityException / a device
    // ConnectivityManager crash, see Amplitude-Kotlin issues #220/#197, or an OEM-fork
    // LinkageError) — so we never pin the SDK offline and wrongly suppress sends.
    // VirtualMachineError (OOM/StackOverflow) still propagates.
    @SuppressLint("ObsoleteSdkInt")
    fun currentConnectivity(): Boolean {
        try {
            val manager = connectivityManager ?: return true
            // Offline mode requires API 23+ (NetworkCapabilities validation). Below that we
            // best-effort report online so we never suppress sends on unsupported devices.
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                return true
            }
            // Without ACCESS_NETWORK_STATE the ConnectivityManager queries can return null
            // (rather than throw) and pin us offline; treat a missing permission as online.
            if (context.checkSelfPermission(Manifest.permission.ACCESS_NETWORK_STATE) != PackageManager.PERMISSION_GRANTED) {
                return true
            }
            val network = manager.activeNetwork ?: return false
            val capabilities = manager.getNetworkCapabilities(network) ?: return false
            return hasInternetCapability(capabilities)
        } catch (e: Exception) {
            return true
        } catch (e: LinkageError) {
            // OEM-forked ConnectivityManager/NetworkCapabilities can throw linkage errors
            // (e.g. NoSuchMethodError); best-effort online rather than crash.
            return true
        }
    }

    // Decides whether a given network counts as usable internet (shared by the seed and
    // live capability-change events). Only invoked from the API 23+ path in
    // [currentConnectivity]; NET_CAPABILITY_VALIDATED was added in API 23 (M).
    @SuppressLint("NewApi")
    internal fun hasInternetCapability(capabilities: NetworkCapabilities): Boolean {
        // Require both NET_CAPABILITY_INTERNET (advertised — still true on a captive portal)
        // and NET_CAPABILITY_VALIDATED (Android probed and confirmed real internet — false on
        // a captive portal, so we treat portals as offline and queue rather than lose events).
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
