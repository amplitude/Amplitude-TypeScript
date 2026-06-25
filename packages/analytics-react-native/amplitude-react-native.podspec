require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name = "amplitude-react-native"
  s.version = package["version"]
  s.summary = package["description"]
  s.homepage = package["homepage"]
  s.license = package["license"]
  s.authors = package["author"]

  s.swift_version = "5.0"

  # iOS/tvOS 12.0 is the lowest deployment target Xcode 26 accepts (required for
  # App Store uploads as of 2026-04-28) and matches NWPathMonitor's minimum.
  # https://developer.apple.com/news/upcoming-requirements/?id=02032026a
  s.platforms = { :ios => "12.0", :tvos => "12.0" }
  s.source = { :git => "https://github.com/amplitude/Amplitude-TypeScript.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  # XCTest sources compiled by the example app's appTests target, not consumers.
  s.exclude_files = "ios/Tests/**"

  s.dependency "React-Core"
end
