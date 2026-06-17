#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>

#import "SRMaskView.h"
#import "SRMaskingPrimitive.h"

@interface RecordingMaskingPrimitive : NSObject <SRMaskingPrimitive>
@property (nonatomic, strong) NSMutableArray<UIView *> *masked;
@end

@implementation RecordingMaskingPrimitive

- (instancetype)init
{
  if (self = [super init]) {
    _masked = [NSMutableArray array];
  }
  return self;
}

- (void)maskView:(UIView *)view level:(NSString *)level
{
  [self.masked addObject:view];
}

- (void)unmaskView:(UIView *)view
{
  [self.masked removeObject:view];
}

- (void)clearForView:(UIView *)view
{
  [self.masked removeObject:view];
}

@end

@interface SRMaskViewTests : XCTestCase
@end

@implementation SRMaskViewTests

- (void)setUp
{
  [super setUp];
  [SRMaskingRegistry setPrimitive:nil];
}

- (void)testMaskChildFiresForEveryDirectChild
{
#ifdef RCT_NEW_ARCH_ENABLED
  RecordingMaskingPrimitive *recordingPrimitive = [RecordingMaskingPrimitive new];
  [SRMaskingRegistry setPrimitive:recordingPrimitive];

  SRMaskView *maskView = [SRMaskView new];
  SRMaskView *child = [SRMaskView new];

  [maskView mountChildComponentView:child index:0];

  XCTAssertTrue([recordingPrimitive.masked containsObject:child]);
#else
  XCTSkip(@"SRMaskView Fabric tests require RCT_NEW_ARCH_ENABLED");
#endif
}

@end
