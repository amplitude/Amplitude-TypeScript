import {
  Result,
  BrowserOptions,
  BrowserConfig,
  BrowserClient,
  AnalyticsClient,
  IRemoteConfigClient,
  RemoteConfigClient,
  RemoteConfig,
  Source,
  DiagnosticsClient,
  safeJsonStringify,
  AttributionOptions,
  ServerZoneType,
  ILogger,
} from '@amplitude/analytics-core';
import {
  getPageViewTrackingConfig,
  getElementInteractionsConfig,
  getNetworkTrackingConfig,
  isAttributionTrackingEnabled,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  isElementInteractionsEnabled,
  isPageViewTrackingEnabled,
  isNetworkTrackingEnabled,
  isWebVitalsEnabled,
  getWebVitalsConfig,
  isFrustrationInteractionsEnabled,
  getFrustrationInteractionsConfig,
  isPerformanceTrackingEnabled,
  getPerformanceTrackingConfig,
  isPageUrlEnrichmentEnabled,
  isCustomEnrichmentEnabled,
} from './default-tracking';
import { getRuntimeEnvironment } from './utils/environment';
import { BROWSER_PLATFORM } from './plugins/context';
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
import { formInteractionTracking } from './plugins/form-interaction-tracking';
import { fileDownloadTracking } from './plugins/file-download-tracking';
import { updateBrowserConfigWithRemoteConfig } from './config/joined-config';
import { autocapturePlugin, frustrationPlugin, performancePlugin } from '@amplitude/plugin-autocapture-browser';
import { plugin as networkCapturePlugin } from '@amplitude/plugin-network-capture-browser';
import { webVitalsPlugin } from '@amplitude/plugin-web-vitals-browser';
import { WebAttribution } from './attribution/web-attribution';
import { eventPropertyTrackingPlugin } from '@amplitude/plugin-event-property-attribution-browser';
import { LIBPREFIX } from './lib-prefix';
import { VERSION } from './version';
import { pageUrlEnrichmentPlugin } from '@amplitude/plugin-page-url-enrichment-browser';
import { customEnrichmentPlugin } from '@amplitude/plugin-custom-enrichment-browser';
import { isEventPropertyAttributionEnabled, isUserPropertyAttributionEnabled } from './attribution/tracking-methods';
import { AmplitudeBrowserLite, AutocaptureAdapter } from './browser-client-lite';

/**
 * Exported for `@amplitude/unified` or integration with blade plugins.
 * If you only use `@amplitude/analytics-browser`, use `amplitude.init()` or `amplitude.createInstance()` instead.
 */
export class AmplitudeBrowser extends AmplitudeBrowserLite implements BrowserClient, AnalyticsClient {
  // The ES5 helper for a class that extends another derived class includes an
  // unreachable `|| this` branch. Ignore that generated constructor.
  /* istanbul ignore next */
  constructor() {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  previousSessionDeviceId: string | undefined;
  previousSessionUserId: string | undefined;
  webAttribution: WebAttribution | undefined;
  attributionTrackingOptions: AttributionOptions | undefined;
  private diagnosticsClient: DiagnosticsClient | undefined;
  diagnosticsSampleRate = 0;
  enableDiagnostics = true;
  private _autocaptureAdapter: AutocaptureAdapter | null = null;
  protected autocaptureAdapter(): AutocaptureAdapter | null {
    if (this._autocaptureAdapter) {
      return this._autocaptureAdapter;
    }
    this._autocaptureAdapter = {
      addPlugins: async () => {
        if (isFileDownloadTrackingEnabled(this.config.defaultTracking)) {
          this.config.loggerProvider.debug('Adding file download tracking plugin');
          await this.add(fileDownloadTracking()).promise;
        }

        if (isFormInteractionTrackingEnabled(this.config.defaultTracking)) {
          this.config.loggerProvider.debug('Adding form interaction plugin');
          await this.add(formInteractionTracking()).promise;
        }

        // Add page view plugin
        if (isPageViewTrackingEnabled(this.config.defaultTracking)) {
          if (!this.config.optOut) {
            this.config.loggerProvider.debug('Adding page view tracking plugin');
            await this.add(pageViewTrackingPlugin(getPageViewTrackingConfig(this.config))).promise;
          } else {
            this.timeline.addOptOutListener(async (optOut) => {
              /* istanbul ignore if */
              if (optOut) {
                return;
              }
              this.config.loggerProvider.debug('Adding page view tracking plugin');
              await this.add(pageViewTrackingPlugin(getPageViewTrackingConfig(this.config))).promise;
            });
          }
        }

        if (
          this.attributionTrackingOptions &&
          isAttributionTrackingEnabled(this.config.defaultTracking) &&
          isEventPropertyAttributionEnabled(this.attributionTrackingOptions)
        ) {
          this.config.loggerProvider.debug('Adding event property attribution plugin');
          await this.add(eventPropertyTrackingPlugin(this.attributionTrackingOptions)).promise;
        }

        if (isElementInteractionsEnabled(this.config.autocapture)) {
          this.config.loggerProvider.debug('Adding user interactions plugin (autocapture plugin)');
          const opts = this.diagnosticsClient ? { diagnosticsClient: this.diagnosticsClient } : undefined;
          await this.add(autocapturePlugin(getElementInteractionsConfig(this.config), opts)).promise;
        }

        if (isFrustrationInteractionsEnabled(this.config.autocapture)) {
          this.config.loggerProvider.debug('Adding frustration interactions plugin');
          await this.add(frustrationPlugin(getFrustrationInteractionsConfig(this.config))).promise;
        }

        if (isNetworkTrackingEnabled(this.config.autocapture)) {
          this.config.loggerProvider.debug('Adding network tracking plugin');
          await this.add(networkCapturePlugin(getNetworkTrackingConfig(this.config))).promise;
        }

        if (isWebVitalsEnabled(this.config.autocapture)) {
          this.config.loggerProvider.debug('Adding web vitals plugin');
          await this.add(webVitalsPlugin(getWebVitalsConfig(this.config))).promise;
        }

        if (isPerformanceTrackingEnabled(this.config.autocapture)) {
          this.config.loggerProvider.debug('Adding performance tracking plugin');
          await this.add(performancePlugin(getPerformanceTrackingConfig(this.config))).promise;
        }

        if (isPageUrlEnrichmentEnabled(this.config.autocapture)) {
          this.config.loggerProvider.debug('Adding referrer page url plugin');
          await this.add(pageUrlEnrichmentPlugin()).promise;
        }

        if (isCustomEnrichmentEnabled(this.config.customEnrichment)) {
          this.config.loggerProvider.debug('Adding custom enrichment plugin');
          await this.add(customEnrichmentPlugin()).promise;
        }
      },

      trackCampaignEventIfNeeded: (lastEventId?: number, promises?: Promise<Result>[]) => {
        if (
          !this.webAttribution ||
          !this.webAttribution.shouldTrackNewCampaign ||
          !isUserPropertyAttributionEnabled(this.webAttribution.options)
        ) {
          return false;
        }

        const campaignEvent = this.webAttribution.generateCampaignEvent(lastEventId);
        if (promises) {
          promises.push(this.track(campaignEvent).promise);
        } else {
          this.track(campaignEvent);
        }
        this.config.loggerProvider.log('Tracking attribution.');
        return true;
      },

      addAttributionTrackingPlugin: async () => {
        // Add web attribution plugin
        if (
          this.attributionTrackingOptions !== undefined &&
          isAttributionTrackingEnabled(this.config.defaultTracking) &&
          isUserPropertyAttributionEnabled(this.attributionTrackingOptions)
        ) {
          const attributionTrackingOptions = this.attributionTrackingOptions;
          if (this.config.optOut) {
            this.timeline.addOptOutListener(async (optOut) => {
              if (!optOut) {
                this.webAttribution = new WebAttribution(attributionTrackingOptions, this.config);
                await this.webAttribution.init();
              }
            });
          }
          this.webAttribution = new WebAttribution(attributionTrackingOptions, this.config);
          // Fetch the current campaign, check if need to track web attribution later
          await this.webAttribution.init();
        }
      },

      getDiagnosticsClient: async (
        options: BrowserOptions & { apiKey: string },
        loggerProvider: ILogger,
        serverZone: ServerZoneType,
        enableDiagnostics: boolean,
        diagnosticsSampleRate: number,
      ): Promise<DiagnosticsClient> => {
        const diagnosticsClient = new DiagnosticsClient(options.apiKey, loggerProvider, serverZone, {
          enabled: enableDiagnostics,
          sampleRate: diagnosticsSampleRate,
        });
        this.diagnosticsClient = diagnosticsClient;
        diagnosticsClient.setTag('library', `${LIBPREFIX}/${VERSION}`);
        diagnosticsClient.setTag('platform', BROWSER_PLATFORM);
        diagnosticsClient.setTag('web_environment', getRuntimeEnvironment());
        if (typeof navigator !== 'undefined') {
          diagnosticsClient.setTag('user_agent', navigator.userAgent);
        }
        return diagnosticsClient;
      },

      getRemoteConfigClient: async (
        options: BrowserOptions & { apiKey: string },
        loggerProvider: ILogger,
        serverZone: ServerZoneType,
      ): Promise<IRemoteConfigClient> => {
        const remoteConfigClient = new RemoteConfigClient(
          options.apiKey,
          loggerProvider,
          serverZone,
          /* istanbul ignore next */ options.remoteConfig?.serverUrl,
        );

        // Fetch diagnostics config first to get sample rate
        await new Promise<void>((resolve) => {
          // Disable coverage for this line because remote config client will always be defined in this case.
          // istanbul ignore next
          remoteConfigClient?.subscribe(
            'configs.diagnostics.browserSDK',
            'all',
            (remoteConfig: RemoteConfig | null, source: Source, lastFetch: Date) => {
              loggerProvider.debug(
                'Diagnostics remote configuration received:',
                safeJsonStringify(
                  {
                    remoteConfig,
                    source,
                    lastFetch,
                  },
                  null,
                  2,
                ),
              );
              if (remoteConfig) {
                // Validate and set sampleRate (must be a valid number)
                const sampleRate = remoteConfig.sampleRate as number;
                if (typeof sampleRate === 'number' && !isNaN(sampleRate)) {
                  this.diagnosticsSampleRate = sampleRate;
                }

                // Validate and set enabled (must be a boolean)
                const enabled = remoteConfig.enabled as boolean;
                if (typeof enabled === 'boolean') {
                  this.enableDiagnostics = enabled;
                }
              }
              resolve();
            },
          );
        });

        return remoteConfigClient;
      },

      fetchRemoteConfig: async (remoteConfigClient: IRemoteConfigClient, browserOptions: BrowserConfig) => {
        await new Promise<void>((resolve) => {
          // Disable coverage for this line because remote config client will always be defined in this case.
          // istanbul ignore next
          remoteConfigClient?.subscribe(
            'configs.analyticsSDK.browserSDK',
            'all',
            (remoteConfig: RemoteConfig | null, source: Source, lastFetch: Date) => {
              browserOptions.loggerProvider?.debug(
                'Remote configuration received:',
                safeJsonStringify(
                  {
                    remoteConfig,
                    source,
                    lastFetch,
                  },
                  null,
                  2,
                ),
              );
              if (remoteConfig) {
                updateBrowserConfigWithRemoteConfig(remoteConfig, browserOptions);
              }
              // Resolve the promise on first callback (initial config)
              resolve();
            },
          );
        });
      },
    };
    return this._autocaptureAdapter;
  }
}
