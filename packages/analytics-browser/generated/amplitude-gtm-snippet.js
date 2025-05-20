"use strict";

/**
 * Imported in client browser via <script> tag
 * Async capabilities: Interally creates stubbed window.amplitudeGTM object until real SDK loaded
 * Stubbed functions keep track of funciton calls and their arguments
 * These are sent once real SDK loaded through another <script> tag
 */
!function (window, document) {
  var amplitude = window.amplitudeGTM || {
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
    var proxyInstance = function proxyInstance(instance, fn, args) {
      instance._q.push({
        name: fn,
        args: Array.prototype.slice.call(args, 0)
      });
    };
    var proxyMain = function proxyMain(instance, fn, isPromise) {
      instance[fn] = function () {
        if (isPromise) return {
          promise: new Promise(getPromiseResult(instance, fn, Array.prototype.slice.call(arguments)))
        };
        proxyInstance(instance, fn, Array.prototype.slice.call(arguments));
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
    as.integrity = 'sha384-cyLCgMFbUdt2EKPSr5tjkB8/f4cAlU+SU+6+zPV0JxMVx0y1LfQu+pFpKnfmkvsI';
    as.crossOrigin = 'anonymous';
    as.async = true;
    as.src = 'https://cdn.amplitude.com/libs/analytics-browser-gtm-2.17.6-min.js.gz';
    as.onload = function () {
      if (!window.amplitudeGTM.runQueuedFunctions) {
        console.log('[Amplitude] Error: could not load SDK');
      }
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
    window.amplitudeGTM = amplitude;
    if (!window.amplitude) {
      window.amplitude = window.amplitudeGTM;
    }
  }
}(window, document);