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
 * @param onConnectivityChanged invoked once from [start] with the current state (to
 *   reconcile the JS seed) and thereafter whenever the connectivity state actually
 *   changes — repeated same-state callbacks are deduped. The consumer is expected to
 *   dedupe the same-state seed call.
 */
internal class ConnectivityChecker(
    private val context: Context,
    private val onConnectivityChanged: (Boolean) -> Unit,
) {
    private val connectivityManager: ConnectivityManager?
        get() = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // Whether the OS is blocking this app's traffic on the active network (Data Saver,
    // background data restriction, etc.) — a clear offline signal even when the network
    // itself is validated. Tracked from onBlockedStatusChanged (API 29+); always false
    // below that, where the OS never reports it.
    @Volatile
    private var blocked = false

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
        // for a non-default network while another is still up. effectiveConnectivity()
        // reflects the active, validated network — and whether we're blocked — in all cases.
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handleConnectivityChange(effectiveConnectivity())
            }

            override fun onLost(network: Network) {
                handleConnectivityChange(effectiveConnectivity())
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                handleConnectivityChange(effectiveConnectivity())
            }

            override fun onBlockedStatusChanged(network: Network, isBlocked: Boolean) {
                // API 29+. The network may be validated but the OS is blocking our traffic
                // (Data Saver / background restriction) — treat that as offline so we queue
                // instead of burning retries on sends that can only fail.
                blocked = isBlocked
                handleConnectivityChange(effectiveConnectivity())
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
            // Registration can throw SecurityException (missing ACCESS_NETWORK_STATE). See
            // Amplitude-Kotlin #220/#197. Leave the callback unregistered and best-effort
            // report online so a failed probe never pins the SDK offline.
            isConnected = true
        } catch (e: LinkageError) {
            // OEM-forked ConnectivityManager can throw linkage errors (e.g. NoSuchMethodError);
            // best-effort online rather than crash, matching currentConnectivity().
            isConnected = true
        } finally {
            // Push the authoritative post-start state to JS. JS reads its seed via
            // getNetworkConnectivityStatus before subscribing, so a connectivity flip in the gap
            // before this registration would otherwise strand JS on the stale seed: Android's own
            // immediate onAvailable is deduped against isConnected, and fires nothing at all when
            // offline. JS dedupes a same-state value, so this is a no-op when nothing changed.
            onConnectivityChanged(isConnected)
        }
    }

    @Synchronized
    fun stop() {
        val callback = networkCallback ?: return
        try {
            connectivityManager?.unregisterNetworkCallback(callback)
        } catch (e: RuntimeException) {
            // unregister can throw IllegalArgumentException (callback never registered),
            // IllegalStateException, or other device ConnectivityManager RuntimeExceptions
            // (see currentConnectivity() / Amplitude-Kotlin #220, #197).
        } catch (e: LinkageError) {
            // OEM-forked ConnectivityManager can throw linkage errors (e.g. NoSuchMethodError).
        } finally {
            // Always clear so a failed unregister can't wedge start()/stop() (a non-null
            // callback makes start() no-op) or crash invalidate() during bridge teardown.
            networkCallback = null
            // Reset so a stale block status can't leak into the next registration's seed.
            blocked = false
        }
    }

    // Effective connectivity for the live callbacks: online only when the active network is
    // validated (currentConnectivity()) AND the OS isn't blocking our traffic.
    private fun effectiveConnectivity(): Boolean = currentConnectivity() && !blocked

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
