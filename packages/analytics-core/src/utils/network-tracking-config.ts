import { ILogger } from '../logger';
import { NetworkCaptureRule } from '../types/network-tracking';

/**
 * If a capture rule sets both `urls` and `hosts`, `urls` take precedence and `hosts` are ignored.
 */
export const normalizeNetworkCaptureRules = (
  captureRules: NetworkCaptureRule[] | undefined,
  logger?: Pick<ILogger, 'warn'> | null,
): NetworkCaptureRule[] | undefined =>
  captureRules?.map((rule) => {
    // if URLs and hosts are both set, URLs take precedence over hosts
    if (rule.urls?.length && rule.hosts?.length) {
      const hostsString = JSON.stringify(rule.hosts);
      const urlsString = JSON.stringify(rule.urls);
      logger?.warn(
        `Found network capture rule with both urls='${urlsString}' and hosts='${hostsString}' set. ` +
          `Definition of urls takes precedence over hosts, so ignoring hosts.`,
      );
      return { ...rule, hosts: undefined };
    }
    return rule;
  });
