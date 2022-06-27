package com.amplitude.reactnative

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

object Utils {

  fun checkLocationPermissionAllowed(context: Context?): Boolean {
    return checkPermissionAllowed(context, Manifest.permission.ACCESS_COARSE_LOCATION) ||
      checkPermissionAllowed(context, Manifest.permission.ACCESS_FINE_LOCATION)
  }

  fun checkPermissionAllowed(context: Context?, permission: String?): Boolean {
    // ANDROID 6.0 AND UP!
    return if (Build.VERSION.SDK_INT >= 23) {
      var hasPermission = false
      try {
        // Invoke checkSelfPermission method from Android 6 (API 23 and UP)
        val methodCheckPermission =
          Activity::class.java.getMethod("checkSelfPermission", String::class.java)
        val resultObj = methodCheckPermission.invoke(context, permission)
        val result = resultObj.toString().toInt()
        hasPermission = result == PackageManager.PERMISSION_GRANTED
      } catch (ex: Exception) {
      }
      hasPermission
    } else {
      true
    }
  }
}
