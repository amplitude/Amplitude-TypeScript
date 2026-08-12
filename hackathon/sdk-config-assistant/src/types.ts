export type Product = 'analytics' | 'sessionReplay' | 'experiment' | 'guidesSurveys';

export type InstallMethod = 'npm' | 'script' | 'gtm' | 'unified-npm' | 'unified-script';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export interface AutocaptureToggles {
  attribution: boolean;
  pageViews: boolean;
  sessions: boolean;
  formInteractions: boolean;
  fileDownloads: boolean;
  elementInteractions: boolean;
  webVitals: boolean;
  frustrationInteractions: boolean;
}

export interface RegexPattern {
  /** regex source, without slashes */
  source: string;
  flags: string;
  /** plain-english description of what it matches */
  english: string;
}

export interface Answers {
  products: Product[];
  installMethod?: InstallMethod;
  packageManager: PackageManager;
  serverZone?: 'US' | 'EU';
  autocapture?: AutocaptureToggles | 'defaults';
  /** Only track page views on URLs matching this pattern */
  pageViewFilter?: RegexPattern;
  /** elementInteractions.pageUrlAllowlist entries */
  elementPageUrlAllowlist: RegexPattern[];
  fetchRemoteConfig?: boolean;
  srSampleRate?: number;
}

export const initialAnswers = (): Answers => ({
  products: ['analytics'],
  packageManager: 'npm',
  elementPageUrlAllowlist: [],
});

/** ---------- chat ---------- */

export type RegexTarget = 'pageViews' | 'elementPageUrl' | 'generic';

export type Widget =
  | { kind: 'autocaptureSelect' }
  | { kind: 'regexBuilder'; target: RegexTarget }
  | { kind: 'productSelect' };

export interface ChatMessage {
  id: number;
  role: 'bot' | 'user';
  text?: string;
  widget?: Widget;
  /** widget was used and is now frozen */
  widgetDone?: boolean;
}

export interface ChipOption {
  label: string;
  /** applied to answers when clicked */
  apply?: (a: Answers) => Answers;
  next: string;
}
