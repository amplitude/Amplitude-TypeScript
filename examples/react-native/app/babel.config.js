module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Mirrors the .env / VITE_AMPLITUDE_API_KEY pattern in
    // .github/actions/e2e-test/action.yml — inlines AMPLITUDE_API_KEY from
    // the build-time shell environment into the JS bundle. CI passes the
    // GitHub secret as an env to the xcodebuild step; local devs can
    // `export AMPLITUDE_API_KEY=…` (or use direnv) before running pnpm ios.
    // With no env var set, App.tsx falls back to the literal 'YOUR_API_KEY'.
    ['transform-inline-environment-variables', {include: ['AMPLITUDE_API_KEY']}],
  ],
};
