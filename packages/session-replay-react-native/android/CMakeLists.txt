cmake_minimum_required(VERSION 3.13)

project(sessionreplayreactnative)

set(LIB_ANDROID_DIR ${CMAKE_CURRENT_SOURCE_DIR})
set(LIB_ANDROID_GENERATED_JNI_DIR ${LIB_ANDROID_DIR}/build/generated/source/codegen/jni)
set(LIB_ANDROID_GENERATED_COMPONENTS_DIR ${LIB_ANDROID_GENERATED_JNI_DIR}/react/renderer/components/SRMaskViewSpec)

add_library(
  sessionreplayreactnative
  SHARED
  ../cpp/SRMaskViewShadowNode.cpp
)

set_target_properties(
  sessionreplayreactnative
  PROPERTIES
    CXX_STANDARD 20
    CXX_STANDARD_REQUIRED ON
    CXX_EXTENSIONS OFF
    POSITION_INDEPENDENT_CODE ON
)

target_compile_definitions(
  sessionreplayreactnative
  PRIVATE
    -DFOLLY_NO_CONFIG=1
)

target_include_directories(
  sessionreplayreactnative
  PRIVATE
    ${LIB_ANDROID_GENERATED_JNI_DIR}
    ${LIB_ANDROID_GENERATED_COMPONENTS_DIR}
)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

target_link_libraries(
  sessionreplayreactnative
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
  android
)
