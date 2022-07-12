/**
 * Imported in client browser via <script> tag
 * Async capabilities: Interally creates stubbed window.amplitude object until real SDK loaded
 * Stubbed functions keep track of funciton calls and their arguments
 * These are sent once real SDK loaded through another <script> tag
 */
!(function (window, document) {
  var amplitude = window.amplitude || { _q: [] };
  if (amplitude.invoked) window.console && console.error && console.error('Amplitude snippet has been loaded.');
  else {
    amplitude.invoked = true;
    var as = document.createElement('script');
    as.type = 'text/javascript';
    as.integrity = 'sha384-GS6YJWyepBi+TL3uXx5i7xx1UTA9iHaZr9q+5uNsuhzMb8c1SfkKW4Wee/IxZOW5';
    as.crossOrigin = 'anonymous';
    as.async = true;
    as.src = 'https://cdn.amplitude.com/libs/analytics-browser-1.0.0-min.js.gz';
    as.onload = function () {
      if (!window.amplitude.runQueuedFunctions) {
        console.log('[Amplitude] Error: could not load SDK');
      }
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
      'regenerateDeviceId',
      'getSessionId',
      'setSessionId',
      'getUserId',
      'setUserId',
      'setOptOut',
      'setTransport',
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
    ];
    function setUpProxy(instance) {
      function proxyMain(fn, isPromise) {
        instance[fn] = function () {
          var result = {
            promise: new Promise((resolve) => {
              instance._q.push({
                name: fn,
                args: Array.prototype.slice.call(arguments, 0),
                resolve: resolve,
              });
            }),
          }
          if (isPromise) return result;
        };
      }
      for (var k = 0; k < funcs.length; k++) {
        proxyMain(funcs[k], false);
      }
      for (var l = 0; l < funcsWithPromise.length; l++) {
        proxyMain(funcsWithPromise[l], true);
      }
    }
    setUpProxy(amplitude);
    window.amplitude = amplitude;
  }
})(window, document);
