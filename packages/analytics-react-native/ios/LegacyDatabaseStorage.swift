import Foundation
import SQLite3

class LegacyDatabaseStorage {
    private static let DATABASE_NAME = "com.amplitude.database"
    private static let EVENT_TABLE_NAME = "events"
    private static let IDENTIFY_TABLE_NAME = "identifys"
    private static let INTERCEPTED_IDENTIFY_TABLE_NAME = "intercepted_identifys"
    private static let STORE_TABLE_NAME = "store"
    private static let LONG_STORE_TABLE_NAME = "long_store"
    private static let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private static var instances: [String: LegacyDatabaseStorage] = [:]
    private static let instanceQueue = DispatchQueue(label: "legacyDatabaseStorage.amplitude.com")

    let databasePath: String

    public static func getStorage(_ instanceName: String?) -> LegacyDatabaseStorage {
        instanceQueue.sync {
            var normalizedInstanceName = instanceName?.lowercased() ?? ""
            if normalizedInstanceName == "default_instance" {
                normalizedInstanceName = ""
            }
            if let storage = instances[normalizedInstanceName] {
                return storage
            }
            let storage = LegacyDatabaseStorage(getDatabasePath(normalizedInstanceName).path)
            instances[normalizedInstanceName] = storage
            return storage
        }
    }

    static func getDatabasePath(_ instanceName: String) -> URL {
        #if os(tvOS)
        let searchPathDirectory = FileManager.SearchPathDirectory.cachesDirectory
        #else
        let searchPathDirectory = FileManager.SearchPathDirectory.libraryDirectory
        #endif

        let urls = FileManager.default.urls(for: searchPathDirectory, in: .userDomainMask)
        var databaseUrl = urls[0]

        var databaseName = DATABASE_NAME
        if instanceName != "" {
            databaseName += "_\(instanceName)"
        }
        databaseUrl.appendPathComponent(databaseName)
        return databaseUrl
    }

    public init(_ databasePath: String) {
        self.databasePath = databasePath
    }

    func getValue(_ key: String) -> String? {
        getValueFromTable(LegacyDatabaseStorage.STORE_TABLE_NAME, key) as? String
    }

    func getLongValue(_ key: String) -> Int64? {
        getValueFromTable(LegacyDatabaseStorage.LONG_STORE_TABLE_NAME, key) as? Int64
    }

    private func getValueFromTable(_ table: String, _ key: String) -> Any? {
        let query = "SELECT key, value FROM \(table) WHERE key = ?;"
        return executeQuery(query) { stmt in
            let bindResult = sqlite3_bind_text(stmt, 1, key, -1, LegacyDatabaseStorage.SQLITE_TRANSIENT)
            if bindResult != SQLITE_OK {
                print("bind query parameter failed with result: \(bindResult)")
                return
            }

            let stepResult = sqlite3_step(stmt)
            if stepResult != SQLITE_ROW {
                print("execute query '\(query)' failed with result: \(stepResult)")
                return
            }

            if sqlite3_column_type(stmt, 1) != SQLITE_NULL {
                if table == LegacyDatabaseStorage.STORE_TABLE_NAME {
                    guard let rawValue = sqlite3_column_text(stmt, 1) else {
                        return
                    }
                    return String(cString: rawValue)
                } else {
                    return sqlite3_column_int64(stmt, 1)
                }
            } else {
                return
            }
        }
    }

    func getLastEventId() -> Int64? {
        let query = "select coalesce(max(seq), -1) from sqlite_sequence where name = 'events';"
        let lastId = executeQuery(query) { stmt in
            let stepResult = sqlite3_step(stmt)
            if stepResult != SQLITE_ROW {
                print("execute query '\(query)' failed with result: \(stepResult)")
                return -1 as Int64
            }

            if sqlite3_column_type(stmt, 0) != SQLITE_NULL {
                let value = sqlite3_column_int64(stmt, 0)
                return value
            } else {
                return -1 as Int64
            }
        }
        return lastId != nil && lastId! >= 0 ? lastId : nil
    }

    func removeValue(_ key: String) {
        removeValueFromTable(LegacyDatabaseStorage.STORE_TABLE_NAME, key)
    }

    func removeLongValue(_ key: String) {
        removeValueFromTable(LegacyDatabaseStorage.LONG_STORE_TABLE_NAME, key)
    }

    private func removeValueFromTable(_ table: String, _ key: String) {
        let query = "DELETE FROM \(table) WHERE key = ?;"
        _ = executeQuery(query) { stmt in
            let bindResult = sqlite3_bind_text(stmt, 1, key, -1, LegacyDatabaseStorage.SQLITE_TRANSIENT)
            if bindResult != SQLITE_OK {
                print("bind query parameter failed with result: \(bindResult)")
                return
            }

            let stepResult = sqlite3_step(stmt)
            if stepResult != SQLITE_DONE {
                print("execute query '\(query)' failed with result: \(stepResult)")
                return
            }
        }
    }

    func removeEvent(_ eventId: Int64) {
        removeEventFromTable(LegacyDatabaseStorage.EVENT_TABLE_NAME, eventId)
    }

    func removeIdentify(_ eventId: Int64) {
        removeEventFromTable(LegacyDatabaseStorage.IDENTIFY_TABLE_NAME, eventId)
    }

    func removeInterceptedIdentify(_ eventId: Int64) {
        removeEventFromTable(LegacyDatabaseStorage.INTERCEPTED_IDENTIFY_TABLE_NAME, eventId)
    }

    private func removeEventFromTable(_ table: String, _ eventId: Int64) {
        let query = "DELETE FROM \(table) WHERE id = ?;"
        _ = executeQuery(query) { stmt in
            let bindResult = sqlite3_bind_int64(stmt, 1, eventId)
            if bindResult != SQLITE_OK {
                print("bind query parameter failed with result: \(bindResult)")
                return
            }

            let stepResult = sqlite3_step(stmt)
            if stepResult != SQLITE_DONE {
                print("execute query '\(query)' failed with result: \(stepResult)")
                return
            }
        }
    }

    func readEvents() -> [[String: Any]] {
        readEventsFromTable(LegacyDatabaseStorage.EVENT_TABLE_NAME)
    }

    func readIdentifies() -> [[String: Any]] {
        readEventsFromTable(LegacyDatabaseStorage.IDENTIFY_TABLE_NAME)
    }

    func readInterceptedIdentifies() -> [[String: Any]] {
        readEventsFromTable(LegacyDatabaseStorage.INTERCEPTED_IDENTIFY_TABLE_NAME)
    }

    private func readEventsFromTable(_ table: String) -> [[String: Any]] {
        let query = "SELECT id, event FROM \(table) ORDER BY id;"
        return executeQuery(query) { stmt in
            var events: [[String: Any]] = []
            while sqlite3_step(stmt) == SQLITE_ROW {
                let eventId = sqlite3_column_int64(stmt, 0)
                let rawEventData = sqlite3_column_text(stmt, 1)
                if rawEventData != nil {
                    let eventData = String(cString: rawEventData!).data(using: .utf8)
                    if eventData != nil && eventData!.count > 0 {
                        let event = try? JSONSerialization.jsonObject(with: eventData!, options: []) as? [String: Any]
                        if var event {
                            event["event_id"] = eventId
                            events.append(event)
                        }
                    }
                }
            }
            return events
        } ?? []
    }

    private func executeQuery<T>(_ query: String, _ block: (_ stmt: OpaquePointer) -> T) -> T? {
        if !FileManager.default.fileExists(atPath: databasePath) {
            return nil
        }

        var db: OpaquePointer?
        let openResult = sqlite3_open(databasePath, &db)
        if openResult != SQLITE_OK {
            print("open database failed with result: \(openResult)")
            sqlite3_close(db)
            return nil
        }

        var stmt: OpaquePointer?
        let prepareResult = sqlite3_prepare(db, query, -1, &stmt, nil)
        if prepareResult != SQLITE_OK {
            print("prepare query failed with result: \(prepareResult)")
            return nil
        }
        let value = block(stmt!)
        sqlite3_finalize(stmt)
        sqlite3_close(db)
        return value
    }
}
