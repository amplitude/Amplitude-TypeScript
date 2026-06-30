require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
folly_compiler_flags = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32'

# --- RN-floor gate: Fabric SRMaskView (cpp + ios/fabric) needs new-arch + RN >= 0.77 ---
new_arch_enabled = ENV['RCT_NEW_ARCH_ENABLED'] == '1'
rn_version = nil
begin
  rn_pkg_path = `node -e "console.log(require.resolve('react-native/package.json'))"`.strip
  rn_version = JSON.parse(File.read(rn_pkg_path))["version"] unless rn_pkg_path.empty?
rescue StandardError
  rn_version = nil
end
srmaskview_version_ge_077 = lambda do |v|
  next false if v.nil?
  parts = v.split('.')
  major = parts[0].to_i
  minor = parts[1].to_i
  major > 0 || (major == 0 && minor >= 77)
end
fabric_enabled = new_arch_enabled && srmaskview_version_ge_077.call(rn_version)
if new_arch_enabled && !rn_version.nil? && !srmaskview_version_ge_077.call(rn_version)
  raise "[AmplitudeSessionReplayReactNative] The Fabric SRMaskView component requires React Native >= 0.77 with the New Architecture (found #{rn_version})."
end

Pod::Spec.new do |s|
  s.name         = "AmplitudeSessionReplayReactNative"
  s.version      = package["version"].split(/[-+]/).first
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/amplitude/Amplitude-TypeScript.git", :tag => "#{s.version}" }

  if fabric_enabled
    # Fabric build: include the C++ ShadowNode + the ios/fabric host view.
    s.source_files = "ios/**/*.{h,m,mm,swift}", "cpp/**/*.{h,cpp}"
    s.public_header_files = "ios/SRMaskingPrimitive.h", "ios/NativeSessionReplay-Bridging-Header.h"
    s.private_header_files = "ios/fabric/**/*.h", "cpp/**/*.h"
  else
    # No Fabric: exclude cpp/** and ios/fabric/** (they pull in renderer headers).
    s.source_files = "ios/*.{h,m,mm,swift}"
  end

  s.dependency 'AmplitudeSessionReplay', '>=0.11.1'
  s.dependency 'AmplitudeCore', '>=1.4.2'

  # This code is to support RN prior to 0.71.0. Should be removed when we drop support for RN < 0.71.0.
  # Use install_modules_dependencies helper to install the dependencies if React Native version >=0.71.0.
  # See https://github.com/facebook/react-native/blob/febf6b7f33fdb4904669f99d795eba4c0f95d7bf/scripts/cocoapods/new_architecture.rb#L79.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
    if fabric_enabled
      # Fabric shadow-node C++ headers break Clang module dependency scanning.
      existing_xcconfig = s.attributes_hash["pod_target_xcconfig"] || {}
      s.pod_target_xcconfig = existing_xcconfig.merge({
        "DEFINES_MODULE" => "NO",
        "CLANG_ENABLE_EXPLICIT_MODULES" => "NO",
      })
    end
  else
    s.dependency "React-Core"

    # Don't install the dependencies when we run `pod install` in the old architecture.
    if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
      s.compiler_flags = folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED=1"
      s.pod_target_xcconfig    = {
          "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
          "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1",
          "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
      }
      s.dependency "React-Codegen"
      s.dependency "RCT-Folly"
      s.dependency "RCTRequired"
      s.dependency "RCTTypeSafety"
      s.dependency "ReactCommon/turbomodule/core"
    end
  end
end
