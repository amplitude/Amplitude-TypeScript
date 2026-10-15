import { MetricType } from '../../src/types';

import type { ZoningFixture } from './types';

const DEFAULT_FLAGS = {
  cssMatchAggregation: false,
  shadowDom: false,
};

export const ZONING_PARITY_FIXTURES: ZoningFixture[] = [
  {
    name: 'F-D5a deep span resolves to button',
    html: `<button id="cta" class="primary"><span id="label">Buy</span></button>`,
    clickTarget: '#label',
    selectorsWithData: [],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RATE_SESSION,
    expected: {
      allowedElementSelector: 'button#cta',
    },
  },
  {
    name: 'F-D2a leaf zone aggregation off — no parent query',
    html: `<button id="solo">Only</button>`,
    clickTarget: '#solo',
    selectorsWithData: ['button#solo'],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RATE_SESSION,
    expected: {
      parentQueries: [],
    },
  },
  {
    name: 'F-D2d CLICK_RECURRENCE leaf aggregation off — self query',
    html: `<button id="solo">Only</button>`,
    clickTarget: '#solo',
    selectorsWithData: ['button#solo'],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RECURRENCE,
    expected: {
      parentQueries: [{ parentZoneId: 'button#solo', zoneIds: ['button#solo'] }],
    },
  },
  {
    name: 'F-D2b leaf zone aggregation on — self alias query',
    html: `<button id="solo">Only</button>`,
    clickTarget: '#solo',
    selectorsWithData: ['button#solo'],
    flags: { ...DEFAULT_FLAGS, cssMatchAggregation: true },
    metricType: MetricType.CLICK_RATE_SESSION,
    expected: {
      parentQueries: [{ parentZoneId: 'button#solo', zoneIds: ['button#solo'] }],
    },
  },
  {
    name: 'F-D6a nested saved zones — top-level only',
    html: `<div id="outer"><button id="inner">Go</button></div>`,
    clickTarget: '#inner',
    savedZones: ['div#outer'],
    selectorsWithData: ['div#outer', 'button#inner'],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RATE_SESSION,
    expected: {
      topLevelZoneIds: ['div#outer'],
    },
  },
  {
    name: 'F-D3a alias match via element.matches',
    html: `<button id="btn" class="track">Go</button>`,
    clickTarget: '#btn',
    selectorsWithData: ['button.track'],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RATE_SESSION,
    initialResponse: {
      data: [
        {
          zoneMetrics: [
            {
              selector: 'button.track',
              metrics: {
                clickRateSession: {
                  metricValue: 0.42,
                  clickSessionCount: 4,
                  totalSessions: 10,
                },
              },
            },
          ],
        },
      ],
    },
    expected: {
      matchedValue: 0.42,
    },
  },
  {
    name: 'F-D7a CLICK_DISTRIBUTION parent sums value and count',
    html: `<div id="parent"><button id="child">Go</button></div>`,
    clickTarget: '#parent',
    selectorsWithData: ['div#parent', 'button#child'],
    flags: { ...DEFAULT_FLAGS, cssMatchAggregation: true },
    metricType: MetricType.CLICK_DISTRIBUTION,
    initialResponse: {
      data: [
        {
          zoneMetrics: [
            {
              selector: 'div#parent',
              metrics: {
                clickDistribution: {
                  metricValue: 0.1,
                  zoneClickCount: 1,
                  totalClicks: 10,
                },
              },
            },
            {
              selector: 'button#child',
              metrics: {
                clickDistribution: {
                  metricValue: 0.2,
                  zoneClickCount: 2,
                  totalClicks: 10,
                },
              },
            },
          ],
        },
      ],
    },
    expected: {
      matchedValue: 0.3,
      eventCount: 3,
    },
  },
  {
    name: 'F-D10a default strips query and hash from pageUrl',
    html: `<button id="x">X</button>`,
    clickTarget: '#x',
    selectorsWithData: [],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RATE_SESSION,
    pageScope: {
      pageUrl: 'https://shop.example.com/checkout?cart=1#pay',
    },
    expected: {
      request: {
        pageUrl: 'https://shop.example.com/checkout',
      },
      requestEnabled: true,
    },
  },
  {
    name: 'F-D10b contains operator preserves query',
    html: `<button id="x">X</button>`,
    clickTarget: '#x',
    selectorsWithData: [],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RATE_SESSION,
    pageScope: {
      pageUrl: 'https://shop.example.com/p?ref=1',
      pageUrlOperator: 'contains',
    },
    expected: {
      request: {
        pageUrl: 'https://shop.example.com/p?ref=1',
        pageUrlOperator: 'contains',
      },
    },
  },
  {
    name: 'F-D10c pageGroupId — no pageUrl on request',
    html: `<button id="x">X</button>`,
    clickTarget: '#x',
    selectorsWithData: [],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RATE_SESSION,
    pageScope: { pageGroupId: 'pg-123' },
    expected: {
      request: { pageGroupId: 'pg-123' },
    },
  },
  {
    name: 'F-D10d parentZoneId with empty zoneIds disables query',
    html: `<button id="x">X</button>`,
    clickTarget: '#x',
    selectorsWithData: [],
    flags: DEFAULT_FLAGS,
    metricType: MetricType.CLICK_RATE_SESSION,
    pageScope: { pageUrl: 'https://example.com/' },
    parentZoneId: 'button#x',
    zoneIds: [],
    expected: {
      requestEnabled: false,
    },
  },
  {
    name: 'F-D1b engine disabled uses legacy css path',
    html: `<div id="legacy">Legacy</div>`,
    clickTarget: '#legacy',
    selectorsWithData: [],
    flags: DEFAULT_FLAGS,
    browserSDK: {
      autocapture: {
        elementSelector: { enabled: false },
      },
    },
    metricType: MetricType.CLICK_RATE_SESSION,
    expected: {},
  },
  {
    name: 'F-CFG merge elementInteractions shadow fields',
    html: `<div id="cfg">Cfg</div>`,
    clickTarget: '#cfg',
    selectorsWithData: [],
    flags: { cssMatchAggregation: false, shadowDom: true },
    browserSDK: {
      autocapture: {
        elementSelector: { shadowDomEnabled: false, maxShadowDomDepth: 1 },
        elementInteractions: {
          shadowDomEnabled: true,
          maxShadowDomDepth: 3,
        },
      },
    },
    metricType: MetricType.CLICK_RATE_SESSION,
    expected: {},
  },
];
