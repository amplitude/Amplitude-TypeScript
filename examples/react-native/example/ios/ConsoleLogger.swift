//
//  ConsoleLogger.swift
//
//
//  Created by Marvin Liu on 10/28/22.
//

import Foundation
import os.log
import AmplitudeSessionReplay


@objc(AMPLogLevel)
public enum LogLevelEnum: Int {
    case OFF
    case ERROR
    case WARN
    case LOG
    case DEBUG
}

public class ConsoleLogger: AmplitudeSessionReplay.Logger {
    public typealias LogLevel = LogLevelEnum

    public var logLevel: Int
    private var logger: OSLog

    public init(logLevel: Int = LogLevelEnum.OFF.rawValue) {
        self.logLevel = logLevel
        self.logger = OSLog(subsystem: "Amplitude", category: "Logging")
    }

    public func error(message: String) {
        if logLevel >= LogLevel.ERROR.rawValue {
            os_log("Error: %@", log: logger, type: .error, message)
        }
    }

    public func warn(message: String) {
        if logLevel >= LogLevel.WARN.rawValue {
            os_log("Warn: %@", log: logger, type: .default, message)
        }
    }

    public func log(message: String) {
        if logLevel >= LogLevel.LOG.rawValue {
            os_log("Log: %@", log: logger, type: .info, message)
        }
    }

    public func debug(message: String) {
        if logLevel >= LogLevel.DEBUG.rawValue {
            os_log("Debug: %@", log: logger, type: .debug, message)
        }
    }
}
