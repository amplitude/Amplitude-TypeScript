import Foundation

@objc(MigrationModule)
class MigrationModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool { return true }

  @objc
  func prepareLegacyDatabase(
      _ instanceName: String?,
      version: String,
      resolver resolve: RCTPromiseResolveBlock,
      rejecter reject: RCTPromiseRejectBlock
    ) -> Void {
    var databaseContent: String? = nil
    switch (version) {
    case "v4":
      databaseContent = legacyV4Database
    case "v3":
      databaseContent = legacyV3Database
    default:
      break
    }

    guard var databaseContent else {
      resolve(nil)
      return
    }
    databaseContent = String(databaseContent.filter { !" \n\t\r".contains($0) })
    let decodedDatabaseContent = Data(base64Encoded: databaseContent)

    let databasePath = MigrationModule.getDatabasePath(instanceName)
    try? decodedDatabaseContent?.write(to: databasePath)
    resolve(nil)
  }

  static func getDatabasePath(_ instanceName: String?) -> URL {
    #if os(tvOS)
    let searchPathDirectory = FileManager.SearchPathDirectory.cachesDirectory
    #else
    let searchPathDirectory = FileManager.SearchPathDirectory.libraryDirectory
    #endif

    var normalizedInstanceName = (instanceName ?? "").lowercased()
    if normalizedInstanceName == "default_instance" {
      normalizedInstanceName = ""
    }

    let urls = FileManager.default.urls(for: searchPathDirectory, in: .userDomainMask)
    var databaseUrl = urls[0]

    var databaseName = "com.amplitude.database"
    if normalizedInstanceName != "" {
      databaseName += "_\(normalizedInstanceName)"
    }
    databaseUrl.appendPathComponent(databaseName)
    return databaseUrl
  }
}
