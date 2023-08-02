package com.legacydatamigration

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.FileOutputStream
import java.util.Base64

class MigrationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "MigrationModule"

    @ReactMethod
    fun prepareLegacyDatabase(instanceName: String?, version: String) {
        val dbPath = this.reactApplicationContext.getDatabasePath("com.amplitude.api_$instanceName")
        val databaseContent = when (version) {
            "v4" -> legacyV4Database
            "v3" -> legacyV3Database
            else -> null
        }
        if (databaseContent != null) {
            val rawDatabaseContent = Base64.getDecoder().decode(databaseContent.replace(Regex("\\s+"), ""))
            FileOutputStream(dbPath).use { dstStream ->
                dstStream.write(rawDatabaseContent, 0, rawDatabaseContent.size)
            }
        }
    }
}