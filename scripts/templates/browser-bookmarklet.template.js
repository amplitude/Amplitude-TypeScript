const snippet = (
  name,
  integrity,
  version,
  globalVar,
  apiKey,
  userId,
  serverZone,
  ingestionSourceName,
  ingestionSourceVersion,
  autoTrackingPluginVersion,
) => `
!(function (window, document) {
  var amplitude = window.${globalVar} || { _q: [], _iq: {} };
  if (amplitude.invoked) window.console && console.error && console.error('Amplitude snippet has been loaded.');
  else {
    amplitude.invoked = true;
    var s = document.getElementsByTagName('script')[0];
    var autoTrackingPluginScript = document.createElement('script');
    autoTrackingPluginScript.src = 'https://cdn.amplitude.com/libs/plugin-autocapture-browser-${autoTrackingPluginVersion}-min.js.gz';
    autoTrackingPluginScript.async = false;
    s.parentNode.insertBefore(autoTrackingPluginScript, s);
    var as = document.createElement('script');
    as.type = 'text/javascript';
    as.integrity = '${integrity}';
    as.crossOrigin = 'anonymous';
    as.async = false;
    as.src = 'https://cdn.amplitude.com/libs/${name}-${version}-min.js.gz';
    as.onload = function () {
      if (!window.${globalVar}.runQueuedFunctions) {
        console.log('[Amplitude] Error: could not load SDK');
      }
      window.${globalVar}.init('${apiKey}', '${userId}', {
        instanceName: 'amplitude-bookmarklet',
        serverZone: '${serverZone}',
        ingestionMetadata: {
          sourceName: '${ingestionSourceName}',
          sourceVersion: '${ingestionSourceVersion}',
        },
        optOut: false,
      });
      if (amplitudeAutocapturePlugin && amplitudeAutocapturePlugin.autocapturePlugin && typeof amplitudeAutocapturePlugin.autocapturePlugin === 'function') {
        window.${globalVar}.add(amplitudeAutocapturePlugin.autocapturePlugin());
      }
      alert('Amplitude is now tracking events!');
    };
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
      'setReceipt',
      'setReceiptSig',
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
