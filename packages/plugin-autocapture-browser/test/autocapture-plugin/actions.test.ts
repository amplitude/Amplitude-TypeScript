import { autocapturePlugin, type ElementBasedTimestampedEvent } from '../../src/autocapture-plugin';

import { BrowserConfig, EnrichmentPlugin, ILogger } from '@amplitude/analytics-core';
import { createInstance } from '@amplitude/analytics-browser';
import type {
  ElementInteractionsOptions,
  LabeledEvent,
  Trigger,
} from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import { extractDataFromDataSource, getDataSource, executeActions } from '../../src/pageActions/actions';
import type { DataSource } from '@amplitude/analytics-core/lib/esm/types/element-interactions';

const TESTING_DEBOUNCE_TIME = 4;

describe('page actions', () => {
  let plugin: EnrichmentPlugin | undefined;
  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';
  let instance = createInstance();
  let track: jest.SpyInstance;
  let loggerProvider: ILogger;

  const bodyHTML = `
    <div>
      <div id="fixed-header-profile">
        <div id="fixed-header-profile-avatar">
          <img src="https://placehold.co/40x40" alt="Profile Avatar" />
        </div>
        <div id="fixed-header-profile-name">John Doe</div>
      </div>

      <div id="product-card-container">
        <div class="product-card" id="product-card-1">
          <h3 class="product-name">Product 1</h3>
          <p class="product-category">Category 1</p>
          <span class="price">$10.00</span>
          <button class="add-to-cart-button">Add to Cart</button>
        </div>

        <div class="product-card" id="product-card-2">
          <h3 class="product-name">Product 2</h3>
          <p class="product-category">Category 2</p>
          <span class="price">$20.00</span>
          <button class="add-to-cart-button">Add to Cart</button>
        </div>
      </div>
    </div>
    `;

  const labeledEvents: Record<string, LabeledEvent> = {
    '123': {
      id: '123',
      definition: [
        {
          event_type: 'click',
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'exact',
              subprop_value: ['Add to Cart'],
            },
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'autotrack css match',
              subprop_value: ['#product-card-container .add-to-cart-button'],
            },
          ],
        },
      ],
    },
  };

  const triggers: Trigger[] = [
    {
      id: 'trig1',
      name: 'Attach Event',
      conditions: [
        {
          type: 'LABELED_EVENT',
          match: {
            eventId: '123',
          },
        },
      ],
      actions: [
        {
          id: 'action1',
          actionType: 'ATTACH_EVENT_PROPERTY',
          dataSource: {
            sourceType: 'DOM_ELEMENT',
            elementExtractType: 'TEXT',
            scope: '.product-card',
            selector: '.product-name',
          },
          destinationKey: 'product-name',
        },
        {
          id: 'action2',
          actionType: 'ATTACH_EVENT_PROPERTY',
          dataSource: {
            sourceType: 'DOM_ELEMENT',
            elementExtractType: 'TEXT',
            scope: '.product-card',
            selector: '.product-category',
          },
          destinationKey: 'product-category',
        },
        {
          id: 'action3',
          actionType: 'ATTACH_EVENT_PROPERTY',
          dataSource: {
            sourceType: 'DOM_ELEMENT',
            elementExtractType: 'TEXT',
            scope: '.product-card',
            selector: '.price',
          },
          destinationKey: 'price',
        },
      ],
    },
  ];

  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: '',
        href: '',
        pathname: '',
        search: '',
      },
      writable: true,
    });
  });

  beforeEach(async () => {
    (window.location as any) = {
      hostname: '',
      href: '',
      pathname: '',
      search: '',
    };
    plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });
    loggerProvider = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as ILogger;

    plugin = autocapturePlugin({ debounceTime: TESTING_DEBOUNCE_TIME });
    instance = createInstance();
    await instance.init(API_KEY, USER_ID).promise;
    track = jest.spyOn(instance, 'track').mockImplementation(jest.fn());
  });

  afterEach(() => {
    void plugin?.teardown?.();
    document.getElementsByTagName('body')[0].innerHTML = '';
    jest.clearAllMocks();
  });

  describe('attach event properties', () => {
    beforeEach(() => {
      document.body.innerHTML = bodyHTML;
    });

    test('should attach properties from the closest matching scope', async () => {
      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: labeledEvents,
          triggers: triggers,
        },
      };
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        autocapture: {
          elementInteractions: autocaptureConfig,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      await plugin?.setup?.(config as BrowserConfig, instance);

      const button1 = document.querySelector('#product-card-1 .add-to-cart-button');

      // trigger click event on Card 1
      button1?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Element Clicked',
        expect.objectContaining({
          '[Amplitude] Element Class': 'add-to-cart-button',
          'product-name': 'Product 1',
          'product-category': 'Category 1',
          price: '$10.00',
        }),
      );

      const button2 = document.querySelector('#product-card-2 .add-to-cart-button');

      // trigger click event on Card 2
      button2?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenNthCalledWith(
        2,
        '[Amplitude] Element Clicked',
        expect.objectContaining({
          '[Amplitude] Element Class': 'add-to-cart-button',
          'product-name': 'Product 2',
          'product-category': 'Category 2',
          price: '$20.00',
        }),
      );
    });

    test('should not change the event if no actions are triggered', async () => {
      const autocaptureConfig: ElementInteractionsOptions = {};
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        autocapture: {
          elementInteractions: autocaptureConfig,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      await plugin?.setup?.(config as BrowserConfig, instance);

      const button1 = document.querySelector('#product-card-1 .add-to-cart-button');

      // trigger click event on Card 1
      button1?.dispatchEvent(new Event('click'));

      await new Promise((r) => setTimeout(r, TESTING_DEBOUNCE_TIME + 3));

      expect(track).toHaveBeenNthCalledWith(
        1,
        '[Amplitude] Element Clicked',
        expect.not.objectContaining({
          'product-name': 'Product 1',
          'product-category': 'Category 1',
          price: '$10.00',
        }),
      );
    });
  });

  describe('getDataSource', () => {
    // Return undefined if souceType is not one of the supported types
    test('should return undefined if sourceType is not one of the supported types', () => {
      const data = getDataSource({ sourceType: 'UNEXPECTED_TYPE' } as unknown as DataSource, document.body);
      expect(data).toBeUndefined();
    });
  });

  describe('extractDataFromDataSource', () => {
    beforeEach(() => {
      document.body.innerHTML = bodyHTML;
    });

    test('should extract data from scopingElement if no further selector is provided', () => {
      const productCard1 = document.querySelector('#product-card-1');
      const button1 = document.querySelector('#product-card-1 .add-to-cart-button');
      const data = extractDataFromDataSource(
        {
          sourceType: 'DOM_ELEMENT',
          elementExtractType: 'TEXT',
          scope: '.product-card',
        },
        button1 as HTMLElement,
      );
      expect(data).toBe(productCard1?.textContent);
    });

    test('should return undefined if no element source is found', () => {
      const button1 = document.querySelector('#product-card-1 .add-to-cart-button');
      const data = extractDataFromDataSource(
        {
          sourceType: 'DOM_ELEMENT',
          elementExtractType: 'TEXT',
          scope: '.non-existent-scope',
        },
        button1 as HTMLElement,
      );
      expect(data).toBeUndefined();
    });

    test('should extract attribute from element', () => {
      const avatarImage = document.querySelector('#fixed-header-profile-avatar img');
      const data = extractDataFromDataSource(
        {
          sourceType: 'DOM_ELEMENT',
          elementExtractType: 'ATTRIBUTE',
          attribute: 'src',
          selector: '#fixed-header-profile-avatar img',
        },
        document.body,
      );
      expect(data).toBe(avatarImage?.getAttribute('src'));
    });

    test('should return undefined for unsupported elementExtractType', () => {
      const button1 = document.querySelector('#product-card-1 .add-to-cart-button');
      const data = extractDataFromDataSource(
        {
          sourceType: 'DOM_ELEMENT',
          elementExtractType: 'UNSUPPORTED_TYPE' as 'TEXT',
          selector: '.add-to-cart-button',
        },
        button1 as HTMLElement,
      );
      expect(data).toBeUndefined();
    });

    test('should return undefined for non-DOM_ELEMENT sourceType', () => {
      const button1 = document.querySelector('#product-card-1 .add-to-cart-button');
      const data = extractDataFromDataSource(
        {
          sourceType: 'UNSUPPORTED_SOURCE_TYPE' as 'DOM_ELEMENT',
          elementExtractType: 'TEXT',
          selector: '.add-to-cart-button',
        },
        button1 as HTMLElement,
      );
      expect(data).toBeUndefined();
    });
  });

  describe('executeActions', () => {
    beforeEach(() => {
      document.body.innerHTML = bodyHTML;
    });

    test('should skip string actions', () => {
      const mockEvent = {
        closestTrackedAncestor: document.querySelector('#product-card-1 .add-to-cart-button'),
        targetElementProperties: {},
      };

      const stringActions = ['action1', 'action2'];

      executeActions(stringActions, mockEvent as unknown as ElementBasedTimestampedEvent<MouseEvent>);

      // Should not add any properties since string actions are skipped
      expect(mockEvent.targetElementProperties).toEqual({});
    });
  });
});
