# Public API surface — @amplitude/plugin-session-replay-react-native
#
# AUTO-GENERATED golden report. Do NOT edit by hand.
# Regenerate intentionally with:
#   UPDATE_PUBLIC_API=1 pnpm --filter @amplitude/plugin-session-replay-react-native test
#
# This file is the reviewable record of the package PUBLIC API as resolved
# from its type declarations. A diff here means the public surface changed
# and a conscious decision (+ semver bump) is required. Resolved with the
# repo-pinned TypeScript (4.9.5).

export const AmpMaskView  // [value]
  childContextTypes?: ValidationMap<any> | undefined
  contextType?: Context<any> | undefined
  contextTypes?: ValidationMap<any> | undefined
  defaultProps?: Partial<AmpMaskViewProps> | undefined
  displayName?: string | undefined
  getDerivedStateFromError?: GetDerivedStateFromError<AmpMaskViewProps, any> | undefined
  getDerivedStateFromProps?: GetDerivedStateFromProps<AmpMaskViewProps, any> | undefined
  propTypes?: WeakValidationMap<AmpMaskViewProps> | undefined

export type MaskLevel  // [type]
  "conservative" | "light" | "medium"

export interface PrivacyConfig  // [type]
  maskLevel?: MaskLevel | undefined

export type SessionReplayConfig  // [type]
  autoStart?: boolean | undefined
  enableRemoteConfig?: boolean | undefined
  logLevel?: LogLevel | undefined
  privacyConfig?: PrivacyConfig | undefined
  sampleRate?: number | undefined

export class SessionReplayPlugin  // [value+type]
  constructor(config?: SessionReplayPluginConfig): SessionReplayPlugin
  execute: (event: Event) => Promise<Event | null>
  getSessionReplayProperties: () => Promise<SessionReplayProperties>
  name: string
  setup: (config: ReactNativeConfig, _: ReactNativeClient) => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  teardown: () => Promise<void>
  type: "enrichment"

export interface SessionReplayPluginConfig  // [type]
  autoStart?: boolean | undefined
  enableRemoteConfig?: boolean | undefined
  logLevel?: LogLevel | undefined
  privacyConfig?: PrivacyConfig | undefined
  sampleRate?: number | undefined

