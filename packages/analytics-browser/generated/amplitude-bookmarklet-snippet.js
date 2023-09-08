"use strict";

/**
 * Create a bookmark with this code snippet in the browser, update the apiKey, userId, and serverZone, and click the bookmark on any website to run.
 * Script will fail to load if the website has a Content Security Policy (CSP) that blocks third-party inline scripts.
 */
!function (window, document) {
  var amplitude = window.amplitude || {
    _q: [],
    _iq: {}
  };
  if (amplitude.invoked) window.console && console.error && console.error('Amplitude snippet has been loaded.');else {
    var proxy = function proxy(obj, fn) {
      obj.prototype[fn] = function () {
        this._q.push({
          name: fn,
          args: Array.prototype.slice.call(arguments, 0)
        });
        return this;
      };
    };
    var getPromiseResult = function getPromiseResult(instance, fn, args) {
      return function (resolve) {
        instance._q.push({
          name: fn,
          args: Array.prototype.slice.call(args, 0),
          resolve: resolve
        });
      };
    };
    var proxyMain = function proxyMain(instance, fn, isPromise) {
      instance[fn] = function () {
        if (isPromise) return {
          promise: new Promise(getPromiseResult(instance, fn, Array.prototype.slice.call(arguments)))
        };
      };
    };
    var setUpProxy = function setUpProxy(instance) {
      for (var k = 0; k < funcs.length; k++) {
        proxyMain(instance, funcs[k], false);
      }
      for (var l = 0; l < funcsWithPromise.length; l++) {
        proxyMain(instance, funcsWithPromise[l], true);
      }
    };
    amplitude.invoked = true;
    var as = document.createElement('script');
    as.type = 'text/javascript';
    as.integrity = 'sha384-lI19/rkWkq7akQskdqbaYBssAwNImFV9Iwejq7dylnP0Yx8TyWYX1PwAoaA5xrUp';
    as.crossOrigin = 'anonymous';
    as.async = true;
    as.src = 'https://cdn.amplitude.com/libs/analytics-browser-2.1.3-min.js.gz';
    as.onload = function () {
      if (!window.amplitude.runQueuedFunctions) {
        console.log('[Amplitude] Error: could not load SDK');
      }
      window.amplitude.init('YOUR_API_KEY', 'YOUR_USER_ID', {
        serverZone: 'YOUR_SERVER_ZONE'
      });
      var autoTracking = function autoTracking() {
        var name = '@amplitude/plugin-auto-tracking-browser';
        var type = 'enrichment';
        var tagList = ['a', 'button', 'input', 'select', 'textarea', 'label'];
        var observer = void 0;
        var eventListeners = [];
        var addEventListener = function addEventListener(element, type, handler) {
          element.addEventListener(type, handler);
          eventListeners.push({
            element: element,
            type: type,
            handler: handler
          });
        };
        var removeEventListeners = function removeEventListeners() {
          eventListeners.forEach(function (_ref) {
            var element = _ref.element,
              type = _ref.type,
              handler = _ref.handler;
            element?.removeEventListener(type, handler);
          });
          eventListeners = [];
        };
        var isTextNode = function isTextNode(node) {
          return !!node && node.nodeType === 3;
        };
        var isNonSensitiveString = function isNonSensitiveString(text) {
          if (text == null) {
            return false;
          }
          if (typeof value === 'string') {
            var ccRegex = /^(?:(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11}))$/;
            if (ccRegex.test((value || '').replace(/[- ]/g, ''))) {
              return false;
            }
            var ssnRegex = /(^\d{3}-?\d{2}-?\d{4}$)/;
            if (ssnRegex.test(value)) {
              return false;
            }
          }
          return true;
        };
        var isNonSensitiveElement = function isNonSensitiveElement(element) {
          var tag = element.tagName.toLowerCase();
          var sentitiveTags = ['input', 'select', 'textarea'];
          return !sentitiveTags.includes(tag);
        };
        var shouldTrackEvent = function shouldTrackEvent(event, element) {
          if (!element) {
            return false;
          }
          var type = element.type || '';
          if (typeof type === 'string') {
            switch (type.toLowerCase()) {
              case 'hidden':
                return false;
              case 'password':
                return false;
            }
          }
          var tag = element.tagName.toLowerCase();
          if (!tagList.includes(tag)) {
            return false;
          }
          switch (tag) {
            case 'input':
            case 'select':
            case 'textarea':
              return event === 'change' || event === 'click';
            default:
              var computedStyle = window.getComputedStyle(element);
              if (computedStyle && computedStyle.getPropertyValue('cursor') === 'pointer' && event === 'click') {
                return true;
              }
              return event === 'click';
          }
        };
        var getText = function getText(element) {
          var text = '';
          if (isNonSensitiveElement(element) && element.childNodes && element.childNodes.length) {
            text = element.innerText.replace(/\n/g, ' ')
          }
          return text;
        };
        var getEventProperties = function getEventProperties(event, element) {
          var tag = element.tagName.toLowerCase();
          var rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : {};
          var properties = {
            '[Amplitude] Element ID': element.id,
            '[Amplitude] Element Class': element.className,
            '[Amplitude] Element Tag': tag,
            '[Amplitude] Element Text': getText(element),
            '[Amplitude] Element Position Left': rect.left == null ? null : Math.round(rect.left),
            '[Amplitude] Element Position Top': rect.top == null ? null : Math.round(rect.top),
            '[Amplitude] Page URL': window.location.href.split('?')[0],
            '[Amplitude] Page Title': typeof document !== 'undefined' && document.title || '',
            '[Amplitude] Viewport Height': window.innerHeight,
            '[Amplitude] Viewport Width': window.innerWidth
          };
          if (tag === 'a' && event === 'click') {
            properties['[Amplitude] Element Href'] = element.href;
          }
          return properties;
        };
        var removeAmplitudePrefix = function removeAmplitudePrefix(str) {
          return str.replace(/^\[Amplitude\] /, '');
        }
        var getPageContext = function getPageContext() {
          return document.body.innerText.replace(/\n/g,' ');
        };
        var extractSemanticContextEvent = function extractSemanticContextEvent(event) {
          const event_properties = {};
          for (const [key, value] of Object.entries(event.event_properties)) {
            if ([
              '[Amplitude] Page Title',
              '[Amplitude] Page URL',
              '[Amplitude] Element Tag',
              '[Amplitude] Element Text',
              '[Amplitude] Element Href',
            ].includes(key)) {
              event_properties[removeAmplitudePrefix(key)] = value;
            }
          }
          const semanticContext = {
            event_type: removeAmplitudePrefix(event.event_type),
            event_properties,
          };
          return semanticContext;
        };
        var getSemanticContextText = function getSemanticContextText(event) {
          let semanticAction = '';
          switch (event.event_type) {
            case 'Element Clicked':
              semanticAction = 'Selected an element with these properties:';
              break;
            case 'Element Changed':
              semanticAction = 'Changed an element with these properties:';
              break;
            default:
              semanticAction = `Performed an action "${event.event_type}" with these properties:`;
              break;
          }
          let semanticContext = `${semanticAction}"""\n`;
          for (const [key, value] of Object.entries(event.event_properties)) {
            semanticContext += `${removeAmplitudePrefix(key)}: ${value}\n`;
          }
          return semanticContext + `"""`;
        };
        var getPrompt = function getPrompt(actionContext, pageContext, parentContext) {
          // Try not to use terms like "clicked" or "changed" in the event name. Use more descriptive terms based on the intent of the action
          // when possible.
          return `\
Given the page text, the text for all elements of a web page, and a user action on a specific element of that page,\
 suggest event name for the action in given the context of the page text.\
 Be as descriptive as possible while still being concise.\
 The event name will be used to track the event in Amplitude for use in user segmentation charts.\
 The Element Text is the text that was clicked on or changed.\
 The Surrounding Text is the text of the parent and siblings of the clicked or changed element.

Page text: """
${pageContext}
"""

User Action: """
${actionContext}
"""

Desired format:
Suggested event name: -||-`;

        };
        var getParentElement = function getParentElement(element, maxDepth) {
          let parentElement = element.parentElement;
          for(let i = 0; i < maxDepth; i++) {
            if (parentElement.parentElement) {
              parentElement = parentElement.parentElement;
            } else {
              break;
            }
          }
          return parentElement;
        };
        var generateSuggestedEvent = function getSuggestedEventLabel(event, element) {
          // The Element Text is the text that was clicked on or changed.
          //   The Parent Text is the text of the parent and siblings of the clicked or changed element.
          //   Labels should consider the parent content in addition to the element content.

          const parentContext = getText(getParentElement(element, 2));
          const actionContextEvent = extractSemanticContextEvent(event);
          actionContextEvent.event_properties['Surrounding Text'] = parentContext;
          const actionContext = getSemanticContextText(actionContextEvent);
          const prompt = getPrompt(actionContext, getPageContext(), parentContext);
          console.log(`actionContext`, actionContext);
          // console.log(`Prompt`, prompt);

          const openAiApiKey = 'YOUR_API_KEY_HERE';
          fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAiApiKey}`
              },
              body: JSON.stringify({
                "model": "gpt-3.5-turbo",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0
              })
            }
          ).then(response => response.json())
          .then(data => {
            // console.log(data);

            // Track new event with suggested name
            let suggestedEventName = data.choices[0].message.content;
            console.log(suggestedEventName);
            suggestedEventName = suggestedEventName.replace('Suggested event name: ', '');

            amplitude.track({
              ...event,
              event_type: `[Suggested] ${suggestedEventName}`,
            });
          })
        };

        var setup = function setup(_, amplitude) {
          if (!amplitude) {
            console.warn('Auto-tracking requires a later version of @amplitude/analytics-browser. Events are not tracked.');
            return;
          }
          if (typeof document === 'undefined') {
            return;
          }
          var track = function track(event, element) {
            amplitude.track(event);
            generateSuggestedEvent(event, element);
          };
          var addListener = function addListener(el) {
            if (shouldTrackEvent('click', el)) {
              addEventListener(el, 'click', function () {
                track({
                  event_type: '[Amplitude] Element Clicked',
                  event_properties: getEventProperties('click', el),
                }, el)
              });
            }
            if (shouldTrackEvent('change', el)) {
              addEventListener(el, 'change', function () {
                track({
                  event_type: '[Amplitude] Element Changed',
                  event_properties: getEventProperties('click', el),
                }, el)
              });
            }
          };
          var allElements = Array.from(document.body.querySelectorAll(tagList.join(',')));
          allElements.forEach(addListener);
          if (typeof MutationObserver !== 'undefined') {
            var _observer = new MutationObserver(function (mutations) {
              mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                  addListener(node);
                  if ('querySelectorAll' in node && typeof node.querySelectorAll === 'function') {
                    Array.from(node.querySelectorAll(tagList.join(','))).map(addListener);
                  }
                });
              });
            });
            _observer.observe(document.body, {
              subtree: true,
              childList: true
            });
          }
        };
        var execute = function execute(event) {
          return event;
        };
        var teardown = function teardown() {
          if (observer) {
            observer.disconnect();
          }
          removeEventListeners();
        };
        return {
          name: name,
          type: type,
          setup: setup,
          execute: execute,
          teardown: teardown
        };
      };
      window.amplitude.add(autoTracking());
      alert('Amplitude is now tracking events!');
    };
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(as, s);
    var Identify = function Identify() {
      this._q = [];
      return this;
    };
    var identifyFuncs = ['add', 'append', 'clearAll', 'prepend', 'set', 'setOnce', 'unset', 'preInsert', 'postInsert', 'remove', 'getUserProperties'];
    for (var i = 0; i < identifyFuncs.length; i++) {
      proxy(Identify, identifyFuncs[i]);
    }
    amplitude.Identify = Identify;
    var Revenue = function Revenue() {
      this._q = [];
      return this;
    };
    var revenueFuncs = ['getEventProperties', 'setProductId', 'setQuantity', 'setPrice', 'setRevenue', 'setRevenueType', 'setEventProperties'];
    for (var j = 0; j < revenueFuncs.length; j++) {
      proxy(Revenue, revenueFuncs[j]);
    }
    amplitude.Revenue = Revenue;
    var funcs = ['getDeviceId', 'setDeviceId', 'getSessionId', 'setSessionId', 'getUserId', 'setUserId', 'setOptOut', 'setTransport', 'reset', 'extendSession'];
    var funcsWithPromise = ['init', 'add', 'remove', 'track', 'logEvent', 'identify', 'groupIdentify', 'setGroup', 'revenue', 'flush'];
    setUpProxy(amplitude);
    amplitude.createInstance = function (instanceName) {
      amplitude._iq[instanceName] = {
        _q: []
      };
      setUpProxy(amplitude._iq[instanceName]);
      return amplitude._iq[instanceName];
    };
    window.amplitude = amplitude;
  }
}(window, document);
