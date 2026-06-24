#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@protocol SRMaskingPrimitive <NSObject>

- (void)maskView:(UIView *)view level:(NSString *)level;
- (void)unmaskView:(UIView *)view;
- (void)clearForView:(UIView *)view;

@end

@interface SRMaskingRegistry : NSObject

@property (class, nonatomic, nullable, strong) id<SRMaskingPrimitive> primitive;

+ (void)maskView:(UIView *)view level:(NSString *)level;
+ (void)unmaskView:(UIView *)view;
+ (void)clearForView:(UIView *)view;

@end

NS_ASSUME_NONNULL_END
