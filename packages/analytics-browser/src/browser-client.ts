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
  isFrustrationInteractionsEnabled,
  getFrustrationInteractionsConfig,
  isPerformanceTrackingEnabled,
  getPerformanceTrackingConfig,
  isPageUrlEnrichmentEnabled,
  isCustomEnrichmentEnabled,
} from './default-tracking';
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
import { formInteractionTracking } from './plugins/form-interaction-tracking';
import { fileDownloadTracking } from './plugins/file-download-tracking';
import { autocapturePlugin, frustrationPlugin, performancePlugin } from '@amplitude/plugin-autocapture-browser';
import { plugin as networkCapturePlugin } from '@amplitude/plugin-network-capture-browser';
import { webVitalsPlugin } from '@amplitude/plugin-web-vitals-browser';
import { WebAttribution } from './attribution/web-attribution';
import { eventPropertyTrackingPlugin } from '@amplitude/plugin-event-property-attribution-browser';
import { pageUrlEnrichmentPlugin } from '@amplitude/plugin-page-url-enrichment-browser';
import { customEnrichmentPlugin } from '@amplitude/plugin-custom-enrichment-browser';
import { isEventPropertyAttributionEnabled, isUserPropertyAttributionEnabled } from './attribution/tracking-methods';
import { AmplitudeBrowser as BrowserClientCore } from './browser-client-core';

/**
 * Exported for `@amplitude/unified` or integration with blade plugins.
 * If you only use `@amplitude/analytics-browser`, use `amplitude.init()` or `amplitude.createInstance()` instead.
 */
export class AmplitudeBrowser extends BrowserClientCore {
  protected async addPlugins() {
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

    if (this.diagnosticsClient && isElementInteractionsEnabled(this.config.autocapture)) {
      this.config.loggerProvider.debug('Adding user interactions plugin (autocapture plugin)');
      await this.add(
        autocapturePlugin(getElementInteractionsConfig(this.config), { diagnosticsClient: this.diagnosticsClient }),
      ).promise;
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
      await this.add(webVitalsPlugin()).promise;
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
  }

  protected async addAttributionTrackingPlugin() {
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
  }
}
