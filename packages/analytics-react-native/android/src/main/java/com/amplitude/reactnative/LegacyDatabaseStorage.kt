package com.amplitude.reactnative

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.io.File
import java.util.LinkedList
import java.util.Locale

/**
 * Store the database related constants.
 * Align with com/amplitude/api/DatabaseHelper.java in previous SDK.
 */
object DatabaseConstants {
    const val DEFAULT_INSTANCE = "\$default_instance"
    const val DATABASE_NAME = "com.amplitude.api"
    const val DATABASE_VERSION = 4

    const val EVENT_TABLE_NAME = "events"
    const val IDENTIFY_TABLE_NAME = "identifys"
    const val IDENTIFY_INTERCEPTOR_TABLE_NAME = "identify_interceptor"
    const val ID_FIELD = "id"
    const val EVENT_FIELD = "event"

    const val LONG_STORE_TABLE_NAME = "long_store"
    const val STORE_TABLE_NAME = "store"
    const val KEY_FIELD = "key"
    const val VALUE_FIELD = "value"
}

/**
 * The SDK doesn't need to write/read from local sqlite database.
 * This storage class is used for migrating events only.
 */
class LegacyDatabaseStorage(context: Context, databaseName: String) : SQLiteOpenHelper(
    context,
    databaseName,
    null,
    DatabaseConstants.DATABASE_VERSION
) {
    private var file: File = context.getDatabasePath(databaseName)
    var currentDbVersion: Int = DatabaseConstants.DATABASE_VERSION
        private set

    override fun onCreate(db: SQLiteDatabase) {
        throw NotImplementedError()
    }

    override fun onUpgrade(db: SQLiteDatabase?, oldVersion: Int, newVersion: Int) {
        currentDbVersion = oldVersion
    }

    private fun queryDb(
        db: SQLiteDatabase,
        table: String,
        columns: Array<String?>?,
        selection: String?,
        selectionArgs: Array<String?>?,
        orderBy: String?,
    ): Cursor? {
        return db.query(table, columns, selection, selectionArgs, null, null, orderBy, null)
    }

    private fun handleIfCursorRowTooLargeException(e: java.lang.IllegalStateException) {
        val message = e.message
        if (!message.isNullOrEmpty() && message.contains("Couldn't read") && message.contains("CursorWindow")) {
            closeDb()
        } else {
            throw e
        }
    }

    private fun convertIfCursorWindowException(e: java.lang.RuntimeException) {
        val message = e.message
        if (!message.isNullOrEmpty() && (message.startsWith("Cursor window allocation of") || message.startsWith("Could not allocate CursorWindow"))) {
            throw CursorWindowAllocationException(message)
        } else {
            throw e
        }
    }

    private fun closeDb() {
        try {
            close()
        } catch (e: Exception) {
            LogcatLogger.logger.error("close failed: ${e.message}")
        }
    }

    @Synchronized
    fun readEvents(): List<JSONObject> {
        return readEventsFromTable(DatabaseConstants.EVENT_TABLE_NAME)
    }

    @Synchronized
    fun readIdentifies(): List<JSONObject> {
        return readEventsFromTable(DatabaseConstants.IDENTIFY_TABLE_NAME)
    }

    @Synchronized
    fun readInterceptedIdentifies(): List<JSONObject> {
        if (currentDbVersion < 4) {
            return listOf()
        }
        return readEventsFromTable(DatabaseConstants.IDENTIFY_INTERCEPTOR_TABLE_NAME)
    }

    private fun readEventsFromTable(table: String): List<JSONObject> {
        if (!file.exists()) {
            return arrayListOf()
        }

        val events: MutableList<JSONObject> = LinkedList()
        var cursor: Cursor? = null
        try {
            val db = readableDatabase
            cursor = queryDb(
                db,
                table,
                arrayOf(DatabaseConstants.ID_FIELD, DatabaseConstants.EVENT_FIELD),
                null,
                null,
                DatabaseConstants.ID_FIELD + " ASC",
            )
            while (cursor!!.moveToNext()) {
                val eventId = cursor.getLong(0)
                val event = cursor.getString(1)
                if (event.isNullOrEmpty()) {
                    continue
                }
                val obj = JSONObject(event)
                obj.put("event_id", eventId)
                events.add(obj)
            }
        } catch (e: SQLiteException) {
            LogcatLogger.logger.error(
                "read events from $table failed: ${e.message}"
            )
            closeDb()
        } catch (e: StackOverflowError) {
            LogcatLogger.logger.error(
                "read events from $table failed: ${e.message}"
            )
            closeDb()
        } catch (e: IllegalStateException) { // put before Runtime since IllegalState extends
            handleIfCursorRowTooLargeException(e)
        } catch (e: RuntimeException) {
            convertIfCursorWindowException(e)
        } finally {
            cursor?.close()
            close()
        }
        return events
    }

    @Synchronized
    fun removeEvent(eventId: Int) {
        removeEventFromTable(DatabaseConstants.EVENT_TABLE_NAME, eventId)
    }

    @Synchronized
    fun removeIdentify(eventId: Int) {
        removeEventFromTable(DatabaseConstants.IDENTIFY_TABLE_NAME, eventId)
    }

    @Synchronized
    fun removeInterceptedIdentify(eventId: Int) {
        if (currentDbVersion < 4) {
            return
        }
        removeEventFromTable(DatabaseConstants.IDENTIFY_INTERCEPTOR_TABLE_NAME, eventId)
    }

    private fun removeEventFromTable(table: String, eventId: Int) {
        try {
            val db = writableDatabase
            db.delete(
                table,
                "${DatabaseConstants.ID_FIELD} = ?",
                arrayOf(eventId.toString())
            )
        } catch (e: SQLiteException) {
            LogcatLogger.logger.error(
                "remove events from $table failed: ${e.message}"
            )
            closeDb()
        } catch (e: StackOverflowError) {
            LogcatLogger.logger.error(
                "remove events from $table failed: ${e.message}"
            )
            closeDb()
        } finally {
            close()
        }
    }

    @Synchronized
    fun getValue(key: String): String? {
        return getValueFromTable(DatabaseConstants.STORE_TABLE_NAME, key) as String?
    }

    @Synchronized
    fun getLongValue(key: String): Long? {
        return getValueFromTable(DatabaseConstants.LONG_STORE_TABLE_NAME, key) as Long?
    }

    private fun getValueFromTable(table: String, key: String): Any? {
        if (!file.exists()) {
            return null
        }

        var value: Any? = null
        var cursor: Cursor? = null
        try {
            val db = readableDatabase
            cursor = queryDb(
                db,
                table,
                arrayOf<String?>(
                    DatabaseConstants.KEY_FIELD,
                    DatabaseConstants.VALUE_FIELD
                ),
                DatabaseConstants.KEY_FIELD + " = ?",
                arrayOf(key),
                null,
            )
            if (cursor!!.moveToFirst()) {
                value = if (table == DatabaseConstants.STORE_TABLE_NAME) cursor.getString(1) else cursor.getLong(1)
            }
        } catch (e: SQLiteException) {
            LogcatLogger.logger.error(
                "getValue from $table failed: ${e.message}"
            )
            // Hard to recover from SQLiteExceptions, just start fresh
            closeDb()
        } catch (e: StackOverflowError) {
            LogcatLogger.logger.error(
                "getValue from $table failed: ${e.message}"
            )
            // potential stack overflow error when getting database on custom Android versions
            closeDb()
        } catch (e: IllegalStateException) { // put before Runtime since IllegalState extends
            // cursor window row too big exception
            handleIfCursorRowTooLargeException(e)
        } catch (e: RuntimeException) {
            // cursor window allocation exception
            convertIfCursorWindowException(e)
        } finally {
            cursor?.close()
            close()
        }
        return value
    }

    @Synchronized
    fun removeValue(key: String) {
        removeValueFromTable(DatabaseConstants.STORE_TABLE_NAME, key)
    }

    @Synchronized
    fun removeLongValue(key: String) {
        removeValueFromTable(DatabaseConstants.LONG_STORE_TABLE_NAME, key)
    }

    private fun removeValueFromTable(table: String, key: String) {
        try {
            val db = writableDatabase
            db.delete(
                table,
                "${DatabaseConstants.KEY_FIELD} = ?",
                arrayOf(key)
            )
        } catch (e: SQLiteException) {
            LogcatLogger.logger.error(
                "remove value from $table failed: ${e.message}"
            )
            closeDb()
        } catch (e: StackOverflowError) {
            LogcatLogger.logger.error(
                "remove value from $table failed: ${e.message}"
            )
            closeDb()
        } finally {
            close()
        }
    }
}

class CursorWindowAllocationException(description: String?) :
    java.lang.RuntimeException(description)

object LegacyDatabaseStorageProvider {
    private val instances: MutableMap<String, LegacyDatabaseStorage> = mutableMapOf()

    fun getStorage(context: Context, instanceName: String?): LegacyDatabaseStorage {
        val databaseName = getDatabaseName(instanceName)
        var storage = instances[databaseName]
        if (storage == null) {
            storage = LegacyDatabaseStorage(context, databaseName)
            instances[databaseName] = storage
        }

        return storage
    }

    private fun getDatabaseName(instanceName: String?): String {
        val normalizedInstanceName = instanceName?.lowercase(Locale.getDefault())
        return if (normalizedInstanceName.isNullOrEmpty() || normalizedInstanceName == DatabaseConstants.DEFAULT_INSTANCE) DatabaseConstants.DATABASE_NAME else "${DatabaseConstants.DATABASE_NAME}_$normalizedInstanceName"
    }
}
