package com.amplitude.reactnative

import android.util.Log

interface Logger {
  enum class LogMode(i: Int) {
    DEBUG(1),
    INFO(2),
    WARN(3),
    ERROR(4),
    OFF(5)
  }

  var logMode: LogMode

  fun debug(message: String)

  fun error(message: String)

  fun info(message: String)

  fun warn(message: String)
}

class LogcatLogger() : Logger {
  override var logMode: Logger.LogMode = Logger.LogMode.INFO
  private val tag = "Amplitude"

  override fun debug(message: String) {
    if (logMode <= Logger.LogMode.DEBUG) {
      Log.d(tag, message)
    }
  }

  override fun error(message: String) {
    if (logMode <= Logger.LogMode.ERROR) {
      Log.e(tag, message)
    }
  }

  override fun info(message: String) {
    if (logMode <= Logger.LogMode.INFO) {
      Log.i(tag, message)
    }
  }

  override fun warn(message: String) {
    if (logMode <= Logger.LogMode.WARN) {
      Log.w(tag, message)
    }
  }

  companion object {
    val logger = LogcatLogger()
  }
}
