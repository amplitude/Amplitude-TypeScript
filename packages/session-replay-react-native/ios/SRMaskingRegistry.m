#import "SRMaskingPrimitive.h"

NS_ASSUME_NONNULL_BEGIN

/// A view's recorded masking intent; `level` is only meaningful when `unmask == NO`.
@interface SRMaskingIntent : NSObject
@property (nonatomic) BOOL unmask;
@property (nonatomic, copy, nullable) NSString *level;
@end

@implementation SRMaskingIntent
@end

@implementation SRMaskingRegistry

static id<SRMaskingPrimitive> _primitive = nil;
static BOOL _warnedUnregistered = NO;

/// Weak keys let views dealloc naturally. Main-thread-only, so no locking.
static NSMapTable<UIView *, SRMaskingIntent *> *_intents = nil;

+ (NSMapTable<UIView *, SRMaskingIntent *> *)intents
{
  if (_intents == nil) {
    _intents = [NSMapTable weakToStrongObjectsMapTable];
  }
  return _intents;
}

+ (nullable id<SRMaskingPrimitive>)primitive
{
  return _primitive;
}

+ (void)setPrimitive:(nullable id<SRMaskingPrimitive>)primitive
{
  _primitive = primitive;
  if (primitive == nil) {
    return;
  }
  for (UIView *view in [[self intents] keyEnumerator]) {
    SRMaskingIntent *intent = [[self intents] objectForKey:view];
    if (intent == nil) {
      continue;
    }
    if (intent.unmask) {
      [primitive unmaskView:view];
    } else {
      [primitive maskView:view level:(intent.level ?: @"")];
    }
  }
}

+ (void)maskView:(UIView *)view level:(NSString *)level
{
  SRMaskingIntent *intent = [[SRMaskingIntent alloc] init];
  intent.unmask = NO;
  intent.level = level;
  [[self intents] setObject:intent forKey:view];

  if (_primitive != nil) {
    [_primitive maskView:view level:level];
  } else {
    [self warnUnregisteredOnce];
  }
}

+ (void)unmaskView:(UIView *)view
{
  SRMaskingIntent *intent = [[SRMaskingIntent alloc] init];
  intent.unmask = YES;
  [[self intents] setObject:intent forKey:view];

  if (_primitive != nil) {
    [_primitive unmaskView:view];
  } else {
    [self warnUnregisteredOnce];
  }
}

+ (void)resetView:(UIView *)view
{
  [[self intents] removeObjectForKey:view];

  if (_primitive != nil) {
    [_primitive resetView:view];
  } else {
    [self warnUnregisteredOnce];
  }
}

+ (void)warnUnregisteredOnce
{
#if DEBUG
  if (!_warnedUnregistered) {
    _warnedUnregistered = YES;
    NSLog(@"[SRMaskingRegistry] No masking primitive registered; masking calls "
          @"are recorded and will replay once a primitive registers.");
  }
#endif
}

@end

NS_ASSUME_NONNULL_END
