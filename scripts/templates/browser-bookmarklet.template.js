const snippet = (name, integrity, version, globalVar, apiKey, userId, serverZone) => `
!(function (window, document) {
  var amplitude = window.${globalVar} || { _q: [], _iq: {} };
  if (amplitude.invoked) window.console && console.error && console.error('Amplitude snippet has been loaded.');
  else {
    amplitude.invoked = true;
    var as = document.createElement('script');
    as.type = 'text/javascript';
    as.integrity = '${integrity}';
    as.crossOrigin = 'anonymous';
    as.async = true;
    as.src = 'https://cdn.amplitude.com/libs/${name}-${version}-min.js.gz';
    as.onload = function () {
      if (!window.${globalVar}.runQueuedFunctions) {
        console.log('[Amplitude] Error: could not load SDK');
      }
      window.${globalVar}.init('${apiKey}', '${userId}', { serverZone: '${serverZone}' });
      const autoTracking = () => {
        const name = '@amplitude/plugin-auto-tracking-browser';
        const type = 'enrichment';
        const tagList = ['a', 'button', 'input', 'select', 'textarea', 'label'];
        let observer;
        let eventListeners = [];
        const addEventListener = (element, type, handler) => {
          element.addEventListener(type, handler);
          eventListeners.push({
            element,
            type,
            handler,
          });
        };
        const removeEventListeners = () => {
          eventListeners.forEach(({ element, type, handler }) => {
            element?.removeEventListener(type, handler);
          });
          eventListeners = [];
        };
        const isTextNode = (node) => !!node && node.nodeType === 3;
        const isNonSensitiveString = (text) => {
          if (text == null) {
            return false;
          }
          if (typeof value === 'string') {
            const ccRegex =
              /^(?:(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11}))$/;
            if (ccRegex.test((value || '').replace(/[- ]/g, ''))) {
              return false;
            }
            const ssnRegex = /(^\\d{3}-?\\d{2}-?\\d{4}$)/;
            if (ssnRegex.test(value)) {
              return false;
            }
          }
          return true;
        };
        const isNonSensitiveElement = (element) => {
          const tag = element.tagName.toLowerCase();
          const sentitiveTags = ['input', 'select', 'textarea'];
          return !sentitiveTags.includes(tag);
        };
        const shouldTrackEvent = (event, element) => {
          if (!element) {
            return false;
          }
          const type = element.type || '';
          if (typeof type === 'string') {
            switch (type.toLowerCase()) {
              case 'hidden':
                return false;
              case 'password':
                return false;
            }
          }
          const tag = element.tagName.toLowerCase();
          if (!tagList.includes(tag)) {
            return false;
          }
          switch (tag) {
            case 'input':
            case 'select':
            case 'textarea':
              return event === 'change' || event === 'click';
            default:
              const computedStyle = window.getComputedStyle(element);
              if (computedStyle && computedStyle.getPropertyValue('cursor') === 'pointer' && event === 'click') {
                return true;
              }
              return event === 'click';
          }
        };
        const getText = (element) => {
          let text = '';
          if (isNonSensitiveElement(element) && element.childNodes && element.childNodes.length) {
            element.childNodes.forEach(function (child) {
              if (isTextNode(child) && child.textContent) {
                text += child.textContent
                  .split(/(\\s+)/)
                  .filter(isNonSensitiveString)
                  .join('')
                  .replace(/[\\r\\n]/g, ' ')
                  .replace(/[ ]+/g, ' ')
                  .substring(0, 255);
              }
            });
          }
          return text;
        };
        const getEventProperties = (event, element) => {
          const tag = element.tagName.toLowerCase();
          const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : {};
          const properties = {
            '[Amplitude] Element ID': element.id,
            '[Amplitude] Element Class': element.className,
            '[Amplitude] Element Tag': tag,
            '[Amplitude] Element Text': getText(element),
            '[Amplitude] Element Position Left': rect.left == null ? null : Math.round(rect.left),
            '[Amplitude] Element Position Top': rect.top == null ? null : Math.round(rect.top),
            '[Amplitude] Page URL': window.location.href.split('?')[0],
            '[Amplitude] Page Title': (typeof document !== 'undefined' && document.title) || '',
            '[Amplitude] Viewport Height': window.innerHeight,
            '[Amplitude] Viewport Width': window.innerWidth,
          };
          if (tag === 'a' && event === 'click') {
            properties['[Amplitude] Element Href'] = element.href;
          }
          return properties;
        };
        const setup = (_, amplitude) => {
          if (!amplitude) {
            console.warn(
              'Auto-tracking requires a later version of @amplitude/analytics-browser. Events are not tracked.',
            );
            return;
          }
          if (typeof document === 'undefined') {
            return;
          }
          const addListener = (el) => {
            if (shouldTrackEvent('click', el)) {
              addEventListener(el, 'click', () => {
                amplitude.track('[Amplitude] Element Clicked', getEventProperties('click', el));
              });
            }
            if (shouldTrackEvent('change', el)) {
              addEventListener(el, 'change', () => {
                amplitude.track('[Amplitude] Element Changed', getEventProperties('change', el));
              });
            }
          };
          const allElements = Array.from(document.body.querySelectorAll(tagList.join(',')));
          allElements.forEach(addListener);
          if (typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                  addListener(node);
                  if ('querySelectorAll' in node && typeof node.querySelectorAll === 'function') {
                    Array.from(node.querySelectorAll(tagList.join(','))).map(addListener);
                  }
                });
              });
            });
            observer.observe(document.body, {
              subtree: true,
              childList: true,
            });
          }
        };
        const execute = (event) => event;
        const teardown = () => {
          if (observer) {
            observer.disconnect();
          }
          removeEventListeners();
        };
        return {
          name,
          type,
          setup,
          execute,
          teardown,
        };
      };
      window.${globalVar}.add(autoTracking());
      alert('Amplitude is now tracking events!');
    };
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(as, s);
    function proxy(obj, fn) {
      obj.prototype[fn] = function () {
        this._q.push({
          name: fn,
          args: Array.prototype.slice.call(arguments, 0),
        });
        return this;
      };
    }
    var Identify = function () {
      this._q = [];
      return this;
    };
    var identifyFuncs = [
      'add',
      'append',
      'clearAll',
      'prepend',
      'set',
      'setOnce',
      'unset',
      'preInsert',
      'postInsert',
      'remove',
      'getUserProperties',
    ];
    for (var i = 0; i < identifyFuncs.length; i++) {
      proxy(Identify, identifyFuncs[i]);
    }
    amplitude.Identify = Identify;
    var Revenue = function () {
      this._q = [];
      return this;
    };
    var revenueFuncs = [
      'getEventProperties',
      'setProductId',
      'setQuantity',
      'setPrice',
      'setRevenue',
      'setRevenueType',
      'setEventProperties',
    ];
    for (var j = 0; j < revenueFuncs.length; j++) {
      proxy(Revenue, revenueFuncs[j]);
    }
    amplitude.Revenue = Revenue;
    var funcs = [
      'getDeviceId',
      'setDeviceId',
      'getSessionId',
      'setSessionId',
      'getUserId',
      'setUserId',
      'setOptOut',
      'setTransport',
      'reset',
      'extendSession',
    ];
    var funcsWithPromise = [
      'init',
      'add',
      'remove',
      'track',
      'logEvent',
      'identify',
      'groupIdentify',
      'setGroup',
      'revenue',
      'flush',
    ];
    function getPromiseResult(instance, fn, args) {
      return function (resolve) {
        instance._q.push({
          name: fn,
          args: Array.prototype.slice.call(args, 0),
          resolve: resolve,
        });
      };
    }
    function proxyMain(instance, fn, isPromise) {
      instance[fn] = function () {
        if (isPromise) return {
          promise: new Promise(getPromiseResult(instance, fn, Array.prototype.slice.call(arguments))),
        };
      };
    }
    function setUpProxy(instance) {
      for (var k = 0; k < funcs.length; k++) {
        proxyMain(instance, funcs[k], false);
      }
      for (var l = 0; l < funcsWithPromise.length; l++) {
        proxyMain(instance, funcsWithPromise[l], true);
      }
    }
    setUpProxy(amplitude);
    amplitude.createInstance = function (instanceName) {
      amplitude._iq[instanceName] = { _q: [] };
      setUpProxy(amplitude._iq[instanceName]);
      return amplitude._iq[instanceName];
    };
    window.${globalVar} = amplitude;
    ${
      globalVar !== 'amplitude'
        ? `if (!window.amplitude) {
      window.amplitude = window.${globalVar};
    }`
        : ``
    }
  }
})(window, document);
`;

exports.snippet = snippet;
