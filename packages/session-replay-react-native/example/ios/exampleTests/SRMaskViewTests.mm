#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>

// The masking seam is a public pod header (see podspec `public_header_files`).
#import <AmplitudeSessionReplayReactNative/SRMaskingPrimitive.h>

// `RCTViewComponentView` conforms to `RCTComponentViewProtocol` and is a public
// React-RCTFabric header. Used as a concrete child in the per-child mask test.
#import <React/RCTViewComponentView.h>

// `UIView.amp_isBlocked` — the Session Replay SDK hook the default primitive
// (Task 2.6) bridges to. The SDK declares it in its generated Swift interface
// header (`AmplitudeSessionReplay-Swift.h`), which is not C++-clean (enum
// forward references), so this `.mm` file redeclares the property instead. The
// declaration matches the SDK's exactly; at runtime the accessors dispatch by
// selector to the SDK's implementation (`UIView+AmplitudeSessionReplay.swift`).
@interface UIView (AMPSessionReplayMaskingTestSupport)
@property (nonatomic) BOOL amp_isBlocked;
@end

#pragma mark - Recording primitive

/// A `<SRMaskingPrimitive>` that records every call so tests can assert on the
/// masking intent the registry/view replayed.
@interface SRRecordedCall : NSObject
@property (nonatomic, copy) NSString *selectorName;  // @"mask" | @"unmask" | @"reset"
@property (nonatomic, weak) UIView *view;
@property (nonatomic, copy, nullable) NSString *level;
@end

@implementation SRRecordedCall
@end

@interface SRRecordingPrimitive : NSObject <SRMaskingPrimitive>
@property (nonatomic, strong) NSMutableArray<SRRecordedCall *> *calls;
- (NSArray<SRRecordedCall *> *)callsForView:(UIView *)view;
@end

@implementation SRRecordingPrimitive

- (instancetype)init
{
  if (self = [super init]) {
    _calls = [NSMutableArray array];
  }
  return self;
}

- (void)maskView:(UIView *)view level:(NSString *)level
{
  SRRecordedCall *call = [[SRRecordedCall alloc] init];
  call.selectorName = @"mask";
  call.view = view;
  call.level = level;
  [self.calls addObject:call];
}

- (void)unmaskView:(UIView *)view
{
  SRRecordedCall *call = [[SRRecordedCall alloc] init];
  call.selectorName = @"unmask";
  call.view = view;
  [self.calls addObject:call];
}

- (void)resetView:(UIView *)view
{
  SRRecordedCall *call = [[SRRecordedCall alloc] init];
  call.selectorName = @"reset";
  call.view = view;
  [self.calls addObject:call];
}

- (NSArray<SRRecordedCall *> *)callsForView:(UIView *)view
{
  NSMutableArray<SRRecordedCall *> *matches = [NSMutableArray array];
  for (SRRecordedCall *call in self.calls) {
    if (call.view == view) {
      [matches addObject:call];
    }
  }
  return matches;
}

@end

#pragma mark - Tests

@interface SRMaskViewTests : XCTestCase
@end

@implementation SRMaskViewTests

- (void)setUp
{
  [super setUp];
  // Each test starts from a clean, primitive-less registry so recorded intents
  // and the static primitive never leak across tests.
  SRMaskingRegistry.primitive = nil;
}

- (void)tearDown
{
  SRMaskingRegistry.primitive = nil;
  [super tearDown];
}

#pragma mark Registry canaries (required core — these cover R8)

/// R8: a view masked while no primitive is registered has its masking intent
/// recorded and replayed onto a primitive that registers later. This is the
/// whole point of the seam — masking survives registration order without a JS
/// re-render.
- (void)testMaskIntentReplaysOntoLateRegisteredPrimitive
{
  UIView *view = [[UIView alloc] init];

  // No primitive registered yet — intent is only recorded.
  [SRMaskingRegistry maskView:view level:@"mask"];

  SRRecordingPrimitive *recording = [[SRRecordingPrimitive alloc] init];
  XCTAssertEqual(recording.calls.count, 0u, @"Sanity: nothing recorded before registration");

  SRMaskingRegistry.primitive = recording;

  NSArray<SRRecordedCall *> *calls = [recording callsForView:view];
  XCTAssertEqual(calls.count, 1u, @"Late-registered primitive should receive exactly one replayed call");
  XCTAssertEqualObjects(calls.firstObject.selectorName, @"mask");
  XCTAssertEqualObjects(calls.firstObject.level, @"mask", @"Replayed mask must preserve the level");
}

/// reset clears the recorded intent: a view masked then reset before any
/// primitive registers must NOT be masked when a primitive finally registers.
- (void)testResetClearsRecordedIntentSoNoReplay
{
  UIView *view = [[UIView alloc] init];

  [SRMaskingRegistry maskView:view level:@"mask"];
  [SRMaskingRegistry resetView:view];

  SRRecordingPrimitive *recording = [[SRRecordingPrimitive alloc] init];
  SRMaskingRegistry.primitive = recording;

  XCTAssertEqual([recording callsForView:view].count, 0u,
                 @"reset before registration must clear the intent — no replay");
}

/// unmask intent (explicit "do not mask") also replays onto a late-registered
/// primitive, so an explicitly-unmasked subtree stays unmasked.
- (void)testUnmaskIntentReplaysOntoLateRegisteredPrimitive
{
  UIView *view = [[UIView alloc] init];

  [SRMaskingRegistry unmaskView:view];

  SRRecordingPrimitive *recording = [[SRRecordingPrimitive alloc] init];
  SRMaskingRegistry.primitive = recording;

  NSArray<SRRecordedCall *> *calls = [recording callsForView:view];
  XCTAssertEqual(calls.count, 1u, @"unmask intent should replay exactly once");
  XCTAssertEqualObjects(calls.firstObject.selectorName, @"unmask");
}

/// When a primitive is already registered, masking calls pass through
/// immediately (no replay needed). Guards against the registry only working in
/// the deferred/replay path.
- (void)testMaskPassesThroughToAlreadyRegisteredPrimitive
{
  SRRecordingPrimitive *recording = [[SRRecordingPrimitive alloc] init];
  SRMaskingRegistry.primitive = recording;

  UIView *view = [[UIView alloc] init];
  [SRMaskingRegistry maskView:view level:@"unmask"];

  NSArray<SRRecordedCall *> *calls = [recording callsForView:view];
  XCTAssertEqual(calls.count, 1u);
  XCTAssertEqualObjects(calls.firstObject.selectorName, @"mask");
  XCTAssertEqualObjects(calls.firstObject.level, @"unmask");
}

/// reset forwards to an already-registered primitive (return-to-inherit), and
/// also drops the intent so it never replays onto a future primitive.
- (void)testResetForwardsToRegisteredPrimitiveAndDropsIntent
{
  SRRecordingPrimitive *first = [[SRRecordingPrimitive alloc] init];
  SRMaskingRegistry.primitive = first;

  UIView *view = [[UIView alloc] init];
  [SRMaskingRegistry maskView:view level:@"mask"];
  [SRMaskingRegistry resetView:view];

  NSArray<SRRecordedCall *> *firstCalls = [first callsForView:view];
  XCTAssertEqual(firstCalls.count, 2u, @"registered primitive should see mask then reset");
  XCTAssertEqualObjects(firstCalls.lastObject.selectorName, @"reset");

  // A subsequently-registered primitive must not see the dropped intent.
  SRRecordingPrimitive *second = [[SRRecordingPrimitive alloc] init];
  SRMaskingRegistry.primitive = second;
  XCTAssertEqual([second callsForView:view].count, 0u,
                 @"reset intent must not replay onto a new primitive");
}

#pragma mark Per-child mask via the view (R5)

/// R5: mounting a child onto `SRMaskView` masks that child, and recycling the
/// view resets (returns-to-inherit) every child.
///
/// Cross-bundle caveat: the pod (`SRMaskingRegistry`, `SRMaskView`) is linked
/// into BOTH the host app and this xctest bundle, so each bundle carries its own
/// copy of the registry's static `_primitive`. `SRMaskView` lives in the app and
/// reads the *app's* registry copy; the test must therefore register its
/// recording primitive on the SAME copy the view uses. We do that by routing
/// `setPrimitive:`/`primitive` through `NSClassFromString(@"SRMaskingRegistry")`
/// (the runtime de-dups duplicate classes to one), and assert we landed on the
/// view's copy. If the runtime still resolves a different copy than the view
/// uses (no stable way to reach it), the test skips — the registry canaries
/// above are the required core that covers R8.
- (void)testMountChildMasksAndRecycleResetsViaView
{
  Class maskViewClass = NSClassFromString(@"SRMaskView");
  if (maskViewClass == Nil) {
    // Old arch / Fabric view not linked — registry tests above are the core.
    XCTSkip(@"SRMaskView not available (new arch disabled); registry tests cover the seam");
    return;
  }

  Class registryClass = NSClassFromString(@"SRMaskingRegistry");
  if (registryClass == Nil ||
      ![registryClass respondsToSelector:@selector(setPrimitive:)] ||
      ![maskViewClass instancesRespondToSelector:@selector(mountChildComponentView:index:)]) {
    XCTSkip(@"SRMaskingRegistry/SRMaskView not reachable via runtime in this build");
    return;
  }

  // The view (host app) and the runtime-resolved registry must share a bundle,
  // otherwise the static primitive we set won't be the one the view reads.
  if ([NSBundle bundleForClass:registryClass] != [NSBundle bundleForClass:maskViewClass]) {
    XCTSkip(@"SRMaskingRegistry and SRMaskView live in different bundles (duplicate-symbol "
            @"linkage); per-child view path can't be exercised in unit tests — registry "
            @"canaries cover the seam");
    return;
  }

  SRRecordingPrimitive *recording = [[SRRecordingPrimitive alloc] init];

  // Set the primitive on the *runtime* registry class (the one the view uses),
  // not the compile-time symbol that may bind to this bundle's own copy.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
  [registryClass performSelector:@selector(setPrimitive:) withObject:recording];
  id activePrimitive = [registryClass performSelector:@selector(primitive)];
#pragma clang diagnostic pop
  if (activePrimitive != recording) {
    XCTSkip(@"Could not install recording primitive on the registry copy the view uses");
    return;
  }

  // SRMaskView is a RCTViewComponentView subclass; cast to the superclass type so
  // the Fabric mount/recycle methods are called with correct (typed) signatures —
  // `index:` is an NSInteger, which `performSelector:` cannot marshal correctly.
  RCTViewComponentView *maskView = [[maskViewClass alloc] initWithFrame:CGRectZero];
  XCTAssertNotNil(maskView);

  // A real RCTComponentViewProtocol-conforming child.
  RCTViewComponentView *child = [[RCTViewComponentView alloc] initWithFrame:CGRectZero];

  // Mount the child — SRMaskView should mask it (default maskLevel == "mask").
  [maskView mountChildComponentView:child index:0];

  NSArray<SRRecordedCall *> *afterMount = [recording callsForView:child];
  XCTAssertGreaterThanOrEqual(afterMount.count, 1u, @"mounting a child should mask it");
  XCTAssertEqualObjects(afterMount.lastObject.selectorName, @"mask",
                        @"a mounted child is masked by default");
  XCTAssertEqualObjects(afterMount.lastObject.level, @"mask");

  // Recycle — every child should be reset (return-to-inherit).
  [maskView prepareForRecycle];

  NSArray<SRRecordedCall *> *afterRecycle = [recording callsForView:child];
  BOOL sawReset = NO;
  for (SRRecordedCall *call in afterRecycle) {
    if ([call.selectorName isEqualToString:@"reset"]) {
      sawReset = YES;
    }
  }
  XCTAssertTrue(sawReset, @"prepareForRecycle should reset each child (R5)");

  // Clean up the runtime registry copy so we don't leak into other tests.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
  [registryClass performSelector:@selector(setPrimitive:) withObject:nil];
#pragma clang diagnostic pop
}

#pragma mark Default primitive mapping (Task 2.6)

/// Returns a fresh instance of the pod's default masking primitive
/// (`SRDefaultMaskingPrimitive`, registered at SDK init). Reached via the
/// runtime: the class is Swift-defined inside the pod with an explicit ObjC
/// name, so no public header is needed (the runtime de-dups duplicate class
/// copies to one, and `amp_isBlocked` dispatches by selector, so writes and
/// reads stay consistent across the app/test bundles).
static id<SRMaskingPrimitive> SRMakeDefaultPrimitive(void)
{
  Class cls = NSClassFromString(@"SRDefaultMaskingPrimitive");
  return [[cls alloc] init];
}

/// mask (level "mask") → `amp_isBlocked == YES` (the SDK's masking hook).
- (void)testDefaultPrimitiveMaskLevelMaskSetsAmpIsBlocked
{
  id<SRMaskingPrimitive> primitive = SRMakeDefaultPrimitive();
  XCTAssertNotNil(primitive, @"SRDefaultMaskingPrimitive must be linked (registered at SDK init)");

  UIView *view = [[UIView alloc] init];
  XCTAssertFalse(view.amp_isBlocked, @"Sanity: a fresh view is not blocked");

  [primitive maskView:view level:@"mask"];
  XCTAssertTrue(view.amp_isBlocked, @"mask(\"mask\") must set amp_isBlocked");
}

/// mask (level "block") → `amp_isBlocked == YES` (iOS has a single blocking
/// hook, so "mask" and "block" map identically).
- (void)testDefaultPrimitiveMaskLevelBlockSetsAmpIsBlocked
{
  id<SRMaskingPrimitive> primitive = SRMakeDefaultPrimitive();
  XCTAssertNotNil(primitive);

  UIView *view = [[UIView alloc] init];
  [primitive maskView:view level:@"block"];
  XCTAssertTrue(view.amp_isBlocked, @"mask(\"block\") must set amp_isBlocked");
}

/// unmask → `amp_isBlocked == NO`, including on a previously-masked view.
- (void)testDefaultPrimitiveUnmaskClearsAmpIsBlocked
{
  id<SRMaskingPrimitive> primitive = SRMakeDefaultPrimitive();
  XCTAssertNotNil(primitive);

  UIView *view = [[UIView alloc] init];
  [primitive maskView:view level:@"mask"];
  XCTAssertTrue(view.amp_isBlocked, @"Precondition: view is masked");

  [primitive unmaskView:view];
  XCTAssertFalse(view.amp_isBlocked, @"unmask must clear amp_isBlocked");
}

/// reset → `amp_isBlocked == NO` (approximation: the SDK has no per-view
/// "inherit" reset today; a precise `.none` reset is a documented fast-follow).
- (void)testDefaultPrimitiveResetClearsAmpIsBlocked
{
  id<SRMaskingPrimitive> primitive = SRMakeDefaultPrimitive();
  XCTAssertNotNil(primitive);

  UIView *view = [[UIView alloc] init];
  [primitive maskView:view level:@"mask"];
  XCTAssertTrue(view.amp_isBlocked, @"Precondition: view is masked");

  [primitive resetView:view];
  XCTAssertFalse(view.amp_isBlocked, @"reset must clear amp_isBlocked");
}

@end
