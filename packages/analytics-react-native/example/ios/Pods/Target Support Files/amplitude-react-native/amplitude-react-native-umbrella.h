#ifdef __OBJC__
#import <UIKit/UIKit.h>
#else
#ifndef FOUNDATION_EXPORT
#if defined(__cplusplus)
#define FOUNDATION_EXPORT extern "C"
#else
#define FOUNDATION_EXPORT extern
#endif
#endif
#endif

#import "AmplitudeReactNative-Bridging-Header.h"

FOUNDATION_EXPORT double amplitude_react_nativeVersionNumber;
FOUNDATION_EXPORT const unsigned char amplitude_react_nativeVersionString[];

