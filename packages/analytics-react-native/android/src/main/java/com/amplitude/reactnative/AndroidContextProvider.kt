package com.amplitude.reactnative

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.res.Resources
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.provider.Settings.Secure
import android.telephony.TelephonyManager
import java.io.IOException
import java.lang.Exception
import java.lang.IllegalArgumentException
import java.lang.IllegalStateException
import java.lang.NullPointerException
import java.lang.reflect.InvocationTargetException
import java.util.Locale
import java.util.UUID
import kotlin.collections.ArrayList

class AndroidContextProvider(private val context: Context, locationListening: Boolean, shouldTrackAdid: Boolean) {
  var isLocationListening = true
  var shouldTrackAdid = true
  private var cachedInfo: CachedInfo? = null
    private get() {
      if (field == null) {
        field = CachedInfo()
      }
      return field
    }

  /**
   * Internal class serves as a cache
   */
  inner class CachedInfo {
    var advertisingId: String?
    val country: String?
    val versionName: String?
    val osName: String
    val platform: String
    val osVersion: String
    val brand: String
    val manufacturer: String
    val model: String
    val carrier: String?
    val language: String
    var limitAdTrackingEnabled: Boolean = true
    val gpsEnabled: Boolean
    var appSetId: String

    init {
      advertisingId = fetchAdvertisingId()
      versionName = fetchVersionName()
      osName = OS_NAME
      platform = PLATFORM
      osVersion = fetchOsVersion()
      brand = fetchBrand()
      manufacturer = fetchManufacturer()
      model = fetchModel()
      carrier = fetchCarrier()
      country = fetchCountry()
      language = fetchLanguage()
      gpsEnabled = checkGPSEnabled()
      appSetId = fetchAppSetId()
    }

    /**
     * Internal methods for getting raw information
     */
    private fun fetchVersionName(): String? {
      val packageInfo: PackageInfo
      try {
        packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        return packageInfo.versionName
      } catch (e: PackageManager.NameNotFoundException) {
      } catch (e: Exception) {
      }
      return null
    }

    private fun fetchOsVersion(): String {
      return Build.VERSION.RELEASE
    }

    private fun fetchBrand(): String {
      return Build.BRAND
    }

    private fun fetchManufacturer(): String {
      return Build.MANUFACTURER
    }

    private fun fetchModel(): String {
      return Build.MODEL
    }

    private fun fetchCarrier(): String? {
      try {
        val manager = context
          .getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        return manager.networkOperatorName
      } catch (e: Exception) {
        // Failed to get network operator name from network
      }
      return null
    }

    private fun fetchCountry(): String? {
      // This should not be called on the main thread.

      // Prioritize reverse geocode, but until we have a result from that,
      // we try to grab the country from the network, and finally the locale
      var country = countryFromLocation
      if (!country.isNullOrEmpty()) {
        return country
      }
      country = countryFromNetwork
      return if (!country.isNullOrEmpty()) {
        country
      } else countryFromLocale
    } // Customized Android System without Google Play Service Installed// sometimes the location manager is unavailable// Bad lat / lon values can cause Geocoder to throw IllegalArgumentExceptions// failed to fetch geocoder// Failed to reverse geocode location

    // Failed to reverse geocode location
    private val countryFromLocation: String?
      private get() {
        if (!isLocationListening) {
          return null
        }
        val recent = mostRecentLocation
        if (recent != null) {
          try {
            if (Geocoder.isPresent()) {
              val geocoder = geocoder
              val addresses = geocoder.getFromLocation(
                recent.latitude,
                recent.longitude, 1
              )
              if (addresses != null) {
                for (address in addresses) {
                  if (address != null) {
                    return address.countryCode
                  }
                }
              }
            }
          } catch (e: IOException) {
            // Failed to reverse geocode location
          } catch (e: NullPointerException) {
            // Failed to reverse geocode location
          } catch (e: NoSuchMethodError) {
            // failed to fetch geocoder
          } catch (e: IllegalArgumentException) {
            // Bad lat / lon values can cause Geocoder to throw IllegalArgumentExceptions
          } catch (e: IllegalStateException) {
            // sometimes the location manager is unavailable
          } catch (e: SecurityException) {
            // Customized Android System without Google Play Service Installed
          }
        }
        return null
      }

    // Failed to get country from network
    private val countryFromNetwork: String?
      private get() {
        try {
          val manager = context
            .getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
          if (manager.phoneType != TelephonyManager.PHONE_TYPE_CDMA) {
            val country = manager.networkCountryIso
            if (country != null) {
              return country.toUpperCase(Locale.US)
            }
          }
        } catch (e: Exception) {
          // Failed to get country from network
        }
        return null
      }

    private val locale: Locale
      private get() {
        val configuration = Resources.getSystem().configuration
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          val localeList = configuration.locales
          if (localeList.isEmpty) {
            return Locale.getDefault()
          } else {
            return localeList.get(0)
          }
        } else {
          return configuration.locale
        }
      }

    private val countryFromLocale: String
      private get() = locale.country

    private fun fetchLanguage(): String {
      return locale.language
    }

    private fun fetchAdvertisingId(): String? {
      if (!shouldTrackAdid) {
        return null
      }

      // This should not be called on the main thread.
      return if ("Amazon" == fetchManufacturer()) {
        fetchAndCacheAmazonAdvertisingId
      } else {
        fetchAndCacheGoogleAdvertisingId
      }
    }

    private fun fetchAppSetId(): String {
      try {
        val AppSet = Class
          .forName("com.google.android.gms.appset.AppSet")
        val getClient = AppSet.getMethod("getClient", Context::class.java)
        val appSetIdClient = getClient.invoke(null, context)
        val getAppSetIdInfo = appSetIdClient.javaClass.getMethod("getAppSetIdInfo")
        val taskWithAppSetInfo = getAppSetIdInfo.invoke(appSetIdClient)
        val Tasks = Class.forName("com.google.android.gms.tasks.Tasks")
        val await =
          Tasks.getMethod("await", Class.forName("com.google.android.gms.tasks.Task"))
        val appSetInfo = await.invoke(null, taskWithAppSetInfo)
        val getId = appSetInfo.javaClass.getMethod("getId")
        appSetId = getId.invoke(appSetInfo) as String
      } catch (e: ClassNotFoundException) {
        LogcatLogger.logger
          .warn("Google Play Services SDK not found for app set id!")
      } catch (e: InvocationTargetException) {
        LogcatLogger.logger.warn("Google Play Services not available for app set id")
      } catch (e: Exception) {
        LogcatLogger.logger.error(
          "Encountered an error connecting to Google Play Services for app set id"
        )
      }
      return appSetId
    }

    private val fetchAndCacheAmazonAdvertisingId: String?
      private get() {
        val cr = context.contentResolver
        limitAdTrackingEnabled = Secure.getInt(cr, SETTING_LIMIT_AD_TRACKING, 0) == 1
        advertisingId = Secure.getString(cr, SETTING_ADVERTISING_ID)
        return advertisingId
      }
    private val fetchAndCacheGoogleAdvertisingId: String?
      private get() {
        try {
          val AdvertisingIdClient = Class
            .forName("com.google.android.gms.ads.identifier.AdvertisingIdClient")
          val getAdvertisingInfo = AdvertisingIdClient.getMethod(
            "getAdvertisingIdInfo",
            Context::class.java
          )
          val advertisingInfo = getAdvertisingInfo.invoke(null, context)
          val isLimitAdTrackingEnabled = advertisingInfo.javaClass.getMethod(
            "isLimitAdTrackingEnabled"
          )
          val limitAdTrackingEnabled = isLimitAdTrackingEnabled
            .invoke(advertisingInfo) as Boolean
          this.limitAdTrackingEnabled =
            limitAdTrackingEnabled != null && limitAdTrackingEnabled
          val getId = advertisingInfo.javaClass.getMethod("getId")
          advertisingId = getId.invoke(advertisingInfo) as String
        } catch (e: ClassNotFoundException) {
          LogcatLogger.logger
            .warn("Google Play Services SDK not found for advertising id!")
        } catch (e: InvocationTargetException) {
          LogcatLogger.logger
            .warn("Google Play Services not available for advertising id")
        } catch (e: Exception) {
          LogcatLogger.logger.error(
            "Encountered an error connecting to Google Play Services for advertising id"
          )
        }
        return advertisingId
      }

    private fun checkGPSEnabled(): Boolean {
      // This should not be called on the main thread.
      try {
        val GPSUtil = Class
          .forName("com.google.android.gms.common.GooglePlayServicesUtil")
        val getGPSAvailable = GPSUtil.getMethod(
          "isGooglePlayServicesAvailable",
          Context::class.java
        )
        val status = getGPSAvailable.invoke(null, context) as Int
        // status 0 corresponds to com.google.android.gms.common.ConnectionResult.SUCCESS;
        return status != null && status == 0
      } catch (e: NoClassDefFoundError) {
        LogcatLogger.logger.warn("Google Play Services Util not found!")
      } catch (e: ClassNotFoundException) {
        LogcatLogger.logger.warn("Google Play Services Util not found!")
      } catch (e: NoSuchMethodException) {
        LogcatLogger.logger.warn("Google Play Services not available")
      } catch (e: InvocationTargetException) {
        LogcatLogger.logger.warn("Google Play Services not available")
      } catch (e: IllegalAccessException) {
        LogcatLogger.logger.warn("Google Play Services not available")
      } catch (e: Exception) {
        LogcatLogger.logger.warn(
          "Error when checking for Google Play Services: $e"
        )
      }
      return false
    }
  }

  fun prefetch() {
    cachedInfo
  }

  fun isGooglePlayServicesEnabled(): Boolean {
    return cachedInfo!!.gpsEnabled
  }

  fun isLimitAdTrackingEnabled(): Boolean {
    return cachedInfo!!.limitAdTrackingEnabled
  }

  val versionName: String?
    get() = cachedInfo!!.versionName
  val osName: String
    get() = cachedInfo!!.osName
  val platform: String
    get() = cachedInfo!!.platform
  val osVersion: String
    get() = cachedInfo!!.osVersion
  val brand: String
    get() = cachedInfo!!.brand
  val manufacturer: String
    get() = cachedInfo!!.manufacturer
  val model: String
    get() = cachedInfo!!.model
  val carrier: String?
    get() = cachedInfo!!.carrier
  val country: String?
    get() = cachedInfo!!.country
  val language: String
    get() = cachedInfo!!.language
  val advertisingId: String?
    get() = cachedInfo!!.advertisingId
  val appSetId: String
    get() = cachedInfo!!.appSetId // other causes// failed to get providers list
  // Don't crash if the device does not have location services.

  // It's possible that the location service is running out of process
  // and the remote getProviders call fails. Handle null provider lists.
  val mostRecentLocation: Location?
    get() {
      if (!isLocationListening) {
        return null
      }
      if (!Utils.checkLocationPermissionAllowed(context)) {
        return null
      }
      val locationManager = context
        .getSystemService(Context.LOCATION_SERVICE) as LocationManager
        ?: return null

      // Don't crash if the device does not have location services.

      // It's possible that the location service is running out of process
      // and the remote getProviders call fails. Handle null provider lists.
      var providers: List<String?>? = null
      try {
        providers = locationManager.getProviders(true)
      } catch (e: SecurityException) {
        // failed to get providers list
      } catch (e: Exception) {
        // other causes
      }
      if (providers == null) {
        return null
      }
      val locations: MutableList<Location> = ArrayList()
      for (provider in providers) {
        var location: Location? = null
        try {
          location = locationManager.getLastKnownLocation(provider!!)
        } catch (e: SecurityException) {
          LogcatLogger.logger.warn("Failed to get most recent location")
        } catch (e: Exception) {
          LogcatLogger.logger.warn("Failed to get most recent location")
        }
        if (location != null) {
          locations.add(location)
        }
      }
      var maximumTimestamp: Long = -1
      var bestLocation: Location? = null
      for (location in locations) {
        if (location.time > maximumTimestamp) {
          maximumTimestamp = location.time
          bestLocation = location
        }
      }
      return bestLocation
    }

  // @VisibleForTesting
  protected val geocoder: Geocoder
    protected get() = Geocoder(context, Locale.ENGLISH)

  companion object {
    const val OS_NAME = "android"
    const val PLATFORM = "Android"
    const val SETTING_LIMIT_AD_TRACKING = "limit_ad_tracking"
    const val SETTING_ADVERTISING_ID = "advertising_id"
    fun generateUUID(): String {
      return UUID.randomUUID().toString()
    }
  }

  init {
    isLocationListening = locationListening
    this.shouldTrackAdid = shouldTrackAdid
  }
}
