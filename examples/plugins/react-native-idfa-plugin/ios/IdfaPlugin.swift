import AdSupport
import AppTrackingTransparency
import Foundation

@objc(IdfaPlugin)
class IdfaPlugin: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func requestTrackingAuthorization(
      _ resolve: @escaping RCTPromiseResolveBlock,
      rejecter reject: RCTPromiseRejectBlock
  ) -> Void {
    if #available(iOS 14, *) {
      ATTrackingManager.requestTrackingAuthorization { status in
        resolve(status.rawValue)
      }
    } else {
      resolve(0)
    }
  }

  @objc
  func getIdfa(
      _ resolve: @escaping RCTPromiseResolveBlock,
      rejecter reject: RCTPromiseRejectBlock
  ) -> Void {
    if #available(iOS 14, *) {
      let status = ATTrackingManager.trackingAuthorizationStatus
      if (status == ATTrackingManager.AuthorizationStatus.authorized) {
        resolve(ASIdentifierManager.shared().advertisingIdentifier.uuidString)
      } else {
        resolve(nil)
      }
    } else {
      resolve(ASIdentifierManager.shared().advertisingIdentifier.uuidString)
    }
  }
}
