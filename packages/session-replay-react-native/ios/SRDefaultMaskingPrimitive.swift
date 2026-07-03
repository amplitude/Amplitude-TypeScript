import UIKit
import AmplitudeSessionReplay

/// Default `SRMaskingPrimitive` bridging the masking seam to the Amplitude
/// Session Replay iOS SDK's existing hook (`UIView.amp_isBlocked`):
///
///  - `maskView(_:level:)` — both `"mask"` and `"block"` map to
///    `amp_isBlocked = true` (the iOS SDK exposes a single blocking hook).
///  - `unmaskView(_:)` — `amp_isBlocked = false`.
///  - `resetView(_:)` — `amp_isBlocked = false`. Approximation: the SDK has no
///    per-view "inherit" reset today; a precise `.none` reset is a documented
///    fast-follow.
///
/// Registered on the main thread at SDK init (see `NativeSessionReplay.setup`);
/// registration replays any masking intents recorded before init (R8), so
/// mount-before-init masking still applies.
///
/// The explicit ObjC name lets the native canaries reach this class via
/// `NSClassFromString` without new public headers.
@objc(SRDefaultMaskingPrimitive)
class SRDefaultMaskingPrimitive: NSObject, SRMaskingPrimitive {
    func maskView(_ view: UIView, level: String) {
        // "mask", "block", and unknown levels all fail safe to blocking.
        view.amp_isBlocked = true
    }

    func unmaskView(_ view: UIView) {
        view.amp_isBlocked = false
    }

    func resetView(_ view: UIView) {
        view.amp_isBlocked = false
    }
}
