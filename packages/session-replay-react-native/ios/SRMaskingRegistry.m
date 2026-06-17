#import "SRMaskingPrimitive.h"

@implementation SRMaskingRegistry

static id<SRMaskingPrimitive> _primitive = nil;
static BOOL _warnedUnregistered = NO;

+ (id<SRMaskingPrimitive>)primitive
{
  return _primitive;
}

+ (void)setPrimitive:(id<SRMaskingPrimitive>)primitive
{
  _primitive = primitive;
}

+ (void)maskView:(UIView *)view level:(NSString *)level
{
  if (_primitive != nil) {
    [_primitive maskView:view level:level];
    return;
  }
#if DEBUG
  if (!_warnedUnregistered) {
    _warnedUnregistered = YES;
    NSLog(@"[SRMaskingRegistry] No masking primitive registered. Masking calls are no-ops until the Session Replay SDK registers one.");
  }
#endif
}

+ (void)unmaskView:(UIView *)view
{
  if (_primitive != nil) {
    [_primitive unmaskView:view];
    return;
  }
#if DEBUG
  if (!_warnedUnregistered) {
    _warnedUnregistered = YES;
    NSLog(@"[SRMaskingRegistry] No masking primitive registered. Masking calls are no-ops until the Session Replay SDK registers one.");
  }
#endif
}

+ (void)clearForView:(UIView *)view
{
  if (_primitive != nil) {
    [_primitive clearForView:view];
    return;
  }
#if DEBUG
  if (!_warnedUnregistered) {
    _warnedUnregistered = YES;
    NSLog(@"[SRMaskingRegistry] No masking primitive registered. Masking calls are no-ops until the Session Replay SDK registers one.");
  }
#endif
}

@end
