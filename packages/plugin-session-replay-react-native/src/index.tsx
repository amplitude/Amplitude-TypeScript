// The React Native Session Replay plugin is a thin wrapper around the
// standalone `@amplitude/session-replay-react-native` package. All of the
// session-replay surface (the plugin class, the native mask view, the
// masking enum, and the privacy/config types) lives in the standalone package
// so there is a single source of truth and a single linked native module.
//
// See SDKRN-14 for the consolidation that removed the duplicated native
// modules, TypeScript config, and `SessionReplayPlugin` implementation that
// previously lived in this package.
export { SessionReplayPlugin, AmpMaskView } from '@amplitude/session-replay-react-native';
export type { MaskLevel, PrivacyConfig, SessionReplayPluginConfig } from '@amplitude/session-replay-react-native';

import type { SessionReplayPluginConfig } from '@amplitude/session-replay-react-native';

/**
 * @deprecated Use `SessionReplayPluginConfig` instead. This alias is kept for
 * backward compatibility and will be removed in a future major release.
 */
export type SessionReplayConfig = SessionReplayPluginConfig;
