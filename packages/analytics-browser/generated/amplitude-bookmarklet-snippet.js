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
    var s = document.getElementsByTagName('script')[0];
    var autoTrackingPluginScript = document.createElement('script');
    autoTrackingPluginScript.src = 'https://cdn.amplitude.com/libs/plugin-autocapture-browser-0.9.0-min.js.gz';
    autoTrackingPluginScript.async = false;
    s.parentNode.insertBefore(autoTrackingPluginScript, s);
    var as = document.createElement('script');
    as.type = 'text/javascript';
    as.integrity = 'sha384-lBou4NmX75M6JsIU7yhPUiOXMZSbtZs5c2+lyhs7faXYDqKciQqrlJvP8MADhzOi';
    as.crossOrigin = 'anonymous';
    as.async = false;
    as.src = 'https://cdn.amplitude.com/libs/analytics-browser-2.17.6-min.js.gz';
    as.onload = function () {
      if (!window.amplitude.runQueuedFunctions) {
        console.log('[Amplitude] Error: could not load SDK');
      }
      window.amplitude.init('YOUR_API_KEY', 'YOUR_USER_ID', {
        instanceName: 'amplitude-bookmarklet',
        serverZone: 'YOUR_SERVER_ZONE',
        ingestionMetadata: {
          sourceName: 'browser-typescript-bookmarklet',
          sourceVersion: '1.0.0'
        },
        optOut: false
      });
      if (amplitudeAutocapturePlugin && amplitudeAutocapturePlugin.autocapturePlugin && typeof amplitudeAutocapturePlugin.autocapturePlugin === 'function') {
        window.amplitude.add(amplitudeAutocapturePlugin.autocapturePlugin());
      }
      alert('Amplitude is now tracking events!');
    };
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
    var revenueFuncs = ['getEventProperties', 'setProductId', 'setQuantity', 'setPrice', 'setRevenue', 'setRevenueType', 'setReceipt', 'setReceiptSig', 'setCurrency', 'setEventProperties'];
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