#import "AmpMaskApplier.h"
@import AmplitudeSessionReplay;

@implementation AmpMaskApplier

+ (void)applyMask:(NSString *)mask toView:(UIView *)view
{
  view.amp_isBlocked = ![mask isEqualToString:@"amp-unmask"];
}

+ (void)resetView:(UIView *)view
{
  // Fail closed: amp_isBlocked is a bool with no "inherit/none" state, so a
  // recycled view can only be reset to masked or unmasked. Reset to masked so
  // that if a reused instance is ever captured before updateProps re-applies
  // its real mask value, it errs toward hiding content, never exposing it.
  // Matches applyMask's unknown-value policy and the component's masked default.
  view.amp_isBlocked = true;
}

@end
